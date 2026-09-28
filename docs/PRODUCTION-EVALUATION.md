# Production evaluation

## Final production Shadow evaluation — 2026-09-28

**Verdict:** approve the production **read-only Shadow observer**. Do not activate AAC custody, mint, release, settlement broadcasting, or a miner-vote cutover.

This approval applies only to `bridge-aac-v0.16.0` at commit `88de882` and the production unit described below. The observer has no write-chain path: each report continues to state `shadow yes`, `broadcast no`, `settled no`, `custody closed`, `light-client no`, `registry paused`, and `consume denied`.

### Approved production configuration

| Item | Evidence | Result |
| --- | --- | --- |
| Release | annotated tag `bridge-aac-v0.16.0`, commit `88de882` | Published release |
| Linux binary | `/home/peter/bin/bridge-aac-0.16.0`, SHA-256 `70402f5abcb5597d7122b74bc41a55a711d6f490e78b10d33a2133c4ac3d4f00` | Pinned artifact |
| Service | `bridge-aac-shadow-prod.service` on `38.102.126.30`; active since 2026-09-28 06:07:20 UTC; PID `4139886`; `NRestarts=0` at 06:44:57 UTC | Pass |
| Base readers | local `.30:8547` plus independent `.58:8547` | Two unique execution clients |
| CONET readers | local `.30:8889` plus `https://publicrpc.conet.network` archive cluster | Two unique reader paths |
| Base cursor | floor `51,892,389`; cursor `51,893,551`; lower-head lag `0`; `stable yes` | Pass |
| CONET cursor | floor `1,475,119`; cursor `1,475,503`; lower-head lag `0`; `stable yes` | Pass |
| Persistence | cursor and page state under `/var/lib/bridge-aac-prod`; logs under `/var/log/bridge-aac`; forced logrotate retained service and cursor progress | Pass |
| Host drills | restart, failed log write, corrupt cursor, page state, and logrotate | Pass |

The Base readers still differ periodically; the 06:44 UTC report showed `reader-lag 177`. The service correctly keeps `page open` and `alert reader-lag`. This is not hidden or treated as agreement. Safety scanning uses the lower finalized height and requires both readers to agree at every scanned block on block hash, state root, and receipts root. The cursor reached that lower head and completed the 256-block stable hold.

### Exact approval boundary

The production Shadow may continuously observe and reconcile legacy bridge receipts. It must remain read-only. This evaluation does **not** approve:

- Base finality based on an Ethereum L1 output or fault-proof result;
- CONET finality based on verified consensus signatures;
- any AAC destination consumer or on-chain consume-once contract;
- paid-GB admin-mint closure or a GB mint migration;
- treasury custody, AAC mint/release, transaction broadcasting, or disabling miner votes;
- describing this execution-client quorum as a light client.

Production settlement therefore remains on `TreasuryBridgeV3.voteBridgeOperation` for Treasury routes and `voteBridgeMint` for paid GB. A separate custody review is required after the finality adapters, audited destination contracts, mint-authority closure, end-to-end adversarial tests, and an independent security audit exist.

---

## Historical evaluation — 2026-09-27

**Verdict:** do not approve production Shadow, and do not activate custody.

The trial observer on `74.208.207.31` is read-only, both chains advance from a deployment floor, and lag alerts reach journald. Base is still about 2,472 blocks behind the lower execution-tagged head. The running `0.11.0` tree is unpublished. Miner votes remain the live bridge.

## Custody

Custody activation is closed. This build does not mint, release, or broadcast a bridge transaction. Reports print `custody closed`, `registry paused`, and `consume denied`. The shadow decision path does not print `final true`.

These items are still required before any custody cutover:

- Base finality anchored to an Ethereum L1 output, not only an execution-client tag.
- CONET finality that verifies consensus signatures.
- An audited destination contract that consumes each AAC id once.
- Closure of bare admin mint paths for paid GB.
- Miner `voteBridgeOperation` and `voteBridgeMint` remain live until that cutover.

## Shadow trial

| Item | Evidence | Result |
| --- | --- | --- |
| Service | `bridge-aac-shadow` active since 2026-09-27 23:16:42 UTC, PID 646272 | Running |
| Build | `bridge-aac 0.11.0`, Linux SHA-256 `d5de046075ab777078fe024b337e6b83a65d45854b8893cde844dd82a5c875ca` | Trial binary |
| Tests | 37 Rust tests passed locally | Pass |
| Base floor | `51,876,108`; cursor `51,877,804` | 1,696 blocks since deployment |
| CONET floor | `1,470,191`; cursor `1,471,055` | Caught up with both readers |
| Base readers | `base-rpc.conet.network` and `mainnet.base.org` both finalized at `51,880,276`, hash `0x22e48b59…bd341866` | Gap 0 at sample time |
| CONET readers | `publicrpc.conet.network` and `mainnet-rpc1.conet.network` both finalized at `1,471,055` | Gap 0 |
| Live Base lag | `51,880,276 - 51,877,804 = 2,472` blocks | Above the 64-block alert line |
| Catch-up | 23:17:42 UTC reported `cursor-lag 2430`; 23:18:57 UTC reported `cursor-lag 2302` | 128-block cycles are faster than head growth, but the backlog remains |
| Reader alert | Same cycles reported `reader-lag 170`, then `BRIDGE_AAC_ALERT alert reader-lag` | Alert works |
| Deployment floor | Existing cursors were kept; scanning did not return to block 0 | Pass |
| Corrupt cursor drill | `--once` printed `cursor no` and `BRIDGE_AAC_ALERT alert cursor`; the file stayed `{not-json` | Pass |

