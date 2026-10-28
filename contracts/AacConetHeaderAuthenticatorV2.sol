// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacSszBranch.sol";
import "./AacConetHeaderAuthenticator.sol";

/// @notice Authenticates one CoNET execution header from the CoNET beacon chain, for the Fulu layout.
/// @dev Same trust chain as AacConetHeaderAuthenticator (Deneb). The only layout changes are the finalized
///      checkpoint position and its branch length. Electra appended execution_requests to the beacon block body
///      and Fulu appended proposer_lookahead to the beacon state, so:
///      - the finalized root is the checkpoint root at gindex 169 (7-node branch), not gindex 105;
///      - the execution block_hash is still at gindex 6444 with a 12-node branch, because the execution payload
///        and the position of execution_payload in the body did not change (checked against a real Fulu update
///        in the Fulu fixture test).
///      The signing fork version is chosen by epoch inside IAacConetSourceFinalityV2 (Deneb, Electra, Fulu).
///      Use this contract with a finality source that is fork-aware, not with the V1 Deneb source.
contract AacConetHeaderAuthenticatorV2 {
    address public immutable SOURCE;

    uint256 public constant FINALIZED_GINDEX = 169;
    uint256 public constant PAYLOAD_GINDEX = 6444;
    uint256 public constant FINALITY_BRANCH_LENGTH = 7;
    uint256 public constant PAYLOAD_BRANCH_LENGTH = 12;
    uint256 public constant MAX_BEACON_CHAIN = 256;
    uint256 public constant RECEIPTS_ROOT_INDEX = 5;

    error InvalidProof();
    error BadAddress();

    struct Header {
        uint256 slot;
        uint256 proposer;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    struct Aggregate {
        bytes signerUncompressed;
        bytes bits;
        Header attested;
        uint256 signatureSlot;
        bytes signaturePoint;
    }

    constructor(address source_) {
        if (source_ == address(0)) revert BadAddress();
        SOURCE = source_;
    }

    /// @notice Returns keccak256(headerRlp) and the receiptsRoot it commits to, if the whole chain verifies.
    /// @param beaconChain Beacon headers from the message block (index 0) up to the finalized header (last).
    /// @param payloadBranch The 12-node SSZ branch from the execution block_hash to the message block root.
    /// @param headerRlp The execution header RLP of the message block.
    function authenticate(
        Aggregate calldata aggregate,
        Header calldata finalized,
        bytes32[] calldata finalityBranch,
        Header[] calldata beaconChain,
        bytes32[] calldata payloadBranch,
        bytes calldata headerRlp
    ) external view returns (bytes32 headerHash, bytes32 receiptsRoot) {
        (, bool ok) = IAacConetSourceFinalityV2(SOURCE).verifyAggregate(
            IAacConetSourceFinalityV2.Aggregate({
                signerUncompressed: aggregate.signerUncompressed,
                bits: aggregate.bits,
                attested: IAacConetSourceFinalityV2.Header({
                    slot: aggregate.attested.slot,
                    proposer: aggregate.attested.proposer,
                    parentRoot: aggregate.attested.parentRoot,
                    stateRoot: aggregate.attested.stateRoot,
                    bodyRoot: aggregate.attested.bodyRoot
                }),
                signatureSlot: aggregate.signatureSlot,
                signaturePoint: aggregate.signaturePoint
            })
        );
        if (!ok) revert InvalidProof();

        // 2. Finality: the finalized block root is the finalized checkpoint in the attested state (gindex 169).
        if (finalityBranch.length != FINALITY_BRANCH_LENGTH) revert InvalidProof();
        if (finalized.slot > aggregate.attested.slot) revert InvalidProof();
        bytes32 finalizedRoot = _headerRoot(finalized);
        if (!AacSszBranch.verify(finalizedRoot, FINALIZED_GINDEX, finalityBranch, aggregate.attested.stateRoot)) {
            revert InvalidProof();
        }

        // 3. Beacon chain: from the message block up to the finalized block, linked by parent roots.
        uint256 n = beaconChain.length;
        if (n == 0 || n > MAX_BEACON_CHAIN) revert InvalidProof();
        bytes32 messageRoot = _headerRoot(beaconChain[0]);
        bytes32 root = messageRoot;
        for (uint256 i = 1; i < n; i++) {
            if (beaconChain[i].slot <= beaconChain[i - 1].slot || beaconChain[i].parentRoot != root) {
                revert InvalidProof();
            }
            root = _headerRoot(beaconChain[i]);
        }
        if (root != finalizedRoot) revert InvalidProof();

        // 4. Payload: the execution block hash of the message block is keccak256 of the header RLP.
        if (payloadBranch.length != PAYLOAD_BRANCH_LENGTH) revert InvalidProof();
        headerHash = keccak256(headerRlp);
        if (!AacSszBranch.verify(headerHash, PAYLOAD_GINDEX, payloadBranch, messageRoot)) revert InvalidProof();

        receiptsRoot = _field(headerRlp, RECEIPTS_ROOT_INDEX);
    }

    function _headerRoot(Header calldata h) private pure returns (bytes32) {
        bytes32 zero = bytes32(0);
        bytes32 h01 = sha256(abi.encodePacked(_u64(h.slot), _u64(h.proposer)));
        bytes32 h23 = sha256(abi.encodePacked(h.parentRoot, h.stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(h.bodyRoot, zero));
        bytes32 h67 = sha256(abi.encodePacked(zero, zero));
        return sha256(abi.encodePacked(sha256(abi.encodePacked(h01, h23)), sha256(abi.encodePacked(h45, h67))));
    }

    function _u64(uint256 value) private pure returns (bytes32 chunk) {
        uint256 word;
        for (uint256 i; i < 8; i++) word |= ((value >> (8 * i)) & 0xff) << (8 * (31 - i));
        chunk = bytes32(word);
    }

    function _field(bytes calldata headerRlp, uint256 index) private pure returns (bytes32) {
        (uint256 payloadStart, uint256 payloadLength) = _fieldSpan(headerRlp, index);
        if (payloadLength != 32) revert InvalidProof();
        return _word(headerRlp, payloadStart);
    }

    function _fieldSpan(bytes calldata headerRlp, uint256 index)
        private
        pure
        returns (uint256 payloadStart, uint256 payloadLength)
    {
        (uint256 listPayloadStart, uint256 listPayloadLength, uint256 listNext, bool isList) = _item(headerRlp, 0);
        if (!isList || listNext != headerRlp.length) revert InvalidProof();
        uint256 cursor = listPayloadStart;
        uint256 end = listPayloadStart + listPayloadLength;
        for (uint256 i; i <= index; i++) {
            if (cursor >= end) revert InvalidProof();
            (uint256 itemPayloadStart, uint256 itemPayloadLength, uint256 itemNext,) = _item(headerRlp, cursor);
            if (i == index) return (itemPayloadStart, itemPayloadLength);
            cursor = itemNext;
        }
        revert InvalidProof();
    }

    function _item(bytes calldata data, uint256 start)
        private
        pure
        returns (uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList)
    {
        if (start >= data.length) revert InvalidProof();
        uint8 prefix = uint8(data[start]);
        if (prefix < 0x80) return (start, 1, start + 1, false);
        if (prefix <= 0xb7) return (start + 1, prefix - 0x80, start + 1 + (prefix - 0x80), false);
        if (prefix <= 0xbf) {
            uint256 lengthBytes = prefix - 0xb7;
            payloadLength = _readLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            return (payloadStart, payloadLength, payloadStart + payloadLength, false);
        }
        if (prefix <= 0xf7) return (start + 1, prefix - 0xc0, start + 1 + (prefix - 0xc0), true);
        uint256 lengthBytes2 = prefix - 0xf7;
        payloadLength = _readLength(data, start + 1, lengthBytes2);
        payloadStart = start + 1 + lengthBytes2;
        next = payloadStart + payloadLength;
        if (next > data.length) revert InvalidProof();
        return (payloadStart, payloadLength, next, true);
    }

    function _readLength(bytes calldata data, uint256 start, uint256 lengthBytes)
        private
        pure
        returns (uint256 value)
    {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) revert InvalidProof();
        for (uint256 i; i < lengthBytes; i++) value = (value << 8) | uint8(data[start + i]);
    }

    function _word(bytes calldata data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidProof();
        assembly {
            out := calldataload(add(data.offset, start))
        }
    }
}
