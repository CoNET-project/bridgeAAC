//! Reference implementation of the Beamio Atomic Asset Container (AAC).
//!
//! Phase 0 proves the destination state machine and a sorted-pair Merkle
//! inclusion check. Header finality is a trait. [`finality::MockFinality`] is a
//! test double and is not a Base or CONET light client.

mod adapter;
mod assets;
mod error;
mod execution;
mod finality;
mod gateway;
mod hash;
mod journal;
mod merkle;
mod mpt;
mod receipt;
mod service;
mod shadow;
mod types;

pub use adapter::{
    aligned_create_address, create_address, execute_bridge_mint, plan, reject_vote, settle_report,
    settle_reserved, CallPlan, PeerCall, TestLedger,
};
pub use assets::{bindings, AssetIntent, GbPool, Settlement};
pub use error::Error;
pub use execution::{
    assess, BaseFinality, ConetFinality, ExecBlock, ExecutionView, FinalityLevel, JsonRpcExecution,
};
pub use finality::{AuthenticatedHeader, FinalityVerifier, HeaderCommitment, MockFinality};
pub use gateway::{AacRecord, Gateway};
pub use hash::keccak256;
pub use journal::{load_into, save_gateway};
pub use merkle::{build_tree, prove, verify as verify_merkle, MerkleProof, MerkleTree};
pub use mpt::{encode_consensus_receipt, prove_receipts, single_leaf_proof, verify_receipt, ConsensusLog};
pub use service::{
    absorb_ops, alerts_for, finish_cycle, load_cursor, next_cursor, plan_range, prepare_cycle, reconcile_pending,
    save_cursor, write_cycle, OpNote, PreparedCycle, ShadowCursor, LOOKBACK_BLOCKS, MAX_BLOCKS_PER_CYCLE,
    RECONCILE_LAG_BLOCKS,
};
pub use shadow::{format_observation, observe, observe_head, same_header, Observation};
pub use receipt::{build_from_fixture, format_report, BuiltProof};
pub use types::{AacId, AacState, Address, Deposit, DepositId};
