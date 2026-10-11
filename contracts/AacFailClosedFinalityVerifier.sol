// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacHeaderCommitment.sol";

/// @notice Finality placeholder that always rejects proofs.
/// @dev Used by the paused mainnet canary so registration cannot succeed
/// before a trustless Base/CoNET finality verifier exists.
contract AacFailClosedFinalityVerifier {
    error FinalityNotConfigured();

    function verifyHeader(bytes calldata)
        external
        pure
        returns (AacHeaderCommitment.Commitment memory)
    {
        revert FinalityNotConfigured();
    }

    function verifyHeader(bytes calldata, bytes calldata)
        external
        pure
        returns (AacHeaderCommitment.Commitment memory)
    {
        revert FinalityNotConfigured();
    }
}
