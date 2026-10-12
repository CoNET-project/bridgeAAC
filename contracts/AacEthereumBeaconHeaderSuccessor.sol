// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Checks the next beacon block after slot 15406750. Its parent root
/// is that accepted beacon root, and its body contains execution block
/// 26167827. This one-slot step is not a finalized-checkpoint proof.
contract AacEthereumBeaconHeaderSuccessor {
    bytes32 public constant PARENT_BEACON_ROOT =
        0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3;
    uint256 public constant PARENT_SLOT = 15406750;
    bytes32 public constant CHILD_BEACON_ROOT =
        0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf;
    uint256 public constant CHILD_SLOT = 15406751;
    bytes32 public constant EXECUTION_HASH =
        0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff;
    uint256 public constant EXECUTION_NUMBER = 26167827;
    uint256 public constant GINDEX = 6444;
    uint256 public constant BRANCH_LENGTH = 12;

    error InvalidHeader();
    error InvalidProof();

    function verify(uint256 proposerIndex, bytes32 stateRoot, bytes32 bodyRoot, bytes32[] calldata branch)
        external
        pure
        returns (
            bytes32 childBeaconRoot,
            bytes32 parentBeaconRoot,
            bytes32 executionHash,
            uint256 childSlot,
            bool headerFinal
        )
    {
        if (proposerIndex > type(uint64).max || branch.length != BRANCH_LENGTH) revert InvalidHeader();
        bytes32 zero = bytes32(0);
        bytes32 slotChunk = _uint64Chunk(CHILD_SLOT);
        bytes32 proposerChunk = _uint64Chunk(proposerIndex);
        bytes32 h01 = sha256(abi.encodePacked(slotChunk, proposerChunk));
        bytes32 h23 = sha256(abi.encodePacked(PARENT_BEACON_ROOT, stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(bodyRoot, zero));
        bytes32 h67 = sha256(abi.encodePacked(zero, zero));
        childBeaconRoot = sha256(
            abi.encodePacked(sha256(abi.encodePacked(h01, h23)), sha256(abi.encodePacked(h45, h67)))
        );
        if (childBeaconRoot != CHILD_BEACON_ROOT) revert InvalidHeader();

        bytes32 node = EXECUTION_HASH;
        uint256 index = GINDEX;
        for (uint256 i; i < BRANCH_LENGTH; i++) {
            bytes32 sibling = branch[i];
            node = (index & 1) == 1 ? sha256(abi.encodePacked(sibling, node)) : sha256(abi.encodePacked(node, sibling));
            index >>= 1;
        }
        if (index != 1 || node != CHILD_BEACON_ROOT) revert InvalidProof();
        parentBeaconRoot = PARENT_BEACON_ROOT;
        executionHash = EXECUTION_HASH;
        childSlot = CHILD_SLOT;
        headerFinal = false;
    }

    function _uint64Chunk(uint256 value) private pure returns (bytes32 chunk) {
        uint256 word;
        for (uint256 i; i < 8; i++) {
            word |= ((value >> (8 * i)) & 0xff) << (8 * (31 - i));
        }
        chunk = bytes32(word);
    }
}
