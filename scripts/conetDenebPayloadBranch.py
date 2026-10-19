"""Compute the execution block_hash branch for the finalized CoNET block (Deneb).

Runs on a CoNET node with the node's own py-ssz venv. Reads only from the node's
local beacon REST. Writes nothing. Prints one JSON object.

Gindex 6444 = (201 * 32) + 12 is execution_payload.block_hash inside BeaconBlock.
The branch is 5 payload siblings, then 4 body siblings, then 3 block siblings.
"""
import hashlib
import json
import os
import urllib.request

import ssz
from ssz import Serializable, List, ByteList, ByteVector, Bitlist, Bitvector, Vector
from ssz import uint64, uint256, bytes32, bytes48, bytes96

BEACON = "http://127.0.0.1:4100"

# Mainnet preset limits (SYNC_COMMITTEE_SIZE 512 was observed on this chain).
MAX_PROPOSER_SLASHINGS = 16
MAX_ATTESTER_SLASHINGS = 2
MAX_ATTESTATIONS = 128
MAX_DEPOSITS = 16
MAX_VOLUNTARY_EXITS = 16
MAX_VALIDATORS_PER_COMMITTEE = 2048
SYNC_COMMITTEE_SIZE = 512
MAX_BYTES_PER_TRANSACTION = 1073741824
MAX_TRANSACTIONS_PER_PAYLOAD = 1048576
MAX_EXTRA_DATA_BYTES = 32
MAX_WITHDRAWALS_PER_PAYLOAD = 16
MAX_BLS_TO_EXECUTION_CHANGES = 16
MAX_BLOB_COMMITMENTS_PER_BLOCK = 4096
BYTES_PER_LOGS_BLOOM = 256
DEPOSIT_CONTRACT_TREE_DEPTH = 32


def BL(max_length):
    # py-ssz 0.5.2 ByteList has no `length` attribute, but its cache key reads it.
    sedes = ByteList(max_length)
    sedes.length = max_length
    return sedes


class Checkpoint(Serializable):
    fields = (("epoch", uint64), ("root", bytes32))


class AttestationData(Serializable):
    fields = (
        ("slot", uint64),
        ("index", uint64),
        ("beacon_block_root", bytes32),
        ("source", Checkpoint),
        ("target", Checkpoint),
    )


class Attestation(Serializable):
    fields = (
        ("aggregation_bits", Bitlist(MAX_VALIDATORS_PER_COMMITTEE)),
        ("data", AttestationData),
        ("signature", bytes96),
    )


class IndexedAttestation(Serializable):
    fields = (
        ("attesting_indices", List(uint64, MAX_VALIDATORS_PER_COMMITTEE)),
        ("data", AttestationData),
        ("signature", bytes96),
    )


class AttesterSlashing(Serializable):
    fields = (("attestation_1", IndexedAttestation), ("attestation_2", IndexedAttestation))


class BeaconBlockHeader(Serializable):
    fields = (
        ("slot", uint64),
        ("proposer_index", uint64),
        ("parent_root", bytes32),
        ("state_root", bytes32),
        ("body_root", bytes32),
    )


class SignedBeaconBlockHeader(Serializable):
    fields = (("message", BeaconBlockHeader), ("signature", bytes96))


class ProposerSlashing(Serializable):
    fields = (("signed_header_1", SignedBeaconBlockHeader), ("signed_header_2", SignedBeaconBlockHeader))


class DepositData(Serializable):
    fields = (
        ("pubkey", bytes48),
        ("withdrawal_credentials", bytes32),
        ("amount", uint64),
        ("signature", bytes96),
    )


class Deposit(Serializable):
    fields = (("proof", Vector(bytes32, DEPOSIT_CONTRACT_TREE_DEPTH + 1)), ("data", DepositData))


class VoluntaryExit(Serializable):
    fields = (("epoch", uint64), ("validator_index", uint64))


class SignedVoluntaryExit(Serializable):
    fields = (("message", VoluntaryExit), ("signature", bytes96))


class Eth1Data(Serializable):
    fields = (("deposit_root", bytes32), ("deposit_count", uint64), ("block_hash", bytes32))


class SyncAggregate(Serializable):
    fields = (("sync_committee_bits", Bitvector(SYNC_COMMITTEE_SIZE)), ("sync_committee_signature", bytes96))


