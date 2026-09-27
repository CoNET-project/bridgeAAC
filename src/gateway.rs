use crate::assets::Settlement;
use crate::error::Error;
use crate::finality::{FinalityVerifier, HeaderCommitment};
use crate::merkle::{verify, MerkleProof};
use crate::types::{AacId, AacState, Deposit};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AacRecord {
    pub deposit: Deposit,
    pub leaf: [u8; 32],
    pub state: AacState,
}

/// Destination-chain AAC registry.
///
/// The source chain only locks or burns. This gateway writes the AAC and is the
/// only place `is_reserved` becomes true.
pub struct Gateway<V: FinalityVerifier> {
    verifier: V,
    records: HashMap<AacId, AacRecord>,
    paused: bool,
}

impl<V: FinalityVerifier> Gateway<V> {
    pub fn new(verifier: V) -> Self {
        Self {
            verifier,
            records: HashMap::new(),
            paused: false,
        }
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn is_reserved(&self, id: &AacId) -> bool {
        self.records.get(id).is_some_and(|r| r.state == AacState::Reserved)
    }

    pub fn get(&self, id: &AacId) -> Option<&AacRecord> {
        self.records.get(id)
    }

    pub fn submit(
        &mut self,
        deposit: Deposit,
        header: &HeaderCommitment,
        proof: &MerkleProof,
    ) -> Result<AacId, Error> {
        self.ensure_open()?;
        if header.chain_id != deposit.source_chain_id {
            return Err(Error::ChainMismatch);
        }
        self.verifier.header_is_final(header.chain_id, &header.header_hash)?;
        let leaf = deposit.leaf();
        if !verify(&header.state_root, &leaf, proof) {
            return Err(Error::MerkleMismatch);
        }
        let id = deposit.aac_id();
        if self.records.contains_key(&id) {
            return Err(Error::AlreadyExists);
        }
        self.records.insert(
            id,
            AacRecord {
                deposit,
                leaf,
                state: AacState::Verified,
            },
        );
        Ok(id)
    }

    pub fn reserve(&mut self, id: &AacId) -> Result<(), Error> {
        self.ensure_open()?;
        let record = self.records.get_mut(id).ok_or(Error::UnknownAac)?;
        if record.deposit.leaf() != record.leaf || record.deposit.aac_id() != *id {
            return Err(Error::DigestMismatch);
        }
        if record.state != AacState::Verified {
            return Err(Error::BadState);
        }
        record.state = AacState::Reserved;
        Ok(())
    }

    /// Consume a reserved AAC once. Mint and release are different terminal states.
    pub fn consume(&mut self, id: &AacId) -> Result<Settlement, Error> {
        self.ensure_open()?;
        let record = self.records.get_mut(id).ok_or(Error::UnknownAac)?;
        if record.state != AacState::Reserved {
            return Err(Error::BadState);
        }
        let settlement = record.deposit.intent.settlement();
        record.state = match settlement {
            Settlement::Mint => AacState::Minted,
            Settlement::Release => AacState::Released,
        };
        Ok(settlement)
    }

    fn ensure_open(&self) -> Result<(), Error> {
        if self.paused {
            Err(Error::Paused)
        } else {
            Ok(())
        }
    }
}
