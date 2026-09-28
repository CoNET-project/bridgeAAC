//! Read-only shadow observer.
//!
//! It agrees a header across more than one execution client, proves one real
//! receipt under that header's receipts root, and writes a decision. It does
//! not broadcast, mint, or release.

use crate::assets::bindings;
use crate::error::Error;
use crate::finality::AuthenticatedHeader;
use crate::hash::keccak256;
use crate::mpt::{encode_consensus_receipt, prove_receipts, verify_receipt, ConsensusLog};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

pub fn same_header(headers: &[AuthenticatedHeader]) -> Result<AuthenticatedHeader, Error> {
    if headers.len() < 2 {
        return Err(Error::BadFixture);
    }
    let first = headers[0];
    for header in &headers[1..] {
        if header.chain_id != first.chain_id
            || header.header_hash != first.header_hash
            || header.number != first.number
            || header.receipts_root != first.receipts_root
            || header.state_root != first.state_root
        {
            return Err(Error::Quorum);
        }
    }
    Ok(first)
}

pub fn observe_head(chain: &str, rpcs: &[String], journal: Option<&Path>) -> Result<String, Error> {
    if rpcs.len() < 2 {
        return Err(Error::BadFixture);
    }
    let chain_id = match chain {
        "base" => bindings::BASE_CHAIN_ID,
        "conet" => bindings::CONET_CHAIN_ID,
        _ => return Err(Error::BadFixture),
    };
    let mut headers = Vec::with_capacity(rpcs.len());
    for rpc in rpcs {
        headers.push(finalized_header(rpc, chain_id)?);
    }
    let agreed = same_header(&headers)?;
    let block = agreed_block(rpcs, &agreed.header_hash, chain_id, agreed.number)?;
    observe_agreed(chain, chain_id, block, &fetched_for(rpcs, &block)?, journal)
}

pub fn observe_number(chain: &str, rpcs: &[String], number: u64, journal: Option<&Path>) -> Result<String, Error> {
    let ceiling = reader_heights(chain, rpcs)?.lower;
    observe_below(chain, rpcs, number, ceiling, journal)
}

pub fn observe_below(
    chain: &str,
    rpcs: &[String],
    number: u64,
    ceiling: u64,
    journal: Option<&Path>,
) -> Result<String, Error> {
    if rpcs.len() < 2 {
        return Err(Error::BadFixture);
    }
    let chain_id = match chain {
        "base" => bindings::BASE_CHAIN_ID,
        "conet" => bindings::CONET_CHAIN_ID,
        _ => return Err(Error::BadFixture),
    };
    if number > ceiling {
        return Err(Error::UnknownHeader);
    }
    let mut headers = Vec::new();
    for rpc in rpcs {
        headers.push(header_by_number(rpc, chain_id, number)?);
    }
    let block = same_header(&headers)?;
    observe_agreed(chain, chain_id, block, &fetched_for(rpcs, &block)?, journal)
}

pub struct ReaderHeights {
    pub lower: u64,
    pub higher: u64,
}

pub fn reader_heights(chain: &str, rpcs: &[String]) -> Result<ReaderHeights, Error> {
    if rpcs.len() < 2 {
        return Err(Error::BadFixture);
    }
    let chain_id = match chain {
        "base" => bindings::BASE_CHAIN_ID,
        "conet" => bindings::CONET_CHAIN_ID,
        _ => return Err(Error::BadFixture),
    };
    let mut heights = Vec::new();
    for rpc in rpcs {
        heights.push(finalized_header(rpc, chain_id)?.number);
    }
    Ok(ReaderHeights {
        lower: heights.iter().copied().min().ok_or(Error::Rpc)?,
        higher: heights.iter().copied().max().ok_or(Error::Rpc)?,
    })
}

pub fn finalized_height(chain: &str, rpcs: &[String]) -> Result<u64, Error> {
    Ok(reader_heights(chain, rpcs)?.lower)
}

pub fn lower_finalized(heights: &[u64]) -> Option<u64> {
    heights.iter().copied().min()
}

