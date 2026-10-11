// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseAnchorReceiptInclusion {
    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof,
        uint64 receiptIndex,
        bytes calldata receiptValue,
        bytes[] calldata receiptProof
    )
        external
        view
        returns (
            bytes32 receiptsRoot,
            bytes32 outputRoot,
            uint64 includedIndex,
            bytes32 receiptHash,
            uint256 l2SequenceNumber,
            bool headerFinal
        );
}

/// @notice Proves one USDC Transfer log sits inside a receipt already included
/// in the anchored Base block.
/// @dev The log is an ordinary token transfer from that block. It is not an
/// AAC custody event, and `headerFinal` stays false.
contract AacBaseAnchorLogProof {
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    bytes32 public constant TRANSFER_TOPIC =
        0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    address public immutable receiptInclusion;

    error InvalidProof();
    error UnexpectedFinality();

    constructor(address receiptInclusion_) {
        if (receiptInclusion_ == address(0)) revert InvalidProof();
        receiptInclusion = receiptInclusion_;
    }

    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof,
        uint64 receiptIndex,
        bytes calldata receiptValue,
        bytes[] calldata receiptProof,
        uint256 logIndex
    )
        external
        view
        returns (
            bytes32 outputRoot,
            bytes32 receiptsRoot,
            address from,
            address to,
            uint256 amount,
            uint256 l2SequenceNumber,
            bool headerFinal
        )
    {
        bool innerFinal;
        bytes32 receiptHash;
        (receiptsRoot, outputRoot, , receiptHash, l2SequenceNumber, innerFinal) =
            IAacBaseAnchorReceiptInclusion(receiptInclusion).verify(
                ethereumHeaderRlp,
                gameAccountProof,
                gameCode,
                baseHeaderRlp,
                messagePasserProof,
                receiptIndex,
                receiptValue,
                receiptProof
            );
        if (innerFinal || keccak256(receiptValue) != receiptHash) revert UnexpectedFinality();
        (from, to, amount) = _usdcTransfer(receiptValue, logIndex);
        headerFinal = false;
    }

    function _usdcTransfer(bytes calldata receipt, uint256 logIndex)
        private
        pure
        returns (address from, address to, uint256 amount)
    {
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
        for (uint256 i; i <= logIndex; i++) {
            if (cursor >= end) revert InvalidProof();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext, bool itemList) = _item(receipt, cursor);
            if (i == logIndex) {
                if (!itemList) revert InvalidProof();
                return _decodeTransfer(receipt, itemStart, itemStart + itemLen);
            }
            cursor = itemNext;
        }
        revert InvalidProof();
    }

    function _decodeTransfer(bytes calldata receipt, uint256 start, uint256 end)
        private
        pure
        returns (address from, address to, uint256 amount)
    {
        (uint256 addrStart, uint256 addrLen, uint256 next, bool addrList) = _item(receipt, start);
        if (addrList || addrLen != 20) revert InvalidProof();
        if (address(uint160(uint256(_load(receipt, addrStart, addrLen)))) != USDC) revert InvalidProof();
        (uint256 topicsStart, uint256 topicsLen, uint256 afterTopics, bool topicsList) = _item(receipt, next);
        if (!topicsList) revert InvalidProof();
        uint256 topicCursor = topicsStart;
        uint256 topicEnd = topicsStart + topicsLen;
        bytes32[3] memory topics;
        for (uint256 i; i < 3; i++) {
            if (topicCursor >= topicEnd) revert InvalidProof();
            (uint256 topicStart, uint256 topicLen, uint256 topicNext, bool topicIsList) = _item(receipt, topicCursor);
            if (topicIsList || topicLen != 32) revert InvalidProof();
            topics[i] = _word(receipt, topicStart);
            topicCursor = topicNext;
        }
        if (topicCursor != topicEnd || topics[0] != TRANSFER_TOPIC) revert InvalidProof();
        from = address(uint160(uint256(topics[1])));
        to = address(uint160(uint256(topics[2])));
        (uint256 dataStart, uint256 dataLen, uint256 dataNext, bool dataList) = _item(receipt, afterTopics);
        if (dataList || dataLen != 32 || dataNext != end) revert InvalidProof();
        amount = uint256(_word(receipt, dataStart));
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
            payloadLength = _length(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            return (payloadStart, payloadLength, payloadStart + payloadLength, false);
        }
        if (prefix <= 0xf7) return (start + 1, prefix - 0xc0, start + 1 + (prefix - 0xc0), true);
        uint256 lengthBytes = prefix - 0xf7;
        payloadLength = _length(data, start + 1, lengthBytes);
        payloadStart = start + 1 + lengthBytes;
        next = payloadStart + payloadLength;
        if (next > data.length) revert InvalidProof();
        return (payloadStart, payloadLength, next, true);
    }

    function _length(bytes calldata data, uint256 start, uint256 lengthBytes)
        private
        pure
        returns (uint256 value)
    {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) revert InvalidProof();
        for (uint256 i; i < lengthBytes; i++) value = (value << 8) | uint8(data[start + i]);
    }
}
