//! Read-only Base anchor observed on Ethereum L1.
//!
//! This module asks OptimismPortal2 for its dispute-game factory and anchor
//! registry, then checks `isGameClaimValid` on the registry's anchor game.
//! A matching anchor is an L1 observation. It does not replay the fault proof,
//! it does not accept a Base execution tag, and it does not open custody.

use crate::assets::bindings;
use crate::error::Error;
use crate::execution::JsonRpcExecution;
use crate::finality::{AuthenticatedHeader, FinalityVerifier};
use crate::ExecutionView;
use std::time::Duration;

const ETHEREUM_CHAIN_ID: u64 = 1;
const PORTAL_HEX: &str = "49048044d57e1c92a77f79988d21fa8faf74e97e";
const FACTORY_HEX: &str = "43edb88c4b80fdd2adff2412a7bebf9df42cb40e";
const REGISTRY_HEX: &str = "909f6cf47ed12f010a796527f562bfc26c7f4e72";

const SEL_FACTORY: [u8; 4] = [0xf2, 0xb4, 0xe6, 0x17];
const SEL_REGISTRY: [u8; 4] = [0x5c, 0x0c, 0xba, 0x33];
const SEL_ANCHOR_ROOT: [u8; 4] = [0xd8, 0x3e, 0xf2, 0x67];
const SEL_ANCHOR_GAME: [u8; 4] = [0xe0, 0xa8, 0x40, 0xeb];
const SEL_CLAIM_VALID: [u8; 4] = [0x6c, 0x4f, 0x44, 0x67];
const SEL_SEQUENCE: [u8; 4] = [0x99, 0x73, 0x5e, 0x32];
const SEL_ROOT: [u8; 4] = [0xbc, 0xef, 0x3b, 0x55];

/// Facts read from Ethereum L1 and one Base execution height.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchorFacts {
    pub l1_chain_id: u64,
    pub base_chain_id: u64,
    pub portal: [u8; 20],
    pub factory: [u8; 20],
    pub registry: [u8; 20],
    pub anchor_game: [u8; 20],
    pub output_root: [u8; 32],
    pub l2_sequence: u64,
    pub claim_valid: bool,
    pub game_sequence: u64,
    pub game_root: [u8; 32],
    pub base_block: u64,
}

/// Observation only. `covered` means the Base block is at or behind a
/// claim-valid anchor. It is not permission to mint or release.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchorReport {
    pub l1_anchor: bool,
    pub covered: bool,
    pub execution_ahead: bool,
    pub text: String,
}

/// Base finality verifier backed by a claim-valid OptimismPortal anchor on
/// Ethereum L1. A Base execution `finalized` tag alone is not sufficient.
#[derive(Clone, Debug)]
pub struct BaseL1Finality {
    l1: L1Client,
    base: JsonRpcExecution,
}

impl BaseL1Finality {
    pub fn new(l1_rpc: impl Into<String>, base_rpc: impl Into<String>) -> Self {
        Self {
            l1: L1Client::new(&l1_rpc.into()),
            base: JsonRpcExecution::new(base_rpc),
        }
    }
}

impl FinalityVerifier for BaseL1Finality {
    fn authenticate(
        &self,
        chain_id: u64,
        header_hash: &[u8; 32],
    ) -> Result<AuthenticatedHeader, Error> {
        if chain_id != bindings::BASE_CHAIN_ID
            || self.base.chain_id()? != bindings::BASE_CHAIN_ID
        {
            return Err(Error::ChainMismatch);
        }
        let block = self.base.block_by_hash(header_hash)?;
        let canonical = self.base.block_by_number(block.number)?;
        if canonical.hash != block.hash
            || canonical.state_root != block.state_root
            || canonical.receipts_root != block.receipts_root
        {
            return Err(Error::UnknownHeader);
        }
        let facts = read_anchor_facts(&self.l1, block.number)?;
        if !assess_anchor(&facts).covered {
            return Err(Error::UnknownHeader);
        }
        Ok(AuthenticatedHeader {
            chain_id,
            header_hash: block.hash,
            number: block.number,
            state_root: block.state_root,
            receipts_root: block.receipts_root,
        })
    }
}