/// Produce a machine-readable, read-only Base quorum report.
///
/// The reader ceiling is the lower execution-client `finalized` height.
/// Every checked height must agree on the block hash, state root, and
/// receipts root. This is deliberately not a consensus or Ethereum-L1 proof.
pub fn base_quorum_report(
    rpcs: &[String],
    from: Option<u64>,
    blocks: u64,
) -> Result<String, Error> {
    if rpcs.len() < 2 || blocks == 0 {
        return Err(Error::BadFixture);
    }
    let unique = rpcs.iter().collect::<std::collections::HashSet<_>>();
    if unique.len() != rpcs.len() {
        return Err(Error::BadFixture);
    }
    let chain_id = bindings::BASE_CHAIN_ID;
    let mut tips = Vec::with_capacity(rpcs.len());
    for rpc in rpcs {
        tips.push(finalized_header(rpc, chain_id)?);
    }
    let lower = tips.iter().map(|header| header.number).min().ok_or(Error::Rpc)?;
    let higher = tips.iter().map(|header| header.number).max().ok_or(Error::Rpc)?;
    let start = from.unwrap_or(lower);
    let end = start.checked_add(blocks - 1).ok_or(Error::BadFixture)?;
    if start == 0 || end > lower {
        return Err(Error::UnknownHeader);
    }
    let mut checked = 0u64;
    for number in start..=end {
        let mut headers = Vec::with_capacity(rpcs.len());
        for rpc in rpcs {
            headers.push(header_by_number(rpc, chain_id, number)?);
        }
        same_header(&headers)?;
        checked += 1;
    }
    Ok(format!(
        "quorum yes\nchain base\nchain-id {chain_id}\nreader-count {}\n\
         lower-finalized {lower}\nhigher-finalized {higher}\nreader-lag {}\n\
         checked-from {start}\nchecked-to {end}\nblocks-checked {checked}\n\
         hash-match yes\nstate-root-match yes\nreceipts-root-match yes\n\
         execution-tag yes\nlight-client no\ncustody closed\n",
        rpcs.len(),
        higher.saturating_sub(lower),
    ))
}

fn fetched_for(rpcs: &[String], block: &AuthenticatedHeader) -> Result<Fetched, Error> {
    fetch_receipts(&rpcs[0], &block.header_hash).or_else(|_| fetch_receipts(&rpcs[1], &block.header_hash))
}

fn observe_agreed(
    chain: &str,
    chain_id: u64,
    block: AuthenticatedHeader,
    fetched: &Fetched,
    journal: Option<&Path>,
) -> Result<String, Error> {
    if fetched.encoded.is_empty() {
        return Ok(if block.receipts_root == EMPTY_RECEIPTS_ROOT {
            heartbeat(chain, &block)
        } else {
            rejected(&format!(
                "header_hash 0x{}\nreceipts-root 0x{}\nquorum yes\ninclusion no\nroot-match no\n",
                hex::encode(block.header_hash),
                hex::encode(block.receipts_root)
            ))
        });
    }
    let (root, _) = prove_receipts(&fetched.encoded, 0)?;
    if root != block.receipts_root {
        return Ok(rejected(&format!(
            "header_hash 0x{}\nreceipts-root 0x{}\nquorum yes\ninclusion no\nroot-match no\n",
            hex::encode(block.header_hash),
            hex::encode(block.receipts_root)
        )));
    }
    let mut reports = String::new();
    for index in 0..fetched.encoded.len() {
        let decision = describe_logs(&fetched.logs[index]);
        if !decision.gateway_match {
            continue;
        }
        let (_, proof) = prove_receipts(&fetched.encoded, index)?;
        let included = verify_receipt(&block.receipts_root, index as u64, &fetched.encoded[index], &proof).is_ok();
        let key = format!("{}:{}:{index}", chain_id, hex::encode(block.header_hash));
        let duplicate = match journal {
            Some(path) if included && fetched.status_ok[index] => mark_seen(path, &key)?,
            _ => false,
        };
        reports.push_str(&format_observation(
            chain,
            &block,
            index,
            &Observation {
                included,
                status_ok: fetched.status_ok[index],
                gateway_match: true,
                events: decision.lines,
                duplicate,
            },
        ));
    }
    if reports.is_empty() {
        Ok(heartbeat(chain, &block))
    } else {
        Ok(reports)
    }
}

