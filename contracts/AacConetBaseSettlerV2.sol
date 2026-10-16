// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacConetBaseCoverV2 {
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
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered, bool headerFinal);
}

interface IAacConetBaseEffectV2 {
    function effect(bytes calldata receipt, uint256 logIndex)
        external
        pure
        returns (address beneficiary, uint256 gross, address destinationAsset, uint8 mode, uint256 destinationChainId);
}

interface IAacConetChainEffectV2 {
    function complete(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external;
}

interface IAacConetBlsProbeV2 {
    function available() external view returns (bool);
}

/// @notice Settles one Base receipt on CoNET. Destination must be chain 224422.
/// @dev Does not become the chain effect settler until `available()` is true
///      and a real proof succeeds. Wrapped CNET must be released, not minted.
/// @notice CoNET settler v2. Same settle logic as `AacConetBaseSettler`, but the
/// chain effect is a constructor argument (v2 `AacChainEffectV2`) and `cover` is
/// expected to be an `AacAuthenticatedHeaderGate`, so unauthenticated Base headers
/// are refused before the cover reads receiptsRoot (C1).
contract AacConetBaseSettlerV2 {
    address public immutable EFFECT;
    address public immutable PROBE;
    address public constant WCNET = 0x5a2D096968fC85861d8FDC7CE9A747Fe4bcb87D5;
    uint256 public constant CONET_CHAIN_ID = 224422;
    address public immutable cover;
    address public immutable effectReader;

    error PrecompileMissing();
    error GateFailed();
    error BadMintTo();
    error WrongDestination();
    error UnbackedWrapMint();

    constructor(address cover_, address effectReader_, address probe_, address effect_) {
        if (cover_ == address(0) || effectReader_ == address(0) || probe_ == address(0) || effect_ == address(0)) {
            revert GateFailed();
        }
        cover = cover_;
        effectReader = effectReader_;
        PROBE = probe_;
        EFFECT = effect_;
    }

    function settle(
        IAacConetBaseCoverV2.Aggregate calldata input,
        IAacConetBaseCoverV2.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetBaseCoverV2.Header[] calldata beaconHeaders,
        address mintTo
    ) external returns (bytes32 operationId, uint256 amount) {
        if (!IAacConetBlsProbeV2(PROBE).available()) revert PrecompileMissing();
        (bool blsOk, bytes memory blsData) = address(0x0b).staticcall{gas: 100_000}("");
        if (blsOk && blsData.length == 0) revert PrecompileMissing();
        bool covered;
        bool headerFinal_;
        (operationId, amount, covered, headerFinal_) = IAacConetBaseCoverV2(cover).cover(
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
        (
            address beneficiary,
            uint256 gross,
            address destinationAsset,
            uint8 mode,
            uint256 destinationChainId
        ) = IAacConetBaseEffectV2(effectReader).effect(receiptRlp, logIndex);
        if (mintTo == address(0) || mintTo != beneficiary || gross != amount) revert BadMintTo();
        if (destinationChainId != CONET_CHAIN_ID) revert WrongDestination();
        if (destinationAsset == WCNET && mode != 2) revert UnbackedWrapMint();
        IAacConetChainEffectV2(EFFECT).complete(operationId, destinationAsset, mintTo, amount, mode);
    }
}
