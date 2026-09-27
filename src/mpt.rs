//! Ethereum Merkle-Patricia proof check for one receipt.
//!
//! The verified value must sit under the receipts root returned with the same
//! execution-client header. This is not an OP output-root proof and it is not
//! a CONET beacon proof.

use crate::error::Error;
use crate::hash::keccak256;

pub fn verify_receipt(root: &[u8; 32], index: u64, receipt: &[u8], proof: &[Vec<u8>]) -> Result<(), Error> {
    let found = resolve(root, &bytes_to_nibbles(&rlp_uint(index)), proof)?;
    if found == receipt {
        Ok(())
    } else {
        Err(Error::MerkleMismatch)
    }
}

fn resolve(root: &[u8; 32], nibbles: &[u8], proof: &[Vec<u8>]) -> Result<Vec<u8>, Error> {
    let mut cursor = 0usize;
    walk_hashed(root, nibbles, proof, &mut cursor)
}

fn walk_hashed(expected: &[u8; 32], nibbles: &[u8], proof: &[Vec<u8>], cursor: &mut usize) -> Result<Vec<u8>, Error> {
    let node = proof.get(*cursor).ok_or(Error::MerkleMismatch)?;
    *cursor += 1;
    if keccak256(node) != *expected {
        return Err(Error::MerkleMismatch);
    }
    walk_node(node, nibbles, proof, cursor)
}

fn walk_node(node: &[u8], nibbles: &[u8], proof: &[Vec<u8>], cursor: &mut usize) -> Result<Vec<u8>, Error> {
    let items = rlp_list(node)?;
    match items.len() {
        2 => {
            let Item::Bytes(path_bytes) = &items[0] else { return Err(Error::MerkleMismatch) };
            let Item::Bytes(value) = &items[1] else { return Err(Error::MerkleMismatch) };
            let (terminator, path) = decode_hp(path_bytes)?;
            if nibbles.len() < path.len() || nibbles[..path.len()] != path[..] {
                return Err(Error::MerkleMismatch);
            }
            let rest = &nibbles[path.len()..];
            if terminator {
                if rest.is_empty() {
                    Ok(value.clone())
                } else {
                    Err(Error::MerkleMismatch)
                }
            } else {
                follow(&items[1], rest, proof, cursor)
            }
        }
        17 => {
            if nibbles.is_empty() {
                let Item::Bytes(value) = &items[16] else { return Err(Error::MerkleMismatch) };
                return Ok(value.clone());
            }
            follow(&items[nibbles[0] as usize], &nibbles[1..], proof, cursor)
        }
        _ => Err(Error::MerkleMismatch),
    }
}

fn follow(child: &Item, nibbles: &[u8], proof: &[Vec<u8>], cursor: &mut usize) -> Result<Vec<u8>, Error> {
    match child {
        Item::Bytes(bytes) if bytes.len() == 32 => {
            let mut hash = [0u8; 32];
            hash.copy_from_slice(bytes);
            walk_hashed(&hash, nibbles, proof, cursor)
        }
        Item::Bytes(bytes) if bytes.is_empty() => Err(Error::MerkleMismatch),
        Item::List(raw) => walk_node(raw, nibbles, proof, cursor),
        Item::Bytes(_) => Err(Error::MerkleMismatch),
    }
}

pub struct ConsensusLog {
    pub address: [u8; 20],
    pub topics: Vec<[u8; 32]>,
    pub data: Vec<u8>,
}

