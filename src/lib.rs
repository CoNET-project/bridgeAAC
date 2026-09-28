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
    absorb_ops, alerts_for, apply_stable, batch_for_lag, deployment_floor, drill_report, finish_cycle, load_cursor,
    max_metric, next_cursor, plan_range, prepare_cycle, reconcile_pending, save_cursor, should_pause, write_cycle,
    write_page, OpNote, PreparedCycle, ShadowCursor, CATCHUP_BLOCKS, LAG_ALERT_BLOCKS, MAX_BLOCKS_PER_CYCLE,
    RECONCILE_LAG_BLOCKS, STABLE_BLOCKS,
};
pub use shadow::{
    finalized_height, format_observation, lower_finalized, observe, observe_head, observe_number, same_header, Observation,
};
pub use receipt::{build_from_fixture, format_report, BuiltProof};
pub use types::{AacId, AacState, Address, Deposit, DepositId};
