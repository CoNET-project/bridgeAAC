//! Process-local AAC journal.
//!
//! A restart of this process keeps consumed ids. Production replay protection
//! still has to live in the destination contract; this file is not that contract.

use crate::assets::{AssetIntent, GbPool};
use crate::error::Error;
use crate::finality::FinalityVerifier;
use crate::gateway::{AacRecord, Gateway};
use crate::types::{AacState, Address, Deposit, DepositId};
use std::fs;
use std::path::Path;

pub fn save(path: &Path, records: &[AacRecord]) -> Result<(), Error> {
    let stored: Vec<Stored> = records.iter().map(Stored::from_record).collect();
    let text = serde_json::to_string_pretty(&stored).map_err(|_| Error::Journal)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|_| Error::Journal)?;
        }
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|_| Error::Journal)?;
    fs::rename(&tmp, path).map_err(|_| Error::Journal)?;
    Ok(())
}

pub fn load(path: &Path) -> Result<Vec<AacRecord>, Error> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|_| Error::Journal)?;
    let stored: Vec<Stored> = serde_json::from_str(&text).map_err(|_| Error::Journal)?;
    stored.into_iter().map(Stored::into_record).collect()
}

pub fn save_gateway<V: FinalityVerifier>(path: &Path, gateway: &Gateway<V>) -> Result<(), Error> {
    let mut records: Vec<_> = gateway.records().values().cloned().collect();
    records.sort_by_key(|record| record.deposit.aac_id().0);
    save(path, &records)
}

pub fn load_into<V: FinalityVerifier>(path: &Path, gateway: &mut Gateway<V>) -> Result<(), Error> {
    for record in load(path)? {
        gateway.insert_loaded(record)?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Stored {
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
    state: String,
    #[serde(default)]
    source_header: String,
    #[serde(default)]
    source_root: String,
}

impl Stored {
    fn from_record(record: &AacRecord) -> Self {
        let deposit = &record.deposit;
        Self {
            intent: intent_name(deposit.intent).to_string(),
            source_chain_id: deposit.source_chain_id,
            destination_chain_id: deposit.destination_chain_id,
            source_gateway: deposit.source_gateway.to_string(),
            source_asset: deposit.source_asset.to_string(),
            destination_asset: deposit.destination_asset.to_string(),
            recipient: deposit.recipient.to_string(),
            amount: hex32(&deposit.amount),
            deposit_id: hex32(&deposit.deposit_id.0),
            target_domain: hex32(&deposit.target_domain),
            state: state_name(record.state).to_string(),
            source_header: record.source_header.map(|hash| hex32(&hash)).unwrap_or_default(),
            source_root: record.source_root.map(|hash| hex32(&hash)).unwrap_or_default(),
        }
    }

    fn into_record(self) -> Result<AacRecord, Error> {
        let deposit = Deposit::try_new(
            parse_intent(&self.intent)?,
            self.source_chain_id,
            self.destination_chain_id,
            Address::parse(&self.source_gateway)?,
            Address::parse(&self.source_asset)?,
            Address::parse(&self.destination_asset)?,
            Address::parse(&self.recipient)?,
            parse32(&self.amount)?,
            DepositId(parse32(&self.deposit_id)?),
            parse32(&self.target_domain)?,
        )?;
        let leaf = deposit.leaf();
        Ok(AacRecord {
            deposit,
            leaf,
            state: parse_state(&self.state)?,
            source_header: optional32(&self.source_header)?,
            source_root: optional32(&self.source_root)?,
        })
    }
}

fn intent_name(intent: AssetIntent) -> &'static str {
    match intent {
        AssetIntent::UsdcLockMint => "usdc-lock-mint",
        AssetIntent::UsdcBurnRelease => "usdc-burn-release",
        AssetIntent::Gb { pool: GbPool::Paid } => "gb-paid",
        AssetIntent::Developer { gb_bound: false } => "developer-unbound",
        AssetIntent::Gb { pool: GbPool::Free } | AssetIntent::Developer { gb_bound: true } => "rejected",
    }
}

fn parse_intent(text: &str) -> Result<AssetIntent, Error> {
    match text {
        "usdc-lock-mint" => Ok(AssetIntent::UsdcLockMint),
        "usdc-burn-release" => Ok(AssetIntent::UsdcBurnRelease),
        "gb-paid" => Ok(AssetIntent::Gb { pool: GbPool::Paid }),
        "developer-unbound" => Ok(AssetIntent::Developer { gb_bound: false }),
        _ => Err(Error::Journal),
    }
}

fn state_name(state: AacState) -> &'static str {
    match state {
        AacState::Verified => "verified",
        AacState::Reserved => "reserved",
        AacState::Minted => "minted",
        AacState::Released => "released",
    }
}

fn parse_state(text: &str) -> Result<AacState, Error> {
    match text {
        "verified" => Ok(AacState::Verified),
        "reserved" => Ok(AacState::Reserved),
        "minted" => Ok(AacState::Minted),
        "released" => Ok(AacState::Released),
        _ => Err(Error::Journal),
    }
}

fn hex32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn parse32(text: &str) -> Result<[u8; 32], Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(raw).map_err(|_| Error::Journal)?;
    if bytes.len() > 32 {
        return Err(Error::Journal);
    }
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(out)
}

fn optional32(text: &str) -> Result<Option<[u8; 32]>, Error> {
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(parse32(text)?))
    }
}
