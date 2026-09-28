//! Read-only shadow service records.
//!
//! A cycle scans every block after the saved cursor. The cursor moves only
//! after the whole range succeeds and the report has been stored.

use crate::error::Error;
use crate::shadow::{observe_below, reader_heights};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub const MAX_BLOCKS_PER_CYCLE: u64 = 32;
pub const CATCHUP_BLOCKS: u64 = 128;
pub const LAG_ALERT_BLOCKS: u64 = 64;
pub const STABLE_BLOCKS: u64 = 256;
pub const RECONCILE_LAG_BLOCKS: u64 = 256;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShadowCursor {
    #[serde(default)]
    pub base: Option<u64>,
    #[serde(default)]
    pub conet: Option<u64>,
    #[serde(default)]
    pub base_floor: Option<u64>,
    #[serde(default)]
    pub conet_floor: Option<u64>,
    #[serde(default)]
    pub base_stable_at: Option<u64>,
    #[serde(default)]
    pub conet_stable_at: Option<u64>,
    #[serde(default)]
    pub ops: BTreeMap<String, OpNote>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpNote {
    #[serde(default)]
    pub chain: String,
    pub initiated: u64,
    pub executed: bool,
    #[serde(default)]
    pub cancelled: bool,
}

pub fn deployment_floor(existing_floor: Option<u64>, scanned: Option<u64>, finalized: u64) -> Option<u64> {
    if let Some(floor) = existing_floor {
        if floor > 0 {
            return Some(floor);
        }
    }
    if let Some(scanned) = scanned {
        if scanned > 0 {
            return Some(scanned);
        }
    }
    if finalized > 0 {
        return Some(finalized);
    }
    None
}

pub fn plan_range(last: Option<u64>, finalized: u64, floor: u64, max_range: u64) -> Option<(u64, u64)> {
    if floor == 0 || finalized == 0 || max_range == 0 {
        return None;
    }
    let start = match last {
        Some(height) if height >= finalized => return None,
        Some(height) => height.saturating_add(1).max(floor),
        None => floor,
    };
    if start == 0 || start > finalized {
        return None;
    }
    Some((start, start.saturating_add(max_range.saturating_sub(1)).min(finalized)))
}

pub fn batch_for_lag(lag: u64) -> u64 {
    if lag > LAG_ALERT_BLOCKS {
        CATCHUP_BLOCKS
    } else {
        MAX_BLOCKS_PER_CYCLE
    }
}

pub fn max_metric(report: &str, key: &str) -> u64 {
    let prefix = format!("{key} ");
    report
        .lines()
        .filter_map(|line| line.strip_prefix(&prefix)?.parse::<u64>().ok())
        .max()
        .unwrap_or(0)
}

pub fn apply_stable(cursor: &mut ShadowCursor, chain: &str, height: u64, reader_lag: u64, cursor_lag: u64) -> String {
    let clear = reader_lag <= LAG_ALERT_BLOCKS && cursor_lag <= LAG_ALERT_BLOCKS;
    let slot = match chain {
        "base" => &mut cursor.base_stable_at,
        "conet" => &mut cursor.conet_stable_at,
        _ => return String::new(),
    };
    if !clear || height == 0 {
        *slot = None;
        return "stable 0\n".to_string();
    }
    let origin = slot.unwrap_or(height);
    *slot = Some(origin);
    let held = height.saturating_sub(origin);
    if held >= STABLE_BLOCKS {
        "stable yes\n".to_string()
    } else {
        format!("stable {held}\n")
    }
}

pub fn write_page(path: &Path, report: &str) -> Result<(), Error> {
    let names = alerts_for(report);
    let mut body = if names.is_empty() {
        "page clear\n".to_string()
    } else {
        "page open\n".to_string()
    };
    for name in names {
        body.push_str(name);
        body.push('\n');
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let tmp = path.with_extension("txt.tmp");
    fs::write(&tmp, body).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, path).map_err(|_| Error::Journal)?;
    Ok(())
}

pub fn should_pause(report: &str) -> bool {
    if report.contains("rpc no") || report.contains("quorum no") || report.contains("cursor no") {
        return true;
    }
    max_metric(report, "cursor-lag") == 0
}

pub fn next_cursor(last: Option<u64>, planned_to: u64, success: bool) -> Option<u64> {
    if success {
        Some(planned_to)
    } else {
        last
    }
}

pub fn alerts_for(report: &str) -> Vec<&'static str> {
    let mut alerts = Vec::new();
    if report.contains("quorum no") {
        alerts.push("alert quorum");
    }
    if report.contains("inclusion no") || report.contains("root-match no") {
        alerts.push("alert inclusion");
    }
    if report.contains("gateway-match no") {
        alerts.push("alert gateway");
    }
    if report.contains("receipt-status failed") {
        alerts.push("alert receipt-status");
    }
    if report.contains("rpc no") {
        alerts.push("alert rpc");
    }
    if report.contains("cursor no") {
        alerts.push("alert cursor");
    }
    if report.contains("reconcile pending") {
        alerts.push("alert reconcile");
    }
    if max_metric(report, "reader-lag") > LAG_ALERT_BLOCKS {
        alerts.push("alert reader-lag");
    }
    if max_metric(report, "cursor-lag") > LAG_ALERT_BLOCKS {
        alerts.push("alert cursor-lag");
    }
    alerts
}

