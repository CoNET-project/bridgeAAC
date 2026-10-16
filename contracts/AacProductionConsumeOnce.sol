// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Destination consume-once consumer for production custody obstacle 4 / F3.
/// @dev Gateway-only. `consumeAfterCover` re-runs COVER (standalone path).
///      `consumeFromSettler` trusts the AAC settler that already proved COVER /
///      Inclusion in the same tx (F3 — do not re-cover; Base gas budget).
///      Failed effects roll back the consume mark. Settled alone never mints.
contract AacProductionConsumeOnce {
    bytes32 private constant INIT_SLOT =
        0x0e90e418ef8a16accc9c1e3b0f6fba23a670a5665607f3c908efca71b10d2619;
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address public constant COVER = 0x01506527a4Dab14141038Db15f5341dcF4729233;
    address public constant CONET_FINALITY = 0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9;

    uint8 public constant ACTION_MINT = 1;
    uint8 public constant ACTION_RELEASE = 2;

    address public admin;
    address public gateway;
    mapping(bytes32 => Consumption) private consumed;
    mapping(bytes32 => uint256) private minted;
    mapping(bytes32 => uint256) private released;
    uint256[47] private __gap;

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

    struct Consumption {
        bytes32 header;
        bytes32 root;
        bytes32 leaf;
        uint8 action;
        uint256 amount;
    }

    bool transient enteredLock;
    address transient activeEffect;

    error NotAdmin();
    error NotGateway();
    error BadRole();
    error AlreadyInitialized();
    error EmptyBinding();
    error Reentered();
    error AlreadyConsumed();
    error NotInEffect();
    error EffectFailed();
    error GateFailed();
    error BadAction();
    error LayoutRejected();
    error UpgradeRejected();

    event Consumed(bytes32 indexed id, uint8 action, uint256 amount);
    event Minted(bytes32 indexed id, uint256 amount);
    event Released(bytes32 indexed id, uint256 amount);

    constructor() {
        assembly {
            sstore(INIT_SLOT, 1)
        }
    }

    function initialize(address admin_, address gateway_) external {
        uint256 ready;
        assembly {
            ready := sload(INIT_SLOT)
        }
        if (ready != 0) revert AlreadyInitialized();
        if (admin_ == address(0) || gateway_ == address(0) || admin_ == gateway_) revert BadRole();
        admin = admin_;
        gateway = gateway_;
        assembly {
            sstore(INIT_SLOT, 1)
        }
    }

    function layoutTag() public pure virtual returns (bytes32) {
        return keccak256("admin,gateway,consumed,minted,released,__gap");
    }

    function layoutPrefix() public pure virtual returns (bytes32) {
        return layoutTag();
    }

    function proxiableUUID() external pure returns (bytes32) {
        return IMPLEMENTATION_SLOT;
    }

    function implementation() external view returns (address impl) {
        assembly {
            impl := sload(IMPLEMENTATION_SLOT)
        }
    }

    function isConsumed(bytes32 id) external view returns (bool) {
        return consumed[id].leaf != bytes32(0);
    }

    function mintedOf(bytes32 id) external view returns (uint256) {
        return minted[id];
    }

    function releasedOf(bytes32 id) external view returns (uint256) {
        return released[id];
    }

    function consumedBinding(bytes32 id)
        external
        view
        returns (bytes32 header, bytes32 root, bytes32 leaf, uint8 action, uint256 amount)
    {
        Consumption storage row = consumed[id];
        return (row.header, row.root, row.leaf, row.action, row.amount);
    }

    function setGateway(address gateway_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (gateway_ == address(0) || gateway_ == admin) revert BadRole();
        gateway = gateway_;
    }

    /// @notice Consume after obstacle 3: CoNET-source finality `rootReady`.
    function consumeAfterConetRoot(
        bytes32 id,
        bytes32 header,
        bytes32 root,
        bytes32 leaf,
        uint8 action,
        uint256 amount,
        address effect
    ) external {
        if (msg.sender != gateway) revert NotGateway();
        if (!IAacConetSourceFinality(CONET_FINALITY).rootReady()) revert GateFailed();
        _consume(id, header, root, leaf, action, amount, effect);
    }

    /// @notice F3: consume after Settler already proved COVER / Inclusion this tx.
    /// @dev Gateway must be the AAC proxy. Does not re-run cover (gas).
    function consumeFromSettler(
        bytes32 id,
        bytes32 header,
        bytes32 root,
        bytes32 leaf,
        uint8 action,
        uint256 amount,
        address effect
    ) external {
        if (msg.sender != gateway) revert NotGateway();
        _consume(id, header, root, leaf, action, amount, effect);
    }

    /// @notice Consume after obstacles 1 and 2: same-call `cover.cover()`.
    function consumeAfterCover(
        Aggregate calldata input,
        Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        Header[] calldata beaconHeaders,
        bytes32 expectedId,
        bytes32 header,
        bytes32 root,
        bytes32 leaf,
        uint8 action,
        uint256 amount,
        address effect
    ) external {
        if (msg.sender != gateway) revert NotGateway();
        (bytes32 operationId, uint256 coveredAmount, bool messageCovered_, bool headerFinal_) = IAacCheckpointMessageCover(COVER)
            .cover(input, finalized, finalityBranch, baseHeaderRlp, receiptRlp, proofNodes, receiptIndex, logIndex, beaconHeaders);
        if (!messageCovered_ || !headerFinal_ || operationId != expectedId || coveredAmount != amount) {
            revert GateFailed();
        }
        _consume(expectedId, header, root, leaf, action, amount, effect);
    }

    function noteCredit() external view {
        if (!enteredLock || msg.sender != activeEffect) revert NotInEffect();
    }

    function upgradeToAndCall(address newImpl, bytes calldata data) external {
        if (msg.sender != admin) revert NotAdmin();
        if (newImpl.code.length == 0) revert UpgradeRejected();
        (bool uuidOk, bytes memory uuidData) = newImpl.staticcall(abi.encodeWithSignature("proxiableUUID()"));
        if (!uuidOk || uuidData.length != 32 || abi.decode(uuidData, (bytes32)) != IMPLEMENTATION_SLOT) {
            revert UpgradeRejected();
        }
        (bool prefixOk, bytes memory prefixData) = newImpl.staticcall(abi.encodeWithSignature("layoutPrefix()"));
        if (!prefixOk || prefixData.length != 32 || abi.decode(prefixData, (bytes32)) != layoutTag()) {
            revert LayoutRejected();
        }
        assembly {
            sstore(IMPLEMENTATION_SLOT, newImpl)
        }
        if (data.length > 0) {
            (bool ok,) = newImpl.delegatecall(data);
            if (!ok) revert UpgradeRejected();
        }
    }

    function _consume(
        bytes32 id,
        bytes32 header,
        bytes32 root,
        bytes32 leaf,
        uint8 action,
        uint256 amount,
        address effect
    ) private {
        if (header == bytes32(0) || root == bytes32(0) || leaf == bytes32(0) || amount == 0) revert EmptyBinding();
        if (action != ACTION_MINT && action != ACTION_RELEASE) revert BadAction();
        if (enteredLock) revert Reentered();
        if (consumed[id].leaf != bytes32(0)) revert AlreadyConsumed();
        if (effect == address(0) || effect.code.length == 0) revert EffectFailed();

        enteredLock = true;
        activeEffect = effect;
        consumed[id] = Consumption(header, root, leaf, action, amount);
        if (action == ACTION_MINT) {
            minted[id] = amount;
            emit Minted(id, amount);
        } else {
            released[id] = amount;
            emit Released(id, amount);
        }

        (bool ok,) = effect.call(abi.encodeWithSignature("onConsume(bytes32)", id));
        enteredLock = false;
        activeEffect = address(0);
        if (!ok) {
            delete consumed[id];
            delete minted[id];
            delete released[id];
            revert EffectFailed();
        }
        emit Consumed(id, action, amount);
    }
}

interface IAacConetSourceFinality {
    function rootReady() external view returns (bool);
}

interface IAacCheckpointMessageCover {
    function cover(
        AacProductionConsumeOnce.Aggregate calldata input,
        AacProductionConsumeOnce.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        AacProductionConsumeOnce.Header[] calldata beaconHeaders
    ) external returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool headerFinal_);
}

/// @notice Gateway that may call the production consume-once consumer.
contract AacProductionConsumeGateway {
    address public immutable owner;

    error NotOwner();
    error CallFailed();

    constructor(address owner_) {
        owner = owner_;
    }

    function forward(address target, bytes calldata data) external returns (bytes memory out) {
        if (msg.sender != owner) revert NotOwner();
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}

/// @notice Effect that succeeds. Used for the first consume acceptance path.
contract AacProductionConsumeOkEffect {
    function onConsume(bytes32) external pure {}
}

/// @notice Effect that always reverts. Used to prove rollback of consume marks.
contract AacProductionConsumeRevertEffect {
    error Boom();

    function onConsume(bytes32) external pure {
        revert Boom();
    }
}
