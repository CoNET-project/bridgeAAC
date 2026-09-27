use crate::error::Error;
use std::collections::HashSet;

/// A source-chain header the destination gateway is willing to treat as final.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HeaderCommitment {
    pub chain_id: u64,
    pub header_hash: [u8; 32],
    /// Merkle root committed by this header. Phase 0 stores the sorted-pair root here.
    pub state_root: [u8; 32],
}

/// Decides whether a source header is final.
///
/// A production implementation must check Base output roots or CONET consensus.
/// Returning true for every header is not an implementation of this trait.
pub trait FinalityVerifier {
    fn header_is_final(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<(), Error>;
}

/// Test double. Accepts only headers explicitly registered in the test.
///
/// This is not a light client. Do not deploy it as a production verifier.
#[derive(Clone, Debug, Default)]
pub struct MockFinality {
    accepted: HashSet<(u64, [u8; 32])>,
}

impl MockFinality {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn accept(&mut self, chain_id: u64, header_hash: [u8; 32]) {
        self.accepted.insert((chain_id, header_hash));
    }
}

impl FinalityVerifier for MockFinality {
    fn header_is_final(&self, chain_id: u64, header_hash: &[u8; 32]) -> Result<(), Error> {
        if self.accepted.contains(&(chain_id, *header_hash)) {
            Ok(())
        } else {
            Err(Error::UnknownHeader)
        }
    }
}
