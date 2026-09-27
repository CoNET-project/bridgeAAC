use crate::assets::AssetIntent;
use crate::error::Error;
use crate::finality::FinalityVerifier;
use crate::merkle::{build_tree, prove, MerkleProof};
use crate::types::{Address, Deposit, DepositId};
use serde::Deserialize;

/// Inclusion proof of one lock or burn log, in the phase-0 sorted-pair format.
///
/// `header_hash` is an allowlist key. It is not evidence that the header is final.
#[derive(Clone, Debug)]
pub struct BuiltProof {
    pub deposit: Deposit,
    pub leaf: [u8; 32],
    pub chain_id: u64,
    pub header_hash: [u8; 32],
    pub state_root: [u8; 32],
    pub proof: MerkleProof,
}

#[derive(Deserialize)]
struct Fixture {
    chain_id: u64,
    header_hash: String,
    logs: Vec<LogFixture>,
}

#[derive(Deserialize)]
struct LogFixture {
    intent: String,
    source_chain_id: u64,
    destination_chain_id: u64,
    source_gateway: String,
    source_asset: String,
    destination_asset: String,
    recipient: String,
    amount: String,
    deposit_id: String,
    target_domain: String,
}

pub fn build_from_fixture(text: &str, index: usize) -> Result<BuiltProof, Error> {
    let fixture: Fixture = serde_json::from_str(text).map_err(|_| Error::BadFixture)?;
    if fixture.logs.is_empty() || index >= fixture.logs.len() {
        return Err(Error::BadIndex);
    }
    let header_hash = parse_bytes32(&fixture.header_hash)?;
    let deposits = fixture
        .logs
        .iter()
        .map(LogFixture::to_deposit)
        .collect::<Result<Vec<_>, _>>()?;
    if deposits.iter().any(|d| d.source_chain_id != fixture.chain_id) {
        return Err(Error::ChainMismatch);
    }
    let leaves: Vec<[u8; 32]> = deposits.iter().map(Deposit::leaf).collect();
    let tree = build_tree(&leaves).ok_or(Error::BadFixture)?;
    let proof = prove(&tree, index).ok_or(Error::BadIndex)?;
    let deposit = deposits[index].clone();
    Ok(BuiltProof {
        leaf: deposit.leaf(),
        chain_id: fixture.chain_id,
        header_hash,
        state_root: tree.root,
        proof,
        deposit,
    })
}

/// Render a proof. The line `final true` is included only when `verifier` accepts the header.
pub fn format_report(
    built: &BuiltProof,
    verifier: &impl FinalityVerifier,
    header_check: &str,
) -> Result<String, Error> {
    let accepted = match verifier.header_is_final(built.chain_id, &built.header_hash) {
        Ok(()) => true,
        Err(Error::UnknownHeader) => false,
        Err(other) => return Err(other),
    };
    let mut out = String::new();
    out.push_str(&format!("leaf {}\n", hex32(&built.leaf)));
    out.push_str(&format!("header_hash {}\n", hex32(&built.header_hash)));
    out.push_str(&format!("state_root {}\n", hex32(&built.state_root)));
    for sibling in &built.proof.siblings {
        out.push_str(&format!("sibling {}\n", hex32(sibling)));
    }
    out.push_str(&format!("aac_id {}\n", built.deposit.aac_id()));
    out.push_str(&format!("header-check {header_check}\n"));
    out.push_str("light-client no\n");
    if accepted {
        out.push_str("final true\n");
    } else {
        out.push_str("accepted no\n");
    }
    Ok(out)
}

impl LogFixture {
    fn to_deposit(&self) -> Result<Deposit, Error> {
        Deposit::try_new(
            parse_intent(&self.intent)?,
            self.source_chain_id,
            self.destination_chain_id,
            Address::parse(&self.source_gateway)?,
            Address::parse(&self.source_asset)?,
            Address::parse(&self.destination_asset)?,
            Address::parse(&self.recipient)?,
            parse_bytes32(&self.amount)?,
            DepositId(parse_bytes32(&self.deposit_id)?),
            parse_bytes32(&self.target_domain)?,
        )
    }
}

fn parse_intent(text: &str) -> Result<AssetIntent, Error> {
    match text {
        "usdc-lock-mint" => Ok(AssetIntent::UsdcLockMint),
        "usdc-burn-release" => Ok(AssetIntent::UsdcBurnRelease),
        "gb-paid" => Ok(AssetIntent::Gb { pool: crate::assets::GbPool::Paid }),
        "gb-free" => Ok(AssetIntent::Gb { pool: crate::assets::GbPool::Free }),
        "developer-unbound" => Ok(AssetIntent::Developer { gb_bound: false }),
        "developer-gb-bound" => Ok(AssetIntent::Developer { gb_bound: true }),
        _ => Err(Error::BadFixture),
    }
}

fn parse_bytes32(text: &str) -> Result<[u8; 32], Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(raw).map_err(|_| Error::BadHex)?;
    if bytes.len() > 32 {
        return Err(Error::BadLength);
    }
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(out)
}

fn hex32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}
