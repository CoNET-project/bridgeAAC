// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Registry of source-chain headers that a verifier has authenticated.
/// @dev Fail-closed. With no verifier set, nothing is authenticated and every
///      settlement that goes through `AacAuthenticatedHeaderGate` reverts.
///      Headers are keyed by chain id and hash, so a Base header cannot
///      authenticate a CoNET header or the reverse (H2).
contract AacHeaderAuthority {
    address public owner;
    address public verifier;

    mapping(uint256 => mapping(bytes32 => bool)) private _authenticated;

    error NotOwner();
    error NotVerifier();
    error BadAddress();

    event VerifierSet(address indexed verifier);
    event HeaderAuthenticated(uint256 indexed chainId, bytes32 indexed headerHash);
    event HeaderRevoked(uint256 indexed chainId, bytes32 indexed headerHash);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert BadAddress();
        owner = owner_;
    }

    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert BadAddress();
        owner = next;
    }

    function setVerifier(address verifier_) external onlyOwner {
        verifier = verifier_;
        emit VerifierSet(verifier_);
    }

    /// @notice Called only by the verifier after it has proven the header.
    function authenticate(uint256 chainId, bytes32 headerHash) external {
        if (verifier == address(0) || msg.sender != verifier) revert NotVerifier();
        if (chainId == 0 || headerHash == bytes32(0)) revert BadAddress();
        _authenticated[chainId][headerHash] = true;
        emit HeaderAuthenticated(chainId, headerHash);
    }

    /// @notice Owner can withdraw an authentication at once.
    function revoke(uint256 chainId, bytes32 headerHash) external onlyOwner {
        _authenticated[chainId][headerHash] = false;
        emit HeaderRevoked(chainId, headerHash);
    }

    function isAuthenticated(uint256 chainId, bytes32 headerHash) external view returns (bool) {
        return _authenticated[chainId][headerHash];
    }
}