fn heartbeat(chain: &str, block: &AuthenticatedHeader) -> String {
    format!(
        "shadow yes\nbroadcast no\nsettled no\ncustody closed\nlight-client no\nheader-check execution-tag\nregistry paused\nconsume denied\nchain {chain}\nblock-number {}\nheader_hash 0x{}\nreceipts-root 0x{}\ninclusion yes\nbridge-log no\ndecision none\nheartbeat yes\nexecution-tag yes\n",
        block.number,
        hex::encode(block.header_hash),
        hex::encode(block.receipts_root)
    )
}

const EMPTY_RECEIPTS_ROOT: [u8; 32] = [
    0x56, 0xe8, 0x1f, 0x17, 0x1b, 0xcc, 0x55, 0xa6, 0xff, 0x83, 0x45, 0xe6, 0x92, 0xc0, 0xf8, 0x6e, 0x5b, 0x48,
    0xe0, 0x1b, 0x99, 0x6c, 0xad, 0xc0, 0x01, 0x62, 0x2f, 0xb5, 0xe3, 0x63, 0xb4, 0x21,
];

pub fn observe(chain: &str, rpcs: &[String], tx: Option<&str>, journal: Option<&Path>) -> Result<String, Error> {
    if rpcs.len() < 2 {
        return Err(Error::BadFixture);
    }
    let chain_id = match chain {
        "base" => bindings::BASE_CHAIN_ID,
        "conet" => bindings::CONET_CHAIN_ID,
        _ => return Err(Error::BadFixture),
    };
    let mut last_quorum = false;
    for attempt in 0..3 {
        match observe_once(chain, chain_id, rpcs, tx, journal) {
            Ok(report) => return Ok(report),
            Err(Error::Quorum) => {
                last_quorum = true;
                if attempt + 1 < 3 {
                    thread::sleep(Duration::from_secs(1));
                }
            }
            Err(other) => return Err(other),
        }
    }
    if last_quorum {
        return Ok(rejected("quorum no\n"));
    }
    Err(Error::Rpc)
}

fn observe_once(
    chain: &str,
    chain_id: u64,
    rpcs: &[String],
    tx: Option<&str>,
    journal: Option<&Path>,
) -> Result<String, Error> {
    let mut headers = Vec::with_capacity(rpcs.len());
    for rpc in rpcs {
        headers.push(finalized_header(rpc, chain_id)?);
    }
    let agreed = same_header(&headers)?;
    let (block_hash, index) = match tx {
        Some(hash) => locate_tx(rpcs, hash, &agreed)?,
        None => (agreed.header_hash, 0usize),
    };
    let block = agreed_block(rpcs, &block_hash, chain_id, agreed.number)?;
    let fetched = fetch_receipts(&rpcs[0], &block.header_hash).or_else(|_| fetch_receipts(&rpcs[1], &block.header_hash))?;
    if fetched.encoded.is_empty() || index >= fetched.encoded.len() {
        return Ok(rejected(&format!(
            "header_hash 0x{}\nreceipts-root 0x{}\nquorum yes\ninclusion no\nbridge-log no\ndecision none\n",
            hex::encode(block.header_hash),
            hex::encode(block.receipts_root)
        )));
    }
    let (root, proof) = prove_receipts(&fetched.encoded, index)?;
    let included = root == block.receipts_root
        && verify_receipt(&block.receipts_root, index as u64, &fetched.encoded[index], &proof).is_ok();
    let status_ok = fetched.status_ok[index];
    let decision = describe_logs(&fetched.logs[index]);
    let authorized = included && status_ok && decision.gateway_match;
    let key = format!("{}:{}:{index}", chain_id, hex::encode(block.header_hash));
    let duplicate = match journal {
        Some(path) if authorized => mark_seen(path, &key)?,
        _ => false,
    };
    Ok(format_observation(
        chain,
        &block,
        index,
        &Observation {
            included,
            status_ok,
            gateway_match: decision.gateway_match,
            events: decision.lines,
            duplicate,
        },
    ))
}

pub struct Observation {
    pub included: bool,
    pub status_ok: bool,
    pub gateway_match: bool,
    pub events: Vec<String>,
    pub duplicate: bool,
}

