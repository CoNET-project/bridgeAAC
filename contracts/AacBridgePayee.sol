// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Reads the single beneficiary from a Treasury BridgeOperation log.
/// @dev Same typed-receipt walk as AacCheckpointMessageCover. Fail-closed unless
///      there is exactly one beneficiary and amounts[0] equals grossAmount.
contract AacBridgePayee {
    error InvalidProof();

    function payee(bytes calldata receipt, uint256 logIndex) external pure returns (address beneficiary, uint256 gross) {
        bytes memory data = _logData(receipt, logIndex);
        (, , , , , , address[] memory beneficiaries, uint256[] memory amounts, uint256 decodedGross) = abi.decode(
            data, (uint8, uint8, address, address, address, address, address[], uint256[], uint256)
        );
        if (
            beneficiaries.length != 1 || amounts.length != 1 || amounts[0] != decodedGross || decodedGross == 0
                || beneficiaries[0] == address(0)
        ) revert InvalidProof();
        beneficiary = beneficiaries[0];
        gross = decodedGross;
    }

    function _logData(bytes calldata receipt, uint256 logIndex) private pure returns (bytes memory data) {
        (uint256 start, uint256 end) = _logSpan(receipt, logIndex);
        (, , uint256 topicsAt,) = _item(receipt, start);
        (, , uint256 afterTopics,) = _item(receipt, topicsAt);
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
}
