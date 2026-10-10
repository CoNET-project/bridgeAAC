// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Testnet-only Base header attestation relay.
/// @dev This is not a Base execution light client. It exists only to exercise
/// AacBaseFinalityVerifier on a test network.
contract AacBaseHeaderProofRelayVerifier {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "BaseHeaderAttestation(uint256 blockNumber,bytes32 blockHash,bytes32 stateRoot,bytes32 receiptsRoot,uint256 nonce)"
    );

    string public constant NAME = "bridgeAAC Base Header Relay";
    string public constant VERSION = "1";

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public immutable threshold;
    uint256 public latestNonce;
    uint256 public latestBlockNumber;
    bytes32 public latestBlockHash;
    bytes32 public latestStateRoot;
    bytes32 public latestReceiptsRoot;

    error BadConfiguration();
    error BadAttestation();
    error BadSignature();
    error DuplicateSigner();
    error NonceNotIncreasing();

    constructor(address[] memory signers_, uint256 threshold_) {
        if (signers_.length == 0 || threshold_ == 0 || threshold_ > signers_.length) {
            revert BadConfiguration();
        }
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
        threshold = threshold_;
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

    function submitHeader(
        uint256 blockNumber,
        bytes32 blockHash,
        bytes32 stateRoot,
        bytes32 receiptsRoot,
        uint256 nonce,
        bytes[] calldata signatures
    ) external {
        if (
            blockNumber == 0 ||
            blockHash == bytes32(0) ||
            stateRoot == bytes32(0) ||
            receiptsRoot == bytes32(0)
        ) revert BadAttestation();
        if (nonce <= latestNonce) revert NonceNotIncreasing();
        _checkSignatures(blockNumber, blockHash, stateRoot, receiptsRoot, nonce, signatures);
        latestNonce = nonce;
        latestBlockNumber = blockNumber;
        latestBlockHash = blockHash;
        latestStateRoot = stateRoot;
        latestReceiptsRoot = receiptsRoot;
    }

    function verifyHeader(bytes calldata proof)
        external
        view
        returns (
            bool valid,
            uint256 blockNumber,
            bytes32 blockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot
        )
    {
        (
            uint256 proofBlockNumber,
            bytes32 proofBlockHash,
            bytes32 proofStateRoot,
            bytes32 proofReceiptsRoot,
            uint256 nonce,
            bytes[] memory signatures
        ) = abi.decode(proof, (uint256, bytes32, bytes32, bytes32, uint256, bytes[]));
        if (
            proofBlockNumber != latestBlockNumber ||
            proofBlockHash != latestBlockHash ||
            proofStateRoot != latestStateRoot ||
            proofReceiptsRoot != latestReceiptsRoot ||
            nonce != latestNonce
        ) return (false, 0, bytes32(0), bytes32(0), bytes32(0));
        _checkSignatures(
            proofBlockNumber,
            proofBlockHash,
            proofStateRoot,
            proofReceiptsRoot,
            nonce,
            signatures
        );
        return (true, proofBlockNumber, proofBlockHash, proofStateRoot, proofReceiptsRoot);
    }

    function _checkSignatures(
        uint256 blockNumber,
        bytes32 blockHash,
        bytes32 stateRoot,
        bytes32 receiptsRoot,
        uint256 nonce,
        bytes[] memory signatures
    ) internal view {
        if (signatures.length < threshold) revert BadSignature();
        bytes32 structHash = keccak256(
            abi.encode(ATTESTATION_TYPEHASH, blockNumber, blockHash, stateRoot, receiptsRoot, nonce)
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
