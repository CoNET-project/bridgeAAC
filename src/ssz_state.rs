//! Deneb `BeaconState` hash tree root for the CoNET interop preset.
//!
//! A matching root means the downloaded state is the preimage of a header
//! `state_root`. The state still comes from the same beacon, so this is not
//! an independent committee trust root.

use crate::error::Error;
use sha2::{Digest, Sha256};

const SLOTS_PER_EPOCH: u64 = 32;
const SLOTS_PER_HISTORICAL_ROOT: u64 = 8192;
const EPOCHS_PER_HISTORICAL_VECTOR: u64 = 65536;
const EPOCHS_PER_SLASHINGS_VECTOR: u64 = 8192;
const ETH1_DATA_VOTES_LIMIT: u64 = 4 * SLOTS_PER_EPOCH;
const HISTORICAL_ROOTS_LIMIT: u64 = 16_777_216;
const VALIDATOR_REGISTRY_LIMIT: u64 = 1_099_511_627_776;
const SYNC_COMMITTEE_SIZE: usize = 512;
const VALIDATOR_SIZE: usize = 121;
const ETH1_DATA_SIZE: usize = 72;
const HISTORICAL_SUMMARY_SIZE: usize = 64;

enum Part {
    Fixed(usize),
    Offset,
}

fn sha_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

fn zero_hash(depth: u32) -> [u8; 32] {
    use std::sync::OnceLock;
    static ZEROS: OnceLock<Vec<[u8; 32]>> = OnceLock::new();
    let zeros = ZEROS.get_or_init(|| {
        let mut out = vec![[0u8; 32]; 64];
        for depth in 1..64 {
            out[depth] = sha_pair(&out[depth - 1], &out[depth - 1]);
        }
        out
    });
    zeros[depth as usize]
}

fn merkleize(chunks: &[[u8; 32]], limit: u64) -> [u8; 32] {
    let width = limit.max(1).next_power_of_two();
    let height = width.trailing_zeros();
    fn walk(chunks: &[[u8; 32]], start: u64, height: u32) -> [u8; 32] {
        if start >= chunks.len() as u64 {
            return zero_hash(height);
        }
        if height == 0 {
            return chunks[start as usize];
        }
        let left = walk(chunks, start, height - 1);
        let right = walk(chunks, start + (1u64 << (height - 1)), height - 1);
        sha_pair(&left, &right)
    }
    walk(chunks, 0, height)
}

fn mix_in_length(root: [u8; 32], length: u64) -> [u8; 32] {
    let mut tail = [0u8; 32];
    tail[..8].copy_from_slice(&length.to_le_bytes());
    sha_pair(&root, &tail)
}

fn pack(bytes: &[u8]) -> Vec<[u8; 32]> {
    if bytes.is_empty() {
        return Vec::new();
    }
    bytes
        .chunks(32)
        .map(|chunk| {
            let mut out = [0u8; 32];
            out[..chunk.len()].copy_from_slice(chunk);
            out
        })
        .collect()
}

fn chunk_bytes(bytes: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[..bytes.len().min(32)].copy_from_slice(&bytes[..bytes.len().min(32)]);
    out
}

fn htr_bytes(bytes: &[u8]) -> [u8; 32] {
    let chunks = pack(bytes);
    if chunks.len() <= 1 {
        chunks.first().copied().unwrap_or([0u8; 32])
    } else {
        merkleize(&chunks, chunks.len() as u64)
    }
}

fn htr_container(fields: &[[u8; 32]]) -> [u8; 32] {
    merkleize(fields, fields.len() as u64)
}

fn htr_list_basic(data: &[u8], item_size: usize, limit_items: u64) -> Result<[u8; 32], Error> {
    if item_size == 0 || data.len() % item_size != 0 {
        return Err(Error::BadLength);
    }
    let count = (data.len() / item_size) as u64;
    if count > limit_items {
        return Err(Error::BadLength);
    }
    let limit_chunks = (limit_items * item_size as u64).div_ceil(32);
    Ok(mix_in_length(merkleize(&pack(data), limit_chunks), count))
}

fn htr_vector_basic(data: &[u8], chunk_count: u64) -> [u8; 32] {
    merkleize(&pack(data), chunk_count)
}

