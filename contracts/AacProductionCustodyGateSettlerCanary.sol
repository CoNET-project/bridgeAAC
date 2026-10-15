// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "./AacProductionCustodyGateSettler.sol";

interface IGbTokenMintPaid {
    function mintPaid(address to, uint256 amount) external;
}

/// @notice Phase C prep: Obstacle 5 settler + one-shot owner-gated paid-GB canary.
/// @dev Storage appends after Beacon (initialized, owner, proofLink, __gap).
///      `settle` / `settleBridge` / `settleFromConet` stay gate-only (emit Settled).
///      `canaryMintPaid` is the only path that calls GB.mintPaid; msg.sender on GB
///      is this proxy after upgrade (Phase B admins(AAC) required).
///      Does not open custody, grant Treasury/Peer, or disable miner votes.
contract AacProductionCustodyGateSettlerCanary is AacProductionCustodyGateSettler {
    /// @notice Same CREATE2 GB on CoNET and Base (9 decimals; 1e9 = 1 GB).
    address public constant GB = 0xC3EF02DaE632b4C10abB66e07d92a387c10838D8;

    /// @notice Hard ceiling: 0.01 paid GB (10_000_000 min-units).
    uint256 public constant CANARY_MAX_AMOUNT = 10_000_000;

    /// @notice Documented Phase C aacId = keccak256(utf8("beamio.aac.phase-c.canary.v1")).
    bytes32 public constant CANARY_AAC_ID =
        0x166dca2560308688f371222e4b7ef51ed2ae1ac427671ec95b537314d547da56;

    bool private canaryMintDone;
    bytes32 private canaryUsedAacId;
    address private canaryRecipient;
    uint256 private canaryAmountMinted;

    error CanaryAlreadyDone();
    error CanaryBadAmount();
    error CanaryBadAacId();
    error CanaryBadRecipient();
    error CanaryNotOwner();

    event CanaryMintPaid(bytes32 indexed aacId, address indexed to, uint256 amount);

    /// @notice One-shot owner canary: mint paid GB from this proxy (GB admin).
    /// @param to Recipient of minted paid GB (must be non-zero).
    /// @param amount Paid-GB min-units; must be in (0, CANARY_MAX_AMOUNT].
    /// @param aacId Must equal CANARY_AAC_ID (named in the authorizing message).
    function canaryMintPaid(address to, uint256 amount, bytes32 aacId) external returns (bool) {
        if (msg.sender != owner) revert CanaryNotOwner();
        if (canaryMintDone) revert CanaryAlreadyDone();
        if (to == address(0)) revert CanaryBadRecipient();
        if (aacId != CANARY_AAC_ID) revert CanaryBadAacId();
        if (amount == 0 || amount > CANARY_MAX_AMOUNT) revert CanaryBadAmount();

        canaryMintDone = true;
        canaryUsedAacId = aacId;
        canaryRecipient = to;
        canaryAmountMinted = amount;

        IGbTokenMintPaid(GB).mintPaid(to, amount);
        emit CanaryMintPaid(aacId, to, amount);
        return true;
    }

    function canaryMintCompleted() external view returns (bool) {
        return canaryMintDone;
    }

    function canaryRecord()
        external
        view
        returns (bytes32 aacId, address to, uint256 amount, bool done)
    {
        return (canaryUsedAacId, canaryRecipient, canaryAmountMinted, canaryMintDone);
    }
}
