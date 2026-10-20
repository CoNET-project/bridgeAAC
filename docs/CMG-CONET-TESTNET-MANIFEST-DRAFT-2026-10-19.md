# CoNET 主网 testnet-only CMG 验收部署清单（v0.9，验收完成，源码已公开）

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-10-19（S6 A 段：UTC 2026-10-20 00:35 至 00:48；S6 B 段：00:50 至 01:38；S8：01:38；S5 源码验证：S8 之后，UTC 2026-10-20） |
| 版本 | v0.9，替代 v0.8。新增 S5 源码验证与公开的记录（第 9h 节），验收清单全部完成（第 10 节） |
| 状态 | **验收完成（CoNET 侧），源码已在区块浏览器验证并公开。** S0、S1 到 S4、S6 A 段、S6 B 段、S8 全部完成；S7 的 26 项全部通过；最终链上读回一致，两个合约已暂停；S5（源码公开，D-d）已授权并完成，公开后不可撤回。本次改动尚未提交到 git |
| 链 | CoNET 主网，chainId 224422。不是测试网，见 R1、R2 |
| 授权范围 | 只部署 testnet-only 的 CMG 合约，用于 CoNET 侧验收（质押、提案、投票、阈值、ProposalPassed、本地执行、提款、暂停）；源码公开仅限这三个合约 |
| 不在范围内 | 对生产合约的任何交易或状态改动（GB `0xC3EF…`、Treasury `0xa208…`、AAC 代理 `0x9051…`、GBDepinAirdrop `0x62bc…` 等）；生产白名单；Base 侧执行器；公开除三个 CMG 合约之外的任何源码 |

**与 v0.8 的变化**
- S5 已完成：三个 CMG 合约的源码已在区块浏览器验证并公开，状态均为 `Pass - Verified`（第 9h 节）。
- 发布前的检查：标准输入只含三个 CMG 源文件，文件路径与构建时一致；本地用 solc 0.8.35 重编译，三个合约的创建码与运行时码与编译产物逐字节一致；三笔创建交易的输入均以本地字节码开头，构造参数与链上一致。
- 记录一次误提交的探测：为确认接口格式，我曾对 CmgTestTarget 的验证接口提交过一个故意无效的请求。该请求被受理后随即失败（`Fail - Unable to verify`），没有公开任何源码（第 9h 节）。
- R6 与 D-d 已更新。

---

## 1. 合约清单

源码：[contracts/cmg/CmgTestTarget.sol](../contracts/cmg/CmgTestTarget.sol)，[contracts/cmg/CmgRegistryTestnet.sol](../contracts/cmg/CmgRegistryTestnet.sol)，[contracts/cmg/CmgCoreTestnet.sol](../contracts/cmg/CmgCoreTestnet.sol)。测试：[solidity-tests/test/cmg-testnet.test.ts](../solidity-tests/test/cmg-testnet.test.ts)。

| # | 合约 | 角色 | 构造参数 | 权限 |
| --- | --- | --- | --- | --- |
| 1 | `CmgTestTarget` | 唯一执行目标，只计数 `bump()` | 无 | 部署者（操作员）只能调用一次 `setCore`；只有 core 能调用 `bump()` |
| 2 | `CmgRegistryTestnet` | CENT 质押池，计算锁定且已成熟的权重 | G、cap、L、M、存款人列表（3 个）、owner | owner 只能暂停新存款；提款始终开放 |
| 3 | `CmgCoreTestnet` | 提案、投票、阈值、`ProposalPassed`、本地执行 | registry、target、owner、投票期、执行延迟 | owner 只能暂停提案、投票、执行 |

代码层面的限制（如实列出）：
- 提案只接受 `bump()` 的调用数据。接口没有目标地址参数，所以"提案其他目标"无法表达。
- 核心合约构造时要求 `target.deployer() == owner`。如果把生产合约（没有 `deployer()`）填成目标，构造会回退。这只是防误填的检查，不能证明地址就是 CmgTestTarget，所以 S4 仍要读回字节码。
- 执行在延迟之后任何人都可以触发，这与 CoNET 本地执行设计一致。

