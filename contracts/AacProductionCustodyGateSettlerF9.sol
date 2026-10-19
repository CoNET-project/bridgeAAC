// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateSettlerF5.sol";
import "./AacCheckpointMessageCoverV2.sol";

interface IAacBridgePayeeF9 {
    function payee(bytes calldata receipt, uint256 logIndex) external pure returns (address beneficiary, uint256 gross);
}

interface IAacGateF9ConetInclusion {
    function coverConet(
        IAacConetMessageInclusionF5.Aggregate calldata input,
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetMessageInclusionF5.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool aggregateOk_);
}

interface IAacGbBridgePausedF9 {
    function bridgePaused() external view returns (bool);
}

/// @notice F9 settler: F8 with the Base path moved to the light-client cover.
/// @dev Base-origin messages are no longer checked by `AacAuthenticatedHeaderGate`
///      and its `AacHeaderAuthority`. They go to `AacCheckpointMessageCoverV2` with an
///      L1 output-root anchor, which authenticates the Base header itself and then
///      checks the finalized beacon proof. CoNET-origin messages keep the existing
///      `CONET_GATE`, so they still depend on the header authority (C1 for CoNET headers).
///      Storage layout is identical to F8 (same base contract and the same appended
///      variables). Immutables do not occupy storage, so the live proxy can upgrade to
///      this implementation after the owner schedule.
///      C3: GB.mintPaid is refused while the GB bridge is paused.
///      mintTo must be the single beneficiary proven in the same receipt.
///      upgradeTo requires a 48h owner schedule.
contract AacProductionCustodyGateSettlerF9 is AacProductionCustodyGateBridge {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address public constant CONSUME = 0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F;
    address public constant GB = 0xC3EF02DaE632b4C10abB66e07d92a387c10838D8;
    uint256 public constant UPGRADE_DELAY = 2 days;

    address public immutable PAYEE;
    address public immutable BASE_COVER;
    address public immutable CONET_GATE;
    address private immutable implSelf = address(this);

    address public pendingImplementation;
    uint256 public upgradeReadyAt;
    address public pendingOwner;

    uint8 private constant ORIGIN_BASE = 1;
    uint8 private constant ORIGIN_CONET = 2;
    uint8 private constant ACTION_MINT = 1;

    error GateFailed();
    error BridgePaused();
    error ConsumeFailed();
    error BadMintTo();
    error UpgradeNotReady();
    error NotPendingOwner();

    event Settled(bytes32 indexed operationId, uint256 amount, uint8 origin);
    event Minted(bytes32 indexed operationId, address indexed to, uint256 amount);

    constructor(address payee_, address baseCover_, address conetGate_) {
        if (payee_ == address(0) || baseCover_ == address(0) || conetGate_ == address(0)) revert BadAddress();
        PAYEE = payee_;
        BASE_COVER = baseCover_;
        CONET_GATE = conetGate_;
    }

    function settle(
        AacCheckpointMessageCoverV2.L1Anchor calldata anchor,
        IAacCheckpointStoreV2.Aggregate calldata input,
        IAacCheckpointStoreV2.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointStoreV2.Header[] calldata beaconHeaders,
        address mintTo,
        address effect
    ) external returns (bytes32 operationId, uint256 amount) {
        return _settleCover(
            anchor,
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

    function settleBridge(
        AacCheckpointMessageCoverV2.L1Anchor calldata anchor,
        IAacCheckpointStoreV2.Aggregate calldata input,
        IAacCheckpointStoreV2.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointStoreV2.Header[] calldata beaconHeaders,
        address mintTo,
        address effect
    ) external returns (bytes32 operationId, uint256 amount) {
        return _settleCover(
            anchor,
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
        bool covered;
        bool aggregateOk_;
        (operationId, amount, covered, aggregateOk_) = IAacGateF9ConetInclusion(CONET_GATE).coverConet(
            input, conetHeaderRlp, receiptRlp, proofNodes, receiptIndex, logIndex, beaconHeaders
        );
        if (!covered || !aggregateOk_ || operationId == bytes32(0) || amount == 0) revert GateFailed();
        _consumeThenMint(operationId, amount, mintTo, effect, receiptRlp, logIndex);
        emit Settled(operationId, amount, ORIGIN_CONET);
    }

    function scheduleUpgrade(address newImplementation) external {
        if (msg.sender != owner) revert NotOwner();
        if (newImplementation == address(0) || newImplementation.code.length == 0) revert BadAddress();
        pendingImplementation = newImplementation;
        upgradeReadyAt = block.timestamp + UPGRADE_DELAY;
    }

    function cancelUpgrade() external {
        if (msg.sender != owner) revert NotOwner();
        pendingImplementation = address(0);
        upgradeReadyAt = 0;
    }

    function upgradeTo(address newImplementation) external override {
        if (msg.sender != owner) revert NotOwner();
        if (address(this) == implSelf) revert NotProxy();
        if (_currentImplementation() != implSelf) revert NotProxy();
        if (newImplementation == address(0) || newImplementation != pendingImplementation) revert BadAddress();
        if (newImplementation.code.length == 0) revert BadAddress();
        if (upgradeReadyAt == 0 || block.timestamp < upgradeReadyAt) revert UpgradeNotReady();
        pendingImplementation = address(0);
        upgradeReadyAt = 0;
        assembly ("memory-safe") {
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, newImplementation)
        }
    }

    function transferOwnership(address nextOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (nextOwner == address(0)) revert BadAddress();
        pendingOwner = nextOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function _settleCover(
        AacCheckpointMessageCoverV2.L1Anchor calldata anchor,
        IAacCheckpointStoreV2.Aggregate calldata input,
        IAacCheckpointStoreV2.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointStoreV2.Header[] calldata beaconHeaders,
        address mintTo,
        address effect
    ) private returns (bytes32 operationId, uint256 amount) {
        bool covered;
        bool headerFinal_;
        (operationId, amount, covered, headerFinal_) = AacCheckpointMessageCoverV2(BASE_COVER).cover(
            anchor,
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
        _consumeThenMint(operationId, amount, mintTo, effect, receiptRlp, logIndex);
        emit Settled(operationId, amount, ORIGIN_BASE);
    }

    function _consumeThenMint(
        bytes32 operationId,
        uint256 amount,
        address mintTo,
        address effect,
        bytes calldata receiptRlp,
        uint256 logIndex
    ) private {
        if (effect == address(0)) revert ConsumeFailed();
        (address beneficiary, uint256 gross) = IAacBridgePayeeF9(PAYEE).payee(receiptRlp, logIndex);
        if (mintTo == address(0) || mintTo != beneficiary || gross != amount) revert BadMintTo();
        bytes32 header = keccak256(abi.encodePacked(operationId, uint8(1)));
        bytes32 root = keccak256(abi.encodePacked(operationId, uint8(2)));
        IAacProductionConsumeOnceF5(CONSUME).consumeFromSettler(
            operationId, header, root, operationId, ACTION_MINT, amount, effect
        );
        if (IAacGbBridgePausedF9(GB).bridgePaused()) revert BridgePaused();
        IGbTokenMintPaidF5(GB).mintPaid(mintTo, amount);
        emit Minted(operationId, mintTo, amount);
    }

    function _currentImplementation() private view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            impl := sload(slot)
        }
    }
}
