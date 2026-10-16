//! Base output-root binding for the L1 anchor path.
//!
//! The anchored dispute game commits to an Optimism output root:
//! `keccak256(abi.encode(bytes32(0), stateRoot, messagePasserStorageRoot, blockHash))`.
//! This is the same check as `AacBaseOutputRootProof.sol`, done off-chain. The
//! header is rebuilt from the execution client's block and must hash to the
//! requested block hash. The storage root comes from an account proof of the
//! L2-to-L1 message passer under that header's state root. A block whose
//! header does not satisfy this binding is never accepted.

use crate::error::Error;
use crate::hash::keccak256;
use crate::mpt;
use serde_json::Value;

/// Field kinds of an execution-client block, as they appear in the header RLP.
#[derive(Clone, Copy)]
enum Kind {
    /// 32-byte hash, always encoded in full.
    Hash,
    /// 20-byte address.
    Address,
    /// 256-byte bloom filter.
    Bloom,
    /// 8-byte nonce, encoded in full (leading zeros kept).
    Nonce,
    /// Big-endian integer with leading zero bytes stripped.
    Quantity,
    /// Variable-length byte string.
    Bytes,
}

/// Header fields in the order the execution client RLP-encodes them. `true`
/// marks a field that is always present. Optional fields follow a fork and
/// must not have a gap: a later field cannot appear after an absent one.
const HEADER_FIELDS: &[(&str, Kind, bool)] = &[
    ("parentHash", Kind::Hash, true),
    ("sha3Uncles", Kind::Hash, true),
    ("miner", Kind::Address, true),
    ("stateRoot", Kind::Hash, true),
    ("transactionsRoot", Kind::Hash, true),
    ("receiptsRoot", Kind::Hash, true),
    ("logsBloom", Kind::Bloom, true),
    ("difficulty", Kind::Quantity, true),
    ("number", Kind::Quantity, true),
    ("gasLimit", Kind::Quantity, true),
    ("gasUsed", Kind::Quantity, true),
    ("timestamp", Kind::Quantity, true),
    ("extraData", Kind::Bytes, true),
    ("mixHash", Kind::Hash, true),
    ("nonce", Kind::Nonce, true),
    ("baseFeePerGas", Kind::Quantity, false),
    ("withdrawalsRoot", Kind::Hash, false),
    ("blobGasUsed", Kind::Quantity, false),
    ("excessBlobGas", Kind::Quantity, false),
    ("parentBeaconBlockRoot", Kind::Hash, false),
    ("requestsHash", Kind::Hash, false),
];

/// Rebuild the RLP header of an execution-client block. The caller must check
/// `keccak256(result) == block hash`: a missing or wrong field then fails closed.
pub(crate) fn header_rlp(block: &Value) -> Result<Vec<u8>, Error> {
    let mut items = Vec::with_capacity(HEADER_FIELDS.len());
    let mut gap = false;
    for (name, kind, required) in HEADER_FIELDS {
        match block.get(*name).filter(|value| !value.is_null()) {
            Some(value) => {
                if gap {
                    return Err(Error::Rpc);
                }
                let text = value.as_str().ok_or(Error::Rpc)?;
                items.push(mpt::rlp_bytes(&field_bytes(text, *kind)?));
            }
            None if *required => return Err(Error::Rpc),
            None => gap = true,
        }
    }
    Ok(mpt::rlp_list_raw(&items))
}

/// Block number (`number`) of an execution-client block.
pub(crate) fn header_number(block: &Value) -> Result<u64, Error> {
    let raw = quantity_bytes(block.get("number").and_then(Value::as_str).ok_or(Error::Rpc)?)?;
    if raw.len() > 8 {
        return Err(Error::Rpc);
    }
    Ok(raw.iter().fold(0u64, |acc, byte| (acc << 8) | *byte as u64))
}

