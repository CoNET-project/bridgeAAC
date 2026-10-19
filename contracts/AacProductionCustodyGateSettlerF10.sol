// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateSettlerF5.sol";
import "./AacCheckpointMessageCoverV2.sol";
import "./AacBridgeReceiptLog.sol";

interface IAacBridgePayeeF9 {
    function payee(bytes calldata receipt, uint256 logIndex) external pure returns (address beneficiary, uint256 gross);
}

interface IAacConetAuthenticatorF10 {
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

    function authenticate(
        Aggregate calldata aggregate,
        Header calldata finalized,
        bytes32[] calldata finalityBranch,
        Header[] calldata beaconChain,
        bytes32[] calldata payloadBranch,
        bytes calldata headerRlp
    ) external view returns (bytes32 headerHash, bytes32 receiptsRoot);
}

interface IAacReceiptVerifierF10 {
    function verifyReceipt(bytes32 receiptsRoot, uint64 receiptIndex, bytes calldata receiptRlp, bytes[] calldata proofNodes)
        external
        pure
        returns (bool);
}

interface IAacGbBridgePausedF9 {
    function bridgePaused() external view returns (bool);
}

/// @notice F10 settler: F9 with the CoNET path moved to the in-call CoNET header authenticator.
/// @dev Base-origin messages use AacCheckpointMessageCoverV2 (unchanged from F9). CoNET-origin
///      messages are authenticated by AacConetHeaderAuthenticator (BLS, finality, beacon chain,
///      payload, keccak binding), so neither origin depends on AacHeaderAuthority.
///      Storage layout is identical to F9 and F8 (same base contract and the same appended
///      variables). Immutables do not occupy storage, so the live proxy can upgrade to
///      this implementation after the owner schedule. Nothing here is deployed or scheduled.
///      C3: GB.mintPaid is refused while the GB bridge is paused.
///      mintTo must be the single beneficiary proven in the same receipt.
///      upgradeTo requires a 48h owner schedule.
contract AacProductionCustodyGateSettlerF10 is AacProductionCustodyGateBridge {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address public constant CONSUME = 0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F;
    address public constant GB = 0xC3EF02DaE632b4C10abB66e07d92a387c10838D8;
    uint256 public constant UPGRADE_DELAY = 2 days;

    address public immutable PAYEE;
    address public immutable BASE_COVER;
    address public immutable CONET_AUTH;
    address public constant RECEIPT_VERIFIER = 0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10;
    address public constant TREASURY = 0xa208982212978550594A7FEEB70a61665d129003;
    bytes32 public constant BRIDGE_TOPIC =
        0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba;
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

    constructor(address payee_, address baseCover_, address conetAuthenticator_) {
        if (payee_ == address(0) || baseCover_ == address(0) || conetAuthenticator_ == address(0)) revert BadAddress();
        PAYEE = payee_;
        BASE_COVER = baseCover_;
        CONET_AUTH = conetAuthenticator_;
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
        IAacConetAuthenticatorF10.Aggregate calldata aggregate,
        IAacConetAuthenticatorF10.Header calldata finalized,
        bytes32[] calldata finalityBranch,
        IAacConetAuthenticatorF10.Header[] calldata beaconChain,
        bytes32[] calldata payloadBranch,
        bytes calldata conetHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        address mintTo,
        address effect
    ) external returns (bytes32 operationId, uint256 amount) {
        (, bytes32 receiptsRoot) = IAacConetAuthenticatorF10(CONET_AUTH).authenticate(
            aggregate, finalized, finalityBranch, beaconChain, payloadBranch, conetHeaderRlp
        );
        if (!IAacReceiptVerifierF10(RECEIPT_VERIFIER).verifyReceipt(receiptsRoot, receiptIndex, receiptRlp, proofNodes)) {
            revert GateFailed();
        }
        operationId = AacBridgeReceiptLog.operationId(receiptRlp, logIndex, TREASURY, BRIDGE_TOPIC);
        amount = AacBridgeReceiptLog.amount(receiptRlp, logIndex);
        if (operationId == bytes32(0) || amount == 0) revert GateFailed();
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
