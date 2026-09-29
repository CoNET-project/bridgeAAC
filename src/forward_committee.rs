//! Forward sync-committee updates rooted at the published CoNET genesis state.
//!
//! Each step uses the committee already trusted for period `P` to authenticate
//! the committee for period `P+1`. A stored checkpoint may move only forward.
//! `trusted-committee` stays `no` until that chain reaches the beacon head.
//! This command does not feed the production shadow decision.

use crate::error::Error;
use crate::ssz_state::{self, hash_beacon_header, hash_beacon_state};
use crate::sync_aggregate::{self, ForkVersion};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

const EPOCHS_PER_PERIOD: u64 = 256;
const SLOTS_PER_EPOCH: u64 = 32;
const COMMITTEE_SIZE: usize = 512;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitteeStore {
    pub current_period: u64,
    pub current_committee: Vec<[u8; 48]>,
    pub finalized_epoch: u64,
    pub finalized_root: [u8; 32],
    pub updates: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ForwardUpdate {
    pub attested_period: u64,
    pub signature_period: u64,
    pub quorum: bool,
    pub signature_ok: bool,
    pub state_current: Vec<[u8; 48]>,
    pub state_next: Vec<[u8; 48]>,
    pub finalized_epoch: u64,
    pub finalized_root: [u8; 32],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepFault {
    SkippedPeriod,
    OutOfOrder,
    ConflictingCommittee,
    StaleFinalized,
    FinalizedConflict,
    SignaturePeriod,
    Quorum,
    Signature,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct CheckpointFile {
    v: u32,
    genesis_validators_root: String,
    genesis_header_root: String,
    current_period: u64,
    current_committee: Vec<String>,
    finalized_epoch: u64,
    finalized_root: String,
    updates: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ForwardReport {
    genesis_pin: Option<bool>,
    period: u64,
    updates: u64,
    step: &'static str,
    fault: &'static str,
    witness: &'static str,
    head_period: Option<u64>,
    execution: &'static str,
    trusted: bool,
}

pub fn apply_forward_update(store: &CommitteeStore, update: &ForwardUpdate) -> Result<CommitteeStore, StepFault> {
    if update.attested_period < store.current_period {
        return Err(StepFault::OutOfOrder);
    }
    if update.attested_period > store.current_period {
        return Err(StepFault::SkippedPeriod);
    }
    if update.signature_period != update.attested_period {
        return Err(StepFault::SignaturePeriod);
    }
    if !update.quorum {
        return Err(StepFault::Quorum);
    }
    if !update.signature_ok {
        return Err(StepFault::Signature);
    }
    if update.state_current != store.current_committee || update.state_next.is_empty() {
        return Err(StepFault::ConflictingCommittee);
    }
    if update.finalized_epoch < store.finalized_epoch {
        return Err(StepFault::StaleFinalized);
    }
    if update.finalized_epoch == store.finalized_epoch && update.finalized_root != store.finalized_root {
        return Err(StepFault::FinalizedConflict);
    }
    Ok(CommitteeStore {
        current_period: store.current_period + 1,
        current_committee: update.state_next.clone(),
        finalized_epoch: update.finalized_epoch,
        finalized_root: update.finalized_root,
        updates: store.updates + 1,
    })
}

pub fn commit_allowed(previous: &CommitteeStore, next: &CommitteeStore) -> bool {
    if next.current_period < previous.current_period || next.updates < previous.updates {
        return false;
    }
    if next.finalized_epoch < previous.finalized_epoch {
        return false;
    }
    if next.current_period == previous.current_period && next.current_committee != previous.current_committee {
        return false;
    }
    if next.finalized_epoch == previous.finalized_epoch && next.finalized_root != previous.finalized_root {
        return false;
    }
    if next.current_period > previous.current_period && next.updates <= previous.updates {
        return false;
    }
    true
}

pub fn observe_forward_committee(
    beacon: &str,
    checkpoint: &Path,
    witness: Option<&str>,
    periods: u64,
    execution_rpc: Option<&str>,
) -> Result<String, Error> {
    let genesis = match load_genesis(beacon) {
        Some(genesis) => genesis,
        None => {
            return Ok(format_report(&ForwardReport {
                genesis_pin: None,
                period: 0,
                updates: 0,
                step: "unread",
                fault: "none",
                witness: witness_label(witness, None),
                head_period: None,
                execution: "unread",
                trusted: false,
            }));
        }
    };
    if !genesis.pinned {
        return Ok(format_report(&ForwardReport {
            genesis_pin: Some(false),
            period: 0,
            updates: 0,
            step: "rejected",
            fault: "conflicting-committee",
            witness: "omitted",
            head_period: None,
            execution: "unread",
            trusted: false,
        }));
    }
    let mut store = match load_checkpoint(checkpoint, &genesis)? {
        Some(store) => store,
        None => CommitteeStore {
            current_period: 0,
            current_committee: genesis.current.clone(),
            finalized_epoch: 0,
            finalized_root: genesis.header_root,
            updates: 0,
        },
    };
    let head_period = head_period(beacon);
    let mut step = "unchanged";
    let mut fault = "none";
    let mut witness_ok: Option<bool> = None;
    let limit = periods.max(1);
    for _ in 0..limit {
        if head_period.is_some_and(|head| store.current_period >= head) {
            break;
        }
        match advance_one(beacon, witness, &store) {
            Advance::Unread => {
                step = "unread";
                break;
            }
            Advance::Rejected(reason) => {
                step = "rejected";
                fault = reason;
                break;
            }
            Advance::Advanced { store: next, witness: witnessed } => {
                if !commit_allowed(&store, &next) {
                    step = "rejected";
                    fault = "stale-finalized";
                    break;
                }
                store = next;
                step = "advanced";
                witness_ok = witnessed;
                save_checkpoint(checkpoint, &genesis, &store)?;
                eprintln!("forward-progress period {} updates {}", store.current_period, store.updates);
            }
        }
    }
    if step != "advanced" && !checkpoint.exists() && store.updates == 0 && store.current_period == 0 {
        save_checkpoint(checkpoint, &genesis, &store)?;
    }
    let caught_up = head_period.is_some_and(|head| store.current_period >= head && store.updates > 0);
    let execution = if !caught_up {
        "unread"
    } else if let Some(rpc) = execution_rpc {
        match check_execution(beacon, rpc, &store) {
            Ok(true) => "yes",
            Ok(false) => "no",
            Err(_) => "unread",
        }
    } else {
        "unread"
    };
    Ok(format_report(&ForwardReport {
        genesis_pin: Some(true),
        period: store.current_period,
        updates: store.updates,
        step,
        fault,
        witness: witness_label(witness, witness_ok),
        head_period,
        execution,
        trusted: false,
    }))
}

enum Advance {
    Unread,
    Rejected(&'static str),
    Advanced { store: CommitteeStore, witness: Option<bool> },
}

struct GenesisAnchor {
    pinned: bool,
    header_root: [u8; 32],
    current: Vec<[u8; 48]>,
}

fn advance_one(beacon: &str, witness: Option<&str>, store: &CommitteeStore) -> Advance {
    let mut slot = period_end_slot(store.current_period);
    let mut saw_signature_fault = false;
    let mut state_attempts = 0u32;
    while period_of_slot(slot) == store.current_period {
        let block = match http_json_optional(&format!("{beacon}/eth/v2/beacon/blocks/{slot}")) {
            Ok(Some(block)) => block,
            Ok(None) => {
                if slot == 0 {
                    break;
                }
                slot -= 1;
                continue;
            }
            Err(_) => return Advance::Unread,
        };
        if block_quorum(&block) != Some(true) {
            if slot == 0 {
                break;
            }
            slot -= 1;
            continue;
        }
        state_attempts += 1;
        if state_attempts > 8 {
            break;
        }
        match bind_period_update(beacon, witness, store, &block) {
            Advance::Unread => {
                if slot == 0 {
                    break;
                }
                slot -= 1;
            }
            Advance::Rejected("quorum") | Advance::Rejected("signature") => {
                saw_signature_fault = true;
                if slot == 0 {
                    break;
                }
                slot -= 1;
            }
            other => return other,
        }
    }
    if saw_signature_fault {
        Advance::Rejected("signature")
    } else {
        Advance::Rejected("quorum")
    }
}

fn block_quorum(block: &Value) -> Option<bool> {
    let bits = decode_hex(
        block
            .pointer("/data/message/body/sync_aggregate/sync_committee_bits")
            .and_then(Value::as_str)?,
    )
    .ok()?;
    Some(sync_quorum(bits_set(&bits, COMMITTEE_SIZE), COMMITTEE_SIZE as u64))
}

fn bind_period_update(beacon: &str, witness: Option<&str>, store: &CommitteeStore, block: &Value) -> Advance {
    let Some(message) = block.pointer("/data/message") else {
        return Advance::Unread;
    };
    let (Ok(parent_root), Ok(slot)) = (
        json_hash(message.get("parent_root").unwrap_or(&Value::Null)),
        json_u64(message.get("slot").unwrap_or(&Value::Null)),
    ) else {
        return Advance::Unread;
    };
    if period_of_slot(slot) != store.current_period {
        return Advance::Rejected("skipped-period");
    }
    let parent_slot = slot.saturating_sub(1);
    if period_of_slot(parent_slot) != store.current_period {
        return Advance::Rejected("signature-period");
    }
    let Ok(header) = http_json(&format!("{beacon}/eth/v1/beacon/headers/0x{}", hex::encode(parent_root))) else {
        return Advance::Unread;
    };
    let Some(header_msg) = header.pointer("/data/header/message") else {
        return Advance::Unread;
    };
    let Ok(encoded) = encode_header(header_msg) else {
        return Advance::Unread;
    };
    let Ok(header_root) = hash_beacon_header(&encoded) else {
        return Advance::Unread;
    };
    if header_root != parent_root {
        eprintln!("forward-detail header-root slot {slot}");
        return Advance::Unread;
    }
    let Ok(state_root) = json_hash(header_msg.get("state_root").unwrap_or(&Value::Null)) else {
        return Advance::Unread;
    };
    let Ok(state) = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/{parent_slot}")) else {
        return Advance::Unread;
    };
    let Ok(state_hash) = hash_beacon_state(&state) else {
        return Advance::Rejected("conflicting-committee");
    };
    if state_hash != state_root {
        eprintln!("forward-detail state-hash slot {parent_slot}");
        return Advance::Unread;
    }
    let (Ok(current), Ok(next), Ok((finalized_epoch, finalized_root))) = (
        ssz_state::sync_committee_pubkeys(&state),
        ssz_state::next_sync_committee_pubkeys(&state),
        ssz_state::finalized_checkpoint(&state),
    ) else {
        eprintln!("forward-detail committee-parse slot {parent_slot}");
        return Advance::Unread;
    };
    let Some(aggregate) = message.pointer("/body/sync_aggregate") else {
        return Advance::Unread;
    };
    let (Ok(bits), Ok(signature)) = (
        decode_hex(aggregate.get("sync_committee_bits").and_then(Value::as_str).unwrap_or("")),
        decode_hex(aggregate.get("sync_committee_signature").and_then(Value::as_str).unwrap_or("")),
    ) else {
        return Advance::Unread;
    };
    let Ok(schedule) = fork_schedule(beacon, parent_slot) else {
        return Advance::Unread;
    };
    let domain = sync_aggregate::sync_domain(&schedule.fork, parent_slot / SLOTS_PER_EPOCH, schedule.genesis_root);
    let signing = sync_aggregate::signing_root(parent_root, domain);
    let signature_ok = sync_aggregate::verify_participants(&bits, &current, &signature, &signing).is_ok();
    let update = ForwardUpdate {
        attested_period: store.current_period,
        signature_period: period_of_slot(slot),
        quorum: sync_quorum(bits_set(&bits, current.len()), current.len() as u64),
        signature_ok,
        state_current: current,
        state_next: next.clone(),
        finalized_epoch,
        finalized_root,
    };
    let next_store = match apply_forward_update(store, &update) {
        Ok(store) => store,
        Err(fault) => {
            eprintln!("forward-detail {} slot {slot}", fault_name(fault));
            return Advance::Rejected(fault_name(fault));
        }
    };
    let witnessed = match witness {
        None => None,
        Some(url) => match witness_next(url, parent_slot, &state_root, &next) {
            Witness::Match => Some(true),
            Witness::Conflict => {
                eprintln!("forward-detail witness-conflict slot {parent_slot}");
                return Advance::Rejected("witness-conflict");
            }
            Witness::Unread => Some(false),
        },
    };
    Advance::Advanced { store: next_store, witness: witnessed }
}

enum Witness {
    Match,
    Conflict,
    Unread,
}

fn witness_next(beacon: &str, slot: u64, state_root: &[u8; 32], expected_next: &[[u8; 48]]) -> Witness {
    let Ok(state) = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/{slot}")) else {
        return Witness::Unread;
    };
    let Ok(hash) = hash_beacon_state(&state) else {
        return Witness::Conflict;
    };
    if hash != *state_root {
        return Witness::Conflict;
    }
    match ssz_state::next_sync_committee_pubkeys(&state) {
        Ok(next) if next == expected_next => Witness::Match,
        Ok(_) => Witness::Conflict,
        Err(_) => Witness::Conflict,
    }
}

fn load_genesis(beacon: &str) -> Option<GenesisAnchor> {
    let header = http_json(&format!("{beacon}/eth/v1/beacon/headers/genesis")).ok()?;
    let header_root = json_hash(header.pointer("/data/root")?).ok()?;
    let message = header.pointer("/data/header/message")?;
    let encoded = encode_header(message).ok()?;
    if hash_beacon_header(&encoded).ok()? != header_root {
        return Some(GenesisAnchor { pinned: false, header_root, current: Vec::new() });
    }
    let state_root = json_hash(message.get("state_root")?).ok()?;
    let state = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/genesis")).ok()?;
    if hash_beacon_state(&state).ok()? != state_root {
        return Some(GenesisAnchor { pinned: false, header_root, current: Vec::new() });
    }
    let found = ssz_state::genesis_validators_root(&state).ok()?;
    let current = ssz_state::sync_committee_pubkeys(&state).ok()?;
    Some(GenesisAnchor {
        pinned: found == crate::conet_consensus::PUBLISHED_GENESIS_VALIDATORS_ROOT && current.len() == COMMITTEE_SIZE,
        header_root,
        current,
    })
}

fn load_checkpoint(path: &Path, genesis: &GenesisAnchor) -> Result<Option<CommitteeStore>, Error> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|_| Error::Journal)?;
    let file: CheckpointFile = serde_json::from_str(&text).map_err(|_| Error::BadFixture)?;
    let pin = hex::encode(crate::conet_consensus::PUBLISHED_GENESIS_VALIDATORS_ROOT);
    if file.v != 1 || file.genesis_validators_root != pin {
        return Err(Error::BadFixture);
    }
    if file.genesis_header_root != hex::encode(genesis.header_root) {
        return Err(Error::BadFixture);
    }
    let committee = file
        .current_committee
        .iter()
        .map(|item| decode_key(item))
        .collect::<Result<Vec<_>, _>>()?;
    if file.current_period == 0 && committee != genesis.current {
        return Err(Error::BadFixture);
    }
    Ok(Some(CommitteeStore {
        current_period: file.current_period,
        current_committee: committee,
        finalized_epoch: file.finalized_epoch,
        finalized_root: decode_root(&file.finalized_root)?,
        updates: file.updates,
    }))
}

fn save_checkpoint(path: &Path, genesis: &GenesisAnchor, store: &CommitteeStore) -> Result<(), Error> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let file = CheckpointFile {
        v: 1,
        genesis_validators_root: hex::encode(crate::conet_consensus::PUBLISHED_GENESIS_VALIDATORS_ROOT),
        genesis_header_root: hex::encode(genesis.header_root),
        current_period: store.current_period,
        current_committee: store.current_committee.iter().map(hex::encode).collect(),
        finalized_epoch: store.finalized_epoch,
        finalized_root: hex::encode(store.finalized_root),
        updates: store.updates,
    };
    let bytes = serde_json::to_vec_pretty(&file).map_err(|_| Error::Journal)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, path).map_err(|_| Error::Journal)?;
    Ok(())
}

