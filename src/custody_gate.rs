//! Semantic acceptance for AAC custody gates.
//!
//! Bytecode selector searches are observations. They cannot set
//! `consume-once` or `mint-closed`. A gate passes only when every listed
//! proof is present. The live observers always supply [`ConsumeEvidence::unproven`]
//! and [`MintClosureEvidence::unproven`].

/// Proofs required before a destination consumer can be treated as consume-once.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsumeEvidence {
    pub proof_bound: bool,
    pub consumed_id_stored: bool,
    pub role_separated: bool,
    pub atomic_rollback: bool,
    pub replay_rejected: bool,
    pub reentrancy_guard: bool,
    pub upgrade_layout: bool,
    pub independent_audit: bool,
}

impl ConsumeEvidence {
    pub fn unproven() -> Self {
        Self {
            proof_bound: false,
            consumed_id_stored: false,
            role_separated: false,
            atomic_rollback: false,
            replay_rejected: false,
            reentrancy_guard: false,
            upgrade_layout: false,
            independent_audit: false,
        }
    }

    /// Test double for the acceptance predicate. Not supplied by an RPC read.
    pub fn complete_for_test() -> Self {
        Self {
            proof_bound: true,
            consumed_id_stored: true,
            role_separated: true,
            atomic_rollback: true,
            replay_rejected: true,
            reentrancy_guard: true,
            upgrade_layout: true,
            independent_audit: true,
        }
    }

    pub fn proven(&self) -> bool {
        self.proof_bound
            && self.consumed_id_stored
            && self.role_separated
            && self.atomic_rollback
            && self.replay_rejected
            && self.reentrancy_guard
            && self.upgrade_layout
            && self.independent_audit
    }
}

/// Proofs required before paid-GB admin mint can be treated as closed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MintClosureEvidence {
    pub selectors_absent: bool,
    pub upgrade_authority_closed: bool,
    pub bare_admin_removed: bool,
    pub independent_audit: bool,
}

impl MintClosureEvidence {
    pub fn unproven() -> Self {
        Self {
            selectors_absent: false,
            upgrade_authority_closed: false,
            bare_admin_removed: false,
            independent_audit: false,
        }
    }

    pub fn complete_for_test() -> Self {
        Self {
            selectors_absent: true,
            upgrade_authority_closed: true,
            bare_admin_removed: true,
            independent_audit: true,
        }
    }

    pub fn proven(&self) -> bool {
        self.selectors_absent
            && self.upgrade_authority_closed
            && self.bare_admin_removed
            && self.independent_audit
    }
}

/// Selector presence is necessary and not sufficient.
pub fn consume_gate_passed(push4_selectors_present: bool, evidence: &ConsumeEvidence) -> bool {
    push4_selectors_present && evidence.proven()
}

/// Selector absence is necessary and not sufficient.
pub fn mint_gate_passed(evidence: &MintClosureEvidence) -> bool {
    evidence.proven()
}

/// Evidence required before a CoNET beacon result can participate in custody.
///
/// A matching aggregate from one operator's beacon is not an independent
/// consensus root. Forced committee updates and missing state/committee
/// bindings therefore keep this gate closed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConetFinalityEvidence {
    pub beacon_agreed: bool,
    pub genesis_pin: bool,
    pub state_root_bound: bool,
    pub committee_handoff: bool,
    pub aggregate_verified: bool,
    pub sync_quorum: bool,
    pub trusted_committee: bool,
    pub forced_updates: u64,
    pub independent_confirmations: usize,
}

impl ConetFinalityEvidence {
    pub fn unproven() -> Self {
        Self {
            beacon_agreed: false,
            genesis_pin: false,
            state_root_bound: false,
            committee_handoff: false,
            aggregate_verified: false,
            sync_quorum: false,
            trusted_committee: false,
            forced_updates: 0,
            independent_confirmations: 0,
        }
    }

    pub fn complete_for_test() -> Self {
        Self {
            beacon_agreed: true,
            genesis_pin: true,
            state_root_bound: true,
            committee_handoff: true,
            aggregate_verified: true,
            sync_quorum: true,
            trusted_committee: true,
            forced_updates: 0,
            independent_confirmations: 3,
        }
    }

    pub fn proven(&self) -> bool {
        self.beacon_agreed
            && self.genesis_pin
            && self.state_root_bound
            && self.committee_handoff
            && self.aggregate_verified
            && self.sync_quorum
            && self.trusted_committee
            && self.forced_updates == 0
            && self.independent_confirmations >= 3
    }
}

pub fn conet_finality_gate_passed(evidence: &ConetFinalityEvidence) -> bool {
    evidence.proven()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selectors_without_semantics_do_not_pass() {
        assert!(!consume_gate_passed(true, &ConsumeEvidence::unproven()));
        assert!(!mint_gate_passed(&MintClosureEvidence::unproven()));
    }

    #[test]
    fn one_missing_proof_keeps_the_gate_closed() {
        let mut evidence = ConsumeEvidence::complete_for_test();
        evidence.replay_rejected = false;
        assert!(!consume_gate_passed(true, &evidence));
        evidence.replay_rejected = true;
        evidence.independent_audit = false;
        assert!(!consume_gate_passed(true, &evidence));

        let mut mint = MintClosureEvidence::complete_for_test();
        mint.upgrade_authority_closed = false;
        assert!(!mint_gate_passed(&mint));
    }

    #[test]
    fn the_predicate_passes_only_for_a_complete_test_bundle() {
        assert!(consume_gate_passed(
            true,
            &ConsumeEvidence::complete_for_test()
        ));
        assert!(!consume_gate_passed(
            false,
            &ConsumeEvidence::complete_for_test()
        ));
        assert!(mint_gate_passed(&MintClosureEvidence::complete_for_test()));
    }

    #[test]
    fn conet_finality_requires_independent_non_forced_evidence() {
        assert!(!conet_finality_gate_passed(&ConetFinalityEvidence::unproven()));
        assert!(conet_finality_gate_passed(
            &ConetFinalityEvidence::complete_for_test()
        ));

        let mut forced = ConetFinalityEvidence::complete_for_test();
        forced.forced_updates = 1;
        assert!(!conet_finality_gate_passed(&forced));

        let mut same_operator = ConetFinalityEvidence::complete_for_test();
        same_operator.independent_confirmations = 2;
        assert!(!conet_finality_gate_passed(&same_operator));
    }
}
