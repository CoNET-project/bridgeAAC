// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacEthereumCheckpointRoot.sol";

/// @notice Append-only upgrade of the checkpoint root. Instant upgradeTo is replaced
///         by a 48h owner schedule. Two-step transferOwnership is available; this
///         deploy does not move the owner.
contract AacEthereumCheckpointRootTimelock is AacEthereumCheckpointRoot {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public constant UPGRADE_DELAY = 2 days;
    address private immutable implSelf = address(this);
    address public pendingImplementation;
    uint256 public upgradeReadyAt;
    address public pendingOwner;

    error UpgradeNotReady();
    error NotPendingOwner();

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
        address current = _currentImplementation();
        if (current != implSelf) revert NotProxy();
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

    function _currentImplementation() private view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            impl := sload(slot)
        }
    }
}
