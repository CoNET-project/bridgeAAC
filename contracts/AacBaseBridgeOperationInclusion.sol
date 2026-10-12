// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacReceiptMptVerifier {
    function verifyReceipt(
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes
    ) external pure returns (bool);
}

/// @notice Proves the 0.01 USDC BridgeOperation receipt is inside Base block
/// 52497860. This block is not under the accepted beacon checkpoint, so
/// headerFinal stays false.
contract AacBaseBridgeOperationInclusion {
    bytes32 public constant BLOCK_HASH =
        0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08;
    bytes32 public constant RECEIPTS_ROOT =
        0x6b1c954169e8c09544fbc5ce2bffd6e558cbdcd09d46ea0e563af12d5654dca7;
    address public constant TREASURY = 0xa208982212978550594A7FEEB70a61665d129003;
    bytes32 public constant BRIDGE_TOPIC =
        0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba;
    bytes32 public constant OPERATION_ID =
        0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654;
    bytes32 public constant LOG_DATA_HASH =
        0x488cb0f5812d2d09d55ad3e32b23c0edda720d40ce88cca79f5cf8c4abe0f5c6;
    uint64 public constant RECEIPT_INDEX = 154;
    uint256 public constant LOG_INDEX = 1;
    uint256 public constant AMOUNT = 10_000;
    address public constant RECEIPT_VERIFIER = 0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10;

    error InvalidHeader();
    error InvalidProof();

    function verify(bytes calldata headerRlp, bytes calldata receiptRlp, bytes[] calldata proofNodes)
        external
        pure
        returns (bytes32 blockHash, bytes32 operationId, uint256 amount, bool headerFinal)
    {
        blockHash = keccak256(headerRlp);
        if (blockHash != BLOCK_HASH) revert InvalidHeader();
        if (_field(headerRlp, 5) != RECEIPTS_ROOT) revert InvalidHeader();
        if (
            !IAacReceiptMptVerifier(RECEIPT_VERIFIER).verifyReceipt(
                RECEIPTS_ROOT, RECEIPT_INDEX, receiptRlp, proofNodes
            )
        ) revert InvalidProof();
        operationId = _bridgeLog(receiptRlp);
        if (operationId != OPERATION_ID) revert InvalidProof();
        amount = AMOUNT;
        headerFinal = false;
    }

    function _bridgeLog(bytes calldata receipt) private pure returns (bytes32 operationId) {
        if (receipt.length < 2 || uint8(receipt[0]) != 0x02) revert InvalidProof();
        (uint256 listStart, uint256 listLen, uint256 listNext, bool isList) = _item(receipt, 1);
        if (!isList || listNext != receipt.length) revert InvalidProof();
        uint256 cursor = listStart;
        uint256 end = listStart + listLen;
        uint256 logsStart;
        uint256 logsLen;
        for (uint256 i; i < 4; i++) {
            if (cursor >= end) revert InvalidProof();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext, bool itemList) = _item(receipt, cursor);
            if (i == 3) {
                if (!itemList) revert InvalidProof();
                logsStart = itemStart;
                logsLen = itemLen;
            }
            cursor = itemNext;
        }
        cursor = logsStart;
        end = logsStart + logsLen;
        for (uint256 i; i <= LOG_INDEX; i++) {
            if (cursor >= end) revert InvalidProof();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext, bool itemList) = _item(receipt, cursor);
            if (i == LOG_INDEX) {
                if (!itemList) revert InvalidProof();
                return _decodeBridge(receipt, itemStart, itemStart + itemLen);
            }
            cursor = itemNext;
        }
        revert InvalidProof();
    }

    function _decodeBridge(bytes calldata receipt, uint256 start, uint256 end)
        private
        pure
        returns (bytes32 operationId)
    {
        (uint256 addrStart, uint256 addrLen, uint256 next, bool addrList) = _item(receipt, start);
        if (addrList || addrLen != 20) revert InvalidProof();
        if (address(uint160(uint256(_load(receipt, addrStart, addrLen)))) != TREASURY) revert InvalidProof();
        (uint256 topicsStart, uint256 topicsLen, uint256 afterTopics, bool topicsList) = _item(receipt, next);
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
        (uint256 dataStart, uint256 dataLen, uint256 dataNext, bool dataList) = _item(receipt, afterTopics);
        if (dataList || dataNext != end) revert InvalidProof();
        if (keccak256(receipt[dataStart:dataStart + dataLen]) != LOG_DATA_HASH) revert InvalidProof();
    }

    function _field(bytes calldata headerRlp, uint256 index) private pure returns (bytes32) {
        (uint256 payloadStart, uint256 payloadLength) = _fieldSpan(headerRlp, index);
        if (payloadLength != 32) revert InvalidHeader();
        return _word(headerRlp, payloadStart);
    }

    function _fieldSpan(bytes calldata headerRlp, uint256 index)
        private
        pure
        returns (uint256 payloadStart, uint256 payloadLength)
    {
        (uint256 listPayloadStart, uint256 listPayloadLength, uint256 listNext, bool isList) = _item(headerRlp, 0);
        if (!isList || listNext != headerRlp.length) revert InvalidHeader();
        uint256 cursor = listPayloadStart;
        uint256 end = listPayloadStart + listPayloadLength;
        for (uint256 i; i <= index; i++) {
            if (cursor >= end) revert InvalidHeader();
            (uint256 itemPayloadStart, uint256 itemPayloadLength, uint256 itemNext,) = _item(headerRlp, cursor);
            if (i == index) return (itemPayloadStart, itemPayloadLength);
            cursor = itemNext;
        }
        revert InvalidHeader();
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
