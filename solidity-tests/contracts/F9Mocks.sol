// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Payee reader for the F9 tests. It returns the beneficiary and gross that the test sets,
/// because the test receipt is an RLP trie value and not the abi-encoded pair MockPayee reads.
/// Not deployed.
contract MockPayeeF9 {
    address public beneficiary;
    uint256 public gross;

    function set(address b, uint256 g) external {
        beneficiary = b;
        gross = g;
    }

    function payee(bytes calldata, uint256) external view returns (address, uint256) {
        return (beneficiary, gross);
    }
}
