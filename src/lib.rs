//! Reference implementation of the Beamio Atomic Asset Container (AAC).
//!
//! Phase 0 proves the destination state machine and a sorted-pair Merkle
//! inclusion check. Header finality is a trait. [`finality::MockFinality`] is a
//! test double and is not a Base or CONET light client.

mod assets;
mod error;
mod finality;
mod gateway;
mod hash;
mod merkle;
mod types;

pub use assets::{bindings, AssetIntent, GbPool, Settlement};
pub use error::Error;
pub use finality::{FinalityVerifier, HeaderCommitment, MockFinality};
pub use gateway::{AacRecord, Gateway};
pub use hash::keccak256;
pub use merkle::{build_tree, prove, verify as verify_merkle, MerkleProof, MerkleTree};
pub use types::{AacId, AacState, Address, Deposit, DepositId};
