// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacEthereumHeaderChain {
    function verify(bytes[] calldata headers)
        external
        pure
        returns (
            bytes32 oldestHash,
            bytes32 newestHash,
            uint256 oldestNumber,
            uint256 newestNumber,
            uint256 links,
            bool headerFinal
        );
}

interface IAacBaseAnchorLogProof {
    function verify(
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
            bytes32 outputRoot,
            bytes32 receiptsRoot,
            address from,
            address to,
            uint256 amount,
            uint256 l2SequenceNumber,
            bool headerFinal
        );
}

/// @notice Requires the USDC log proof to use the Ethereum header at the end
/// of the accepted 100-step parent chain.
/// @dev The chain starts at the registry-proof header. This link is not
/// beacon finality, so `headerFinal` stays false.
contract AacBaseAnchorHeaderLogLink {
    address public constant HEADER_CHAIN = 0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D;
    address public constant LOG_PROOF = 0x1815d6DA04DE7910A5438168E1642e0f4eA25D28;
    bytes32 public constant OLDEST_HASH =
        0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa;
    uint256 public constant OLDEST_NUMBER = 26167726;
    uint256 public constant LINKS = 100;

    error InvalidLink();
    error UnexpectedFinality();

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
        )
    {
        bool chainFinal;
        bytes32 oldestHash;
        uint256 oldestNumber;
        uint256 newestNumber;
        (oldestHash, newestHash, oldestNumber, newestNumber, links, chainFinal) =
            IAacEthereumHeaderChain(HEADER_CHAIN).verify(headers);
        if (chainFinal) revert UnexpectedFinality();
        if (
            oldestHash != OLDEST_HASH ||
            oldestNumber != OLDEST_NUMBER ||
            newestNumber != OLDEST_NUMBER + LINKS ||
            links != LINKS ||
            newestHash != keccak256(ethereumHeaderRlp)
        ) revert InvalidLink();
        bool logFinal;
        (outputRoot, , from, to, amount, , logFinal) = IAacBaseAnchorLogProof(LOG_PROOF).verify(
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
        if (logFinal) revert UnexpectedFinality();
        headerFinal = false;
    }
}
