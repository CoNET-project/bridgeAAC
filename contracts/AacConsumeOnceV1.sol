// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Consume-once specification consumer. It stores an id and a credit counter.
/// It does not mint, release, or call a treasury.
contract AacConsumeOnceV1 {
    uint256 public paused;
    address public admin;
    address public gateway;
    mapping(bytes32 => Consumption) private consumed;
    uint256 public credits;
    uint256[50] private __gap;

    struct Consumption {
        bytes32 header;
        bytes32 root;
        bytes32 leaf;
    }

    bool transient enteredLock;
    address transient activeEffect;

    bytes32 private constant INIT_SLOT = 0x0e90e418ef8a16accc9c1e3b0f6fba23a670a5665607f3c908efca71b10d2619;
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error NotAdmin();
    error NotGateway();
    error BadRole();
    error AlreadyInitialized();
    error Paused();
    error EmptyBinding();
    error Reentered();
    error AlreadyConsumed();
    error NotInEffect();
    error EffectFailed();
    error LayoutRejected();
    error UpgradeRejected();

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
        return keccak256("paused,admin,gateway,consumed,credits,__gap");
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

    function consumedBinding(bytes32 id) external view returns (bytes32 header, bytes32 root, bytes32 leaf) {
        Consumption storage row = consumed[id];
        return (row.header, row.root, row.leaf);
    }

    function noteCredit() external {
        if (!enteredLock || msg.sender != activeEffect) revert NotInEffect();
        credits += 1;
    }

    function consume(bytes32 id, bytes32 header, bytes32 root, bytes32 leaf, address effect) external {
        if (paused != 0) revert Paused();
        if (msg.sender != gateway) revert NotGateway();
        if (header == bytes32(0) || root == bytes32(0) || leaf == bytes32(0)) revert EmptyBinding();
        if (enteredLock) revert Reentered();
        if (consumed[id].leaf != bytes32(0)) revert AlreadyConsumed();
        uint256 creditsBefore = credits;
        enteredLock = true;
        activeEffect = effect;
        consumed[id] = Consumption(header, root, leaf);
        (bool ok,) = effect.call(abi.encodeWithSignature("onConsume(bytes32)", id));
        enteredLock = false;
        activeEffect = address(0);
        if (!ok) {
            delete consumed[id];
            credits = creditsBefore;
            revert EffectFailed();
        }
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
}
