// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseBridgeBeaconParentLink {
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
        );
}

/// @notice Extends the bridge block's beacon root up to a later observed
/// checkpoint. The later root is pinned from a beacon header observation.
/// @dev Slot 15413984 is newer than the bridge beacon slot. This parent walk
/// does not verify a sync-committee signature, so headerFinal stays false.
contract AacBaseBridgeBeaconCheckpointExtension {
    address public constant PARENT_LINK = 0x58F6560184EdD9912F2032060D56fc726a042960;
    bytes32 public constant BASE_BLOCK_HASH =
        0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08;
    bytes32 public constant OPERATION_ID =
        0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654;
    bytes32 public constant BRIDGE_BEACON_ROOT =
        0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5;
    uint256 public constant BRIDGE_BEACON_SLOT = 15413404;
    bytes32 public constant PRIOR_CHECKPOINT_ROOT =
        0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e;
    uint256 public constant PRIOR_LINKS = 284;
    bytes32 public constant CHECKPOINT_ROOT =
        0x480505bce46a8902cd88c95f6a2a3d9998c8cbdffd25f9c4aa7ef81d3a5e6453;
    uint256 public constant CHECKPOINT_SLOT = 15413984;
    uint256 public constant LINKS = 580;

    error InvalidHeader();
    error InvalidLink();

    function verify(
        bytes calldata headerRlp,
        bytes calldata receiptRlp,
        bytes[] calldata proofNodes,
        IAacBaseBridgeBeaconParentLink.Header[] calldata bridgeHeaders,
        IAacBaseBridgeBeaconParentLink.Header[] calldata extensionHeaders
    )
        external
        view
        returns (
            bytes32 baseBlockHash,
            bytes32 operationId,
            bytes32 bridgeBeaconRoot,
            bytes32 checkpointRoot,
            uint256 links,
            bool headerFinal
        )
    {
        bytes32 priorRoot;
        uint256 priorLinks;
        bool priorFinal;
        (baseBlockHash, operationId, bridgeBeaconRoot, priorRoot, priorLinks, priorFinal) =
            IAacBaseBridgeBeaconParentLink(PARENT_LINK).verify(headerRlp, receiptRlp, proofNodes, bridgeHeaders);
        if (
            baseBlockHash != BASE_BLOCK_HASH || operationId != OPERATION_ID || bridgeBeaconRoot != BRIDGE_BEACON_ROOT
                || priorRoot != PRIOR_CHECKPOINT_ROOT || priorLinks != PRIOR_LINKS || priorFinal
        ) revert InvalidLink();
        (checkpointRoot, links) = _walk(extensionHeaders);
        headerFinal = false;
    }

    function _walk(IAacBaseBridgeBeaconParentLink.Header[] calldata headers)
        private
        pure
        returns (bytes32 checkpointRoot, uint256 links)
    {
        if (headers.length != LINKS || headers[0].slot != CHECKPOINT_SLOT) revert InvalidHeader();
        bytes32 expected = CHECKPOINT_ROOT;
        uint64 previousSlot = type(uint64).max;
        for (uint256 i; i < headers.length; i++) {
            IAacBaseBridgeBeaconParentLink.Header calldata header = headers[i];
            if (header.slot >= previousSlot || _root(header) != expected) revert InvalidHeader();
            expected = header.parentRoot;
            previousSlot = header.slot;
        }
        if (expected != BRIDGE_BEACON_ROOT || previousSlot != BRIDGE_BEACON_SLOT + 1) revert InvalidHeader();
        checkpointRoot = CHECKPOINT_ROOT;
        links = LINKS;
    }

    function _root(IAacBaseBridgeBeaconParentLink.Header calldata header) private pure returns (bytes32) {
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
