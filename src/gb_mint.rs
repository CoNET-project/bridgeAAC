//! Read-only observation of paid-GB mint authority on CoNET.
//!
//! `GBTokenV2` still exposes `mint` and `mintPaid` to an admin, and
//! `voteBridgeMint` to bridge validators. This command checks whether those
//! selectors remain in the proxy runtime code and reads `validatorCount`,
//! `requiredVotes`, and `bridgePaused`. It does not send a mint or a vote.

use crate::assets::bindings;
use crate::custody_gate::{mint_gate_passed, MintClosureEvidence};
use crate::error::Error;
use crate::hash::keccak256;
use std::time::Duration;

const MINT_SIG: &str = "mint(address,uint256)";
const MINT_PAID_SIG: &str = "mintPaid(address,uint256)";
const VOTE_SIG: &str = "voteBridgeMint(bytes32,uint256,address,uint256)";
const REQUIRED_SIG: &str = "requiredVotes()";
const VALIDATOR_COUNT_SIG: &str = "validatorCount()";
const PAUSED_SIG: &str = "bridgePaused()";
/// `keccak256("eip1967.proxy.implementation") - 1`.
const IMPL_SLOT: &str = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/// Facts copied from one CoNET execution client.
/// Selectors are searched in `impl_code`, not in the proxy stub.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GbMintFacts {
    pub chain_id: u64,
    pub proxy_code: Vec<u8>,
    pub implementation: [u8; 20],
    pub impl_code: Vec<u8>,
    pub validator_count: u64,
    pub required_votes: u64,
    pub bridge_paused: bool,
}

/// Observation only. `mint_closed` stays false: missing selectors do not prove
/// that upgrade authority or a bare admin role is gone.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GbMintReport {
    pub mint_closed: bool,
    pub text: String,
}

pub fn assess_gb_mint(facts: &GbMintFacts) -> GbMintReport {
    let impl_set = facts.implementation != [0u8; 20];
    let readable = facts.chain_id == bindings::CONET_CHAIN_ID
        && !facts.proxy_code.is_empty()
        && impl_set
        && !facts.impl_code.is_empty();
    let admin_present = readable
        && (selector_present(&facts.impl_code, MINT_SIG)
            || selector_present(&facts.impl_code, MINT_PAID_SIG));
    let vote_present = readable && selector_present(&facts.impl_code, VOTE_SIG);
    let selectors_absent = readable && !admin_present && !vote_present;
    let evidence = MintClosureEvidence {
        selectors_absent,
        ..MintClosureEvidence::unproven()
    };
    let mint_closed = mint_gate_passed(&evidence);
    let admin = if !readable {
        "unread"
    } else if admin_present {
        "open"
    } else {
        "absent"
    };
    let vote = if !readable {
        "unread"
    } else if !vote_present {
        "absent"
    } else if facts.bridge_paused {
        "paused"
    } else if facts.validator_count == 0 {
        "no-validators"
    } else {
        "open"
    };
    let text = format!(
        "conet-chain {chain}\n\
         gb-token 0x{token}\n\
         gb-impl 0x{implementation}\n\
         proxy-bytes {proxy_len}\n\
         impl-bytes {impl_len}\n\
         validator-count {validators}\n\
         required-votes {required}\n\
         bridge-paused {paused}\n\
         admin-mint {admin}\n\
         vote-mint {vote}\n\
         selectors-absent {selectors}\n\
         upgrade-authority unread\n\
         mint-closed {closed}\n\
         custody-gate no\n\
         header-check gb-runtime\n\
         custody closed\n\
         broadcast no\n\
         settled no\n\
         shadow unchanged\n",
        chain = facts.chain_id,
        token = hex::encode(bindings::gb_token().0),
        implementation = hex::encode(facts.implementation),
        proxy_len = facts.proxy_code.len(),
        impl_len = facts.impl_code.len(),
        validators = facts.validator_count,
        required = facts.required_votes,
        paused = yes(facts.bridge_paused),
        selectors = if !readable {
            "unread"
        } else {
            yes(selectors_absent)
        },
        closed = yes(mint_closed),
    );
    GbMintReport { mint_closed, text }
}