fn format_report(report: &ForwardReport) -> String {
    let pin = match report.genesis_pin {
        Some(true) => "yes",
        Some(false) => "no",
        None => "unread",
    };
    let head = match report.head_period {
        Some(period) => period.to_string(),
        None => "unread".to_string(),
    };
    let remaining = match report.head_period {
        Some(period) => period.saturating_sub(report.period).to_string(),
        None => "unread".to_string(),
    };
    format!(
        "\
         forward-committee\n\
         genesis-pin {pin}\n\
         period {period}\n\
         updates {updates}\n\
         step {step}\n\
         fault {fault}\n\
         witness {witness}\n\
         head-period {head}\n\
         periods-remaining {remaining}\n\
         execution-check {execution}\n\
         trusted-committee {trusted}\n\
         custody-gate no\n\
         custody closed\n\
         feeds-shadow no\n",
        period = report.period,
        updates = report.updates,
        step = report.step,
        fault = report.fault,
        witness = report.witness,
        execution = report.execution,
        trusted = if report.trusted { "yes" } else { "no" },
    )
}

fn check_execution(beacon: &str, rpc: &str, store: &CommitteeStore) -> Result<bool, Error> {
    use crate::execution::{ExecutionView, JsonRpcExecution};
    let geth = JsonRpcExecution::new(rpc).block_by_tag("finalized")?;
    let checkpoints = http_json(&format!("{beacon}/eth/v1/beacon/states/head/finality_checkpoints"))?;
    let root = json_hash(checkpoints.pointer("/data/finalized/root").ok_or(Error::Rpc)?)?;
    let block = http_json(&format!("{beacon}/eth/v2/beacon/blocks/0x{}", hex::encode(root)))?;
    let message = block.pointer("/data/message").ok_or(Error::Rpc)?;
    let slot = json_u64(message.get("slot").ok_or(Error::Rpc)?)?;
    if period_of_slot(slot) != store.current_period {
        return Ok(false);
    }
    let parent_root = json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?;
    let aggregate = message.pointer("/body/sync_aggregate").ok_or(Error::Rpc)?;
    let bits = decode_hex(aggregate.get("sync_committee_bits").and_then(Value::as_str).unwrap_or(""))?;
    let signature = decode_hex(aggregate.get("sync_committee_signature").and_then(Value::as_str).unwrap_or(""))?;
    if !sync_quorum(bits_set(&bits, store.current_committee.len()), store.current_committee.len() as u64) {
        return Ok(false);
    }
    let parent_slot = slot.saturating_sub(1);
    let schedule = fork_schedule(beacon, parent_slot)?;
    let domain = sync_aggregate::sync_domain(&schedule.fork, parent_slot / SLOTS_PER_EPOCH, schedule.genesis_root);
    let signing = sync_aggregate::signing_root(parent_root, domain);
    if sync_aggregate::verify_participants(&bits, &store.current_committee, &signature, &signing).is_err() {
        return Ok(false);
    }
    let payload = message.pointer("/body/execution_payload").ok_or(Error::Rpc)?;
    let execution_hash = json_hash(payload.get("block_hash").ok_or(Error::Rpc)?)?;
    Ok(execution_hash == geth.hash)
}

