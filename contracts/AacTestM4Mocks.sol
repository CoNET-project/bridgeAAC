// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacHeaderCommitment.sol";

contract AacTestFinalityVerifier {
    AacHeaderCommitment.Commitment private commitment;

    constructor(uint256 sourceChainId_, uint256 finalityHeight_, uint256 blockNumber_) {
        commitment = AacHeaderCommitment.Commitment({
            sourceChainId: sourceChainId_,
            finalityHeight: finalityHeight_,
            blockNumber: blockNumber_,
            blockHash: keccak256("m4-test-finality-block"),
            stateRoot: keccak256("m4-test-finality-state"),
            receiptsRoot: keccak256("m4-test-finality-receipts"),
            finalityDigest: keccak256("m4-test-finality-digest")
        });
    }

    function verifyHeader(bytes calldata)
        external
        view
        returns (AacHeaderCommitment.Commitment memory)
    {
        return commitment;
    }

    function verifyHeader(bytes calldata, bytes calldata)
        external
        view
        returns (AacHeaderCommitment.Commitment memory)
    {
        return commitment;
    }
}

contract AacTestReceiptMptVerifier {
    function verifyReceiptProof(
        uint256,
        bytes32,
        bytes32,
        uint64,
        bytes calldata,
        bytes[] calldata
    ) external pure returns (bool) {
        return true;
    }
}

contract AacTestAssetAdapter {
    address public immutable admin;
    address public consumer;
    uint256 public consumedCount;
    bytes32 public lastAacId;

    error NotAdmin();
    error NotConsumer();
    error BadConsumer();

    constructor(address admin_) {
        admin = admin_;
    }

    function setConsumer(address next) external {
        if (msg.sender != admin) revert NotAdmin();
        if (next == address(0) || consumer != address(0)) revert BadConsumer();
        consumer = next;
    }

    function consumeAac(bytes32 aacId) external {
        if (msg.sender != consumer) revert NotConsumer();
        consumedCount++;
        lastAacId = aacId;
    }
}