/// Receipt bytes stored in the Ethereum receipt trie.
/// `tx_type` 0 is a legacy receipt. Any other type is prefixed to the payload.
/// `deposit` is the post-Canyon Base deposit nonce and receipt version.
pub fn encode_consensus_receipt(
    tx_type: u8,
    status_ok: bool,
    cumulative_gas: u64,
    bloom: &[u8; 256],
    logs: &[ConsensusLog],
    deposit: Option<(u64, u64)>,
) -> Vec<u8> {
    let status = if status_ok { vec![0x01] } else { Vec::new() };
    let mut log_items = Vec::with_capacity(logs.len());
    for log in logs {
        let topics = log.topics.iter().map(|topic| rlp_bytes(topic)).collect::<Vec<_>>();
        log_items.push(rlp_list_raw(&[
            rlp_bytes(&log.address),
            rlp_list_raw(&topics),
            rlp_bytes(&log.data),
        ]));
    }
    let mut body_items = vec![
        rlp_bytes(&status),
        rlp_uint(cumulative_gas),
        rlp_bytes(bloom),
        rlp_list_raw(&log_items),
    ];
    if let Some((nonce, version)) = deposit {
        body_items.push(rlp_uint(nonce));
        body_items.push(rlp_uint(version));
    }
    let body = rlp_list_raw(&body_items);
    if tx_type == 0 {
        body
    } else {
        let mut out = vec![tx_type];
        out.extend(body);
        out
    }
}

pub fn prove_receipts(receipts: &[Vec<u8>], index: usize) -> Result<([u8; 32], Vec<Vec<u8>>), Error> {
    if receipts.is_empty() || index >= receipts.len() {
        return Err(Error::BadIndex);
    }
    let mut root = Node::Empty;
    for (i, receipt) in receipts.iter().enumerate() {
        root = insert(root, &bytes_to_nibbles(&rlp_uint(i as u64)), receipt.clone());
    }
    let mut proof = Vec::new();
    collect(&root, &bytes_to_nibbles(&rlp_uint(index as u64)), &mut proof);
    Ok((keccak256(&encode_node(&root)), proof))
}

enum Node {
    Empty,
    Leaf { nibbles: Vec<u8>, value: Vec<u8> },
    Extension { nibbles: Vec<u8>, child: Box<Node> },
    Branch { children: [Option<Box<Node>>; 16], value: Option<Vec<u8>> },
}

fn insert(node: Node, path: &[u8], value: Vec<u8>) -> Node {
    match node {
        Node::Empty => Node::Leaf { nibbles: path.to_vec(), value },
        Node::Leaf { nibbles, value: old } => {
            let common = shared(&nibbles, path);
            if common == nibbles.len() && common == path.len() {
                return Node::Leaf { nibbles, value };
            }
            let mut branch = empty_branch();
            attach(&mut branch, &nibbles[common..], old);
            attach(&mut branch, &path[common..], value);
            wrap(path[..common].to_vec(), Node::Branch { children: branch.0, value: branch.1 })
        }
        Node::Extension { nibbles, child } => {
            let common = shared(&nibbles, path);
            if common == nibbles.len() {
                return Node::Extension { nibbles, child: Box::new(insert(*child, &path[common..], value)) };
            }
            let mut branch = empty_branch();
            let rest = &nibbles[common..];
            if rest.len() == 1 {
                branch.0[rest[0] as usize] = Some(child);
            } else {
                branch.0[rest[0] as usize] = Some(Box::new(Node::Extension {
                    nibbles: rest[1..].to_vec(),
                    child,
                }));
            }
            attach(&mut branch, &path[common..], value);
            wrap(nibbles[..common].to_vec(), Node::Branch { children: branch.0, value: branch.1 })
        }
        Node::Branch { mut children, value: mut slot } => {
            if path.is_empty() {
                slot = Some(value);
                return Node::Branch { children, value: slot };
            }
            let child = match children[path[0] as usize].take() {
                Some(child) => *child,
                None => Node::Empty,
            };
            children[path[0] as usize] = Some(Box::new(insert(child, &path[1..], value)));
            Node::Branch { children, value: slot }
        }
    }
}

