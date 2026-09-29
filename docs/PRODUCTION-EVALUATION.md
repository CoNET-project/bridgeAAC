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

### Read-only L1 anchor observer — 2026-09-28

`bridge-aac` 0.17.0 adds `base-l1-output`. It is a separate binary command. It does not replace `bridge-aac-0.16.0`, and `bridge-aac-shadow-prod.service` stays on the 0.16.0 unit. The observer reads Base OptimismPortal `0x49048044D57e1C92A77f79988d21Fa8fAF74E97e` on Ethereum L1, requires `isGameClaimValid` on the anchor game, and refuses to treat a Base execution `finalized` tag as L1 finality when that tag is ahead of the anchor. The side binary `/home/peter/bin/bridge-aac-0.17.0` read anchor L2 block 51,678,960 (game `0xed666ac4e26dc024114ff6ada69d7dd8477a8116`) against Base execution block 51,895,863 and printed `covered no`. That observation does not pass custody gate 1 and does not authorize mint, release, or a miner-vote cutover.

### Read-only CONET beacon observer — 2026-09-28

`bridge-aac` 0.18.0 adds `conet-consensus`. It is a separate command. It does not replace `bridge-aac-0.16.0`, and `bridge-aac-shadow-prod.service` stays on the 0.16.0 unit. The observer reads the local beacon REST finalized execution payload and compares it with the execution client's `finalized` tag. Agreement prints `beacon-agreed yes` and still prints `signature-check no`. The beacon on `38.102.126.30` does not serve `/eth/v1/beacon/light_client/finality_update`. This observation does not pass custody gate 2 and does not authorize mint, release, or a miner-vote cutover.

### Read-only paid-GB mint observer — 2026-09-28

`bridge-aac` 0.19.0 adds `gb-mint-authority`. It is a separate command. It does not replace `bridge-aac-0.16.0`, and `bridge-aac-shadow-prod.service` stays on the 0.16.0 unit. The live paid-GB vote and the bare admin mint selectors are on GBToken `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` (`mint`, `mintPaid`, `voteBridgeMint`), not on TreasuryBridgeV3. The observer reads the EIP-1967 implementation, not the 163-byte proxy stub, and the views `validatorCount`, `requiredVotes`, and `bridgePaused`. A 2026-09-28 read through `https://rpc1.conet.network` found implementation `0x8e5AC5aDDe7A66E8604dc1eafd49948723c9D765`, `admin-mint open`, `validator-count 0`, and `vote-mint no-validators`. `mint-closed` stayed `no`. That observation does not pass the mint-closure gate and does not authorize a GB voter change or a miner-vote cutover.

### Read-only destination consumer observer — 2026-09-28

`bridge-aac` 0.20.0 adds `destination-consumer`. It is a separate command. It does not replace `bridge-aac-0.16.0`, and `bridge-aac-shadow-prod.service` stays on the 0.16.0 unit. The observer searches implementation code for `aacConsumeMint(bytes32)`, `aacConsumeRelease(bytes32)`, `aacConsumeMintPaid(bytes32)`, and `aacConsumeMintDeveloper(bytes32)`. A 2026-09-28 read through `https://rpc1.conet.network` and `https://base-rpc.conet.network` found CoNET Treasury implementation `0xd813b3FB2789d7A404b3888b5f14f7Ce03d76Da1`, Base Treasury implementation `0xf7474cAC9c9833fa35ce10e3b22f442096ed0a06`, Peer v5 `peer-code-bytes 0`, and all three deployed selectors absent. The report was `consume-once no`, `consumer absent`, `audit no`, and `custody closed`. That observation does not deploy a consumer and does not pass the destination-contract gate.

### Observer wording remediation — 0.21.0

`bridge-aac` 0.21.0 corrects two reports that could be read as custody passes. The shadow scan path is unchanged. The later section records the unit switch.

