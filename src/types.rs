use crate::assets::AssetIntent;
use crate::error::Error;
use crate::hash::keccak256;
use std::fmt;

pub const AAC_ID_TAG: &[u8] = b"beamio.bridge-aac.aac-id.v1";
pub const LEAF_TAG: &[u8] = b"beamio.bridge-aac.deposit-leaf.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Address(pub [u8; 20]);

impl Address {
    pub fn parse(text: &str) -> Result<Self, Error> {
        let raw = text.strip_prefix("0x").unwrap_or(text);
        let bytes = hex::decode(raw).map_err(|_| Error::BadHex)?;
        let arr: [u8; 20] = bytes.try_into().map_err(|_| Error::BadLength)?;
        Ok(Address(arr))
    }
}

impl fmt::Display for Address {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x{}", hex::encode(self.0))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct DepositId(pub [u8; 32]);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AacId(pub [u8; 32]);

impl fmt::Display for AacId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x{}", hex::encode(self.0))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AacState {
    Verified,
    Reserved,
    Minted,
    Released,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deposit {
    pub intent: AssetIntent,
    pub source_chain_id: u64,
    pub destination_chain_id: u64,
    pub source_gateway: Address,
    pub source_asset: Address,
    pub destination_asset: Address,
    pub recipient: Address,
    pub amount: [u8; 32],
    pub deposit_id: DepositId,
    pub target_domain: [u8; 32],
}

impl Deposit {
    pub fn try_new(
        intent: AssetIntent,
        source_chain_id: u64,
        destination_chain_id: u64,
        source_gateway: Address,
        source_asset: Address,
        destination_asset: Address,
        recipient: Address,
        amount: [u8; 32],
        deposit_id: DepositId,
        target_domain: [u8; 32],
    ) -> Result<Self, Error> {
        if !intent.is_bridgeable() {
            return Err(Error::NotBridgeable);
        }
        if source_chain_id == destination_chain_id || amount == [0u8; 32] {
            return Err(Error::NotBridgeable);
        }
        Ok(Self {
            intent,
            source_chain_id,
            destination_chain_id,
            source_gateway,
            source_asset,
            destination_asset,
            recipient,
            amount,
            deposit_id,
            target_domain,
        })
    }

    pub fn leaf(&self) -> [u8; 32] {
        let mut buf = Vec::with_capacity(256);
        buf.extend_from_slice(LEAF_TAG);
        buf.push(self.intent.kind_byte());
        buf.extend_from_slice(&self.source_chain_id.to_be_bytes());
        buf.extend_from_slice(&self.destination_chain_id.to_be_bytes());
        buf.extend_from_slice(&self.source_gateway.0);
        buf.extend_from_slice(&self.source_asset.0);
        buf.extend_from_slice(&self.destination_asset.0);
        buf.extend_from_slice(&self.recipient.0);
        buf.extend_from_slice(&self.amount);
        buf.extend_from_slice(&self.deposit_id.0);
        buf.extend_from_slice(&self.target_domain);
        keccak256(&buf)
    }

    pub fn aac_id(&self) -> AacId {
        let mut buf = Vec::with_capacity(128);
        buf.extend_from_slice(AAC_ID_TAG);
        buf.extend_from_slice(&self.source_chain_id.to_be_bytes());
        buf.extend_from_slice(&self.source_gateway.0);
        buf.extend_from_slice(&self.deposit_id.0);
        buf.extend_from_slice(&self.target_domain);
        AacId(keccak256(&buf))
    }
}
