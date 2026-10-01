//! Weak-subjectivity checkpoint and a specification-shaped light-client store.
//!
//! The genesis-rooted diagnostic chain may contain forced updates. This track
//! does not repair those periods. It starts from an explicit period checkpoint
//! and accepts only a verified supermajority for finality. Fewer than three
//! independent confirmations leaves the checkpoint at `safety observed`.
//! `trusted-committee` stays `no`, and this command does not feed shadow.

use crate::error::Error;
use crate::ssz_state::{self, hash_beacon_header, hash_beacon_state, verify_ssz_proof};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

const EPOCHS_PER_PERIOD: u64 = 256;
const SLOTS_PER_EPOCH: u64 = 32;
pub const WS_CONFIRMATIONS_REQUIRED: usize = 3;
const COMMITTEE_SIZE: usize = 512;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Safety {
    Observed,
    Optimistic,
    WeakSubjectivityTrusted,
    SupermajorityFinalized,
}

impl Safety {
    fn as_str(self) -> &'static str {
        match self {
            Safety::Observed => "observed",
            Safety::Optimistic => "optimistic",
            Safety::WeakSubjectivityTrusted => "weak-subjectivity-trusted",
            Safety::SupermajorityFinalized => "supermajority-finalized",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LightClientStore {
    pub finalized_slot: u64,
    pub finalized_root: [u8; 32],
    pub optimistic_slot: u64,
    pub current_committee_root: [u8; 32],
    pub next_committee_root: [u8; 32],
    pub next_known: bool,
    pub best_participants: u64,
    pub current_max_participants: u64,
    pub previous_max_participants: u64,
    pub supermajority_updates: u64,
    pub forced_updates: u64,
    pub updates: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpecUpdate {
    pub attested_slot: u64,
    pub signature_slot: u64,
    pub finalized_slot: u64,
    pub participants: u64,
    pub committee_size: u64,
    pub signature_ok: bool,
    pub next_committee_root: [u8; 32],
    pub next_branch_ok: bool,
    pub finalized_root: [u8; 32],
    pub finality_branch_ok: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApplyFault {
    Signature,
    SlotOrder,
    SkippedPeriod,
    OutOfOrder,
    SignaturePeriod,
    Branch,
    StaleFinalized,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct ConfirmationFile {
    signer: String,
    header_root: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct ConfirmerRecord {
    v: u32,
    kind: String,
    signer: String,
    period: u64,
    slot: u64,
    header_root: String,
    state_root: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct CheckpointFile {
    v: u32,
    kind: String,
    period: u64,
    slot: u64,
    header_root: String,
    state_root: String,
    finalized_epoch: u64,
    finalized_root: String,
    current_sync_committee_root: String,
    next_sync_committee_root: String,
    execution_block_hash: String,
    next_sync_committee_branch: Vec<String>,
    finalized_root_branch: Vec<String>,
    #[serde(default)]
    confirmations: Vec<ConfirmationFile>,
}

pub fn period_of_slot(slot: u64) -> u64 {
    (slot / SLOTS_PER_EPOCH) / EPOCHS_PER_PERIOD
}

pub fn apply_spec_update(store: &LightClientStore, update: &SpecUpdate) -> Result<LightClientStore, ApplyFault> {
    if !update.signature_ok || update.participants < 1 || update.committee_size == 0 {
        return Err(ApplyFault::Signature);
    }
    if update.signature_slot <= update.attested_slot || update.attested_slot < update.finalized_slot {
        return Err(ApplyFault::SlotOrder);
    }
    if !update.next_branch_ok || !update.finality_branch_ok {
        return Err(ApplyFault::Branch);
    }
    let store_period = period_of_slot(store.finalized_slot);
    let attested_period = period_of_slot(update.attested_slot);
    let signature_period = period_of_slot(update.signature_slot);
    if store.next_known {
        if attested_period > store_period + 1 {
            return Err(ApplyFault::SkippedPeriod);
        }
        if attested_period < store_period {
            return Err(ApplyFault::OutOfOrder);
        }
    } else if attested_period != store_period {
        return Err(if attested_period > store_period {
            ApplyFault::SkippedPeriod
        } else {
            ApplyFault::OutOfOrder
        });
    }
    if signature_period != attested_period
        && !(store.next_known && signature_period == attested_period + 1)
    {
        return Err(ApplyFault::SignaturePeriod);
    }
    if update.finalized_slot < store.finalized_slot {
        return Err(ApplyFault::StaleFinalized);
    }
    let mut next = store.clone();
    next.current_max_participants = next.current_max_participants.max(update.participants);
    next.best_participants = next.best_participants.max(update.participants);
    let supermajority = update.participants.saturating_mul(3) >= update.committee_size.saturating_mul(2);
    if !supermajority {
        let threshold = store.previous_max_participants.max(store.current_max_participants) / 2;
        if update.participants > threshold && update.attested_slot > next.optimistic_slot {
            next.optimistic_slot = update.attested_slot;
        }
        next.updates += 1;
        return Ok(next);
    }
    let finalized_period = period_of_slot(update.finalized_slot);
    if !store.next_known {
        next.next_committee_root = update.next_committee_root;
        next.next_known = true;
    } else if finalized_period == store_period + 1 {
        next.current_committee_root = store.next_committee_root;
        next.next_committee_root = update.next_committee_root;
        next.previous_max_participants = store.current_max_participants;
        next.current_max_participants = update.participants;
    }
    if update.finalized_slot > store.finalized_slot {
        next.finalized_slot = update.finalized_slot;
        next.finalized_root = update.finalized_root;
        if next.finalized_slot > next.optimistic_slot {
            next.optimistic_slot = next.finalized_slot;
        }
    }
    next.supermajority_updates += 1;
    next.updates += 1;
    Ok(next)
}

pub fn force_best_update(store: &LightClientStore, update: &SpecUpdate, current_slot: u64) -> Result<LightClientStore, ApplyFault> {
    if current_slot <= store.finalized_slot + EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH {
        return Err(ApplyFault::SlotOrder);
    }
    let mut forced = apply_spec_update(store, update)?;
    if forced.supermajority_updates == store.supermajority_updates {
        forced.forced_updates = store.forced_updates + 1;
    }
    Ok(forced)
}

pub fn safety_of(store: &LightClientStore, confirmations: usize) -> Safety {
    if store.forced_updates > 0 || confirmations < WS_CONFIRMATIONS_REQUIRED {
        if store.forced_updates == 0 && store.optimistic_slot > store.finalized_slot {
            return Safety::Optimistic;
        }
        return Safety::Observed;
    }
    if store.supermajority_updates > 0 {
        Safety::SupermajorityFinalized
    } else {
        Safety::WeakSubjectivityTrusted
    }
}

pub fn confirmed_signers(header_root: [u8; 32], confirmations: &[(String, [u8; 32])]) -> usize {
    let mut signers = BTreeSet::new();
    for (signer, root) in confirmations {
        if *root == header_root && !signer.is_empty() {
            signers.insert(signer.clone());
        }
    }
    signers.len()
}

fn format_capture(period: u64, proofs: bool, witness: &str, confirmations: usize, safety: Safety) -> String {
    format!(
        "\
         weak-subjectivity-candidate\n\
         period {period}\n\
         proofs {proofs}\n\
         witness {witness}\n\
         confirmations {confirmations}\n\
         confirmations-required {required}\n\
         safety {safety}\n\
         trusted-committee no\n\
         custody-gate no\n\
         custody closed\n\
         feeds-shadow no\n",
        proofs = if proofs { "yes" } else { "no" },
        required = WS_CONFIRMATIONS_REQUIRED,
        safety = safety.as_str(),
    )
}

pub fn confirm_checkpoint(beacon: &str, period: u64, out: &Path) -> Result<String, Error> {
    let (file, _) = build_checkpoint(beacon, None, period)?;
    let signer = beacon_peer_id(beacon)?;
    let confirmation = ConfirmerRecord {
        v: 1,
        kind: "weak-subjectivity-confirmation".to_string(),
        signer,
        period: file.period,
        slot: file.slot,
        header_root: file.header_root,
        state_root: file.state_root,
    };
    write_json(out, &confirmation)?;
    Ok(format!(
        "\
         weak-subjectivity-confirmation\n\
         signer {signer}\n\
         period {period}\n\
         slot {slot}\n\
         header {header}\n\
         state {state}\n\
         proofs yes\n\
         trusted-committee no\n\
         custody-gate no\n\
         custody closed\n\
         feeds-shadow no\n",
        signer = confirmation.signer,
        period = confirmation.period,
        slot = confirmation.slot,
        header = confirmation.header_root,
        state = confirmation.state_root,
    ))
}

pub fn accept_confirmations(checkpoint: &Path, extras: &[std::path::PathBuf]) -> Result<String, Error> {
    let mut file: CheckpointFile = read_json(checkpoint)?;
    if file.kind != "weak-subjectivity-candidate" || file.header_root.len() != 64 {
        return Err(Error::MerkleMismatch);
    }
    let mut rejected = 0u64;
    for path in extras {
        let confirmation: ConfirmerRecord = match read_json(path) {
            Ok(item) => item,
            Err(_) => {
                rejected += 1;
                continue;
            }
        };
        let same = confirmation.kind == "weak-subjectivity-confirmation"
            && confirmation.period == file.period
            && confirmation.slot == file.slot
            && confirmation.header_root == file.header_root
            && confirmation.state_root == file.state_root
            && !confirmation.signer.is_empty();
        if !same {
            rejected += 1;
            continue;
        }
        if file.confirmations.iter().any(|item| item.signer == confirmation.signer) {
            continue;
        }
        file.confirmations.push(ConfirmationFile {
            signer: confirmation.signer,
            header_root: confirmation.header_root,
        });
    }
    write_json(checkpoint, &file)?;
    let header = parse_hash(&file.header_root)?;
    let rows: Vec<(String, [u8; 32])> = file
        .confirmations
        .iter()
        .filter_map(|item| parse_hash(&item.header_root).ok().map(|root| (item.signer.clone(), root)))
        .collect();
    let count = confirmed_signers(header, &rows);
    let store = LightClientStore {
        finalized_slot: file.slot,
        finalized_root: parse_hash(&file.finalized_root).unwrap_or([0u8; 32]),
        optimistic_slot: file.slot,
        current_committee_root: [0u8; 32],
        next_committee_root: [0u8; 32],
        next_known: true,
        best_participants: 0,
        current_max_participants: 0,
        previous_max_participants: 0,
        supermajority_updates: 0,
        forced_updates: 0,
        updates: 0,
    };
    Ok(format!(
        "{report}rejected {rejected}\n",
        report = format_capture(file.period, true, "local", count, safety_of(&store, count)),
    ))
}

fn beacon_peer_id(beacon: &str) -> Result<String, Error> {
    let body = http_json(&format!("{beacon}/eth/v1/node/identity"))?;
    let peer = body.pointer("/data/peer_id").and_then(Value::as_str).ok_or(Error::Rpc)?;
    if peer.is_empty() {
        return Err(Error::Rpc);
    }
    Ok(peer.to_string())
}

fn parse_hash(text: &str) -> Result<[u8; 32], Error> {
    let bare = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(bare).map_err(|_| Error::BadHex)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, Error> {
    let text = fs::read_to_string(path).map_err(|_| Error::Journal)?;
    serde_json::from_str(&text).map_err(|_| Error::Journal)
}

fn write_json<T: Serialize>(out: &Path, value: &T) -> Result<(), Error> {
    if let Some(parent) = out.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| Error::Journal)?;
    let tmp = out.with_extension("json.tmp");
    fs::write(&tmp, bytes).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, out).map_err(|_| Error::Journal)
}

fn build_checkpoint(
    beacon: &str,
    witness: Option<&str>,
    period: u64,
) -> Result<(CheckpointFile, &'static str), Error> {
    let found = find_supermajority_block(beacon, period)?;
    let parent_slot = found.slot.saturating_sub(1);
    let header = http_json(&format!(
        "{beacon}/eth/v1/beacon/headers/0x{}",
        hex::encode(found.parent_root)
    ))?;
    let header_msg = header.pointer("/data/header/message").ok_or(Error::Rpc)?;
    let encoded = encode_header(header_msg)?;
    let header_root = hash_beacon_header(&encoded)?;
    if header_root != found.parent_root {
        return Err(Error::MerkleMismatch);
    }
    let state_root = json_hash(header_msg.get("state_root").ok_or(Error::Rpc)?)?;
    let state = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/{parent_slot}"))?;
    if hash_beacon_state(&state)? != state_root {
        return Err(Error::MerkleMismatch);
    }
    let next_proof = ssz_state::next_sync_committee_proof(&state)?;
    let finality_proof = ssz_state::finalized_root_proof(&state)?;
    let proofs = verify_ssz_proof(&next_proof, state_root) && verify_ssz_proof(&finality_proof, state_root);
    if !proofs {
        return Err(Error::MerkleMismatch);
    }
    let roots = ssz_state::beacon_state_field_roots(&state)?;
    let (finalized_epoch, finalized_root) = ssz_state::finalized_checkpoint(&state)?;
    let execution = ssz_state::execution_block_hash(&state)?;
    let witness_label = match witness {
        None => "omitted",
        Some(url) => match witness_state_root(url, parent_slot) {
            Some(root) if root == state_root => "yes",
            Some(_) => "no",
            None => "unread",
        },
    };
    let file = CheckpointFile {
        v: 1,
        kind: "weak-subjectivity-candidate".to_string(),
        period,
        slot: parent_slot,
        header_root: hex::encode(header_root),
        state_root: hex::encode(state_root),
        finalized_epoch,
        finalized_root: hex::encode(finalized_root),
        current_sync_committee_root: hex::encode(roots[22]),
        next_sync_committee_root: hex::encode(roots[23]),
        execution_block_hash: hex::encode(execution),
        next_sync_committee_branch: next_proof.branch.iter().map(hex::encode).collect(),
        finalized_root_branch: finality_proof.branch.iter().map(hex::encode).collect(),
        confirmations: Vec::new(),
    };
    Ok((file, witness_label))
}

pub fn observe_weak_subjectivity(
    beacon: &str,
    witness: Option<&str>,
    period: u64,
    out: &Path,
) -> Result<String, Error> {
    let (file, witness_label) = build_checkpoint(beacon, witness, period)?;
    write_json(out, &file)?;
    let header_root = parse_hash(&file.header_root)?;
    let store = LightClientStore {
        finalized_slot: file.slot,
        finalized_root: parse_hash(&file.finalized_root)?,
        optimistic_slot: file.slot,
        current_committee_root: parse_hash(&file.current_sync_committee_root)?,
        next_committee_root: parse_hash(&file.next_sync_committee_root)?,
        next_known: true,
        best_participants: 0,
        current_max_participants: 0,
        previous_max_participants: 0,
        supermajority_updates: 0,
        forced_updates: 0,
        updates: 0,
    };
    let confirmations = confirmed_signers(header_root, &[]);
    Ok(format_capture(period, true, witness_label, confirmations, safety_of(&store, confirmations)))
}

struct SignedBlock {
    slot: u64,
    parent_root: [u8; 32],
}

fn find_supermajority_block(beacon: &str, period: u64) -> Result<SignedBlock, Error> {
    let mut slot = (period + 1) * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH - 1;
    let start = period * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH;
    while slot >= start {
        match http_json_optional(&format!("{beacon}/eth/v2/beacon/blocks/{slot}"))? {
            Some(block) => {
                let bits = block_bits(&block).unwrap_or(0);
                if bits.saturating_mul(3) >= (COMMITTEE_SIZE as u64).saturating_mul(2) {
                    let message = block.pointer("/data/message").ok_or(Error::Rpc)?;
                    return Ok(SignedBlock {
                        slot: json_u64(message.get("slot").ok_or(Error::Rpc)?)?,
                        parent_root: json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?,
                    });
                }
            }
            None => {}
        }
        if slot == start {
            break;
        }
        slot -= 1;
    }
    Err(Error::Rpc)
}

fn block_bits(block: &Value) -> Option<u64> {
    let text = block.pointer("/data/message/body/sync_aggregate/sync_committee_bits")?.as_str()?;
    let bare = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(bare).ok()?;
    Some((0..COMMITTEE_SIZE).filter(|index| bytes.get(index / 8).is_some_and(|byte| byte & (1 << (index % 8)) != 0)).count() as u64)
}

fn witness_state_root(beacon: &str, slot: u64) -> Option<[u8; 32]> {
    let state = http_bytes(&format!("{beacon}/eth/v2/debug/beacon/states/{slot}")).ok()?;
    hash_beacon_state(&state).ok()
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

fn json_u64(value: &Value) -> Result<u64, Error> {
    if let Some(number) = value.as_u64() {
        return Ok(number);
    }
    value.as_str().ok_or(Error::Rpc)?.parse().map_err(|_| Error::Rpc)
}

fn json_hash(value: &Value) -> Result<[u8; 32], Error> {
    let text = value.as_str().ok_or(Error::BadHex)?;
    let bare = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(bare).map_err(|_| Error::BadHex)?;
    bytes.try_into().map_err(|_| Error::BadLength)
}

fn http_json(url: &str) -> Result<Value, Error> {
    match http_json_optional(url)? {
        Some(body) => Ok(body),
        None => Err(Error::Rpc),
    }
}

fn http_json_optional(url: &str) -> Result<Option<Value>, Error> {
    match ureq::get(url).timeout(Duration::from_secs(20)).call() {
        Ok(body) => body.into_json().map(Some).map_err(|_| Error::Rpc),
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

    fn store() -> LightClientStore {
        LightClientStore {
            finalized_slot: 18 * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH,
            finalized_root: [1u8; 32],
            optimistic_slot: 18 * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH,
            current_committee_root: [2u8; 32],
            next_committee_root: [3u8; 32],
            next_known: true,
            best_participants: 0,
            current_max_participants: 512,
            previous_max_participants: 512,
            supermajority_updates: 0,
            forced_updates: 0,
            updates: 0,
        }
    }

    fn update() -> SpecUpdate {
        SpecUpdate {
            attested_slot: store().finalized_slot + 10,
            signature_slot: store().finalized_slot + 11,
            finalized_slot: store().finalized_slot + 8,
            participants: 400,
            committee_size: 512,
            signature_ok: true,
            next_committee_root: [4u8; 32],
            next_branch_ok: true,
            finalized_root: [5u8; 32],
            finality_branch_ok: true,
        }
    }

    #[test]
    fn a_minority_update_does_not_rotate_the_committee() {
        let mut update = update();
        update.participants = 300;
        let next = apply_spec_update(&store(), &update).unwrap();
        assert_eq!(period_of_slot(next.finalized_slot), 18);
        assert_eq!(next.current_committee_root, [2u8; 32]);
        assert_eq!(next.supermajority_updates, 0);
        assert_eq!(safety_of(&next, 0), Safety::Optimistic);
    }

    #[test]
    fn a_supermajority_into_the_next_period_rotates_once() {
        let mut update = update();
        update.finalized_slot = 19 * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH;
        update.attested_slot = update.finalized_slot + 8;
        update.signature_slot = update.attested_slot + 1;
        let next = apply_spec_update(&store(), &update).unwrap();
        assert_eq!(period_of_slot(next.finalized_slot), 19);
        assert_eq!(next.current_committee_root, [3u8; 32]);
        assert_eq!(next.next_committee_root, [4u8; 32]);
        assert_eq!(next.supermajority_updates, 1);
        assert_eq!(next.forced_updates, 0);
    }

    #[test]
    fn a_missing_merkle_branch_is_rejected() {
        let mut update = update();
        update.next_branch_ok = false;
        assert_eq!(apply_spec_update(&store(), &update), Err(ApplyFault::Branch));
    }

    #[test]
    fn a_later_period_cannot_skip_the_current_one() {
        let mut update = update();
        update.attested_slot = 20 * EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH;
        update.signature_slot = update.attested_slot + 1;
        update.finalized_slot = update.attested_slot;
        assert_eq!(apply_spec_update(&store(), &update), Err(ApplyFault::SkippedPeriod));
    }

    #[test]
    fn a_forced_update_cannot_become_supermajority_finalized() {
        let mut update = update();
        update.participants = 203;
        let current = store().finalized_slot + EPOCHS_PER_PERIOD * SLOTS_PER_EPOCH + 1;
        let forced = force_best_update(&store(), &update, current).unwrap();
        assert_eq!(forced.forced_updates, 1);
        assert_eq!(safety_of(&forced, WS_CONFIRMATIONS_REQUIRED), Safety::Observed);
    }

    #[test]
    fn three_distinct_confirmations_can_mark_the_checkpoint_without_opening_custody() {
        let root = [9u8; 32];
        let rows = vec![
            ("a".to_string(), root),
            ("b".to_string(), root),
            ("a".to_string(), root),
            ("c".to_string(), root),
        ];
        assert_eq!(confirmed_signers(root, &rows), 3);
        let text = format_capture(18, true, "yes", 3, Safety::WeakSubjectivityTrusted);
        assert!(text.contains("safety weak-subjectivity-trusted"));
        assert!(text.contains("trusted-committee no"));
        assert!(text.contains("custody closed"));
        assert!(text.contains("feeds-shadow no"));
        assert!(text.contains("confirmations-required 3"));
    }

    #[test]
    fn a_different_header_is_not_counted_as_a_confirmation() {
        let dir = std::env::temp_dir().join(format!("aac-confirm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let checkpoint = dir.join("checkpoint.json");
        let good = dir.join("good.json");
        let bad = dir.join("bad.json");
        let header = "11".repeat(32);
        let state = "22".repeat(32);
        std::fs::write(
            &checkpoint,
            format!(
                r#"{{"v":1,"kind":"weak-subjectivity-candidate","period":18,"slot":155646,"header_root":"{header}","state_root":"{state}","finalized_epoch":4861,"finalized_root":"{state}","current_sync_committee_root":"{header}","next_sync_committee_root":"{header}","execution_block_hash":"{header}","next_sync_committee_branch":[],"finalized_root_branch":[],"confirmations":[]}}"#
            ),
        )
        .unwrap();
        let record = |signer: &str, root: &str| {
            format!(
                r#"{{"v":1,"kind":"weak-subjectivity-confirmation","signer":"{signer}","period":18,"slot":155646,"header_root":"{root}","state_root":"{state}"}}"#
            )
        };
        std::fs::write(&good, record("peer-a", &header)).unwrap();
        std::fs::write(&bad, record("peer-b", &"33".repeat(32))).unwrap();
        let report = accept_confirmations(&checkpoint, &[good, bad]).unwrap();
        assert!(report.contains("confirmations 1"));
        assert!(report.contains("rejected 1"));
        assert!(report.contains("safety observed"));
        assert!(report.contains("trusted-committee no"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
