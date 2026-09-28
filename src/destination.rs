//! Read-only check for the planned destination consume selectors.
//!
//! A PUSH4 hit is `selector-observation`. It is not consume-once: the live
//! command always applies [`crate::custody_gate::ConsumeEvidence::unproven`].
//! This command does not deploy a consumer, does not call one, and does not
//! open custody.

use crate::assets::bindings;
use crate::custody_gate::{consume_gate_passed, ConsumeEvidence};
use crate::error::Error;
use crate::hash::keccak256;
use std::time::Duration;

const MINT_SIG: &str = "aacConsumeMint(bytes32)";
const RELEASE_SIG: &str = "aacConsumeRelease(bytes32)";
const PAID_SIG: &str = "aacConsumeMintPaid(bytes32)";
const DEVELOPER_SIG: &str = "aacConsumeMintDeveloper(bytes32)";
const IMPL_SLOT: &str = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/// Bytecode facts for the pinned Treasury, GB token, and predicted Peer v5.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DestinationFacts {
    pub conet_chain_id: u64,
    pub base_chain_id: u64,
    pub conet_treasury_proxy: Vec<u8>,
    pub conet_treasury_impl: [u8; 20],
    pub conet_treasury_code: Vec<u8>,
    pub base_treasury_proxy: Vec<u8>,
    pub base_treasury_impl: [u8; 20],
    pub base_treasury_code: Vec<u8>,
    pub gb_proxy: Vec<u8>,
    pub gb_impl: [u8; 20],
    pub gb_code: Vec<u8>,
    pub peer_code: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DestinationReport {
    /// Live observation is always false. Selector bytes do not set this flag.
    pub consume_once: bool,
    pub text: String,
}

pub fn assess_destination(facts: &DestinationFacts) -> DestinationReport {
    let chains_ok = facts.conet_chain_id == bindings::CONET_CHAIN_ID
        && facts.base_chain_id == bindings::BASE_CHAIN_ID;
    let mint_readable = chains_ok && impl_readable(&facts.conet_treasury_proxy, facts.conet_treasury_impl, &facts.conet_treasury_code);
    let release_readable = chains_ok && impl_readable(&facts.base_treasury_proxy, facts.base_treasury_impl, &facts.base_treasury_code);
    let paid_readable = chains_ok && impl_readable(&facts.gb_proxy, facts.gb_impl, &facts.gb_code);
    let developer_readable = chains_ok && !facts.peer_code.is_empty();
    let mint = push4_present(&facts.conet_treasury_code, MINT_SIG);
    let release = push4_present(&facts.base_treasury_code, RELEASE_SIG);
    let paid = push4_present(&facts.gb_code, PAID_SIG);
    let developer = push4_present(&facts.peer_code, DEVELOPER_SIG);
    let selectors_present =
        mint_readable && mint && release_readable && release && paid_readable && paid && developer_readable && developer;
    let any_selector = mint || release || paid || developer;
    let all_readable = mint_readable && release_readable && paid_readable && developer_readable;
    let observation = if !all_readable && !any_selector {
        "unread"
    } else if selectors_present {
        "present"
    } else if any_selector {
        "partial"
    } else {
        "absent"
    };
    let evidence = ConsumeEvidence::unproven();
    let consume_once = consume_gate_passed(selectors_present, &evidence);
    let text = format!(
        "conet-chain {conet}\n\
         base-chain {base}\n\
         treasury 0x{treasury}\n\
         conet-treasury-impl 0x{conet_impl}\n\
         base-treasury-impl 0x{base_impl}\n\
         gb-token 0x{gb}\n\
         gb-impl 0x{gb_impl}\n\
         peer-v5 0x{peer}\n\
         peer-code-bytes {peer_len}\n\
         aac-consume-mint {mint_label}\n\
         aac-consume-release {release_label}\n\
         aac-consume-mint-paid {paid_label}\n\
         aac-consume-mint-developer {developer_label}\n\
         selector-observation {observation}\n\
         semantic-proof no\n\
         replay-storage no\n\
         role-separated no\n\
         atomic-rollback no\n\
         reentrancy-guard no\n\
         upgrade-layout no\n\
         consume-once {once}\n\
         consumer observation-only\n\
         audit no\n\
         custody-gate no\n\
         custody closed\n\
         broadcast no\n\
         settled no\n\
         shadow unchanged\n",
        conet = facts.conet_chain_id,
        base = facts.base_chain_id,
        treasury = hex::encode(bindings::treasury_v3().0),
        conet_impl = hex::encode(facts.conet_treasury_impl),
        base_impl = hex::encode(facts.base_treasury_impl),
        gb = hex::encode(bindings::gb_token().0),
        gb_impl = hex::encode(facts.gb_impl),
        peer = hex::encode(bindings::peer_v5().0),
        peer_len = facts.peer_code.len(),
        mint_label = label(mint_readable, mint),
        release_label = label(release_readable, release),
        paid_label = label(paid_readable, paid),
        developer_label = label(developer_readable, developer),
        observation = observation,
        once = yes(consume_once),
    );
    DestinationReport { consume_once, text }
}

