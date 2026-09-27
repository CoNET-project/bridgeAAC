use bridge_aac::{alerts_for, format_observation, write_cycle, AuthenticatedHeader, Observation};
use std::time::{SystemTime, UNIX_EPOCH};

fn header() -> AuthenticatedHeader {
    AuthenticatedHeader {
        chain_id: 8453,
        header_hash: [1u8; 32],
        number: 1,
        state_root: [2u8; 32],
        receipts_root: [3u8; 32],
    }
}

fn healthy() -> String {
    format_observation(
        "base",
        &header(),
        0,
        &Observation {
            included: true,
            status_ok: true,
            gateway_match: true,
            events: vec!["event BridgeOperation\n".into()],
            duplicate: false,
        },
    )
}

#[test]
fn healthy_observation_raises_no_alert() {
    let report = healthy();
    assert!(alerts_for(&report).is_empty());
    assert!(!report.contains("final"));
    assert!(report.contains("execution-tag yes"));
    assert!(report.contains("custody closed"));
}

#[test]
fn quorum_inclusion_gateway_and_status_raise_alerts() {
    assert_eq!(alerts_for("quorum no\naccepted no\n"), vec!["alert quorum"]);
    assert_eq!(alerts_for("inclusion no\nroot-match no\n"), vec!["alert inclusion"]);
    assert_eq!(alerts_for("gateway-match no\n"), vec!["alert gateway"]);
    assert_eq!(alerts_for("receipt-status failed\n"), vec!["alert receipt-status"]);
    assert_eq!(alerts_for("rpc no\n"), vec!["alert rpc"]);
    assert_eq!(alerts_for("cursor no\naccepted no\n"), vec!["alert cursor"]);
    assert_eq!(alerts_for("reconcile pending\noperation-id 0xabc\n"), vec!["alert reconcile"]);
}