pub fn format_observation(
    chain: &str,
    block: &AuthenticatedHeader,
    index: usize,
    observation: &Observation,
) -> String {
    let mut out = format!(
        "shadow yes\nbroadcast no\nsettled no\ncustody closed\nlight-client no\nheader-check execution-tag\nregistry paused\nconsume denied\nchain {chain}\nheader_hash 0x{}\nreceipts-root 0x{}\nstate-root 0x{}\nreceipt-index {index}\nquorum yes\ninclusion {}\nreceipt-status {}\n",
        hex::encode(block.header_hash),
        hex::encode(block.receipts_root),
        hex::encode(block.state_root),
        if observation.included { "yes" } else { "no" },
        if observation.status_ok { "ok" } else { "failed" }
    );
    let authorized = observation.included && observation.status_ok && observation.gateway_match;
    if authorized {
        out.push_str("gateway-match yes\nbridge-log yes\ndecision observe\nsettle-now no\nminer-vote live\n");
        for event in &observation.events {
            out.push_str(event);
        }
    } else if observation.gateway_match {
        out.push_str("gateway-match yes\ndecision none\n");
    } else if observation.events.is_empty() {
        out.push_str("bridge-log no\ngateway-match no\ndecision none\n");
    } else {
        out.push_str("gateway-match no\ndecision none\n");
    }
    if observation.duplicate {
        out.push_str("duplicate yes\n");
    }
    if authorized {
        out.push_str("execution-tag yes\n");
    } else {
        if !observation.included {
            out.push_str("root-match no\n");
        }
        out.push_str("accepted no\n");
    }
    out
}

fn rejected(detail: &str) -> String {
    format!("shadow yes\nbroadcast no\nsettled no\ncustody closed\nlight-client no\nheader-check execution-tag\nregistry paused\nconsume denied\n{detail}accepted no\n")
}

fn finalized_header(rpc: &str, chain_id: u64) -> Result<AuthenticatedHeader, Error> {
    let got = parse_u64(rpc_call(rpc, "eth_chainId", serde_json::json!([]))?.as_str().ok_or(Error::Rpc)?)?;
    if got != chain_id {
        return Err(Error::ChainMismatch);
    }
    parse_header(chain_id, &rpc_call(rpc, "eth_getBlockByNumber", serde_json::json!(["finalized", false]))?)
}

fn header_by_number(rpc: &str, chain_id: u64, number: u64) -> Result<AuthenticatedHeader, Error> {
    parse_header(
        chain_id,
        &rpc_call(rpc, "eth_getBlockByNumber", serde_json::json!([format!("0x{number:x}"), false]))?,
    )
}

