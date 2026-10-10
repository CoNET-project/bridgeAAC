// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacHeaderCommitment.sol";

interface IConetLightClientProofVerifier {
    function verifyFinality(bytes calldata proof)
        external
        view
        returns (
            bool valid,
            uint256 finalizedEpoch,
            uint256 executionBlockNumber,
            bytes32 executionBlockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot,
            bytes32 genesisValidatorsRoot,
            uint256 participants,
            uint256 committeeSize,
            bool stateRootBound,
            bool committeeHandoff,
            bool trustedCommittee,
            uint256 forcedUpdates
        );
}

/// @notice Fail-closed CoNET finality orchestration boundary.
/// @dev The injected proof verifier must perform the actual BLS/SSZ light
/// client verification. This contract does not authorize asset effects.
contract AacConetFinalityVerifier {
    uint256 public constant CONET_CHAIN_ID = 224422;
    bytes32 public immutable expectedGenesisValidatorsRoot;
    address public immutable proofVerifier;

    error InvalidConfiguration();
    error InvalidFinality();
    error WrongGenesisRoot();
    error MissingStateBinding();
    error MissingCommitteeHandoff();
    error UntrustedCommittee();
    error ForcedUpdate();
    error InsufficientQuorum();

    constructor(bytes32 genesisRoot_, address proofVerifier_) {
        if (genesisRoot_ == bytes32(0) || proofVerifier_ == address(0)) {
            revert InvalidConfiguration();
        }
        expectedGenesisValidatorsRoot = genesisRoot_;
        proofVerifier = proofVerifier_;
    }

    function verifyHeader(bytes calldata proof)
        external
        view
        returns (AacHeaderCommitment.Commitment memory commitment)
    {
        (
            bool valid,
            uint256 finalizedEpoch,
            uint256 executionBlockNumber,
            bytes32 executionBlockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot,
            bytes32 genesisValidatorsRoot,
            uint256 participants,
            uint256 committeeSize,
            bool stateRootBound,
            bool committeeHandoff,
            bool trustedCommittee,
            uint256 forcedUpdates
        ) = IConetLightClientProofVerifier(proofVerifier).verifyFinality(proof);

        if (!valid || finalizedEpoch == 0 || executionBlockNumber == 0) {
            revert InvalidFinality();
        }
        if (genesisValidatorsRoot != expectedGenesisValidatorsRoot) {
            revert WrongGenesisRoot();
        }
        if (!stateRootBound) revert MissingStateBinding();
        if (!committeeHandoff) revert MissingCommitteeHandoff();
        if (!trustedCommittee) revert UntrustedCommittee();
        if (forcedUpdates != 0) revert ForcedUpdate();
        if (committeeSize == 0 || participants * 3 < committeeSize * 2) {
            revert InsufficientQuorum();
        }
        if (executionBlockHash == bytes32(0) || stateRoot == bytes32(0) || receiptsRoot == bytes32(0)) {
            revert InvalidFinality();
        }

        return AacHeaderCommitment.Commitment({
            sourceChainId: CONET_CHAIN_ID,
            finalityHeight: finalizedEpoch,
            blockNumber: executionBlockNumber,
            blockHash: executionBlockHash,
            stateRoot: stateRoot,
            receiptsRoot: receiptsRoot,
            finalityDigest: keccak256(
                abi.encode(genesisValidatorsRoot, finalizedEpoch, executionBlockHash, forcedUpdates)
            )
        });
    }
}
