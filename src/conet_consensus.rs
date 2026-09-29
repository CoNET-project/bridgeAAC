//! Read-only CONET beacon observation.
//!
//! The command reads the fork-choice finalized checkpoint from the head
//! state. The checkpoint stored inside the already-finalized state lags that
//! view by about two epochs, so it is not the comparison target. A matching
//! signature uses pubkeys from that same beacon, so `trusted-committee` stays
//! no and the header is not accepted into shadow.

use crate::assets::bindings;
use crate::error::Error;
use crate::execution::JsonRpcExecution;
use crate::ExecutionView;
use serde_json::Value;
use std::io::Read;
use std::time::Duration;

/// Fork-choice state whose `finalized_checkpoint` matches `blocks/finalized`.
/// The state id `finalized` stores the previous checkpoint, about two epochs older.
const FINALITY_CHECKPOINT_STATE: &str = "head";

/// Facts copied from a beacon REST and one execution client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsensusFacts {
    pub chain_id: u64,
    pub finalized_epoch: u64,
    pub finalized_root: [u8; 32],
    pub execution_number: u64,
    pub execution_hash: [u8; 32],
    pub geth_number: u64,
    pub geth_hash: [u8; 32],
    pub included_attestations: u64,
    pub light_client_update: bool,
    pub sync_committee_size: u64,
    pub sync_bits_set: u64,
    pub sync_signature_bytes: u64,
    /// Epoch of the parent slot whose sync committee was used. Zero when that
    /// state was not read.
    pub committee_epoch: u64,
    /// True when the aggregate was checked against the parent-slot committee.
    pub committee_bound: bool,
    /// True only after FastAggregateVerify succeeds. The committee is still
    /// the one reported by this beacon, so custody stays closed.
    pub aggregate_verified: bool,
    /// Execution payload of Prysm `blocks/finalized`. This alias can move
    /// ahead of the FFG checkpoint root, so it is not `beacon-agreed`.
    pub alias_number: u64,
    pub alias_hash: [u8; 32],
    /// `Some(true)` only when the signed parent header's `state_root` is the
    /// hash tree root of the downloaded beacon state, and that state's sync
    /// committee verifies the aggregate. `None` means the state was not read.
    pub state_root_bound: Option<bool>,
    /// `Some(true)` when the previous period's signed state commits
    /// `next_sync_committee` equal to the committee that signed the current
    /// finalized block. That previous committee is still served by this beacon.
    pub committee_handoff: Option<bool>,
    /// Epoch of the oldest block whose aggregate authenticated the handoff. Zero when unread.
    pub handoff_epoch: u64,
    /// How many sync-committee periods were linked. Zero when unread.
    pub handoff_periods: u64,
    /// `Some(true)` when the genesis beacon state hashes to the genesis header
    /// and its `genesis_validators_root` is the published CoNET pin. That pin
    /// does not by itself trust the current sync committee.
    pub genesis_pin: Option<bool>,
}

/// Observation only. `beacon_agreed` means geth `finalized` matches the FFG
/// checkpoint execution payload. A matching `blocks/finalized` alias does not
/// count. `signature_check` does not mean the committee is independently trusted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsensusReport {
    pub beacon_agreed: bool,
    pub signature_check: bool,
    pub text: String,
}

