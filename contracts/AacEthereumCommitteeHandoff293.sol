// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Third linked handoff. The period-293 committee, identified by the
/// digest stored in the period-292 handoff, signs the period-294 committee.
/// @dev The bridge beacon slot remains in period 1881, so the message is not
/// covered and headerFinal stays false.
contract AacEthereumCommitteeHandoff293 {
    address public constant PREVIOUS = 0x34EF23A8F16F008097661bd7Ced70C20C6e03B6C;
    uint256 public constant FROM_PERIOD = 293;
    uint256 public constant TO_PERIOD = 294;
    uint256 public constant COMMITTEE_SIZE = 512;
    uint256 public constant PARTICIPANTS = 511;
    uint256 public constant BRIDGE_BEACON_SLOT = 15413404;
    uint256 public constant BRIDGE_PERIOD = 1881;
    bytes32 public constant SIGNER_COMPRESSED_DIGEST = 0xaa8b7457d2db05a2c6eaa43862958556d19fe5fda519cf9ad952a6c4d1bf9fc0;
    bytes32 public constant SIGNER_UNCOMPRESSED_DIGEST = 0x384b36902b4a0fa75e030c44271b3911252dd26ee22d43816dc34ec89c880fa1;
    bytes32 public constant NEXT_COMPRESSED_DIGEST = 0x3570b9267b112be699eb181739dee480b3cd5b6551f05ea9a11cbe68e9dee0d3;
    bytes32 public constant NEXT_UNCOMPRESSED_DIGEST = 0xe647866f99fdbbd5eb0a77c4ef095602f2fafec70ceb290e812d57f3489fbae6;
    bytes32 public constant SIGNING_ROOT = 0xf95b04a4d59d691751b2762768784ef12a9ff099bc358ce6856892a14b1f96ea;
    bytes32 public constant ATTESTED_HEADER = 0x1f7d01a90d3e0006941e801b5eb50b742d424b846efc2807a9bb1a93af7a117e;
    uint256 public constant GINDEX = 55;

    bytes public constant BITS = hex"dfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    bytes public constant SIGNER_AGGREGATE = hex"a17fe982d689361d56fc334845a688daa7d0b9f2dba6ead7d2580f8d0090c7ae4d6a86ecb881648bbad3720336a0c241";
    bytes public constant NEXT_AGGREGATE = hex"b2bd58edf3cd7ac2534de9fff8edb6694161f65b96850ddf4ad093bc740132fee9415e731955371f6d675e60ab3b4b1e";
    bytes public constant MESSAGE_POINT = hex"0000000000000000000000000000000002d83a4f56c753d91d5e6ee3fb3f4394767f3c61be14ffa295c2f3e67c5bf3280adbac4ce8715451f0a3057a566474ef00000000000000000000000000000000111ace1ff7cd668ef975d8537e70942017d60cd53593ebc6389a289b02bfe12f7ecfe5517f49a352756ff58a467b8e4a0000000000000000000000000000000013d166e9ae5dd9b4a7a45f597a312cb6c4972bc71419afe92f2407e1e894d78eaf1ea04e4af6e8d017a44a19b6fe74b500000000000000000000000000000000098ef54b26e2a6ff40177ac1735ac5d021ec6d8f62aca973e838329578fcd7507847e6a2eab4f42eb42d10a025ded57c";
    bytes public constant SIGNATURE_POINT = hex"0000000000000000000000000000000010d291aa2b6dc69280e86eccad158ed10034aacbf916a45d4ef5fa00662a58271327d8d01a24be6ef9765a4c7dedeacb000000000000000000000000000000000a14ed6d451426ca5ea775e7109b0c86234c8c3c35b5d50505bd8e79e1383d6df5a140660a28f03ef256b752344d13910000000000000000000000000000000000a9ce0103b702778531ed91335c522cdcdeaace01eb03aeeccab9c709b2067ee4d9dfae6fcaf8d773ff414a085303a2000000000000000000000000000000000f25cdae1082ac6bb753eeb2f6b6c1b3640938fced1c18a31b96fdd16109ef24b95bad7025e06673119992bbe745b93b";
    bytes public constant NEG_GENERATOR = hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    error InvalidProof();

    function verify(bytes calldata signerUncompressed, bytes calldata signerCompressed, bytes calldata nextCompressed)
        external
        view
        returns (
            uint256 fromPeriod,
            uint256 toPeriod,
            uint256 participants,
            bool aggregateVerified,
            bool messageCovered,
            bool headerFinal
        )
    {
        if (
            signerUncompressed.length != COMMITTEE_SIZE * 128
                || signerCompressed.length != COMMITTEE_SIZE * 48
                || nextCompressed.length != COMMITTEE_SIZE * 48
                || keccak256(signerUncompressed) != SIGNER_UNCOMPRESSED_DIGEST
                || keccak256(signerCompressed) != SIGNER_COMPRESSED_DIGEST
                || keccak256(nextCompressed) != NEXT_COMPRESSED_DIGEST
                || PARTICIPANTS * 3 < COMMITTEE_SIZE * 2
        ) revert InvalidProof();
        bytes32 attested = _header(
            2405587,
            17933,
            0x6a4ded82f3e6fd860c355918760d87dba2971b5953c4e24d4743cba62326dd6c,
            0xbf8672093fe5a69e9ebbbe952234d348f51d0ed7c4f1d79fe04e6abb00655d91,
            0xf4b440189d6f0c58b5762677c38d4b7cb350427be0646dcb3cf3f3e632b57815
        );
        if (attested != ATTESTED_HEADER) revert InvalidProof();
        if (_walk(_committee(nextCompressed, NEXT_AGGREGATE), _branch(
            0x058ceea347de4282fc2ef90aa365076471be177a3b01e6e391418ed4a08e4d44,
            0x1aeff71d8752f4b04a5bad8e46cb5a8c7922c67a6b8e8679e4c40d25523ab275,
            0x3abe3794df3f129109388604dab2d552967e6f0c629086fc73be74405472ec0c,
            0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c,
            0x650ffbbe80a2afe85193e83021cd22027beff69365887f9461dc347dacf3c781
        )) != 0xbf8672093fe5a69e9ebbbe952234d348f51d0ed7c4f1d79fe04e6abb00655d91) revert InvalidProof();
        if (SIGNER_COMPRESSED_DIGEST == NEXT_COMPRESSED_DIGEST) revert InvalidProof();
        _signature(signerUncompressed);
        fromPeriod = FROM_PERIOD;
        toPeriod = TO_PERIOD;
        participants = PARTICIPANTS;
        aggregateVerified = true;
        messageCovered = false;
        headerFinal = false;
    }

    function _signature(bytes calldata keys) private view {
        bytes memory msmInput = new bytes(PARTICIPANTS * 160);
        uint256 written;
        for (uint256 i; i < COMMITTEE_SIZE; i++) {
            if (!_bit(i)) continue;
            uint256 inputAt = written * 160;
            uint256 keyAt = i * 128;
            for (uint256 w; w < 128; w++) msmInput[inputAt + w] = keys[keyAt + w];
            msmInput[inputAt + 159] = 0x01;
            written++;
        }
        if (written != PARTICIPANTS) revert InvalidProof();
        (bool msmOk, bytes memory aggregate) = address(0x0c).staticcall(msmInput);
        if (!msmOk || aggregate.length != 128) revert InvalidProof();
        bytes memory pairingInput = new bytes(768);
        _copy(pairingInput, 0, aggregate, 0, 128);
        _copy(pairingInput, 128, MESSAGE_POINT, 0, 256);
        _copy(pairingInput, 384, NEG_GENERATOR, 0, 128);
        _copy(pairingInput, 512, SIGNATURE_POINT, 0, 256);
        (bool pairOk, bytes memory paired) = address(0x0f).staticcall(pairingInput);
        if (!pairOk || paired.length != 32) revert InvalidProof();
        bytes32 pairedWord;
        assembly {
            pairedWord := mload(add(paired, 32))
        }
        if (pairedWord != bytes32(uint256(1))) revert InvalidProof();
    }

    function _committee(bytes calldata keys, bytes memory aggregate) private pure returns (bytes32) {
        bytes32[] memory level = new bytes32[](COMMITTEE_SIZE);
        for (uint256 i; i < COMMITTEE_SIZE; i++) level[i] = _hashKey(keys, i);
        uint256 count = COMMITTEE_SIZE;
        while (count > 1) {
            for (uint256 i; i < count; i += 2) level[i / 2] = sha256(abi.encodePacked(level[i], level[i + 1]));
            count /= 2;
        }
        return sha256(abi.encodePacked(level[0], _hashBytes(aggregate)));
    }

    function _hashKey(bytes calldata keys, uint256 index) private pure returns (bytes32) {
        uint256 at = index * 48;
        bytes32 left;
        assembly {
            left := calldataload(add(keys.offset, at))
        }
        bytes32 right;
        for (uint256 i; i < 16; i++) right |= bytes32(uint256(uint8(keys[at + 32 + i]))) << (8 * (31 - i));
        return sha256(abi.encodePacked(left, right));
    }

    function _hashBytes(bytes memory data) private pure returns (bytes32) {
        if (data.length != 48) revert InvalidProof();
        bytes32 left;
        bytes32 right;
        assembly {
            left := mload(add(data, 32))
        }
        for (uint256 i; i < 16; i++) right |= bytes32(uint256(uint8(data[32 + i]))) << (8 * (31 - i));
        return sha256(abi.encodePacked(left, right));
    }

    function _walk(bytes32 node, bytes32[5] memory branch) private pure returns (bytes32) {
        uint256 index = GINDEX;
        for (uint256 i; i < 5; i++) {
            bytes32 sibling = branch[i];
            node = (index & 1) == 1 ? sha256(abi.encodePacked(sibling, node)) : sha256(abi.encodePacked(node, sibling));
            index >>= 1;
        }
        if (index != 1) revert InvalidProof();
        return node;
    }

    function _header(uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot)
        private
        pure
        returns (bytes32)
    {
        bytes32 zero = bytes32(0);
        bytes32 h01 = sha256(abi.encodePacked(_u64(slot), _u64(proposer)));
        bytes32 h23 = sha256(abi.encodePacked(parentRoot, stateRoot));
        bytes32 h45 = sha256(abi.encodePacked(bodyRoot, zero));
        bytes32 h67 = sha256(abi.encodePacked(zero, zero));
        return sha256(abi.encodePacked(sha256(abi.encodePacked(h01, h23)), sha256(abi.encodePacked(h45, h67))));
    }

    function _u64(uint256 value) private pure returns (bytes32 chunk) {
        uint256 word;
        for (uint256 i; i < 8; i++) word |= ((value >> (8 * i)) & 0xff) << (8 * (31 - i));
        chunk = bytes32(word);
    }

    function _branch(bytes32 s0, bytes32 s1, bytes32 s2, bytes32 s3, bytes32 s4) private pure returns (bytes32[5] memory out) {
        out[0] = s0;
        out[1] = s1;
        out[2] = s2;
        out[3] = s3;
        out[4] = s4;
    }

    function _bit(uint256 index) private pure returns (bool) {
        return (uint8(BITS[index / 8]) & uint8(1 << (index % 8))) != 0;
    }

    function _copy(bytes memory dest, uint256 destAt, bytes memory src, uint256 srcAt, uint256 length) private pure {
        for (uint256 i; i < length; i++) dest[destAt + i] = src[srcAt + i];
    }
}