**编译产物**（solc 0.8.35，optimizer 200 runs，viaIR，evmVersion prague；同一 `package-lock.json` 的工具链理应得到相同哈希，尚未在第二台机器上验证）

| 合约 | 创建码 keccak256（字节） | 运行时 keccak256（字节，编译产物） |
| --- | --- | --- |
| CmgTestTarget | `0xd5a67878e54056b2077ca801b56191483fe09e7368a8c13348b50c5a10ed1461`（676） | `0x729eec08eaa5f18027bd1f7bb2a88ca5392cb84af2d8c6eea87af4ba8477b821`（632） |
| CmgRegistryTestnet | `0xf226fafe6599e19256a6eef98bdc5ccdadb00c5221659ccc510aa20abb7106cc`（3393） | `0x1ecbd78143c9de91f0f81ca1f6b5712a577f62807b37ec5bd0a858d09f1ee782`（2632） |
| CmgCoreTestnet | `0x797d3b832b4459ddc190e20d8fb08191611f084814296fe729d77643f71b33db`（4101） | `0xc153ddec7256b72fd0b475646a2cf32b85ed0fbac80ae053147d4a087abbaa1e`（3493） |

运行时哈希是编译产物的哈希，其中 immutable 的位置是零占位。链上代码的 immutable 已填入部署值，因此 S4 比对时按 build-info 中的 `immutableReferences` 把实际值填入后再算哈希。

---

## 2. 参数与地址

| 参数 | 值 | 状态 |
| --- | --- | --- |
| G（投票门槛） | 0.01 cnet | 已定（B） |
| cap（总质押上限） | 0.05 cnet | 已定（B）。满足合约要求 cap ≥ G |
| L（锁定期） | 1 小时 | 已确认 |
| M（成熟期） | 2 分钟 | 已确认 |
| 投票期 | 10 分钟 | 已确认 |
| 执行延迟 | 2 分钟 | 已确认 |
| 阈值 | `3·yes ≥ 2·W`，W 为提案时快照的总权重 | 与生产设计一致 |

**测试地址**（公开地址。私钥只在 `{CMG_TEST_KEY_FILE}` 中，不在本文件中）

| 角色 | 地址 | 执行前读数（S0） |
| --- | --- | --- |
| 操作员（部署者、owner、调用 `setCore`、执行提案、暂停） | `0xa5feF5c981004e569bF2058F6aCc862d0B29C40A` | nonce 0，余额 0.01 CENT |
| 存款人 1 | `0xA779f2bfCF381647415bc5c48b91b9a959F0038C` | nonce 0，余额 0.012 CENT |
| 存款人 2 | `0x831F08FAf04939E57319276D92e5fA2fe613d902` | nonce 0，余额 0.012 CENT |
| 存款人 3 | `0xB478b1C20687DE652291589CD4b84862CcBbcd42` | nonce 0，余额 0.012 CENT |

**部署地址**（已部署，与预测一致）：CmgTestTarget `0x17A4Ea7e646CFA9Fb71aBDd8a6d04603d811a9a8`，CmgRegistryTestnet `0x10c9454D4e7bfEA7BBD2a51802b7dBb8BfA74Eda`，CmgCoreTestnet `0x2806d45ee497d697D843Bde1A7Bb96958cd8c3eA`。

---

## 3. 验收流程（执行状态与顺序）

- **S0 预检（只读）。** 已完成，全部通过。
- **S1 到 S4 部署与接线。** 已完成（第 9a 节）。
- **S5 源码验证与公开（D-d）。** 已完成（第 9h 节）。
- **S6 A 段。** 已完成：7 笔交易，8 项模拟全部通过（第 9c 节）。
- **S6 B 段。** 已完成：3 笔提款，1 项模拟通过（第 9e 节）。
- **S8。** 已完成：2 笔暂停，5 项模拟全部通过（第 9f 节）。
- **S7。** 26 项全部完成，见第 10 节。

