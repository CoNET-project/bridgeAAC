// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacConetBaseCover {
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

interface IAacConetBaseEffect {
    function effect(bytes calldata receipt, uint256 logIndex)
        external
        pure
        returns (address beneficiary, uint256 gross, address destinationAsset, uint8 mode, uint256 destinationChainId);
}

interface IAacConetChainEffect {
    function complete(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external;
}

interface IAacConetBlsProbe {
    function available() external view returns (bool);
}

/// @notice Settles one Base receipt on CoNET. Destination must be chain 224422.
/// @dev Does not become the chain effect settler until `available()` is true
///      and a real proof succeeds. Wrapped CNET must be released, not minted.
contract AacConetBaseSettler {
    address public constant EFFECT = 0x0661C8116D027907e387667Df5aCad2F2E9ad30b;
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

    constructor(address cover_, address effectReader_, address probe_) {
        if (cover_ == address(0) || effectReader_ == address(0) || probe_ == address(0)) revert GateFailed();
        cover = cover_;
        effectReader = effectReader_;
        PROBE = probe_;
    }

    function settle(
        IAacConetBaseCover.Aggregate calldata input,
        IAacConetBaseCover.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacConetBaseCover.Header[] calldata beaconHeaders,
        address mintTo
    ) external returns (bytes32 operationId, uint256 amount) {
        if (!IAacConetBlsProbe(PROBE).available()) revert PrecompileMissing();
        (bool blsOk, bytes memory blsData) = address(0x0b).staticcall{gas: 100_000}("");
        if (blsOk && blsData.length == 0) revert PrecompileMissing();
        bool covered;
        bool headerFinal_;
        (operationId, amount, covered, headerFinal_) = IAacConetBaseCover(cover).cover(
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
        ) = IAacConetBaseEffect(effectReader).effect(receiptRlp, logIndex);
        if (mintTo == address(0) || mintTo != beneficiary || gross != amount) revert BadMintTo();
        if (destinationChainId != CONET_CHAIN_ID) revert WrongDestination();
        if (destinationAsset == WCNET && mode != 2) revert UnbackedWrapMint();
        IAacConetChainEffect(EFFECT).complete(operationId, destinationAsset, mintTo, amount, mode);
    }
}
