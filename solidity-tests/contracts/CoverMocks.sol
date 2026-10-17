// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "../../contracts/AacCheckpointMessageCover.sol";

/// Test doubles for the cover tests. Not deployed: the test copies their code
/// to the hardcoded STORE and OUTPUT_ROOT_PROOF addresses with hardhat_setCode.

/// Stands in for the checkpoint store at the hardcoded STORE address.
contract MockCheckpointStore {
    // Stored inverted: hardhat_setCode copies code only, so a constructor default
    // would be zero in storage. Zero here means the proof verifies.
    bool public unproven;

    function setUnproven(bool u) external {
        unproven = u;
    }

    function period() external pure returns (uint256) {
        return 1883;
    }

    function verifyFinalized(
        IAacCheckpointStore.Aggregate calldata,
        IAacCheckpointStore.Header calldata,
        bytes32[7] calldata
    ) external view returns (uint256 participants, bool headerFinal) {
        return (511, !unproven);
    }
}

/// Stands in for AacOutputRootProof at the hardcoded OUTPUT_ROOT_PROOF address.
/// The real proof has its own tests; here the test chooses which Base block hash
/// the L1 anchor reports.
contract MockOutputRootProof {
    bytes32 public baseBlockHash;
    bool public innerFinal;

    function set(bytes32 h, bool f) external {
        baseBlockHash = h;
        innerFinal = f;
    }

    function verify(bytes calldata, bytes[] calldata, bytes calldata, bytes calldata, bytes[] calldata)
        external
        view
        returns (bytes32 outputRoot, uint256 l2SequenceNumber, bytes32 blockHash, bool headerFinal)
    {
        return (bytes32(uint256(1)), 52583500, baseBlockHash, innerFinal);
    }
}
