// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice ERC-1967 proxy for the production custody gate.
/// @dev The proxy address is the stable production address. This contract
/// holds no asset roles.
contract AacErc1967Proxy {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error ImplementationCallFailed();

    constructor(address implementation, bytes memory data) {
        if (implementation == address(0) || implementation.code.length == 0) revert ImplementationCallFailed();
        assembly {
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, implementation)
        }
        (bool ok, ) = implementation.delegatecall(data);
        if (!ok) {
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    fallback() external {
        assembly {
            let impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
