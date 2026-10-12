// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Checks a beacon parent chain from one finalized checkpoint back to
/// the already accepted beacon block at slot 15406751.
/// @dev The checkpoint is a pinned observation. This walk does not verify a
/// sync-committee signature, so headerFinal stays false.
contract AacEthereumBeaconAncestry {
    bytes32 public constant FINALIZED_ROOT =
        0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e;
    uint256 public constant FINALIZED_SLOT = 15413120;
    bytes32 public constant ANCHOR_ROOT =
        0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf;
    uint256 public constant ANCHOR_SLOT = 15406751;

    error InvalidHeader();

    struct Header {
        uint64 slot;
        uint64 proposerIndex;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    function verify(Header[] calldata headers)
        external
        pure
        returns (
            bytes32 finalizedRoot,
            bytes32 anchorRoot,
            uint256 links,
            uint256 oldestSlot,
            bool headerFinal
        )
    {
        uint256 count = headers.length;
        if (count == 0 || count > 8192) revert InvalidHeader();
        if (headers[0].slot != FINALIZED_SLOT) revert InvalidHeader();
        bytes32 expected = FINALIZED_ROOT;
        uint64 previousSlot = type(uint64).max;
        for (uint256 i; i < count; i++) {
            Header calldata header = headers[i];
            if (header.slot >= previousSlot) revert InvalidHeader();
            if (_root(header) != expected) revert InvalidHeader();
            expected = header.parentRoot;
            previousSlot = header.slot;
        }
        if (expected != ANCHOR_ROOT || previousSlot <= ANCHOR_SLOT) revert InvalidHeader();
        finalizedRoot = FINALIZED_ROOT;
        anchorRoot = ANCHOR_ROOT;
        links = count;
        oldestSlot = previousSlot;
        headerFinal = false;
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
}
