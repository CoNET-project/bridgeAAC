// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseOutputRootProof {
    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof
    ) external view returns (bytes32 outputRoot, uint256 l2SequenceNumber, bytes32 baseBlockHash, bool headerFinal);
}

/// @notice Reads the Base receipts root from the header already bound to the
/// pinned anchor output root.
/// @dev The receipt trie can be checked against this root later. The binding
/// is not Ethereum beacon finality, so `headerFinal` stays false.
contract AacBaseAnchorReceiptRoot {
    address public immutable outputRootProof;

    error InvalidHeader();
    error UnexpectedFinality();

    constructor(address outputRootProof_) {
        if (outputRootProof_ == address(0)) revert InvalidHeader();
        outputRootProof = outputRootProof_;
    }

    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof
    )
        external
        view
        returns (
            bytes32 outputRoot,
            bytes32 baseBlockHash,
            bytes32 stateRoot,
            bytes32 receiptsRoot,
            uint256 l2SequenceNumber,
            bool headerFinal
        )
    {
        bool innerFinal;
        (outputRoot, l2SequenceNumber, baseBlockHash, innerFinal) = IAacBaseOutputRootProof(outputRootProof)
            .verify(ethereumHeaderRlp, gameAccountProof, gameCode, baseHeaderRlp, messagePasserProof);
        if (innerFinal) revert UnexpectedFinality();
        if (keccak256(baseHeaderRlp) != baseBlockHash) revert InvalidHeader();
        stateRoot = _field(baseHeaderRlp, 3);
        receiptsRoot = _field(baseHeaderRlp, 5);
        if (stateRoot == bytes32(0) || receiptsRoot == bytes32(0)) revert InvalidHeader();
        headerFinal = false;
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
