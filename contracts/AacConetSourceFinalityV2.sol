// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Base destination adapter for one CoNET sync-committee aggregate (V2).
/// @dev V2 differs from AacConetSourceFinality in one place: the sync-committee signing
///      domain uses the CoNET fork version for the signature epoch. V1 used the constant
///      0x20000093, so every aggregate after the Electra epoch would fail.
/// @dev Pairing uses the Base EIP-2537 precompiles. An empty precompile
/// result cannot pass: the call must return a 128-byte aggregate and a
/// pairing word equal to 1. `trustedCommittee()` stays false. A proof whose
/// attested header is the same slot or state as the installed committee
/// snapshot reverts. `headerFinal()` stays false; only a successful proof
/// returns true.
contract AacConetSourceFinalityV2 {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public constant COMMITTEE_SIZE = 512;
    bytes32 public constant GENESIS_VALIDATORS_ROOT =
        0xacac7566fdf384a1ada45c01dcf9030d7eb0e1e5f5302659101d0b2a5bb59092;
    bytes4 public constant FORK_VERSION = 0x20000093;
    uint256 public constant ELECTRA_EPOCH = 56902;
    uint256 public constant FULU_EPOCH = 57050;
    bytes public constant FIELD_MODULUS =
        hex"1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab";
    bytes public constant FIELD_HALF =
        hex"0d0088f51cbff34d258dd3db21a5d66bb23ba5c279c2895fb39869507b587b120f55ffff58a9ffffdcff7fffffffd555";
    bytes public constant DST = hex"424c535f5349475f424c53313233383147325f584d443a5348412d3235365f535357555f524f5f504f505f";
    bytes public constant NEG_GENERATOR =
        hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    address private immutable self = address(this);
    uint256 private initialized;
    address public owner;
    uint256 public period;
    bytes32 public compressedDigest;
    uint256 public snapshotSlot;
    bytes32 public snapshotStateRoot;
    bool public rootReady;
    uint256[43] private __gap;

    error InvalidProof();
    error AlreadyInitialized();
    error NotOwner();
    error NotProxy();
    error BadAddress();

    struct Header {
        uint256 slot;
        uint256 proposer;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    struct Aggregate {
        bytes signerUncompressed;
        bytes bits;
        Header attested;
        uint256 signatureSlot;
        bytes signaturePoint;
    }

    event CommitteeInstalled(uint256 indexed period, uint256 snapshotSlot, bytes32 compressedDigest, bytes32 snapshotStateRoot);
    event AggregateProven(uint256 indexed period, uint256 participants, uint256 attestedSlot, uint256 signatureSlot);

    constructor() {
        initialized = 1;
    }

    function initialize(address owner_) external {
        if (initialized != 0) revert AlreadyInitialized();
        if (owner_ == address(0)) revert BadAddress();
        initialized = 1;
        owner = owner_;
    }

    function trustedCommittee() external pure returns (bool) {
        return false;
    }

    function headerFinal() external pure returns (bool) {
        return false;
    }

    function messageCovered() external pure returns (bool) {
        return false;
    }

    function install(bytes calldata compressed, uint256 snapshotSlot_, bytes32 snapshotStateRoot_) external {
        if (msg.sender != owner) revert NotOwner();
        if (initialized == 0 || period != 0 || rootReady) revert InvalidProof();
        if (compressed.length != COMMITTEE_SIZE * 48 || snapshotSlot_ == 0 || snapshotStateRoot_ == bytes32(0)) {
            revert InvalidProof();
        }
        period = snapshotSlot_ / 8192;
        snapshotSlot = snapshotSlot_;
        snapshotStateRoot = snapshotStateRoot_;
        compressedDigest = keccak256(compressed);
        emit CommitteeInstalled(period, snapshotSlot_, compressedDigest, snapshotStateRoot_);
    }

    /// @notice Re-verify one Aggregate against the installed committee without latching.
    /// @dev Usable after `rootReady` so each CoNET message can carry an independent BLS proof.
    function verifyAggregate(Aggregate calldata input)
        external
        view
        returns (uint256 participants, bool ok)
    {
        participants = _checkAggregate(input);
        ok = true;
    }

    function proveAggregate(Aggregate calldata input)
        external
        returns (uint256 participants, bool headerFinal_)
    {
        if (rootReady) revert InvalidProof();
        participants = _checkAggregate(input);
        rootReady = true;
        headerFinal_ = true;
        emit AggregateProven(period, participants, input.attested.slot, input.signatureSlot);
    }

    function _checkAggregate(Aggregate calldata input) private view returns (uint256 participants) {
        if (period == 0 || compressedDigest == bytes32(0)) revert InvalidProof();
        if (
            input.signerUncompressed.length != COMMITTEE_SIZE * 128 || input.bits.length != 64
                || input.signaturePoint.length != 256 || input.signatureSlot / 8192 != period
                || input.attested.slot / 8192 != period || input.signatureSlot <= input.attested.slot
        ) revert InvalidProof();
        if (input.attested.slot == snapshotSlot || input.attested.stateRoot == snapshotStateRoot) revert InvalidProof();
        if (_compressedDigest(input.signerUncompressed) != compressedDigest) revert InvalidProof();
        participants = _count(input.bits);
        if (participants * 3 < COMMITTEE_SIZE * 2) revert InvalidProof();
        _pair(
            input.signerUncompressed,
            input.bits,
            participants,
            _hashToCurve(_signingRoot(input.attested, input.signatureSlot)),
            input.signaturePoint
        );
    }

    function upgradeTo(address newImplementation) external virtual {
        if (msg.sender != owner) revert NotOwner();
        if (address(this) == self || _implementation() != self) revert NotProxy();
        if (newImplementation == address(0) || newImplementation.code.length == 0) revert BadAddress();
        assembly ("memory-safe") {
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, newImplementation)
        }
    }

    function _pair(
        bytes calldata keys,
        bytes calldata bits,
        uint256 participants,
        bytes memory message,
        bytes calldata signaturePoint
    ) internal view {
        bytes memory msmInput = new bytes(participants * 160);
        uint256 written;
        for (uint256 i; i < COMMITTEE_SIZE; i++) {
            if (!_bit(bits, i)) continue;
            uint256 inputAt = written * 160;
            uint256 keyAt = i * 128;
            assembly ("memory-safe") {
                calldatacopy(add(add(msmInput, 32), inputAt), add(keys.offset, keyAt), 128)
                mstore8(add(add(msmInput, 32), add(inputAt, 159)), 1)
            }
            written++;
        }
        if (written != participants) revert InvalidProof();
        (bool msmOk, bytes memory aggregate) = address(0x0c).staticcall(msmInput);
        if (!msmOk || aggregate.length != 128) revert InvalidProof();
        bytes memory pairingInput = new bytes(768);
        _copy(aggregate, 0, pairingInput, 0, 128);
        _copy(message, 0, pairingInput, 128, 256);
        _copy(NEG_GENERATOR, 0, pairingInput, 384, 128);
        for (uint256 i; i < 256; i++) pairingInput[512 + i] = signaturePoint[i];
        (bool pairOk, bytes memory paired) = address(0x0f).staticcall(pairingInput);
        if (!pairOk || paired.length != 32) revert InvalidProof();
        bytes32 pairedWord;
        assembly ("memory-safe") {
            pairedWord := mload(add(paired, 32))
        }
        if (pairedWord != bytes32(uint256(1))) revert InvalidProof();
    }

    function _hashToCurve(bytes32 signingRoot) internal view returns (bytes memory point) {
        bytes memory uniform = _expand(signingRoot);
        bytes memory shifted = new bytes(392);
        _loadShifted(shifted);
        bytes memory first = new bytes(128);
        bytes memory second = new bytes(128);
        _copy(_reduce64(uniform, 0, shifted), 0, first, 0, 64);
        _copy(_reduce64(uniform, 64, shifted), 0, first, 64, 64);
        _copy(_reduce64(uniform, 128, shifted), 0, second, 0, 64);
        _copy(_reduce64(uniform, 192, shifted), 0, second, 64, 64);
        (bool ok0, bytes memory p0) = address(0x11).staticcall(first);
        (bool ok1, bytes memory p1) = address(0x11).staticcall(second);
        if (!ok0 || !ok1 || p0.length != 256 || p1.length != 256) revert InvalidProof();
        bytes memory sumInput = new bytes(512);
        _copy(p0, 0, sumInput, 0, 256);
        _copy(p1, 0, sumInput, 256, 256);
        (bool added, bytes memory summed) = address(0x0d).staticcall(sumInput);
        if (!added || summed.length != 256) revert InvalidProof();
        point = summed;
    }

    function _expand(bytes32 signingRoot) private view returns (bytes memory uniform) {
        bytes memory dstPrime = new bytes(44);
        for (uint256 i; i < 43; i++) dstPrime[i] = DST[i];
        dstPrime[43] = 0x2b;
        bytes memory b0In = new bytes(143);
        for (uint256 i; i < 32; i++) b0In[64 + i] = signingRoot[i];
        b0In[96] = 0x01;
        for (uint256 i; i < 44; i++) b0In[99 + i] = dstPrime[i];
        bytes32 b0 = sha256(b0In);
        uniform = new bytes(256);
        bytes32 previous;
        for (uint256 blockIndex; blockIndex < 8; blockIndex++) {
            bytes memory input = new bytes(77);
            bytes32 mixed = blockIndex == 0 ? b0 : _xor(b0, previous);
            for (uint256 i; i < 32; i++) input[i] = mixed[i];
            input[32] = bytes1(uint8(blockIndex + 1));
            for (uint256 i; i < 44; i++) input[33 + i] = dstPrime[i];
            previous = sha256(input);
            for (uint256 i; i < 32; i++) uniform[blockIndex * 32 + i] = previous[i];
        }
    }

    function _reduce64(bytes memory input, uint256 offset, bytes memory shifted) private pure returns (bytes memory encoded) {
        encoded = new bytes(64);
        assembly ("memory-safe") {
            let acc := mload(0x40)
            mstore(0x40, add(acc, 64))
            mstore(acc, 0)
            mstore(add(acc, 17), 0)
            let inPtr := add(add(input, 32), offset)
            for { let i := 0 } lt(i, 64) { i := add(i, 1) } {
                if gt(byte(0, mload(acc)), 0) { revert(0, 0) }
                for { let j := 0 } lt(j, 48) { j := add(j, 1) } {
                    mstore8(add(acc, j), byte(0, mload(add(acc, add(j, 1)))))
                }
                mstore8(add(acc, 48), byte(0, mload(add(inPtr, i))))
                for { let s := 8 } gt(s, 0) { s := sub(s, 1) } {
                    let base := add(add(shifted, 32), mul(sub(s, 1), 49))
                    let take := 1
                    for { let k := 0 } lt(k, 49) { k := add(k, 1) } {
                        let a := byte(0, mload(add(acc, k)))
                        let b := byte(0, mload(add(base, k)))
                        if lt(a, b) {
                            take := 0
                            k := 49
                        }
                        if gt(a, b) { k := 49 }
                    }
                    if eq(take, 1) {
                        let borrow := 0
                        for { let k := 49 } gt(k, 0) { k := sub(k, 1) } {
                            let idx := sub(k, 1)
                            let a := byte(0, mload(add(acc, idx)))
                            let b := add(byte(0, mload(add(base, idx))), borrow)
                            if lt(a, b) {
                                mstore8(add(acc, idx), sub(add(a, 256), b))
                                borrow := 1
                            }
                            if iszero(lt(a, b)) {
                                mstore8(add(acc, idx), sub(a, b))
                                borrow := 0
                            }
                        }
                    }
                }
            }
            if gt(byte(0, mload(acc)), 0) { revert(0, 0) }
            let out := add(encoded, 32)
            for { let i := 0 } lt(i, 48) { i := add(i, 1) } {
                mstore8(add(out, add(16, i)), byte(0, mload(add(acc, add(i, 1)))))
            }
        }
    }

    function _loadShifted(bytes memory out) private pure {
        for (uint256 s; s < 8; s++) {
            uint256 carry;
            for (uint256 i = 48; i > 0; i--) {
                uint256 src = i - 1;
                uint256 value = (uint256(uint8(FIELD_MODULUS[src])) << s) + carry;
                out[s * 49 + src + 1] = bytes1(uint8(value));
                carry = value >> 8;
            }
            out[s * 49] = bytes1(uint8(carry));
        }
    }

    function _signingRoot(Header calldata attested, uint256 signatureSlot) internal view returns (bytes32) {
        bytes32 header = _header(attested.slot, attested.proposer, attested.parentRoot, attested.stateRoot, attested.bodyRoot);
        bytes4 version = forkVersionAt((signatureSlot - 1) / 32);
        bytes32 forkData = sha256(abi.encodePacked(bytes32(version), GENESIS_VALIDATORS_ROOT));
        bytes32 domain = bytes32((uint256(0x07000000) << 224) | (uint256(forkData) >> 32));
        return sha256(abi.encodePacked(header, domain));
    }

    /// @notice Fork version that signs sync-committee messages in `epoch` (CoNET schedule).
    /// @dev Matches the CL fork schedule: Deneb 0x20000093 from epoch 0, Electra 0x20000094 from
    ///      epoch 56902, Fulu 0x20000095 from epoch 57050. Later epochs use the last known version.
    function forkVersionAt(uint256 epoch) public pure returns (bytes4) {
        if (epoch >= FULU_EPOCH) return 0x20000095;
        if (epoch >= ELECTRA_EPOCH) return 0x20000094;
        return 0x20000093;
    }

    function _compressedDigest(bytes calldata uncompressed) internal pure returns (bytes32) {
        bytes memory packed = new bytes(COMMITTEE_SIZE * 48);
        for (uint256 i; i < COMMITTEE_SIZE; i++) {
            uint256 uAt = i * 128;
            uint256 cAt = i * 48;
            uint8 sign = _aboveHalf(uncompressed, uAt + 64) ? 0x20 : 0;
            assembly ("memory-safe") {
                if gt(shr(128, calldataload(add(uncompressed.offset, uAt))), 0) { revert(0, 0) }
                if gt(shr(128, calldataload(add(uncompressed.offset, add(uAt, 64)))), 0) { revert(0, 0) }
                let dest := add(add(packed, 32), cAt)
                let src := add(uncompressed.offset, add(uAt, 16))
                calldatacopy(dest, src, 48)
                mstore8(dest, or(and(byte(0, calldataload(src)), 0x1f), or(0x80, sign)))
            }
        }
        return keccak256(packed);
    }

    function _aboveHalf(bytes calldata data, uint256 at) private pure returns (bool above) {
        bytes memory half = FIELD_HALF;
        assembly ("memory-safe") {
            let prefix := shr(128, calldataload(add(data.offset, at)))
            if gt(prefix, 0) { above := 1 }
            if iszero(above) {
                let src := add(data.offset, add(at, 16))
                let h := add(half, 32)
                let a := calldataload(src)
                let b := mload(h)
                if gt(a, b) { above := 1 }
                if eq(a, b) {
                    let a2 := shr(128, calldataload(add(src, 32)))
                    let b2 := shr(128, mload(add(h, 32)))
                    if gt(a2, b2) { above := 1 }
                }
            }
        }
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

    function _count(bytes calldata bits) internal pure returns (uint256 total) {
        for (uint256 i; i < COMMITTEE_SIZE; i++) {
            if (_bit(bits, i)) total++;
        }
    }

    function _bit(bytes calldata bits, uint256 index) private pure returns (bool) {
        return (uint8(bits[index / 8]) & uint8(1 << (index % 8))) != 0;
    }

    function _xor(bytes32 left, bytes32 right) private pure returns (bytes32 out) {
        out = left ^ right;
    }

    function _gte(bytes memory left, bytes memory right, uint256 rightAt) private pure returns (bool) {
        for (uint256 i; i < 49; i++) {
            uint8 a = uint8(left[i]);
            uint8 b = uint8(right[rightAt + i]);
            if (a != b) return a > b;
        }
        return true;
    }

    function _sub(bytes memory left, bytes memory right, uint256 rightAt) private pure {
        uint256 borrow;
        for (uint256 i = 49; i > 0; i--) {
            uint256 k = i - 1;
            uint256 value = uint256(uint8(left[k]));
            uint256 other = uint256(uint8(right[rightAt + k])) + borrow;
            if (value < other) {
                left[k] = bytes1(uint8(value + 256 - other));
                borrow = 1;
            } else {
                left[k] = bytes1(uint8(value - other));
                borrow = 0;
            }
        }
        if (borrow != 0) revert InvalidProof();
    }

    function _copy(bytes memory src, uint256 srcAt, bytes memory dest, uint256 destAt, uint256 length) private pure {
        for (uint256 i; i < length; i++) dest[destAt + i] = src[srcAt + i];
    }

    function _implementation() private view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            impl := sload(slot)
        }
    }
}
