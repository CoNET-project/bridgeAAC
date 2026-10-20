// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {CmgRegistryTestnet} from "./CmgRegistryTestnet.sol";
import {CmgTestTarget} from "./CmgTestTarget.sol";

/// @notice TESTNET-ONLY CMG core for CoNET acceptance.
/// A proposal may only call CmgTestTarget.bump(). Weights are snapshotted when the proposal is created.
/// Passing is 3 * yes >= 2 * total (whitepaper section 6.4). The vote that crosses the threshold emits ProposalPassed.
/// Execution is permissionless after executionDelay. The owner can pause proposing, voting and execution.
contract CmgCoreTestnet {
    CmgRegistryTestnet public immutable registry;
    CmgTestTarget public immutable target;
    address public immutable owner;
    uint64 public immutable votingPeriod;
    uint64 public immutable executionDelay;
    bytes32 public immutable bumpCalldataHash;

    struct Proposal {
        address proposer;
        uint64 snapshotTime;
        uint64 votingEnd;
        uint64 executeAfter;
        uint256 totalWeight;
        uint256 yesWeight;
        bool passed;
        bool executed;
    }

    uint256 public nextProposalId;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint256)) public snapshotWeight;
    mapping(uint256 => mapping(address => bool)) public voted;
    bool public paused;

    event ProposalCreated(
        uint256 indexed id, address indexed proposer, uint64 snapshotTime, uint64 votingEnd, uint256 totalWeight
    );
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalPassed(
        uint256 indexed id,
        address indexed executionTarget,
        bytes4 selector,
        uint64 snapshotTime,
        uint256 totalWeight,
        uint256 yesWeight
    );
    event Executed(uint256 indexed id);
    event PausedSet(bool isPaused);

    error BadConfig();
    error NotOwner();
    error IsPaused();
    error BadCalldata();
    error NotEligible();
    error NoProposal();
    error VotingClosed();
    error AlreadyVoted();
    error AlreadyPassed();
    error NotPassed();
    error AlreadyExecuted();
    error TooEarly();

    constructor(
        CmgRegistryTestnet registry_,
        CmgTestTarget target_,
        address owner_,
        uint64 votingPeriod_,
        uint64 executionDelay_
    ) {
        if (address(registry_) == address(0) || address(target_) == address(0) || owner_ == address(0)) {
            revert BadConfig();
        }
        if (votingPeriod_ == 0) revert BadConfig();
        // Only a CmgTestTarget deployed by the same operator passes. A production address has no deployer() and reverts here.
        if (target_.deployer() != owner_) revert BadConfig();
        registry = registry_;
        target = target_;
        owner = owner_;
        votingPeriod = votingPeriod_;
        executionDelay = executionDelay_;
        bumpCalldataHash = keccak256(abi.encodeWithSelector(CmgTestTarget.bump.selector));
    }

    function setPaused(bool paused_) external {
        if (msg.sender != owner) revert NotOwner();
        paused = paused_;
        emit PausedSet(paused_);
    }

    function propose(bytes calldata data) external returns (uint256 id) {
        if (paused) revert IsPaused();
        if (keccak256(data) != bumpCalldataHash) revert BadCalldata();
        if (registry.weightOf(msg.sender) < registry.gate()) revert NotEligible();

        id = nextProposalId++;
        Proposal storage p = proposals[id];
        p.proposer = msg.sender;
        p.snapshotTime = uint64(block.timestamp);
        p.votingEnd = uint64(block.timestamp) + votingPeriod;

        address[] memory deps = registry.depositors();
        uint256 total;
        for (uint256 i = 0; i < deps.length; i++) {
            uint256 w = registry.weightOf(deps[i]);
            snapshotWeight[id][deps[i]] = w;
            total += w;
        }
        p.totalWeight = total;
        emit ProposalCreated(id, msg.sender, p.snapshotTime, p.votingEnd, total);
    }

    function vote(uint256 id, bool support) external {
        if (paused) revert IsPaused();
        Proposal storage p = proposals[id];
        if (p.proposer == address(0)) revert NoProposal();
        if (block.timestamp > p.votingEnd) revert VotingClosed();
        if (p.passed) revert AlreadyPassed();
        if (voted[id][msg.sender]) revert AlreadyVoted();

        uint256 w = snapshotWeight[id][msg.sender];
        if (w < registry.gate()) revert NotEligible();

        voted[id][msg.sender] = true;
        if (support) p.yesWeight += w;
        emit Voted(id, msg.sender, support, w);

        if (p.totalWeight > 0 && 3 * p.yesWeight >= 2 * p.totalWeight) {
            p.passed = true;
            p.executeAfter = uint64(block.timestamp) + executionDelay;
            emit ProposalPassed(
                id, address(target), CmgTestTarget.bump.selector, p.snapshotTime, p.totalWeight, p.yesWeight
            );
        }
    }

    function execute(uint256 id) external {
        if (paused) revert IsPaused();
        Proposal storage p = proposals[id];
        if (!p.passed) revert NotPassed();
        if (p.executed) revert AlreadyExecuted();
        if (block.timestamp < p.executeAfter) revert TooEarly();
        p.executed = true;
        target.bump();
        emit Executed(id);
    }
}
