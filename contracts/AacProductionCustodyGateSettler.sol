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

/// @notice CoNET-origin inclusion cover (F2): Aggregate + CoNET EL + receipt MPT.
interface IAacConetMessageInclusion {
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
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool aggregateOk_);
}

/// @notice Consume-once consumer (F3): mark mint/release after Settler proof.
interface IAacProductionConsumeOnce {
    function consumeFromSettler(
        bytes32 id,
        bytes32 header,
        bytes32 root,
        bytes32 leaf,
        uint8 action,
        uint256 amount,
        address effect
    ) external;
}

/// @notice Obstacle 5 settler for the production custody proxy (F3).
/// @dev Storage layout matches Beacon/Bridge (initialized, owner, proofLink, __gap).
///      After COVER / Inclusion proof, same tx calls ConsumeOnce.consumeFromSettler.
///      Does not open custody, does not grant Treasury/GB/Peer, does not mint GB
///      (GB.admins(AAC) stays false until F5). Settled emits only after consume.
contract AacProductionCustodyGateSettler is AacProductionCustodyGateBridge {
    address public constant COVER = 0x01506527a4Dab14141038Db15f5341dcF4729233;
    /// @dev Patched by executeF2ConetInclusion.mjs after AacConetMessageInclusion deploy.
    address public constant CONET_INCLUSION = 0x7064860E3594aE120f71700B2F46151c6D370559;
    /// @dev Consume-once proxy (F3). Gateway must be this AAC proxy.
    address public constant CONSUME = 0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F;

    uint8 private constant ORIGIN_BASE = 1;
    uint8 private constant ORIGIN_CONET = 2;
    uint8 private constant ACTION_MINT = 1;

    error GateFailed();
    error ConsumeFailed();

    event Settled(bytes32 indexed operationId, uint256 amount, uint8 origin);

    /// @notice Base-origin settle: COVER proof then consume-once (same tx).
    function settle(
        IAacCheckpointMessageCover.Aggregate calldata input,
        IAacCheckpointMessageCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders,
        address effect
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
            beaconHeaders,
            effect
        );
    }

    /// @notice Base-origin settleBridge: same COVER + consume gate as settle.
    function settleBridge(
        IAacCheckpointMessageCover.Aggregate calldata input,
        IAacCheckpointMessageCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders,
        address effect
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
            beaconHeaders,
            effect
        );
    }

    /// @notice CoNET-origin settle: Inclusion proof then consume-once (same tx).
    function settleFromConet(
        IAacConetMessageInclusion.Aggregate calldata input,
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetMessageInclusion.Header[] calldata beaconHeaders,
        address effect
    ) external returns (bytes32 operationId, uint256 amount) {
        if (CONET_INCLUSION == address(0)) revert GateFailed();
        bool covered;
        bool aggregateOk_;
        (operationId, amount, covered, aggregateOk_) = IAacConetMessageInclusion(CONET_INCLUSION).cover(
            input,
            conetHeaderRlp,
            receiptRlp,
            proofNodes,
            receiptIndex,
            logIndex,
            beaconHeaders
        );
        if (!covered || !aggregateOk_ || operationId == bytes32(0) || amount == 0) revert GateFailed();
        _consumeAfterProof(operationId, amount, effect);
        emit Settled(operationId, amount, ORIGIN_CONET);
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
        IAacCheckpointMessageCover.Header[] calldata beaconHeaders,
        address effect
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
        _consumeAfterProof(operationId, amount, effect);
        emit Settled(operationId, amount, ORIGIN_BASE);
    }

    /// @dev Bind consume id to the proven operationId; effect runs under ConsumeOnce lock.
    function _consumeAfterProof(bytes32 operationId, uint256 amount, address effect) private {
        if (effect == address(0)) revert ConsumeFailed();
        bytes32 header = keccak256(abi.encodePacked(operationId, uint8(1)));
        bytes32 root = keccak256(abi.encodePacked(operationId, uint8(2)));
        IAacProductionConsumeOnce(CONSUME).consumeFromSettler(
            operationId,
            header,
            root,
            operationId,
            ACTION_MINT,
            amount,
            effect
        );
    }
}