pub fn assess_consensus(facts: &ConsensusFacts) -> ConsensusReport {
    let same_block = facts.execution_number > 0
        && facts.execution_number == facts.geth_number
        && facts.execution_hash == facts.geth_hash
        && facts.finalized_epoch > 0
        && facts.finalized_root != [0u8; 32];
    let beacon_agreed = facts.chain_id == bindings::CONET_CHAIN_ID && same_block;
    let signature_check = facts.aggregate_verified;
    let update = if facts.light_client_update { "present" } else { "absent" };
    let material = if facts.sync_committee_size > 0
        && facts.sync_bits_set > 0
        && facts.sync_signature_bytes == 96
    {
        "present"
    } else if facts.sync_committee_size > 0 || facts.sync_signature_bytes > 0 {
        "partial"
    } else {
        "absent"
    };
    let aggregate = if !facts.aggregate_verified {
        if material == "present" { "failed" } else { "unread" }
    } else {
        "yes"
    };
    let quorum = sync_quorum(facts.sync_bits_set, facts.sync_committee_size);
    let committee_state = if facts.committee_bound { "parent-slot" } else { "unread" };
    let binding = match facts.state_root_bound {
        Some(true) => "yes",
        Some(false) => "no",
        None => "unread",
    };
    let handoff = match facts.committee_handoff {
        Some(true) => "yes",
        Some(false) => "no",
        None => "unread",
    };
    let genesis_pin = match facts.genesis_pin {
        Some(true) => "yes",
        Some(false) => "no",
        None => "unread",
    };
    let alias_same = facts.alias_number > 0
        && facts.alias_number == facts.execution_number
        && facts.alias_hash == facts.execution_hash;
    let alias_geth = facts.alias_number > 0
        && facts.alias_number == facts.geth_number
        && facts.alias_hash == facts.geth_hash;
    let text = format!(
        "conet-chain {chain}\n\
         beacon-finalized-epoch {epoch}\n\
         beacon-finalized-root 0x{root}\n\
         execution-block {exec_n}\n\
         execution-hash 0x{exec_h}\n\
         geth-finalized {geth_n}\n\
         geth-hash 0x{geth_h}\n\
         finalized-alias-block {alias_n}\n\
         finalized-alias-hash 0x{alias_h}\n\
         checkpoint-alias-same {alias_same}\n\
         alias-matches-geth {alias_geth}\n\
         beacon-agreed {agreed}\n\
         included-attestations {atts}\n\
         sync-committee {committee}\n\
         sync-bits-set {bits}\n\
         sync-signature-bytes {sig_bytes}\n\
         signature-material {material}\n\
         aggregate-verify {aggregate}\n\
         sync-quorum {quorum}\n\
         committee-epoch {committee_epoch}\n\
         committee-state {committee_state}\n\
         state-root-binding {binding}\n\
         committee-handoff {handoff}\n\
         handoff-periods {handoff_periods}\n\
         handoff-epoch {handoff_epoch}\n\
         genesis-pin {genesis_pin}\n\
         checkpoint-source head\n\
         light-client-update {update}\n\
         signature-check {sig}\n\
         trusted-committee no\n\
         header-check beacon-tag\n\
         light-client no\n\
         custody-gate no\n\
         custody closed\n\
         broadcast no\n\
         settled no\n\
         shadow unchanged\n",
        chain = facts.chain_id,
        epoch = facts.finalized_epoch,
        root = hex::encode(facts.finalized_root),
        exec_n = facts.execution_number,
        exec_h = hex::encode(facts.execution_hash),
        geth_n = facts.geth_number,
        geth_h = hex::encode(facts.geth_hash),
        alias_n = facts.alias_number,
        alias_h = hex::encode(facts.alias_hash),
        alias_same = yes(alias_same),
        alias_geth = yes(alias_geth),
        agreed = yes(beacon_agreed),
        atts = facts.included_attestations,
        committee = facts.sync_committee_size,
        bits = facts.sync_bits_set,
        sig_bytes = facts.sync_signature_bytes,
        aggregate = aggregate,
        quorum = yes(quorum),
        committee_epoch = facts.committee_epoch,
        committee_state = committee_state,
        binding = binding,
        handoff = handoff,
        handoff_periods = facts.handoff_periods,
        handoff_epoch = facts.handoff_epoch,
        genesis_pin = genesis_pin,
        sig = yes(signature_check),
    );
    ConsensusReport { beacon_agreed, signature_check, text }
}