pub fn assess_anchor(facts: &AnchorFacts) -> AnchorReport {
    let pinned = facts.l1_chain_id == ETHEREUM_CHAIN_ID
        && facts.base_chain_id == bindings::BASE_CHAIN_ID
        && facts.portal == pinned_address(PORTAL_HEX)
        && facts.factory == pinned_address(FACTORY_HEX)
        && facts.registry == pinned_address(REGISTRY_HEX);
    let game_set = facts.anchor_game != [0u8; 20];
    let agrees = facts.claim_valid
        && facts.game_sequence == facts.l2_sequence
        && facts.game_root == facts.output_root
        && facts.l2_sequence > 0;
    let l1_anchor = pinned && game_set && agrees;
    let covered = l1_anchor && facts.base_block <= facts.l2_sequence;
    let execution_ahead = l1_anchor && facts.base_block > facts.l2_sequence;
    let text = format!(
        "l1-chain {l1}\n\
         base-chain {base}\n\
         portal 0x{portal}\n\
         dispute-game-factory 0x{factory}\n\
         anchor-registry 0x{registry}\n\
         anchor-game 0x{game}\n\
         output-root 0x{root}\n\
         anchor-l2 {seq}\n\
         base-block {block}\n\
         l1-anchor {anchor}\n\
         covered {covered}\n\
         execution-ahead {ahead}\n\
         fault-proof-replay no\n\
         header-check l1-anchor\n\
         light-client no\n\
         custody closed\n\
         broadcast no\n\
         settled no\n\
         shadow unchanged\n",
        l1 = facts.l1_chain_id,
        base = facts.base_chain_id,
        portal = hex::encode(facts.portal),
        factory = hex::encode(facts.factory),
        registry = hex::encode(facts.registry),
        game = hex::encode(facts.anchor_game),
        root = hex::encode(facts.output_root),
        seq = facts.l2_sequence,
        block = facts.base_block,
        anchor = yes(l1_anchor),
        covered = yes(covered),
        ahead = yes(execution_ahead),
    );
    AnchorReport { l1_anchor, covered, execution_ahead, text }
}

/// Read the live portal wiring and compare one Base block with the anchor.
/// `base_block` uses the Base `finalized` tag when omitted.
pub fn observe_base_l1_output(
    l1_rpc: &str,
    base_rpc: &str,
    base_block: Option<u64>,
) -> Result<String, Error> {
    let l1 = L1Client::new(l1_rpc);
    let base = JsonRpcExecution::new(base_rpc);
    let base_chain_id = base.chain_id()?;
    let base_block = match base_block {
        Some(number) => number,
        None => base.block_by_tag("finalized")?.number,
    };
    let mut facts = read_anchor_facts(&l1, base_block)?;
    facts.base_chain_id = base_chain_id;
    Ok(assess_anchor(&facts).text)
}

fn read_anchor_facts(l1: &L1Client, base_block: u64) -> Result<AnchorFacts, Error> {
    let l1_chain_id = l1.chain_id()?;
    let portal = pinned_address(PORTAL_HEX);
    let factory = address_word(&l1.eth_call(portal, &SEL_FACTORY)?)?;
    let registry = address_word(&l1.eth_call(portal, &SEL_REGISTRY)?)?;
    let root_words = l1.eth_call(registry, &SEL_ANCHOR_ROOT)?;
    let output_root = word(&root_words, 0)?;
    let l2_sequence = u64_word(&word(&root_words, 1)?)?;
    let anchor_game = address_word(&l1.eth_call(registry, &SEL_ANCHOR_GAME)?)?;
    let (claim_valid, game_sequence, game_root) = if anchor_game == [0u8; 20] {
        (false, 0, [0u8; 32])
    } else {
        let valid = u64_word(&word(
            &l1.eth_call(anchor_game, &call_data(&SEL_CLAIM_VALID, &anchor_game))?,
            0,
        )?)? == 1;
        let game_sequence = u64_word(&word(&l1.eth_call(anchor_game, &SEL_SEQUENCE)?, 0)?)?;
        let game_root = word(&l1.eth_call(anchor_game, &SEL_ROOT)?, 0)?;
        (valid, game_sequence, game_root)
    };
    Ok(AnchorFacts {
        l1_chain_id,
        base_chain_id: bindings::BASE_CHAIN_ID,
        portal,
        factory,
        registry,
        anchor_game,
        output_root,
        l2_sequence,
        claim_valid,
        game_sequence,
        game_root,
        base_block,
    })
}

#[derive(Clone, Debug)]
struct L1Client {
    url: String,
}

