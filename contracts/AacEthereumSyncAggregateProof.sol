// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Checks that the sync committee from finalized beacon slot 15413120
/// signed that block. The committee is pinned from that block's own bootstrap.
/// @dev A matching aggregate is not an independent trust anchor, so
/// headerFinal stays false and custody stays closed.
contract AacEthereumSyncAggregateProof {
    bytes32 public constant FINALIZED_ROOT = 0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e;
    bytes32 public constant SIGNING_ROOT = 0xcef166bab13cbbbe9ec443badd41cfecf6d94d01db7064b95ce1d4beb115ba49;
    bytes32 public constant COMMITTEE_DIGEST = 0x5f44fac1b2d1d157fb15d7a82cb63d3c6ef88df82be64c64e95c32baf4480ba9;
    uint256 public constant PARTICIPANTS = 505;
    uint256 public constant COMMITTEE_SIZE = 512;
    bytes public constant BITS = hex"ff7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffefeffeffffffffffffffffffffffffffffffffdfffffffffffcfffffffffff";
    bytes public constant MESSAGE_POINT = hex"0000000000000000000000000000000010c54114b69b4503ef8d136dee5d3726939a4c0466ba56865267d9d7e878a80f701e15aa27323ac608ed2967f60f6908000000000000000000000000000000000ca50567e16106a89f03633557e36671420ac3c4d800bf172078bdd912734b2a3e8209d3c89dd620ad59e588af63e382000000000000000000000000000000000aa006393a11bf445ed2d2a21db2db80f56c2caee154324cbc88e7a1038359775fd45d694746144f67c462e9eca7354b000000000000000000000000000000000126288e044ed6bb33b06c671480b277eeecf06767bec180a1df761887c613ef6498b2fc2b4b3de6a832a62844bec32b";
    bytes public constant SIGNATURE_POINT = hex"0000000000000000000000000000000009eb531bbc58ed6a98cbb3bbea166df55932d33e9b511ca0f8ee4248090b67ee2d96a55d3aadbf4fdc3f1d848d425ea50000000000000000000000000000000008629282199f67a53727b5428273f804ae934d07eed4c25145943d724a0ab802cb0da6ed20bacc2eae4b37acc4c1c920000000000000000000000000000000000cd322674956d907a43a2b7bcb48e28b57a9ddd60ae7701aaf0e7afa1066ecf7b89220b8ba08b96f4999c25e3abbbd260000000000000000000000000000000017e947c06a60ac09fb397f5161b39bf4f3671705fb53b4999ef97e3ae33e1d0798c58303c7be62f2cfa0ee462876138b";
    bytes public constant NEG_GENERATOR = hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    error InvalidProof();

    function verify(bytes calldata keys)
        external
        view
        returns (
            bytes32 finalizedRoot,
            bytes32 signingRoot,
            uint256 participants,
            bool aggregateVerified,
            bool headerFinal
        )
    {
        if (keys.length != COMMITTEE_SIZE * 128 || keccak256(keys) != COMMITTEE_DIGEST) revert InvalidProof();
        bytes memory msmInput = new bytes(PARTICIPANTS * 160);
        uint256 written;
        for (uint256 i; i < COMMITTEE_SIZE; i++) {
            if (!_bit(i)) continue;
            uint256 inputAt = written * 160;
            uint256 keyAt = i * 128;
            for (uint256 w; w < 128; w++) {
                msmInput[inputAt + w] = keys[keyAt + w];
            }
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
        finalizedRoot = FINALIZED_ROOT;
        signingRoot = SIGNING_ROOT;
        participants = PARTICIPANTS;
        aggregateVerified = true;
        headerFinal = false;
    }

    function _bit(uint256 index) private pure returns (bool) {
        uint256 byteIndex = index / 8;
        uint256 mask = 1 << (index % 8);
        return (uint8(BITS[byteIndex]) & mask) != 0;
    }

    function _copy(bytes memory dest, uint256 destAt, bytes memory src, uint256 srcAt, uint256 length) private pure {
        for (uint256 i; i < length; i++) {
            dest[destAt + i] = src[srcAt + i];
        }
    }
}
