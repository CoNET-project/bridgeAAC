// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice CoNET-side asset effect. Calls GB.mintPaid or Treasury.completeFromAac.
/// @dev `settler` stays unset until a CoNET verifier exists. Ethereum BLS
///      precompiles are not available on CoNET, so this contract does not
///      accept a Base receipt by itself.
interface IAacGbMint {
    function mintPaid(address to, uint256 amount) external;
}

interface IAacTreasuryComplete {
    function completeFromAac(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external;
}

contract AacChainEffect {
    address public immutable treasury;
    address public immutable gb;
    address public owner;
    address public settler;

    error NotOwner();
    error NotSettler();

    constructor(address treasury_, address gb_) {
        if (treasury_ == address(0) || gb_ == address(0)) revert NotOwner();
        treasury = treasury_;
        gb = gb_;
        owner = msg.sender;
    }

    function setSettler(address settler_) external {
        if (msg.sender != owner) revert NotOwner();
        if (settler_ == address(0)) revert NotOwner();
        settler = settler_;
    }

    function complete(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external {
        if (settler == address(0) || msg.sender != settler) revert NotSettler();
        if (asset == gb && mode != 2) {
            IAacGbMint(gb).mintPaid(to, amount);
        } else {
            IAacTreasuryComplete(treasury).completeFromAac(operationId, asset, to, amount, mode);
        }
    }
}
