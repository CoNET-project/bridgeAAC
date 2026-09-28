//! Sync-committee aggregate check.
//!
//! This verifies that the beacon-reported committee signed the previous block
//! root. The committee itself still comes from that same beacon, so a matching
//! signature is not an independent light-client proof and does not open custody.

use crate::error::Error;
use sha2::{Digest, Sha256};

const DOMAIN_SYNC_COMMITTEE: [u8; 4] = [0x07, 0x00, 0x00, 0x00];
const DST: &[u8] = b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";

pub struct ForkVersion {
    pub previous: [u8; 4],
    pub current: [u8; 4],
    pub epoch: u64,
}

pub fn signing_root(block_root: [u8; 32], domain: [u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(block_root);
    hasher.update(domain);
    hasher.finalize().into()
}

pub fn sync_domain(fork: &ForkVersion, epoch: u64, genesis_validators_root: [u8; 32]) -> [u8; 32] {
    let version = if epoch < fork.epoch { fork.previous } else { fork.current };
    let mut left = [0u8; 32];
    left[..4].copy_from_slice(&version);
    let mut fork_data = Sha256::new();
    fork_data.update(left);
    fork_data.update(genesis_validators_root);
    let fork_root: [u8; 32] = fork_data.finalize().into();
    let mut domain = [0u8; 32];
    domain[..4].copy_from_slice(&DOMAIN_SYNC_COMMITTEE);
    domain[4..].copy_from_slice(&fork_root[..28]);
    domain
}

pub fn participating(bits: &[u8], index: usize) -> bool {
    bits.get(index / 8).is_some_and(|byte| byte & (1 << (index % 8)) != 0)
}

/// Verify the aggregate over `message` for the pubkeys selected by `bits`.
pub fn verify_participants(bits: &[u8], pubkeys: &[[u8; 48]], signature: &[u8], message: &[u8; 32]) -> Result<(), Error> {
    if pubkeys.is_empty() || bits.len() * 8 < pubkeys.len() || signature.len() != 96 {
        return Err(Error::RejectedInput);
    }
    let selected: Vec<[u8; 48]> = pubkeys
        .iter()
        .enumerate()
        .filter(|(index, _)| participating(bits, *index))
        .map(|(_, key)| *key)
        .collect();
    if selected.is_empty() {
        return Err(Error::RejectedInput);
    }
    let keys = selected
        .iter()
        .map(|bytes| blst::min_pk::PublicKey::from_bytes(bytes).map_err(|_| Error::RejectedInput))
        .collect::<Result<Vec<_>, _>>()?;
    let refs: Vec<&blst::min_pk::PublicKey> = keys.iter().collect();
    let sig = blst::min_pk::Signature::from_bytes(signature).map_err(|_| Error::RejectedInput)?;
    let err = sig.fast_aggregate_verify(true, message, DST, &refs);
    if err == blst::BLST_ERROR::BLST_SUCCESS {
        Ok(())
    } else {
        Err(Error::RejectedInput)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sync_domain_starts_with_the_sync_committee_type() {
        let domain = sync_domain(
            &ForkVersion {
                previous: [0x20, 0x00, 0x00, 0x92],
                current: [0x20, 0x00, 0x00, 0x93],
                epoch: 0,
            },
            47_981,
            [0x11; 32],
        );
        assert_eq!(&domain[..4], &DOMAIN_SYNC_COMMITTEE);
        assert_ne!(domain, [0u8; 32]);
    }

    #[test]
    fn the_first_bit_is_the_low_bit_of_the_first_byte() {
        assert!(participating(&[0x01], 0));
        assert!(!participating(&[0x01], 1));
        assert!(participating(&[0x80], 7));
    }

    #[test]
    fn an_empty_committee_is_not_a_signature() {
        let err = verify_participants(&[], &[], &[0u8; 96], &[2u8; 32]);
        assert_eq!(err, Err(Error::RejectedInput));
    }
}