/// Read the beacon finalized checkpoint and compare it with the execution
/// client's finalized tag. A missing light-client route is reported as absent.
pub fn observe_conet_consensus(beacon: &str, execution_rpc: &str) -> Result<String, Error> {
    let execution = JsonRpcExecution::new(execution_rpc);
    let chain_id = execution.chain_id()?;
    let root = beacon.trim_end_matches('/');
    let checkpoints = http_json(&format!(
        "{root}/eth/v1/beacon/states/{FINALITY_CHECKPOINT_STATE}/finality_checkpoints"
    ))?;
    let checkpoint_root = json_hash(
        checkpoints
            .pointer("/data/finalized/root")
            .ok_or(Error::Rpc)?,
    )?;
    let block = http_json(&format!(
        "{root}/eth/v2/beacon/blocks/0x{}",
        hex::encode(checkpoint_root)
    ))?;
    let alias = http_json_optional(&format!("{root}/eth/v2/beacon/blocks/finalized"))?;
    let geth = execution.block_by_tag("finalized")?;
    let light = http_json_optional(&format!("{root}/eth/v1/beacon/light_client/finality_update"))?;
    let committee = http_json_optional(&format!("{root}/eth/v1/beacon/states/finalized/sync_committees"))?;
    let mut facts = facts_from_reads(
        chain_id,
        &checkpoints,
        &block,
        geth.number,
        geth.hash,
        light.is_some(),
        committee.as_ref(),
    )?;
    if let Some(payload) = alias.as_ref().and_then(|value| value.pointer("/data/message/body/execution_payload")) {
        if let (Some(number), Some(hash)) = (payload.get("block_number"), payload.get("block_hash")) {
            if let (Ok(number), Ok(hash)) = (json_u64(number), json_hash(hash)) {
                facts.alias_number = number;
                facts.alias_hash = hash;
            }
        }
    }
    if let Ok(check) = verify_block_aggregate(root, &block) {
        facts.aggregate_verified = check.verified;
        facts.committee_bound = check.bound;
        if check.bound {
            facts.sync_committee_size = check.size;
            facts.committee_epoch = check.epoch;
        }
    }
    match bind_signed_header(root, &block, None) {
        StateBind::Unread => facts.state_root_bound = None,
        StateBind::Rejected => facts.state_root_bound = Some(false),
        StateBind::Bound { current, .. } => {
            facts.state_root_bound = Some(true);
            let slot = block
                .pointer("/data/message/slot")
                .and_then(|value| json_u64(value).ok())
                .unwrap_or(0);
            if let Some(schedule) = fork_schedule(root, slot.saturating_sub(1)) {
                if let Some(handoff) = committee_handoff(root, slot, &current, &schedule) {
                    facts.committee_handoff = Some(handoff.matched);
                    facts.handoff_epoch = handoff.epoch;
                    facts.handoff_periods = handoff.periods;
                }
            }
        }
    }
    facts.genesis_pin = pin_genesis(root);
    Ok(assess_consensus(&facts).text)
}

pub fn facts_from_reads(
    chain_id: u64,
    checkpoints: &Value,
    block: &Value,
    geth_number: u64,
    geth_hash: [u8; 32],
    light_client_update: bool,
    committee: Option<&Value>,
) -> Result<ConsensusFacts, Error> {
    let finalized = checkpoints
        .pointer("/data/finalized")
        .ok_or(Error::Rpc)?;
    let payload = block
        .pointer("/data/message/body/execution_payload")
        .ok_or(Error::Rpc)?;
    let attestations = block
        .pointer("/data/message/body/attestations")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0) as u64;
    let aggregate = block.pointer("/data/message/body/sync_aggregate");
    let (sync_bits_set, sync_signature_bytes) = match aggregate {
        Some(value) => (
            count_hex_bits(value.get("sync_committee_bits").and_then(Value::as_str).unwrap_or("0x"))?,
            hex_byte_len(value.get("sync_committee_signature").and_then(Value::as_str).unwrap_or("0x"))?,
        ),
        None => (0, 0),
    };
    let sync_committee_size = committee
        .and_then(|value| value.pointer("/data/validators"))
        .and_then(Value::as_array)
        .map(|items| items.len() as u64)
        .unwrap_or(0);
    Ok(ConsensusFacts {
        chain_id,
        finalized_epoch: json_u64(finalized.get("epoch").ok_or(Error::Rpc)?)?,
        finalized_root: json_hash(finalized.get("root").ok_or(Error::Rpc)?)?,
        execution_number: json_u64(payload.get("block_number").ok_or(Error::Rpc)?)?,
        execution_hash: json_hash(payload.get("block_hash").ok_or(Error::Rpc)?)?,
        geth_number,
        geth_hash,
        included_attestations: attestations,
        light_client_update,
        sync_committee_size,
        sync_bits_set,
        sync_signature_bytes,
        committee_epoch: 0,
        committee_bound: false,
        aggregate_verified: false,
        alias_number: 0,
        alias_hash: [0u8; 32],
        state_root_bound: None,
        committee_handoff: None,
        handoff_epoch: 0,
        handoff_periods: 0,
        genesis_pin: None,
    })
}

fn sync_quorum(bits: u64, committee: u64) -> bool {
    committee > 0 && bits.saturating_mul(3) >= committee.saturating_mul(2)
}

fn yes(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}

fn json_u64(value: &Value) -> Result<u64, Error> {
    if let Some(n) = value.as_u64() {
        return Ok(n);
    }
    value
        .as_str()
        .ok_or(Error::Rpc)?
        .parse()
        .map_err(|_| Error::Rpc)
}