- `destination-consumer` now accepts only `PUSH4` selector hits. Even when `selector-observation present`, the report is `semantic-proof no`, `consume-once no`, `consumer observation-only`, and `custody-gate no`. A raw 4-byte collision is not a hit. The in-process acceptance predicate passes only when selector presence is combined with proof binding, stored consume ids, role separation, atomic rollback, replay rejection, a reentrancy guard, upgrade-layout safety, and an independent audit. The live command always supplies the unproven evidence set.
- `gb-mint-authority` prints `selectors-absent yes` when `mint`, `mintPaid`, and `voteBridgeMint` are missing, and still prints `upgrade-authority unread` and `mint-closed no`. Selector absence is not mint closure.
- The reference ledger checks credit overflow before `consume`. A short Circle balance or an overflowing credit leaves the AAC `Reserved`.
- Adversarial tests in `tests/adversarial.rs` drop or replace the source header after reserve. `consume` re-checks that header. A reorg returns `UnknownHeader` or `DigestMismatch`, leaves the AAC `Reserved`, and does not credit or debit. A legacy journal row without a source header cannot be consumed. Already terminal records still return `BadState` on a second consume.
- `consume_spec` is the in-process UUPS storage specification. It is not deployed. A relayer cannot consume. Re-entry is rejected. A failed effect removes the consumed id and restores the credit counter. An upgrade may append slots and may not reorder `paused`, `admin`, `consumed`, `__gap`.

This remediation does not pass any custody gate and does not authorize mint, release, or a miner-vote cutover.

### Shadow service move — 0.21.0

`src/service.rs` and `src/shadow.rs` are unchanged from `bridge-aac-v0.16.0` at `88de882`. The shadow cursor and the seen-key journal are not the gateway journal changed in this release. A `--once` cycle on a copy of the live cursor kept `base_floor` `51,892,389` and `conet_floor` `1,475,119`, printed `custody closed`, and did not write the production cursor. `bridge-aac-shadow-prod.service` then runs `/home/peter/bin/bridge-aac-0.21.0`, Linux SHA-256 `05dcaf5f73b7923c9fa14458fe8434e413f19f62bf3ec2d9400613685ae1e59a`, built from tag `bridge-aac-v0.21.0` at `fa27123`. The switch stays read-only. Miner votes remain live.

### Sync-aggregate observation — 0.22.0

`conet-consensus` in 0.22.0 reads the finalized sync committee and the block's sync aggregate. A complete aggregate prints `signature-material present` and still prints `signature-check no`. The light-client finality route remains absent. This command does not change the shadow scan path. A copied live cursor kept `base_floor` `51,892,389` and `conet_floor` `1,475,119`. `bridge-aac-shadow-prod.service` ran `/home/peter/bin/bridge-aac-0.22.0`, Linux SHA-256 `141b5a9c1b72b75106752b361a99e836c4604af2dc827ee10da1430e9e84168b`, from tag `bridge-aac-v0.22.0` at `356ad56`, until the 0.24.0 switch below. Custody stayed closed. Miner votes remain live.

### Sync-aggregate BLS check — 0.23.0

`0.23.0` checks that aggregate with FastAggregateVerify. `aggregate-verify yes` means the beacon-reported committee signed the previous block root. `trusted-committee` stays `no`, so `custody-gate no` remains and custody gate 2 stays closed. A one-shot read on `38.102.126.30` at finalized epoch `47,985`, execution block `1,477,583`, printed `aggregate-verify yes`, `signature-check yes`, `trusted-committee no`, `light-client no`, and `custody closed`. The diagnostic binary stayed in `/tmp` and did not replace the `0.22.0` shadow unit. Linux SHA-256 `c40285d8df033fb9922447dd2e78bfb58c6a2b1277aa02910678bf4269f7a787`.

### Parent-slot committee — 0.24.0

