# bridgeAAC 全局开发守则

## 1. 平台边界

- macOS 仅用于本地代码编辑、静态检查和单元测试。
- macOS 生成的 Mach-O 二进制不得作为 AAC 生产产物，也不得在生产节点运行。
- AAC 生产二进制必须是 Linux `x86_64-unknown-linux-gnu` ELF。
- 当前指定的 Linux 构建与部署主机为 `{HOST_D}`。

## 2. 本地修改，发布后远程构建

所有源码、合约、脚本和配置修改必须先在本地 Git checkout 完成：

```text
本地修改 → 本地测试 → commit → push
→ {HOST_D} git fetch/pull exact commit
→ Linux 构建 → 校验 SHA-256 → 安装已发布产物
```

禁止在 `{HOST_D}` 上使用 `vim`、`sed`、Python heredoc 或其它方式直接修改
`.rs`、`.sol`、`.ts`、`dist/` 或生产源码。远程主机只允许拉取已发布 commit、
构建、安装和运行验收。

远程 checkout 若存在未提交改动，必须停止部署并报告；不得自动 reset、clean、
stash 或覆盖这些改动。

## 3. 构建产物

生产 Shadow 构建必须使用：

```bash
./scripts/shadow-release.sh
```

该脚本默认目标为：

```text
x86_64-unknown-linux-gnu
```

脚本必须：

1. 使用 `Cargo.lock` 的锁定依赖；
2. 生成 Linux ELF；
3. 拒绝 Mach-O 或其它非 ELF 文件；
4. 记录版本、目标平台、源码 commit 和 SHA-256；
5. 明确标记 `shadow read-only` 与 `custody closed`。

安装前必须运行：

```bash
./scripts/preflight-shadow.sh
```

它必须确认 Cargo 版本、systemd unit 中的二进制版本、Git tag、HEAD 和远程
发布状态一致。

## 4. 生产安全边界

- 当前 AAC Shadow 是只读观察器，不得广播 mint、release 或 settlement 交易。
- `custody closed` 是默认且必须保留的状态，除非 Base finality、CoNET finality、
  destination consumer、权限收口、端到端测试和独立审计全部通过。
- Shadow 部署不得关闭或替换 `voteBridgeOperation` / `voteBridgeMint`。
- AAC 应用部署不得顺带重启 Geth、Beacon、Validator 或其它链基础设施。
- 任何链上合约部署、升级、角色变更和 custody 切换，必须单独完成部署记录、
  bytecode/权限验收和 Explorer 验证。

## 5. Shadow RPC 配置

生产 unit 必须从 `/etc/default/bridge-aac-shadow-prod` 读取 RPC，配置模板见
[`deploy/bridge-aac-shadow-prod.env.example`](deploy/bridge-aac-shadow-prod.env.example)。

每条链必须配置两个可达且独立的 reader；禁止重复同一个 URL 来制造 quorum。

当前 Base reader 为两个公共节点，由不同运营方提供：`mainnet.base.org`（Base）和
`base.publicnode.com`（Allnodes）。二者都必须返回 `eth_chainId == 8453`，并在同一
finalized 高度给出相同区块哈希。`{CONET_NODE_A}` 与 `{CONET_NODE_C}` 同属一个网段
（Cogent COGENT-A），不被视为两个独立 reader，生产配置中不再使用。

CONET reader 为生产主机本机执行客户端（`127.0.0.1:8545`）与
`publicrpc.conet.network`。

已在目标链上结算、但不会再由投票执行的操作，只能通过
`bridge-aac confirm-settled` 写入 `deploy/settled-operations.json`。该命令在写入前由
读取端点核对结算交易（成功、接收方为 settler、各读取端点区块哈希一致）；未通过则不写入。

Reader finalized tip 的短暂差异属于 advisory `reader-lag-warning`，采用连续
3 个周期触发、连续 3 个周期恢复的滞后策略；它本身不得打开 page 或重置
stable。只有 lower finalized 范围内的 hash/state-root/receipts-root 不一致、
quorum/RPC/cursor 错误，或持续超过 256 blocks 的 `cursor-lag`，才是阻断性
告警。catch-up batch 默认 256 blocks，仍逐块验证三种 root。

## 6. 版本与 systemd

`Cargo.toml` 的版本、`deploy/bridge-aac-shadow-prod.service` 中的二进制版本、
发布 tag、Linux ELF SHA-256 和部署记录必须属于同一发布批次。

版本不一致时，部署必须失败，不能通过修改远程 unit 或重复覆盖旧版本来绕过。