CONET has been quiet at `cursor-lag 0` and `reader-lag 0`. Base still prints `alert cursor-lag` because the backlog is far above 64 blocks. While that backlog exists, the observer is not a continuous head observer.

## Release gate

Published `main` is `fcb7574`, tagged `bridge-aac-v0.9.0`. The `0.11.0` changes are a dirty worktree: cursor floor, lower-height quorum, catch-up batches, lag alerts, and the annotated-tag preflight. `scripts/preflight-shadow.sh` refuses that tree. A production install must be built from a clean checkout whose `bridge-aac-v0.11.0` tag points at `HEAD` and is published on `origin`.

## Remaining Shadow gates

1. Keep scanning until Base `cursor-lag` stays at or below 64 blocks, then hold that condition across at least 256 further blocks.
2. Commit and tag `bridge-aac-v0.11.0`, then rebuild the host binary from that tag.
3. Repeat the host drills for a failed log write, process restart, and log rotation. The corrupt-cursor drill is already recorded. Disk-full, restart, and logrotate behavior are covered by unit tests, not yet by a host run.
4. Treat `reader-lag` and `cursor-lag` alerts as pages. A reader gap above 64 blocks must stay visible even while the lower height remains safe to scan.

Production Shadow can be reviewed again after those four gates. Approval of Shadow still does not authorize AAC mint or release.

## Follow-up — 0.12.0

The trial host now runs `bridge-aac 0.12.0`, Linux SHA-256 `ca23a2945b62cbea6d5fd5cf9f47718678bc60b9b18fb308089f83700d57b127`. Custody remains closed.

- A lag above 64 blocks keeps `/var/lib/bridge-aac/page.txt` at `page open` until it clears. The first cycle after install wrote `page open` / `alert cursor-lag`.
- A chain records `stable yes` only after 256 blocks in which both reader lag and cursor lag stay at or below 64. A larger reader gap resets that count.
- Restart left the deployment floors unchanged: Base `51,876,108` and CONET `1,470,191`.
- `bridge-aac drill` on the host reported restart, failed log write, corrupt cursor, and page clear.
- Forced logrotate truncated `shadow.log` in place. The service stayed active and the log grew again to 50,323 bytes.

Base cursor moved from `51,880,869` to `51,880,997` on the first 0.12.0 cycle and was still behind, so `base_stable_at` stayed empty. CONET began a clear count at `1,471,375`. This follow-up does not close the release gate: `0.12.0` is still an unpublished worktree.

## Re-evaluation — 2026-09-28 01:32 UTC

**Verdict:** do not approve production Shadow, and do not activate custody.

`main` is now `ff958f4`. The trial service is the same `0.12.0` binary, Linux SHA-256 `ca23a2945b62cbea6d5fd5cf9f47718678bc60b9b18fb308089f83700d57b127`, active since 2026-09-27 23:51:27 UTC with no restarts. Custody lines remain `custody closed`.

| Item | Evidence | Result |
| --- | --- | --- |
| Page | `/var/lib/bridge-aac/page.txt` reads `page clear` | No open lag page at the sample |
| Base readers | Both finalized at `51,884,329`, hash `0xb5e0a94a…318d8342` | Gap 0 |
| Base cursor | `51,884,329`, floor `51,876,108` | Caught up to that head |
| Base quiet hold | `base_stable_at 51,884,307`, report `stable 22` | 22 blocks, short of 256 |
| CONET readers | Both finalized at `1,472,399`, hash `0x6308a073…40bd1b5b` | Gap 0 |
| CONET cursor | `1,472,367`, floor `1,470,191` | 32 blocks behind, under the 64-block line |
| CONET quiet hold | `conet_stable_at 1,471,375`, report `stable yes` | 992 blocks |
| Release tag | `origin` has `bridge-aac-v0.9.0` only | `bridge-aac-v0.12.0` is absent, so preflight still refuses |

Base printed `stable 0` together with `alert reader-lag` or `alert cursor-lag` through 01:29:35 UTC. The quiet count restarted after that. One clear sample does not meet the 256-block hold. CONET has held its count. The host drills from the 0.12.0 follow-up still stand.

Production Shadow stays closed until Base also prints `stable yes` without another reset, and until `bridge-aac-v0.12.0` is an annotated tag on `ff958f4`, published on `origin`, with the host binary rebuilt from that tag. That approval would still leave custody closed.

## MVP change — 0.13.0

Across 194 report lines after 23:51 UTC, reader gaps of 169–217 blocks were common, and gaps of 383–755 also appeared, while the cursor was usually already on the lower head. Requiring both tips to stay within 64 blocks made the 256-block hold unreachable.

`0.13.0` keeps `alert reader-lag` and `page open` for that tip gap. `stable yes` now counts only distance from the lower head. `stable reset` is printed when the cursor falls more than 64 blocks behind that head. The trial binary is Linux SHA-256 `b96919a59cc65d3c0a2a7474c6eb5dc02b27b0e34b5b75fc41e2f03ff2ed7866`. At 01:40:22 UTC, Base reported `reader-lag 189`, `cursor-lag 0`, and `stable 0`, and the page stayed open. Custody remains closed. This build is not yet published.