fn attach(branch: &mut ([Option<Box<Node>>; 16], Option<Vec<u8>>), path: &[u8], value: Vec<u8>) {
    if path.is_empty() {
        branch.1 = Some(value);
    } else {
        branch.0[path[0] as usize] = Some(Box::new(Node::Leaf { nibbles: path[1..].to_vec(), value }));
    }
}

fn wrap(prefix: Vec<u8>, node: Node) -> Node {
    if prefix.is_empty() {
        node
    } else {
        Node::Extension { nibbles: prefix, child: Box::new(node) }
    }
}

fn empty_branch() -> ([Option<Box<Node>>; 16], Option<Vec<u8>>) {
    (std::array::from_fn(|_| None), None)
}

fn shared(left: &[u8], right: &[u8]) -> usize {
    left.iter().zip(right).take_while(|(a, b)| a == b).count()
}

fn encode_node(node: &Node) -> Vec<u8> {
    match node {
        Node::Empty => vec![0x80],
        Node::Leaf { nibbles, value } => {
            rlp_list_raw(&[rlp_bytes(&encode_hp(nibbles, true)), rlp_bytes(value)])
        }
        Node::Extension { nibbles, child } => rlp_list_raw(&[rlp_bytes(&encode_hp(nibbles, false)), child_ref(child)]),
        Node::Branch { children, value } => {
            let mut items = Vec::with_capacity(17);
            for child in children {
                items.push(match child {
                    Some(child) => child_ref(child),
                    None => vec![0x80],
                });
            }
            items.push(match value {
                Some(value) => rlp_bytes(value),
                None => vec![0x80],
            });
            rlp_list_raw(&items)
        }
    }
}

fn child_ref(child: &Node) -> Vec<u8> {
    let encoded = encode_node(child);
    if encoded.len() < 32 {
        encoded
    } else {
        rlp_bytes(&keccak256(&encoded))
    }
}

fn collect(node: &Node, nibbles: &[u8], proof: &mut Vec<Vec<u8>>) {
    let encoded = encode_node(node);
    if proof.is_empty() || encoded.len() >= 32 {
        proof.push(encoded);
    }
    match node {
        Node::Extension { nibbles: path, child } => {
            let child_bytes = encode_node(child);
            if child_bytes.len() >= 32 {
                collect(child, &nibbles[path.len()..], proof);
            }
        }
        Node::Branch { children, .. } => {
            if nibbles.is_empty() {
                return;
            }
            if let Some(child) = &children[nibbles[0] as usize] {
                if encode_node(child).len() >= 32 {
                    collect(child, &nibbles[1..], proof);
                }
            }
        }
        Node::Empty | Node::Leaf { .. } => {}
    }
}

pub fn single_leaf_proof(index: u64, receipt: &[u8]) -> ([u8; 32], Vec<Vec<u8>>) {
    let node = rlp_list_raw(&[rlp_bytes(&encode_hp(&bytes_to_nibbles(&rlp_uint(index)), true)), rlp_bytes(receipt)]);
    (keccak256(&node), vec![node])
}

fn encode_hp(nibbles: &[u8], terminator: bool) -> Vec<u8> {
    let odd = nibbles.len() % 2 == 1;
    let mut flags = if terminator { 2 } else { 0 };
    if odd {
        flags |= 1;
    }
    let mut out = Vec::new();
    if odd {
        out.push((flags << 4) | nibbles[0]);
        pack(&nibbles[1..], &mut out);
    } else {
        out.push(flags << 4);
        pack(nibbles, &mut out);
    }
    out
}

fn pack(nibbles: &[u8], out: &mut Vec<u8>) {
    let mut i = 0;
    while i < nibbles.len() {
        out.push((nibbles[i] << 4) | nibbles[i + 1]);
        i += 2;
    }
}

