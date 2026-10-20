// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice TESTNET-ONLY CENT stake pool for CMG acceptance on CoNET.
/// Weight rule (whitepaper section 6.2): a deposit carries weight while
/// depositedAt + maturity <= t < depositedAt + lockDuration.
/// Withdrawals are allowed only after a deposit's lock has ended. Depositors are fixed at deployment.
/// The owner can pause new deposits. Withdrawals stay open while paused.
/// This is not the production design. It iterates over bounded lists and has no governance of its own.
contract CmgRegistryTestnet {
    uint256 public constant MAX_DEPOSITORS = 16;
    uint256 public constant MAX_DEPOSITS_PER_ACCOUNT = 32;

    uint256 public immutable gate;
    uint256 public immutable cap;
    uint64 public immutable lockDuration;
    uint64 public immutable maturity;
    address public immutable owner;

    struct Deposit {
        uint256 amount;
        uint64 depositedAt;
        uint256 withdrawn;
    }

    mapping(address => bool) public isDepositor;
    address[] private _depositors;
    mapping(address => Deposit[]) private _deposits;
    uint256 public outstanding;
    bool public paused;
    bool private _entered;

    event Staked(address indexed account, uint256 index, uint256 amount, uint64 depositedAt);
    event Withdrawn(address indexed account, uint256 index, uint256 amount);
    event PausedSet(bool isPaused);

    error BadConfig();
    error NotOwner();
    error IsPaused();
    error NotDepositor();
    error ZeroValue();
    error CapExceeded();
    error TooManyDeposits();
    error BadIndex();
    error LockActive();
    error AmountTooLarge();
    error TransferFailed();
    error Reentered();

    constructor(
        address[] memory depositors_,
        uint256 gate_,
        uint256 cap_,
        uint64 lockDuration_,
        uint64 maturity_,
        address owner_
    ) {
        if (depositors_.length == 0 || depositors_.length > MAX_DEPOSITORS) revert BadConfig();
        if (gate_ == 0 || cap_ < gate_) revert BadConfig();
        if (lockDuration_ == 0 || maturity_ >= lockDuration_) revert BadConfig();
        if (owner_ == address(0)) revert BadConfig();
        for (uint256 i = 0; i < depositors_.length; i++) {
            address a = depositors_[i];
            if (a == address(0) || isDepositor[a]) revert BadConfig();
            isDepositor[a] = true;
            _depositors.push(a);
        }
        gate = gate_;
        cap = cap_;
        lockDuration = lockDuration_;
        maturity = maturity_;
        owner = owner_;
    }

    function depositors() external view returns (address[] memory) {
        return _depositors;
    }

    function depositCount(address account) external view returns (uint256) {
        return _deposits[account].length;
    }

    function depositOf(address account, uint256 index)
        external
        view
        returns (uint256 amount, uint64 depositedAt, uint256 withdrawn)
    {
        Deposit storage d = _deposits[account][index];
        return (d.amount, d.depositedAt, d.withdrawn);
    }

    function setPaused(bool paused_) external {
        if (msg.sender != owner) revert NotOwner();
        paused = paused_;
        emit PausedSet(paused_);
    }

    function stake() external payable {
        if (paused) revert IsPaused();
        if (!isDepositor[msg.sender]) revert NotDepositor();
        if (msg.value == 0) revert ZeroValue();
        if (outstanding + msg.value > cap) revert CapExceeded();
        if (_deposits[msg.sender].length >= MAX_DEPOSITS_PER_ACCOUNT) revert TooManyDeposits();
        outstanding += msg.value;
        uint64 t = uint64(block.timestamp);
        _deposits[msg.sender].push(Deposit({amount: msg.value, depositedAt: t, withdrawn: 0}));
        emit Staked(msg.sender, _deposits[msg.sender].length - 1, msg.value, t);
    }

    function withdraw(uint256 index, uint256 amount) external {
        if (_entered) revert Reentered();
        Deposit[] storage ds = _deposits[msg.sender];
        if (index >= ds.length) revert BadIndex();
        Deposit storage d = ds[index];
        if (block.timestamp < uint256(d.depositedAt) + lockDuration) revert LockActive();
        if (amount == 0 || amount > d.amount - d.withdrawn) revert AmountTooLarge();
        d.withdrawn += amount;
        outstanding -= amount;
        emit Withdrawn(msg.sender, index, amount);
        _entered = true;
        (bool ok, ) = msg.sender.call{value: amount}("");
        _entered = false;
        if (!ok) revert TransferFailed();
    }

    /// @notice Weight of `account` at the current block time.
    function weightOf(address account) public view returns (uint256 w) {
        Deposit[] storage ds = _deposits[account];
        uint256 t = block.timestamp;
        for (uint256 i = 0; i < ds.length; i++) {
            uint256 start = uint256(ds[i].depositedAt) + maturity;
            uint256 end = uint256(ds[i].depositedAt) + lockDuration;
            if (t >= start && t < end) {
                w += ds[i].amount - ds[i].withdrawn;
            }
        }
    }
}