fn witness_label(configured: Option<&str>, witnessed: Option<bool>) -> &'static str {
    if configured.is_none() {
        return "omitted";
    }
    match witnessed {
        Some(true) => "yes",
        Some(false) => "unread",
        None => "unread",
    }
}

fn fault_name(fault: StepFault) -> &'static str {
    match fault {
        StepFault::SkippedPeriod => "skipped-period",
        StepFault::OutOfOrder => "out-of-order",
        StepFault::ConflictingCommittee => "conflicting-committee",
        StepFault::StaleFinalized => "stale-finalized",
        StepFault::FinalizedConflict => "finalized-conflict",
        StepFault::SignaturePeriod => "signature-period",
        StepFault::Quorum => "quorum",
        StepFault::Signature => "signature",
    }
}

fn period_of_slot(slot: u64) -> u64 {
    (slot / SLOTS_PER_EPOCH) / EPOCHS_PER_PERIOD
}

fn period_end_slot(period: u64) -> u64 {
    (period + 1) * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH - 1
}

fn head_period(beacon: &str) -> Option<u64> {
    let header = http_json(&format!("{beacon}/eth/v1/beacon/headers/finalized")).ok()?;
    let slot = json_u64(header.pointer("/data/header/message/slot")?).ok()?;
    Some(period_of_slot(slot))
}