fn decode_hp(path: &[u8]) -> Result<(bool, Vec<u8>), Error> {
    if path.is_empty() {
        return Err(Error::MerkleMismatch);
    }
    let flags = path[0] >> 4;
    let mut nibbles = Vec::new();
    if flags & 1 == 1 {
        nibbles.push(path[0] & 0x0f);
    }
    for byte in &path[1..] {
        nibbles.push(byte >> 4);
        nibbles.push(byte & 0x0f);
    }
    Ok((flags & 2 == 2, nibbles))
}

fn bytes_to_nibbles(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(byte >> 4);
        out.push(byte & 0x0f);
    }
    out
}

fn rlp_uint(value: u64) -> Vec<u8> {
    if value == 0 {
        return rlp_bytes(&[]);
    }
    let bytes = value.to_be_bytes();
    let start = bytes.iter().position(|byte| *byte != 0).unwrap_or(0);
    rlp_bytes(&bytes[start..])
}

fn rlp_bytes(data: &[u8]) -> Vec<u8> {
    if data.len() == 1 && data[0] < 0x80 {
        return data.to_vec();
    }
    let mut out = rlp_header(data.len(), 0x80, 0xb7);
    out.extend_from_slice(data);
    out
}

fn rlp_list_raw(items: &[Vec<u8>]) -> Vec<u8> {
    let payload = items.iter().flatten().copied().collect::<Vec<_>>();
    let mut out = rlp_header(payload.len(), 0xc0, 0xf7);
    out.extend(payload);
    out
}

fn rlp_header(payload_len: usize, short_base: u8, long_base: u8) -> Vec<u8> {
    if payload_len < 56 {
        return vec![short_base + payload_len as u8];
    }
    let bytes = payload_len.to_be_bytes();
    let start = bytes.iter().position(|byte| *byte != 0).unwrap_or(0);
    let len_bytes = &bytes[start..];
    let mut out = vec![long_base + len_bytes.len() as u8];
    out.extend_from_slice(len_bytes);
    out
}

enum Item {
    Bytes(Vec<u8>),
    List(Vec<u8>),
}

fn rlp_list(bytes: &[u8]) -> Result<Vec<Item>, Error> {
    let (payload, header) = read_payload(bytes, 0xc0, 0xf7)?;
    if header + payload != bytes.len() {
        return Err(Error::MerkleMismatch);
    }
    let mut items = Vec::new();
    let mut i = header;
    while i < bytes.len() {
        let (item, next) = read_item(&bytes[i..])?;
        items.push(item);
        i += next;
    }
    Ok(items)
}

fn read_item(bytes: &[u8]) -> Result<(Item, usize), Error> {
    if bytes.is_empty() {
        return Err(Error::MerkleMismatch);
    }
    if bytes[0] <= 0x7f {
        return Ok((Item::Bytes(bytes[..1].to_vec()), 1));
    }
    if bytes[0] <= 0xbf {
        let (payload, header) = read_payload(bytes, 0x80, 0xb7)?;
        return Ok((Item::Bytes(bytes[header..header + payload].to_vec()), header + payload));
    }
    let (payload, header) = read_payload(bytes, 0xc0, 0xf7)?;
    Ok((Item::List(bytes[..header + payload].to_vec()), header + payload))
}

fn read_payload(bytes: &[u8], short_base: u8, long_base: u8) -> Result<(usize, usize), Error> {
    if bytes.is_empty() {
        return Err(Error::MerkleMismatch);
    }
    let prefix = bytes[0];
    if prefix < short_base {
        return Err(Error::MerkleMismatch);
    }
    if prefix <= short_base + 55 {
        return Ok(((prefix - short_base) as usize, 1));
    }
    let len_of_len = (prefix - long_base) as usize;
    if len_of_len == 0 || len_of_len > 8 || bytes.len() < 1 + len_of_len {
        return Err(Error::MerkleMismatch);
    }
    let mut value = 0usize;
    for byte in &bytes[1..1 + len_of_len] {
        value = value.checked_shl(8).ok_or(Error::MerkleMismatch)? | *byte as usize;
    }
    Ok((value, 1 + len_of_len))
}
