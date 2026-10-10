// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Ethereum receipt-trie verifier for AAC proof packages.
/// @dev The receipt bytes are compared byte-for-byte with the value committed
/// by the MPT. It does not authenticate the header finality; a separate
/// Base/CoNET finality verifier must authenticate `receiptsRoot`.
contract AacReceiptMptVerifier {
    error InvalidProof();
    error InvalidRlp();

    struct NodeInfo {
        uint256 count;
        uint256[] starts;
        uint256[] payloadStarts;
        uint256[] payloadLengths;
        bool[] lists;
    }

    /// @notice Verify one receipt against an authenticated receipts root.
    /// @param receiptsRoot The receiptsRoot from the authenticated source header.
    /// @param receiptIndex The transaction index in the source block.
    /// @param receiptRlp The exact trie value, including an EIP-2718 type byte.
    /// @param proofNodes Ordered MPT nodes from root to receipt leaf.
    function verifyReceipt(
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes
    ) external pure returns (bool) {
        return _verifyReceipt(receiptsRoot, receiptIndex, receiptRlp, proofNodes);
    }

    /// @notice Interface-compatible proof entry point for the M4 consumer.
    /// @dev Header finality is checked by the separate finality verifier.
    function verifyReceiptProof(
        uint256 sourceChainId,
        bytes32 sourceHeader,
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes
    ) external pure returns (bool) {
        if (sourceChainId == 0 || sourceHeader == bytes32(0)) revert InvalidProof();
        return _verifyReceipt(receiptsRoot, receiptIndex, receiptRlp, proofNodes);
    }

    function _verifyReceipt(
        bytes32 receiptsRoot,
        uint64 receiptIndex,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes
    ) private pure returns (bool) {
        if (proofNodes.length == 0) revert InvalidProof();
        bytes memory key = _keyNibbles(receiptIndex);
        bytes memory node = proofNodes[0];
        uint256 proofIndex;
        uint256 keyIndex;
        bool hashNode = true;

        while (true) {
            if (hashNode && keccak256(node) != receiptsRoot && proofIndex == 0) {
                revert InvalidProof();
            }
            if (hashNode && proofIndex > 0) {
                // The expected child hash is checked when the child is loaded.
                // The node itself is already the committed proof element.
            }

            NodeInfo memory info = _list(node);

            if (info.count == 17) {
                if (keyIndex == key.length) {
                    return _bytesEqual(
                        _payload(node, info.payloadStarts[16], info.payloadLengths[16]),
                        receiptRlp
                    );
                }
                uint8 nibble = uint8(key[keyIndex]);
                keyIndex++;
                (node, hashNode, proofIndex) = _nextChild(
                    node,
                    info.starts[nibble],
                    info.payloadStarts[nibble],
                    info.payloadLengths[nibble],
                    info.lists[nibble],
                    proofNodes,
                    proofIndex
                );
                continue;
            }

            if (info.count != 2) revert InvalidProof();
            bytes memory compact = _payload(node, info.payloadStarts[0], info.payloadLengths[0]);
            (bool leaf, bytes memory path) = _decodeCompactPath(compact);
            if (keyIndex + path.length > key.length) revert InvalidProof();
            for (uint256 i; i < path.length; i++) {
                if (uint8(path[i]) != uint8(key[keyIndex + i])) revert InvalidProof();
            }
            keyIndex += path.length;

            if (leaf) {
                if (keyIndex != key.length) revert InvalidProof();
                return _bytesEqual(
                    _payload(node, info.payloadStarts[1], info.payloadLengths[1]),
                    receiptRlp
                );
            }

            (node, hashNode, proofIndex) = _nextChild(
                node,
                info.starts[1],
                info.payloadStarts[1],
                info.payloadLengths[1],
                info.lists[1],
                proofNodes,
                proofIndex
            );
        }
    }

    function _nextChild(
        bytes memory parent,
        uint256 start,
        uint256 payloadStart,
        uint256 payloadLength,
        bool isList,
        bytes[] calldata proofNodes,
        uint256 proofIndex
    ) private pure returns (bytes memory node, bool hashNode, uint256 nextProofIndex) {
        if (payloadLength == 0) revert InvalidProof();
        if (!isList && payloadLength == 32) {
            if (proofIndex + 1 >= proofNodes.length) revert InvalidProof();
            bytes memory child = proofNodes[proofIndex + 1];
            if (keccak256(child) != _bytes32(parent, payloadStart)) revert InvalidProof();
            return (child, true, proofIndex + 1);
        }
        if (!isList) revert InvalidProof();
        return (_slice(parent, start, _itemEnd(parent, start) - start), false, proofIndex);
    }

    function _list(bytes memory node) private pure returns (NodeInfo memory info) {
        (uint256 encodedStart, uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList) =
            _item(node, 0);
        if (!isList || next != node.length || payloadStart + payloadLength > node.length) {
            revert InvalidRlp();
        }
        uint256 cursor = payloadStart;
        uint256 end = payloadStart + payloadLength;
        info.starts = new uint256[](17);
        info.payloadStarts = new uint256[](17);
        info.payloadLengths = new uint256[](17);
        info.lists = new bool[](17);
        while (cursor < end) {
            if (info.count == 17) revert InvalidRlp();
            (uint256 itemStart, uint256 itemPayloadStart, uint256 itemPayloadLength,
                uint256 itemNext, bool itemIsList) = _item(node, cursor);
            info.starts[info.count] = itemStart;
            info.payloadStarts[info.count] = itemPayloadStart;
            info.payloadLengths[info.count] = itemPayloadLength;
            info.lists[info.count] = itemIsList;
            cursor = itemNext;
            info.count++;
        }
        if (cursor != end || encodedStart != 0) revert InvalidRlp();
    }

    function _item(bytes memory data, uint256 start)
        private
        pure
        returns (
            uint256 encodedStart,
            uint256 payloadStart,
            uint256 payloadLength,
            uint256 next,
            bool isList
        )
    {
        if (start >= data.length) revert InvalidRlp();
        uint8 prefix = uint8(data[start]);
        if (prefix < 0x80) {
            return (start, start, 1, start + 1, false);
        }
        if (prefix <= 0xb7) {
            payloadLength = prefix - 0x80;
            payloadStart = start + 1;
            next = payloadStart + payloadLength;
            isList = false;
        } else if (prefix <= 0xbf) {
            uint256 lengthBytes = prefix - 0xb7;
            payloadLength = _readLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            next = payloadStart + payloadLength;
            isList = false;
        } else if (prefix <= 0xf7) {
            payloadLength = prefix - 0xc0;
            payloadStart = start + 1;
            next = payloadStart + payloadLength;
            isList = true;
        } else {
            uint256 lengthBytes = prefix - 0xf7;
            payloadLength = _readLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            next = payloadStart + payloadLength;
            isList = true;
        }
        if (next > data.length || payloadStart > next) revert InvalidRlp();
        return (start, payloadStart, payloadLength, next, isList);
    }

    function _itemEnd(bytes memory data, uint256 start) private pure returns (uint256) {
        (, , , uint256 next, ) = _item(data, start);
        return next;
    }

    function _readLength(bytes memory data, uint256 start, uint256 lengthBytes)
        private
        pure
        returns (uint256 value)
    {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) {
            revert InvalidRlp();
        }
        for (uint256 i; i < lengthBytes; i++) {
            value = (value << 8) | uint8(data[start + i]);
        }
    }

    function _decodeCompactPath(bytes memory encoded)
        private
        pure
        returns (bool leaf, bytes memory path)
    {
        if (encoded.length == 0) revert InvalidRlp();
        uint8 flags = uint8(encoded[0]) >> 4;
        if (flags > 3) revert InvalidRlp();
        leaf = flags >= 2;
        bool odd = (flags & 1) == 1;
        uint256 pathLength = encoded.length * 2 - (odd ? 1 : 2);
        path = new bytes(pathLength);
        uint256 out;
        if (odd) {
            path[out++] = bytes1(uint8(encoded[0]) & 0x0f);
        } else if ((uint8(encoded[0]) & 0x0f) != 0) {
            revert InvalidRlp();
        }
        for (uint256 i = 1; i < encoded.length; i++) {
            path[out++] = bytes1(uint8(encoded[i]) >> 4);
            path[out++] = bytes1(uint8(encoded[i]) & 0x0f);
        }
    }

    function _keyNibbles(uint64 value) private pure returns (bytes memory) {
        bytes memory encoded;
        if (value == 0) {
            encoded = new bytes(1);
            encoded[0] = bytes1(uint8(0x80));
        } else {
            uint256 length;
            uint64 temp = value;
            while (temp != 0) {
                length++;
                temp >>= 8;
            }
            if (length == 1 && value < 0x80) {
                encoded = new bytes(1);
                encoded[0] = bytes1(uint8(value));
            } else {
                encoded = new bytes(length + 1);
                encoded[0] = bytes1(uint8(0x80 + length));
                for (uint256 i = length; i > 0; i--) {
                    encoded[i] = bytes1(uint8(value >> ((length - i) * 8)));
                }
            }
        }
        bytes memory nibbles = new bytes(encoded.length * 2);
        for (uint256 i; i < encoded.length; i++) {
            nibbles[i * 2] = bytes1(uint8(encoded[i]) >> 4);
            nibbles[i * 2 + 1] = bytes1(uint8(encoded[i]) & 0x0f);
        }
        return nibbles;
    }

    function _payload(bytes memory data, uint256 start, uint256 length)
        private
        pure
        returns (bytes memory out)
    {
        out = _slice(data, start, length);
    }

    function _slice(bytes memory data, uint256 start, uint256 length)
        private
        pure
        returns (bytes memory out)
    {
        if (start + length > data.length) revert InvalidRlp();
        out = new bytes(length);
        for (uint256 i; i < length; i++) {
            out[i] = data[start + i];
        }
    }

    function _bytes32(bytes memory data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidRlp();
        assembly {
            out := mload(add(add(data, 0x20), start))
        }
    }

    function _bytesEqual(bytes memory left, bytes memory right) private pure returns (bool) {
        return keccak256(left) == keccak256(right);
    }
}