/// Read both pinned chains. A swapped RPC pair is refused.
pub fn observe_destination(conet_rpc: &str, base_rpc: &str) -> Result<String, Error> {
    let conet = ChainClient::new(conet_rpc);
    let base = ChainClient::new(base_rpc);
    let conet_chain_id = conet.chain_id()?;
    let base_chain_id = base.chain_id()?;
    if conet_chain_id != bindings::CONET_CHAIN_ID || base_chain_id != bindings::BASE_CHAIN_ID {
        return Err(Error::ChainMismatch);
    }
    let treasury = bindings::treasury_v3().0;
    let gb = bindings::gb_token().0;
    let (conet_treasury_proxy, conet_treasury_impl, conet_treasury_code) = conet.implementation_code(treasury)?;
    let (base_treasury_proxy, base_treasury_impl, base_treasury_code) = base.implementation_code(treasury)?;
    let (gb_proxy, gb_impl, gb_code) = conet.implementation_code(gb)?;
    let peer_code = conet.get_code(bindings::peer_v5().0)?;
    Ok(assess_destination(&DestinationFacts {
        conet_chain_id,
        base_chain_id,
        conet_treasury_proxy,
        conet_treasury_impl,
        conet_treasury_code,
        base_treasury_proxy,
        base_treasury_impl,
        base_treasury_code,
        gb_proxy,
        gb_impl,
        gb_code,
        peer_code,
    })
    .text)
}

fn impl_readable(proxy: &[u8], implementation: [u8; 20], code: &[u8]) -> bool {
    !proxy.is_empty() && implementation != [0u8; 20] && !code.is_empty()
}

fn label(readable: bool, present: bool) -> &'static str {
    if !readable {
        "unread"
    } else if present {
        "yes"
    } else {
        "no"
    }
}

fn yes(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}

fn selector(signature: &str) -> [u8; 4] {
    let hash = keccak256(signature.as_bytes());
    let mut out = [0u8; 4];
    out.copy_from_slice(&hash[..4]);
    out
}

/// Only Solidity `PUSH4 selector` counts. A raw 4-byte hit can collide with
/// unrelated runtime bytes and must not look like a consumer entrypoint.
fn push4_present(code: &[u8], signature: &str) -> bool {
    let selector = selector(signature);
    code.windows(5)
        .any(|window| window[0] == 0x63 && window[1..] == selector)
}

struct ChainClient {
    url: String,
}

impl ChainClient {
    fn new(url: &str) -> Self {
        Self { url: url.to_string() }
    }

    fn chain_id(&self) -> Result<u64, Error> {
        let result = self.rpc("eth_chainId", serde_json::json!([]))?;
        let text = result.as_str().ok_or(Error::Rpc)?;
        let raw = text.strip_prefix("0x").unwrap_or(text);
        u64::from_str_radix(raw, 16).map_err(|_| Error::BadHex)
    }