struct ForkSchedule {
    fork: ForkVersion,
    genesis_root: [u8; 32],
}

fn fork_schedule(beacon: &str, slot: u64) -> Result<ForkSchedule, Error> {
    let genesis = http_json(&format!("{beacon}/eth/v1/beacon/genesis"))?;
    let fork_body = http_json(&format!("{beacon}/eth/v1/beacon/states/{slot}/fork"))?;
    let fork_data = fork_body.pointer("/data").ok_or(Error::Rpc)?;
    Ok(ForkSchedule {
        fork: ForkVersion {
            previous: version_bytes(fork_data.get("previous_version").and_then(Value::as_str).unwrap_or("0x"))?,
            current: version_bytes(fork_data.get("current_version").and_then(Value::as_str).unwrap_or("0x"))?,
            epoch: json_u64(fork_data.get("epoch").ok_or(Error::Rpc)?)?,
        },
        genesis_root: json_hash(genesis.pointer("/data/genesis_validators_root").ok_or(Error::Rpc)?)?,
    })
}

fn bits_set(bits: &[u8], count: usize) -> u64 {
    (0..count)
        .filter(|index| sync_aggregate::participating(bits, *index))
        .count() as u64
}

fn sync_quorum(bits: u64, committee: u64) -> bool {
    committee > 0 && bits.saturating_mul(3) >= committee.saturating_mul(2)
}

