use crate::hash::keccak256;

/// Sorted-pair binary Merkle tree.
///
/// This is the phase-0 commitment. It is not an Ethereum receipt trie and it is
/// not an OP Stack output root. A later verifier replaces this scheme without
/// changing the AAC state machine.
#[derive(Clone, Debug)]
pub struct MerkleTree {
    pub root: [u8; 32],
    layers: Vec<Vec<[u8; 32]>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MerkleProof {
    pub siblings: Vec<[u8; 32]>,
}

pub fn build_tree(leaves: &[[u8; 32]]) -> Option<MerkleTree> {
    if leaves.is_empty() {
        return None;
    }
    let mut layers = vec![leaves.to_vec()];
    while layers.last().map(|layer| layer.len()).unwrap_or(0) > 1 {
        let prev = layers.last().unwrap();
        let mut next = Vec::with_capacity(prev.len().div_ceil(2));
        let mut i = 0;
        while i < prev.len() {
            let left = prev[i];
            let right = if i + 1 < prev.len() { prev[i + 1] } else { prev[i] };
            next.push(hash_pair(left, right));
            i += 2;
        }
        layers.push(next);
    }
    Some(MerkleTree {
        root: layers.last().unwrap()[0],
        layers,
    })
}

pub fn prove(tree: &MerkleTree, index: usize) -> Option<MerkleProof> {
    if index >= tree.layers[0].len() {
        return None;
    }
    let mut siblings = Vec::new();
    let mut idx = index;
    for layer in &tree.layers[..tree.layers.len() - 1] {
        let sibling = if idx % 2 == 0 {
            let j = idx + 1;
            if j < layer.len() { layer[j] } else { layer[idx] }
        } else {
            layer[idx - 1]
        };
        siblings.push(sibling);
        idx /= 2;
    }
    Some(MerkleProof { siblings })
}

pub fn verify(root: &[u8; 32], leaf: &[u8; 32], proof: &MerkleProof) -> bool {
    let mut current = *leaf;
    for sibling in &proof.siblings {
        current = hash_pair(current, *sibling);
    }
    &current == root
}

fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let (a, b) = if left <= right { (left, right) } else { (right, left) };
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(&a);
    buf[32..].copy_from_slice(&b);
    keccak256(&buf)
}
