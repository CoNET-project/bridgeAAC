// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacHeaderCommitment.sol";

/// @notice Verifies one Base header against an Ethereum L1 output anchor.
/// @dev The two proof contracts are deliberately injected dependencies. This
/// orchestrator is fail-closed until audited L1/output and Base-header proof
/// implementations are deployed and wired.
interface IBaseOutputAnchorProofVerifier {
    function verifyOutputAnchor(
        address anchorRegistry,
        bytes calldata proof
    )
        external
        view
        returns (
            bool valid,
            bytes32 outputRoot,
            bytes32 stateRoot,
            bytes32 blockHash,
            uint256 anchorL2
        );
}

interface IBaseHeaderProofVerifier {
    function verifyHeader(bytes calldata proof)
        external
        view
        returns (
            bool valid,
            uint256 blockNumber,
            bytes32 blockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot
        );
}

contract AacBaseFinalityVerifier {
    uint256 public constant BASE_CHAIN_ID = 8453;

    address public immutable anchorRegistry;
    address public immutable outputAnchorVerifier;
    address public immutable headerProofVerifier;

    error InvalidConfiguration();
    error InvalidAnchor();
    error InvalidHeader();
    error FutureBlock();
    error HeaderBindingMismatch();

    constructor(
        address anchorRegistry_,
        address outputAnchorVerifier_,
        address headerProofVerifier_
    ) {
        if (
            anchorRegistry_ == address(0) ||
            outputAnchorVerifier_ == address(0) ||
            headerProofVerifier_ == address(0)
        ) revert InvalidConfiguration();
        anchorRegistry = anchorRegistry_;
        outputAnchorVerifier = outputAnchorVerifier_;
        headerProofVerifier = headerProofVerifier_;
    }

    /// @notice Return a header commitment only when both proof layers agree.
    /// @dev This function is read-only. It does not update a checkpoint or
    /// authorize an asset effect by itself.
    function verifyHeader(
        bytes calldata outputAnchorProof,
        bytes calldata baseHeaderProof
    ) external view returns (AacHeaderCommitment.Commitment memory commitment) {
        (
            bool anchorValid,
            bytes32 outputRoot,
            bytes32 anchorStateRoot,
            bytes32 anchorBlockHash,
            uint256 anchorL2
        ) = IBaseOutputAnchorProofVerifier(outputAnchorVerifier).verifyOutputAnchor(
                anchorRegistry,
                outputAnchorProof
            );
        if (!anchorValid || outputRoot == bytes32(0) || anchorL2 == 0) {
            revert InvalidAnchor();
        }

        (
            bool headerValid,
            uint256 blockNumber,
            bytes32 blockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot
        ) = IBaseHeaderProofVerifier(headerProofVerifier).verifyHeader(baseHeaderProof);
        if (
            !headerValid ||
            blockNumber == 0 ||
            blockHash == bytes32(0) ||
            stateRoot == bytes32(0) ||
            receiptsRoot == bytes32(0)
        ) revert InvalidHeader();
        if (blockNumber > anchorL2) revert FutureBlock();
        if (blockHash != anchorBlockHash || stateRoot != anchorStateRoot) {
            revert HeaderBindingMismatch();
        }

        return AacHeaderCommitment.Commitment({
            sourceChainId: BASE_CHAIN_ID,
            finalityHeight: anchorL2,
            blockNumber: blockNumber,
            blockHash: blockHash,
            stateRoot: stateRoot,
            receiptsRoot: receiptsRoot,
            finalityDigest: keccak256(abi.encode(outputRoot, anchorL2))
        });
    }
}
