//! Read-only CONET beacon observation.
//!
//! The command compares the beacon's finalized execution payload with the
//! execution client's `finalized` tag. Agreement is a tag match. It is not a
//! BLS check of Casper FFG or a sync-committee signature, and it does not
//! accept a header into shadow.

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
    let signature_check = false;
    let update = if facts.light_client_update { "present" } else { "absent" };
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
         light-client-update {update}\n\
         signature-check {sig}\n\
         header-check beacon-tag\n\
         light-client no\n\
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
    let facts = facts_from_reads(chain_id, &checkpoints, &block, geth.number, geth.hash, light.is_some())?;
    Ok(assess_consensus(&facts).text)
}

pub fn facts_from_reads(
    chain_id: u64,
    checkpoints: &Value,
    block: &Value,
    geth_number: u64,
    geth_hash: [u8; 32],
    light_client_update: bool,
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
}
