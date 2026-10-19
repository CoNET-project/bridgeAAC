// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IAacBaseOutputRootProof} from "./AacBaseAnchorReceiptRoot.sol";
import {AacBridgeReceiptLog} from "./AacBridgeReceiptLog.sol";
import {AacSszBranch} from "./AacSszBranch.sol";

interface IAacCheckpointStoreV4 {
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

    function period() external view returns (uint256);

    function verifyFinalized(Aggregate calldata input, Header calldata finalized, bytes32[7] calldata finalityBranch)
        external
        view
        returns (uint256 participants, bool headerFinal);
}

interface IAacReceiptMptVerifierV4 {
    function verifyReceipt(bytes32 receiptsRoot, uint64 receiptIndex, bytes calldata receiptRlp, bytes[] calldata proofNodes)
        external
        pure
        returns (bool);
}

/// @notice CoNET-side cover for one Base bridge message. The Base header is bound to the L1 anchor.
/// @dev Successor of the AacConetBaseMessageCover at 13c93a7 (audit gap G-14). That cover read
/// receiptsRoot from a Base header the caller supplied and never hashed it against a Base block.
/// This version takes the Base block hash from the output-root proof and requires
/// keccak256(baseHeaderRlp) to equal it, as AacCheckpointMessageCoverV2 does. It also binds the L1
/// header to the finalized beacon execution payload (gindex 6444), as AacCheckpointMessageCoverV3 does.
/// The checkpoint store, output-root proof and receipt verifier are constructor parameters. The
/// contract has no owner and no upgrade path, and no settler uses it.
/// The 0x0b presence probe of the 13c93a7 cover is not carried over, as in V2 and V3. It guarded a
/// precompile the store never calls. The store checks the success flag and output length of each
/// precompile it does call (0x0c, 0x0d, 0x0f, 0x11), so a missing precompile makes verifyFinalized revert.
contract AacConetBaseMessageCoverV4 {
    address public immutable STORE;
    address public immutable OUTPUT_ROOT_PROOF;
    address public immutable RECEIPT_VERIFIER;
    address public constant TREASURY = 0xa208982212978550594A7FEEB70a61665d129003;
    bytes32 public constant BRIDGE_TOPIC =
        0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba;
    uint256 public constant RECEIPTS_ROOT_INDEX = 5;
    uint256 public constant BEACON_ROOT_INDEX = 19;
    uint256 public constant L1_PAYLOAD_GINDEX = 6444;
    uint256 public constant L1_PAYLOAD_BRANCH_LENGTH = 12;

    error InvalidProof();
    error HeaderNotAnchored();
    error UnexpectedFinality();
    error L1HeaderNotFinal();
    error ZeroAddress();

    /// @dev Inputs for the L1 output-root anchor that authenticates the Base block hash, and the branch
    /// from the L1 execution payload (block_hash) to the finalized beacon block root.
    struct L1Anchor {
        bytes ethereumHeaderRlp;
        bytes[] gameAccountProof;
        bytes gameCode;
        bytes[] messagePasserProof;
        bytes32[] l1PayloadBranch;
    }

    event MessageCovered(
        bytes32 indexed operationId,
        uint256 amount,
        uint256 messageSlot,
        uint256 finalizedSlot,
        uint256 participants
    );

    constructor(address store_, address outputRootProof_, address receiptVerifier_) {
        if (store_ == address(0) || outputRootProof_ == address(0) || receiptVerifier_ == address(0)) {
            revert ZeroAddress();
        }
        STORE = store_;
        OUTPUT_ROOT_PROOF = outputRootProof_;
        RECEIPT_VERIFIER = receiptVerifier_;
    }

    function cover(
        L1Anchor calldata anchor,
        IAacCheckpointStoreV4.Aggregate calldata input,
        IAacCheckpointStoreV4.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointStoreV4.Header[] calldata beaconHeaders
    )
        external
        returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool headerFinal_)
    {
        // The Base header must be the block that the L1 output-root anchor commits to.
        // Only that block's receiptsRoot and parentBeaconBlockRoot are read below.
        (, , bytes32 baseBlockHash, bool anchorFinal) = IAacBaseOutputRootProof(OUTPUT_ROOT_PROOF).verify(
            anchor.ethereumHeaderRlp,
            anchor.gameAccountProof,
            anchor.gameCode,
            baseHeaderRlp,
            anchor.messagePasserProof
        );
        if (anchorFinal) revert UnexpectedFinality();
        if (keccak256(baseHeaderRlp) != baseBlockHash) revert HeaderNotAnchored();
        (uint256 participants, bool proven) =
            IAacCheckpointStoreV4(STORE).verifyFinalized(input, finalized, finalityBranch);
        if (!proven) revert InvalidProof();
        // The L1 header must be the execution payload of the finalized beacon block, so the state root
        // read through the anchor is authenticated and not caller-supplied.
        if (anchor.l1PayloadBranch.length != L1_PAYLOAD_BRANCH_LENGTH) revert InvalidProof();
        if (
            !AacSszBranch.verify(
                keccak256(anchor.ethereumHeaderRlp), L1_PAYLOAD_GINDEX, anchor.l1PayloadBranch, _header(finalized)
            )
        ) revert L1HeaderNotFinal();
        bytes32 receiptsRoot = _field(baseHeaderRlp, RECEIPTS_ROOT_INDEX);
        bytes32 messageBeaconRoot = _field(baseHeaderRlp, BEACON_ROOT_INDEX);
        if (!IAacReceiptMptVerifierV4(RECEIPT_VERIFIER).verifyReceipt(receiptsRoot, receiptIndex, receiptRlp, proofNodes)) {
            revert InvalidProof();
        }
        operationId = AacBridgeReceiptLog.operationId(receiptRlp, logIndex, TREASURY, BRIDGE_TOPIC);
        amount = AacBridgeReceiptLog.amount(receiptRlp, logIndex);
        if (amount == 0 || operationId == bytes32(0)) revert InvalidProof();
        uint256 messageSlot = _beaconChain(beaconHeaders, messageBeaconRoot, finalized);
        uint256 storedPeriod = IAacCheckpointStoreV4(STORE).period();
        if (messageSlot / 8192 != storedPeriod || finalized.slot < messageSlot) revert InvalidProof();
        messageCovered_ = true;
        headerFinal_ = true;
        emit MessageCovered(operationId, amount, messageSlot, finalized.slot, participants);
    }

    function _beaconChain(
        IAacCheckpointStoreV4.Header[] calldata headers,
        bytes32 messageBeaconRoot,
        IAacCheckpointStoreV4.Header calldata finalized
    ) private pure returns (uint256 messageSlot) {
        uint256 count = headers.length;
        if (count == 0 || count > 256) revert InvalidProof();
        bytes32 root = _header(headers[0]);
        if (root != messageBeaconRoot) revert InvalidProof();
        messageSlot = headers[0].slot;
        for (uint256 i = 1; i < count; i++) {
            if (headers[i].slot <= headers[i - 1].slot || headers[i].parentRoot != root) revert InvalidProof();
            root = _header(headers[i]);
        }
        if (
            root != _header(finalized)
                || headers[count - 1].slot != finalized.slot
                || headers[count - 1].proposer != finalized.proposer
                || headers[count - 1].parentRoot != finalized.parentRoot
                || headers[count - 1].stateRoot != finalized.stateRoot
                || headers[count - 1].bodyRoot != finalized.bodyRoot
        ) revert InvalidProof();
    }

    function _header(IAacCheckpointStoreV4.Header calldata header) private pure returns (bytes32) {
        bytes32 zero = bytes32(0);
        bytes32 h01 = sha256(abi.encodePacked(_u64(header.slot), _u64(header.proposer)));
        bytes32 h23 = sha256(abi.encodePacked(header.parentRoot, header.stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(header.bodyRoot, zero));
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
        uint256 lengthBytes = prefix - 0xf7;
        payloadLength = _readLength(data, start + 1, lengthBytes);
        payloadStart = start + 1 + lengthBytes;
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