---

## 4. 验收标准（全部满足才算通过）

- S6 每一步的结果与预期一致；S7 每项都以预期的错误名回退。——已满足（第 9b、9c、9e、9f 节）。
- 生产合约（GB、Treasury、AAC 代理、GBDepinAirdrop 等）的交易数为零，状态前后一致。——已满足：测试账户的交易数与运行记录一一对应，所有交易的目标都是 CMG 合约（第 9g 节）。
- 只有第 2 节的测试地址和三个 CMG 合约发生过交互。——已满足（同上）。
- 验收结束后两个合约都处于暂停状态。——已满足（第 9g 节）。

---

## 5. 测试与演练

**本地测试：** `npx hardhat test solidity-tests/test/cmg-testnet.test.ts`，18/18 通过（B 参数）。覆盖构造参数检查、存取款、权重窗口、2/3 边界、暂停、目标合约的调用权限。

**本地全流程演练：** 同一份部署与验收代码在 Hardhat 本地链上执行，时间由本地链推进。S1 到 S4 的读回与运行时哈希检查通过；S7 模拟 26 项全部通过；S6 A 段 7 笔、B 段 3 笔、S8 2 笔，共 12 笔交易全部成功。主网执行与本地演练使用同一份代码。

**gas**（主网实际值见第 9 节各表）：S1 到 S4 合计 1,843,539；S6 A 段 7 笔合计 768,739；S6 B 段 3 笔各 69,513；S8 两笔 44,595 与 44,622。

---

## 6. 风险说明

- **R1 真实资产。** CENT 是真实货币，池中是真实 CENT。cap 0.05 cnet 决定池中最多只有 0.05 CENT。验收结束后，池中余额为 0（三个存款人已全额提取）。
- **R2 公开合约。** 任何人都能调用主网合约。措施：存款仅限白名单；提案需要权重不低于 G；执行在延迟后任何人可触发（设计如此）；两个合约都已暂停，停止新存款、提案、投票、执行；提款始终开放。
- **R3 不可修改。** 已部署的合约不能修补。两个合约已暂停。如果需要继续使用，需要重新部署到新地址。
- **R4 误连生产合约。** 措施：核心合约构造时检查 `target.deployer() == owner`；S4 读回目标字节码。v0.1 的"白名单只能包含 CmgTestTarget"说法不准确，已在 v0.2 更正。
- **R5 密钥。** 测试私钥保存在 `{CMG_TEST_KEY_FILE}`（位置记录在私有运维指南中），权限 600，不在仓库内，不打印，不提交。签名在本进程内完成。操作员与存款人地址都是新建的测试地址，不使用生产 owner EOA `0x87cA…`（它同时是 GB 管理员和 Treasury owner）。
- **R6 源码公开。** 源码已在区块浏览器公开（S5，已授权）。公开后不可撤回。公开的只有三个 CMG 测试合约的源码（标准输入只含这三个文件），不包含项目其他源码。
- **R7 参数不等于生产。** 测试参数与生产不同，验收结果不能直接套用到生产。生产版本需要另行部署并审计。
- **R8 Base 侧未覆盖。** 本次只测试 CoNET 侧。Base 侧执行器依赖 CoNET 轻客户端修复（G-07 到 G-11），修复前不能声称 Base 侧已验收。
- **R9 费用。** gasPrice 很低，gas 费用可以忽略。主要 CENT 支出是存款本金，且已全额返还。
- **R10 合规与法律。** 即使是测试，主网上的质押机制可能涉及金融或监管问题。需要你和相关方确认，我不做判断。
- **R11 停止条件。** 本次验收未触发任何停止条件。所有步骤的结果与预期一致。
- **R12 参数冲突（已解决）。** 最初请求的 G 0.1 与 cap 0.05 组合会使注册表构造回退（已在 CoNET 上只读验证），也会让任何账户都达不到门槛。你选择 B 后，不再使用该组合。
- **R13 已上链的合约。** S1 到 S4 已在主网上部署，代码不可修改。两个合约已暂停。

