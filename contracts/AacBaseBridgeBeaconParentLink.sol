// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseBridgeOperationInclusion {
    function verify(bytes calldata headerRlp, bytes calldata receiptRlp, bytes[] calldata proofNodes)
        external
        pure
        returns (bytes32 blockHash, bytes32 operationId, uint256 amount, bool headerFinal);
}

/// @notice Binds the 0.01 USDC bridge block to the accepted beacon checkpoint
/// by the beacon root stored in that Base header.
/// @dev The stored root is the L1 beacon parent observed by Base block
/// 52497860. A parent walk to the pinned checkpoint is not beacon finality.
contract AacBaseBridgeBeaconParentLink {
    address public constant INCLUSION = 0x80Eb248985Ef0B6a5cF6C84A83a6A872666d1621;
    bytes32 public constant BASE_BLOCK_HASH =
        0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08;
    bytes32 public constant OPERATION_ID =
        0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654;
    uint256 public constant AMOUNT = 10_000;
    bytes32 public constant BEACON_ROOT =
        0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5;
    uint256 public constant BEACON_SLOT = 15413404;
    bytes32 public constant FINALIZED_ROOT =
        0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e;
    uint256 public constant FINALIZED_SLOT = 15413120;
    uint256 public constant LINKS = 284;
    uint256 private constant BEACON_ROOT_INDEX = 19;

    error InvalidHeader();
    error InvalidLink();

    struct Header {
        uint64 slot;
        uint64 proposerIndex;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    function verify(
        bytes calldata headerRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        Header[] calldata headers
    )
        external
        view
        returns (
            bytes32 baseBlockHash,
            bytes32 operationId,
            bytes32 beaconRoot,
            bytes32 finalizedRoot,
            uint256 links,
            bool headerFinal
        )
    {
        bool inclusionFinal;
        uint256 amount;
        (baseBlockHash, operationId, amount, inclusionFinal) =
            IAacBaseBridgeOperationInclusion(INCLUSION).verify(headerRlp, receiptRlp, proofNodes);
        if (
            baseBlockHash != BASE_BLOCK_HASH || operationId != OPERATION_ID || amount != AMOUNT || inclusionFinal
                || _field(headerRlp, BEACON_ROOT_INDEX) != BEACON_ROOT
        ) revert InvalidLink();
        (beaconRoot, finalizedRoot, links) = _walk(headers);
        headerFinal = false;
    }

    function _walk(Header[] calldata headers)
        private
        pure
        returns (bytes32 beaconRoot, bytes32 finalizedRoot, uint256 links)
    {
        if (headers.length != LINKS || headers[0].slot != BEACON_SLOT) revert InvalidHeader();
        bytes32 expected = BEACON_ROOT;
        uint64 previousSlot = type(uint64).max;
        for (uint256 i; i < headers.length; i++) {
            Header calldata header = headers[i];
            if (header.slot >= previousSlot || _root(header) != expected) revert InvalidHeader();
            expected = header.parentRoot;
            previousSlot = header.slot;
        }
        if (expected != FINALIZED_ROOT || previousSlot != FINALIZED_SLOT + 1) revert InvalidHeader();
        beaconRoot = BEACON_ROOT;
        finalizedRoot = FINALIZED_ROOT;
        links = LINKS;
    }

    function _root(Header calldata header) private pure returns (bytes32) {
        bytes32 zero = bytes32(0);
        bytes32 h01 = sha256(abi.encodePacked(_uint64Chunk(header.slot), _uint64Chunk(header.proposerIndex)));
        bytes32 h23 = sha256(abi.encodePacked(header.parentRoot, header.stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(header.bodyRoot, zero));
        bytes32 h67 = sha256(abi.encodePacked(zero, zero));
        return sha256(abi.encodePacked(sha256(abi.encodePacked(h01, h23)), sha256(abi.encodePacked(h45, h67))));
    }

    function _uint64Chunk(uint64 value) private pure returns (bytes32 chunk) {
        uint256 word;
        uint256 full = uint256(value);
        for (uint256 i; i < 8; i++) {
            word |= ((full >> (8 * i)) & 0xff) << (8 * (31 - i));
        }
        chunk = bytes32(word);
    }

    function _field(bytes calldata headerRlp, uint256 index) private pure returns (bytes32) {
        (uint256 listStart, uint256 listLen, uint256 listNext, bool isList) = _item(headerRlp, 0);
        if (!isList || listNext != headerRlp.length) revert InvalidHeader();
        uint256 cursor = listStart;
        uint256 end = listStart + listLen;
        for (uint256 i; i <= index; i++) {
            if (cursor >= end) revert InvalidHeader();
            (uint256 itemStart, uint256 itemLen, uint256 itemNext,) = _item(headerRlp, cursor);
            if (i == index) {
                if (itemLen != 32) revert InvalidHeader();
                return _word(headerRlp, itemStart);
            }
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
