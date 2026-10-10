// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice ABI snapshot of the verified TreasuryBridgeV3 implementation.
/// @dev This is an interface boundary, not an authorization or adapter.
interface ITreasuryBridgeV3Canonical {
    enum AssetMode {
        Mint,
        Release
    }

    function executeMint(
        bytes32 operationId,
        uint256 sourceChainId,
        uint256 destinationChainId,
        address sourceTreasury,
        address sourceAsset,
        address destinationAsset,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        AssetMode mode,
        uint256 grossAmount,
        uint256 feeAmount,
        bytes32 sourceTxHash,
        uint256 nonce,
        address callbackTarget,
        bytes[] calldata signatures
    ) external;

    function executeRelease(
        bytes32 operationId,
        uint256 sourceChainId,
        uint256 destinationChainId,
        address sourceTreasury,
        address sourceAsset,
        address destinationAsset,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256 grossAmount,
        uint256 feeAmount,
        bytes32 sourceTxHash,
        uint256 nonce,
        bytes[] calldata signatures
    ) external;
}

/// @notice ABI snapshot of the verified GBTokenV2 implementation.
interface IGBTokenV2Canonical {
    function executeBridgeMint(bytes32 sourceTxHash) external;
    function bridgeOut(uint256 amount, uint256 destinationChainId, address recipient) external;
}
