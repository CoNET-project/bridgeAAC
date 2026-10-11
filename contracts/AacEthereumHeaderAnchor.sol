// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseAnchorStorageProof {
    function verifyRegistryAnchorGame(
        bytes32 ethereumStateRoot,
        bytes[] calldata accountProof,
        bytes[] calldata storageProof
    ) external pure returns (address anchorGame, bool headerFinal);
}

/// @notice Binds an anchor-game storage proof to one Ethereum execution header.
/// @dev The header hash is checked, but the header is not proven to be the
/// canonical finalized chain. `headerFinal` therefore stays false.
contract AacEthereumHeaderAnchor {
    address public immutable storageProof;

    error InvalidHeader();
    error UnexpectedFinality();

    constructor(address storageProof_) {
        if (storageProof_ == address(0)) revert InvalidHeader();
        storageProof = storageProof_;
    }

    function verify(
        bytes calldata headerRlp,
        bytes[] calldata accountProof,
        bytes[] calldata storageProofNodes
    )
        external
        view
        returns (
            bytes32 headerHash,
            bytes32 stateRoot,
            address anchorGame,
            bool headerFinal
        )
    {
        if (headerRlp.length < 4) revert InvalidHeader();
        headerHash = keccak256(headerRlp);
        stateRoot = _stateRoot(headerRlp);
        bool proofFinal;
        (anchorGame, proofFinal) = IAacBaseAnchorStorageProof(storageProof)
            .verifyRegistryAnchorGame(stateRoot, accountProof, storageProofNodes);
        if (proofFinal) revert UnexpectedFinality();
        headerFinal = false;
    }

    function _stateRoot(bytes calldata headerRlp) private pure returns (bytes32) {
        (uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList) = _item(headerRlp, 0);
        if (!isList || next != headerRlp.length) revert InvalidHeader();
        uint256 cursor = payloadStart;
        uint256 end = payloadStart + payloadLength;
        for (uint256 index; index < 4; index++) {
            if (cursor >= end) revert InvalidHeader();
            (uint256 itemPayloadStart, uint256 itemPayloadLength, uint256 itemNext, bool itemIsList) =
                _itemPayload(headerRlp, cursor);
            if (index == 3) {
                if (itemIsList || itemPayloadLength != 32) revert InvalidHeader();
                return _word(headerRlp, itemPayloadStart);
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
        (payloadStart, payloadLength, next, isList) = _itemPayload(data, start);
    }

    function _itemPayload(bytes calldata data, uint256 start)
        private
        pure
        returns (uint256 payloadStart, uint256 payloadLength, uint256 next, bool isList)
    {
        if (start >= data.length) revert InvalidHeader();
        uint8 prefix = uint8(data[start]);
        if (prefix < 0x80) return (start, 1, start + 1, false);
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
        if (next > data.length) revert InvalidHeader();
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