class Withdrawal(Serializable):
    fields = (
        ("index", uint64),
        ("validator_index", uint64),
        ("address", ByteVector(20)),
        ("amount", uint64),
    )


class ExecutionPayload(Serializable):
    # Deneb field order.
    fields = (
        ("parent_hash", bytes32),
        ("fee_recipient", ByteVector(20)),
        ("state_root", bytes32),
        ("receipts_root", bytes32),
        ("logs_bloom", ByteVector(BYTES_PER_LOGS_BLOOM)),
        ("prev_randao", bytes32),
        ("block_number", uint64),
        ("gas_limit", uint64),
        ("gas_used", uint64),
        ("timestamp", uint64),
        ("extra_data", BL(MAX_EXTRA_DATA_BYTES)),
        ("base_fee_per_gas", uint256),
        ("block_hash", bytes32),
        ("transactions", List(BL(MAX_BYTES_PER_TRANSACTION), MAX_TRANSACTIONS_PER_PAYLOAD)),
        ("withdrawals", List(Withdrawal, MAX_WITHDRAWALS_PER_PAYLOAD)),
        ("blob_gas_used", uint64),
        ("excess_blob_gas", uint64),
    )


class BLSToExecutionChange(Serializable):
    fields = (
        ("validator_index", uint64),
        ("from_bls_pubkey", bytes48),
        ("to_execution_address", ByteVector(20)),
    )


class SignedBLSToExecutionChange(Serializable):
    fields = (("message", BLSToExecutionChange), ("signature", bytes96))


class BeaconBlockBody(Serializable):
    # Deneb field order. Twelve fields, so the body tree has 16 leaves.
    fields = (
        ("randao_reveal", bytes96),
        ("eth1_data", Eth1Data),
        ("graffiti", bytes32),
        ("proposer_slashings", List(ProposerSlashing, MAX_PROPOSER_SLASHINGS)),
        ("attester_slashings", List(AttesterSlashing, MAX_ATTESTER_SLASHINGS)),
        ("attestations", List(Attestation, MAX_ATTESTATIONS)),
        ("deposits", List(Deposit, MAX_DEPOSITS)),
        ("voluntary_exits", List(SignedVoluntaryExit, MAX_VOLUNTARY_EXITS)),
        ("sync_aggregate", SyncAggregate),
        ("execution_payload", ExecutionPayload),
        ("bls_to_execution_changes", List(SignedBLSToExecutionChange, MAX_BLS_TO_EXECUTION_CHANGES)),
        ("blob_kzg_commitments", List(bytes48, MAX_BLOB_COMMITMENTS_PER_BLOCK)),
    )


class BeaconBlock(Serializable):
    fields = (
        ("slot", uint64),
        ("proposer_index", uint64),
        ("parent_root", bytes32),
        ("state_root", bytes32),
        ("body", BeaconBlockBody),
    )


class SignedBeaconBlock(Serializable):
    fields = (("message", BeaconBlock), ("signature", bytes96))


ZERO_HASHES = [b"\x00" * 32]
for _ in range(64):
    ZERO_HASHES.append(hashlib.sha256(ZERO_HASHES[-1] + ZERO_HASHES[-1]).digest())


def merkleize_limit(chunks, limit):
    """SSZ merkleize with a limit: missing right subtrees use the zero hashes."""
    depth = 0
    while (1 << depth) < max(limit, 1):
        depth += 1
    layer = list(chunks)
    for d in range(depth):
        nxt = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else ZERO_HASHES[d]
            nxt.append(hashlib.sha256(left + right).digest())
        layer = nxt if nxt else [ZERO_HASHES[d + 1]]
    return layer[0] if layer else ZERO_HASHES[depth]


def mix_in_length(root, length):
    return hashlib.sha256(root + length.to_bytes(32, "little")).digest()


def pack_bytes(data):
    return [data[i:i + 32].ljust(32, b"\x00") for i in range(0, len(data), 32)]