/// A 32-byte field such as `stateRoot` or `receiptsRoot`.
pub(crate) fn header_hash_field(block: &Value, name: &str) -> Result<[u8; 32], Error> {
    let text = block.get(name).and_then(Value::as_str).ok_or(Error::Rpc)?;
    fixed::<32>(&hex_bytes(text)?)
}

/// Output root `keccak256(abi.encode(bytes32(0), stateRoot, storageRoot, blockHash))`.
pub(crate) fn output_root(state_root: &[u8; 32], storage_root: &[u8; 32], block_hash: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 128];
    buf[32..64].copy_from_slice(state_root);
    buf[64..96].copy_from_slice(storage_root);
    buf[96..128].copy_from_slice(block_hash);
    keccak256(&buf)
}

/// Check `claimed` against the output root of the block `block_hash` with
/// state root `state_root`. `account_proof` must open `account` under that
/// state root, and its storage root feeds the output root.
pub(crate) fn verify_output_binding(
    account: &[u8; 20],
    block_hash: &[u8; 32],
    state_root: &[u8; 32],
    account_proof: &[Vec<u8>],
    claimed: &[u8; 32],
) -> Result<(), Error> {
    let account_rlp = mpt::verify_key(state_root, &keccak256(account), account_proof)?;
    let storage_root = mpt::account_storage_root(&account_rlp)?;
    if &output_root(state_root, &storage_root, block_hash) != claimed {
        return Err(Error::DigestMismatch);
    }
    Ok(())
}

/// Decode a `0x`-prefixed hex string. An odd number of digits is accepted.
pub(crate) fn hex_bytes(text: &str) -> Result<Vec<u8>, Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    let decoded = if raw.len() % 2 == 1 {
        hex::decode(format!("0{raw}"))
    } else {
        hex::decode(raw)
    };
    decoded.map_err(|_| Error::Rpc)
}

fn field_bytes(text: &str, kind: Kind) -> Result<Vec<u8>, Error> {
    let raw = hex_bytes(text)?;
    match kind {
        Kind::Hash => fixed::<32>(&raw).map(|_| raw),
        Kind::Address => fixed::<20>(&raw).map(|_| raw),
        Kind::Bloom => fixed::<256>(&raw).map(|_| raw),
        Kind::Nonce => fixed::<8>(&raw).map(|_| raw),
        Kind::Bytes => Ok(raw),
        Kind::Quantity => Ok(strip_zeros(raw)),
    }
}

fn quantity_bytes(text: &str) -> Result<Vec<u8>, Error> {
    Ok(strip_zeros(hex_bytes(text)?))
}

fn strip_zeros(raw: Vec<u8>) -> Vec<u8> {
    let start = raw.iter().position(|byte| *byte != 0).unwrap_or(raw.len());
    raw[start..].to_vec()
}

