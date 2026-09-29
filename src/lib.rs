//! Reference implementation of the Beamio Atomic Asset Container (AAC).
//!
//! Phase 0 proves the destination state machine and a sorted-pair Merkle
//! inclusion check. Header finality is a trait. [`finality::MockFinality`] is a
//! test double and is not a Base or CONET light client.

mod adapter;
mod assets;
mod conet_consensus;
mod consume_spec;
mod custody_gate;
mod destination;
mod error;
mod execution;
mod finality;
mod forward_committee;
mod gateway;
mod gb_mint;
mod hash;
mod journal;
mod l1_output;
mod merkle;
mod mpt;
mod receipt;
mod service;
mod shadow;
mod ssz_state;
mod sync_aggregate;
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
pub use gb_mint::{assess_gb_mint, observe_gb_mint, GbMintFacts, GbMintReport};
pub use hash::keccak256;
pub use journal::{load_into, save_gateway};
pub use consume_spec::{upgrade_appends_only, ConsumeRole, ConsumeSpec, ProofBinding, CONSUME_LAYOUT_V1};
pub use custody_gate::{
    consume_gate_passed, mint_gate_passed, ConsumeEvidence, MintClosureEvidence,
};
pub use destination::{assess_destination, observe_destination, DestinationFacts, DestinationReport};
pub use conet_consensus::{
    assess_consensus, observe_conet_consensus, ConsensusFacts, ConsensusReport,
};
pub use forward_committee::observe_forward_committee;
pub use l1_output::{assess_anchor, observe_base_l1_output, AnchorFacts, AnchorReport};
pub use merkle::{build_tree, prove, verify as verify_merkle, MerkleProof, MerkleTree};
pub use mpt::{encode_consensus_receipt, prove_receipts, single_leaf_proof, verify_receipt, ConsensusLog};
pub use service::{
    absorb_ops, alerts_for, apply_stable, batch_for_lag, deployment_floor, drill_report, finish_cycle, load_cursor,
    max_metric, next_cursor, plan_range, prepare_cycle, prepare_cycle_with_targets, reconcile_pending, save_cursor,
    should_pause, valid_reader_set, write_cycle,
    write_page, OpNote, PreparedCycle, ShadowCursor, CATCHUP_BLOCKS, LAG_ALERT_BLOCKS, MAX_BLOCKS_PER_CYCLE,
    RECONCILE_LAG_BLOCKS, STABLE_BLOCKS,
};
pub use shadow::{
    base_quorum_report, finalized_height, format_observation, lower_finalized, observe, observe_head, observe_number,
    same_header, Observation,
};
pub use receipt::{build_from_fixture, format_report, BuiltProof};
pub use types::{AacId, AacState, Address, Deposit, DepositId};
