# Production assurance (post Obstacles 1–5)

**Date:** 2026-10-14 (initial); Phase A re-run **2026-10-15**  
**Repo HEAD (evidence):** `83bb39b` (initial); Phase A re-run at `a44b907`  
**Scope:** Independent assurance package after
[PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md) Obstacles 1–5 Accepted.  
**Custody:** remains **closed**. This document does **not** authorize Treasury /
GB / Peer role grants, mint, release, settlement broadcasting, miner-vote
cutover, or unpause of any historical canary.

Cutover: [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) — Phase A **recorded**
(2026-10-15); Phases B–D **not executed**.

---

## Verdict

| Track | Status |
| --- | --- |
| Local adversarial + full Rust test suite | **PASS** (`cargo test --tests` → **107** passed, **0** failed; reconfirmed 2026-10-15 at `a44b907`) |
| Live Base fail-closed smoke (proxy settler) | **PASS** (initial + Phase A re-run 2026-10-15) |
| Cutover Phase A (read-only preflight) | **RECORDED** — see [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase A evidence |
| Small canary mint / release / unpause | **NOT RUN** (custody closed; not authorized) |
| Independent third-party security audit | **PENDING** (checklist below; no external sign-off in-repo) |
| Role grant / miner-vote cutover | **NOT EXECUTED** — Phase B+ still blocked on audit |

**Independent audit is not Passed.** Engineering assurance evidence is recorded
here so an external auditor can verify gates 1–5 without relying on chat logs.
Until that audit is Accepted in writing, cutover stay closed.

---

## 1. End-to-end / state-machine assurance (local)

Commands (clean tree, `src/bridgeAAC`):

```bash
cargo test --test adversarial
cargo test --tests
```

Recorded on 2026-10-14 at HEAD `83bb39b`:

| Suite / filter | Result |
| --- | --- |
| `adversarial` | 5 passed, 0 failed |
| Full `--tests` (unit + integration) | **107** passed, **0** failed |

Covered themes (suite names): adversarial fail-closed paths, e2e-style flows,
`finality_phase2`, `proof_builder`, `shadow_phase5`, `shadow_service`,
`state_machine`, plus library unit tests.

These tests exercise the Rust AAC state machine, Shadow observer, and proof
helpers. They do **not** mint or release on CoNET/Base, and they do **not**
grant Treasury / GB roles.

---

## 2. Fault / fail-closed (live Base)

RPC: `https://base-rpc.conet.network` (chainId `8453`).  
Production proxy: `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`.

| Check | Expected | Observed |
| --- | --- | --- |
| `custodyOpen()` | `false` | `false` |
| `headerFinal()` | `false` | `false` |
| `owner()` | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` | match |
| `COVER()` | `0x01506527a4Dab14141038Db15f5341dcF4729233` | match |
| `CONET_FINALITY()` | `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` | match |
| EIP-1967 implementation | Settler `0x3085216E8329eF7d10c914cB1C43Cd8168f53442` | match |
| `settle()` (no args) | revert `CustodyClosed()` (`0x61839255`) | revert data `0x61839255` |
| Consume-once `isConsumed(bytes32(0))` at `0xC6CBcC0c…` | `false` | `false` |

Parameterless calls to cover / consumer views that require calldata may revert;
that is expected and is not part of the fail-closed settler smoke.

**ASSURANCE_SMOKE: PASS** — proxy remains closed; settle path cannot open
custody via the no-arg entry.

**Re-run (2026-10-15, HEAD `a44b907`):** same eight checks **PASS** again as
part of [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase A. Additional CoNET/Base
GB `admins(AAC proxy) == false` and `gb-mint-authority` (custody closed;
admin-mint selectors still open on GBToken; vote-mint `no-validators`) are
recorded in that Phase A evidence table — not a role grant.

---

## 3. Rollback posture (documentation)

| Layer | Rollback / hold behavior |
| --- | --- |
| UUPS proxy `0x9051…` | Owner may `upgradeTo` a closed implementation; storage layout must stay append-only (Obstacle 5). |
| Settler | `custodyOpen` / `headerFinal` pure `false`; `settle` reverts `CustodyClosed` until a **future** accepted cutover changes that contract under a new gate. |
| Consume-once | Second consume / reentrancy / failed effect already rejected on-chain under Obstacle 4 evidence. |
| Miner votes | Remain the **live** bridge until cutover; no need to roll back AAC for production USDC/GB today. |
| Shadow | Read-only observer; stop/restart does not affect custody. |

No production rollback tx was sent as part of this assurance run.

---

## 4. Independent audit checklist (external — PENDING)

An independent auditor should confirm at least:

1. **Gate evidence integrity** — Obstacles 1–5 in `PRODUCTION-CUSTODY-GATES.md`
   match live Base addresses, Sourcify / explorer verification, and repo commits
   cited there (including settler `83bb39b` / Obstacle 5).
2. **Fail-closed settler** — `custodyOpen`/`headerFinal` false; `settle()`
   selector path reverts `CustodyClosed`; COVER and CONET_FINALITY bindings
   cannot be swapped by a non-owner.
3. **Consume-once** — second consume, reentrancy, failed effect, and layout
   rejection behave as documented; no Treasury/GB mint authority on the consumer.
4. **Finality adapters** — Base cover and CoNET finality views do not imply
   `trusted-committee yes` or open mint; Shadow / observer commands remain
   non-authoritative for custody.
5. **Cutover blast radius** — proposed role grants in `CUTOVER-CUSTODY.md`
   target **only** the AAC proxy (never miner EOAs as minters); miner-vote
   disable is sequenced after AAC canary, not before.
6. **No silent unpause** — historical canaries stay paused; unpause is out of
   scope for this cutover proposal.

**Status:** PENDING external written acceptance. Do not mark this row Passed
in-repo without that artifact.

---

## 5. Small canary (NOT AUTHORIZED)

A production canary would require, in a later task with explicit owner
authorization:

1. Independent audit Accepted.
2. Cutover Phase A–B role grants executed and verified on-chain.
3. A bounded AAC mint or release amount with a documented ceiling.
4. Immediate halt criteria (revert rates, wrong amount, double consume).

**This assurance run did not execute any canary mint, release, or unpause.**

---

## 6. Explicit non-claims

- Obstacles 1–5 Accepted ≠ custody open.
- 107 local tests ≠ third-party audit.
- Fail-closed smoke ≠ permission to grant roles.
- GitBook / whitepaper sync ≠ cutover.

---

## Related

- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)
- [PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md)
- [WHITEOBER.md](WHITEOBER.md) / [WHITEPAPER.md](WHITEPAPER.md)
- GitBook: [AAC proof-driven cross-chain settlement](https://gitbook.conet.network/l1/aac-cross-chain.html)
