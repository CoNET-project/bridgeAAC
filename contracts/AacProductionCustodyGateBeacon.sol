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

interface IAacBaseAnchorBeaconRootLink {
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
        );
}

/// @notice Second implementation of the closed production custody gate.
/// @dev Storage layout matches the first implementation. `quoteBeacon` reads
/// the accepted beacon-root link. This implementation still cannot settle,
/// and `headerFinal` stays false.
contract AacProductionCustodyGateBeacon {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address public constant BEACON_LINK = 0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2;
    bytes32 public constant NEWEST_HASH =
        0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725;

    address private immutable self = address(this);

    uint8 private initialized;
    address public owner;
    address public proofLink;
    uint256[47] private __gap;

    error AlreadyInitialized();
    error NotProxy();
    error NotOwner();
    error BadAddress();
    error CustodyClosed();
    error UnexpectedFinality();
    error InvalidQuote();

    constructor() {
        initialized = 1;
    }

    function initialize(address owner_, address proofLink_) external {
        if (initialized != 0) revert AlreadyInitialized();
        if (owner_ == address(0) || proofLink_ == address(0)) revert BadAddress();
        initialized = 1;
        owner = owner_;
        proofLink = proofLink_;
    }

    function headerFinal() external pure returns (bool) {
        return false;
    }

    function custodyOpen() external pure returns (bool) {
        return false;
    }

    function settle() external pure {
        revert CustodyClosed();
    }

    function quote(
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
            bool headerFinal_
        )
    {
        bool reportedFinal;
        (newestHash, outputRoot, from, to, amount, links, reportedFinal) =
            IAacBaseAnchorHeaderLogLink(proofLink).verify(
                headers,
                ethereumHeaderRlp,
                gameAccountProof,
                gameCode,
                baseHeaderRlp,
                messagePasserProof,
                receiptIndex,
                receiptValue,
                receiptProof,
                logIndex
            );
        if (reportedFinal) revert UnexpectedFinality();
        headerFinal_ = false;
    }

    function quoteBeacon(
        IAacBaseAnchorBeaconRootLink.LogInputs calldata logInputs,
        IAacBaseAnchorBeaconRootLink.BeaconInputs calldata beaconInputs
    )
        external
        view
        returns (
            bytes32 newestHash,
            bytes32 outputRoot,
            bytes32 parentBeaconBlockRoot,
            address from,
            uint256 amount,
            uint256 links,
            bool headerFinal_
        )
    {
        bool reportedFinal;
        (newestHash, outputRoot, parentBeaconBlockRoot, from, amount, links, reportedFinal) =
            IAacBaseAnchorBeaconRootLink(BEACON_LINK).verify(logInputs, beaconInputs);
        if (reportedFinal) revert UnexpectedFinality();
        if (newestHash != NEWEST_HASH || parentBeaconBlockRoot == bytes32(0) || links != 100) revert InvalidQuote();
        headerFinal_ = false;
    }

    function upgradeTo(address newImplementation) external {
        if (msg.sender != owner) revert NotOwner();
        if (address(this) == self || _implementation() != self) revert NotProxy();
        if (newImplementation == address(0) || newImplementation.code.length == 0) revert BadAddress();
        assembly {
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, newImplementation)
        }
    }

    function _implementation() private view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }
}
