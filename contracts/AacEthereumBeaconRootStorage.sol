// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacEthereumHeaderBeaconRoot {
    function verify(bytes calldata ethereumHeaderRlp)
        external
        pure
        returns (bytes32 headerHash, bytes32 parentBeaconBlockRoot, uint256 headerNumber, bool headerFinal);
}

/// @notice Proves that the EIP-4788 beacon-roots contract, inside the already
/// accepted Ethereum execution state, stores the same parent beacon root the
/// header commits. This is an execution-state record, not beacon finality.
contract AacEthereumBeaconRootStorage {
    address public constant HEADER_READER = 0xc9F20370b13266F3DfD71e257df8D2F84B8a3e0b;
    address public constant BEACON_ROOTS = 0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02;
    bytes32 public constant BEACON_ROOTS_CODEHASH =
        0xf57acd40259872606d76197ef052f3d35588dadf919ee1f0e3cb9b62d3f4b02c;
    uint256 public constant HISTORY_BUFFER_LENGTH = 8191;
    uint256 private constant STATE_ROOT_INDEX = 3;
    uint256 private constant TIMESTAMP_INDEX = 11;

    error InvalidHeader();
    error InvalidProof();
    error InvalidRlp();
    error UnexpectedFinality();

    struct NodeInfo {
        uint256 count;
        uint256[] starts;
        uint256[] payloadStarts;
        uint256[] payloadLengths;
        bool[] lists;
    }

    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata accountProof,
        bytes[] calldata timestampProof,
        bytes[] calldata rootProof
    )
        external
        view
        returns (
            bytes32 headerHash,
            bytes32 stateRoot,
            bytes32 parentBeaconBlockRoot,
            uint256 timestamp,
            bool headerFinal
        )
    {
        bool innerFinal;
        uint256 headerNumber;
        (headerHash, parentBeaconBlockRoot, headerNumber, innerFinal) =
            IAacEthereumHeaderBeaconRoot(HEADER_READER).verify(ethereumHeaderRlp);
        if (innerFinal) revert UnexpectedFinality();
        if (headerHash != keccak256(ethereumHeaderRlp) || headerNumber == 0 || parentBeaconBlockRoot == bytes32(0)) {
            revert InvalidHeader();
        }
        stateRoot = _wordField(ethereumHeaderRlp, STATE_ROOT_INDEX);
        timestamp = _uintField(ethereumHeaderRlp, TIMESTAMP_INDEX);
        if (stateRoot == bytes32(0) || timestamp == 0) revert InvalidHeader();

        uint256 slot = timestamp % HISTORY_BUFFER_LENGTH;
        bytes memory account = _walk(stateRoot, keccak256(abi.encodePacked(BEACON_ROOTS)), accountProof);
        if (_codeHash(account) != BEACON_ROOTS_CODEHASH) revert InvalidProof();
        bytes32 storageRoot = _storageRoot(account);
        if (_uintValue(_walk(storageRoot, keccak256(abi.encode(slot)), timestampProof)) != timestamp) {
            revert InvalidProof();
        }
        if (
            bytes32(_uintValue(_walk(storageRoot, keccak256(abi.encode(slot + HISTORY_BUFFER_LENGTH)), rootProof)))
                != parentBeaconBlockRoot
        ) revert InvalidProof();
        headerFinal = false;
    }

    function _wordField(bytes calldata headerRlp, uint256 index) private pure returns (bytes32) {
        (uint256 payloadStart, uint256 payloadLength) = _fieldSpan(headerRlp, index);
        if (payloadLength != 32) revert InvalidHeader();
        return _calldataWord(headerRlp, payloadStart);
    }

    function _uintField(bytes calldata headerRlp, uint256 index) private pure returns (uint256 value) {
        (uint256 payloadStart, uint256 payloadLength) = _fieldSpan(headerRlp, index);
        if (payloadLength == 0 || payloadLength > 32) revert InvalidHeader();
        for (uint256 i; i < payloadLength; i++) value = (value << 8) | uint8(headerRlp[payloadStart + i]);
    }

    function _fieldSpan(bytes calldata headerRlp, uint256 index)
        private
        pure
        returns (uint256 payloadStart, uint256 payloadLength)
    {
        (uint256 listPayloadStart, uint256 listPayloadLength, uint256 listNext, bool isList) = _calldataItem(headerRlp, 0);
        if (!isList || listNext != headerRlp.length) revert InvalidHeader();
        uint256 cursor = listPayloadStart;
        uint256 end = listPayloadStart + listPayloadLength;
        for (uint256 i; i <= index; i++) {
            if (cursor >= end) revert InvalidHeader();
            (uint256 itemPayloadStart, uint256 itemPayloadLength, uint256 itemNext,) = _calldataItem(headerRlp, cursor);
            if (i == index) return (itemPayloadStart, itemPayloadLength);
            cursor = itemNext;
        }
        revert InvalidHeader();
    }

    function _calldataItem(bytes calldata data, uint256 start)
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
            payloadLength = _calldataLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            return (payloadStart, payloadLength, payloadStart + payloadLength, false);
        }
        if (prefix <= 0xf7) return (start + 1, prefix - 0xc0, start + 1 + (prefix - 0xc0), true);
        uint256 lengthBytes = prefix - 0xf7;
        payloadLength = _calldataLength(data, start + 1, lengthBytes);
        payloadStart = start + 1 + lengthBytes;
        next = payloadStart + payloadLength;
        if (next > data.length) revert InvalidHeader();
        return (payloadStart, payloadLength, next, true);
    }

    function _calldataLength(bytes calldata data, uint256 start, uint256 lengthBytes)
        private
        pure
        returns (uint256 value)
    {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) revert InvalidHeader();
        for (uint256 i; i < lengthBytes; i++) value = (value << 8) | uint8(data[start + i]);
    }

    function _calldataWord(bytes calldata data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidHeader();
        assembly {
            out := calldataload(add(data.offset, start))
        }
    }

    function _walk(bytes32 root, bytes32 keyHash, bytes[] calldata proof) private pure returns (bytes memory value) {
        if (proof.length == 0 || keccak256(proof[0]) != root) revert InvalidProof();
        bytes memory key = _nibbles(keyHash);
        bytes memory node = proof[0];
        uint256 proofIndex;
        uint256 keyIndex;
        while (true) {
            NodeInfo memory info = _list(node);
            if (info.count == 17) {
                if (keyIndex == key.length) revert InvalidProof();
                uint8 nibble = uint8(key[keyIndex]);
                keyIndex++;
                (node, proofIndex) = _next(node, info, nibble, proof, proofIndex);
                continue;
            }
            if (info.count != 2) revert InvalidProof();
            bytes memory compact = _slice(node, info.payloadStarts[0], info.payloadLengths[0]);
            (bool leaf, bytes memory path) = _decodePath(compact);
            if (keyIndex + path.length > key.length) revert InvalidProof();
            for (uint256 i; i < path.length; i++) {
                if (uint8(path[i]) != uint8(key[keyIndex + i])) revert InvalidProof();
            }
            keyIndex += path.length;
            if (leaf) {
                if (keyIndex != key.length) revert InvalidProof();
                return _slice(node, info.payloadStarts[1], info.payloadLengths[1]);
            }
            (node, proofIndex) = _next(node, info, 1, proof, proofIndex);
        }
    }

    function _next(
        bytes memory parent,
        NodeInfo memory info,
        uint256 index,
        bytes[] calldata proof,
        uint256 proofIndex
    ) private pure returns (bytes memory node, uint256 nextProofIndex) {
        if (info.payloadLengths[index] == 0) revert InvalidProof();
        if (!info.lists[index] && info.payloadLengths[index] == 32) {
            if (proofIndex + 1 >= proof.length) revert InvalidProof();
            bytes memory child = proof[proofIndex + 1];
            if (keccak256(child) != _word(parent, info.payloadStarts[index])) revert InvalidProof();
            return (child, proofIndex + 1);
        }
        if (!info.lists[index]) revert InvalidProof();
        uint256 start = info.starts[index];
        return (_slice(parent, start, _itemEnd(parent, start) - start), proofIndex);
    }

    function _storageRoot(bytes memory accountRlp) private pure returns (bytes32) {
        NodeInfo memory info = _list(accountRlp);
        if (info.count != 4 || info.payloadLengths[2] != 32) revert InvalidProof();
        return _word(accountRlp, info.payloadStarts[2]);
    }

    function _codeHash(bytes memory accountRlp) private pure returns (bytes32) {
        NodeInfo memory info = _list(accountRlp);
        if (info.count != 4 || info.payloadLengths[3] != 32) revert InvalidProof();
        return _word(accountRlp, info.payloadStarts[3]);
    }

    function _uintValue(bytes memory encoded) private pure returns (uint256 word) {
        (, uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList) = _item(encoded, 0);
        if (isList || next != encoded.length || payloadLength == 0 || payloadLength > 32) revert InvalidRlp();
        for (uint256 i; i < payloadLength; i++) word = (word << 8) | uint8(encoded[payloadStart + i]);
    }

    function _nibbles(bytes32 keyHash) private pure returns (bytes memory nibbles) {
        nibbles = new bytes(64);
        for (uint256 i; i < 32; i++) {
            uint8 value = uint8(keyHash[i]);
            nibbles[i * 2] = bytes1(value >> 4);
            nibbles[i * 2 + 1] = bytes1(value & 0x0f);
        }
    }

    function _decodePath(bytes memory encoded) private pure returns (bool leaf, bytes memory path) {
        if (encoded.length == 0) revert InvalidRlp();
        uint8 flags = uint8(encoded[0]) >> 4;
        if (flags > 3) revert InvalidRlp();
        leaf = flags >= 2;
        bool odd = (flags & 1) == 1;
        path = new bytes(encoded.length * 2 - (odd ? 1 : 2));
        uint256 out;
        if (odd) path[out++] = bytes1(uint8(encoded[0]) & 0x0f);
        else if ((uint8(encoded[0]) & 0x0f) != 0) revert InvalidRlp();
        for (uint256 i = 1; i < encoded.length; i++) {
            path[out++] = bytes1(uint8(encoded[i]) >> 4);
            path[out++] = bytes1(uint8(encoded[i]) & 0x0f);
        }
    }

    function _list(bytes memory node) private pure returns (NodeInfo memory info) {
        (, uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList) = _item(node, 0);
        if (!isList || next != node.length) revert InvalidRlp();
        uint256 cursor = payloadStart;
        uint256 end = payloadStart + payloadLength;
        info.starts = new uint256[](17);
        info.payloadStarts = new uint256[](17);
        info.payloadLengths = new uint256[](17);
        info.lists = new bool[](17);
        while (cursor < end) {
            if (info.count == 17) revert InvalidRlp();
            (uint256 itemStart, uint256 itemPayloadStart, uint256 itemPayloadLength, uint256 itemNext, bool itemIsList) =
                _item(node, cursor);
            info.starts[info.count] = itemStart;
            info.payloadStarts[info.count] = itemPayloadStart;
            info.payloadLengths[info.count] = itemPayloadLength;
            info.lists[info.count] = itemIsList;
            cursor = itemNext;
            info.count++;
        }
    }

    function _item(bytes memory data, uint256 start)
        private
        pure
        returns (uint256 encodedStart, uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList)
    {
        if (start >= data.length) revert InvalidRlp();
        uint8 prefix = uint8(data[start]);
        if (prefix < 0x80) return (start, start, 1, start + 1, false);
        if (prefix <= 0xb7) {
            payloadLength = prefix - 0x80;
            payloadStart = start + 1;
            isList = false;
        } else if (prefix <= 0xbf) {
            uint256 lengthBytes = prefix - 0xb7;
            payloadLength = _readLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            isList = false;
        } else if (prefix <= 0xf7) {
            payloadLength = prefix - 0xc0;
            payloadStart = start + 1;
            isList = true;
        } else {
            uint256 lengthBytes = prefix - 0xf7;
            payloadLength = _readLength(data, start + 1, lengthBytes);
            payloadStart = start + 1 + lengthBytes;
            isList = true;
        }
        next = payloadStart + payloadLength;
        if (next > data.length) revert InvalidRlp();
        return (start, payloadStart, payloadLength, next, isList);
    }

    function _itemEnd(bytes memory data, uint256 start) private pure returns (uint256 next) {
        (, , , next,) = _item(data, start);
    }

    function _readLength(bytes memory data, uint256 start, uint256 lengthBytes) private pure returns (uint256 value) {
        if (lengthBytes == 0 || lengthBytes > 8 || start + lengthBytes > data.length) revert InvalidRlp();
        for (uint256 i; i < lengthBytes; i++) value = (value << 8) | uint8(data[start + i]);
    }

    function _slice(bytes memory data, uint256 start, uint256 length) private pure returns (bytes memory out) {
        if (start + length > data.length) revert InvalidRlp();
        out = new bytes(length);
        for (uint256 i; i < length; i++) out[i] = data[start + i];
    }

    function _word(bytes memory data, uint256 start) private pure returns (bytes32 out) {
        if (start + 32 > data.length) revert InvalidRlp();
        assembly {
            out := mload(add(add(data, 0x20), start))
        }
    }
}
