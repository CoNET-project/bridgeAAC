// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "../../contracts/AacSszBranch.sol";

/// Exposes AacSszBranch to the tests. Not deployed.
contract SszBranchMock {
    function root(bytes32 leaf, uint256 gindex, bytes32[] calldata branch) external pure returns (bytes32) {
        return AacSszBranch.root(leaf, gindex, branch);
    }

    function verify(bytes32 leaf, uint256 gindex, bytes32[] calldata branch, bytes32 expectedRoot)
        external
        pure
        returns (bool)
    {
        return AacSszBranch.verify(leaf, gindex, branch, expectedRoot);
    }
}
