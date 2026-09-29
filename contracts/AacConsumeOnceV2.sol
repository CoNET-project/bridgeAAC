// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacConsumeOnceV1.sol";

/// Append-only upgrade. `rescueAdmin` is stored after the V1 gap.
contract AacConsumeOnceV2 is AacConsumeOnceV1 {
    address public rescueAdmin;

    function layoutTag() public pure override returns (bytes32) {
        return keccak256("paused,admin,gateway,consumed,credits,__gap,rescue_admin");
    }

    function layoutPrefix() public pure override returns (bytes32) {
        return keccak256("paused,admin,gateway,consumed,credits,__gap");
    }

    function setRescueAdmin(address next) external {
        if (msg.sender != admin) revert NotAdmin();
        if (next == address(0)) revert BadRole();
        rescueAdmin = next;
    }
}