#[test]
fn service_records_survive_a_restart_and_alert_once_per_failure() {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("bridge-aac-service-{stamp}"));
    std::fs::create_dir_all(&dir).unwrap();
    let log = dir.join("shadow.log");
    let alert = dir.join("alert.log");
    let journal = dir.join("journal.json");
    let first = healthy();
    assert_eq!(write_cycle(&log, &alert, &first).unwrap(), 0);
    let failed = "quorum no\naccepted no\n";
    assert_eq!(write_cycle(&log, &alert, failed).unwrap(), 1);
    let restored_log = std::fs::read_to_string(&log).unwrap();
    let restored_alert = std::fs::read_to_string(&alert).unwrap();
    assert!(restored_log.contains("execution-tag yes"));
    assert!(restored_alert.contains("BRIDGE_AAC_ALERT alert quorum"));
    assert!(!restored_alert.contains("final"));
    std::fs::write(&journal, "[\"8453:abc:0\"]").unwrap();
    let saved = std::fs::read_to_string(&journal).unwrap();
    assert!(saved.contains("8453:abc:0"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn cursor_range_does_not_start_at_genesis_and_stays_put_on_failure() {
    use bridge_aac::{next_cursor, plan_range, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE};
    assert_eq!(plan_range(None, 1_000, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE), Some((969, 1_000)));
    assert_eq!(plan_range(Some(40), 100, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE), Some((41, 72)));
    assert_eq!(plan_range(Some(100), 100, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE), None);
    assert_eq!(next_cursor(Some(40), 72, false), Some(40));
    assert_eq!(next_cursor(Some(40), 72, true), Some(72));
    assert!(plan_range(None, 1_000, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE).unwrap().0 > 0);
}

#[test]
fn corrupt_cursor_alerts_and_is_not_replaced() {
    use bridge_aac::{alerts_for, finish_cycle, load_cursor, prepare_cycle};
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("bridge-aac-cursor-{stamp}"));
    std::fs::create_dir_all(&dir).unwrap();
    let cursor = dir.join("cursor.json");
    let journal = dir.join("journal.json");
    std::fs::write(&cursor, "{not-json").unwrap();
    let prepared = prepare_cycle(&journal, &cursor);
    assert!(prepared.cursor.is_none());
    assert!(prepared.report.contains("cursor no"));
    assert!(!prepared.report.contains("final"));
    assert_eq!(alerts_for(&prepared.report), vec!["alert cursor"]);
    assert!(finish_cycle(&cursor, &prepared, true).is_ok());
    assert_eq!(std::fs::read_to_string(&cursor).unwrap(), "{not-json");
    assert!(load_cursor(&cursor).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn restart_continues_after_the_saved_block_and_a_failed_log_does_not_advance() {
    use bridge_aac::{finish_cycle, load_cursor, plan_range, save_cursor, PreparedCycle, ShadowCursor, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE};
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("bridge-aac-restart-{stamp}"));
    std::fs::create_dir_all(&dir).unwrap();
    let cursor_path = dir.join("cursor.json");
    let saved = ShadowCursor { base: Some(40), conet: Some(80), ..ShadowCursor::default() };
    save_cursor(&cursor_path, &saved).unwrap();
    let restored = load_cursor(&cursor_path).unwrap();
    assert_eq!(plan_range(restored.base, 100, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE), Some((41, 72)));
    assert_eq!(plan_range(restored.conet, 90, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE), Some((81, 90)));
    let advanced = PreparedCycle {
        report: "ok\n".into(),
        cursor: Some(ShadowCursor { base: Some(72), conet: Some(90), ..ShadowCursor::default() }),
    };
    assert!(finish_cycle(&cursor_path, &advanced, false).is_err());
    assert_eq!(load_cursor(&cursor_path).unwrap().base, Some(40));
    assert!(finish_cycle(&cursor_path, &advanced, true).is_ok());
    assert_eq!(load_cursor(&cursor_path).unwrap().base, Some(72));
    assert!(std::fs::read_to_string(&cursor_path).unwrap().contains("\"base\":72"));
    let blocker = dir.join("not-a-directory");
    std::fs::write(&blocker, "full").unwrap();
    let nested = blocker.join("cursor.json");
    assert!(save_cursor(&nested, &advanced.cursor.unwrap()).is_err());
    assert_eq!(load_cursor(&cursor_path).unwrap().base, Some(72));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn reconcile_alerts_only_after_the_lag_window() {
    use bridge_aac::{absorb_ops, reconcile_pending, OpNote, RECONCILE_LAG_BLOCKS};
    use std::collections::BTreeMap;
    let mut ops = BTreeMap::new();
    absorb_ops("operation-id 0xabc\nphase initiated\n", 10, &mut ops);
    absorb_ops("operation-id 0xabc\nphase executed\n", 12, &mut ops);
    assert!(ops["0xabc"].executed);
    ops.insert("0xdef".into(), OpNote { initiated: 10, executed: false });
    let quiet = reconcile_pending(&ops, 10 + RECONCILE_LAG_BLOCKS, RECONCILE_LAG_BLOCKS);
    assert!(!quiet.contains("0xdef"));
    let late = reconcile_pending(&ops, 11 + RECONCILE_LAG_BLOCKS, RECONCILE_LAG_BLOCKS);
    assert!(late.contains("reconcile pending"));
    assert!(late.contains("0xdef"));
    assert!(!late.contains("0xabc"));
    assert!(!late.contains("final"));
}

#[test]
fn service_unit_restarts_and_logrotate_truncates_in_place() {
    let root = env!("CARGO_MANIFEST_DIR");
    let unit = std::fs::read_to_string(format!("{root}/deploy/bridge-aac-shadow.service")).unwrap();
    let rotate = std::fs::read_to_string(format!("{root}/deploy/bridge-aac-shadow.logrotate")).unwrap();
    assert!(unit.contains("Restart=on-failure"));
    assert!(unit.contains("--cursor"));
    assert!(rotate.contains("copytruncate"));
}
