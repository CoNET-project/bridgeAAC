// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacBaseAnchorHeaderLogLink {
    function verify(
        bytes[] calldata headers,
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata gameAccountProof,
        bytes calldata gameCode,
        bytes calldata baseHeaderRlp,
        bytes[] calldata messagePasserProof,
        uint64 receiptIndex,
        bytes calldata receiptValue,
        bytes[] calldata receiptProof,
        uint256 logIndex
    )
        external
        view
        returns (
            bytes32 newestHash,
            bytes32 outputRoot,
            address from,
            address to,
            uint256 amount,
            uint256 links,
            bool headerFinal
        );
}

interface IAacEthereumBeaconRootStorage {
    function verify(
        bytes calldata ethereumHeaderRlp,
        bytes[] calldata accountProof,
        bytes[] calldata timestampProof,
        bytes[] calldata rootProof
    )
        external
        view
        returns (
            bytes32 headerHash,
            bytes32 stateRoot,
            bytes32 parentBeaconBlockRoot,
            uint256 timestamp,
            bool headerFinal
        );
}

/// @notice One call that requires the accepted USDC-log header and the
/// EIP-4788 beacon-root storage proof to be the same Ethereum header.
/// @dev Both inputs stay non-final. This contract cannot settle.
contract AacBaseAnchorBeaconRootLink {
    address public constant PROOF_LINK = 0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b;
    address public constant BEACON_STORAGE = 0x599D2FF48177CBb38eed5FDcd61e681cD441C953;
    bytes32 public constant NEWEST_HASH =
        0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725;

    struct LogInputs {
        bytes[] headers;
        bytes ethereumHeaderRlp;
        bytes[] gameAccountProof;
        bytes gameCode;
        bytes baseHeaderRlp;
        bytes[] messagePasserProof;
        uint64 receiptIndex;
        bytes receiptValue;
        bytes[] receiptProof;
        uint256 logIndex;
    }

    struct BeaconInputs {
        bytes[] accountProof;
        bytes[] timestampProof;
        bytes[] rootProof;
    }

    error InvalidLink();
    error UnexpectedFinality();

    function verify(LogInputs calldata logInputs, BeaconInputs calldata beaconInputs)
        external
        view
        returns (
            bytes32 newestHash,
            bytes32 outputRoot,
            bytes32 parentBeaconBlockRoot,
            address from,
            uint256 amount,
            uint256 links,
            bool headerFinal
        )
    {
        (newestHash, outputRoot, from, amount, links) = _log(logInputs);
        parentBeaconBlockRoot = _beacon(logInputs.ethereumHeaderRlp, beaconInputs, newestHash);
        headerFinal = false;
    }

    function _log(LogInputs calldata logInputs)
        private
        view
        returns (bytes32 newestHash, bytes32 outputRoot, address from, uint256 amount, uint256 links)
    {
        bool linkFinal;
        (newestHash, outputRoot, from, , amount, links, linkFinal) = IAacBaseAnchorHeaderLogLink(PROOF_LINK).verify(
            logInputs.headers,
            logInputs.ethereumHeaderRlp,
            logInputs.gameAccountProof,
            logInputs.gameCode,
            logInputs.baseHeaderRlp,
            logInputs.messagePasserProof,
            logInputs.receiptIndex,
            logInputs.receiptValue,
            logInputs.receiptProof,
            logInputs.logIndex
        );
        if (linkFinal) revert UnexpectedFinality();
        if (newestHash != NEWEST_HASH || newestHash != keccak256(logInputs.ethereumHeaderRlp) || links != 100) {
            revert InvalidLink();
        }
    }

    function _beacon(bytes calldata ethereumHeaderRlp, BeaconInputs calldata beaconInputs, bytes32 newestHash)
        private
        view
        returns (bytes32 parentBeaconBlockRoot)
    {
        bool beaconFinal;
        bytes32 headerHash;
        (headerHash, , parentBeaconBlockRoot, , beaconFinal) = IAacEthereumBeaconRootStorage(BEACON_STORAGE).verify(
            ethereumHeaderRlp,
            beaconInputs.accountProof,
            beaconInputs.timestampProof,
            beaconInputs.rootProof
        );
        if (beaconFinal) revert UnexpectedFinality();
        if (headerHash != newestHash || parentBeaconBlockRoot == bytes32(0)) revert InvalidLink();
    }
}
