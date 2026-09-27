//! Read-only shadow service records.
//!
//! A cycle scans every block after the saved cursor. The cursor moves only
//! after the whole range succeeds and the report has been stored.

use crate::error::Error;
use crate::shadow::{finalized_height, observe_number};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub const LOOKBACK_BLOCKS: u64 = 32;
pub const MAX_BLOCKS_PER_CYCLE: u64 = 32;
pub const RECONCILE_LAG_BLOCKS: u64 = 256;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShadowCursor {
    #[serde(default)]
    pub base: Option<u64>,
    #[serde(default)]
    pub conet: Option<u64>,
    #[serde(default)]
    pub ops: BTreeMap<String, OpNote>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpNote {
    pub initiated: u64,
    pub executed: bool,
}

pub fn plan_range(last: Option<u64>, finalized: u64, lookback: u64, max_range: u64) -> Option<(u64, u64)> {
    let start = match last {
        Some(height) if height >= finalized => return None,
        Some(height) => height.saturating_add(1),
        None => finalized.saturating_sub(lookback).saturating_add(1).max(1),
    };
    if start > finalized || max_range == 0 {
        return None;
    }
    Some((start, start.saturating_add(max_range.saturating_sub(1)).min(finalized)))
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

pub fn absorb_ops(report: &str, block: u64, ops: &mut BTreeMap<String, OpNote>) {
    let mut current = None;
    for line in report.lines() {
        if let Some(id) = line.strip_prefix("operation-id ") {
            current = Some(id.to_string());
        } else if let Some(phase) = line.strip_prefix("phase ") {
            if let Some(id) = current.take() {
                let note = ops.entry(id).or_insert(OpNote { initiated: block, executed: false });
                if phase == "executed" {
                    note.executed = true;
                }
            }
        }
    }
}

pub fn reconcile_pending(ops: &BTreeMap<String, OpNote>, finalized: u64, lag: u64) -> String {
    let mut out = String::new();
    for (id, note) in ops {
        if note.executed {
            continue;
        }
        let age = finalized.saturating_sub(note.initiated);
        if age > lag {
            out.push_str(&format!("reconcile pending\noperation-id {id}\nage-blocks {age}\n"));
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
    report.push_str(&reconcile_pending(
        &cursor.ops,
        cursor.base.unwrap_or(0).max(cursor.conet.unwrap_or(0)),
        RECONCILE_LAG_BLOCKS,
    ));
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
    let height = finalized_height(chain, rpcs).map_err(|err| (err, String::new()))?;
    let Some((start, end)) = plan_range(last, height, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE) else {
        return Ok(format!(
            "shadow yes\nbroadcast no\nsettled no\ncustody closed\nlight-client no\nregistry paused\nconsume denied\nchain {chain}\nblock-number {height}\ncursor caught-up\nheartbeat yes\n"
        ));
    };
    let mut report = String::new();
    let mut seen = BTreeMap::new();
    for number in start..=end {
        let block = observe_number(chain, rpcs, number, Some(journal)).map_err(|err| (err, report.clone()))?;
        if block.contains("quorum no") || block.contains("inclusion no") || block.contains("rpc no") || block.contains("root-match no")
        {
            return Err((Error::Rpc, format!("{report}{block}")));
        }
        absorb_ops(&block, number, &mut seen);
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
    report.push_str(&format!("chain {chain}\ncursor {end}\n"));
    Ok(report)
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
