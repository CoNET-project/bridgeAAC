// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Rejected upgrade. Its layout prefix is not the V1 tag.
contract AacConsumeOnceReorder {
    mapping(bytes32 => uint256) private consumed;
    uint256 public paused;
    address public admin;

    function layoutPrefix() external pure returns (bytes32) {
        return keccak256("consumed,paused,admin,__gap");
    }

    function proxiableUUID() external pure returns (bytes32) {
        return 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    }
}