fn json_hash(value: &Value) -> Result<[u8; 32], Error> {
    let text = value.as_str().ok_or(Error::BadHex)?;
    let bare = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(bare).map_err(|_| Error::BadHex)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn hex_byte_len(text: &str) -> Result<u64, Error> {
    let bare = text.strip_prefix("0x").unwrap_or(text);
    if bare.len() % 2 != 0 {
        return Err(Error::BadHex);
    }
    Ok((bare.len() / 2) as u64)
}

fn count_hex_bits(text: &str) -> Result<u64, Error> {
    let bare = text.strip_prefix("0x").unwrap_or(text);
    if bare.len() % 2 != 0 {
        return Err(Error::BadHex);
    }
    let bytes = hex::decode(bare).map_err(|_| Error::BadHex)?;
    Ok(bytes.iter().map(|byte| byte.count_ones() as u64).sum())
}

fn http_json(url: &str) -> Result<Value, Error> {
    match http_json_optional(url)? {
        Some(body) => Ok(body),
        None => Err(Error::Rpc),
    }
}

fn http_json_optional(url: &str) -> Result<Option<Value>, Error> {
    let response = ureq::get(url).timeout(Duration::from_secs(20)).call();
    match response {
        Ok(body) => body.into_json().map(Some).map_err(|_| Error::Rpc),
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(ureq::Error::Status(_, _)) => Err(Error::Rpc),
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

fn encode_header(message: &Value) -> Result<[u8; 112], Error> {
    let mut out = [0u8; 112];
    out[..8].copy_from_slice(&json_u64(message.get("slot").ok_or(Error::Rpc)?)?.to_le_bytes());
    out[8..16].copy_from_slice(&json_u64(message.get("proposer_index").ok_or(Error::Rpc)?)?.to_le_bytes());
    out[16..48].copy_from_slice(&json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?);
    out[48..80].copy_from_slice(&json_hash(message.get("state_root").ok_or(Error::Rpc)?)?);
    out[80..112].copy_from_slice(&json_hash(message.get("body_root").ok_or(Error::Rpc)?)?);
    Ok(out)
}

/// Published CoNET genesis validators root. The observer compares this pin
/// with the bytes inside the hashed genesis state. It is not taken from the
/// beacon `/genesis` JSON in the same call.
const PUBLISHED_GENESIS_VALIDATORS_ROOT: [u8; 32] = [
    0xac, 0xac, 0x75, 0x66, 0xfd, 0xf3, 0x84, 0xa1, 0xad, 0xa4, 0x5c, 0x01, 0xdc, 0xf9, 0x03, 0x0d,
    0x7e, 0xb0, 0xe1, 0xe5, 0xf5, 0x30, 0x26, 0x59, 0x10, 0x1d, 0x0b, 0x2a, 0x5b, 0xb5, 0x90, 0x92,
];

const EPOCHS_PER_SYNC_COMMITTEE_PERIOD: u64 = 256;
const SLOTS_PER_EPOCH: u64 = 32;

enum StateBind {
    Unread,
    Rejected,
    Bound { current: Vec<[u8; 48]>, next: Vec<[u8; 48]> },
}

struct Handoff {
    matched: bool,
    epoch: u64,
    periods: u64,
}

const HANDOFF_PERIODS: u64 = 4;

/// `None` when the genesis header or state was not read. `Some(false)` when
/// the state hash or the validators root disagrees with the published pin.
fn pin_genesis(beacon: &str) -> Option<bool> {
    let header = http_json(&format!("{beacon}/eth/v1/beacon/headers/genesis")).ok()?;
    let header_root = json_hash(header.pointer("/data/root")?).ok()?;
    let message = header.pointer("/data/header/message")?;
    let encoded = encode_header(message).ok()?;
    if crate::ssz_state::hash_beacon_header(&encoded).ok()? != header_root {
        return Some(false);
    }
    let state_root = json_hash(message.get("state_root")?).ok()?;
    let state = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/genesis")).ok()?;
    if crate::ssz_state::hash_beacon_state(&state).ok()? != state_root {
        return Some(false);
    }
    let found = crate::ssz_state::genesis_validators_root(&state).ok()?;
    Some(found == PUBLISHED_GENESIS_VALIDATORS_ROOT)
}

/// Last slot before the epoch transition that installs this period's committee.
fn pre_rotation_slot(finalized_slot: u64) -> Option<u64> {
    let epoch = finalized_slot / SLOTS_PER_EPOCH;
    let period_start = (epoch / EPOCHS_PER_SYNC_COMMITTEE_PERIOD) * EPOCHS_PER_SYNC_COMMITTEE_PERIOD;
    if period_start < 2 {
        return None;
    }
    Some((period_start - 1) * SLOTS_PER_EPOCH - 1)
}

/// Each earlier period's aggregate must authenticate a state whose
/// `next_sync_committee` is the committee that signed the next period.
/// `None` means the first historical state was not read. A match is still the same beacon.
fn committee_handoff(
    beacon: &str,
    finalized_slot: u64,
    current: &[[u8; 48]],
    schedule: &ForkSchedule,
) -> Option<Handoff> {
    let mut expected = current.to_vec();
    let mut from_slot = finalized_slot;
    let mut linked = 0u64;
    let mut epoch = 0u64;
    for _ in 0..HANDOFF_PERIODS {
        let Some(mut slot) = pre_rotation_slot(from_slot) else {
            break;
        };
        let mut advanced = false;
        for _ in 0..SLOTS_PER_EPOCH {
            let block = match http_json_optional(&format!("{beacon}/eth/v2/beacon/blocks/{slot}")) {
                Ok(Some(block)) => block,
                Ok(None) => {
                    if slot == 0 {
                        break;
                    }
                    slot -= 1;
                    continue;
                }
                Err(_) => return handoff_so_far(linked, epoch, true),
            };
            let block_slot = block
                .pointer("/data/message/slot")
                .and_then(|value| json_u64(value).ok())
                .unwrap_or(slot);
            let block_epoch = block_slot / SLOTS_PER_EPOCH;
            match bind_signed_header(beacon, &block, Some(schedule)) {
                StateBind::Unread => return handoff_so_far(linked, epoch, true),
                StateBind::Rejected => {
                    return Some(Handoff { matched: false, epoch: block_epoch, periods: linked });
                }
                StateBind::Bound { current: older, next } => {
                    if next.as_slice() != expected.as_slice() {
                        return Some(Handoff { matched: false, epoch: block_epoch, periods: linked });
                    }
                    linked += 1;
                    epoch = block_epoch;
                    expected = older;
                    from_slot = block_slot;
                    advanced = true;
                    break;
                }
            }
        }
        if !advanced {
            break;
        }
    }
    handoff_so_far(linked, epoch, linked > 0)
}

fn handoff_so_far(periods: u64, epoch: u64, matched: bool) -> Option<Handoff> {
    if periods == 0 {
        return None;
    }
    Some(Handoff { matched, epoch, periods })
}

struct ForkSchedule {
    fork: crate::sync_aggregate::ForkVersion,
    genesis_root: [u8; 32],
}

fn fork_schedule(beacon: &str, slot: u64) -> Option<ForkSchedule> {
    let genesis = http_json(&format!("{beacon}/eth/v1/beacon/genesis")).ok()?;
    let fork_body = http_json(&format!("{beacon}/eth/v1/beacon/states/{slot}/fork")).ok()?;
    let fork_data = fork_body.pointer("/data")?;
    let fork = crate::sync_aggregate::ForkVersion {
        previous: version_bytes(fork_data.get("previous_version")?.as_str()?).ok()?,
        current: version_bytes(fork_data.get("current_version")?.as_str()?).ok()?,
        epoch: json_u64(fork_data.get("epoch")?).ok()?,
    };
    let genesis_root = json_hash(genesis.pointer("/data/genesis_validators_root")?).ok()?;
    Some(ForkSchedule { fork, genesis_root })
}

fn bind_signed_header(beacon: &str, block: &Value, schedule: Option<&ForkSchedule>) -> StateBind {
    let Some(message) = block.pointer("/data/message") else {
        return StateBind::Unread;
    };
    let (Ok(parent_root), Ok(slot)) = (
        json_hash(message.get("parent_root").unwrap_or(&Value::Null)),
        json_u64(message.get("slot").unwrap_or(&Value::Null)),
    ) else {
        return StateBind::Unread;
    };
    let parent_slot = slot.saturating_sub(1);
    let Ok(header) = http_json(&format!(
        "{beacon}/eth/v1/beacon/headers/0x{}",
        hex::encode(parent_root)
    )) else {
        return StateBind::Unread;
    };
    let Some(header_msg) = header.pointer("/data/header/message") else {
        return StateBind::Unread;
    };
    let Ok(encoded) = encode_header(header_msg) else {
        return StateBind::Unread;
    };
    let Ok(header_root) = crate::ssz_state::hash_beacon_header(&encoded) else {
        return StateBind::Unread;
    };
    if header_root != parent_root {
        return StateBind::Rejected;
    }
    let Ok(state_root) = json_hash(header_msg.get("state_root").unwrap_or(&Value::Null)) else {
        return StateBind::Unread;
    };
    let Ok(state) = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/{parent_slot}")) else {
        return StateBind::Unread;
    };
    let Ok(state_hash) = crate::ssz_state::hash_beacon_state(&state) else {
        return StateBind::Rejected;
    };
    if state_hash != state_root {
        return StateBind::Rejected;
    }
    let Some(aggregate) = message.pointer("/body/sync_aggregate") else {
        return StateBind::Unread;
    };
    let (Ok(bits), Ok(signature)) = (
        decode_hex(aggregate.get("sync_committee_bits").and_then(Value::as_str).unwrap_or("")),
        decode_hex(aggregate.get("sync_committee_signature").and_then(Value::as_str).unwrap_or("")),
    ) else {
        return StateBind::Unread;
    };
    let (Ok(current), Ok(next)) = (
        crate::ssz_state::sync_committee_pubkeys(&state),
        crate::ssz_state::next_sync_committee_pubkeys(&state),
    ) else {
        return StateBind::Rejected;
    };
    let schedule = match schedule {
        Some(schedule) => schedule,
        None => match fork_schedule(beacon, parent_slot) {
            Some(schedule) => return bind_with_schedule(bits, signature, current, next, parent_root, parent_slot, &schedule),
            None => return StateBind::Unread,
        },
    };
    bind_with_schedule(bits, signature, current, next, parent_root, parent_slot, schedule)
}

fn bind_with_schedule(
    bits: Vec<u8>,
    signature: Vec<u8>,
    current: Vec<[u8; 48]>,
    next: Vec<[u8; 48]>,
    parent_root: [u8; 32],
    parent_slot: u64,
    schedule: &ForkSchedule,
) -> StateBind {
    let domain = crate::sync_aggregate::sync_domain(
        &schedule.fork,
        parent_slot / SLOTS_PER_EPOCH,
        schedule.genesis_root,
    );
    let signing = crate::sync_aggregate::signing_root(parent_root, domain);
    if crate::sync_aggregate::verify_participants(&bits, &current, &signature, &signing).is_err() {
        return StateBind::Rejected;
    }
    StateBind::Bound { current, next }
}

struct AggregateCheck {
    verified: bool,
    bound: bool,
    size: u64,
    epoch: u64,
}

fn verify_block_aggregate(root: &str, block: &Value) -> Result<AggregateCheck, Error> {
    let message = block.pointer("/data/message").ok_or(Error::Rpc)?;
    let slot = json_u64(message.get("slot").ok_or(Error::Rpc)?)?;
    let parent_root = json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?;
    let previous_slot = slot.saturating_sub(1);
    let epoch = previous_slot / 32;
    let aggregate = message.pointer("/body/sync_aggregate").ok_or(Error::Rpc)?;
    let bits = decode_hex(aggregate.get("sync_committee_bits").and_then(Value::as_str).unwrap_or("0x"))?;
    let signature = decode_hex(aggregate.get("sync_committee_signature").and_then(Value::as_str).unwrap_or("0x"))?;
    let committee = http_json(&format!("{root}/eth/v1/beacon/states/{previous_slot}/sync_committees"))?;
    let indexes = committee
        .pointer("/data/validators")
        .and_then(Value::as_array)
        .ok_or(Error::Rpc)?;
    let indexes = indexes
        .iter()
        .map(|value| json_u64(value))
        .collect::<Result<Vec<_>, _>>()?;
    if indexes.len() != 512 || bits.len() < 64 || signature.len() != 96 {
        return Ok(AggregateCheck { verified: false, bound: true, size: indexes.len() as u64, epoch });
    }
    let genesis = http_json(&format!("{root}/eth/v1/beacon/genesis"))?;
    let fork_body = http_json(&format!("{root}/eth/v1/beacon/states/{previous_slot}/fork"))?;
    let fork_data = fork_body.pointer("/data").ok_or(Error::Rpc)?;
    let fork = crate::sync_aggregate::ForkVersion {
        previous: version_bytes(fork_data.get("previous_version").and_then(Value::as_str).unwrap_or("0x"))?,
        current: version_bytes(fork_data.get("current_version").and_then(Value::as_str).unwrap_or("0x"))?,
        epoch: json_u64(fork_data.get("epoch").ok_or(Error::Rpc)?)?,
    };
    let genesis_root = json_hash(
        genesis
            .pointer("/data/genesis_validators_root")
            .ok_or(Error::Rpc)?,
    )?;
    let domain = crate::sync_aggregate::sync_domain(&fork, epoch, genesis_root);
    let signing = crate::sync_aggregate::signing_root(parent_root, domain);
    let pubkeys = validator_pubkeys(root, &previous_slot.to_string(), &indexes)?;
    let verified = crate::sync_aggregate::verify_participants(&bits, &pubkeys, &signature, &signing).is_ok();
    Ok(AggregateCheck { verified, bound: true, size: indexes.len() as u64, epoch })
}

fn validator_pubkeys(root: &str, state: &str, indexes: &[u64]) -> Result<Vec<[u8; 48]>, Error> {
    let mut out = Vec::with_capacity(indexes.len());
    for chunk in indexes.chunks(64) {
        let mut url = format!("{root}/eth/v1/beacon/states/{state}/validators?");
        for (i, index) in chunk.iter().enumerate() {
            if i > 0 {
                url.push('&');
            }
            url.push_str("id=");
            url.push_str(&index.to_string());
        }
        let body = http_json(&url)?;
        let rows = body.pointer("/data").and_then(Value::as_array).ok_or(Error::Rpc)?;
        let mut found = std::collections::HashMap::<u64, [u8; 48]>::new();
        for row in rows {
            let index = json_u64(row.get("index").ok_or(Error::Rpc)?)?;
            let text = row
                .pointer("/validator/pubkey")
                .and_then(Value::as_str)
                .ok_or(Error::Rpc)?;
            let bytes = decode_hex(text)?;
            let key: [u8; 48] = bytes.try_into().map_err(|_| Error::BadLength)?;
            found.insert(index, key);
        }
        for index in chunk {
            out.push(*found.get(index).ok_or(Error::Rpc)?);
        }
    }
    Ok(out)
}

fn version_bytes(text: &str) -> Result<[u8; 4], Error> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn agreed() -> ConsensusFacts {
        ConsensusFacts {
            chain_id: bindings::CONET_CHAIN_ID,
            finalized_epoch: 47_942,
            finalized_root: [9u8; 32],
            execution_number: 1_476_207,
            execution_hash: [4u8; 32],
            geth_number: 1_476_207,
            geth_hash: [4u8; 32],
            included_attestations: 1,
            light_client_update: false,
            sync_committee_size: 512,
            sync_bits_set: 400,
            sync_signature_bytes: 96,
            committee_epoch: 0,
            committee_bound: false,
            aggregate_verified: false,
            alias_number: 1_476_207,
        alias_hash: [4u8; 32],
        state_root_bound: None,
        committee_handoff: None,
        handoff_epoch: 0,
        handoff_periods: 0,
        genesis_pin: None,
        }
    }

    #[test]
    fn matching_tags_do_not_verify_signatures() {
        let report = assess_consensus(&agreed());
        assert!(report.beacon_agreed);
        assert!(!report.signature_check);
        assert!(report.text.contains("signature-check no"));
        assert!(report.text.contains("light-client no"));
        assert!(report.text.contains("custody closed"));
        assert!(report.text.contains("light-client-update absent"));
        assert!(report.text.contains("signature-material present"));
        assert!(report.text.contains("aggregate-verify failed"));
        assert!(report.text.contains("checkpoint-alias-same yes"));
        assert!(report.text.contains("alias-matches-geth yes"));
        assert!(report.text.contains("checkpoint-source head"));
        assert!(report.text.contains("sync-quorum yes"));
        assert!(report.text.contains("committee-state unread"));
        assert!(report.text.contains("state-root-binding unread"));
        assert!(report.text.contains("committee-handoff unread"));
        assert!(report.text.contains("handoff-periods 0"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
        assert!(report.text.contains("sync-committee 512"));
        assert!(!report.text.contains("final true"));
        assert!(!report.text.contains("light-client yes"));
        assert!(!report.text.contains("signature-check yes"));
    }

    #[test]
    fn hash_mismatch_is_not_agreement() {
        let mut facts = agreed();
        facts.geth_hash = [5u8; 32];
        let report = assess_consensus(&facts);
        assert!(!report.beacon_agreed);
        assert!(report.text.contains("beacon-agreed no"));
        assert!(report.text.contains("signature-check no"));
    }

    #[test]
    fn a_light_client_body_is_still_unchecked() {
        let mut facts = agreed();
        facts.light_client_update = true;
        let report = assess_consensus(&facts);
        assert!(report.beacon_agreed);
        assert!(!report.signature_check);
        assert!(report.text.contains("light-client-update present"));
        assert!(report.text.contains("signature-check no"));
        assert!(!report.text.contains("light-client yes"));
    }

    #[test]
    fn signature_bytes_without_a_committee_stay_unchecked() {
        let mut facts = agreed();
        facts.sync_committee_size = 0;
        let report = assess_consensus(&facts);
        assert!(!report.signature_check);
        assert!(report.text.contains("signature-material partial"));
        assert!(report.text.contains("signature-check no"));
    }

    #[test]
    fn a_verified_aggregate_still_leaves_custody_closed() {
        let mut facts = agreed();
        facts.aggregate_verified = true;
        facts.committee_bound = true;
        facts.committee_epoch = 47_941;
        let report = assess_consensus(&facts);
        assert!(report.signature_check);
        assert!(report.text.contains("signature-check yes"));
        assert!(report.text.contains("aggregate-verify yes"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
        assert!(report.text.contains("light-client no"));
        assert!(report.text.contains("committee-epoch 47941"));
        assert!(report.text.contains("committee-state parent-slot"));
        assert!(report.text.contains("state-root-binding unread"));
        assert!(!report.text.contains("final true"));
    }

    #[test]
    fn a_minority_aggregate_has_no_sync_quorum() {
        let mut facts = agreed();
        facts.sync_bits_set = 341;
        facts.aggregate_verified = true;
        facts.committee_bound = true;
        let report = assess_consensus(&facts);
        assert!(report.signature_check);
        assert!(report.text.contains("sync-quorum no"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
    }

    #[test]
    fn an_alias_that_matches_geth_is_not_checkpoint_agreement() {
        let mut facts = agreed();
        facts.execution_number = 1_477_711;
        facts.execution_hash = [7u8; 32];
        facts.geth_number = 1_477_775;
        facts.geth_hash = [8u8; 32];
        facts.alias_number = 1_477_775;
        facts.alias_hash = [8u8; 32];
        let report = assess_consensus(&facts);
        assert!(!report.beacon_agreed);
        assert!(report.text.contains("beacon-agreed no"));
        assert!(report.text.contains("checkpoint-alias-same no"));
        assert!(report.text.contains("alias-matches-geth yes"));
        assert!(report.text.contains("custody-gate no"));
    }

    #[test]
    fn the_finalized_state_is_not_the_checkpoint_source() {
        assert_eq!(FINALITY_CHECKPOINT_STATE, "head");
        let url = format!("/eth/v1/beacon/states/{FINALITY_CHECKPOINT_STATE}/finality_checkpoints");
        assert!(url.contains("/states/head/"));
        assert!(!url.contains("/states/finalized/"));
    }

    #[test]
    fn a_bound_state_root_still_leaves_custody_closed() {
        let mut facts = agreed();
        facts.aggregate_verified = true;
        facts.committee_bound = true;
        facts.state_root_bound = Some(true);
        let report = assess_consensus(&facts);
        assert!(report.text.contains("state-root-binding yes"));
        assert!(report.text.contains("committee-handoff unread"));
        assert!(report.text.contains("handoff-periods 0"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
        assert!(report.text.contains("light-client no"));
    }

    #[test]
    fn one_period_handoff_is_still_the_same_beacon() {
        let mut facts = agreed();
        facts.aggregate_verified = true;
        facts.committee_bound = true;
        facts.state_root_bound = Some(true);
        facts.committee_handoff = Some(true);
        facts.handoff_epoch = 48_126;
        facts.handoff_periods = 1;
        facts.genesis_pin = Some(true);
        let report = assess_consensus(&facts);
        assert!(report.text.contains("genesis-pin yes"));
        assert!(report.text.contains("committee-handoff yes"));
        assert!(report.text.contains("handoff-periods 1"));
        assert!(report.text.contains("handoff-epoch 48126"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
        assert!(report.text.contains("custody closed"));
    }

    #[test]
    fn the_handoff_slot_is_the_last_slot_before_rotation() {
        let slot = 48_216 * SLOTS_PER_EPOCH;
        assert_eq!(pre_rotation_slot(slot), Some(1_540_063));
        assert_eq!(pre_rotation_slot(48_126 * SLOTS_PER_EPOCH), Some(1_531_871));
        assert_eq!(HANDOFF_PERIODS, 4);
        assert_eq!(
            hex::encode(PUBLISHED_GENESIS_VALIDATORS_ROOT),
            "acac7566fdf384a1ada45c01dcf9030d7eb0e1e5f5302659101d0b2a5bb59092"
        );
    }
}
