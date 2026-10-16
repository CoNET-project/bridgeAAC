// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Fail-closed probe for Ethereum BLS12-381 precompile `0x0b`.
/// @dev An empty account returns success with empty data. That is not a
///      precompile. Patched Cancun Geth reverts on empty input and returns
///      no data. Either a revert or a non-empty result means the precompile
///      is present. A settler must not be installed while `available()` is false.
contract AacEthereumBlsProbe {
    address private constant G1_ADD = 0x000000000000000000000000000000000000000b;

    function available() external view returns (bool) {
        // A precompile error burns the entire stipend. Keep this presence check small.
        (bool ok, bytes memory data) = G1_ADD.staticcall{gas: 100_000}("");
        return !(ok && data.length == 0);
    }
}
