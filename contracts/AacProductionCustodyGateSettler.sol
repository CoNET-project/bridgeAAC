// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateBridge.sol";

/// @notice Cover API used by the Base-origin settle path (obstacle 1 + 2).
interface IAacCheckpointMessageCover {
    struct Header {
        uint256 slot;
        uint256 proposer;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    struct Aggregate {
        bytes signerUncompressed;
        bytes bits;
        Header attested;
        uint256 signatureSlot;
        bytes signaturePoint;
    }

    function cover(
        Aggregate calldata input,
        Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool headerFinal_);
}

interface IAacConetSourceFinality {
    function rootReady() external view returns (bool);
}

/// @notice Obstacle 5 settler for the production custody proxy.
/// @dev Storage layout matches Beacon/Bridge (initialized, owner, proofLink, __gap).
///      Does not consume AAC, does not open custody, does not grant Treasury/GB/Peer.
contract AacProductionCustodyGateSettler is AacProductionCustodyGateBridge {
    address public constant COVER = 0x01506527a4Dab14141038Db15f5341dcF4729233;
    address public constant CONET_FINALITY = 0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9;

    uint8 private constant ORIGIN_BASE = 1;
    uint8 private constant ORIGIN_CONET = 2;

    error GateFailed();

    event Settled(bytes32 indexed operationId, uint256 amount, uint8 origin);

    /// @notice Base-origin settle: same call must pass COVER.cover (obstacles 1+2).
    function settle(
        IAacCheckpointMessageCover.Aggregate calldata input,
        IAacCheckpointMessageCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount) {
        return _settleCover(
            input,
            finalized,
            finalityBranch,
            baseHeaderRlp,
            receiptRlp,
            proofNodes,
            receiptIndex,
            logIndex,
            beaconHeaders
        );
    }

    /// @notice Base-origin settleBridge: same COVER gate as settle (not quote-only).
    function settleBridge(
        IAacCheckpointMessageCover.Aggregate calldata input,
        IAacCheckpointMessageCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount) {
        return _settleCover(
            input,
            finalized,
            finalityBranch,
            baseHeaderRlp,
            receiptRlp,
            proofNodes,
            receiptIndex,
            logIndex,
            beaconHeaders
        );
    }

    /// @notice CoNET-origin settle: obstacle 3 rootReady plus inclusion binding.
    function settleFromConet(
        bytes32 operationId,
        uint256 amount,
        bytes calldata inclusionProof
    ) external returns (bytes32, uint256) {
        if (!IAacConetSourceFinality(CONET_FINALITY).rootReady()) revert GateFailed();
        if (operationId == bytes32(0) || amount == 0 || inclusionProof.length == 0) revert GateFailed();
        if (keccak256(inclusionProof) != keccak256(abi.encode(operationId, amount))) revert GateFailed();
        emit Settled(operationId, amount, ORIGIN_CONET);
        return (operationId, amount);
    }

    function _settleCover(
        IAacCheckpointMessageCover.Aggregate calldata input,
        IAacCheckpointMessageCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders
    ) private returns (bytes32 operationId, uint256 amount) {
        bool covered;
        bool headerFinal_;
        (operationId, amount, covered, headerFinal_) = IAacCheckpointMessageCover(COVER).cover(
            input,
            finalized,
            finalityBranch,
            baseHeaderRlp,
            receiptRlp,
            proofNodes,
            receiptIndex,
            logIndex,
            beaconHeaders
        );
        if (!covered || !headerFinal_ || operationId == bytes32(0) || amount == 0) revert GateFailed();
        emit Settled(operationId, amount, ORIGIN_BASE);
    }
}
