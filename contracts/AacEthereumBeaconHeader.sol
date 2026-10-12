// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Checks the SSZ hash of one beacon block header. The parent root is
/// the beacon root already committed by execution block 26167826, and the
/// block root is the beacon block that contains that execution hash.
/// @dev This does not prove the header is the finalized checkpoint.
contract AacEthereumBeaconHeader {
    bytes32 public constant BEACON_BLOCK_ROOT =
        0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3;
    bytes32 public constant PARENT_BEACON_ROOT =
        0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7;
    uint256 public constant BEACON_SLOT = 15406750;

    error InvalidHeader();

    function verify(
        uint256 slot,
        uint256 proposerIndex,
        bytes32 parentRoot,
        bytes32 stateRoot,
        bytes32 bodyRoot
    ) external pure returns (bytes32 beaconBlockRoot, bytes32 parentBeaconRoot, uint256 beaconSlot, bool headerFinal) {
        if (slot != BEACON_SLOT || proposerIndex > type(uint64).max || parentRoot != PARENT_BEACON_ROOT) {
            revert InvalidHeader();
        }
        bytes32 zero = bytes32(0);
        bytes32 slotChunk = _uint64Chunk(slot);
        bytes32 proposerChunk = _uint64Chunk(proposerIndex);
        bytes32 h01 = sha256(abi.encodePacked(slotChunk, proposerChunk));
        bytes32 h23 = sha256(abi.encodePacked(parentRoot, stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(bodyRoot, zero));
        bytes32 h67 = sha256(abi.encodePacked(zero, zero));
        beaconBlockRoot = sha256(
            abi.encodePacked(sha256(abi.encodePacked(h01, h23)), sha256(abi.encodePacked(h45, h67)))
        );
        if (beaconBlockRoot != BEACON_BLOCK_ROOT) revert InvalidHeader();
        parentBeaconRoot = parentRoot;
        beaconSlot = slot;
        headerFinal = false;
    }

    function _uint64Chunk(uint256 value) private pure returns (bytes32 chunk) {
        uint256 word;
        for (uint256 i; i < 8; i++) {
            word |= ((value >> (8 * i)) & 0xff) << (8 * (31 - i));
        }
        chunk = bytes32(word);
    }
}
