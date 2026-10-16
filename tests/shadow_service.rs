use bridge_aac::{
    alerts_for, format_observation, load_settled, reconcile_pending_except, record_settled, write_cycle,
    AuthenticatedHeader, OpNote, Observation, SettledOperation,
};
use std::collections::{BTreeMap, BTreeSet};
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
    assert_eq!(alerts_for("reader-lag 218\ncursor-lag 1865\n"), vec!["alert cursor-lag"]);
    assert!(alerts_for("reader-lag 64\ncursor-lag 0\n").is_empty());
}

#[test]
fn reader_lag_is_advisory_with_hysteresis() {
    use bridge_aac::{apply_reader_lag, ShadowCursor};
    let mut cursor = ShadowCursor::default();
    assert_eq!(apply_reader_lag(&mut cursor, "base", 218), "reader-lag-warning no\n");
    assert_eq!(apply_reader_lag(&mut cursor, "base", 218), "reader-lag-warning no\n");
    assert_eq!(apply_reader_lag(&mut cursor, "base", 218), "reader-lag-warning yes\n");
    assert!(alerts_for("reader-lag 218\ncursor-lag 0\n").is_empty());
    assert_eq!(apply_reader_lag(&mut cursor, "base", 0), "reader-lag-warning yes\n");
    assert_eq!(apply_reader_lag(&mut cursor, "base", 0), "reader-lag-warning yes\n");
    assert_eq!(apply_reader_lag(&mut cursor, "base", 0), "reader-lag-warning no\n");
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
fn a_missing_cursor_is_not_a_quiet_heartbeat() {
    use bridge_aac::{alerts_for, load_cursor, Error};
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("bridge-aac-missing-{stamp}.json"));
    assert_eq!(load_cursor(&path), Err(Error::CursorMissing));
    let report = "cursor missing\ncursor caught-up\nheartbeat yes\ncursor-lag 0\n";
    assert_eq!(alerts_for(report), vec!["alert cursor-missing"]);
    assert!(!report.contains("cursor no"));
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
    let mut earlier = ops["0xend"].clone();
    earlier.cancelled = false;
    let later = ops["0xend"].clone();
    bridge_aac::merge_op_note(&mut earlier, &later);
    assert!(earlier.cancelled);
    let mut crossed = BTreeMap::new();
    crossed.insert("0xend".to_string(), earlier);
    let across = reconcile_pending(&crossed, Some(11 + RECONCILE_LAG_BLOCKS), Some(1), RECONCILE_LAG_BLOCKS);
    assert!(!across.contains("0xend"));
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
    use bridge_aac::{apply_stable, drill_report, ShadowCursor, CURSOR_LAG_ALERT_BLOCKS, STABLE_BLOCKS};
    let mut cursor = ShadowCursor::default();
    assert_eq!(apply_stable(&mut cursor, "base", 1_000, 0, 0), "stable 0\n");
    assert_eq!(cursor.base_stable_at, Some(1_000));
    assert_eq!(apply_stable(&mut cursor, "base", 1_000 + STABLE_BLOCKS, 200, 0), "stable yes\n");
    assert_eq!(cursor.base_stable_at, Some(1_000));
    assert_eq!(apply_stable(&mut cursor, "base", 2_000, 0, CURSOR_LAG_ALERT_BLOCKS + 1), "stable reset\n");
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


#[test]
fn a_settled_operation_stops_being_pending_only_when_confirmed() {
    let mut ops = BTreeMap::new();
    ops.insert(
        "0xaa".to_string(),
        OpNote { chain: "base".into(), initiated: 100, executed: false, cancelled: false },
    );
    ops.insert(
        "0xbb".to_string(),
        OpNote { chain: "base".into(), initiated: 100, executed: false, cancelled: false },
    );
    let none = reconcile_pending_except(&ops, Some(1000), None, 256, &BTreeSet::new());
    assert!(none.contains("operation-id 0xaa") && none.contains("operation-id 0xbb"));
    let confirmed: BTreeSet<String> = ["0xaa".to_string()].into_iter().collect();
    let some = reconcile_pending_except(&ops, Some(1000), None, 256, &confirmed);
    assert!(!some.contains("operation-id 0xaa"));
    assert!(some.contains("operation-id 0xbb"));
}

#[test]
fn the_settled_manifest_parses_and_rejects_a_bad_file() {
    let dir = std::env::temp_dir().join(format!("aac-settled-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let good = dir.join("settled.json");
    std::fs::write(
        &good,
        r#"[{"operation_id":"0xaa","settle_chain":"conet","settler":"0x7285fD9a9e62751e952697f95DD753C82Bb84BbE","settle_tx":"0x01"}]"#,
    )
    .unwrap();
    let parsed = load_settled(&good).unwrap();
    assert_eq!(
        parsed,
        vec![SettledOperation {
            operation_id: "0xaa".into(),
            settle_chain: "conet".into(),
            settler: "0x7285fD9a9e62751e952697f95DD753C82Bb84BbE".into(),
            settle_tx: "0x01".into(),
            note: String::new(),
        }]
    );
    let bad = dir.join("bad.json");
    std::fs::write(&bad, "{not json").unwrap();
    assert!(load_settled(&bad).is_err());
    assert!(load_settled(&dir.join("missing.json")).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}


#[test]
fn an_unconfirmed_settlement_leaves_the_manifest_unchanged() {
    let dir = std::env::temp_dir().join(format!("aac-record-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let manifest = dir.join("settled.json");
    let entry = SettledOperation {
        operation_id: "0xcc".into(),
        settle_chain: "conet".into(),
        settler: "0x7285fD9a9e62751e952697f95DD753C82Bb84BbE".into(),
        settle_tx: "0x01".into(),
        note: String::new(),
    };
    // One reader is not a quorum, so nothing can be confirmed.
    let one = vec!["http://127.0.0.1:9".to_string()];
    assert_eq!(
        record_settled(&manifest, entry.clone(), &one, &one),
        Err(bridge_aac::Error::SettlementNotConfirmed)
    );
    assert!(!manifest.exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn an_operation_already_listed_is_refused_before_any_read() {
    let dir = std::env::temp_dir().join(format!("aac-record-dup-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let manifest = dir.join("settled.json");
    std::fs::write(
        &manifest,
        r#"[{"operation_id":"0xcc","settle_chain":"conet","settler":"0x01","settle_tx":"0x01"}]"#,
    )
    .unwrap();
    let entry = SettledOperation {
        operation_id: "0xcc".into(),
        settle_chain: "conet".into(),
        settler: "0x01".into(),
        settle_tx: "0x02".into(),
        note: String::new(),
    };
    assert_eq!(
        record_settled(&manifest, entry, &[], &[]),
        Err(bridge_aac::Error::BadFixture)
    );
    assert_eq!(load_settled(&manifest).unwrap().len(), 1);
    let _ = std::fs::remove_dir_all(&dir);
}
