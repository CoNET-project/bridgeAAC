# F4 — Committee rotation runbook

**Date:** 2026-10-15  
**Status:** **EXECUTED** 2026-10-15. `applyUpdate` moved CheckpointRoot from period **1883** to **1884** in its own transaction. Gas `11,504,959` (under the 16,777,216 pairing cap).  
**Owner auth:** 「请依据审计报告, 依次移除生产前障碍」  
**Script:** [scripts/executeF4CommitteeRotate.mjs](../scripts/executeF4CommitteeRotate.mjs)  
**Store:** CheckpointRoot proxy `0xcEE3D699df3df07a573f1aFf642888B97B7aA961`  
**Rules source:** [M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md)

---

## Pass conditions (audit F4)

| # | Requirement | How this runbook enforces it |
| --- | --- | --- |
| 1 | Next period installed in a **separate** transaction | `applyUpdate(Update)` alone — never bundled with Cover / settle / pairing of locks |
| 2 | Keep the **old-period message proof window** | Drain period-`P` covers/settles **before** rotate; Cover rejects `messageSlot/8192 != STORE.period()` |
| 3 | Gas under Base per-tx pairing budget | Cap **16,777,216**; measured median ~11.5M; script refuses estimate ≥ cap |

---

## Why the proof window matters

`AacCheckpointMessageCover.cover` checks:

```text
messageSlot / 8192 == STORE.period()
finalized.slot >= messageSlot
```

F3 Settler **re-runs** `Cover.cover` inside each settle. After `applyUpdate`
advances `period` from `P` to `P+1`, any lock whose beacon slot is still in
`P` **cannot** be newly covered or settled. `ConsumeOnce` and Cover storage
are **not** wiped by rotation (separate contracts); the window that closes is
**new Cover proofs under the old period**.

Therefore:

1. Finish Cover + settle for all pending locks with `messageSlot/8192 == P`.
2. Only then send `applyUpdate` for `P → P+1` in its **own** tx.
3. After rotation, only locks in period `P+1` are eligible for new Cover.

Obstacle-2 covered sample (Base block `52583500`, finalized beacon slot
`15427680`) sits in period `1883` (`15427680 / 8192`). While CheckpointRoot
remains on `1883`, that lock stays coverable. Rotating to `1884` without
settling it first would close its Cover path.

---

## Pre-flight checklist (every rotation)

| Check | Pass |
| --- | --- |
| `CheckpointRoot.rootReady()` | `true` |
| `CheckpointRoot.period()` | current `P` (live: **1883**) |
| AAC EIP-1967 | F3 Settler `0xf131…B2b0` (custody still closed) |
| Cover / ConsumeOnce / Inclusion proxies | code present; unchanged by rotation |
| Pending period-`P` locks | covered + settled (or explicitly abandoned) |
| Update payload | `signatureSlot/8192 == P`, `attested.slot/8192 == P`, advances exactly one period |
| Quorum | `participants * 3 >= 512 * 2` |
| Gas estimate | `< 16_777_216` (pairing budget); one rotation per tx |
| Host block `gasLimit` | informational (Base tip often ≫ 16.7M); **pairing cap still binds** |

---

## Update payload shape

Matches `AacEthereumCheckpointRoot.Update`:

| Field | Size / rule |
| --- | --- |
| `signerUncompressed` | 512 × 128 bytes; digest must equal stored `compressedDigest` |
| `nextCompressed` | 512 × 48 bytes; `keccak256` becomes new digest |
| `nextAggregate` | 48 bytes |
| `bits` | 64 bytes (participation bitfield) |
| `attested` | Header; slot in period `P` |
| `signatureSlot` | in period `P`, strictly after `attested.slot` |
| `branch` | 6 × `bytes32` (Merkle into `NEXT_GINDEX=87`) |
| `signaturePoint` | 256 bytes |

Build from a finalized beacon state in period `P` whose `next_sync_committee`
is the target for `P+1`, signed by the **stored** committee (≥ 2/3).

---

## Commands

```bash
# Readiness only (default) — writes deployments/phase-F4-committee-rotate.json
node scripts/executeF4CommitteeRotate.mjs

# Validate + eth_estimateGas without broadcast
F4_UPDATE_JSON=/path/to/update.json node scripts/executeF4CommitteeRotate.mjs

# Broadcast one applyUpdate (owner key from ~/.master.json)
PHASE_F4_EXECUTE=1 F4_UPDATE_JSON=/path/to/update.json node scripts/executeF4CommitteeRotate.mjs
```

`update.json` may be either a flat `Update` object or `{ "update": { … } }`.
Hex fields accept `0x…` strings; header slots are decimal or hex numbers.

---

## Post-rotation verify

| Check | Expected |
| --- | --- |
| `period()` | `P + 1` |
| `compressedDigest()` | `keccak256(nextCompressed)` |
| `rootReady()` | `true` |
| Cover / ConsumeOnce / AAC code | unchanged |
| New Cover for old-period slots | reverts `InvalidProof` |
| New Cover for new-period slots | eligible once finalized header ≥ message slot |
| AAC `custodyOpen` | still `false` until F5 |

---

## Explicit non-goals

- Does **not** open custody (`CustodyClosed` until F5).
- Does **not** grant `GB.admins(AAC)` (F5).
- Does **not** touch Treasury USDC / `voteBridgeOperation` (F6).
- Does **not** restart EL/CL (`critical-chain-infra-restart-requires-approval`).
- Does **not** skip periods or bundle settle + rotation in one tx.

---

## Related

- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)
- [M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md)
- [M4-ETHEREUM-COMMITTEE-STORE.md](M4-ETHEREUM-COMMITTEE-STORE.md)
- Contract: `contracts/AacEthereumCheckpointRoot.sol` — `applyUpdate`
