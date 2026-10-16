// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacGbPaidMintV2 {
    function mintPaid(address to, uint256 amount) external;
}

interface IAacGbPausedV2 {
    function bridgePaused() external view returns (bool);
}

interface IAacTreasuryCompleteV2 {
    function completeFromAac(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external;
}

/// @notice CoNET-side asset effect, replacing `AacChainEffect` (v1).
/// @dev Fixes C2 and C3 on the CoNET side:
///      - each operationId completes once (C3 replay);
///      - only (asset, mode) routes explicitly allowed by the owner are
///        completed, each with a per-operation cap (C2);
///      - GB mints are refused while the GB bridge is paused (C3 pause bypass).
///      Only `settler` can call `complete`. Owner-managed routes start empty,
///      so the effect completes nothing until the owner sets a route.
contract AacChainEffectV2 {
    uint8 public constant MODE_BURN_RELEASE = 2;

    struct Route {
        bool allowed;
        uint256 maxAmount;
    }

    address public immutable treasury;
    address public immutable gb;
    address public owner;
    address public settler;

    mapping(bytes32 => bool) public consumed;
    mapping(address => mapping(uint8 => Route)) public routes;

    error NotOwner();
    error NotSettler();
    error BadAddress();
    error ZeroAmount();
    error AlreadyConsumed();
    error RouteNotAllowed();
    error AmountOverCap();
    error BridgePaused();

    event SettlerSet(address indexed settler);
    event RouteSet(address indexed asset, uint8 mode, bool allowed, uint256 maxAmount);
    event Completed(bytes32 indexed operationId, address indexed asset, address indexed to, uint256 amount, uint8 mode);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address treasury_, address gb_, address owner_) {
        if (treasury_ == address(0) || gb_ == address(0) || owner_ == address(0)) revert BadAddress();
        treasury = treasury_;
        gb = gb_;
        owner = owner_;
    }

    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert BadAddress();
        owner = next;
    }

    function setSettler(address settler_) external onlyOwner {
        if (settler_ == address(0)) revert BadAddress();
        settler = settler_;
        emit SettlerSet(settler_);
    }

    function setRoute(address asset, uint8 mode, bool allowed, uint256 maxAmount) external onlyOwner {
        if (asset == address(0)) revert BadAddress();
        routes[asset][mode] = Route({allowed: allowed, maxAmount: maxAmount});
        emit RouteSet(asset, mode, allowed, maxAmount);
    }

    function complete(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external {
        if (settler == address(0) || msg.sender != settler) revert NotSettler();
        if (operationId == bytes32(0) || to == address(0) || asset == address(0)) revert BadAddress();
        if (amount == 0) revert ZeroAmount();
        if (consumed[operationId]) revert AlreadyConsumed();
        Route memory route = routes[asset][mode];
        if (!route.allowed) revert RouteNotAllowed();
        if (amount > route.maxAmount) revert AmountOverCap();

        // Effects before interactions.
        consumed[operationId] = true;

        if (asset == gb && mode != MODE_BURN_RELEASE) {
            if (IAacGbPausedV2(gb).bridgePaused()) revert BridgePaused();
            IAacGbPaidMintV2(gb).mintPaid(to, amount);
        } else {
            IAacTreasuryCompleteV2(treasury).completeFromAac(operationId, asset, to, amount, mode);
        }
        emit Completed(operationId, asset, to, amount, mode);
    }
}
