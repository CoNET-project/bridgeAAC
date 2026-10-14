# Custody cutover proposal (not executed)

**Date:** 2026-10-14  
**Status:** **PROPOSAL ONLY** — no role grants, no miner-vote disable, no
unpause, no canary mint/release in this task.  
**Precondition:** [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
Obstacles 1–5 **Accepted**; [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
engineering smoke **PASS**; **independent audit still PENDING**.

Owner (canonical): `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`  
AAC production proxy (Base): `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`  
Settler implementation: `0x3085216E8329eF7d10c914cB1C43Cd8168f53442`  
Cover: `0x01506527a4Dab14141038Db15f5341dcF4729233`  
CoNET finality (Base): `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`  
Consume-once: `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F`  
TreasuryBridgeV3: `0xa208982212978550594A7FEEB70a61665d129003`  
GB ERC-20: `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8`

---

## Hard stop

Do **not** execute any phase below until:

1. Independent audit of gates 1–5 is **Accepted** in writing (attach link or
   hash to this file in a later commit).
2. The same user message that authorizes cutover **names** the phase(s) and
   the exact role-grant / disable transactions.
3. `critical-chain-infra-restart-requires-approval.mdc` — no EL/CL restart as
   part of cutover.

Unpause of historical canaries is **out of scope** for this proposal.

---

## Phase map

| Phase | Intent | Execute now? |
| --- | --- | --- |
| **A** | Read-only preflight (roles, pause, bindings) | Allowed as ops checklist; no writes |
| **B** | Grant AAC proxy the **minimum** Treasury / GB roles needed for AAC mint/release only | **No** — needs audit + explicit auth |
| **C** | Bounded AAC canary (amount ceiling, known aacId) | **No** |
| **D** | Disable or drain miner `voteBridgeOperation` / `voteBridgeMint` paths | **No** — only after C success |
| **E** | Monitor + rollback criteria | Post-cutover ops |

Miner votes stay **live** through Phases A–C. Do not disable miner votes before
a successful AAC canary.

---

## Phase A — Preflight (checklist only)

Record live reads before any grant:

| Read | Pass criteria |
| --- | --- |
| Proxy `custodyOpen` / `headerFinal` | Both `false` until a future settler upgrade under a new gate opens them |
| Proxy `owner` | Matches owner above |
| EIP-1967 impl | Settler address above |
| Treasury / GB `hasRole` for AAC proxy | Expected **false** today for mint/release authority |
| Miner vote entrypoints | Still the production bridge |
| Assurance smoke | Re-run §2 of `PRODUCTION-ASSURANCE.md` |

---

## Phase B — Role grants (NOT EXECUTED)

**Principle:** grant roles to the **AAC proxy** (or the documented gateway that
only the consume-once / settler path can call), never to arbitrary miner EOAs.

Exact selector / role names must be taken from live TreasuryBridgeV3 /
GBToken ABI at cutover time (do not invent from memory). Proposed intent:

1. On CoNET and/or Base as required by the asset route: grant the AAC
   destination adapter **only** the mint/release privilege required for
   AAC-verified consumes.
2. Verify with `hasRole` / equivalent that the proxy can call the intended
   path and that unrelated admin mint paths remain closed or owned by
   governance.
3. Do **not** grant Peer unlimited mint; do **not** restore paused canaries.

**This phase was not broadcast in the 2026-10-14 assurance task.**

---

## Phase C — Bounded canary (NOT EXECUTED)

Suggested ceiling (product to confirm at auth time): a single small USDC or
paid-GB AAC whose amount is documented in the authorizing message.

Halt immediately if:

- amount or recipient mismatch;
- double consume succeeds;
- settle opens without audit-approved bytecode change;
- Treasury/GB balance moves outside the canary envelope.

---

## Phase D — Miner-vote cutover (NOT EXECUTED)

Only after Phase C success and a separate written approval:

1. Disable or route away `voteBridgeOperation` / `voteBridgeMint` for the
   assets now served by AAC.
2. Keep a documented emergency re-enable path owned by the same owner /
   multisig.
3. Update GitBook + `PRODUCTION-CUSTODY-GATES.md` cutover Accepted section in
   the **same** task as the on-chain change.

---

## Phase E — Rollback

| Symptom | Action |
| --- | --- |
| Canary mismatch / double spend attempt | Pause AAC gateway / revoke Phase B roles; leave miner votes live |
| Settler unexpectedly opens | Owner upgrade to closed impl; do not grant further roles |
| Independent audit finds gate defect | Freeze cutover; re-open gates document |

---

## Explicit non-execution record (2026-10-14)

| Action | Status |
| --- | --- |
| Treasury role grant to AAC proxy | **Not sent** |
| GB role grant to AAC proxy | **Not sent** |
| Peer role grant | **Not sent** |
| Miner vote disable | **Not sent** |
| Canary mint / release | **Not sent** |
| Historical canary unpause | **Not sent** |

Custody remains closed. Production USDC/GB continue on the miner-vote bridge
until Phases B–D are authorized and completed.

---

## Related

- [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
- [PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md)
