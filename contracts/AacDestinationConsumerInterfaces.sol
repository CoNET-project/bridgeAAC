// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Interface package for the AAC custody milestone.
/// @dev These interfaces are an ABI contract only. They are not deployed
/// implementations and must not be treated as live mint/release permissions.
library AacInterfaceTypes {
    enum AssetKind {
        UsdcLockMint,
        UsdcBurnRelease,
        PaidGb,
        DeveloperToken
    }

    struct ReceiptProof {
        uint256 sourceChainId;
        bytes32 sourceHeader;
        bytes32 receiptsRoot;
        uint64 receiptIndex;
        bytes receiptRlp;
        bytes[] receiptProof;
    }

    struct AacRecord {
        bytes32 aacId;
        AssetKind assetKind;
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
        bytes32 leaf;
        bytes32 proofDigest;
    }
}

/// @notice Verifies source finality and receipt inclusion on the destination
/// chain. A successful call must bind all fields to the same source header.
interface IAacOnchainProofVerifier {
    function verifyFinalizedHeader(
        uint256 sourceChainId,
        bytes32 sourceHeader,
        bytes32 receiptsRoot
    ) external view returns (bool);

    function verifyReceiptProof(
        uint256 sourceChainId,
        bytes32 sourceHeader,
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata receiptProof
    ) external view returns (bool);
}

interface IAacReceiptMptVerifier {
    function verifyReceiptProof(
        uint256 sourceChainId,
        bytes32 sourceHeader,
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata receiptProof
    ) external view returns (bool);
}

/// @notice The consume-once registry/gateway ABI expected by destination
/// asset adapters.
interface IAacDestinationConsumer {
    function registerVerified(
        AacInterfaceTypes.AacRecord calldata record,
        AacInterfaceTypes.ReceiptProof calldata proof
    ) external returns (bytes32 aacId);

    function consume(bytes32 aacId) external;

    function isConsumed(bytes32 aacId) external view returns (bool);

    function getRecord(bytes32 aacId)
        external
        view
        returns (AacInterfaceTypes.AacRecord memory record);

    function pause() external;

    function unpause() external;
}

/// @notice Common adapter boundary. The adapter must only be callable by the
/// destination consumer and must make the asset effect atomically.
interface IAacAssetAdapter {
    function consumeAac(bytes32 aacId) external;
}

/// @notice Canonical CoNET TreasuryBridgeV3 mint adapter.
interface IAacTreasuryMintAdapter is IAacAssetAdapter {}

/// @notice Canonical Base TreasuryBridgeV3 release adapter.
interface IAacTreasuryReleaseAdapter is IAacAssetAdapter {}

/// @notice Canonical paid GBToken mint adapter.
interface IAacPaidGbMintAdapter is IAacAssetAdapter {}

/// @notice Canonical developer-token mint adapter through Peer v5.
interface IAacDeveloperTokenMintAdapter is IAacAssetAdapter {}

/// @notice Role wiring expected by the consumer before custody can open.
interface IAacConsumerRoleConfig {
    function proofVerifier() external view returns (address);
    function treasuryMintAdapter() external view returns (address);
    function treasuryReleaseAdapter() external view returns (address);
    function paidGbMintAdapter() external view returns (address);
    function developerTokenMintAdapter() external view returns (address);
    function admin() external view returns (address);
    function gateway() external view returns (address);
}
