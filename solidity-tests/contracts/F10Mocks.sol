// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "../../contracts/AacProductionCustodyGateSettlerF10.sol";

/// Stands in for AacConetHeaderAuthenticator at the F10 CONET_AUTH address in tests.
/// The real authenticator is tested against real CoNET data in conet-authenticator.test.ts.
/// Not deployed.
contract MockConetAuthenticator {
    error InvalidProof();

    bytes32 public headerHash;
    bytes32 public receiptsRoot;
    bool public reject;

    function set(bytes32 h, bytes32 r, bool rej) external {
        headerHash = h;
        receiptsRoot = r;
        reject = rej;
    }

    function authenticate(
        IAacConetAuthenticatorF10.Aggregate calldata,
        IAacConetAuthenticatorF10.Header calldata,
        bytes32[] calldata,
        IAacConetAuthenticatorF10.Header[] calldata,
        bytes32[] calldata,
        bytes calldata
    ) external view returns (bytes32, bytes32) {
        if (reject) revert InvalidProof();
        return (headerHash, receiptsRoot);
    }
}
