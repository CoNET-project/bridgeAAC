// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice TESTNET-ONLY. The only execution target that the CMG testnet core may call.
/// It holds no value, calls no other contract, and only counts calls that come from the core.
contract CmgTestTarget {
    address public immutable deployer;
    address public core;
    uint256 public count;

    error NotDeployer();
    error CoreAlreadySet();
    error BadCore();
    error NotCore();

    event CoreSet(address indexed newCore);
    event Bumped(uint256 newCount);

    constructor() {
        deployer = msg.sender;
    }

    /// @dev One-time wiring. The core needs this target's address at deployment, so the target receives the core afterwards.
    function setCore(address core_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (core != address(0)) revert CoreAlreadySet();
        if (core_ == address(0)) revert BadCore();
        core = core_;
        emit CoreSet(core_);
    }

    function bump() external {
        if (core == address(0) || msg.sender != core) revert NotCore();
        count += 1;
        emit Bumped(count);
    }
}
