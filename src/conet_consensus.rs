//! Read-only CONET beacon observation.
//!
//! The command compares the beacon's finalized execution payload with the
//! execution client's `finalized` tag and checks the sync-committee aggregate
//! with FastAggregateVerify. A matching signature uses pubkeys from that same
//! beacon, so `trusted-committee` stays no and the header is not accepted
//! into shadow.

use crate::assets::bindings;
use crate::error::Error;
use crate::execution::JsonRpcExecution;
use crate::ExecutionView;
use serde_json::Value;
use std::time::Duration;

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
    /// True only after FastAggregateVerify succeeds. The committee is still
    /// the one reported by this beacon, so custody stays closed.
    pub aggregate_verified: bool,
}

/// Observation only. `beacon_agreed` means the two finalized tags name the
/// same execution block. `signature_check` stays false in this observer.
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
    let text = format!(
        "conet-chain {chain}\n\
         beacon-finalized-epoch {epoch}\n\
         beacon-finalized-root 0x{root}\n\
         execution-block {exec_n}\n\
         execution-hash 0x{exec_h}\n\
         geth-finalized {geth_n}\n\
         geth-hash 0x{geth_h}\n\
         beacon-agreed {agreed}\n\
         included-attestations {atts}\n\
         sync-committee {committee}\n\
         sync-bits-set {bits}\n\
         sync-signature-bytes {sig_bytes}\n\
         signature-material {material}\n\
         aggregate-verify {aggregate}\n\
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
        agreed = yes(beacon_agreed),
        atts = facts.included_attestations,
        committee = facts.sync_committee_size,
        bits = facts.sync_bits_set,
        sig_bytes = facts.sync_signature_bytes,
        aggregate = aggregate,
        sig = yes(signature_check),
    );
    ConsensusReport { beacon_agreed, signature_check, text }
}

/// Read the beacon finalized checkpoint and compare it with the execution
/// client's finalized tag. A missing light-client route is reported as absent.
pub fn observe_conet_consensus(beacon: &str, execution_rpc: &str) -> Result<String, Error> {
    let execution = JsonRpcExecution::new(execution_rpc);
    let chain_id = execution.chain_id()?;
    let geth = execution.block_by_tag("finalized")?;
    let root = beacon.trim_end_matches('/');
    let checkpoints = http_json(&format!("{root}/eth/v1/beacon/states/finalized/finality_checkpoints"))?;
    let block = http_json(&format!("{root}/eth/v2/beacon/blocks/finalized"))?;
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
    facts.aggregate_verified = verify_block_aggregate(root, &block, committee.as_ref()).unwrap_or(false);
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
        aggregate_verified: false,
    })
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
    let response = ureq::get(url)
        .timeout(Duration::from_secs(20))
        .call();
    match response {
        Ok(body) => body.into_json().map(Some).map_err(|_| Error::Rpc),
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(ureq::Error::Status(_, _)) => Err(Error::Rpc),
        Err(_) => Err(Error::Rpc),
    }
}

fn verify_block_aggregate(root: &str, block: &Value, committee: Option<&Value>) -> Result<bool, Error> {
    let message = block.pointer("/data/message").ok_or(Error::Rpc)?;
    let slot = json_u64(message.get("slot").ok_or(Error::Rpc)?)?;
    let parent = json_hash(message.get("parent_root").ok_or(Error::Rpc)?)?;
    let aggregate = message.pointer("/body/sync_aggregate").ok_or(Error::Rpc)?;
    let bits = decode_hex(aggregate.get("sync_committee_bits").and_then(Value::as_str).unwrap_or("0x"))?;
    let signature = decode_hex(aggregate.get("sync_committee_signature").and_then(Value::as_str).unwrap_or("0x"))?;
    let indexes = committee
        .and_then(|value| value.pointer("/data/validators"))
        .and_then(Value::as_array)
        .ok_or(Error::Rpc)?;
    let indexes = indexes
        .iter()
        .map(|value| json_u64(value))
        .collect::<Result<Vec<_>, _>>()?;
    if indexes.len() != 512 || bits.len() < 64 || signature.len() != 96 {
        return Ok(false);
    }
    let genesis = http_json(&format!("{root}/eth/v1/beacon/genesis"))?;
    let fork_body = http_json(&format!("{root}/eth/v1/beacon/states/finalized/fork"))?;
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
    let previous_slot = slot.saturating_sub(1);
    let domain = crate::sync_aggregate::sync_domain(&fork, previous_slot / 32, genesis_root);
    let signing = crate::sync_aggregate::signing_root(parent, domain);
    let pubkeys = validator_pubkeys(root, &indexes)?;
    match crate::sync_aggregate::verify_participants(&bits, &pubkeys, &signature, &signing) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

fn validator_pubkeys(root: &str, indexes: &[u64]) -> Result<Vec<[u8; 48]>, Error> {
    let mut out = Vec::with_capacity(indexes.len());
    for chunk in indexes.chunks(64) {
        let mut url = format!("{root}/eth/v1/beacon/states/finalized/validators?");
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
            aggregate_verified: false,
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
        let report = assess_consensus(&facts);
        assert!(report.signature_check);
        assert!(report.text.contains("signature-check yes"));
        assert!(report.text.contains("aggregate-verify yes"));
        assert!(report.text.contains("trusted-committee no"));
        assert!(report.text.contains("custody-gate no"));
        assert!(report.text.contains("light-client no"));
        assert!(!report.text.contains("final true"));
    }
}
