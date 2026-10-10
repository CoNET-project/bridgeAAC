// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

library AacHeaderCommitment {
    struct Commitment {
        uint256 sourceChainId;
        uint256 finalityHeight;
        uint256 blockNumber;
        bytes32 blockHash;
        bytes32 stateRoot;
        bytes32 receiptsRoot;
        bytes32 finalityDigest;
    }
}