fn split<'a>(bytes: &'a [u8], parts: &[Part]) -> Result<Vec<&'a [u8]>, Error> {
    let mut cursor = 0usize;
    let mut var_offsets = Vec::new();
    let mut fixed = Vec::new();
    for part in parts {
        match part {
            Part::Fixed(size) => {
                let end = cursor + size;
                if end > bytes.len() {
                    return Err(Error::BadLength);
                }
                fixed.push(Some(&bytes[cursor..end]));
                cursor = end;
            }
            Part::Offset => {
                if cursor + 4 > bytes.len() {
                    return Err(Error::BadLength);
                }
                let offset = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
                var_offsets.push(offset);
                fixed.push(None);
                cursor += 4;
            }
        }
    }
    if var_offsets.iter().any(|offset| *offset < cursor) {
        return Err(Error::BadLength);
    }
    var_offsets.push(bytes.len());
    for window in var_offsets.windows(2) {
        if window[0] > window[1] || window[1] > bytes.len() {
            return Err(Error::BadLength);
        }
    }
    let mut variable = 0usize;
    let mut out = Vec::with_capacity(parts.len());
    for slice in fixed {
        if let Some(slice) = slice {
            out.push(slice);
        } else {
            let start = var_offsets[variable];
            let end = var_offsets[variable + 1];
            out.push(&bytes[start..end]);
            variable += 1;
        }
    }
    Ok(out)
}

fn htr_validator(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() != VALIDATOR_SIZE {
        return Err(Error::BadLength);
    }
    let fields = [
        htr_bytes(&bytes[0..48]),
        htr_bytes(&bytes[48..80]),
        chunk_bytes(&bytes[80..88]),
        chunk_bytes(&bytes[88..89]),
        chunk_bytes(&bytes[89..97]),
        chunk_bytes(&bytes[97..105]),
        chunk_bytes(&bytes[105..113]),
        chunk_bytes(&bytes[113..121]),
    ];
    Ok(htr_container(&fields))
}

fn htr_validators(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() % VALIDATOR_SIZE != 0 {
        return Err(Error::BadLength);
    }
    let count = bytes.len() / VALIDATOR_SIZE;
    let mut roots = Vec::with_capacity(count);
    for validator in bytes.chunks(VALIDATOR_SIZE) {
        roots.push(htr_validator(validator)?);
    }
    Ok(mix_in_length(
        merkleize(&roots, VALIDATOR_REGISTRY_LIMIT),
        count as u64,
    ))
}

fn htr_sync_committee(bytes: &[u8]) -> Result<[u8; 32], Error> {
    let pubkey_bytes = SYNC_COMMITTEE_SIZE * 48;
    if bytes.len() != pubkey_bytes + 48 {
        return Err(Error::BadLength);
    }
    let mut pubkeys = Vec::with_capacity(SYNC_COMMITTEE_SIZE);
    for key in bytes[..pubkey_bytes].chunks(48) {
        pubkeys.push(htr_bytes(key));
    }
    let aggregate = htr_bytes(&bytes[pubkey_bytes..]);
    Ok(htr_container(&[
        merkleize(&pubkeys, SYNC_COMMITTEE_SIZE as u64),
        aggregate,
    ]))
}

pub fn sync_committee_pubkeys(state: &[u8]) -> Result<Vec<[u8; 48]>, Error> {
    let fields = state_fields(state)?;
    let committee = fields[22];
    let pubkey_bytes = SYNC_COMMITTEE_SIZE * 48;
    if committee.len() < pubkey_bytes {
        return Err(Error::BadLength);
    }
    let mut out = Vec::with_capacity(SYNC_COMMITTEE_SIZE);
    for key in committee[..pubkey_bytes].chunks(48) {
        let mut pubkey = [0u8; 48];
        pubkey.copy_from_slice(key);
        out.push(pubkey);
    }
    Ok(out)
}

fn htr_eth1_data(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() != ETH1_DATA_SIZE {
        return Err(Error::BadLength);
    }
    Ok(htr_container(&[
        htr_bytes(&bytes[0..32]),
        chunk_bytes(&bytes[32..40]),
        htr_bytes(&bytes[40..72]),
    ]))
}