    fn implementation_code(&self, proxy: [u8; 20]) -> Result<(Vec<u8>, [u8; 20], Vec<u8>), Error> {
        let proxy_code = self.get_code(proxy)?;
        let implementation = self.implementation(proxy)?;
        let code = if implementation == [0u8; 20] {
            Vec::new()
        } else {
            self.get_code(implementation)?
        };
        Ok((proxy_code, implementation, code))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn push4(signature: &str) -> Vec<u8> {
        let mut code = vec![0x63];
        code.extend_from_slice(&selector(signature));
        code
    }

    fn proxy() -> Vec<u8> {
        vec![0x36, 0x3d, 0x3d, 0x37]
    }

    fn full() -> DestinationFacts {
        DestinationFacts {
            conet_chain_id: bindings::CONET_CHAIN_ID,
            base_chain_id: bindings::BASE_CHAIN_ID,
            conet_treasury_proxy: proxy(),
            conet_treasury_impl: [0x11; 20],
            conet_treasury_code: push4(MINT_SIG),
            base_treasury_proxy: proxy(),
            base_treasury_impl: [0x22; 20],
            base_treasury_code: push4(RELEASE_SIG),
            gb_proxy: proxy(),
            gb_impl: [0x33; 20],
            gb_code: push4(PAID_SIG),
            peer_code: push4(DEVELOPER_SIG),
        }
    }

    #[test]
    fn every_selector_still_leaves_custody_closed() {
        let report = assess_destination(&full());
        assert!(!report.consume_once);
        assert!(report.text.contains("selector-observation present\n"));
        assert!(report.text.contains("semantic-proof no\n"));
        assert!(report.text.contains("consume-once no\n"));
        assert!(report.text.contains("consumer observation-only\n"));
        assert!(report.text.contains("audit no\n"));
        assert!(report.text.contains("custody-gate no\n"));
        assert!(report.text.contains("custody closed\n"));
        assert!(!report.text.contains("consume-once yes"));
        assert!(!report.text.contains("consumer deployed"));
        assert!(!report.text.contains("final true"));
        assert!(!report.text.contains("gate passed"));
    }

    #[test]
    fn a_raw_four_byte_collision_is_not_a_selector() {
        let mut facts = full();
        facts.conet_treasury_code = selector(MINT_SIG).to_vec();
        facts.base_treasury_code = selector(RELEASE_SIG).to_vec();
        facts.gb_code = selector(PAID_SIG).to_vec();
        facts.peer_code = selector(DEVELOPER_SIG).to_vec();
        let report = assess_destination(&facts);
        assert!(!report.consume_once);
        assert!(report.text.contains("aac-consume-mint no\n"));
        assert!(report.text.contains("selector-observation absent\n"));
        assert!(report.text.contains("consume-once no\n"));
    }

    #[test]
    fn missing_treasury_selectors_are_not_a_consumer() {
        let mut facts = full();
        facts.conet_treasury_code = vec![0x60, 0x00];
        facts.base_treasury_code = vec![0x60, 0x00];
        let report = assess_destination(&facts);
        assert!(!report.consume_once);
        assert!(report.text.contains("aac-consume-mint no\n"));
        assert!(report.text.contains("aac-consume-release no\n"));
        assert!(report.text.contains("consume-once no\n"));
        assert!(report.text.contains("selector-observation partial\n"));
        assert!(report.text.contains("consumer observation-only\n"));
        assert!(report.text.contains("custody closed\n"));
    }

    #[test]
    fn an_empty_peer_is_unread_and_not_once() {
        let mut facts = full();
        facts.peer_code.clear();
        let report = assess_destination(&facts);
        assert!(!report.consume_once);
        assert!(report.text.contains("aac-consume-mint-developer unread\n"));
        assert!(report.text.contains("peer-code-bytes 0\n"));
        assert!(report.text.contains("consume-once no\n"));
        assert!(report.text.contains("custody closed\n"));
    }

    #[test]
    fn a_proxy_stub_without_implementation_is_unread() {
        let mut facts = full();
        facts.conet_treasury_impl = [0u8; 20];
        facts.conet_treasury_code.clear();
        facts.base_treasury_code.clear();
        facts.gb_code.clear();
        facts.peer_code.clear();
        let report = assess_destination(&facts);
        assert!(!report.consume_once);
        assert!(report.text.contains("aac-consume-mint unread\n"));
        assert!(report.text.contains("selector-observation unread\n"));
        assert!(report.text.contains("consumer observation-only\n"));
        assert!(report.text.contains("custody closed\n"));
    }
}
