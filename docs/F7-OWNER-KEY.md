# F7 — Owner key → multisig / timelock

**Date:** 2026-10-15  
**Status:** **SCHEDULED** — F7's timelock variables overlapped the Phase C canary record. SettlerF7b keeps slots 49–52 as that record and starts the timelock at slot 53. `scheduleUpgrade` is in Base block `52639991`. `upgradeTo` is allowed after **2026-10-17T13:02:09Z**. Owner is still the EOA; no multisig was named.  
**Owner auth:** 「请依据审计报告, 依次移除生产前障碍」  
**Script:** [scripts/executeF7OwnerKey.mjs](../scripts/executeF7OwnerKey.mjs)  
**JSON:** [deployments/phase-F7-owner-key.json](../deployments/phase-F7-owner-key.json) and [deployments/phase-F7b-storage-fix.json](../deployments/phase-F7b-storage-fix.json)

---

## F7b schedule (2026-10-15)

Live F7 reads the Phase C canary record as its timelock:

| Slot | Canary field | F7 misread |
| --- | --- | --- |
| 49 | `canaryMintDone = true` | `pendingImplementation = address(1)` |
| 50 | canary id | `upgradeReadyAt` (not a timestamp) |
| 51 | recipient = Owner | `pendingOwner` = Owner |
| 52 | `10_000_000` | unused by F7; left intact |

SettlerF7c `0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44` replaces that schedule. It keeps the same canary slots and dispatches GB `mintPaid` or `Treasury.completeFromAac` from the proven receipt. `upgradeTo` is allowed after **2026-10-17T13:25:41Z**, then `repairCanaryRecord()`. `sourceInitiateOpen` is true on Base and CoNET. The Base → CoNET 0.01 USDC receipt is already covered: Base source initiate and Base destination `224422` are open, and CoNET effect `0x0661…d30b` settler is `0x7285fD9a9e62751e952697f95DD753C82Bb84BbE`.

---

## Audit ask

Move production Owner control from the hot EOA to a **multisig and/or timelock** (AAC custody stack first; Treasury / Root as follow-ons if product requires).

---

## Live ownership map (Base)

| Contract | `owner()` |
| --- | --- |
| AAC proxy `0x9051…2aAd` | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` (**EOA**) |
| SettlerF5 impl (direct) | `address(0)` (impl storage unused; proxy holds owner) |
| CheckpointRoot `0xcEE3…A961` | same EOA |
| TreasuryBridgeV3 `0xa208…9003` | same EOA |
| Finality `0xE4f6…a6c9` | same EOA (if view present) |
| Cover / Consume / Inclusion / ProofLink | no Ownable `owner()` (or N/A) |

Expected Owner EOA: `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`.

---

## AAC transfer surface

Live Settler F7 exposes `transferOwnership` and `acceptOwnership`. Those variables currently alias the Phase C canary record, so they must not be used for a handoff until F7b is installed. F7b keeps the same two-step transfer and the 48h `scheduleUpgrade` / `upgradeTo` path, with the timelock stored after the canary record.

Treasury `transferOwnership` is a separate handoff and does not move the AAC owner.

---

## Still open

1. The owner-to-multisig handoff is withdrawn. AAC Owner stays the production EOA `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`. Do not call `transferOwnership` or `acceptOwnership` on the live F7 proxy: slot 51 still aliases the Phase C canary recipient.
2. SettlerF7c `0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44` is scheduled. `upgradeTo` after **2026-10-17T13:25:41Z**, then `repairCanaryRecord()`.
3. Sourcify creation and runtime match for `0xfe5Eab561908e278F7578860A89325A47C5D2C1f` (match id 56160060). Basescan rejected the submission on its daily cap.

---

## Required next auth

No further multisig address is required. The next chain step is the already scheduled F7c upgrade, not an owner handoff.

---

## Related

- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)  
- [F6-USDC.md](F6-USDC.md) — prior BLOCKED  
- [F5-SETTLE-OPEN.md](F5-SETTLE-OPEN.md) — SettlerF5 EXECUTED
