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

/// @notice Upgradeable production custody gate. This implementation cannot
/// open custody or settle assets.
/// @dev The proxy address stays stable. `headerFinal` stays false because the
/// linked Base proof is not an Ethereum beacon-finality proof. The upgrade
/// key can replace this implementation later; it cannot make this
/// implementation settle.
contract AacProductionCustodyGate {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

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