fn htr_eth1_votes(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() % ETH1_DATA_SIZE != 0 {
        return Err(Error::BadLength);
    }
    let count = bytes.len() / ETH1_DATA_SIZE;
    let mut roots = Vec::with_capacity(count);
    for vote in bytes.chunks(ETH1_DATA_SIZE) {
        roots.push(htr_eth1_data(vote)?);
    }
    Ok(mix_in_length(
        merkleize(&roots, ETH1_DATA_VOTES_LIMIT),
        count as u64,
    ))
}

fn htr_checkpoint(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() != 40 {
        return Err(Error::BadLength);
    }
    Ok(htr_container(&[
        chunk_bytes(&bytes[0..8]),
        htr_bytes(&bytes[8..40]),
    ]))
}

fn htr_fork(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() != 16 {
        return Err(Error::BadLength);
    }
    Ok(htr_container(&[
        chunk_bytes(&bytes[0..4]),
        chunk_bytes(&bytes[4..8]),
        chunk_bytes(&bytes[8..16]),
    ]))
}

pub fn hash_beacon_header(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() != 112 {
        return Err(Error::BadLength);
    }
    Ok(htr_container(&[
        chunk_bytes(&bytes[0..8]),
        chunk_bytes(&bytes[8..16]),
        htr_bytes(&bytes[16..48]),
        htr_bytes(&bytes[48..80]),
        htr_bytes(&bytes[80..112]),
    ]))
}

fn htr_execution_payload_header(bytes: &[u8]) -> Result<[u8; 32], Error> {
    let parts = [
        Part::Fixed(32),
        Part::Fixed(20),
        Part::Fixed(32),
        Part::Fixed(32),
        Part::Fixed(256),
        Part::Fixed(32),
        Part::Fixed(8),
        Part::Fixed(8),
        Part::Fixed(8),
        Part::Fixed(8),
        Part::Offset,
        Part::Fixed(32),
        Part::Fixed(32),
        Part::Fixed(32),
        Part::Fixed(32),
        Part::Fixed(8),
        Part::Fixed(8),
    ];
    let fields = split(bytes, &parts)?;
    let extra = fields[10];
    if extra.len() > 32 {
        return Err(Error::BadLength);
    }
    let roots = [
        htr_bytes(fields[0]),
        htr_bytes(fields[1]),
        htr_bytes(fields[2]),
        htr_bytes(fields[3]),
        htr_bytes(fields[4]),
        htr_bytes(fields[5]),
        chunk_bytes(fields[6]),
        chunk_bytes(fields[7]),
        chunk_bytes(fields[8]),
        chunk_bytes(fields[9]),
        htr_list_basic(extra, 1, 32)?,
        htr_bytes(fields[11]),
        htr_bytes(fields[12]),
        htr_bytes(fields[13]),
        htr_bytes(fields[14]),
        chunk_bytes(fields[15]),
        chunk_bytes(fields[16]),
    ];
    Ok(htr_container(&roots))
}

fn htr_historical_summaries(bytes: &[u8]) -> Result<[u8; 32], Error> {
    if bytes.len() % HISTORICAL_SUMMARY_SIZE != 0 {
        return Err(Error::BadLength);
    }
    let count = bytes.len() / HISTORICAL_SUMMARY_SIZE;
    let mut roots = Vec::with_capacity(count);
    for summary in bytes.chunks(HISTORICAL_SUMMARY_SIZE) {
        roots.push(htr_container(&[
            htr_bytes(&summary[0..32]),
            htr_bytes(&summary[32..64]),
        ]));
    }
    Ok(mix_in_length(
        merkleize(&roots, HISTORICAL_ROOTS_LIMIT),
        count as u64,
    ))
}

fn htr_bytes32_list(bytes: &[u8], limit: u64) -> Result<[u8; 32], Error> {
    if bytes.len() % 32 != 0 {
        return Err(Error::BadLength);
    }
    let count = (bytes.len() / 32) as u64;
    if count > limit {
        return Err(Error::BadLength);
    }
    Ok(mix_in_length(merkleize(&pack(bytes), limit), count))
}