impl L1Client {
    fn new(url: &str) -> Self {
        Self { url: url.to_string() }
    }

    fn chain_id(&self) -> Result<u64, Error> {
        let result = self.rpc("eth_chainId", serde_json::json!([]))?;
        parse_u64(result.as_str().ok_or(Error::Rpc)?)
    }

    fn eth_call(&self, to: [u8; 20], data: &[u8]) -> Result<Vec<u8>, Error> {
        let result = self.rpc(
            "eth_call",
            serde_json::json!([{
                "to": format!("0x{}", hex::encode(to)),
                "data": format!("0x{}", hex::encode(data)),
            }, "latest"]),
        )?;
        let text = result.as_str().ok_or(Error::Rpc)?;
        let raw = text.strip_prefix("0x").unwrap_or(text);
        if raw.is_empty() {
            return Err(Error::Rpc);
        }
        hex::decode(raw).map_err(|_| Error::Rpc)
    }

    fn rpc(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, Error> {
        let response = ureq::post(&self.url)
            .timeout(Duration::from_secs(20))
            .set("content-type", "application/json")
            .send_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params,
            }))
            .map_err(|_| Error::Rpc)?;
        let body: serde_json::Value = response.into_json().map_err(|_| Error::Rpc)?;
        if body.get("error").is_some() {
            return Err(Error::Rpc);
        }
        Ok(body.get("result").cloned().unwrap_or(serde_json::Value::Null))
    }
}

fn call_data(selector: &[u8; 4], address: &[u8; 20]) -> Vec<u8> {
    let mut data = Vec::with_capacity(36);
    data.extend_from_slice(selector);
    data.extend_from_slice(&[0u8; 12]);
    data.extend_from_slice(address);
    data
}

fn word(bytes: &[u8], index: usize) -> Result<[u8; 32], Error> {
    let start = index * 32;
    let end = start + 32;
    if bytes.len() < end {
        return Err(Error::Rpc);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[start..end]);
    Ok(out)
}

fn address_word(bytes: &[u8]) -> Result<[u8; 20], Error> {
    let full = word(bytes, 0)?;
    if full[..12].iter().any(|byte| *byte != 0) {
        return Err(Error::Rpc);
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&full[12..]);
    Ok(out)
}

fn u64_word(word: &[u8; 32]) -> Result<u64, Error> {
    if word[..24].iter().any(|byte| *byte != 0) {
        return Err(Error::Rpc);
    }
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&word[24..]);
    Ok(u64::from_be_bytes(raw))
}

fn pinned_address(text: &str) -> [u8; 20] {
    let bytes = hex::decode(text).expect("pinned address");
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    out
}

fn parse_u64(text: &str) -> Result<u64, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    u64::from_str_radix(raw, 16).map_err(|_| Error::BadHex)
}

fn yes(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(base_block: u64, claim_valid: bool) -> AnchorFacts {
        let root = [0x2a; 32];
        AnchorFacts {
            l1_chain_id: 1,
            base_chain_id: 8453,
            portal: pinned_address(PORTAL_HEX),
            factory: pinned_address(FACTORY_HEX),
            registry: pinned_address(REGISTRY_HEX),
            anchor_game: [0x3e; 20],
            output_root: root,
            l2_sequence: 51_678_360,
            claim_valid,
            game_sequence: 51_678_360,
            game_root: root,
            base_block,
        }
    }

    #[test]
    fn execution_tag_ahead_of_anchor_stays_closed() {
        let report = assess_anchor(&sample(51_895_478, true));
        assert!(report.l1_anchor);
        assert!(!report.covered);
        assert!(report.execution_ahead);
        assert!(report.text.contains("custody closed"));
        assert!(report.text.contains("light-client no"));
        assert!(report.text.contains("fault-proof-replay no"));
        assert!(!report.text.contains("final true"));
        assert!(!report.text.contains("light-client yes"));
    }

    #[test]
    fn block_at_anchor_is_covered_without_opening_custody() {
        let report = assess_anchor(&sample(51_678_360, true));
        assert!(report.covered);
        assert!(report.text.contains("custody closed"));
        assert!(!report.text.contains("final true"));
    }

    #[test]
    fn invalid_claim_is_not_an_anchor() {
        let report = assess_anchor(&sample(1, false));
        assert!(!report.l1_anchor);
        assert!(!report.covered);
        assert!(!report.execution_ahead);
    }
}