def htr_bytelist(data, max_length):
    """ByteList[max_length] hash_tree_root, computed directly (py-ssz 0.5.2 fails here)."""
    root = merkleize_limit(pack_bytes(data), (max_length + 31) // 32)
    return mix_in_length(root, len(data))


def payload_field_root(payload, name, sedes):
    value = getattr(payload, name)
    if name == "extra_data":
        return htr_bytelist(bytes(value), MAX_EXTRA_DATA_BYTES)
    if name == "transactions":
        roots = [htr_bytelist(bytes(tx), MAX_BYTES_PER_TRANSACTION) for tx in value]
        return mix_in_length(merkleize_limit(roots, MAX_TRANSACTIONS_PER_PAYLOAD), len(value))
    return ssz.get_hash_tree_root(value, sedes)


def sha(a, b):
    return hashlib.sha256(a + b).digest()


def merkle_root_and_branch(leaves, index):
    """Pad to the next power of two, return (root, siblings from the leaf upward)."""
    size = 1
    while size < len(leaves):
        size <<= 1
    layer = list(leaves) + [b"\x00" * 32] * (size - len(leaves))
    branch = []
    idx = index
    while len(layer) > 1:
        sibling = layer[idx ^ 1]
        branch.append(sibling)
        layer = [sha(layer[i], layer[i + 1]) for i in range(0, len(layer), 2)]
        idx >>= 1
    return layer[0], branch


def walk(leaf, branch, gindex):
    node = leaf
    index = gindex
    for sibling in branch:
        node = sha(sibling, node) if index & 1 else sha(node, sibling)
        index >>= 1
    return node, index


def http_get(path, accept=None):
    req = urllib.request.Request(BEACON + path)
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    block_id = os.environ.get("BLOCK_ID", "finalized")
    raw = http_get(f"/eth/v2/beacon/blocks/{block_id}", accept="application/octet-stream")
    signed = ssz.decode(raw, SignedBeaconBlock)
    block = signed.message
    body = block.body
    payload = body.execution_payload

    # Bottom-up roots. py-ssz hashes ByteList wrongly here, so payload and body
    # roots are built from field roots instead of whole-container hashing.
    payload_sedes = dict(ExecutionPayload._meta.fields)
    payload_names = [name for name, _ in ExecutionPayload._meta.fields]
    payload_leaves = [payload_field_root(payload, name, payload_sedes[name]) for name in payload_names]
    payload_root, payload_branch = merkle_root_and_branch(payload_leaves, payload_names.index("block_hash"))

    body_sedes = dict(BeaconBlockBody._meta.fields)
    body_names = [name for name, _ in BeaconBlockBody._meta.fields]
    body_leaves = []
    for name in body_names:
        if name == "execution_payload":
            body_leaves.append(payload_root)
        else:
            body_leaves.append(ssz.get_hash_tree_root(getattr(body, name), body_sedes[name]))
    body_root, body_branch = merkle_root_and_branch(body_leaves, body_names.index("execution_payload"))

    block_sedes = dict(BeaconBlock._meta.fields)
    block_names = [name for name, _ in BeaconBlock._meta.fields]
    block_leaves = []
    for name in block_names:
        if name == "body":
            block_leaves.append(body_root)
        else:
            block_leaves.append(ssz.get_hash_tree_root(getattr(block, name), block_sedes[name]))
    block_root, block_branch = merkle_root_and_branch(block_leaves, block_names.index("body"))

    # The computed roots must match the beacon REST header.
    header_json = json.loads(http_get(f"/eth/v1/beacon/headers/{block_id}"))["data"]
    api_body_root = bytes.fromhex(header_json["header"]["message"]["body_root"][2:])
    api_block_root = bytes.fromhex(header_json["root"][2:])

    branch = payload_branch + body_branch + block_branch
    walked, leftover = walk(bytes(payload.block_hash), branch, 6444)
    out = {
        "slot": int(block.slot),
        "fork": "deneb",
        "bodyRootComputed": "0x" + body_root.hex(),
        "bodyRootApi": "0x" + api_body_root.hex(),
        "bodyRootMatches": body_root == api_body_root,
        "blockRootComputed": "0x" + block_root.hex(),
        "blockRootApi": "0x" + api_block_root.hex(),
        "blockRootMatches": block_root == api_block_root,
        "payloadRootComputed": "0x" + payload_root.hex(),
        "blockNumber": int(payload.block_number),
        "blockHash": "0x" + bytes(payload.block_hash).hex(),
        "gindex": 6444,
        "branchLength": len(branch),
        "branch": ["0x" + sib.hex() for sib in branch],
        "walkedRootMatches": walked == block_root and leftover == 1,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