`0.24.0` loads the beacon block by the finalized checkpoint root, then verifies that block's sync aggregate against the committee at its parent slot and that slot's fork. `committee-state parent-slot` is that binding. `sync-quorum yes` means at least two thirds of the 512 bits participated. A one-shot read on `38.102.126.30` used checkpoint epoch `47,990`, root `0xba448ea2dd59dfa43db805fea99de937a8c96e70691ac186ebd09e3c58c7c3d0`, parent committee epoch `47,989`, and printed `aggregate-verify yes`, `sync-quorum yes`, `signature-check yes`. The checkpoint execution block was `1,477,679` while geth `finalized` was `1,477,743`, so the report printed `beacon-agreed no`. The beacon still does not serve a light-client update or the full beacon state, so `state-root-binding` stays `unread` and `trusted-committee` stays `no`. The diagnostic binary stayed in `/tmp` until the switch below. Linux SHA-256 `85e53d8969ed820ab3dc4951088619038029576fb88af418f74f1021d534f3f9`. This command does not feed `shadow-service`.

A copied live cursor then kept `base_floor` `51,892,389` and `conet_floor` `1,475,119` and printed `custody closed`. `bridge-aac-shadow-prod.service` now runs `/home/peter/bin/bridge-aac-0.24.0`, PID `171724`, `NRestarts=0`, from tag `bridge-aac-v0.24.0` at `6ae68d1`. The production cursor floors did not drop. The first cycle kept `custody closed`, `broadcast no`, and `settled no`. Base still printed `reader-lag 189` with `cursor-lag 0`.

On the same host, Prysm `blocks/finalized` matched geth `finalized` at execution block `1,477,775`. The FFG checkpoint root's execution payload was block `1,477,711` and did not. `beacon-agreed` compares geth with the checkpoint payload, so it stays `no`. The alias is not the FFG checkpoint. Shadow still follows execution tags only.

### Finalized alias is not the checkpoint — 0.25.0

`0.25.0` also reads Prysm `blocks/finalized`. `beacon-agreed` stays a comparison of geth `finalized` with the FFG checkpoint execution payload. `alias-matches-geth yes` does not change that comparison. A one-shot read on `38.102.126.30` showed checkpoint execution block `1,477,775` and geth / alias block `1,477,839`, so `checkpoint-alias-same no`, `alias-matches-geth yes`, and `beacon-agreed no`. The aggregate still verified. The diagnostic binary stayed in `/tmp`. Linux SHA-256 `4746e28b76702cc423cd115fd2531b6eceaff9b447bd28c2382eebfc843d7a70`. `bridge-aac-shadow-prod.service` stays on `0.24.0`. This command does not feed `shadow-service`.

### Head-state checkpoint — 0.26.0

`states/finalized` stores the previous finalized checkpoint, about two epochs older than fork choice. `0.26.0` reads `states/head` finality checkpoints instead, then compares that block with geth `finalized`. `checkpoint-source head` names that choice. A one-shot read on `38.102.126.30` showed epoch `47,997`, execution block `1,477,903`, with the checkpoint, the `blocks/finalized` alias, and geth `finalized` on the same hash, so `beacon-agreed yes`, `checkpoint-alias-same yes`, and `alias-matches-geth yes`. The aggregate still verified. `trusted-committee` stays `no`. The diagnostic binary stayed in `/tmp` until the switch below. Linux SHA-256 `b6116d9463e677f6845216fb2b4bccdc0c6493ab252622bcb8fef7fcdd639c32`. `beacon-agreed yes` does not feed `shadow-service`.

A copied live cursor then kept `base_floor` `51,892,389` and `conet_floor` `1,475,119` and printed `custody closed`. `bridge-aac-shadow-prod.service` now runs `/home/peter/bin/bridge-aac-0.26.0`, PID `184730`, `NRestarts=0`, from tag `bridge-aac-v0.26.0` at `769c126`. The production floors did not drop. The first cycle kept `custody closed`. Base still prints reader lag with `cursor-lag 0`. Miner votes remain live.

### State-root binding — 0.27.0

