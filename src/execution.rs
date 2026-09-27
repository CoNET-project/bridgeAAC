use crate::assets::bindings;
use crate::error::Error;
use crate::finality::{AuthenticatedHeader, FinalityVerifier};
use std::time::Duration;

/// Block identity reported by an execution client.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExecBlock {
    pub number: u64,
    pub hash: [u8; 32],
    pub state_root: [u8; 32],
    pub receipts_root: [u8; 32],
}

/// Read-only view of one execution client.
pub trait ExecutionView {
    fn chain_id(&self) -> Result<u64, Error>;
    fn block_by_hash(&self, hash: &[u8; 32]) -> Result<ExecBlock, Error>;
    fn block_by_number(&self, number: u64) -> Result<ExecBlock, Error>;
    fn block_by_tag(&self, tag: &str) -> Result<ExecBlock, Error>;
}

/// Tag the execution client already exposes. This is not an OP fault proof
/// and it is not a CONET beacon signature check.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FinalityLevel {
    Safe,
    Finalized,
}

impl FinalityLevel {
    pub fn tag(self) -> &'static str {
        match self {
            FinalityLevel::Safe => "safe",
            FinalityLevel::Finalized => "finalized",
        }
    }

    pub fn parse(text: &str) -> Result<Self, Error> {
        match text {
            "safe" => Ok(FinalityLevel::Safe),
            "finalized" => Ok(FinalityLevel::Finalized),
            _ => Err(Error::BadFixture),
        }
    }
}

/// Accept `header` only when the client reports that chain, the hash is
/// canonical at its height, and that height is at or behind the configured tag.
pub fn assess(
    expected_chain_id: u64,
    header: &[u8; 32],
    level: FinalityLevel,
    api: &impl ExecutionView,
) -> Result<AuthenticatedHeader, Error> {
    let got = api.chain_id()?;
    if got != expected_chain_id {
        return Err(Error::ChainMismatch);
    }
    let block = api.block_by_hash(header)?;
    let checkpoint = api.block_by_tag(level.tag())?;
    if block.number > checkpoint.number {
        return Err(Error::UnknownHeader);
    }
    let canonical = api.block_by_number(block.number)?;
    if canonical.hash != block.hash || canonical.receipts_root != block.receipts_root {
        return Err(Error::UnknownHeader);
    }
    Ok(AuthenticatedHeader {
        chain_id: expected_chain_id,
        header_hash: block.hash,
        number: block.number,
        state_root: block.state_root,
        receipts_root: block.receipts_root,
    })
}

/// Base (chain id 8453) execution-tag verifier.
pub struct BaseFinality<A> {
    pub api: A,
    pub level: FinalityLevel,
}

impl<A: ExecutionView> FinalityVerifier for BaseFinality<A> {
    fn authenticate(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<AuthenticatedHeader, Error> {
        if chain_id != bindings::BASE_CHAIN_ID {
            return Err(Error::ChainMismatch);
        }
        assess(bindings::BASE_CHAIN_ID, header_hash, self.level, &self.api)
    }
}

/// CONET (chain id 224422) execution-tag verifier.
pub struct ConetFinality<A> {
    pub api: A,
    pub level: FinalityLevel,
}

impl<A: ExecutionView> FinalityVerifier for ConetFinality<A> {
    fn authenticate(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<AuthenticatedHeader, Error> {
        if chain_id != bindings::CONET_CHAIN_ID {
            return Err(Error::ChainMismatch);
        }
        assess(bindings::CONET_CHAIN_ID, header_hash, self.level, &self.api)
    }
}

/// JSON-RPC execution client. `eth_getBlockByHash` and `eth_getBlockByNumber` only.
#[derive(Clone, Debug)]
pub struct JsonRpcExecution {
    url: String,
}

impl JsonRpcExecution {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }

    fn call(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, Error> {
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

impl ExecutionView for JsonRpcExecution {
    fn chain_id(&self) -> Result<u64, Error> {
        let result = self.call("eth_chainId", serde_json::json!([]))?;
        parse_u64(result.as_str().ok_or(Error::Rpc)?)
    }

    fn block_by_hash(&self, hash: &[u8; 32]) -> Result<ExecBlock, Error> {
        let result = self.call(
            "eth_getBlockByHash",
            serde_json::json!([hex32(hash), false]),
        )?;
        parse_block(&result)
    }

    fn block_by_number(&self, number: u64) -> Result<ExecBlock, Error> {
        self.block_by_tag(&format!("0x{number:x}"))
    }

    fn block_by_tag(&self, tag: &str) -> Result<ExecBlock, Error> {
        let result = self.call(
            "eth_getBlockByNumber",
            serde_json::json!([tag, false]),
        )?;
        parse_block(&result)
    }
}

fn parse_block(value: &serde_json::Value) -> Result<ExecBlock, Error> {
    if value.is_null() {
        return Err(Error::UnknownHeader);
    }
    let hash = parse_hash(value.get("hash").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    let number = parse_u64(value.get("number").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    let state_root = parse_hash(value.get("stateRoot").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    let receipts_root = parse_hash(value.get("receiptsRoot").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    Ok(ExecBlock { number, hash, state_root, receipts_root })
}

fn parse_hash(text: &str) -> Result<[u8; 32], Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(raw).map_err(|_| Error::BadHex)?;
    if bytes.len() > 32 {
        return Err(Error::BadLength);
    }
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(out)
}

fn parse_u64(text: &str) -> Result<u64, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    u64::from_str_radix(raw, 16).map_err(|_| Error::BadHex)
}

fn hex32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}
