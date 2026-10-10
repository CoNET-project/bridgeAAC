// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacHeaderCommitment.sol";
import "./AacDestinationConsumerInterfaces.sol";

interface IAacBaseFinalityCommitment {
    function verifyHeader(bytes calldata outputAnchorProof, bytes calldata headerProof)
        external
        view
        returns (AacHeaderCommitment.Commitment memory);
}

interface IAacConetFinalityCommitment {
    function verifyHeader(bytes calldata proof)
        external
        view
        returns (AacHeaderCommitment.Commitment memory);
}

/// @notice Testnet-only M4 consumer wiring proof.
/// @dev This contract is deliberately not an asset custody implementation.
/// Adapters are caller-supplied test contracts and no canonical asset role is
/// assigned here.
contract AacDestinationConsumerTestnet {
    uint256 public constant BASE_CHAIN_ID = 8453;
    uint256 public constant CONET_CHAIN_ID = 224422;

    enum Status {
        None,
        Verified,
        Consumed
    }

    struct Record {
        bytes32 aacId;
        uint8 assetKind;
        uint256 sourceChainId;
        uint256 destinationChainId;
        address sourceGateway;
        address sourceAsset;
        address destinationAsset;
        address recipient;
        uint256 amount;
        bytes32 depositId;
        bytes32 targetDomain;
        bytes32 sourceHeader;
        bytes32 receiptsRoot;
        uint64 receiptIndex;
        bytes32 leaf;
    }

    address public immutable admin;
    address public immutable gateway;
    address public immutable baseFinalityVerifier;
    address public immutable conetFinalityVerifier;
    address public immutable receiptVerifier;
    bool public paused;
    bool private entered;

    mapping(bytes32 => Record) private records;
    mapping(bytes32 => Status) public statusOf;
    mapping(uint8 => address) public adapters;

    error BadRole();
    error Paused();
    error NotAdmin();
    error NotGateway();
    error AlreadyRegistered();
    error UnknownAac();
    error BadRecord();
    error BadProof();
    error BadFinality();
    error BadAdapter();
    error Reentered();

    constructor(
        address admin_,
        address gateway_,
        address baseFinalityVerifier_,
        address conetFinalityVerifier_,
        address receiptVerifier_
    ) {
        if (
            admin_ == address(0) ||
            gateway_ == address(0) ||
            admin_ == gateway_ ||
            baseFinalityVerifier_ == address(0) ||
            conetFinalityVerifier_ == address(0) ||
            receiptVerifier_ == address(0)
        ) revert BadRole();
        admin = admin_;
        gateway = gateway_;
        baseFinalityVerifier = baseFinalityVerifier_;
        conetFinalityVerifier = conetFinalityVerifier_;
        receiptVerifier = receiptVerifier_;
    }

    function setAdapter(uint8 assetKind, address adapter) external {
        if (msg.sender != admin) revert NotAdmin();
        if (adapter == address(0)) revert BadAdapter();
        adapters[assetKind] = adapter;
    }

    function pause() external {
        if (msg.sender != admin) revert NotAdmin();
        paused = true;
    }

    function unpause() external {
        if (msg.sender != admin) revert NotAdmin();
        paused = false;
    }

    function registerBase(
        Record calldata record,
        bytes calldata outputAnchorProof,
        bytes calldata headerProof,
        bytes calldata receiptRlp,
        bytes[] calldata receiptProof
    ) external returns (bytes32) {
        AacHeaderCommitment.Commitment memory header =
            IAacBaseFinalityCommitment(baseFinalityVerifier).verifyHeader(
                outputAnchorProof,
                headerProof
            );
        return _register(record, header, receiptRlp, receiptProof);
    }

    function registerConet(
        Record calldata record,
        bytes calldata finalityProof,
        bytes calldata receiptRlp,
        bytes[] calldata receiptProof
    ) external returns (bytes32) {
        AacHeaderCommitment.Commitment memory header =
            IAacConetFinalityCommitment(conetFinalityVerifier).verifyHeader(finalityProof);
        return _register(record, header, receiptRlp, receiptProof);
    }

    function consume(bytes32 aacId) external {
        if (paused) revert Paused();
        if (msg.sender != gateway) revert NotGateway();
        if (entered) revert Reentered();
        if (statusOf[aacId] != Status.Verified) revert UnknownAac();
        address adapter = adapters[records[aacId].assetKind];
        if (adapter == address(0)) revert BadAdapter();
        entered = true;
        statusOf[aacId] = Status.Consumed;
        IAacAssetAdapter(adapter).consumeAac(aacId);
        entered = false;
    }

    function getRecord(bytes32 aacId) external view returns (Record memory) {
        return records[aacId];
    }

    function isConsumed(bytes32 aacId) external view returns (bool) {
        return statusOf[aacId] == Status.Consumed;
    }

    function _register(
        Record calldata record,
        AacHeaderCommitment.Commitment memory header,
        bytes calldata receiptRlp,
        bytes[] calldata receiptProof
    ) internal returns (bytes32) {
        if (paused) revert Paused();
        if (msg.sender != gateway) revert NotGateway();
        if (
            record.aacId == bytes32(0) ||
            record.sourceChainId != header.sourceChainId ||
            record.destinationChainId == 0 ||
            record.recipient == address(0) ||
            record.amount == 0 ||
            record.sourceGateway == address(0) ||
            record.sourceAsset == address(0) ||
            record.destinationAsset == address(0) ||
            record.depositId == bytes32(0) ||
            record.targetDomain == bytes32(0) ||
            record.leaf == bytes32(0) ||
            header.blockHash != record.sourceHeader ||
            header.receiptsRoot != record.receiptsRoot
        ) revert BadRecord();
        if (statusOf[record.aacId] != Status.None) revert AlreadyRegistered();
        bool included = IAacReceiptMptVerifier(receiptVerifier).verifyReceiptProof(
            record.sourceChainId,
            record.sourceHeader,
            record.receiptsRoot,
            record.receiptIndex,
            receiptRlp,
            receiptProof
        );
        if (!included) revert BadProof();
        records[record.aacId] = record;
        statusOf[record.aacId] = Status.Verified;
        return record.aacId;
    }
}