`0.27.0` downloads the parent slot's Deneb beacon state and checks that its hash tree root equals the signed header's `state_root`, and that the sync committee inside that state verifies the aggregate. A one-shot read on `38.102.126.30` at epoch `48,028`, execution block `1,478,895`, printed `state-root-binding yes`, `beacon-agreed yes`, `aggregate-verify yes`, and `trusted-committee no`. The state still comes from the same beacon, so custody gate 2 stays closed. The diagnostic binary stayed in `/tmp` until the switch below. Linux SHA-256 `f2374c26858b47546244d7e6c25be8b785b118dffeba8889dcbbf7d4e46b5f6d`. `bridge-aac-shadow-prod.service` stays on `0.26.0`. This command does not feed `shadow-service`.

A copied live cursor then kept `base_floor` `51,892,389` and `conet_floor` `1,475,119` and printed `custody closed`. `bridge-aac-shadow-prod.service` now runs `/home/peter/bin/bridge-aac-0.27.0`, PID `270134`, `NRestarts=0`, from tag `bridge-aac-v0.27.0` at `19ab5aa`. The production floors did not drop. The first cycle kept `custody closed`, `broadcast no`, and `settled no`. Base still printed `reader-lag 208` with `cursor-lag 0`. Miner votes remain live.

A second local beacon on `127.0.0.1:4110` agreed with `:4100` at finalized epoch `48,031`, root `0x3fbcfcb8f1f9b60b`, and the same 512-member committee endpoints. Both processes are on this host, so that agreement does not make `trusted-committee yes`.

### One-period committee handoff — 0.28.0

`0.28.0` takes the last block before the sync-committee rotation and checks that its aggregate authenticates a beacon state whose `next_sync_committee` equals the committee that signed the current finalized block. A one-shot read on `38.102.126.30` at epoch `48,219`, execution block `1,485,007`, printed `committee-handoff yes`, `handoff-epoch 48126`, `state-root-binding yes`, `beacon-agreed yes`, and `trusted-committee no`. The previous committee is still served by this beacon, so custody gate 2 stays closed. The diagnostic binary stayed in `/tmp` until the switch below. Linux SHA-256 `4abb73ec973adf2d4f2b0d9b37c7fa2cb92bfff551f48ec6359557f17ce74ddf`. This command does not feed `shadow-service`.

A copied live cursor kept `base_floor` `51,892,389` and `conet_floor` `1,475,119` and printed `custody closed`, `broadcast no`, and `settled no`. The live cursor file was not the `--once` target. `bridge-aac-shadow-prod.service` now runs `/home/peter/bin/bridge-aac-0.28.0`, PID `751896`, `NRestarts=0`, from tag `bridge-aac-v0.28.0` at `221510b`. After the restart the floors were unchanged. CONET cursor moved forward to `1,485,103` with `stable yes`. Base stayed at cursor `51,922,356`, `cursor-lag 0`, `reader-lag 184`, and `stable 0`, and the page stayed open on `alert reader-lag`. Miner votes remain live.

### Two-period committee handoff — 0.29.0

`0.29.0` repeats the handoff for one older sync-committee period and prints how many periods linked. A cold one-shot stopped at `handoff-periods 1` because the older beacon state was not returned within the read limit. After that state was available, a second one-shot at epoch `48,223`, execution block `1,485,135`, printed `committee-handoff yes`, `handoff-periods 2`, and `handoff-epoch 47870`, with `trusted-committee no`. Both committees still come from this beacon, so custody gate 2 stays closed. The diagnostic binary stayed in `/tmp`. Linux SHA-256 `26de70b0edfa91cee9ea2380cf29cdd092f298ced758ffc6b28ba0ed3a124dc0`. `bridge-aac-shadow-prod.service` stays on `0.28.0`. This command does not feed `shadow-service`.

### Four-period committee handoff — 0.30.0

