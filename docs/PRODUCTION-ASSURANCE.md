# Production assurance (post Obstacles 1–5)

**Date:** 2026-10-14 (initial); Phase A re-run **2026-10-15**; Phase C
**EXECUTED 2026-10-15**; Phase D **EXECUTED 2026-10-15**  
**Repo HEAD (evidence):** `83bb39b` (initial); Phase A re-run at `a44b907`  
**Scope:** Independent assurance package after
[PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md) Obstacles 1–5 Accepted.  
**Custody:** remains **closed** for production settle. Phase C proved
one-shot AAC-proxy `mintPaid` for **0.01 paid GB** only. Phase D paused
paid-GB `voteBridgeMint` (`setBridgePaused(true)` CoNET + Base). This
document does **not** authorize Treasury USDC vote disable, Treasury grants
to AAC, or unpause of any historical canary.

Cutover: [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) — Phase A **recorded**;
Phase B GB **executed** (2026-10-15); Phase C canary **EXECUTED** (2026-10-15;
0.01 GB); Phase D **EXECUTED** (2026-10-15; paid-GB pause).

---

## Verdict

| Track | Status |
| --- | --- |
| Local adversarial + full Rust test suite | **PASS** (`cargo test --tests` → **107** passed, **0** failed; reconfirmed 2026-10-15 at `a44b907`) |
| Live Base fail-closed smoke (proxy settler) | **PASS** (initial + Phase A re-run 2026-10-15; settle still reverts after Phase C upgrade) |
| Cutover Phase A (read-only preflight) | **RECORDED** — see [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase A evidence |
| Small canary mint (paid GB) | **EXECUTED** — Phase C C0/C1/C2 (0.01 GB to OWNER); see §5 |
| Independent third-party security audit | **WAIVED BY OWNER 2026-10-14** (checklist retained below for optional use) |
| Third-party / Shadow acceptance as cutover hard stop | **WAIVED BY OWNER 2026-10-14** (same message) |
| Role grant / miner-vote cutover | Phase B GB `addAdmin(AAC)` **EXECUTED**; Phase C canary **EXECUTED**; Phase D paid-GB `setBridgePaused(true)` **EXECUTED** (Treasury USDC vote untouched) |

**Independent audit / third-party acceptance are no longer hard stops** (owner
waive 2026-10-14: 「请跳过 第三方验收与独立审计 步骤，不在需要独立审计，直接进入下一个生产部署的阻碍」).
Engineering assurance evidence remains recorded. **Custody stays closed**
for settle (still reverts). Phase C one-shot `canaryMintPaid` is spent.
Paid-GB miner `voteBridgeMint` is paused. **Next production obstacle:**
Phase E monitor / rollback ops (and any future settle-open / USDC cutover).

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
| EIP-1967 implementation | Obstacle 5 Settler `0x3085216E8329eF7d10c914cB1C43Cd8168f53442` (Phase A); live after Phase C → SettlerCanary `0x9b8DDa3d27473A4EdD351fFD4106c388876A9864` | Phase A match; Phase C upgraded |
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
| Miner votes | Paid-GB `voteBridgeMint` **paused** (Phase D); USDC `voteBridgeOperation` still live. No need to roll back AAC for production USDC today. |
| Shadow | Read-only observer; stop/restart does not affect custody. |

No production rollback tx was sent as part of this assurance run.

---

## 4. Independent audit checklist (external — WAIVED)

**Owner waive (2026-10-14):** independent audit and third-party / Shadow
acceptance are **no longer required** before Cutover Phase B. The checklist
and [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) runbook remain for optional
engagement; do **not** invent a Passed acceptance artifact.

If an auditor is engaged anyway, they should confirm at least:

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

**Status:** **WAIVED BY OWNER 2026-10-14** as a production hard stop. Phase B
B1/B2, Phase C C1/C2, and Phase D paid-GB pause were later **named and
executed** (2026-10-15). Next blocker: [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)
**Phase E** (monitor / rollback) and any future settle-open or USDC vote
cutover.

---

## 5. Small canary (EXECUTED 2026-10-15)

Phase C **EXECUTED** (owner: 「继续执行 C1（upgradeTo）/ C2（canaryMintPaid）,amount 为0.01」).
Evidence: [deployments/phase-C-canary-prep.json](../deployments/phase-C-canary-prep.json).

| Step | Result |
| --- | --- |
| C0 deploy SettlerCanary | `0x9b8DDa3d…9864` (tx `0x0f609b3a…3994`) |
| C1 `upgradeTo` | tx `0x252c560f…4673` |
| C2 `canaryMintPaid(OWNER, 10000000, aacId)` | tx `0x386d253e…483a`; OWNER GB `0 → 10000000` |
| Post-check | `canaryMintCompleted()=true`; settle still reverts; `admins(AAC)=true` |

Envelope: amount `10000000` (0.01 paid GB), aacId
`0x166dca2560308688f371222e4b7ef51ed2ae1ac427671ec95b537314d547da56`, to OWNER.
Second `canaryMintPaid` must revert `CanaryAlreadyDone`. Historical canary
unpause was **not** sent.

---

## 6. Explicit non-claims

- Obstacles 1–5 Accepted ≠ custody open.
- Phase B GB `admins(AAC)` ≠ open settle.
- Phase C 0.01 paid-GB canary ≠ open settle / USDC mint.
- Phase D paid-GB `setBridgePaused(true)` ≠ Treasury USDC vote disable / open settle.
- Owner waive of audit ≠ open settle.
- 107 local tests ≠ permission to open custody.
- Fail-closed smoke ≠ permission to open settle.
- GitBook / whitepaper sync ≠ open settle.

---

## Related

- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)
- [PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md)
- [WHITEOBER.md](WHITEOBER.md) / [WHITEPAPER.md](WHITEPAPER.md)
- GitBook: [AAC proof-driven cross-chain settlement](https://gitbook.conet.network/l1/aac-cross-chain.html)
