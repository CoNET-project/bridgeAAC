# Custody cutover

**Date:** 2026-10-14 (updated 2026-10-15 Phase B–E)  
**Status:** Phase A **RECORDED**; Phase B GB `addAdmin(AAC)` **EXECUTED**
(2026-10-15). Phase C bounded paid-GB canary **EXECUTED** (2026-10-15;
C0/C1/C2 — 0.01 GB to OWNER). Phase D **EXECUTED** (2026-10-15) —
`GB.setBridgePaused(true)` on CoNET + Base for paid-GB `voteBridgeMint`;
Treasury `voteBridgeOperation` **not** touched (USDC). Phase E monitor
baseline **RECORDED HEALTHY** (2026-10-15; read-only). No historical canary
unpause.  
**Precondition:** [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
Obstacles 1–5 **Accepted**; [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
engineering smoke **PASS**; **independent audit + third-party acceptance
WAIVED BY OWNER 2026-10-14** (see Hard stop). Runbook retained for optional
use: [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md).

Owner (canonical): `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`  
AAC production proxy (Base): `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`  
SettlerCanary implementation (live EIP-1967): `0x9b8DDa3d27473A4EdD351fFD4106c388876A9864`  
Prior Settler implementation: `0x3085216E8329eF7d10c914cB1C43Cd8168f53442`  
Cover: `0x01506527a4Dab14141038Db15f5341dcF4729233`  
CoNET finality (Base): `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`  
Consume-once: `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F`  
TreasuryBridgeV3: `0xa208982212978550594A7FEEB70a61665d129003`  
GB ERC-20: `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8`

---

## Hard stop

Do **not** execute any phase below until:

1. ~~Independent audit of gates 1–5 Accepted~~ — **WAIVED BY OWNER 2026-10-14**
   (same message also waived third-party / Shadow acceptance as a cutover hard
   stop; quote: 「请跳过 第三方验收与独立审计 步骤，不在需要独立审计，直接进入下一个生产部署的阻碍」).
2. The same user message that authorizes cutover **names** the phase(s) and
   the exact role-grant / disable transactions (calldata / Explorer links — not
   a blanket “continue”).
3. `critical-chain-infra-restart-requires-approval.mdc` — no EL/CL restart as
   part of cutover.

Unpause of historical canaries is **out of scope** for this proposal.

**Next production obstacle:** any future **settle-open** gate and/or Treasury
USDC `voteBridgeOperation` cutover (requires new Accepted owner auth). Phase E
monitor baseline was recorded HEALTHY 2026-10-15 (owner: 「请 继续 Phase E」).
Phase D was named and broadcast 2026-10-15 (owner: 「请push,然后执行 Phase D」).
Phase C C1/C2 were named 2026-10-15 (owner:
「继续执行 C1（upgradeTo）/ C2（canaryMintPaid）,amount 为0.01」).

Evidence: [deployments/phase-B-gb-addAdmin-aac.json](../deployments/phase-B-gb-addAdmin-aac.json),
[deployments/phase-C-canary-prep.json](../deployments/phase-C-canary-prep.json)
(`status: EXECUTED`),
[deployments/phase-D-gb-setBridgePaused.json](../deployments/phase-D-gb-setBridgePaused.json),
[deployments/phase-E-monitor-baseline.json](../deployments/phase-E-monitor-baseline.json)
(`status: HEALTHY`).

---

## Phase map

| Phase | Intent | Execute now? |
| --- | --- | --- |
| **A** | Read-only preflight (roles, pause, bindings) | **RECORDED** (2026-10-15) |
| **B** | Grant AAC proxy the **minimum** GB `admins` (and later Treasury if a live setter is named) for AAC mint/release only | **EXECUTED** (GB only; 2026-10-15) |
| **C** | Bounded AAC paid-GB canary (amount ceiling, known aacId) | **EXECUTED** (2026-10-15; 0.01 GB) |
| **D** | Pause paid-GB miner `voteBridgeMint` (`GB.setBridgePaused(true)`); leave Treasury USDC vote live | **EXECUTED** (2026-10-15; CoNET + Base) |
| **E** | Monitor + rollback criteria (read-only baseline) | **RECORDED HEALTHY** (2026-10-15) |

Miner GB votes stayed **live** through Phases A–C. Phase D paused only paid-GB
`voteBridgeMint`. USDC `TreasuryBridgeV3.voteBridgeOperation` remains live.

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

### Phase A evidence (2026-10-15) — RECORDED

**Status:** Phase A **completed** (read-only). No grants, no mint/release, no
miner-vote disable, no unpause. Repo HEAD at record time: `a44b907`.  
RPC: Base `https://base-rpc.conet.network`; CoNET `https://rpc1.conet.network`.

| Read | Observed | Pass? |
| --- | --- | --- |
| Proxy `custodyOpen()` | `false` | yes |
| Proxy `headerFinal()` | `false` | yes |
| Proxy `owner()` | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` | yes |
| Proxy `COVER()` | `0x01506527a4Dab14141038Db15f5341dcF4729233` | yes |
| Proxy `CONET_FINALITY()` | `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` | yes |
| EIP-1967 implementation | `0x3085216E8329eF7d10c914cB1C43Cd8168f53442` | yes |
| `settle()` (no args) | revert `CustodyClosed` (`0x61839255`) | yes |
| Consume-once `isConsumed(bytes32(0))` | `false` | yes |
| CoNET GB `admins(AAC proxy)` | `false` (`0x0`) | yes |
| Base GB `admins(AAC proxy)` | `false` (`0x0`) | yes |
| CoNET GB `bridge-aac gb-mint-authority` | `admin-mint open`, `vote-mint no-validators`, `validator-count 0`, `mint-closed no`, `custody-gate no`, `custody closed` | yes (AAC still has no GB mint authority; miner path selectors remain live) |
| Local `cargo test --tests` | **107** passed, **0** failed | yes |
| Assurance smoke §2 re-run | Same closed proxy criteria as above | **PASS** |

TreasuryBridgeV3 does not expose `isAdmin` / AccessControl `hasRole` for the
AAC proxy on either chain (calls revert). GB `admins(address)` is the live
admin map used for this preflight; AAC proxy is **not** an admin on CoNET or
Base.

**Next hard stop (2026-10-14):** Independent audit / third-party acceptance
**waived by owner**. Phase B GB grants were **named and executed** 2026-10-15.
Do not invent Passed audit artifacts. Treasury / Peer grants remain **NOT
EXECUTED**.

---

## Phase B — Role grants (GB EXECUTED 2026-10-15)

**Principle:** grant roles to the **AAC proxy** (or the documented gateway that
only the consume-once / settler path can call), never to arbitrary miner EOAs.

| Grant | Target | Status |
| --- | --- | --- |
| Treasury mint/release | AAC proxy `0x9051…` | **NOT EXECUTED** — no live `isAdmin`/`hasRole` setter named; do not invent |
| GB `admins` → `mintPaid` / `mint` / `burnPaidFrom` | AAC proxy `0x9051…` | **EXECUTED** — B1 + B2 below |
| Peer mint (developer ERC-20) | AAC proxy `0x9051…` | **NOT EXECUTED** (only if product scope includes unbound ERC-20) |

Live post-grant (2026-10-15, CoNET `rpc1` + Base `base-rpc`):

| Check | CoNET | Base |
| --- | --- | --- |
| GB `admins(AAC)` `0x429b62e5` | `true` | `true` |
| GB `admins(OWNER)` | `true` | `true` |
| GB `owner()` | reverts (admin map) | reverts |
| GBToken | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` | same |
| Settler `settle()` | — | still reverts (custody closed) |

Source: `src/b-unit/GBToken.sol` / `GBTokenV2.sol` — `addAdmin(address)` is
`onlyAdmin` (`0x70480275`); paid mint is `mintPaid` (`0x970cab06`).

Script: `scripts/grantGbAdminAacPhaseB.mjs`. Snapshot:
`deployments/phase-B-gb-addAdmin-aac.json`.

### Phase B txs (GB only — SENT)

Signer: OWNER `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` (existing GB admin).
Owner auth: 「请继续 执行 B1/B2」 (2026-10-14 PDT / 2026-10-15 UTC).

| # | Chain | To | Function | Tx | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | CoNET `224422` | GB `0xC3EF02…10838D8` | `addAdmin(AAC)` | [`0x0cea0239…603604`](https://mainnet.conet.network/tx/0x0cea02390f02594a722f9ff90d1e45219332fd509dca6f104996608d32603604) block `1716737` | **SENT · verified** |
| B2 | Base `8453` | same GB | same `addAdmin(AAC)` | [`0xc41287df…eca336a`](https://basescan.org/tx/0xc41287df1815ed9b8bd88fa4bdf3639823c2a674dc5def65d19941f78eca336a) block `52618294` | **SENT · verified** |

Calldata (both): `0x704802750000000000000000000000009051e08aba3ec1a1323f36f0f5c3745c81912aad`.

**Post-grant verify (done):** CoNET + Base `admins(AAC)==true`; Settler still
closed (`settle` reverts); consume-once still only records marks until a
gateway calls `mintPaid`. **No** Peer unlimited mint; **no** canary unpause;
**no** miner-vote cutover in this phase.

---

## Phase C — Bounded canary (EXECUTED 2026-10-15)

**Status:** **EXECUTED**. Owner named C1/C2 with amount `0.01`
(「继续执行 C1（upgradeTo）/ C2（canaryMintPaid）,amount 为0.01」). Envelope
matched prep ceiling / aacId / to. Snapshot:
[deployments/phase-C-canary-prep.json](../deployments/phase-C-canary-prep.json)
(`status: EXECUTED`).

### Why a new gateway

Phase B put GB `admins` on AAC proxy `0x9051…`, but live Obstacle 5 settler
only emits `Settled` after COVER / `rootReady` — it never calls `mintPaid`.
Consume-once OkEffect is empty. An Effect that called GB would be the wrong
`msg.sender`. Phase C upgraded the proxy to
`AacProductionCustodyGateSettlerCanary`, which keeps settle gate-only and adds
an **owner one-shot** `canaryMintPaid(to, amount, aacId)` that calls
`GB.mintPaid` so `msg.sender` is the AAC proxy.

### Executed envelope

| Field | Value |
| --- | --- |
| Asset | **Paid GB** (not USDC — no live Treasury setter) |
| Chain | Base `8453` |
| Ceiling | `CANARY_MAX_AMOUNT = 10_000_000` (0.01 GB @ 9 decimals) |
| Amount | `10_000_000` (0.01 GB — owner-named) |
| aacId | `0x166dca2560308688f371222e4b7ef51ed2ae1ac427671ec95b537314d547da56` |
| `to` | OWNER `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Canary impl | `0x9b8DDa3d27473A4EdD351fFD4106c388876A9864` |
| Contract | `contracts/AacProductionCustodyGateSettlerCanary.sol` |
| Script | `scripts/preparePhaseCCanary.mjs` (`PHASE_C_EXECUTE=1`) |

### On-chain steps (broadcast)

| # | Action | Tx / result |
| --- | --- | --- |
| C0 | Deploy SettlerCanary impl | `0x0f609b3a…3994` → `0x9b8DDa3d…9864` (block `52618795`) |
| C1 | `upgradeTo(canaryImpl)` on `0x9051…` | `0x252c560f…4673` (block `52618798`) |
| C2 | `canaryMintPaid(OWNER, 10000000, aacId)` | `0x386d253e…483a` (block `52618800`); OWNER GB `0 → 10000000` |

### Post-execute verify (read-only)

| Check | Result |
| --- | --- |
| EIP-1967 impl | `0x9b8DDa3d…9864` |
| `canaryMintCompleted()` | `true` |
| `canaryRecord()` | aacId / to / amount / done match envelope |
| `GB.admins(proxy)` | still `true` |
| `settle` | still reverts (custody closed for production settle) |

Second `canaryMintPaid` must revert `CanaryAlreadyDone`. Settle remains closed
without a separately Accepted settler bytecode change. USDC / Peer / miner-vote
paths were not touched.

---

## Phase D — Miner-vote cutover (EXECUTED 2026-10-15)

**Scope decision:** Phase C served **paid GB only**. Phase D therefore pauses
**GB** `voteBridgeMint` via `setBridgePaused(true)` on CoNET and Base. It does
**not** disable Treasury `voteBridgeOperation` (USDC still miner-vote).

### Phase D evidence (2026-10-15) — EXECUTED

Script: [scripts/pauseGbVoteBridgeMintPhaseD.mjs](../scripts/pauseGbVoteBridgeMintPhaseD.mjs)  
JSON: [deployments/phase-D-gb-setBridgePaused.json](../deployments/phase-D-gb-setBridgePaused.json)

| Chain | Tx | Block | `bridgePaused()` |
| --- | --- | --- | --- |
| CoNET `224422` | `0x3a0c47577076fe65ab42ed3759be8aca9992fba4ef04568a12ba2aa537968040` | `1717104` | `true` |
| Base `8453` | `0xd0732bdebadd70b83a116b71937020ba50a75df2ed135cd8ab0c20097e5ac4f0` | `52619394` | `true` |

Preflight on both chains: `admins(OWNER)=true`, `admins(AAC)=true`,
`validatorCount=0`, `requiredVotes=0` (votes already inert; pause still set
explicitly for cutover).

| Item | Status |
| --- | --- |
| Emergency re-enable | `GB.setBridgePaused(false)` by same GB admin / owner |
| Treasury `voteBridgeOperation` | **NOT TOUCHED** |
| AAC `settle` / custody | Still closed (`CustodyClosed`) |
| AAC `mintPaid` (admin path) | Still available to AAC proxy (pause does not block admin mint) |

---

## Phase E — Monitor + rollback (RECORDED HEALTHY 2026-10-15)

**Status:** **RECORDED HEALTHY**. Read-only post-D baseline. No on-chain writes.
Script: `node scripts/monitorPhaseE.mjs` →
[deployments/phase-E-monitor-baseline.json](../deployments/phase-E-monitor-baseline.json).

### Healthy baseline (must all hold)

| Check | Live expectation |
| --- | --- |
| AAC `custodyOpen` / `headerFinal` | Both `false` |
| AAC EIP-1967 impl | SettlerCanary `0x9b8D…9864` |
| AAC `canaryMintCompleted` + `canaryRecord` | Spent; `aacId` / `to` / `amount=10000000` match Phase C |
| AAC `settle()` | Reverts `CustodyClosed` (`0x61839255`) |
| GB `admins(OWNER)` + `admins(AAC)` | `true` on CoNET + Base |
| GB `bridgePaused` | `true` on CoNET + Base (paid-GB `voteBridgeMint`) |

### Rollback criteria (runbook only until symptom Accepted)

| Symptom | Action |
| --- | --- |
| Canary mismatch / double-spend attempt | Pause AAC gateway / revoke Phase B GB `admins(AAC)`; leave USDC miner votes live |
| Settler unexpectedly opens | Owner `upgradeTo` closed Settler `0x3085…3442`; do not grant further roles |
| Post-waive gate defect / bad grant | Freeze cutover; revoke Phase B GB `admins` if granted; re-open gates document |

Emergency re-enable paid-GB miner vote: `GB.setBridgePaused(false)` by same GB
admin/owner — **Accepted only**. Treasury USDC is **not** Phase E scope.

Re-run: `node scripts/monitorPhaseE.mjs` (exit `0` = HEALTHY; exit `2` = SYMPTOM).

---

## Explicit non-execution / execution record (updated 2026-10-15 Phase E)

| Action | Status |
| --- | --- |
| Treasury role grant to AAC proxy | **Not sent** |
| GB role grant to AAC proxy | **EXECUTED** (Phase B B1/B2 — see above) |
| Peer role grant | **Not sent** |
| Paid-GB miner `voteBridgeMint` pause (`setBridgePaused(true)`) | **EXECUTED** (Phase D — CoNET + Base; see above) |
| Treasury USDC `voteBridgeOperation` disable | **Not sent** (USDC not served by AAC) |
| Phase C canary mint / release / proxy upgrade | **EXECUTED** (C0/C1/C2 — 0.01 paid GB; see above) |
| Phase E monitor baseline | **RECORDED HEALTHY** (read-only; see above) |
| Historical canary unpause | **Not sent** |

Custody remains closed for production settle. Production **USDC** continues on
the miner-vote Treasury bridge. Paid-GB miner `voteBridgeMint` is **paused**;
AAC-proxy admin `mintPaid` remains the AAC canary path. Settle still reverts.

---

## Related

- [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
- [PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md)
