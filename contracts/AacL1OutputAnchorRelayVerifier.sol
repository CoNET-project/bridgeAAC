// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Testnet-only signed relay for Ethereum L1 output-anchor evidence.
/// @dev This is not a trustless Ethereum light client and must not authorize
/// mainnet custody. The signer set is fixed at construction for testnet use.
contract AacL1OutputAnchorRelayVerifier {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "AnchorAttestation(address registry,bytes32 anchorGame,bytes32 outputRoot,bytes32 stateRoot,bytes32 blockHash,uint256 l2Sequence,uint256 nonce)"
    );

    string public constant NAME = "bridgeAAC L1 Anchor Relay";
    string public constant VERSION = "1";

    address public immutable anchorRegistry;
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public immutable threshold;
    uint256 public latestNonce;

    bytes32 public latestAnchorGame;
    bytes32 public latestOutputRoot;
    bytes32 public latestStateRoot;
    bytes32 public latestBlockHash;
    uint256 public latestL2Sequence;

    error BadConfiguration();
    error BadAttestation();
    error BadSignature();
    error DuplicateSigner();
    error NonceNotIncreasing();

    event AnchorAccepted(
        uint256 indexed nonce,
        bytes32 indexed anchorGame,
        bytes32 outputRoot,
        bytes32 stateRoot,
        bytes32 blockHash,
        uint256 l2Sequence
    );

    constructor(address registry_, address[] memory signers_, uint256 threshold_) {
        if (registry_ == address(0) || signers_.length == 0 || threshold_ == 0 || threshold_ > signers_.length) {
            revert BadConfiguration();
        }
        anchorRegistry = registry_;
        threshold = threshold_;
        address previous;
        for (uint256 i; i < signers_.length; i++) {
            address signer = signers_[i];
            if (signer == address(0) || signer <= previous || isSigner[signer]) {
                revert BadConfiguration();
            }
            signers.push(signer);
            isSigner[signer] = true;
            previous = signer;
        }
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    function submitAnchor(
        bytes32 anchorGame,
        bytes32 outputRoot,
        bytes32 stateRoot,
        bytes32 blockHash,
        uint256 l2Sequence,
        uint256 nonce,
        bytes[] calldata signatures
    ) external {
        if (
            anchorGame == bytes32(0) ||
            outputRoot == bytes32(0) ||
            stateRoot == bytes32(0) ||
            blockHash == bytes32(0) ||
            l2Sequence == 0
        ) revert BadAttestation();
        if (nonce <= latestNonce) revert NonceNotIncreasing();
        _checkSignatures(anchorGame, outputRoot, stateRoot, blockHash, l2Sequence, nonce, signatures);

        latestNonce = nonce;
        latestAnchorGame = anchorGame;
        latestOutputRoot = outputRoot;
        latestStateRoot = stateRoot;
        latestBlockHash = blockHash;
        latestL2Sequence = l2Sequence;
        emit AnchorAccepted(nonce, anchorGame, outputRoot, stateRoot, blockHash, l2Sequence);
    }

    /// @notice Adapter for IAacBaseFinalityVerifier's proof dependency.
    /// @dev The proof contains the same attestation and signatures and must
    /// match the latest accepted relay record.
    function verifyOutputAnchor(address registry_, bytes calldata proof)
        external
        view
        returns (
            bool valid,
            bytes32 outputRoot,
            bytes32 stateRoot,
            bytes32 blockHash,
            uint256 l2Sequence
        )
    {
        if (registry_ != anchorRegistry) return (false, bytes32(0), bytes32(0), bytes32(0), 0);
        (
            bytes32 anchorGame,
            bytes32 proofOutputRoot,
            bytes32 proofStateRoot,
            bytes32 proofBlockHash,
            uint256 proofL2Sequence,
            uint256 nonce,
            bytes[] memory signatures
        ) = abi.decode(proof, (bytes32, bytes32, bytes32, bytes32, uint256, uint256, bytes[]));
        if (
            anchorGame != latestAnchorGame ||
            proofOutputRoot != latestOutputRoot ||
            proofStateRoot != latestStateRoot ||
            proofBlockHash != latestBlockHash ||
            proofL2Sequence != latestL2Sequence ||
            nonce != latestNonce
        ) return (false, bytes32(0), bytes32(0), bytes32(0), 0);
        _checkSignatures(anchorGame, proofOutputRoot, proofStateRoot, proofBlockHash, proofL2Sequence, nonce, signatures);
        return (true, proofOutputRoot, proofStateRoot, proofBlockHash, proofL2Sequence);
    }

    function _checkSignatures(
        bytes32 anchorGame,
        bytes32 outputRoot,
        bytes32 stateRoot,
        bytes32 blockHash,
        uint256 l2Sequence,
        uint256 nonce,
        bytes[] memory signatures
    ) internal view {
        if (signatures.length < threshold) revert BadSignature();
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                anchorRegistry,
                anchorGame,
                outputRoot,
                stateRoot,
                blockHash,
                l2Sequence,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        address previous;
        uint256 valid;
        for (uint256 i; i < signatures.length; i++) {
            address recovered = _recover(digest, signatures[i]);
            if (!isSigner[recovered] || recovered <= previous) revert DuplicateSigner();
            previous = recovered;
            valid++;
        }
        if (valid < threshold) revert BadSignature();
    }

    function _recover(bytes32 digest, bytes memory signature) private pure returns (address recovered) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadSignature();
        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadSignature();
    }
}
