// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateBeacon.sol";

struct AacBridgeHeader {
    uint64 slot;
    uint64 proposerIndex;
    bytes32 parentRoot;
    bytes32 stateRoot;
    bytes32 bodyRoot;
}

interface IAacBaseBridgeBeaconCheckpointExtension {
    function verify(
        bytes calldata headerRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        AacBridgeHeader[] calldata bridgeHeaders,
        AacBridgeHeader[] calldata extensionHeaders
    )
        external
        view
        returns (
            bytes32 baseBlockHash,
            bytes32 operationId,
            bytes32 bridgeBeaconRoot,
            bytes32 checkpointRoot,
            uint256 links,
            bool headerFinal
        );
}

/// @notice Closed production gate that can quote the 0.01 USDC bridge proof.
/// @dev Storage layout matches the previous implementation. `settle` and
/// `settleBridge` revert. This upgrade does not open custody.
contract AacProductionCustodyGateBridge is AacProductionCustodyGateBeacon {
    address public constant BRIDGE_EXTENSION = 0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b;
    bytes32 public constant BRIDGE_BLOCK_HASH =
        0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08;
    bytes32 public constant BRIDGE_OPERATION_ID =
        0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654;
    bytes32 public constant BRIDGE_BEACON_ROOT =
        0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5;
    bytes32 public constant BRIDGE_CHECKPOINT_ROOT =
        0x480505bce46a8902cd88c95f6a2a3d9998c8cbdffd25f9c4aa7ef81d3a5e6453;
    uint256 public constant BRIDGE_LINKS = 580;

    function quoteBridge(
        bytes calldata headerRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        AacBridgeHeader[] calldata bridgeHeaders,
        AacBridgeHeader[] calldata extensionHeaders
    )
        external
        view
        returns (
            bytes32 baseBlockHash,
            bytes32 operationId,
            bytes32 bridgeBeaconRoot,
            bytes32 checkpointRoot,
            uint256 links,
            bool headerFinal_
        )
    {
        bool reportedFinal;
        (baseBlockHash, operationId, bridgeBeaconRoot, checkpointRoot, links, reportedFinal) =
            IAacBaseBridgeBeaconCheckpointExtension(BRIDGE_EXTENSION).verify(
                headerRlp, receiptRlp, proofNodes, bridgeHeaders, extensionHeaders
            );
        if (reportedFinal) revert UnexpectedFinality();
        if (
            baseBlockHash != BRIDGE_BLOCK_HASH || operationId != BRIDGE_OPERATION_ID
                || bridgeBeaconRoot != BRIDGE_BEACON_ROOT || checkpointRoot != BRIDGE_CHECKPOINT_ROOT
                || links != BRIDGE_LINKS
        ) revert InvalidQuote();
        headerFinal_ = false;
    }

    function settleBridge(
        bytes calldata headerRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        AacBridgeHeader[] calldata bridgeHeaders,
        AacBridgeHeader[] calldata extensionHeaders
    ) external view {
        this.quoteBridge(headerRlp, receiptRlp, proofNodes, bridgeHeaders, extensionHeaders);
        revert CustodyClosed();
    }
}
