# F5 — Settle-open (mint after consume + GB re-grant)

**Date:** 2026-10-15  
**Status:** **EXECUTED** (`ok:true`)  
**Owner auth:** 「请依据审计报告, 依次移除生产前障碍」  
**Contract:** [contracts/AacProductionCustodyGateSettlerF5.sol](../contracts/AacProductionCustodyGateSettlerF5.sol)  
**Script:** [scripts/executeF5SettleOpen.mjs](../scripts/executeF5SettleOpen.mjs)  
**JSON:** [deployments/phase-F5-settle-open.json](../deployments/phase-F5-settle-open.json)

---

## Live result (EXECUTED 2026-10-15)

| Item | Value |
| --- | --- |
| SettlerF5 impl (EIP-1967) | `0xa1aa63BF44128E9f14260886263c8775C4A2dA00` |
| Prior F3 Settler | `0xf131359EE46d261B91cEedE8772DE18fB821B2b0` |
| `custodyOpen` / `headerFinal` | **false** / **false** |
| `GB.admins(AAC)` CoNET + Base | **true** / **true** |
| COVER smoke settle | `AlreadyConsumed` (opId burned in F3) |

| Step | Tx |
| --- | --- |
| CoNET `GB.addAdmin(AAC)` | `0xe583cf0cd0e2b273…` |
| Base `GB.addAdmin(AAC)` | `0xcb29435842a261…` |
| Deploy SettlerF5 | `0x18c6fc49bdf0…` |
| AAC `upgradeTo(F5)` | `0xba8aed970365…` |
| Smoke AlreadyConsumed | `0x1549e9b7a4fb…` |

Live GB mint of a new lock needs a **new** Cover-eligible BridgeOperation (F3 COVER sample already consumed).

---

## Pass conditions (audit F5)

| # | Requirement | How F5 enforces it |
| --- | --- | --- |
| 1 | Owner **names** the Settler impl + upgrade calldata | Owner ran `upgradeTo(F5 Settler)` |
| 2 | No-arg `custodyOpen` / `headerFinal` / `settle()` may stay **closed** | Views still closed; production open is proof+`mintTo` settle only |
| 3 | Mint bound to **same-tx** COVER/Inclusion proof + consume | `_consumeThenMint`: `consumeFromSettler` then `GB.mintPaid(mintTo, amount)` |
| 4 | Re-grant `GB.admins(AAC)` on **CoNET + Base** | Both chains `addAdmin(AAC)` before upgrade |

---

## What F5 is **not**

| Out of scope | Why |
| --- | --- |
| Flip `custodyOpen()` to `true` | Audit allows closed custody views; settle is owner-named proof path |
| Unpause miner `voteBridgeMint` | Phase D pause stays; F5 is AAC admin mint only |
| USDC / Treasury AAC grant or pause `voteBridgeOperation` | **F6** (BLOCKED — see [F6-USDC.md](F6-USDC.md)) |
| Owner key → multisig / timelock | **F7** (BLOCKED — see [F7-OWNER-KEY.md](F7-OWNER-KEY.md)) |

---

## Settler API (delta from F3)

```text
settle(...coverArgs, address mintTo, address effect)
settleBridge(...coverArgs, address mintTo, address effect)
settleFromConet(...inclusionArgs, address mintTo, address effect)
```

- `mintTo == address(0)` → `BadMintTo`
- `effect == address(0)` → `ConsumeFailed` (same as F3)
- Amount = COVER / Inclusion return (GB min-units for GB locks)
- `msg.sender` on `GB.mintPaid` = AAC proxy after `upgradeTo`

---

## Related

- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) — phase map  
- [F4-COMMITTEE-ROTATION.md](F4-COMMITTEE-ROTATION.md) — prior obstacle  
- [F6-USDC.md](F6-USDC.md) — next obstacle (BLOCKED)  
- [F7-OWNER-KEY.md](F7-OWNER-KEY.md) — Owner key (BLOCKED)