`0.30.0` follows the same signed `next_sync_committee` link for four periods, and stops early if an older state is not read. A one-shot on `38.102.126.30` at epoch `48,263`, execution block `1,486,415`, printed `committee-handoff yes`, `handoff-periods 4`, and `handoff-epoch 47358`, with `state-root-binding yes`, `beacon-agreed yes`, and `trusted-committee no`. The four committees still come from this beacon, so custody gate 2 stays closed. The diagnostic binary stayed in `/tmp`. Linux SHA-256 `80b763c406193884299915913be2f34d23e9a743c6dde105e765d10745281eae`. `bridge-aac-shadow-prod.service` stays on `0.28.0`. This command does not feed `shadow-service`.

### Genesis pin — 0.31.0

`0.31.0` hashes the genesis beacon state and checks two facts: the hash equals the genesis header `state_root`, and the state's `genesis_validators_root` equals the published pin `0xacac7566fdf384a1ada45c01dcf9030d7eb0e1e5f5302659101d0b2a5bb59092`. A one-shot on `38.102.126.30` at epoch `48,266`, execution block `1,486,511`, printed `genesis-pin yes`, `handoff-periods 4`, `handoff-epoch 47358`, and `trusted-committee no`. The beacon on `38.102.126.50:4100` returned the same validators root. The four-period handoff does not reach that genesis committee, so custody gate 2 stays closed. The diagnostic binary stayed in `/tmp` until the switch below. Linux SHA-256 `62fefb6916c50d0e56a327f92c5fbddcbb516ca82400e7eb6cd30aa41995ff4e`. This command does not feed `shadow-service`.

A copied live cursor kept `base_floor` `51,892,389` and `conet_floor` `1,475,119` and printed `custody closed`, `broadcast no`, and `settled no`. The live cursor file was not the `--once` target. `bridge-aac-shadow-prod.service` now runs `/home/peter/bin/bridge-aac-0.31.0`, PID `869679`, `NRestarts=0`, from tag `bridge-aac-v0.31.0` at `205ec67`. After the restart the floors were unchanged. The cursor stayed at Base `51,926,769` and CONET `1,486,575`. Base printed `reader-lag 193`, `cursor-lag 0`, and `stable 0`, and the page stayed open on `alert reader-lag`. CONET printed `stable yes`. Miner votes remain live.

### Consume-once specification contract — mainnet

`AacConsumeOnceV1` is the in-process consume specification as a UUPS proxy. Storage order is `paused`, `admin`, `gateway`, `consumed`, `credits`, then a 50-slot gap. The reentrancy lock is transient and is not a layout slot. The contract records an id and a credit counter. It does not mint or release.

The first deployment used `metadata.bytecodeHash: none`. Local bytecode matched `eth_getCode`, and Blockscout set `is_verified` and `is_partially_verified` while `is_fully_verified` stayed false. That metadata has no IPFS digest, so this explorer scores the match as partial. Those addresses are superseded. The record is `deployments/conet-AacConsumeOnce-bytecodehash-none.json`, proxy `0x02C98ACc2CFDE505013B8518Bd73283cB2C8eCD5`.

The replacement uses `metadata.bytecodeHash: ipfs` and the same `solc 0.8.35+commit.47b9dedd` settings otherwise. CoNET proxy `0xA13843C75f68F726e1DC4dbA75d07597EE18d999`. V1 implementation `0xfD5093DAFf45A402943Bf13E777a5A97AD15d703`. V2 implementation `0x52E778276c4beD01dA5284DD7430267E9C0d3BBc`, with `rescueAdmin` at slot 55. Local deployed bytecode matched `eth_getCode` for the proxy, both implementations, the rejected reorder implementation `0x9133921CA4c6c963622e85D659B979ba282b244f`, the gateway `0x3CFC09eadBd59b8884647cbb8332D1CaD7924E8A`, and the revert effect `0x804a08a05bABfa944DC70B9c68038Fe105FC7669`. Blockscout reports `is_fully_verified` true for each of those six addresses.

On-chain results, all mined on the fully verified proxy:

