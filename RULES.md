# bridgeAAC 全局开发守则

## 1. 平台边界

- macOS 仅用于本地代码编辑、静态检查和单元测试。
- macOS 生成的 Mach-O 二进制不得作为 AAC 生产产物，也不得在生产节点运行。
- AAC 生产二进制必须是 Linux `x86_64-unknown-linux-gnu` ELF。
- 当前指定的 Linux 构建与部署主机为 `70.35.205.77`。

## 2. 本地修改，发布后远程构建

所有源码、合约、脚本和配置修改必须先在本地 Git checkout 完成：

```text
本地修改 → 本地测试 → commit → push
→ 70.35.205.77 git fetch/pull exact commit
→ Linux 构建 → 校验 SHA-256 → 安装已发布产物
```

禁止在 `70.35.205.77` 上使用 `vim`、`sed`、Python heredoc 或其它方式直接修改
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
`70.35.205.77` 当前本地执行客户端监听 `127.0.0.1:8545`，它是 CoNET reader，
不是 Base reader。该主机当前没有本地 Base execution endpoint，因此在提供第二个
独立 Base reader 之前，不得启动 Shadow production unit。

## 6. 版本与 systemd

`Cargo.toml` 的版本、`deploy/bridge-aac-shadow-prod.service` 中的二进制版本、
发布 tag、Linux ELF SHA-256 和部署记录必须属于同一发布批次。

版本不一致时，部署必须失败，不能通过修改远程 unit 或重复覆盖旧版本来绕过。
