// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacConetSourceFinalityTimelock.sol";

/// @notice One-period CoNET sync-committee rotation on the existing finality proxy.
/// @dev Storage matches the installed timelock. `applyUpdate` advances `period`
///      by exactly one. It does not open source initiate and does not change
///      the 48-hour upgrade schedule.
contract AacConetSourceFinalityRotate is AacConetSourceFinalityTimelock {
    uint256 public constant NEXT_GINDEX = 87;
    uint256 private constant BRANCH_LEN = 6;

    struct Update {
        bytes signerUncompressed;
        bytes nextCompressed;
        bytes nextAggregate;
        bytes bits;
        Header attested;
        uint256 signatureSlot;
        bytes32[6] branch;
        bytes signaturePoint;
    }

    event CommitteeStored(uint256 indexed period, bytes32 compressedDigest);

    function applyUpdate(Update calldata update)
        external
        returns (uint256 fromPeriod, uint256 toPeriod, uint256 participants)
    {
        if (!rootReady) revert InvalidProof();
        fromPeriod = period;
        if (
            fromPeriod == 0 || update.signerUncompressed.length != COMMITTEE_SIZE * 128
                || update.nextCompressed.length != COMMITTEE_SIZE * 48 || update.nextAggregate.length != 48
                || update.bits.length != 64 || update.signaturePoint.length != 256
                || update.signatureSlot / 8192 != fromPeriod || update.attested.slot / 8192 != fromPeriod
                || update.signatureSlot <= update.attested.slot
        ) revert InvalidProof();
        if (_compressedDigest(update.signerUncompressed) != compressedDigest) revert InvalidProof();
        bytes32 nextDigest = keccak256(update.nextCompressed);
        if (nextDigest == compressedDigest) revert InvalidProof();
        if (_walk(_committee(update.nextCompressed, update.nextAggregate), update.branch, NEXT_GINDEX) != update.attested.stateRoot) {
            revert InvalidProof();
        }
        participants = _count(update.bits);
        if (participants * 3 < COMMITTEE_SIZE * 2) revert InvalidProof();
        _pair(
            update.signerUncompressed,
            update.bits,
            participants,
            _hashToCurve(_signingRoot(update.attested)),
            update.signaturePoint
        );
        toPeriod = fromPeriod + 1;
        period = toPeriod;
        compressedDigest = nextDigest;
        rootReady = true;
        emit CommitteeStored(toPeriod, nextDigest);
    }

    function _committee(bytes calldata keys, bytes calldata aggregate) private pure returns (bytes32) {
        bytes32[] memory level = new bytes32[](COMMITTEE_SIZE);
        for (uint256 i; i < COMMITTEE_SIZE; i++) level[i] = _hashKey(keys, i);
        uint256 count = COMMITTEE_SIZE;
        while (count > 1) {
            for (uint256 i; i < count; i += 2) level[i / 2] = sha256(abi.encodePacked(level[i], level[i + 1]));
            count /= 2;
        }
        return sha256(abi.encodePacked(level[0], _hashBytes(aggregate)));
    }

    function _hashKey(bytes calldata keys, uint256 index) private pure returns (bytes32) {
        uint256 at = index * 48;
        bytes32 left;
        assembly ("memory-safe") {
            left := calldataload(add(keys.offset, at))
        }
        bytes32 right;
        assembly ("memory-safe") {
            right := shl(128, shr(128, calldataload(add(keys.offset, add(at, 32)))))
        }
        return sha256(abi.encodePacked(left, right));
    }

    function _hashBytes(bytes calldata data) private pure returns (bytes32) {
        bytes32 left;
        assembly ("memory-safe") {
            left := calldataload(data.offset)
        }
        bytes32 right;
        assembly ("memory-safe") {
            right := shl(128, shr(128, calldataload(add(data.offset, 32))))
        }
        return sha256(abi.encodePacked(left, right));
    }

    function _walk(bytes32 node, bytes32[6] calldata branch, uint256 index) private pure returns (bytes32) {
        for (uint256 i; i < BRANCH_LEN; i++) {
            bytes32 sibling = branch[i];
            node = (index & 1) == 1 ? sha256(abi.encodePacked(sibling, node)) : sha256(abi.encodePacked(node, sibling));
            index >>= 1;
        }
        if (index != 1) revert InvalidProof();
        return node;
    }
}
