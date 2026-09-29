// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IAacConsumeOnce {
    function consume(bytes32 id, bytes32 header, bytes32 root, bytes32 leaf, address effect) external;
    function noteCredit() external;
}

contract AacErc1967Proxy {
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address impl, bytes memory data) {
        assembly {
            sstore(IMPLEMENTATION_SLOT, impl)
        }
        if (data.length > 0) {
            (bool ok,) = impl.delegatecall(data);
            require(ok, "init");
        }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

/// Gateway role. The owner cannot call the consumer directly.
contract AacGatewayCaller {
    address public owner;
    address public consumer;

    error NotOwner();
    error Bound();
    error NotConsumer();

    constructor() {
        owner = msg.sender;
    }

    function bind(address consumer_) external {
        if (msg.sender != owner || consumer != address(0) || consumer_ == address(0)) revert Bound();
        consumer = consumer_;
    }

    function consume(bytes32 id, bytes32 header, bytes32 root, bytes32 leaf, address effect) external {
        if (msg.sender != owner) revert NotOwner();
        IAacConsumeOnce(consumer).consume(id, header, root, leaf, effect);
    }

    function onConsume(bytes32 id) external {
        if (msg.sender != consumer) revert NotConsumer();
        try IAacConsumeOnce(consumer).consume(
            id,
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            bytes32(uint256(3)),
            address(this)
        ) {} catch {}
        IAacConsumeOnce(consumer).noteCredit();
    }
}

contract AacRevertEffect {
    function onConsume(bytes32) external pure {
        revert("short-balance");
    }
}
