// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateBridge.sol";

/// @notice Cover API used by the Base-origin settle path (obstacle 1 + 2).
interface IAacCheckpointMessageCoverF5 {
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
interface IAacConetMessageInclusionF5 {
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
interface IAacProductionConsumeOnceF5 {
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

interface IGbTokenMintPaidF5 {
    function mintPaid(address to, uint256 amount) external;
}

/// @notice F5 settler: COVER / Inclusion proof → consume-once → GB.mintPaid (same tx).
/// @dev Storage layout matches Beacon/Bridge (initialized, owner, proofLink, __gap).
///      Custody views (`custodyOpen` / `headerFinal` / no-arg `settle`) stay closed.
///      Requires `GB.admins(AAC proxy)` on the mint chain (CoNET + Base re-grant at F5).
///      `msg.sender` on GB is this proxy after `upgradeTo` (same as Phase C canary).
///      Does not grant Treasury/Peer, does not flip custodyOpen, does not unpause
///      miner `voteBridgeMint` (Phase D pause stays).
contract AacProductionCustodyGateSettlerF5 is AacProductionCustodyGateBridge {
    address public constant COVER = 0x01506527a4Dab14141038Db15f5341dcF4729233;
    address public constant CONET_INCLUSION = 0x7064860E3594aE120f71700B2F46151c6D370559;
    address public constant CONSUME = 0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F;
    /// @notice Same CREATE2 GB on CoNET and Base (9 decimals; 1e9 = 1 GB).
    address public constant GB = 0xC3EF02DaE632b4C10abB66e07d92a387c10838D8;

    uint8 private constant ORIGIN_BASE = 1;
    uint8 private constant ORIGIN_CONET = 2;
    uint8 private constant ACTION_MINT = 1;

    error GateFailed();
    error ConsumeFailed();
    error BadMintTo();

    event Settled(bytes32 indexed operationId, uint256 amount, uint8 origin);
    event Minted(bytes32 indexed operationId, address indexed to, uint256 amount);

    /// @notice Base-origin settle: COVER → consume → mintPaid(mintTo, amount).
    function settle(
        IAacCheckpointMessageCoverF5.Aggregate calldata input,
        IAacCheckpointMessageCoverF5.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCoverF5.Header[] calldata beaconHeaders,
        address mintTo,
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
            mintTo,
            effect
        );
    }

    /// @notice Base-origin settleBridge: same COVER + consume + mint as settle.
    function settleBridge(
        IAacCheckpointMessageCoverF5.Aggregate calldata input,
        IAacCheckpointMessageCoverF5.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCoverF5.Header[] calldata beaconHeaders,
        address mintTo,
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
            mintTo,
            effect
        );
    }

    /// @notice CoNET-origin settle: Inclusion → consume → mintPaid(mintTo, amount).
    function settleFromConet(
        IAacConetMessageInclusionF5.Aggregate calldata input,
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetMessageInclusionF5.Header[] calldata beaconHeaders,
        address mintTo,
        address effect
    ) external returns (bytes32 operationId, uint256 amount) {
        if (CONET_INCLUSION == address(0)) revert GateFailed();
        bool covered;
        bool aggregateOk_;
        (operationId, amount, covered, aggregateOk_) = IAacConetMessageInclusionF5(CONET_INCLUSION).cover(
            input,
            conetHeaderRlp,
            receiptRlp,
            proofNodes,
            receiptIndex,
            logIndex,
            beaconHeaders
        );
        if (!covered || !aggregateOk_ || operationId == bytes32(0) || amount == 0) revert GateFailed();
        _consumeThenMint(operationId, amount, mintTo, effect);
        emit Settled(operationId, amount, ORIGIN_CONET);
    }

    function _settleCover(
        IAacCheckpointMessageCoverF5.Aggregate calldata input,
        IAacCheckpointMessageCoverF5.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointMessageCoverF5.Header[] calldata beaconHeaders,
        address mintTo,
        address effect
    ) private returns (bytes32 operationId, uint256 amount) {
        bool covered;
        bool headerFinal_;
        (operationId, amount, covered, headerFinal_) = IAacCheckpointMessageCoverF5(COVER).cover(
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
        _consumeThenMint(operationId, amount, mintTo, effect);
        emit Settled(operationId, amount, ORIGIN_BASE);
    }

    /// @dev Consume-once first (AlreadyConsumed if replay), then mint from this proxy.
    function _consumeThenMint(bytes32 operationId, uint256 amount, address mintTo, address effect) private {
        if (effect == address(0)) revert ConsumeFailed();
        if (mintTo == address(0)) revert BadMintTo();
        bytes32 header = keccak256(abi.encodePacked(operationId, uint8(1)));
        bytes32 root = keccak256(abi.encodePacked(operationId, uint8(2)));
        IAacProductionConsumeOnceF5(CONSUME).consumeFromSettler(
            operationId,
            header,
            root,
            operationId,
            ACTION_MINT,
            amount,
            effect
        );
        IGbTokenMintPaidF5(GB).mintPaid(mintTo, amount);
        emit Minted(operationId, mintTo, amount);
    }
}