fn locate_tx(rpcs: &[String], tx: &str, agreed: &AuthenticatedHeader) -> Result<([u8; 32], usize), Error> {
    let mut found = Vec::new();
    for rpc in rpcs {
        let value = rpc_call(rpc, "eth_getTransactionByHash", serde_json::json!([tx]))?;
        if value.is_null() {
            return Err(Error::UnknownHeader);
        }
        let hash = parse_hash(value.get("blockHash").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
        let index = parse_u64(value.get("transactionIndex").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)? as usize;
        found.push((hash, index));
    }
    if found.iter().any(|item| *item != found[0]) {
        return Err(Error::Quorum);
    }
    let number = parse_u64(
        rpc_call(&rpcs[0], "eth_getBlockByHash", serde_json::json!([hex32(&found[0].0), false]))?
            .get("number")
            .and_then(|v| v.as_str())
            .ok_or(Error::Rpc)?,
    )?;
    if number > agreed.number {
        return Err(Error::UnknownHeader);
    }
    Ok(found[0])
}

fn agreed_block(rpcs: &[String], hash: &[u8; 32], chain_id: u64, finalized_number: u64) -> Result<AuthenticatedHeader, Error> {
    let mut headers = Vec::new();
    for rpc in rpcs {
        let header = parse_header(chain_id, &rpc_call(rpc, "eth_getBlockByHash", serde_json::json!([hex32(hash), false]))?)?;
        if header.number > finalized_number {
            return Err(Error::UnknownHeader);
        }
        headers.push(header);
    }
    same_header(&headers)
}

struct Fetched {
    encoded: Vec<Vec<u8>>,
    logs: Vec<Vec<Value>>,
    status_ok: Vec<bool>,
}

fn fetch_receipts(rpc: &str, hash: &[u8; 32]) -> Result<Fetched, Error> {
    let value = rpc_call(rpc, "eth_getBlockReceipts", serde_json::json!([hex32(hash)]))?;
    let list = value.as_array().ok_or(Error::Rpc)?;
    let mut encoded = Vec::with_capacity(list.len());
    let mut logs = Vec::with_capacity(list.len());
    let mut status_ok = Vec::with_capacity(list.len());
    for receipt in list {
        let parsed = encode_json_receipt(receipt)?;
        encoded.push(parsed.0);
        status_ok.push(parsed.1);
        logs.push(receipt.get("logs").and_then(|v| v.as_array()).cloned().unwrap_or_default());
    }
    Ok(Fetched { encoded, logs, status_ok })
}

fn encode_json_receipt(receipt: &Value) -> Result<(Vec<u8>, bool), Error> {
    let tx_type = match receipt.get("type").and_then(|v| v.as_str()) {
        Some(text) => parse_u64(text)? as u8,
        None => 0,
    };
    let status_ok = parse_u64(receipt.get("status").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)? == 1;
    let cumulative = parse_u64(receipt.get("cumulativeGasUsed").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    let bloom_bytes = decode_hex(receipt.get("logsBloom").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
    if bloom_bytes.len() != 256 {
        return Err(Error::BadLength);
    }
    let mut bloom = [0u8; 256];
    bloom.copy_from_slice(&bloom_bytes);
    let mut logs = Vec::new();
    for log in receipt.get("logs").and_then(|v| v.as_array()).ok_or(Error::Rpc)? {
        if log.get("removed").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        let address = decode_hex(log.get("address").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?;
        if address.len() != 20 {
            return Err(Error::BadLength);
        }
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&address);
        let mut topics = Vec::new();
        for topic in log.get("topics").and_then(|v| v.as_array()).ok_or(Error::Rpc)? {
            let bytes = decode_hex(topic.as_str().ok_or(Error::Rpc)?)?;
            if bytes.len() != 32 {
                return Err(Error::BadLength);
            }
            let mut out = [0u8; 32];
            out.copy_from_slice(&bytes);
            topics.push(out);
        }
        logs.push(ConsensusLog {
            address: addr,
            topics,
            data: decode_hex(log.get("data").and_then(|v| v.as_str()).unwrap_or("0x"))?,
        });
    }
    let deposit = if tx_type == 0x7e {
        match (
            receipt.get("depositNonce").and_then(Value::as_str),
            receipt.get("depositReceiptVersion").and_then(Value::as_str),
        ) {
            (Some(nonce), Some(version)) => Some((parse_u64(nonce)?, parse_u64(version)?)),
            (None, None) => None,
            _ => return Err(Error::Rpc),
        }
    } else {
        None
    };
    Ok((encode_consensus_receipt(tx_type, status_ok, cumulative, &bloom, &logs, deposit), status_ok))
}

struct LogDecision {
    lines: Vec<String>,
    gateway_match: bool,
}

fn describe_logs(logs: &[Value]) -> LogDecision {
    let bridge = keccak256(b"BridgeOperation(bytes32,uint256,uint256,uint8,uint8,address,address,address,address,address[],uint256[],uint256,uint256,uint256,bytes32,uint256,address)");
    let out_topic = keccak256(b"BridgeOut(address,address,uint256,uint256,uint256,uint256)");
    let treasury = bindings::treasury_v3().0;
    let gb = bindings::gb_token().0;
    let mut lines = Vec::new();
    let mut gateway_match = false;
    for log in logs {
        let topics = log.get("topics").and_then(|v| v.as_array());
        let Some(topics) = topics else { continue };
        let Some(topic0) = topics.first().and_then(|v| v.as_str()).and_then(|text| parse_hash(text).ok()) else { continue };
        let Some(address) = log.get("address").and_then(|v| v.as_str()).and_then(|text| parse_address(text)) else { continue };
        let allowed = (topic0 == bridge && address == treasury) || (topic0 == out_topic && address == gb);
        if !allowed {
            continue;
        }
        gateway_match = true;
        if topic0 == bridge {
            let data = decode_hex(log.get("data").and_then(|v| v.as_str()).unwrap_or("0x")).unwrap_or_default();
            let mode = word(&data, 1);
            let phase = word(&data, 0);
            let would = match mode {
                1 => "aacConsumeMint",
                2 => "aacConsumeRelease",
                _ => "none",
            };
            lines.push(format!(
                "event BridgeOperation\ncontract 0x{}\ngateway-match yes\noperation-id {}\nsource-chain {}\ndestination-chain {}\nphase {}\nmode {}\nwould-fn {would}\n",
                hex::encode(address),
                topics.get(1).and_then(|v| v.as_str()).unwrap_or("0x"),
                topics.get(2).and_then(|v| v.as_str()).unwrap_or("0x"),
                topics.get(3).and_then(|v| v.as_str()).unwrap_or("0x"),
                phase_name(phase),
                mode_name(mode)
            ));
        } else if topic0 == out_topic {
            lines.push(format!(
                "event BridgeOut\ncontract 0x{}\ngateway-match yes\nwould-fn executeBridgeMint\n",
                hex::encode(address)
            ));
        }
    }
    LogDecision { lines, gateway_match }
}

fn phase_name(phase: u64) -> &'static str {
    match phase {
        0 => "initiated",
        1 => "executed",
        2 => "cancelled",
        _ => "unknown",
    }
}

fn mode_name(mode: u64) -> &'static str {
    match mode {
        0 => "burn-mint",
        1 => "lock-mint",
        2 => "burn-release",
        _ => "unknown",
    }
}

fn word(data: &[u8], index: usize) -> u64 {
    let start = index * 32;
    if data.len() < start + 32 {
        return u64::MAX;
    }
    let mut value = 0u64;
    for byte in &data[start + 24..start + 32] {
        value = (value << 8) | *byte as u64;
    }
    value
}

fn mark_seen(path: &Path, key: &str) -> Result<bool, Error> {
    let mut seen = if path.exists() {
        let text = fs::read_to_string(path).map_err(|_| Error::Journal)?;
        serde_json::from_str::<Vec<String>>(&text).map_err(|_| Error::Journal)?
    } else {
        Vec::new()
    };
    if seen.iter().any(|item| item == key) {
        return Ok(true);
    }
    seen.push(key.to_string());
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string(&seen).map_err(|_| Error::Journal)?).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, path).map_err(|_| Error::Journal)?;
    Ok(false)
}

