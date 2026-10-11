// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IOptimismPortalAnchor {
    function disputeGameFactory() external view returns (address);
    function anchorStateRegistry() external view returns (address);
}

interface IAnchorStateRegistryView {
    function getAnchorRoot() external view returns (bytes32 outputRoot, uint256 l2Sequence);
    function anchorGame() external view returns (address);
    function isGameClaimValid(address game) external view returns (bool);
}

interface IDisputeGameAnchor {
    function l2SequenceNumber() external view returns (uint256);
    function rootClaim() external view returns (bytes32);
}

/// @notice Read-only Ethereum L1 view of the pinned Base anchor.
/// @dev This contract observes the portal and anchor registry. It does not
/// replay a fault proof, does not prove a Base header, and does not authorize
/// mint, release, or custody.
contract AacEthereumL1AnchorView {
    address public constant PORTAL = 0x49048044D57e1C92A77f79988d21Fa8fAF74E97e;
    address public constant FACTORY = 0x43edB88C4B80fDD2AdFF2412A7BebF9dF42cB40e;
    address public constant REGISTRY = 0x909f6cf47ed12f010A796527f562bFc26C7F4E72;

    error WrongWiring();

    constructor() {
        if (
            IOptimismPortalAnchor(PORTAL).disputeGameFactory() != FACTORY ||
            IOptimismPortalAnchor(PORTAL).anchorStateRegistry() != REGISTRY
        ) revert WrongWiring();
    }

    function readAnchor()
        public
        view
        returns (
            address anchorGame,
            bytes32 outputRoot,
            uint256 l2Sequence,
            bool claimValid,
            uint256 gameSequence,
            bytes32 gameRoot
        )
    {
        (outputRoot, l2Sequence) = IAnchorStateRegistryView(REGISTRY).getAnchorRoot();
        anchorGame = IAnchorStateRegistryView(REGISTRY).anchorGame();
        if (anchorGame != address(0)) {
            claimValid = IAnchorStateRegistryView(REGISTRY).isGameClaimValid(anchorGame);
            gameSequence = IDisputeGameAnchor(anchorGame).l2SequenceNumber();
            gameRoot = IDisputeGameAnchor(anchorGame).rootClaim();
        }
    }

    /// @notice True only when the claim-valid game agrees with the anchor root
    /// and the supplied Base block is not ahead of that anchor.
    function covered(uint256 baseBlock) external view returns (bool) {
        (
            address anchorGame,
            bytes32 outputRoot,
            uint256 l2Sequence,
            bool claimValid,
            uint256 gameSequence,
            bytes32 gameRoot
        ) = readAnchor();
        return anchorGame != address(0) &&
            claimValid &&
            l2Sequence > 0 &&
            gameSequence == l2Sequence &&
            gameRoot == outputRoot &&
            baseBlock <= l2Sequence;
    }
}
