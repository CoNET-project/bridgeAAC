// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IAacBaseOutputRootProof} from "./AacBaseAnchorReceiptRoot.sol";
import "./AacSszBranch.sol";

interface IAacCheckpointStoreV2 {
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

interface IAacReceiptMptVerifierV2 {
    function verifyReceipt(bytes32 receiptsRoot, uint64 receiptIndex, bytes calldata receiptRlp, bytes[] calldata proofNodes)
        external
        pure
        returns (bool);
}

/// @notice Covers one new Base bridge message with the installed checkpoint.
/// @dev V3 adds the L1 header binding that V2 lacked: the L1 header RLP must be the payload of the
/// finalized beacon block. Without it, the output-root anchor reads an unauthenticated state root.
/// Successor of AacCheckpointMessageCover (deployed at 0x0150...65233,
/// left unchanged). The original trusted any caller-supplied Base header: it
/// read receiptsRoot from baseHeaderRlp and never hashed that header against a
/// Base block. This version first takes the Base block hash from the L1
/// output-root anchor (the same path as AacBaseAnchorReceiptRoot) and requires
/// keccak256(baseHeaderRlp) to equal it. Only then is receiptsRoot read.
/// The beacon finality check is unchanged. The production gate is not wired to
/// this contract.
contract AacCheckpointMessageCoverV3 {
    address public constant STORE = 0xcEE3D699df3df07a573f1aFf642888B97B7aA961;
    address public constant RECEIPT_VERIFIER = 0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10;
    address public constant TREASURY = 0xa208982212978550594A7FEEB70a61665d129003;
    address public constant OUTPUT_ROOT_PROOF = 0x57A498086d00A7Da80c8304F6189712b583c34C4;
    bytes32 public constant BRIDGE_TOPIC =
        0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba;
    uint256 public constant RECEIPTS_ROOT_INDEX = 5;
    uint256 public constant BEACON_ROOT_INDEX = 19;

    error InvalidProof();
    error HeaderNotAnchored();
    error UnexpectedFinality();
    error L1HeaderNotFinal();

    /// @dev Inputs for the L1 output-root anchor that authenticates the Base block hash.
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

    function cover(
        L1Anchor calldata anchor,
        IAacCheckpointStoreV2.Aggregate calldata input,
        IAacCheckpointStoreV2.Header calldata finalized,
        bytes32[7] calldata finalityBranch,
        bytes calldata baseHeaderRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        uint64 receiptIndex,
        uint256 logIndex,
        IAacCheckpointStoreV2.Header[] calldata beaconHeaders
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
            IAacCheckpointStoreV2(STORE).verifyFinalized(input, finalized, finalityBranch);
        if (!proven) revert InvalidProof();
        // The L1 header the output-root anchor reads must be the execution payload of the finalized
        // beacon block (gindex 6444), so its state root is authenticated, not caller-supplied.
        if (anchor.l1PayloadBranch.length != 12) revert InvalidProof();
        if (!AacSszBranch.verify(keccak256(anchor.ethereumHeaderRlp), 6444, anchor.l1PayloadBranch, _header(finalized))) {
            revert L1HeaderNotFinal();
        }
        bytes32 receiptsRoot = _field(baseHeaderRlp, RECEIPTS_ROOT_INDEX);
        bytes32 messageBeaconRoot = _field(baseHeaderRlp, BEACON_ROOT_INDEX);
        if (!IAacReceiptMptVerifierV2(RECEIPT_VERIFIER).verifyReceipt(receiptsRoot, receiptIndex, receiptRlp, proofNodes)) {
            revert InvalidProof();
        }
        operationId = _bridgeLog(receiptRlp, logIndex);
        amount = _amount(receiptRlp, logIndex);
        if (amount == 0 || operationId == bytes32(0)) revert InvalidProof();
        uint256 messageSlot = _beaconChain(beaconHeaders, messageBeaconRoot, finalized);
        uint256 storedPeriod = IAacCheckpointStoreV2(STORE).period();
        if (messageSlot / 8192 != storedPeriod || finalized.slot < messageSlot) revert InvalidProof();
        messageCovered_ = true;
        headerFinal_ = true;
        emit MessageCovered(operationId, amount, messageSlot, finalized.slot, participants);
    }

    function _beaconChain(
        IAacCheckpointStoreV2.Header[] calldata headers,
        bytes32 messageBeaconRoot,
        IAacCheckpointStoreV2.Header calldata finalized
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

    function _header(IAacCheckpointStoreV2.Header calldata header) private pure returns (bytes32) {
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

    function _amount(bytes calldata receipt, uint256 logIndex) private pure returns (uint256 gross) {
        bytes memory data = _logData(receipt, logIndex);
        (, , , , , , , uint256[] memory amounts, uint256 decodedGross) = abi.decode(
            data,
            (uint8, uint8, address, address, address, address, address[], uint256[], uint256)
        );
        if (amounts.length == 0 || amounts[0] != decodedGross) revert InvalidProof();
        gross = decodedGross;
    }

    function _bridgeLog(bytes calldata receipt, uint256 logIndex) private pure returns (bytes32 operationId) {
        (uint256 start, uint256 end) = _logSpan(receipt, logIndex);
        (uint256 addrStart, uint256 addrLen, uint256 next, bool addrList) = _item(receipt, start);
        if (addrList || addrLen != 20) revert InvalidProof();
        if (address(uint160(uint256(_load(receipt, addrStart, addrLen)))) != TREASURY) revert InvalidProof();
        (uint256 topicsStart, , uint256 afterTopics, bool topicsList) = _item(receipt, next);
        if (!topicsList) revert InvalidProof();
        uint256 topicCursor = topicsStart;
        bytes32 topic0;
        for (uint256 i; i < 2; i++) {
            (uint256 topicStart, uint256 topicLen, uint256 topicNext, bool topicIsList) = _item(receipt, topicCursor);
            if (topicIsList || topicLen != 32) revert InvalidProof();
            if (i == 0) topic0 = _word(receipt, topicStart);
            else operationId = _word(receipt, topicStart);
            topicCursor = topicNext;
        }
        if (topic0 != BRIDGE_TOPIC) revert InvalidProof();
        if (afterTopics > end) revert InvalidProof();
    }

    function _logData(bytes calldata receipt, uint256 logIndex) private pure returns (bytes memory data) {
        (uint256 start, uint256 end) = _logSpan(receipt, logIndex);
        (, , uint256 topicsAt, ) = _item(receipt, start);
        (, , uint256 afterTopics, ) = _item(receipt, topicsAt);
        (uint256 dataStart, uint256 dataLen, uint256 dataNext, bool dataList) = _item(receipt, afterTopics);
        if (dataList || dataNext != end) revert InvalidProof();
        data = receipt[dataStart:dataStart + dataLen];
    }

    function _logSpan(bytes calldata receipt, uint256 logIndex) private pure returns (uint256 start, uint256 end) {
        if (receipt.length < 2 || uint8(receipt[0]) != 0x02) revert InvalidProof();
        (uint256 listStart, uint256 listLen, uint256 listNext, bool isList) = _item(receipt, 1);
        if (!isList || listNext != receipt.length) revert InvalidProof();
        uint256 cursor = listStart;
        uint256 listEnd = listStart + listLen;
        uint256 logsStart;
        uint256 logsLen;
        for (uint256 i; i < 4; i++) {
            if (cursor >= listEnd) revert InvalidProof();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext, bool itemList) = _item(receipt, cursor);
            if (i == 3) {
                if (!itemList) revert InvalidProof();
                logsStart = itemStart;
                logsLen = itemLen;
            }
            cursor = itemNext;
        }
        cursor = logsStart;
        uint256 logsEnd = logsStart + logsLen;
        for (uint256 i; i <= logIndex; i++) {
            if (cursor >= logsEnd) revert InvalidProof();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext, bool itemList) = _item(receipt, cursor);
            if (i == logIndex) {
                if (!itemList) revert InvalidProof();
                return (itemStart, itemStart + itemLen);
            }
            cursor = itemNext;
        }
        revert InvalidProof();
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

    function _load(bytes calldata data, uint256 start, uint256 length) private pure returns (bytes32 word) {
        if (length > 32 || start + length > data.length) revert InvalidProof();
        for (uint256 i; i < length; i++) word = (word << 8) | bytes32(uint256(uint8(data[start + i])));
    }

    function _word(bytes calldata data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidProof();
        assembly {
            out := calldataload(add(data.offset, start))
        }
    }
}
