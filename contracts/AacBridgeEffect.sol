// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Reads the single-beneficiary Treasury BridgeOperation effect from a receipt.
/// @dev Data layout matches BridgeOperation: phase, mode, sourceTreasury, sourceAsset,
///      destinationAsset, sender, beneficiaries, amounts, grossAmount.
contract AacBridgeEffect {
    error InvalidProof();

    function effect(bytes calldata receipt, uint256 logIndex)
        external
        pure
        returns (address beneficiary, uint256 gross, address destinationAsset, uint8 mode, uint256 destinationChainId)
    {
        (uint256 start, uint256 end) = _logSpan(receipt, logIndex);
        destinationChainId = _topicUint(receipt, start, 3);
        bytes memory data = _logData(receipt, start, end);
        uint8 decodedMode;
        address decodedAsset;
        address[] memory beneficiaries;
        uint256[] memory amounts;
        uint256 decodedGross;
        (, decodedMode, , , decodedAsset, , beneficiaries, amounts, decodedGross) = abi.decode(
            data, (uint8, uint8, address, address, address, address, address[], uint256[], uint256)
        );
        if (
            beneficiaries.length != 1 || amounts.length != 1 || amounts[0] != decodedGross || decodedGross == 0
                || beneficiaries[0] == address(0) || decodedAsset == address(0) || destinationChainId == 0
        ) revert InvalidProof();
        beneficiary = beneficiaries[0];
        gross = decodedGross;
        destinationAsset = decodedAsset;
        mode = decodedMode;
    }

    function _topicUint(bytes calldata receipt, uint256 logStart, uint256 topicIndex) private pure returns (uint256) {
        (, , uint256 topicsHeader,) = _item(receipt, logStart);
        (uint256 topicsStart, uint256 topicsLen,, bool topicsList) = _item(receipt, topicsHeader);
        if (!topicsList) revert InvalidProof();
        uint256 at = topicsStart;
        uint256 topicsEnd = topicsStart + topicsLen;
        for (uint256 i; i <= topicIndex; i++) {
            if (at >= topicsEnd) revert InvalidProof();
            (uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList) = _item(receipt, at);
            if (i == topicIndex) {
                if (isList || payloadLength != 32) revert InvalidProof();
                return uint256(bytes32(receipt[payloadStart:payloadStart + 32]));
            }
            at = next;
        }
        revert InvalidProof();
    }

    function _logData(bytes calldata receipt, uint256 start, uint256 end) private pure returns (bytes memory data) {
        (, , uint256 topicsHeader,) = _item(receipt, start);
        (, , uint256 afterTopics,) = _item(receipt, topicsHeader);
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
