// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateSettlerF5.sol";

interface IAacHeaderAuthority {
    function isAuthenticated(uint256 chainId, bytes32 headerHash) external view returns (bool);
}

/// @notice Refuses any source header that the authority has not authenticated,
///         then forwards to the existing cover or inclusion contract.
/// @dev This closes C1 at the call boundary. The covers still read receiptsRoot
///      from the header, but only after the header hash is authenticated.
///      Two instances are needed: one points at the Base-header cover used by
///      the Base settler, and one at the cover used by the CoNET settler.
contract AacAuthenticatedHeaderGate {
    uint256 public constant BASE_CHAIN_ID = 8453;
    uint256 public constant CONET_CHAIN_ID = 224422;

    IAacHeaderAuthority public immutable AUTHORITY;
    address public immutable BASE_COVER;
    address public immutable CONET_INCLUSION;

    error BadAddress();
    error HeaderNotAuthenticated();

    constructor(address authority_, address baseCover_, address conetInclusion_) {
        if (authority_ == address(0) || baseCover_ == address(0) || conetInclusion_ == address(0)) {
            revert BadAddress();
        }
        AUTHORITY = IAacHeaderAuthority(authority_);
        BASE_COVER = baseCover_;
        CONET_INCLUSION = conetInclusion_;
    }

    /// @dev Same signature as `IAacCheckpointMessageCoverF5.cover` and
    ///      `IAacConetBaseCover.cover`, so existing settlers can call it unchanged.
    function cover(
        IAacCheckpointMessageCoverF5.Aggregate calldata input,
        IAacCheckpointMessageCoverF5.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCoverF5.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool headerFinal_) {
        if (!AUTHORITY.isAuthenticated(BASE_CHAIN_ID, keccak256(baseHeaderRlp))) revert HeaderNotAuthenticated();
        return IAacCheckpointMessageCoverF5(BASE_COVER).cover(
            input, finalized, finalityBranch, baseHeaderRlp, receiptRlp, proofNodes, receiptIndex, logIndex, beaconHeaders
        );
    }

    /// @notice CoNET-origin inclusion. The CoNET execution header must be authenticated.
    function coverConet(
        IAacConetMessageInclusionF5.Aggregate calldata input,
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetMessageInclusionF5.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool aggregateOk_) {
        if (!AUTHORITY.isAuthenticated(CONET_CHAIN_ID, keccak256(conetHeaderRlp))) revert HeaderNotAuthenticated();
        return IAacConetMessageInclusionF5(CONET_INCLUSION).cover(
            input, conetHeaderRlp, receiptRlp, proofNodes, receiptIndex, logIndex, beaconHeaders
        );
    }
}
