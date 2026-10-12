// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacEthereumBeaconAncestry {
    struct Header {
        uint64 slot;
        uint64 proposerIndex;
        bytes32 parentRoot;
        bytes32 stateRoot;
        bytes32 bodyRoot;
    }

    function verify(Header[] calldata headers)
        external
        pure
        returns (bytes32 finalizedRoot, bytes32 anchorRoot, uint256 links, uint256 oldestSlot, bool headerFinal);
}

interface IAacEthereumSyncAggregateProof {
    function verify(bytes calldata keys)
        external
        view
        returns (
            bytes32 finalizedRoot,
            bytes32 signingRoot,
            uint256 participants,
            bool aggregateVerified,
            bool headerFinal
        );
}

/// @notice One call that checks the beacon parent chain and the sync aggregate
/// for the same finalized root. The committee is still the block's own
/// bootstrap committee, so headerFinal stays false.
contract AacEthereumBeaconCheckpointLink {
    address public constant ANCESTRY = 0x4E28D764151AD328d7c50a0fFB380935d07a26dF;
    address public constant AGGREGATE = 0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341;
    bytes32 public constant FINALIZED_ROOT =
        0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e;
    uint256 public constant LINKS = 6348;
    uint256 public constant PARTICIPANTS = 505;

    error InvalidLink();

    function verify(IAacEthereumBeaconAncestry.Header[] calldata headers, bytes calldata keys)
        external
        view
        returns (
            bytes32 finalizedRoot,
            bytes32 anchorRoot,
            uint256 links,
            uint256 participants,
            bool aggregateVerified,
            bool headerFinal
        )
    {
        bool ancestryFinal;
        (finalizedRoot, anchorRoot, links, , ancestryFinal) = IAacEthereumBeaconAncestry(ANCESTRY).verify(headers);
        bytes32 signedRoot;
        bool signatureFinal;
        (signedRoot, , participants, aggregateVerified, signatureFinal) =
            IAacEthereumSyncAggregateProof(AGGREGATE).verify(keys);
        if (
            finalizedRoot != FINALIZED_ROOT || signedRoot != FINALIZED_ROOT || links != LINKS
                || participants != PARTICIPANTS || !aggregateVerified || ancestryFinal || signatureFinal
        ) revert InvalidLink();
        headerFinal = false;
    }
}