pub fn service_targets() -> [(&'static str, Vec<String>); 2] {
    [
        (
            "base",
            vec![
                "https://base-rpc.conet.network".to_string(),
                "https://mainnet.base.org".to_string(),
            ],
        ),
        (
            "conet",
            vec![
                "https://publicrpc.conet.network".to_string(),
                "https://mainnet-rpc1.conet.network".to_string(),
            ],
        ),
    ]
}

pub fn load_cursor(path: &Path) -> Result<ShadowCursor, Error> {
    if !path.exists() {
        return Ok(ShadowCursor::default());
    }
    let text = fs::read_to_string(path).map_err(|_| Error::Journal)?;
    serde_json::from_str(&text).map_err(|_| Error::Journal)
}

pub fn save_cursor(path: &Path, cursor: &ShadowCursor) -> Result<(), Error> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let payload = serde_json::to_string(cursor).map_err(|_| Error::Journal)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, payload).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, path).map_err(|_| Error::Journal)?;
    Ok(())
}

pub fn absorb_ops(chain: &str, report: &str, block: u64, ops: &mut BTreeMap<String, OpNote>) {
    let mut current = None;
    for line in report.lines() {
        if let Some(id) = line.strip_prefix("operation-id ") {
            current = Some(id.to_string());
        } else if let Some(phase) = line.strip_prefix("phase ") {
            if let Some(id) = current.take() {
                let note = ops.entry(id).or_insert(OpNote {
                    chain: chain.to_string(),
                    initiated: block,
                    executed: false,
                    cancelled: false,
                });
                if note.chain.is_empty() {
                    note.chain = chain.to_string();
                }
                if phase == "executed" {
                    note.executed = true;
                }
                if phase == "cancelled" {
                    note.cancelled = true;
                }
            }
        }
    }
}

pub fn reconcile_pending(
    ops: &BTreeMap<String, OpNote>,
    base_height: Option<u64>,
    conet_height: Option<u64>,
    lag: u64,
) -> String {
    let mut out = String::new();
    for (id, note) in ops {
        if note.executed || note.cancelled {
            continue;
        }
        let Some(height) = (match note.chain.as_str() {
            "base" => base_height,
            "conet" => conet_height,
            _ => None,
        }) else {
            continue;
        };
        let age = height.saturating_sub(note.initiated);
        if age > lag {
            out.push_str(&format!("reconcile pending\nchain {}\noperation-id {id}\nage-blocks {age}\n", note.chain));
        }
    }
    out
}

pub struct PreparedCycle {
    pub report: String,
    /// `None` means the cursor file is corrupt. The caller must not replace it.
    pub cursor: Option<ShadowCursor>,
}

pub fn prepare_cycle(journal: &Path, cursor_path: &Path) -> PreparedCycle {
    let mut cursor = match load_cursor(cursor_path) {
        Ok(cursor) => cursor,
        Err(_) => {
            return PreparedCycle {
                report: "cursor no\naccepted no\n".to_string(),
                cursor: None,
            };
        }
    };
    let mut report = String::new();
    for (chain, rpcs) in service_targets() {
        let last = match chain {
            "base" => cursor.base,
            "conet" => cursor.conet,
            _ => None,
        };
        match scan_chain(chain, &rpcs, journal, last, &mut cursor) {
            Ok(text) => report.push_str(&text),
            Err((err, partial)) => {
                report.push_str(&partial);
                if err == Error::Quorum {
                    report.push_str(&format!("chain {chain}\nquorum no\naccepted no\n"));
                } else {
                    report.push_str(&format!("chain {chain}\nrpc no\naccepted no\n"));
                }
            }
        }
    }
    report.push_str(&reconcile_pending(&cursor.ops, cursor.base, cursor.conet, RECONCILE_LAG_BLOCKS));
    PreparedCycle {
        report,
        cursor: Some(cursor),
    }
}

pub fn finish_cycle(cursor_path: &Path, prepared: &PreparedCycle, logged: bool) -> Result<(), Error> {
    if !logged {
        return Err(Error::Journal);
    }
    if let Some(cursor) = &prepared.cursor {
        save_cursor(cursor_path, cursor)?;
    }
    Ok(())
}