fn state_fields(bytes: &[u8]) -> Result<Vec<&[u8]>, Error> {
    let parts = [
        Part::Fixed(8),
        Part::Fixed(32),
        Part::Fixed(8),
        Part::Fixed(16),
        Part::Fixed(112),
        Part::Fixed((SLOTS_PER_HISTORICAL_ROOT as usize) * 32),
        Part::Fixed((SLOTS_PER_HISTORICAL_ROOT as usize) * 32),
        Part::Offset,
        Part::Fixed(ETH1_DATA_SIZE),
        Part::Offset,
        Part::Fixed(8),
        Part::Offset,
        Part::Offset,
        Part::Fixed((EPOCHS_PER_HISTORICAL_VECTOR as usize) * 32),
        Part::Fixed((EPOCHS_PER_SLASHINGS_VECTOR as usize) * 8),
        Part::Offset,
        Part::Offset,
        Part::Fixed(1),
        Part::Fixed(40),
        Part::Fixed(40),
        Part::Fixed(40),
        Part::Offset,
        Part::Fixed(SYNC_COMMITTEE_SIZE * 48 + 48),
        Part::Fixed(SYNC_COMMITTEE_SIZE * 48 + 48),
        Part::Offset,
        Part::Fixed(8),
        Part::Fixed(8),
        Part::Offset,
    ];
    split(bytes, &parts)
}

pub fn hash_beacon_state(bytes: &[u8]) -> Result<[u8; 32], Error> {
    let fields = state_fields(bytes)?;
    let roots = [
        chunk_bytes(fields[0]),
        htr_bytes(fields[1]),
        chunk_bytes(fields[2]),
        htr_fork(fields[3])?,
        hash_beacon_header(fields[4])?,
        htr_vector_basic(fields[5], SLOTS_PER_HISTORICAL_ROOT),
        htr_vector_basic(fields[6], SLOTS_PER_HISTORICAL_ROOT),
        htr_bytes32_list(fields[7], HISTORICAL_ROOTS_LIMIT)?,
        htr_eth1_data(fields[8])?,
        htr_eth1_votes(fields[9])?,
        chunk_bytes(fields[10]),
        htr_validators(fields[11])?,
        htr_list_basic(fields[12], 8, VALIDATOR_REGISTRY_LIMIT)?,
        htr_vector_basic(fields[13], EPOCHS_PER_HISTORICAL_VECTOR),
        htr_vector_basic(fields[14], EPOCHS_PER_SLASHINGS_VECTOR * 8 / 32),
        htr_list_basic(fields[15], 1, VALIDATOR_REGISTRY_LIMIT)?,
        htr_list_basic(fields[16], 1, VALIDATOR_REGISTRY_LIMIT)?,
        htr_bytes(fields[17]),
        htr_checkpoint(fields[18])?,
        htr_checkpoint(fields[19])?,
        htr_checkpoint(fields[20])?,
        htr_list_basic(fields[21], 8, VALIDATOR_REGISTRY_LIMIT)?,
        htr_sync_committee(fields[22])?,
        htr_sync_committee(fields[23])?,
        htr_execution_payload_header(fields[24])?,
        chunk_bytes(fields[25]),
        chunk_bytes(fields[26]),
        htr_historical_summaries(fields[27])?,
    ];
    Ok(htr_container(&roots))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_single_chunk_is_its_own_root() {
        let chunk = [7u8; 32];
        assert_eq!(merkleize(&[chunk], 1), chunk);
    }

    #[test]
    fn an_empty_list_mixes_the_zero_root_with_length_zero() {
        let root = mix_in_length(zero_hash(0), 0);
        assert_ne!(root, [0u8; 32]);
    }

    #[test]
    fn a_downloaded_conet_state_matches_its_header_root() {
        let path = "/tmp/conet-parent-state.ssz";
        let root_path = "/tmp/conet-parent-state-root.txt";
        if !std::path::Path::new(path).exists() {
            return;
        }
        let bytes = std::fs::read(path).unwrap();
        let expect = std::fs::read_to_string(root_path).unwrap();
        let expect = expect.lines().next().unwrap().trim().trim_start_matches("0x");
        let root = hash_beacon_state(&bytes).unwrap();
        assert_eq!(hex::encode(root), expect);
    }
}