---

## 7. 需要你确认的事项

- **S6 A 段、S6 B 段、S8。** 已授权并完成。
- **D-d 源码公开。** 已授权并完成（第 9h 节）。
- **是否提交到 git。** 本次改动（三个合约、测试、本清单、部署与验收记录）尚未提交，等待你指示。

---

## 8. 下一步

1. 决定是否把本次改动提交到 git（需要你明确指示）。
2. Base 侧（R8）仍未覆盖。在 G-07 到 G-11 修复之前，不能声称 Base 侧已验收。

---

## 9. 执行记录

### 9a. S1 到 S4（2026-10-19，CoNET 主网，chainId 224422）

记录文件：`deployments/conet-cmg-testnet-S1-S4.json`（只含公开数据）。

| 步骤 | 合约 | 地址 | 交易哈希 | 区块 |
| --- | --- | --- | --- | --- |
| S1 | CmgTestTarget | `0x17A4Ea7e646CFA9Fb71aBDd8a6d04603d811a9a8` | `0x373588a034fd32b87228a0368f516d3f9e40d646e045b0e54c721a36a500886a` | 1783423 |
| S2 | CmgRegistryTestnet | `0x10c9454D4e7bfEA7BBD2a51802b7dBb8BfA74Eda` | `0x25d9d20ed8d2de520e6b0f29bcf4626d1441b23a51105c1d4978f8da069c0541` | 1783424 |
| S3 | CmgCoreTestnet | `0x2806d45ee497d697D843Bde1A7Bb96958cd8c3eA` | `0x52b8745ea0a0b637a8d70090816172dc47fb10abf4aa69f4837cbd1dd619bb5d` | 1783425 |
| S4 | CmgTestTarget.setCore | 同 S1 | `0x3b354534a0d4c376a35bc61f8a8a4bff5be71570bece39d6d28c54962e922557` | 1783426 |

**S4 之后的读回结果**
- 目标合约：deployer 为操作员；core 为 S3 地址；count 为 0。
- 注册表：gate 0.01 cnet，cap 0.05 cnet，lockDuration 3600，maturity 120，owner 为操作员；存款人列表为第 2 节的三个地址；outstanding 为 0；未暂停。
- 核心合约：registry 为 S2 地址，target 为 S1 地址，owner 为操作员，votingPeriod 600，executionDelay 120；bumpCalldataHash 与 `bump()` 一致；nextProposalId 为 0；未暂停。
- 三个合约的链上运行时代码，与编译产物填入 immutable 后的结果一致。

### 9b. CoNET 只读模拟（S7，12 项，2026-10-19）

记录文件：`deployments/conet-cmg-testnet-S7-now.json`。在区块 1784722（链上时间戳 1792435531）用 `eth_call` 模拟，没有发送任何交易。

| 用例 | 期望错误 | 实际错误 | 结果 |
| --- | --- | --- | --- |
| 非存款人质押 | NotDepositor | NotDepositor | 通过 |
| 零金额质押 | ZeroValue | ZeroValue | 通过 |
| 无存款时提款（索引越界） | BadIndex | BadIndex | 通过 |
| 非 owner 暂停注册表 | NotOwner | NotOwner | 通过 |
| 非存款人提案 | NotEligible | NotEligible | 通过 |
| 非 bump() 调用数据提案 | BadCalldata | BadCalldata | 通过 |
| 对不存在的提案投票 | NoProposal | NoProposal | 通过 |
| 执行不存在（未通过）的提案 | NotPassed | NotPassed | 通过 |
| 非 owner 暂停核心合约 | NotOwner | NotOwner | 通过 |
| 非注册表调用 bump() | NotCore | NotCore | 通过 |
| 非部署者接线 | NotDeployer | NotDeployer | 通过 |
| 重复接线 | CoreAlreadySet | CoreAlreadySet | 通过 |

