// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Walks a bounded Ethereum parent-hash chain.
/// @dev This shows that a later header extends an earlier one. It does not
/// prove beacon finality, so `headerFinal` stays false.
contract AacEthereumHeaderChain {
    error InvalidHeader();
    error BrokenLink();

    function verify(bytes[] calldata headers)
        external
        pure
        returns (
            bytes32 oldestHash,
            bytes32 newestHash,
            uint256 oldestNumber,
            uint256 newestNumber,
            uint256 links,
            bool headerFinal
        )
    {
        if (headers.length < 2 || headers.length > 128) revert InvalidHeader();
        oldestHash = keccak256(headers[0]);
        oldestNumber = _number(headers[0]);
        bytes32 previous = oldestHash;
        uint256 previousNumber = oldestNumber;
        for (uint256 i = 1; i < headers.length; i++) {
            uint256 number = _number(headers[i]);
            if (_parent(headers[i]) != previous || number != previousNumber + 1) revert BrokenLink();
            previous = keccak256(headers[i]);
            previousNumber = number;
        }
        newestHash = previous;
        newestNumber = previousNumber;
        links = headers.length - 1;
        headerFinal = false;
    }

    function _parent(bytes calldata headerRlp) private pure returns (bytes32) {
        return _field(headerRlp, 0);
    }

    function _number(bytes calldata headerRlp) private pure returns (uint256) {
        (uint256 payloadStart, uint256 payloadLength) = _fieldSpan(headerRlp, 8);
        uint256 value;
        for (uint256 i; i < payloadLength; i++) value = (value << 8) | uint8(headerRlp[payloadStart + i]);
        return value;
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
        if (start >= data.length) revert InvalidHeader();
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
        if (next > data.length) revert InvalidHeader();
        return (payloadStart, payloadLength, next, true);
    }

    function _readLength(bytes calldata data, uint256 start, uint256 lengthBytes)
        private
        pure
        returns (uint256 value)
    {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) revert InvalidHeader();
        for (uint256 i; i < lengthBytes; i++) value = (value << 8) | uint8(data[start + i]);
    }

    function _word(bytes calldata data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidHeader();
        assembly {
            out := calldataload(add(data.offset, start))
        }
    }
}