fn scan_chain(
    chain: &str,
    rpcs: &[String],
    journal: &Path,
    last: Option<u64>,
    cursor: &mut ShadowCursor,
) -> Result<String, (Error, String)> {
    let bounds = reader_heights(chain, rpcs).map_err(|err| (err, String::new()))?;
    let height = bounds.lower;
    let reader_lag = bounds.higher.saturating_sub(bounds.lower);
    let (stored_floor, scanned) = match chain {
        "base" => (cursor.base_floor, cursor.base),
        "conet" => (cursor.conet_floor, cursor.conet),
        _ => (None, None),
    };
    let Some(floor) = deployment_floor(stored_floor, scanned, height) else {
        return Err((Error::Rpc, String::new()));
    };
    match chain {
        "base" => cursor.base_floor = Some(floor),
        "conet" => cursor.conet_floor = Some(floor),
        _ => {}
    }
    let cursor_lag = last.map(|height_seen| height.saturating_sub(height_seen)).unwrap_or(0);
    let Some((start, end)) = plan_range(last, height, floor, batch_for_lag(cursor_lag)) else {
        let observed = last.unwrap_or(height);
    let stable = apply_stable(cursor, chain, observed, reader_lag, 0);
    return Ok(format!(
        "shadow yes\nbroadcast no\nsettled no\ncustody closed\nlight-client no\nregistry paused\nconsume denied\nchain {chain}\nblock-number {height}\nreader-lag {reader_lag}\ncursor-lag 0\n{stable}cursor caught-up\nheartbeat yes\n"
    ));
    };
    let mut report = String::new();
    let mut seen = BTreeMap::new();
    for number in start..=end {
        let block = observe_below(chain, rpcs, number, height, Some(journal)).map_err(|err| (err, report.clone()))?;
        if block.contains("quorum no") || block.contains("inclusion no") || block.contains("rpc no") || block.contains("root-match no")
        {
            return Err((Error::Rpc, format!("{report}{block}")));
        }
        absorb_ops(chain, &block, number, &mut seen);
        report.push_str(&block);
    }
    for (id, note) in seen {
        match cursor.ops.get_mut(&id) {
            Some(existing) => {
                existing.initiated = existing.initiated.min(note.initiated);
                existing.executed |= note.executed;
            }
            None => {
                cursor.ops.insert(id, note);
            }
        }
    }
    match chain {
        "base" => cursor.base = Some(end),
        "conet" => cursor.conet = Some(end),
        _ => {}
    }
    let remaining = height.saturating_sub(end);
    let stable = apply_stable(cursor, chain, end, reader_lag, remaining);
    report.push_str(&format!(
        "chain {chain}\nfloor {floor}\ncursor {end}\nreader-lag {reader_lag}\ncursor-lag {remaining}\n{stable}"
    ));
    Ok(report)
}

pub fn drill_report(dir: &Path) -> Result<String, Error> {
    fs::create_dir_all(dir).map_err(|_| Error::Journal)?;
    let cursor = dir.join("cursor.json");
    let saved = ShadowCursor {
        base: Some(40),
        base_floor: Some(40),
        ..ShadowCursor::default()
    };
    save_cursor(&cursor, &saved)?;
    let loaded = load_cursor(&cursor)?;
    let mut out = String::new();
    if loaded.base_floor == Some(40) && plan_range(loaded.base, 100, 40, MAX_BLOCKS_PER_CYCLE) == Some((41, 72)) {
        out.push_str("drill restart yes\n");
    }
    let blocker = dir.join("not-a-directory");
    fs::write(&blocker, "full").map_err(|_| Error::Journal)?;
    let failed = write_cycle(&blocker.join("shadow.log"), &dir.join("alert.log"), "ok\n").is_err();
    let prepared = PreparedCycle {
        report: "ok\n".to_string(),
        cursor: Some(ShadowCursor { base: Some(72), base_floor: Some(40), ..ShadowCursor::default() }),
    };
    let kept = finish_cycle(&cursor, &prepared, false).is_err() && load_cursor(&cursor)?.base == Some(40);
    if failed && kept {
        out.push_str("drill log-fail yes\n");
    }
    fs::write(&cursor, "{not-json").map_err(|_| Error::Journal)?;
    let corrupt = prepare_cycle(&dir.join("journal.json"), &cursor);
    if corrupt.cursor.is_none() && corrupt.report.contains("cursor no") && fs::read_to_string(&cursor).map_err(|_| Error::Journal)? == "{not-json" {
        out.push_str("drill cursor yes\n");
    }
    let page = dir.join("page.txt");
    write_page(&page, "reader-lag 200\ncursor-lag 0\n")?;
    let open = fs::read_to_string(&page).map_err(|_| Error::Journal)?;
    write_page(&page, "reader-lag 0\ncursor-lag 0\n")?;
    let clear = fs::read_to_string(&page).map_err(|_| Error::Journal)?;
    if open.contains("page open") && open.contains("alert reader-lag") && clear.contains("page clear") {
        out.push_str("drill page yes\n");
    }
    Ok(out)
}

pub fn write_cycle(log: &Path, alert: &Path, report: &str) -> Result<usize, Error> {
    append(log, report)?;
    let alerts = alerts_for(report);
    for name in &alerts {
        append(alert, &format!("BRIDGE_AAC_ALERT {name}\n"))?;
    }
    Ok(alerts.len())
}

fn append(path: &Path, text: &str) -> Result<(), Error> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path).map_err(|_| Error::Journal)?;
    file.write_all(text.as_bytes()).map_err(|_| Error::Journal)?;
    Ok(())
}