/// Read the pinned GB proxy. A chain other than CoNET is refused.
pub fn observe_gb_mint(rpc: &str) -> Result<String, Error> {
    let client = GbClient::new(rpc);
    let chain_id = client.chain_id()?;
    if chain_id != bindings::CONET_CHAIN_ID {
        return Err(Error::ChainMismatch);
    }
    let token = bindings::gb_token().0;
    let proxy_code = client.get_code(token)?;
    let implementation = client.implementation(token)?;
    let impl_code = if implementation == [0u8; 20] {
        Vec::new()
    } else {
        client.get_code(implementation)?
    };
    let validator_count = u64_word(&client.eth_call(token, &selector(VALIDATOR_COUNT_SIG))?)?;
    let required_votes = u64_word(&client.eth_call(token, &selector(REQUIRED_SIG))?)?;
    let bridge_paused = bool_word(&client.eth_call(token, &selector(PAUSED_SIG))?)?;
    Ok(assess_gb_mint(&GbMintFacts {
        chain_id,
        proxy_code,
        implementation,
        impl_code,
        validator_count,
        required_votes,
        bridge_paused,
    })
    .text)
}

fn selector(signature: &str) -> [u8; 4] {
    let hash = keccak256(signature.as_bytes());
    let mut out = [0u8; 4];
    out.copy_from_slice(&hash[..4]);
    out
}

/// Solidity dispatch emits `PUSH4 selector`. A raw 4-byte hit also counts, so a
/// metadata collision can only keep the mint path reported open.
fn selector_present(code: &[u8], signature: &str) -> bool {
    let selector = selector(signature);
    code.windows(5).any(|window| window[0] == 0x63 && window[1..] == selector)
        || code.windows(4).any(|window| window == selector)
}

struct GbClient {
    url: String,
}

impl GbClient {
    fn new(url: &str) -> Self {
        Self { url: url.to_string() }
    }

    fn chain_id(&self) -> Result<u64, Error> {
        let result = self.rpc("eth_chainId", serde_json::json!([]))?;
        let text = result.as_str().ok_or(Error::Rpc)?;
        let raw = text.strip_prefix("0x").unwrap_or(text);
        u64::from_str_radix(raw, 16).map_err(|_| Error::BadHex)
    }

    fn implementation(&self, proxy: [u8; 20]) -> Result<[u8; 20], Error> {
        let result = self.rpc(
            "eth_getStorageAt",
            serde_json::json!([format!("0x{}", hex::encode(proxy)), IMPL_SLOT, "latest"]),
        )?;
        let bytes = decode_hex(result.as_str().ok_or(Error::Rpc)?)?;
        if bytes.len() < 32 {
            return Err(Error::Rpc);
        }
        let mut address = [0u8; 20];
        address.copy_from_slice(&bytes[bytes.len() - 20..]);
        Ok(address)
    }

    fn get_code(&self, to: [u8; 20]) -> Result<Vec<u8>, Error> {
        let result = self.rpc(
            "eth_getCode",
            serde_json::json!([format!("0x{}", hex::encode(to)), "latest"]),
        )?;
        decode_hex(result.as_str().ok_or(Error::Rpc)?)
    }

    fn eth_call(&self, to: [u8; 20], data: &[u8]) -> Result<Vec<u8>, Error> {
        let result = self.rpc(
            "eth_call",
            serde_json::json!([{
                "to": format!("0x{}", hex::encode(to)),
                "data": format!("0x{}", hex::encode(data)),
            }, "latest"]),
        )?;
        let bytes = decode_hex(result.as_str().ok_or(Error::Rpc)?)?;
        if bytes.len() < 32 {
            return Err(Error::Rpc);
        }
        Ok(bytes)
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

fn decode_hex(text: &str) -> Result<Vec<u8>, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(raw).map_err(|_| Error::BadHex)
}

fn u64_word(bytes: &[u8]) -> Result<u64, Error> {
    let word = &bytes[bytes.len() - 32..];
    if word[..24].iter().any(|byte| *byte != 0) {
        return Err(Error::Rpc);
    }
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&word[24..]);
    Ok(u64::from_be_bytes(raw))
}

fn bool_word(bytes: &[u8]) -> Result<bool, Error> {
    let word = &bytes[bytes.len() - 32..];
    if word[..31].iter().any(|byte| *byte != 0) || word[31] > 1 {
        return Err(Error::Rpc);
    }
    Ok(word[31] == 1)
}