### 9c. S6 A 段执行记录（2026-10-20 UTC，CoNET 主网，chainId 224422）

记录文件：`deployments/conet-cmg-testnet-S6A.json`（只含公开数据）。已由你授权，共 7 笔交易。

| 步骤 | 操作 | 交易哈希 | 区块 | gas |
| --- | --- | --- | --- | --- |
| A1 | 存款人 1 质押 0.01 cnet | `0xf0a5468b7ef8046ba3edc6eaaa382c5d709f83d0bf40fddc493d257e3572ae56` | 1788219 | 119,281 |
| A1 | 存款人 2 质押 0.01 cnet | `0x0524b81038d6fdfe411bba92944e39eed69302d8ea9f87aa5308beb1ecf6fd67` | 1788220 | 102,181 |
| A3 | 存款人 1 提案（快照：存款人 1、2 各 0.01，存款人 3 为 0） | `0xed74c54cba76c5192221587a0c3d58f6b5f44564a9283136af395ebc82d564db` | 1788244 | 205,278 |
| A4 | 存款人 3 质押 0.01 cnet（快照之后） | `0xe4d904bcdeff28a7d3d16a9e0cc405f6ad80aa440ce50c2e187b63500ffdf660` | 1788245 | 102,181 |
| A5 | 存款人 1 投赞成（0.01 / 0.02，未越过） | `0xee0da8432644a559dbef6e47307182013fa261407caaf7b3b0d5c92cb2379111` | 1788246 | 85,045 |
| A6 | 存款人 2 投赞成（0.02 / 0.02，越过 2/3，发出 ProposalPassed） | `0x09c4fc4c3f6e0359836b082a4e64ca2b53c5a46e56b4e16aac9b74391eb02198` | 1788247 | 94,094 |
| A7 | 操作员执行提案 0 | `0x3edb1812971335fdbc59a36969a5d434f59cb1fd5ba34aa5bcd2b782c7e4a4b5` | 1788269 | 60,679 |

**A 段穿插的模拟（8 项，只读，没有发送交易）**

| 用例 | 来源地址 | 期望错误 | 实际错误 | 结果 |
| --- | --- | --- | --- | --- |
| 锁定期内提款 | 存款人 1 | LockActive | LockActive | 通过 |
| 快照之后才成熟的存款人投票 | 存款人 3 | NotEligible | NotEligible | 通过 |
| 重复投票 | 存款人 1 | AlreadyVoted | AlreadyVoted | 通过 |
| 未通过时执行 | 存款人 1 | NotPassed | NotPassed | 通过 |
| 通过后再投票 | 存款人 3 | AlreadyPassed | AlreadyPassed | 通过 |
| 延迟内执行 | 存款人 3 | TooEarly | TooEarly | 通过 |
| 重复执行 | 存款人 3 | AlreadyExecuted | AlreadyExecuted | 通过 |
| 投票期外投票 | 存款人 1 | VotingClosed | VotingClosed | 通过 |

**A 段的时间点（链上时间）**
- 存款人 1 质押 `1792456513`，存款人 2 质押 `1792456519`，存款人 3 质押 `1792456669`。
- 提案快照时间 `1792456663`，投票截止 `1792457263`。
- 执行时间 `1792456801`，操作员在链上时间 `1792456806` 之后执行。

### 9d. S6 A 段之后的链上独立读回（只读）

- 目标合约：count = 1。
- 注册表：outstanding = 0.03 cnet。三个存款人各有 1 笔存款，金额 0.01，未提取，当前权重 0.01。
- 核心合约：nextProposalId = 1。提案 0：提案人为存款人 1，快照权重 0.02，赞成权重 0.02，已通过，已执行，执行时间 `1792456801`。
- 操作员：nonce 5，余额约 0.0099981 CENT。存款人 1：nonce 3，余额约 0.0019996 CENT。存款人 2：nonce 2，余额约 0.0019998 CENT。存款人 3：nonce 1，余额约 0.0019999 CENT。

