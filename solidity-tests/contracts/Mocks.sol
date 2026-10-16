// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "../../contracts/AacProductionCustodyGateSettlerF5.sol";

/// Test doubles only. Used by solidity-tests/test. Not deployed.

contract MockBaseCover is IAacCheckpointMessageCoverF5 {
    bytes32 public opId;
    uint256 public amt;
    bool public covered;
    bool public headerFinal;
    uint256 public calls;

    function set(bytes32 o, uint256 a, bool c, bool h) external {
        opId = o; amt = a; covered = c; headerFinal = h;
    }

    function cover(
        Aggregate calldata,
        Header calldata,
        bytes32[7] calldata,
        bytes calldata,
        bytes calldata,
        bytes[] calldata,
        uint64,
        uint256,
        Header[] calldata
    ) external returns (bytes32, uint256, bool, bool) {
        calls++;
        return (opId, amt, covered, headerFinal);
    }
}

contract MockConetInclusion is IAacConetMessageInclusionF5 {
    bytes32 public opId;
    uint256 public amt;
    bool public covered;
    bool public aggregateOk;
    uint256 public calls;

    function set(bytes32 o, uint256 a, bool c, bool ok) external {
        opId = o; amt = a; covered = c; aggregateOk = ok;
    }

    function cover(
        Aggregate calldata,
        bytes calldata,
        bytes calldata,
        bytes[] calldata,
        uint64,
        uint256,
        Header[] calldata
    ) external returns (bytes32, uint256, bool, bool) {
        calls++;
        return (opId, amt, covered, aggregateOk);
    }
}

/// Stands in for the consume-once contract at the hardcoded CONSUME address.
contract MockConsume {
    error AlreadyConsumed();
    mapping(bytes32 => bool) public consumed;
    uint256 public calls;

    function consumeFromSettler(bytes32 id, bytes32, bytes32, bytes32, uint8, uint256, address) external {
        calls++;
        if (consumed[id]) revert AlreadyConsumed();
        consumed[id] = true;
    }
}

/// Stands in for GBTokenV2 at the hardcoded GB address (mintPaid + bridgePaused).
contract MockGB {
    bool public bridgePaused;
    uint256 public mintCalls;
    mapping(address => uint256) public minted;

    function setPaused(bool p) external { bridgePaused = p; }

    function mintPaid(address to, uint256 amount) external {
        mintCalls++;
        minted[to] += amount;
    }
}

/// Pure payee reader: the "receipt" in tests is abi.encode(beneficiary, gross).
contract MockPayee {
    function payee(bytes calldata receipt, uint256) external pure returns (address beneficiary, uint256 gross) {
        (beneficiary, gross) = abi.decode(receipt, (address, uint256));
    }
}

/// Treasury stand-in for AacChainEffectV2's completeFromAac calls.
contract MockTreasury {
    uint256 public calls;
    bytes32 public lastOp;
    address public lastAsset;
    address public lastTo;
    uint256 public lastAmount;
    uint8 public lastMode;

    function completeFromAac(bytes32 operationId, address asset, address to, uint256 amount, uint8 mode) external {
        calls++;
        lastOp = operationId; lastAsset = asset; lastTo = to; lastAmount = amount; lastMode = mode;
    }
}

/// Effect reader for the CoNET settler: the test "receipt" is abi.encode(beneficiary, gross, asset, mode, chainId).
contract MockEffectReader {
    function effect(bytes calldata receipt, uint256)
        external
        pure
        returns (address beneficiary, uint256 gross, address destinationAsset, uint8 mode, uint256 destinationChainId)
    {
        (beneficiary, gross, destinationAsset, mode, destinationChainId) =
            abi.decode(receipt, (address, uint256, address, uint8, uint256));
    }
}

contract MockProbe {
    function available() external pure returns (bool) {
        return true;
    }
}