| Check | Transaction | Result |
|---|---|---|
| Admin cannot consume | `0x3ce26a8f3f08a8e18ec06f95c16ab3c16c4beb3de8af24a3dade3234741e5f13` | reverted |
| Reentrant consume credits once | `0x7b55d1948620c65cc16dd330df0a521f76d76bf86227ee13b2856d4725452858` | success, credits `1` |
| Second consume of the same id | `0x731175f64e29e6395aee3583af2e62070e1c3481cf47440536d79de47e167bc1` | reverted, credits stayed `1` |
| Failed effect | `0xc0767e4192ecf2299ff4eb0fce3f3b37c8bc98fc130a8ab4d38576ebeabac8e7` | reverted, id not consumed |
| Reordered upgrade | `0x4880988028602ae171af6f2066cecc55c088b29b3f0013a5a67b9a8280c8ec65` | reverted, implementation stayed V1 |
| Append-only upgrade | `0x3957c6ea16383623e3b8a0ecfdbc8fc44bc2723ecb706d599e9b5857931508e2` | success, consumed id and credits kept |
| Consume after upgrade | `0x8241d18e635b36a61f4ba6a5b133d787ad086f6008e36c776964dd02e547fdba` | success, credits `2` |

Independent audit is still absent, and this contract is not the production destination. `consume-once` and custody gate 3 stay closed. The production shadow unit is unchanged.

### Forward sync committee — 0.32.0

`0.32.0` adds `forward-committee`. It trusts the published genesis state, then accepts one later period only when the already trusted committee signs a header in its own period, the header's state hash matches, two thirds of that committee participate, and the state's finalized checkpoint does not move backward. A skipped period, an older period, a different signing committee, or a conflicting finalized root is rejected. The checkpoint file can be replaced only by a later period. `trusted-committee` stays `no` until the chain reaches the beacon head; execution-payload comparison is still unread. This command does not feed `shadow-service`.

A one-period run on `38.102.126.30` against `127.0.0.1:4100`, with witness beacon `38.102.126.50:4100`, printed `genesis-pin yes`, `step advanced`, `period 1`, `updates 1`, `witness yes`, `head-period 188`, `periods-remaining 187`, `execution-check unread`, and `trusted-committee no`. The stored finalized checkpoint is epoch `253`, root `0x496c4e1326090f8bc9077530693de311ede5abe860032eb07891202bf97edd20`. Early period-0 blocks often have fewer than two-thirds participation, so the command keeps searching that period until it finds a supermajority. Linux SHA-256 `f5846a8896a1a36eb156899677dfc1c7b045357d77702102cc239ebbed3485b4`. The binary stayed in `/tmp`. `bridge-aac-shadow-prod.service` stayed on `0.31.0`, PID `869679`, `NRestarts=0`. Custody remains `0/4`.

The first continued run stopped at period 10 with `fault quorum`. Period 10 never reaches two thirds (the best aggregate has 203 of 512 participants). That is not a skipped period. The Altair light client keeps the best valid signature and, once the period timeout has passed, applies it so the committee can advance. `forced-updates` counts each such step. A two-thirds aggregate is still preferred when one exists. `trusted-committee` stays `no` while any step was forced.

The catch-up then finished. The checkpoint on `38.102.126.30` at `/home/peter/aac-forward-committee.json` is period `189`, equal to the beacon head, with `updates 189`, `forced-updates 8`, and finalized epoch `48381`. Periods 10 through 17 are the eight forced steps. From period 18 onward the updates are two-thirds aggregates. The final report printed `witness yes`, `periods-remaining 0`, and `execution-check yes`: the stored head-period committee signed the beacon finalized block, and that block's execution hash matched geth `finalized`. `trusted-committee` stays `no` because those eight periods did not have a supermajority. `custody-gate no` and `custody closed` remain. The forward process has exited. `bridge-aac-shadow-prod.service` is still `0.31.0`, PID `869679`, `NRestarts=0`. Miner votes stay live.

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
