// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface ITreasuryBridgeV3AdapterTarget {
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

interface IGBTokenV2AdapterTarget {
    function executeBridgeMint(bytes32 sourceTxHash) external;
}

/// @notice Testnet-only strict call boundary for TreasuryBridgeV3.
/// @dev It forwards only the two verified TreasuryBridgeV3 selectors and
/// rejects direct calls from every account except the configured consumer.
contract AacTreasuryBridgeV3AdapterTestnet {
    address public immutable consumer;
    address public immutable treasury;

    error NotConsumer();
    error TargetFailed();

    constructor(address consumer_, address treasury_) {
        if (consumer_ == address(0) || treasury_ == address(0)) revert TargetFailed();
        consumer = consumer_;
        treasury = treasury_;
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
        ITreasuryBridgeV3AdapterTarget.AssetMode mode,
        uint256 grossAmount,
        uint256 feeAmount,
        bytes32 sourceTxHash,
        uint256 nonce,
        address callbackTarget,
        bytes[] calldata signatures
    ) external {
        if (msg.sender != consumer) revert NotConsumer();
        try ITreasuryBridgeV3AdapterTarget(treasury).executeMint(
            operationId,
            sourceChainId,
            destinationChainId,
            sourceTreasury,
            sourceAsset,
            destinationAsset,
            beneficiaries,
            amounts,
            mode,
            grossAmount,
            feeAmount,
            sourceTxHash,
            nonce,
            callbackTarget,
            signatures
        ) {} catch {
            revert TargetFailed();
        }
    }

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
    ) external {
        if (msg.sender != consumer) revert NotConsumer();
        try ITreasuryBridgeV3AdapterTarget(treasury).executeRelease(
            operationId,
            sourceChainId,
            destinationChainId,
            sourceTreasury,
            sourceAsset,
            destinationAsset,
            beneficiaries,
            amounts,
            grossAmount,
            feeAmount,
            sourceTxHash,
            nonce,
            signatures
        ) {} catch {
            revert TargetFailed();
        }
    }
}

/// @notice Testnet-only strict call boundary for GBTokenV2.
contract AacGbTokenV2AdapterTestnet {
    address public immutable consumer;
    address public immutable gbToken;

    error NotConsumer();
    error TargetFailed();

    constructor(address consumer_, address gbToken_) {
        if (consumer_ == address(0) || gbToken_ == address(0)) revert TargetFailed();
        consumer = consumer_;
        gbToken = gbToken_;
    }

    function executeBridgeMint(bytes32 sourceTxHash) external {
        if (msg.sender != consumer) revert NotConsumer();
        try IGBTokenV2AdapterTarget(gbToken).executeBridgeMint(sourceTxHash) {} catch {
            revert TargetFailed();
        }
    }
}

/// @notice Payload-bound Treasury adapter for the V2 consumer integration.
contract AacTreasuryBridgeV3AdapterV2 {
    address public immutable consumer;
    address public immutable treasury;

    error NotConsumer();
    error BadSelector();
    error BadOperationId();
    error TargetFailed();

    constructor(address consumer_, address treasury_) {
        if (consumer_ == address(0) || treasury_ == address(0)) revert TargetFailed();
        consumer = consumer_;
        treasury = treasury_;
    }

    function consumeAac(bytes32 aacId, bytes calldata effectData) external {
        if (msg.sender != consumer) revert NotConsumer();
        if (effectData.length < 36) revert BadSelector();
        bytes4 selector;
        bytes32 operationId;
        assembly {
            selector := calldataload(effectData.offset)
            operationId := calldataload(add(effectData.offset, 4))
        }
        if (
            selector != ITreasuryBridgeV3AdapterTarget.executeMint.selector &&
            selector != ITreasuryBridgeV3AdapterTarget.executeRelease.selector
        ) revert BadSelector();
        if (operationId != aacId) revert BadOperationId();
        (bool ok,) = treasury.call(effectData);
        if (!ok) revert TargetFailed();
    }
}

/// @notice Payload-bound GBToken adapter for the V2 consumer integration.
contract AacGbTokenV2AdapterV2 {
    address public immutable consumer;
    address public immutable gbToken;

    error NotConsumer();
    error BadSelector();
    error BadSourceHash();
    error TargetFailed();

    constructor(address consumer_, address gbToken_) {
        if (consumer_ == address(0) || gbToken_ == address(0)) revert TargetFailed();
        consumer = consumer_;
        gbToken = gbToken_;
    }

    function consumeAac(bytes32 sourceTxHash, bytes calldata effectData) external {
        if (msg.sender != consumer) revert NotConsumer();
        if (effectData.length != 36) revert BadSelector();
        bytes4 selector;
        bytes32 payloadHash;
        assembly {
            selector := calldataload(effectData.offset)
            payloadHash := calldataload(add(effectData.offset, 4))
        }
        if (selector != IGBTokenV2AdapterTarget.executeBridgeMint.selector) revert BadSelector();
        if (payloadHash != sourceTxHash) revert BadSourceHash();
        (bool ok,) = gbToken.call(effectData);
        if (!ok) revert TargetFailed();
    }
}

contract AacTestTreasuryTarget {
    uint256 public mintCalls;
    uint256 public releaseCalls;
    bytes32 public lastOperationId;

    event TestMint(bytes32 indexed operationId);
    event TestRelease(bytes32 indexed operationId);

    function executeMint(
        bytes32 operationId,
        uint256,
        uint256,
        address,
        address,
        address,
        address[] calldata,
        uint256[] calldata,
        ITreasuryBridgeV3AdapterTarget.AssetMode,
        uint256,
        uint256,
        bytes32,
        uint256,
        address,
        bytes[] calldata
    ) external {
        mintCalls++;
        lastOperationId = operationId;
        emit TestMint(operationId);
    }

    function executeRelease(
        bytes32 operationId,
        uint256,
        uint256,
        address,
        address,
        address,
        address[] calldata,
        uint256[] calldata,
        uint256,
        uint256,
        bytes32,
        uint256,
        bytes[] calldata
    ) external {
        releaseCalls++;
        lastOperationId = operationId;
        emit TestRelease(operationId);
    }
}

contract AacTestGbTarget {
    uint256 public mintCalls;
    bytes32 public lastSourceTxHash;

    function executeBridgeMint(bytes32 sourceTxHash) external {
        mintCalls++;
        lastSourceTxHash = sourceTxHash;
    }
}

contract AacTestAdapterCaller {
    address public immutable owner;

    error NotOwner();
    error CallFailed();

    constructor(address owner_) {
        owner = owner_;
    }

    function callTarget(address target, bytes calldata data) external returns (bytes memory) {
        if (msg.sender != owner) revert NotOwner();
        (bool ok, bytes memory result) = target.call(data);
        if (!ok) revert CallFailed();
        return result;
    }
}
