// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Testnet-only CoNET sync-committee evidence relay.
/// @dev This is not a BLS/SSZ light client. It is an integration boundary for
/// testing AacConetFinalityVerifier and must not authorize mainnet custody.
contract AacConetSyncCommitteeRelayVerifier {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "ConetFinalityAttestation(bytes32 genesisValidatorsRoot,uint256 finalizedEpoch,uint256 executionBlockNumber,bytes32 executionBlockHash,bytes32 stateRoot,bytes32 receiptsRoot,uint256 participants,uint256 committeeSize,bool stateRootBound,bool committeeHandoff,bool trustedCommittee,uint256 forcedUpdates,uint256 nonce)"
    );

    string public constant NAME = "bridgeAAC CoNET Finality Relay";
    string public constant VERSION = "1";
    uint256 public constant CONET_CHAIN_ID = 224422;

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public immutable threshold;
    uint256 public immutable expectedGenesisValidatorsRoot;
    uint256 public latestNonce;

    bytes32 public latestGenesisValidatorsRoot;
    uint256 public latestFinalizedEpoch;
    uint256 public latestExecutionBlockNumber;
    bytes32 public latestExecutionBlockHash;
    bytes32 public latestStateRoot;
    bytes32 public latestReceiptsRoot;
    uint256 public latestParticipants;
    uint256 public latestCommitteeSize;
    bool public latestStateRootBound;
    bool public latestCommitteeHandoff;
    bool public latestTrustedCommittee;
    uint256 public latestForcedUpdates;

    error BadConfiguration();
    error BadAttestation();
    error BadSignature();
    error DuplicateSigner();
    error NonceNotIncreasing();

    constructor(bytes32 genesisRoot_, address[] memory signers_, uint256 threshold_) {
        if (genesisRoot_ == bytes32(0) || signers_.length == 0 || threshold_ == 0 || threshold_ > signers_.length) {
            revert BadConfiguration();
        }
        expectedGenesisValidatorsRoot = uint256(genesisRoot_);
        threshold = threshold_;
        address previous;
        for (uint256 i; i < signers_.length; i++) {
            address signer = signers_[i];
            if (signer == address(0) || signer <= previous || isSigner[signer]) revert BadConfiguration();
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

    function submitFinality(
        bytes32 genesisValidatorsRoot,
        uint256 finalizedEpoch,
        uint256 executionBlockNumber,
        bytes32 executionBlockHash,
        bytes32 stateRoot,
        bytes32 receiptsRoot,
        uint256 participants,
        uint256 committeeSize,
        bool stateRootBound,
        bool committeeHandoff,
        bool trustedCommittee,
        uint256 forcedUpdates,
        uint256 nonce,
        bytes[] calldata signatures
    ) external {
        if (
            genesisValidatorsRoot != bytes32(expectedGenesisValidatorsRoot) ||
            finalizedEpoch == 0 ||
            executionBlockNumber == 0 ||
            executionBlockHash == bytes32(0) ||
            stateRoot == bytes32(0) ||
            receiptsRoot == bytes32(0) ||
            committeeSize == 0
        ) revert BadAttestation();
        if (nonce <= latestNonce) revert NonceNotIncreasing();
        _checkSignatures(
            genesisValidatorsRoot,
            finalizedEpoch,
            executionBlockNumber,
            executionBlockHash,
            stateRoot,
            receiptsRoot,
            participants,
            committeeSize,
            stateRootBound,
            committeeHandoff,
            trustedCommittee,
            forcedUpdates,
            nonce,
            signatures
        );
        latestNonce = nonce;
        latestGenesisValidatorsRoot = genesisValidatorsRoot;
        latestFinalizedEpoch = finalizedEpoch;
        latestExecutionBlockNumber = executionBlockNumber;
        latestExecutionBlockHash = executionBlockHash;
        latestStateRoot = stateRoot;
        latestReceiptsRoot = receiptsRoot;
        latestParticipants = participants;
        latestCommitteeSize = committeeSize;
        latestStateRootBound = stateRootBound;
        latestCommitteeHandoff = committeeHandoff;
        latestTrustedCommittee = trustedCommittee;
        latestForcedUpdates = forcedUpdates;
    }

    function verifyFinality(bytes calldata proof)
        external
        view
        returns (
            bool valid,
            uint256 finalizedEpoch,
            uint256 executionBlockNumber,
            bytes32 executionBlockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot,
            bytes32 genesisValidatorsRoot,
            uint256 participants,
            uint256 committeeSize,
            bool stateRootBound,
            bool committeeHandoff,
            bool trustedCommittee,
            uint256 forcedUpdates
        )
    {
        (
            bytes32 proofGenesisRoot,
            uint256 proofEpoch,
            uint256 proofBlockNumber,
            bytes32 proofBlockHash,
            bytes32 proofStateRoot,
            bytes32 proofReceiptsRoot,
            uint256 proofParticipants,
            uint256 proofCommitteeSize,
            bool proofStateBound,
            bool proofHandoff,
            bool proofTrusted,
            uint256 proofForced,
            uint256 proofNonce,
            bytes[] memory signatures
        ) = abi.decode(proof, (bytes32, uint256, uint256, bytes32, bytes32, bytes32, uint256, uint256, bool, bool, bool, uint256, uint256, bytes[]));
        if (
            proofGenesisRoot != latestGenesisValidatorsRoot ||
            proofEpoch != latestFinalizedEpoch ||
            proofBlockNumber != latestExecutionBlockNumber ||
            proofBlockHash != latestExecutionBlockHash ||
            proofStateRoot != latestStateRoot ||
            proofReceiptsRoot != latestReceiptsRoot ||
            proofParticipants != latestParticipants ||
            proofCommitteeSize != latestCommitteeSize ||
            proofStateBound != latestStateRootBound ||
            proofHandoff != latestCommitteeHandoff ||
            proofTrusted != latestTrustedCommittee ||
            proofForced != latestForcedUpdates ||
            proofNonce != latestNonce
        ) return (false, 0, 0, bytes32(0), bytes32(0), bytes32(0), bytes32(0), 0, 0, false, false, false, 0);
        _checkSignatures(
            proofGenesisRoot,
            proofEpoch,
            proofBlockNumber,
            proofBlockHash,
            proofStateRoot,
            proofReceiptsRoot,
            proofParticipants,
            proofCommitteeSize,
            proofStateBound,
            proofHandoff,
            proofTrusted,
            proofForced,
            proofNonce,
            signatures
        );
        return (
            true,
            proofEpoch,
            proofBlockNumber,
            proofBlockHash,
            proofStateRoot,
            proofReceiptsRoot,
            proofGenesisRoot,
            proofParticipants,
            proofCommitteeSize,
            proofStateBound,
            proofHandoff,
            proofTrusted,
            proofForced
        );
    }

    function _checkSignatures(
        bytes32 genesisValidatorsRoot,
        uint256 finalizedEpoch,
        uint256 executionBlockNumber,
        bytes32 executionBlockHash,
        bytes32 stateRoot,
        bytes32 receiptsRoot,
        uint256 participants,
        uint256 committeeSize,
        bool stateRootBound,
        bool committeeHandoff,
        bool trustedCommittee,
        uint256 forcedUpdates,
        uint256 nonce,
        bytes[] memory signatures
    ) internal view {
        if (signatures.length < threshold) revert BadSignature();
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                genesisValidatorsRoot,
                finalizedEpoch,
                executionBlockNumber,
                executionBlockHash,
                stateRoot,
                receiptsRoot,
                participants,
                committeeSize,
                stateRootBound,
                committeeHandoff,
                trustedCommittee,
                forcedUpdates,
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
