use crate::error::Error;
use std::collections::HashMap;

/// A source-chain header the destination gateway is willing to treat as final.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HeaderCommitment {
    pub chain_id: u64,
    pub header_hash: [u8; 32],
    /// Root the verifier attested for `header_hash`. Production uses the header's receipts root.
    pub state_root: [u8; 32],
}

/// Header fields that one verifier response binds to `header_hash`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AuthenticatedHeader {
    pub chain_id: u64,
    pub header_hash: [u8; 32],
    pub number: u64,
    pub state_root: [u8; 32],
    pub receipts_root: [u8; 32],
}

/// Decides whether a source header is final and which root that header commits.
///
/// A production implementation must check Base output roots or CONET consensus.
/// Returning true for every header is not an implementation of this trait.
pub trait FinalityVerifier {
    fn authenticate(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<AuthenticatedHeader, Error>;

    fn header_is_final(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<(), Error> {
        self.authenticate(chain_id, header_hash).map(|_| ())
    }
}

/// Test double. Accepts only headers explicitly registered in the test.
///
/// This is not a light client. Do not deploy it as a production verifier.
#[derive(Clone, Debug, Default)]
pub struct MockFinality {
    accepted: HashMap<(u64, [u8; 32]), [u8; 32]>,
}

impl MockFinality {
    pub fn new() -> Self {
        Self::default()
    }

    /// Attest one header hash together with the root it commits. A hash alone is not enough.
    pub fn accept(&mut self, chain_id: u64, header_hash: [u8; 32], receipts_root: [u8; 32]) {
        self.accepted.insert((chain_id, header_hash), receipts_root);
    }

    /// Drop a previously accepted header. This is the test double for a reorg.
    pub fn revoke(&mut self, chain_id: u64, header_hash: [u8; 32]) {
        self.accepted.remove(&(chain_id, header_hash));
    }
}

impl FinalityVerifier for MockFinality {
    fn authenticate(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<AuthenticatedHeader, Error> {
        let receipts_root = self
            .accepted
            .get(&(chain_id, *header_hash))
            .copied()
            .ok_or(Error::UnknownHeader)?;
        Ok(AuthenticatedHeader {
            chain_id,
            header_hash: *header_hash,
            number: 0,
            state_root: receipts_root,
            receipts_root,
        })
    }
}