fn fixed<const N: usize>(raw: &[u8]) -> Result<[u8; N], Error> {
    raw.try_into().map_err(|_| Error::Rpc)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLOCK: &str = include_str!("../fixtures/base-block-52671185.json");
    const PROOF: &str = include_str!("../fixtures/base-message-passer-proof-52671185.json");
    const MESSAGE_PASSER: [u8; 20] = [
        0x42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x16,
    ];

    fn block() -> Value {
        serde_json::from_str::<Value>(BLOCK).unwrap()["result"].clone()
    }

    fn proof() -> (Vec<Vec<u8>>, [u8; 32]) {
        let value = serde_json::from_str::<Value>(PROOF).unwrap()["result"].clone();
        let nodes = value["accountProof"]
            .as_array()
            .unwrap()
            .iter()
            .map(|node| hex_bytes(node.as_str().unwrap()).unwrap())
            .collect();
        (nodes, header_hash_of(&value["storageHash"]))
    }

    fn header_hash_of(value: &Value) -> [u8; 32] {
        fixed::<32>(&hex_bytes(value.as_str().unwrap()).unwrap()).unwrap()
    }

    fn block_hash() -> [u8; 32] {
        header_hash_of(&block()["hash"])
    }

    #[test]
    fn the_rebuilt_header_hashes_to_the_block_hash() {
        let header = header_rlp(&block()).unwrap();
        assert_eq!(keccak256(&header), block_hash());
    }

    #[test]
    fn a_changed_header_field_does_not_hash_to_the_block() {
        let mut tampered = block();
        tampered["extraData"] = Value::String("0x00".to_string());
        let header = header_rlp(&tampered).unwrap();
        assert_ne!(keccak256(&header), block_hash());
    }

    #[test]
    fn an_optional_field_after_a_gap_is_refused() {
        let mut gapped = block();
        gapped.as_object_mut().unwrap().remove("withdrawalsRoot");
        assert_eq!(header_rlp(&gapped), Err(Error::Rpc));
    }

    #[test]
    fn the_message_passer_storage_root_opens_under_the_state_root() {
        let (nodes, storage_hash) = proof();
        let state_root = header_hash_field(&block(), "stateRoot").unwrap();
        let account = mpt::verify_key(&state_root, &keccak256(&MESSAGE_PASSER), &nodes).unwrap();
        assert_eq!(mpt::account_storage_root(&account).unwrap(), storage_hash);
    }

    #[test]
    fn the_real_block_binds_to_its_output_root() {
        let (nodes, storage_hash) = proof();
        let state_root = header_hash_field(&block(), "stateRoot").unwrap();
        let claimed = output_root(&state_root, &storage_hash, &block_hash());
        verify_output_binding(&MESSAGE_PASSER, &block_hash(), &state_root, &nodes, &claimed).unwrap();
    }

    #[test]
    fn a_wrong_output_root_is_refused() {
        let (nodes, storage_hash) = proof();
        let state_root = header_hash_field(&block(), "stateRoot").unwrap();
        let mut wrong_storage = storage_hash;
        wrong_storage[31] ^= 1;
        let claimed = output_root(&state_root, &wrong_storage, &block_hash());
        assert_eq!(
            verify_output_binding(&MESSAGE_PASSER, &block_hash(), &state_root, &nodes, &claimed),
            Err(Error::DigestMismatch)
        );
    }

    #[test]
    fn a_different_block_hash_changes_the_output_root() {
        let (nodes, storage_hash) = proof();
        let state_root = header_hash_field(&block(), "stateRoot").unwrap();
        let claimed = output_root(&state_root, &storage_hash, &block_hash());
        let mut other = block_hash();
        other[0] ^= 1;
        assert_eq!(
            verify_output_binding(&MESSAGE_PASSER, &other, &state_root, &nodes, &claimed),
            Err(Error::DigestMismatch)
        );
    }

    #[test]
    fn a_tampered_proof_node_is_refused() {
        let (mut nodes, storage_hash) = proof();
        let state_root = header_hash_field(&block(), "stateRoot").unwrap();
        let last = nodes.len() - 1;
        nodes[last][5] ^= 1;
        let claimed = output_root(&state_root, &storage_hash, &block_hash());
        assert!(verify_output_binding(&MESSAGE_PASSER, &block_hash(), &state_root, &nodes, &claimed).is_err());
    }

    #[test]
    fn a_proof_for_another_state_root_is_refused() {
        let (nodes, storage_hash) = proof();
        let mut state_root = header_hash_field(&block(), "stateRoot").unwrap();
        state_root[0] ^= 1;
        let claimed = output_root(&state_root, &storage_hash, &block_hash());
        assert_eq!(
            verify_output_binding(&MESSAGE_PASSER, &block_hash(), &state_root, &nodes, &claimed),
            Err(Error::MerkleMismatch)
        );
    }

    #[test]
    fn quantities_drop_leading_zeros() {
        assert_eq!(quantity_bytes("0x0").unwrap(), Vec::<u8>::new());
        assert_eq!(quantity_bytes("0x01").unwrap(), vec![1]);
        assert_eq!(quantity_bytes("0x1").unwrap(), vec![1]);
        assert_eq!(quantity_bytes("0x0102").unwrap(), vec![1, 2]);
    }
}