fn encode_header(message: &Value) -> Result<[u8; 112], Error> {
    let mut out = [0u8; 112];
    out[..8].copy_from_slice(&json_u64(message.get("slot").ok_or(Error::Rpc)?)?.to_le_bytes());
    out[8..16].copy_from_slice(&json_u64(message.get("proposer_index").ok_or(Error::Rpc)?)?.to_le_bytes());
    out[16..48].copy_from_slice(&json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?);
    out[48..80].copy_from_slice(&json_hash(message.get("state_root").ok_or(Error::Rpc)?)?);
    out[80..112].copy_from_slice(&json_hash(message.get("body_root").ok_or(Error::Rpc)?)?);
    Ok(out)
}

fn version_bytes(text: &str) -> Result<[u8; 4], Error> {
    let bytes = decode_hex(text)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn decode_key(text: &str) -> Result<[u8; 48], Error> {
    let bytes = decode_hex(text)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn decode_root(text: &str) -> Result<[u8; 32], Error> {
    let bytes = decode_hex(text)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn decode_hex(text: &str) -> Result<Vec<u8>, Error> {
    let bare = text.strip_prefix("0x").unwrap_or(text);
    if bare.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(bare).map_err(|_| Error::BadHex)
}

fn json_u64(value: &Value) -> Result<u64, Error> {
    if let Some(n) = value.as_u64() {
        return Ok(n);
    }
    value.as_str().ok_or(Error::Rpc)?.parse().map_err(|_| Error::Rpc)
}

fn json_hash(value: &Value) -> Result<[u8; 32], Error> {
    let text = value.as_str().ok_or(Error::BadHex)?;
    let bytes = decode_hex(text)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn http_json(url: &str) -> Result<Value, Error> {
    ureq::get(url)
        .timeout(Duration::from_secs(30))
        .call()
        .map_err(|_| Error::Rpc)?
        .into_json()
        .map_err(|_| Error::Rpc)
}

fn http_json_optional(url: &str) -> Result<Option<Value>, Error> {
    match ureq::get(url).timeout(Duration::from_secs(30)).call() {
        Ok(response) => response.into_json().map(Some).map_err(|_| Error::Rpc),
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(_) => Err(Error::Rpc),
    }
}

fn http_bytes(url: &str) -> Result<Vec<u8>, Error> {
    let response = ureq::get(url)
        .set("Accept", "application/octet-stream")
        .timeout(Duration::from_secs(180))
        .call()
        .map_err(|_| Error::Rpc)?;
    let mut bytes = Vec::new();
    response.into_reader().read_to_end(&mut bytes).map_err(|_| Error::Rpc)?;
    if bytes.is_empty() {
        return Err(Error::Rpc);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> CommitteeStore {
        CommitteeStore {
            current_period: 0,
            current_committee: vec![[1u8; 48], [2u8; 48]],
            finalized_epoch: 0,
            finalized_root: [9u8; 32],
            updates: 0,
        }
    }

    fn update() -> ForwardUpdate {
        ForwardUpdate {
            attested_period: 0,
            signature_period: 0,
            quorum: true,
            signature_ok: true,
            state_current: vec![[1u8; 48], [2u8; 48]],
            state_next: vec![[3u8; 48], [4u8; 48]],
            finalized_epoch: 4,
            finalized_root: [8u8; 32],
        }
    }

    #[test]
    fn one_period_advances_to_the_authenticated_next_committee() {
        let next = apply_forward_update(&store(), &update()).unwrap();
        assert_eq!(next.current_period, 1);
        assert_eq!(next.current_committee, vec![[3u8; 48], [4u8; 48]]);
        assert_eq!(next.finalized_epoch, 4);
        assert_eq!(next.updates, 1);
    }

    #[test]
    fn a_later_period_cannot_skip_the_missing_link() {
        let mut update = update();
        update.attested_period = 2;
        update.signature_period = 2;
        assert_eq!(apply_forward_update(&store(), &update), Err(StepFault::SkippedPeriod));
    }

    #[test]
    fn an_older_period_is_out_of_order() {
        let mut store = store();
        store.current_period = 1;
        assert_eq!(apply_forward_update(&store, &update()), Err(StepFault::OutOfOrder));
    }

    #[test]
    fn a_different_signing_committee_is_a_conflict() {
        let mut update = update();
        update.state_current[0][0] = 9;
        assert_eq!(apply_forward_update(&store(), &update), Err(StepFault::ConflictingCommittee));
    }

    #[test]
    fn an_older_finalized_checkpoint_does_not_replace_the_store() {
        let mut update = update();
        let mut store = store();
        store.finalized_epoch = 10;
        update.finalized_epoch = 9;
        assert_eq!(apply_forward_update(&store, &update), Err(StepFault::StaleFinalized));
    }

    #[test]
    fn the_same_finalized_epoch_cannot_change_root() {
        let mut update = update();
        let mut store = store();
        store.finalized_epoch = 4;
        store.finalized_root = [7u8; 32];
        update.finalized_epoch = 4;
        assert_eq!(apply_forward_update(&store, &update), Err(StepFault::FinalizedConflict));
    }

    #[test]
    fn a_checkpoint_cannot_move_backward() {
        let previous = apply_forward_update(&store(), &update()).unwrap();
        assert!(!commit_allowed(&previous, &store()));
        assert!(commit_allowed(&store(), &previous));
    }

    #[test]
    fn the_period_end_slot_is_inside_that_period() {
        let slot = period_end_slot(0);
        assert_eq!(slot, 8191);
        assert_eq!(period_of_slot(slot), 0);
        assert_eq!(period_of_slot(slot + 1), 1);
    }

    #[test]
    fn a_forward_step_still_leaves_custody_closed() {
        let text = format_report(&ForwardReport {
            genesis_pin: Some(true),
            period: 1,
            updates: 1,
            step: "advanced",
            fault: "none",
            witness: "yes",
            head_period: Some(188),
            execution: "unread",
            trusted: false,
        });
        assert!(text.contains("step advanced"));
        assert!(text.contains("period 1"));
        assert!(text.contains("periods-remaining 187"));
        assert!(text.contains("execution-check unread"));
        assert!(text.contains("trusted-committee no"));
        assert!(text.contains("custody closed"));
        assert!(text.contains("feeds-shadow no"));
    }
}