fn parse_address(text: &str) -> Option<[u8; 20]> {
    let bytes = decode_hex(text).ok()?;
    if bytes.len() != 20 {
        return None;
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn parse_header(chain_id: u64, value: &Value) -> Result<AuthenticatedHeader, Error> {
    if value.is_null() {
        return Err(Error::UnknownHeader);
    }
    Ok(AuthenticatedHeader {
        chain_id,
        header_hash: parse_hash(value.get("hash").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?,
        number: parse_u64(value.get("number").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?,
        state_root: parse_hash(value.get("stateRoot").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?,
        receipts_root: parse_hash(value.get("receiptsRoot").and_then(|v| v.as_str()).ok_or(Error::Rpc)?)?,
    })
}

fn rpc_call(url: &str, method: &str, params: Value) -> Result<Value, Error> {
    let response = ureq::post(url)
        .timeout(Duration::from_secs(30))
        .set("content-type", "application/json")
        .send_json(serde_json::json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
        .map_err(|_| Error::Rpc)?;
    let body: Value = response.into_json().map_err(|_| Error::Rpc)?;
    if body.get("error").is_some() {
        return Err(Error::Rpc);
    }
    Ok(body.get("result").cloned().unwrap_or(Value::Null))
}

fn parse_hash(text: &str) -> Result<[u8; 32], Error> {
    let bytes = decode_hex(text)?;
    if bytes.len() > 32 {
        return Err(Error::BadLength);
    }
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(out)
}

fn parse_u64(text: &str) -> Result<u64, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    if raw.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(raw, 16).map_err(|_| Error::BadHex)
}

fn decode_hex(text: &str) -> Result<Vec<u8>, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(raw).map_err(|_| Error::BadHex)
}

fn hex32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}
