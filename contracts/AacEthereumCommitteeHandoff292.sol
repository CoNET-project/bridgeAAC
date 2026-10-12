// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacEthereumAltairCommitteeHandoff {
    function verify(bytes calldata currentUncompressed, bytes calldata currentCompressed, bytes calldata nextCompressed)
        external
        view
        returns (uint256 fromPeriod, uint256 toPeriod, uint256 participants, bool aggregateVerified, bool headerFinal);
}

/// @notice Extends the Altair handoff by one period. The bridge beacon slot
/// is still in a later period, so the message is not covered and headerFinal
/// stays false.
contract AacEthereumCommitteeHandoff292 {
    address public constant PREVIOUS = 0x80F29F94c75eE07DFA8Eca33DFbEA2A3edA34DC2;
    uint256 public constant FROM_PERIOD = 292;
    uint256 public constant TO_PERIOD = 293;
    uint256 public constant COMMITTEE_SIZE = 512;
    uint256 public constant PARTICIPANTS = 509;
    uint256 public constant BRIDGE_BEACON_SLOT = 15413404;
    uint256 public constant BRIDGE_PERIOD = 1881;
    bytes32 public constant SIGNER_COMPRESSED_DIGEST = 0x5c4c1bb8bd840f6ade4d62c2302717f2cbfdd80f355ea6e0f9198c4cacb1a356;
    bytes32 public constant SIGNER_UNCOMPRESSED_DIGEST = 0x36d1b17db2a0cb43668f2b255089bf3fe260480e3511a48632028115cb48fd49;
    bytes32 public constant NEXT_COMPRESSED_DIGEST = 0xaa8b7457d2db05a2c6eaa43862958556d19fe5fda519cf9ad952a6c4d1bf9fc0;
    bytes32 public constant SIGNING_ROOT = 0x3318ba81e9811adf9db1889360e1597ca357e4f9405d89ef13036085b443d488;
    bytes32 public constant ATTESTED_HEADER = 0x99a65de7fa2f8c933b5177478b16c0d97a82975f1d4309ceee2b7ae16d162b55;
    uint256 public constant GINDEX = 55;

    bytes public constant BITS = hex"fffffffffffffffffffffffffffffff7fffffffffffffffffffffffffffffffffbfffffffffffffffffffffffffffffffffffdffffffffffffffffffffffffff";
    bytes public constant SIGNER_AGGREGATE = hex"abd2c3c5b531364cda28374d1ce2555b532f3ec3d5d06cfe68975fb22c3f3bb81471edbe19b3c7c002dab4589f09981c";
    bytes public constant NEXT_AGGREGATE = hex"a17fe982d689361d56fc334845a688daa7d0b9f2dba6ead7d2580f8d0090c7ae4d6a86ecb881648bbad3720336a0c241";
    bytes public constant MESSAGE_POINT = hex"0000000000000000000000000000000018e3bf9e8cf07ede645e15f0cf777b6eb243c92437bb2df15b03729de8f6a223d61c62ad8c62d9fe81099f0c765a3c50000000000000000000000000000000000c75e3017c6c4f14a1e8206e2d2432d96b2d1a4637ad57057200b5fcc3ae5fd11abc4b4e5e2fb4b3c5a7fb324e42840a000000000000000000000000000000001703b46ff001be28c3d72d03aa34d3479901d09c38731167deb07cffc6029de9addfbe610772ce5856fdfd3e89df27d5000000000000000000000000000000000bb4c8b1ed7f196d474cd01945cf4855acc7cfe707fb96a37a6d9e33671578a2fe582e9d0e4eec7d78d1620e46bcbdff";
    bytes public constant SIGNATURE_POINT = hex"000000000000000000000000000000000cb12c437bd7244b615e48b357a3305689e012e3377dbf11c73350ac82fc6250f64adacc443bb91ad2a037d200832ff30000000000000000000000000000000016b2f03083fcf138c544290f353080aaef8efe556c9b3504134717836d8430a7e0bb6600ed169174918a983749fdc513000000000000000000000000000000000611c55e7d539e2b939dbc4f7cf57281c1135a4237b43b112b79fea85fd76deba2edf229d69c7ae4b12bf87b8e53f982000000000000000000000000000000000798e2c74d48a72587d36cc046777ba486ad1d793ed4ad96482d18b30820b2f6efa08aec0fdc67f9c2607ee3cfe14359";
    bytes public constant NEG_GENERATOR = hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    error InvalidProof();
    error InvalidLink();

    function verify(
        bytes calldata altairUncompressed,
        bytes calldata altairCompressed,
        bytes calldata signerCompressed,
        bytes calldata signerUncompressed,
        bytes calldata nextCompressed
    )
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
        (uint256 previousFrom, uint256 previousTo, uint256 previousParticipants, bool previousVerified, bool previousFinal) =
            IAacEthereumAltairCommitteeHandoff(PREVIOUS).verify(altairUncompressed, altairCompressed, signerCompressed);
        if (
            previousFrom != 290 || previousTo != 291 || previousParticipants != 504 || !previousVerified || previousFinal
                || keccak256(signerCompressed) != SIGNER_COMPRESSED_DIGEST
                || keccak256(signerUncompressed) != SIGNER_UNCOMPRESSED_DIGEST
                || keccak256(nextCompressed) != NEXT_COMPRESSED_DIGEST
                || signerUncompressed.length != COMMITTEE_SIZE * 128
                || nextCompressed.length != COMMITTEE_SIZE * 48
                || PARTICIPANTS * 3 < COMMITTEE_SIZE * 2
        ) revert InvalidLink();
        bytes32 attested = _header(
            2399850,
            9513,
            0xd9a165db3ddf92bb00adbcaee323eec96218274dcbf27a69517a78cc594b14ce,
            0x1450ae08c7db382ab780316bd48b5ae98082ff00c96f12dc1bb8b11eeff2b284,
            0x99ba22942db5111d7a25ad8c623d8ade0718224317050db67a4192279aaedff7
        );
        if (attested != ATTESTED_HEADER) revert InvalidProof();
        if (_walk(_committee(nextCompressed, NEXT_AGGREGATE), _branch(
            0x5b40b6aefbdbcffec9c5b7f977c4b4d009a2fdfd1d239f36731d604cfa732970,
            0xde7ce58afbebb046303f41e92563b1e0922cc511a70921e0470782045ad74a5f,
            0x6c4ad5c9cef5dc3331ec0e507f9d9c902a6e54017128cdb951f46a2dc5c6f868,
            0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c,
            0x53c2fd447fdf927c373e86f1cddb50cfff16a825f0d8694cdcd019c22a456bf3
        )) != 0x1450ae08c7db382ab780316bd48b5ae98082ff00c96f12dc1bb8b11eeff2b284) revert InvalidProof();
        if (SIGNER_COMPRESSED_DIGEST == NEXT_COMPRESSED_DIGEST) revert InvalidProof();
        _signature(signerUncompressed);
        fromPeriod = FROM_PERIOD;
        toPeriod = TO_PERIOD;
        participants = PARTICIPANTS;
        aggregateVerified = true;
        messageCovered = TO_PERIOD > BRIDGE_PERIOD;
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
