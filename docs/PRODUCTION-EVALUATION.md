# Production evaluation — 2026-09-27

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
