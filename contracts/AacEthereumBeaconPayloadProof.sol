// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Proves the accepted execution block hash sits inside one beacon
/// block body. The beacon block root is the value already committed by the
/// next execution header. This is not a finalized-checkpoint proof.
contract AacEthereumBeaconPayloadProof {
    bytes32 public constant EXECUTION_HASH =
        0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725;
    bytes32 public constant BEACON_BLOCK_ROOT =
        0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3;
    bytes32 public constant PARENT_BEACON_ROOT =
        0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7;
    uint256 public constant BEACON_SLOT = 15406750;
    uint256 public constant GINDEX = 6444;
    uint256 public constant BRANCH_LENGTH = 12;

    error InvalidProof();

    function verify(bytes32[] calldata branch)
        external
        pure
        returns (bytes32 executionHash, bytes32 beaconBlockRoot, uint256 beaconSlot, bool headerFinal)
    {
        if (branch.length != BRANCH_LENGTH) revert InvalidProof();
        bytes32 node = EXECUTION_HASH;
        uint256 index = GINDEX;
        for (uint256 i; i < BRANCH_LENGTH; i++) {
            bytes32 sibling = branch[i];
            node = (index & 1) == 1 ? _sha(sibling, node) : _sha(node, sibling);
            index >>= 1;
        }
        if (index != 1 || node != BEACON_BLOCK_ROOT) revert InvalidProof();
        executionHash = EXECUTION_HASH;
        beaconBlockRoot = node;
        beaconSlot = BEACON_SLOT;
        headerFinal = false;
    }

    function _sha(bytes32 left, bytes32 right) private pure returns (bytes32 digest) {
        digest = sha256(abi.encodePacked(left, right));
    }
}