### 9e. S6 B 段执行记录（2026-10-20 UTC，CoNET 主网，chainId 224422）

记录文件：`deployments/conet-cmg-testnet-S6B.json`（只含公开数据）。已由你授权，共 3 笔交易。

| 步骤 | 操作 | 交易哈希 | 区块 | gas |
| --- | --- | --- | --- | --- |
| B1 | 存款人 1 提款 0.01 cnet | `0x2dc80e3ca6e880befe13ac38fb5a0ee5f27f3ea193b25cc839de05c891cada3a` | 1788822 | 69,513 |
| B2 | 存款人 2 提款 0.01 cnet | `0x32e122395e55bd80c71f89af4471f878a287ab15630897d95d91e6068392a69a` | 1788824 | 69,513 |
| B3 | 存款人 3 提款 0.01 cnet | `0x3ad94e7fcacf2cfe0c7db5432e9f70afb74af03e6df31991178116191afcd079` | 1788848 | 69,513 |

**B 段穿插的模拟（1 项，只读）**

| 用例 | 来源地址 | 期望错误 | 实际错误 | 结果 |
| --- | --- | --- | --- | --- |
| 超额提款（存款人 1 锁定结束后，提款前） | 存款人 1 | AmountTooLarge | AmountTooLarge | 通过 |

**B 段的时间点（链上时间）**：存款人 1 在 `1792460118` 之后提款（锁定于 `1792460113` 结束），存款人 2 在 `1792460124` 之后，存款人 3 在 `1792460274` 之后。

### 9f. S8 执行记录（2026-10-20 UTC，CoNET 主网，chainId 224422）

记录文件：`deployments/conet-cmg-testnet-S8.json`（只含公开数据）。已由你授权，共 2 笔交易，在 B 段完成之后执行。

| 步骤 | 操作 | 交易哈希 | 区块 | gas |
| --- | --- | --- | --- | --- |
| C1 | 操作员暂停注册表（停止新存款） | `0x129ff9b91f0156e22b351aca7f105e867621abc7e89fdeb194a127c7a7f81085` | 1788850 | 44,595 |
| C2 | 操作员暂停核心合约（停止提案、投票、执行） | `0xb1cfd9bb79f9a23e3012ab0bc717824c4e7ade3966ab8598461415549d77774f` | 1788852 | 44,622 |

**S8 模拟（5 项，只读）**

| 用例 | 来源地址 | 期望错误 | 实际错误 | 结果 |
| --- | --- | --- | --- | --- |
| 暂停时质押 | 存款人 1 | IsPaused | IsPaused | 通过 |
| 暂停时提案 | 存款人 1 | IsPaused | IsPaused | 通过 |
| 暂停时投票 | 存款人 3 | IsPaused | IsPaused | 通过 |
| 暂停时执行 | 存款人 1 | IsPaused | IsPaused | 通过 |
| 暂停时提款不被阻止（剩余可提额为 0） | 存款人 1 | AmountTooLarge | AmountTooLarge | 通过 |

### 9g. 最终链上读回（S8 之后，只读）

- 目标合约：count = 1；core 指向 S3。
- 注册表：paused = true；outstanding = 0。三个存款人各有一笔 0.01 cnet 存款，均已全额提取，当前权重 0。
- 核心合约：paused = true；nextProposalId = 1。提案 0 已通过、已执行，快照权重 0.02，赞成权重 0.02。
- 账户交易数与运行记录一一对应：操作员 nonce 7（S1 到 S4、A7 执行、C1 与 C2 两次暂停）；存款人 1 nonce 4（质押、提案、投票、提款）；存款人 2 nonce 3（质押、投票、提款）；存款人 3 nonce 2（质押、提款）。所有交易的目标都是 CMG 合约或新建的 CMG 合约，没有交易发送到生产合约。
- 余额：操作员约 0.0099980 CENT；存款人 1 约 0.0119995 CENT，存款人 2 约 0.0119997 CENT，存款人 3 约 0.0119998 CENT（0.012 减去 gas，0.01 已返还）。

