// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseAnchorReceiptRoot {
    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof
    )
        external
        view
        returns (
            bytes32 outputRoot,
            bytes32 baseBlockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot,
            uint256 l2SequenceNumber,
            bool headerFinal
        );
}

interface IAacReceiptMptVerifier {
    function verifyReceipt(
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes
    ) external pure returns (bool);
}

/// @notice Proves one Base receipt is inside the receipts root already bound
/// to the pinned anchor output root.
/// @dev Inclusion is not Ethereum beacon finality, so `headerFinal` stays false.
contract AacBaseAnchorReceiptInclusion {
    address public immutable receiptRootProof;
    address public immutable receiptVerifier;

    error InvalidProof();
    error UnexpectedFinality();

    constructor(address receiptRootProof_, address receiptVerifier_) {
        if (receiptRootProof_ == address(0) || receiptVerifier_ == address(0)) revert InvalidProof();
        receiptRootProof = receiptRootProof_;
        receiptVerifier = receiptVerifier_;
    }

    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof,
        uint64 receiptIndex,
        bytes calldata receiptValue,
        bytes[] calldata receiptProof
    )
        external
        view
        returns (
            bytes32 receiptsRoot,
            bytes32 outputRoot,
            uint64 includedIndex,
            bytes32 receiptHash,
            uint256 l2SequenceNumber,
            bool headerFinal
        )
    {
        bool innerFinal;
        (outputRoot, , , receiptsRoot, l2SequenceNumber, innerFinal) = IAacBaseAnchorReceiptRoot(receiptRootProof)
            .verify(ethereumHeaderRlp, gameAccountProof, gameCode, baseHeaderRlp, messagePasserProof);
        if (innerFinal) revert UnexpectedFinality();
        bool included = IAacReceiptMptVerifier(receiptVerifier).verifyReceipt(
            receiptsRoot,
            receiptIndex,
            receiptValue,
            receiptProof
        );
        if (!included) revert InvalidProof();
        includedIndex = receiptIndex;
        receiptHash = keccak256(receiptValue);
        headerFinal = false;
    }
}
