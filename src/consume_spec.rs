//! In-process specification of the UUPS consume-once consumer.
//!
//! The deployed contract is `contracts/AacConsumeOnceV1.sol`. It records a
//! consume id and does not mint or release. Storage order is the list below.
//! The reentrancy lock is transient, so it is not a layout slot. An upgrade
//! may only append after `__gap`. Selector presence is not an input.

use crate::error::Error;
use std::collections::HashMap;

/// Slot order for the first implementation. An upgrade may only append.
pub const CONSUME_LAYOUT_V1: &[&str] = &[
    "paused", "admin", "gateway", "consumed", "credits", "__gap",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConsumeRole {
    Gateway,
    Relayer,
    Admin,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProofBinding {
    pub header: [u8; 32],
    pub root: [u8; 32],
    pub leaf: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Consumed {
    binding: ProofBinding,
}

/// Reference storage. `entered` is the reentrancy lock.
#[derive(Clone, Debug)]
pub struct ConsumeSpec {
    consumed: HashMap<[u8; 32], Consumed>,
    entered: bool,
    credits: u128,
}

impl ConsumeSpec {
    pub fn new() -> Self {
        Self {
            consumed: HashMap::new(),
            entered: false,
            credits: 0,
        }
    }

    pub fn is_consumed(&self, id: &[u8; 32]) -> bool {
        self.consumed.contains_key(id)
    }

    pub fn credits(&self) -> u128 {
        self.credits
    }

    /// Consume `id` once, then run `effect`. A failed effect removes the id.
    pub fn consume<F>(
        &mut self,
        role: ConsumeRole,
        id: [u8; 32],
        binding: ProofBinding,
        effect: F,
    ) -> Result<(), Error>
    where
        F: FnOnce(&mut Self) -> Result<(), Error>,
    {
        if role != ConsumeRole::Gateway {
            return Err(Error::RejectedInput);
        }
        if binding.header == [0u8; 32] || binding.root == [0u8; 32] || binding.leaf == [0u8; 32] {
            return Err(Error::DigestMismatch);
        }
        if self.entered {
            return Err(Error::RejectedInput);
        }
        if self.consumed.contains_key(&id) {
            return Err(Error::AlreadyExists);
        }
        let credits_before = self.credits;
        self.entered = true;
        self.consumed.insert(id, Consumed { binding });
        let result = effect(self);
        self.entered = false;
        if result.is_err() {
            self.consumed.remove(&id);
            self.credits = credits_before;
        }
        result
    }
}

impl Default for ConsumeSpec {
    fn default() -> Self {
        Self::new()
    }
}

/// An upgrade must keep every existing slot in order. New slots go after them.
pub fn upgrade_appends_only(current: &[&str], next: &[&str]) -> Result<(), Error> {
    if next.len() < current.len() || next[..current.len()] != *current {
        return Err(Error::RejectedInput);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding() -> ProofBinding {
        ProofBinding {
            header: [1u8; 32],
            root: [2u8; 32],
            leaf: [3u8; 32],
        }
    }

    #[test]
    fn a_relayer_cannot_consume() {
        let mut spec = ConsumeSpec::new();
        let err = spec.consume(ConsumeRole::Relayer, [4u8; 32], binding(), |_| Ok(()));
        assert_eq!(err, Err(Error::RejectedInput));
        assert!(!spec.is_consumed(&[4u8; 32]));
    }

    #[test]
    fn reentrancy_credits_once_and_a_failed_effect_rolls_back() {
        let mut spec = ConsumeSpec::new();
        let id = [5u8; 32];
        spec.consume(ConsumeRole::Gateway, id, binding(), |spec| {
            spec.credits += 1;
            let nested = spec.consume(ConsumeRole::Gateway, id, binding(), |_| Ok(()));
            assert_eq!(nested, Err(Error::RejectedInput));
            Ok(())
        })
        .unwrap();
        assert_eq!(spec.credits(), 1);
        assert!(spec.is_consumed(&id));
        assert_eq!(
            spec.consume(ConsumeRole::Gateway, id, binding(), |_| Ok(())),
            Err(Error::AlreadyExists)
        );

        let other = [6u8; 32];
        let err = spec.consume(ConsumeRole::Gateway, other, binding(), |spec| {
            spec.credits += 1;
            Err(Error::ShortBalance)
        });
        assert_eq!(err, Err(Error::ShortBalance));
        assert!(!spec.is_consumed(&other));
        assert_eq!(spec.credits(), 1);
    }

    #[test]
    fn an_upgrade_may_append_and_may_not_reorder() {
        assert!(upgrade_appends_only(CONSUME_LAYOUT_V1, CONSUME_LAYOUT_V1).is_ok());
        let mut appended = CONSUME_LAYOUT_V1.to_vec();
        appended.push("rescue_admin");
        assert!(upgrade_appends_only(CONSUME_LAYOUT_V1, &appended).is_ok());
        let reordered = ["consumed", "paused", "admin", "__gap"];
        assert_eq!(
            upgrade_appends_only(CONSUME_LAYOUT_V1, &reordered),
            Err(Error::RejectedInput)
        );
    }
}
