// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Proves the Altair sync committee, not the committee inside a later
/// finalized block, signed the first distinct next committee.
/// @dev Period 290 was initialized with equal current and next committees.
/// This update is attested in period 291. headerFinal stays false. The store
/// has not reached slot 15406750.
contract AacEthereumAltairCommitteeHandoff {
    bytes32 public constant GENESIS_VALIDATORS_ROOT =
        0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95;
    uint256 public constant FROM_PERIOD = 290;
    uint256 public constant TO_PERIOD = 291;
    uint256 public constant COMMITTEE_SIZE = 512;
    uint256 public constant PARTICIPANTS = 504;
    bytes32 public constant CURRENT_UNCOMPRESSED_DIGEST = 0xbdd672f664731dd808f7397d7a12c054a972c28f4eaea222e925479185237379;
    bytes32 public constant NEXT_COMPRESSED_DIGEST = 0x5c4c1bb8bd840f6ade4d62c2302717f2cbfdd80f355ea6e0f9198c4cacb1a356;
    bytes32 public constant SIGNING_ROOT = 0x47aae58f263b04db0e0378893f6c8d183fefd593462c6ad1d01ebfcc5240b86e;
    bytes32 public constant ALTAIR_HEADER = 0x4df61a042151aa94fe5412063bdc7357e7a0266348745fc741ea669487ce6553;
    bytes32 public constant ATTESTED_HEADER = 0xe367fd4fce2eaa248d8d970ff2836a032b7c1dcea02b6f1bce831e13443e6f1e;
    uint256 public constant GINDEX = 55;

    bytes public constant BITS = hex"ffdfffffffffffffffffffffffff7efffffffffffffffffffffffffbffffdfff7ffffffffffffffefffffffffffffffffffdffffffffffffffffffffffffffff";
    bytes public constant ALTAIR_AGGREGATE = hex"a0cd28de64facf4f8e775ff767068dcef657670bfeae88845dd0b8f644e5d0dd1c8ab3f18d6bf3f38e615493e04ec993";
    bytes public constant NEXT_AGGREGATE = hex"abd2c3c5b531364cda28374d1ce2555b532f3ec3d5d06cfe68975fb22c3f3bb81471edbe19b3c7c002dab4589f09981c";
    bytes public constant MESSAGE_POINT = hex"0000000000000000000000000000000016ac352a21e069d52ba13f4c50adaa610558fe6d48bacf19f61194544899cb9b55a41dfa9560bf8f935b7989965d015e000000000000000000000000000000000f31b84e1f99a20ba61903b716a9869b99f9305c82d37074145ffa618f6d23cd9e865a2494fbb7f3bb1e56f7ee86515e0000000000000000000000000000000003d24f2fe60cb2c8a33a9ced545d6dda40d8c5f14aa2db145ded450333507aee97bf33936bc4d49e73a22727dc01506300000000000000000000000000000000170cdb8af0ffe22b5270e2e2598f86caa34fb31b26d2a327379482525759d06afeb3f38fbcd91cd9d9b0aa8c8e30d097";
    bytes public constant SIGNATURE_POINT = hex"0000000000000000000000000000000008bb765e39379a82074ff3f9711349252c879a225035de6a685db4a3390cc7af33c484954e25d59b8ab2d94860206f100000000000000000000000000000000005e339b5b22329fe4289f89f900f1f96f97fb696ddc76bf9033d34daeec92dedca8e00267568479de57572adec341e9d0000000000000000000000000000000007961232389fcbe4001ea78850c26f1dc96f967b594d7a58f6d8c54beb269f9241301f3557347ce7c94e520ceeda1bc4000000000000000000000000000000000744c7764e350e3551d716f09ee81bb65ed3dd6a80f414da3e7caadaf909d310c7d30cd3969b70a3fd314bfb7ef5710d";
    bytes public constant NEG_GENERATOR = hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    error InvalidProof();

    function verify(bytes calldata currentUncompressed, bytes calldata currentCompressed, bytes calldata nextCompressed)
        external
        view
        returns (uint256 fromPeriod, uint256 toPeriod, uint256 participants, bool aggregateVerified, bool headerFinal)
    {
        if (
            currentUncompressed.length != COMMITTEE_SIZE * 128
                || currentCompressed.length != COMMITTEE_SIZE * 48
                || nextCompressed.length != COMMITTEE_SIZE * 48
                || keccak256(currentUncompressed) != CURRENT_UNCOMPRESSED_DIGEST
                || keccak256(nextCompressed) != NEXT_COMPRESSED_DIGEST
                || PARTICIPANTS * 3 < COMMITTEE_SIZE * 2
        ) revert InvalidProof();
        bytes32 altairState = _header(
            2375680,
            173926,
            0x004150c1ae733d22a64309872f8ba0f9739fde692367f626f1e204ef19850b95,
            0xf15d1009515c94ceafffd2c9b81ec06503f714269d1fd5abfe5605e72c050ab9,
            0xce245eead756b25e860257478e2fe36eddfefd8dff65e7f516bce4b9450d396c
        );
        if (altairState != ALTAIR_HEADER) revert InvalidProof();
        if (_walk(_committee(currentCompressed, ALTAIR_AGGREGATE), _branch(0x52bbd8287d0e455ce6cd732fa8a5f003e2ad82fd0ed3a59516f9ae1642f1b182,
            0x5dbd9979a8248bc58ca1eb9fb8a2cae4ab92c6daccc0e7fb99d4798e187b88e8,
            0x9a051db7b01f1d04bebf114a7e6299494058936c1a1229973fda040c859c557c,
            0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c,
            0xb94b8d7942fd3357e2e4df09002fcca7d8bddf5af3325550403f603400323d7d)) != 0xf15d1009515c94ceafffd2c9b81ec06503f714269d1fd5abfe5605e72c050ab9) {
            revert InvalidProof();
        }
        bytes32 attested = _header(
            2389361,
            78356,
            0x40c5dd9b7cce276cd61cfd04108431214ff494ef1c6a6a18c8acb9d0bed44f78,
            0x53f2ac952150f70044a3f24f5e8e10f5058c6b8af3111b54f0d3fb0bd1628189,
            0x653ca8a6361646b97593df41fab35a269f850e28262a2cb30a592a17cff96254
        );
        if (attested != ATTESTED_HEADER) revert InvalidProof();
        if (_walk(_committee(nextCompressed, NEXT_AGGREGATE), _branch(0x52bbd8287d0e455ce6cd732fa8a5f003e2ad82fd0ed3a59516f9ae1642f1b182,
            0x76049c7252c525bacf15934b2ccea9b89aba9328c7032ce4a554a151ccfddec3,
            0x35897f20352d40b7032ea4d1ac9318e6a725387b792bb8a15eb409758b423f1b,
            0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c,
            0x63296929f46d5d007651f0bdc7908f6718830623e1e409eb16078703e315cc90)) != 0x53f2ac952150f70044a3f24f5e8e10f5058c6b8af3111b54f0d3fb0bd1628189) {
            revert InvalidProof();
        }
        if (keccak256(currentCompressed) == NEXT_COMPRESSED_DIGEST) revert InvalidProof();
        _signature(currentUncompressed);
        fromPeriod = FROM_PERIOD;
        toPeriod = TO_PERIOD;
        participants = PARTICIPANTS;
        aggregateVerified = true;
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
            for (uint256 i; i < count; i += 2) {
                level[i / 2] = sha256(abi.encodePacked(level[i], level[i + 1]));
            }
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
        for (uint256 i; i < 16; i++) {
            right |= bytes32(uint256(uint8(keys[at + 32 + i]))) << (8 * (31 - i));
        }
        return sha256(abi.encodePacked(left, right));
    }

    function _hashBytes(bytes memory data) private pure returns (bytes32) {
        if (data.length != 48) revert InvalidProof();
        bytes32 left;
        bytes32 right;
        assembly {
            left := mload(add(data, 32))
        }
        for (uint256 i; i < 16; i++) {
            right |= bytes32(uint256(uint8(data[32 + i]))) << (8 * (31 - i));
        }
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
