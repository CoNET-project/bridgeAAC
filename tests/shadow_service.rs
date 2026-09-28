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
    assert_eq!(
        alerts_for("reader-lag 218\ncursor-lag 1865\n"),
        vec!["alert reader-lag", "alert cursor-lag"]
    );
    assert!(alerts_for("reader-lag 64\ncursor-lag 0\n").is_empty());
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
    use bridge_aac::{deployment_floor, next_cursor, plan_range, MAX_BLOCKS_PER_CYCLE};
    assert_eq!(deployment_floor(None, None, 51_876_076), Some(51_876_076));
    assert_eq!(deployment_floor(None, Some(51_875_852), 60_000_000), Some(51_875_852));
    assert_eq!(deployment_floor(Some(51_875_852), None, 60_000_000), Some(51_875_852));
    assert_eq!(plan_range(None, 51_876_076, 51_876_076, MAX_BLOCKS_PER_CYCLE), Some((51_876_076, 51_876_076)));
    assert_eq!(plan_range(None, 1_000, 0, MAX_BLOCKS_PER_CYCLE), None);
    assert_eq!(plan_range(Some(40), 100, 40, MAX_BLOCKS_PER_CYCLE), Some((41, 72)));
    assert_eq!(plan_range(Some(100), 100, 40, MAX_BLOCKS_PER_CYCLE), None);
    assert_eq!(next_cursor(Some(40), 72, false), Some(40));
    assert_eq!(next_cursor(Some(40), 72, true), Some(72));
    assert!(plan_range(None, 1_000, 900, MAX_BLOCKS_PER_CYCLE).unwrap().0 >= 900);
    use bridge_aac::{batch_for_lag, should_pause, CATCHUP_BLOCKS};
    assert_eq!(batch_for_lag(1_865), CATCHUP_BLOCKS);
    assert_eq!(batch_for_lag(0), MAX_BLOCKS_PER_CYCLE);
    assert!(!should_pause("cursor-lag 1865\n"));
    assert!(should_pause("cursor-lag 0\n"));
    assert!(should_pause("rpc no\ncursor-lag 1865\n"));
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
    use bridge_aac::{finish_cycle, load_cursor, plan_range, save_cursor, PreparedCycle, ShadowCursor, MAX_BLOCKS_PER_CYCLE};
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("bridge-aac-restart-{stamp}"));
    std::fs::create_dir_all(&dir).unwrap();
    let cursor_path = dir.join("cursor.json");
    let saved = ShadowCursor { base: Some(40), conet: Some(80), ..ShadowCursor::default() };
    save_cursor(&cursor_path, &saved).unwrap();
    let restored = load_cursor(&cursor_path).unwrap();
    assert_eq!(plan_range(restored.base, 100, 40, MAX_BLOCKS_PER_CYCLE), Some((41, 72)));
    assert_eq!(plan_range(restored.conet, 90, 80, MAX_BLOCKS_PER_CYCLE), Some((81, 90)));
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
    use bridge_aac::{absorb_ops, lower_finalized, reconcile_pending, OpNote, RECONCILE_LAG_BLOCKS};
    use std::collections::BTreeMap;
    assert_eq!(lower_finalized(&[51_877_227, 51_876_076]), Some(51_876_076));
    let mut ops = BTreeMap::new();
    absorb_ops("base", "operation-id 0xabc\nphase initiated\n", 10, &mut ops);
    absorb_ops("base", "operation-id 0xabc\nphase executed\n", 12, &mut ops);
    assert!(ops["0xabc"].executed);
    absorb_ops("base", "operation-id 0xend\nphase initiated\n", 10, &mut ops);
    absorb_ops("base", "operation-id 0xend\nphase cancelled\n", 11, &mut ops);
    ops.insert(
        "0xdef".into(),
        OpNote { chain: "conet".into(), initiated: 10, executed: false, cancelled: false },
    );
    let quiet = reconcile_pending(&ops, Some(1_000_000), Some(10 + RECONCILE_LAG_BLOCKS), RECONCILE_LAG_BLOCKS);
    assert!(!quiet.contains("0xdef"));
    assert!(!quiet.contains("0xabc"));
    assert!(!quiet.contains("0xend"));
    let late = reconcile_pending(&ops, Some(1), Some(11 + RECONCILE_LAG_BLOCKS), RECONCILE_LAG_BLOCKS);
    assert!(late.contains("reconcile pending"));
    assert!(late.contains("chain conet"));
    assert!(late.contains("0xdef"));
    assert!(!late.contains("0xabc"));
    assert!(!late.contains("0xend"));
    assert!(!late.contains("final"));
}

#[test]
fn stable_window_follows_the_lower_head() {
    use bridge_aac::{apply_stable, drill_report, ShadowCursor, STABLE_BLOCKS};
    let mut cursor = ShadowCursor::default();
    assert_eq!(apply_stable(&mut cursor, "base", 1_000, 0, 0), "stable 0\n");
    assert_eq!(cursor.base_stable_at, Some(1_000));
    assert_eq!(apply_stable(&mut cursor, "base", 1_000 + STABLE_BLOCKS, 200, 0), "stable yes\n");
    assert_eq!(cursor.base_stable_at, Some(1_000));
    assert_eq!(apply_stable(&mut cursor, "base", 2_000, 0, 200), "stable reset\n");
    assert!(cursor.base_stable_at.is_none());
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("bridge-aac-drill-{stamp}"));
    let report = drill_report(&dir).unwrap();
    assert!(report.contains("drill restart yes"));
    assert!(report.contains("drill log-fail yes"));
    assert!(report.contains("drill cursor yes"));
    assert!(report.contains("drill page yes"));
    assert!(!report.contains("final"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn production_reader_sets_require_two_unique_endpoints() {
    use bridge_aac::valid_reader_set;
    assert!(!valid_reader_set(&[]));
    assert!(!valid_reader_set(&["http://same".into()]));
    assert!(!valid_reader_set(&["http://same".into(), "http://same".into()]));
    assert!(valid_reader_set(&["http://one".into(), "http://two".into()]));
}

#[test]
fn service_unit_restarts_and_logrotate_truncates_in_place() {
    let root = env!("CARGO_MANIFEST_DIR");
    let unit = std::fs::read_to_string(format!("{root}/deploy/bridge-aac-shadow.service")).unwrap();
    let rotate = std::fs::read_to_string(format!("{root}/deploy/bridge-aac-shadow.logrotate")).unwrap();
    assert!(unit.contains("Restart=on-failure"));
    assert!(unit.contains("--cursor"));
    assert!(unit.contains("--page"));
    assert!(rotate.contains("copytruncate"));
}