fn yes(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push4(signature: &str) -> Vec<u8> {
        let mut code = vec![0x63];
        code.extend_from_slice(&selector(signature));
        code
    }

    fn live_like(paused: bool) -> GbMintFacts {
        let mut impl_code = Vec::new();
        impl_code.extend(push4(MINT_SIG));
        impl_code.extend(push4(MINT_PAID_SIG));
        impl_code.extend(push4(VOTE_SIG));
        GbMintFacts {
            chain_id: bindings::CONET_CHAIN_ID,
            proxy_code: vec![0x36, 0x3d, 0x3d, 0x37],
            implementation: [0x11; 20],
            impl_code,
            validator_count: 4,
            required_votes: 3,
            bridge_paused: paused,
        }
    }

    #[test]
    fn live_selectors_keep_both_mint_paths_open() {
        let report = assess_gb_mint(&live_like(false));
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint open\n"));
        assert!(report.text.contains("vote-mint open\n"));
        assert!(report.text.contains("mint-closed no\n"));
        assert!(report.text.contains("custody-gate no\n"));
        assert!(report.text.contains("custody closed\n"));
        assert!(!report.text.contains("mint-closed yes"));
        assert!(!report.text.contains("final true"));
    }

    #[test]
    fn a_paused_vote_path_does_not_close_admin_mint() {
        let report = assess_gb_mint(&live_like(true));
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint open\n"));
        assert!(report.text.contains("vote-mint paused\n"));
        assert!(report.text.contains("bridge-paused yes\n"));
        assert!(report.text.contains("custody closed\n"));
    }

    #[test]
    fn empty_code_is_unread_and_not_closed() {
        let report = assess_gb_mint(&GbMintFacts {
            chain_id: bindings::CONET_CHAIN_ID,
            proxy_code: Vec::new(),
            implementation: [0u8; 20],
            impl_code: Vec::new(),
            validator_count: 0,
            required_votes: 0,
            bridge_paused: false,
        });
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint unread\n"));
        assert!(report.text.contains("vote-mint unread\n"));
        assert!(report.text.contains("mint-closed no\n"));
    }

    #[test]
    fn selectors_absent_from_runtime_do_not_close_mint_authority() {
        let report = assess_gb_mint(&GbMintFacts {
            chain_id: bindings::CONET_CHAIN_ID,
            proxy_code: vec![0x36, 0x3d],
            implementation: [0x22; 20],
            impl_code: vec![0x60, 0x00, 0x56],
            validator_count: 0,
            required_votes: 0,
            bridge_paused: true,
        });
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint absent\n"));
        assert!(report.text.contains("vote-mint absent\n"));
        assert!(report.text.contains("selectors-absent yes\n"));
        assert!(report.text.contains("upgrade-authority unread\n"));
        assert!(report.text.contains("mint-closed no\n"));
        assert!(report.text.contains("custody-gate no\n"));
        assert!(report.text.contains("custody closed\n"));
        assert!(!report.text.contains("mint-closed yes"));
        assert!(!report.text.contains("gate passed"));
    }

    #[test]
    fn a_bare_selector_still_counts_as_present() {
        let mut code = selector(MINT_PAID_SIG).to_vec();
        code.extend_from_slice(&selector(VOTE_SIG));
        assert!(selector_present(&code, MINT_PAID_SIG));
        assert!(selector_present(&code, VOTE_SIG));
        assert!(!selector_present(&code, MINT_SIG));
    }

    #[test]
    fn zero_validators_do_not_look_like_a_pause() {
        let mut facts = live_like(false);
        facts.validator_count = 0;
        facts.required_votes = 0;
        let report = assess_gb_mint(&facts);
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint open\n"));
        assert!(report.text.contains("vote-mint no-validators\n"));
        assert!(report.text.contains("bridge-paused no\n"));
        assert!(report.text.contains("mint-closed no\n"));
    }

    #[test]
    fn a_proxy_stub_without_implementation_code_is_not_closed() {
        let report = assess_gb_mint(&GbMintFacts {
            chain_id: bindings::CONET_CHAIN_ID,
            proxy_code: vec![0x36; 163],
            implementation: [0u8; 20],
            impl_code: Vec::new(),
            validator_count: 0,
            required_votes: 0,
            bridge_paused: false,
        });
        assert!(!report.mint_closed);
        assert!(report.text.contains("admin-mint unread\n"));
        assert!(report.text.contains("mint-closed no\n"));
        assert!(report.text.contains("custody closed\n"));
    }
}
