// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice SSZ Merkle branch check for one generalized index.
/// @dev Same hashing as AacEthereumBeaconPayloadProof: sha256 of the two 32-byte
///      children, with the sibling on the left when the current index is odd.
///      The branch length must equal floor(log2(gindex)). A walk that ends at
///      index 1 reproduces the root. This library does not decide which gindex
///      is correct for a given fork. The caller passes it, and a CoNET binding
///      must pin the gindex for the fork it verifies.
library AacSszBranch {
    error BadBranch();

    /// @notice Root reached from `leaf` through `branch` at generalized index `gindex`.
    function root(bytes32 leaf, uint256 gindex, bytes32[] calldata branch) internal pure returns (bytes32 node) {
        if (gindex == 0) revert BadBranch();
        uint256 depth = _depth(gindex);
        if (branch.length != depth) revert BadBranch();
        node = leaf;
        uint256 index = gindex;
        for (uint256 i; i < depth; i++) {
            bytes32 sibling = branch[i];
            node = (index & 1) == 1 ? sha256(abi.encodePacked(sibling, node)) : sha256(abi.encodePacked(node, sibling));
            index >>= 1;
        }
    }

    /// @notice True only when the branch from `leaf` reaches `expectedRoot`.
    function verify(bytes32 leaf, uint256 gindex, bytes32[] calldata branch, bytes32 expectedRoot)
        internal
        pure
        returns (bool)
    {
        return root(leaf, gindex, branch) == expectedRoot;
    }

    function _depth(uint256 gindex) private pure returns (uint256 d) {
        uint256 g = gindex;
        while (g > 1) {
            g >>= 1;
            d++;
        }
    }
}