### 9h. S5 源码验证与公开（UTC 2026-10-20，区块浏览器，已授权）

**发布前的检查（只读，本地完成）**
- 标准输入只含三个 CMG 源文件，文件路径与 Hardhat 构建时一致（保证元数据一致）。不包含项目其他源码。
- 用本地缓存的 solc 0.8.35 重编译：三个合约的创建码与运行时码与编译产物逐字节一致。
- 三笔创建交易（S1 到 S3）的输入均以本地字节码开头。构造参数由链上交易取出：CmgTestTarget 无参数，CmgRegistryTestnet 320 字节，CmgCoreTestnet 160 字节。

**验证结果**

| 合约 | 地址 | 结果 | 编译器 | 优化 | EVM 版本 | 许可证 |
| --- | --- | --- | --- | --- | --- | --- |
| CmgTestTarget | `0x17A4Ea7e646CFA9Fb71aBDd8a6d04603d811a9a8` | Pass - Verified | v0.8.35+commit.47b9dedd | 开启，200 runs | prague | MIT |
| CmgRegistryTestnet | `0x10c9454D4e7bfEA7BBD2a51802b7dBb8BfA74Eda` | Pass - Verified | v0.8.35+commit.47b9dedd | 开启，200 runs | prague | MIT |
| CmgCoreTestnet | `0x2806d45ee497d697D843Bde1A7Bb96958cd8c3eA` | Pass - Verified | v0.8.35+commit.47b9dedd | 开启，200 runs | prague | MIT |

回读：三个合约在区块浏览器上均为已验证，ABI 与源码均已公开；构造参数与链上一致；公开的源文件只有 `project/contracts/cmg/` 下的三个文件。

**验证前的一次探测（需要说明）**
为确认接口格式，我曾用故意无效的源码向 CmgTestTarget 的 Etherscan 兼容验证接口提交了一个探测请求。接口受理后生成了一个任务，该任务随即失败（`Fail - Unable to verify`），没有公开任何源码。随后的正式验证使用了新的任务。

---

## 10. 验收清单与状态

| 验收项 | 状态 | 依据 |
| --- | --- | --- |
| S0 预检 | 完成 | 第 3 节 |
| S1 到 S4 部署与接线 | 完成 | 第 9a 节，读回与运行时哈希检查通过 |
| 链上代码与编译产物一致 | 完成 | S1 到 S4 的运行时哈希检查（immutable 已填入）；第 9h 节的本地重编译 |
| S6 A 段正向路径 | 完成 | 第 9c、9d 节：7 笔交易，ProposalPassed，目标计数为 1 |
| S6 B 段提款 | 完成 | 第 9e 节：3 笔提款，超额提款模拟通过 |
| S8 暂停与暂停后的拒绝 | 完成 | 第 9f 节：2 笔暂停，5 项模拟通过 |
| S7 负向用例 | 26/26 完成 | 第 9b 节（12 项）、第 9c 节（8 项）、第 9e 节（1 项）、第 9f 节（5 项） |
| 最终链上读回一致 | 完成 | 第 9g 节 |
| 生产合约无交易 | 满足 | 第 9g 节：交易数与记录一一对应，目标均为 CMG 合约 |
| 只有测试地址与 CMG 合约交互 | 满足 | 同上 |
| 验收后两个合约暂停 | 完成 | 第 9g 节 |
| S5 源码公开 | 完成 | 第 9h 节：三个合约均为 Pass - Verified |

**CoNET 侧验收结论：** 按第 4 节的标准，全部满足。Base 侧（R8）未覆盖，不在本次结论之内。
