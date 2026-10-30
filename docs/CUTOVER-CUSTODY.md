# Custody cutover

**Date:** 2026-10-14 (updated 2026-10-15 Phase B–E + F1–F7)  
**Status:** Phase A **RECORDED**; Phase B GB `addAdmin(AAC)` **EXECUTED**
(2026-10-15). Phase C bounded paid-GB canary **EXECUTED** (2026-10-15;
C0/C1/C2 — 0.01 GB to OWNER). Phase D **EXECUTED** (2026-10-15) —
`GB.setBridgePaused(true)` on CoNET + Base for paid-GB `voteBridgeMint`;
Treasury `voteBridgeOperation` **closed** (2026-10-15; `voteBridgeClosed=true` on Base and CoNET; USDC deposits that use that vote are stopped). Phase E monitor
baseline **RECORDED HEALTHY** (2026-10-15; read-only). Audit F1–F7 under
owner auth 「请依据审计报告, 依次移除生产前障碍」: **F1–F3 EXECUTED**,
**F4 RUNBOOK+SCRIPT READY**, **F5 EXECUTED** (SettlerF5 + GB.admins re-grant),
**F6 EXECUTED** (miner `voteBridgeOperation` closed; USDC deposits on that path stopped; no AAC Treasury grant),
**F7 partial** (48h upgrade timelock + `transferOwnership` live; Owner still EOA).
Security gaps (2026-10-15): instant `upgradeTo` on AAC, CheckpointRoot, and
CoNET finality is closed; `mintTo` must be the receipt's single beneficiary.
No historical canary unpause.  
**Precondition:** [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
Obstacles 1–5 **Accepted**; [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
engineering smoke **PASS**; **independent audit + third-party acceptance
WAIVED BY OWNER 2026-10-14** (see Hard stop). Runbook retained for optional
use: [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md).

Owner (canonical): `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`  
AAC production proxy (Base): `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`  
Live EIP-1967 Settler (**F7**): `0x29e10621fF159422237d2a0B9F020303F9BDdD12`  
Prior Settler (F5): `0xa1aa63BF44128E9f14260886263c8775C4A2dA00`  
Prior Settler (F3): `0xf131359EE46d261B91cEedE8772DE18fB821B2b0`  
Prior Settler (F2): `0xeC19d84625edA6213F3126033B66397633d8688F`  
Prior closed Settler (F1): `0x3085216E8329eF7d10c914cB1C43Cd8168f53442`  
Retired SettlerCanary: `0x9b8DDa3d27473A4EdD351fFD4106c388876A9864`  
Cover: `0x01506527a4Dab14141038Db15f5341dcF4729233`  
CoNET inclusion (F2): `0x7064860E3594aE120f71700B2F46151c6D370559`  
CoNET finality (Base): `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`  
Consume-once proxy: `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F`  
Consume-once impl (F3): `0x75aC7020976C6048FCB2bb8741fCA72e2d1cA598`  
CheckpointRoot (period 1883): `0xcEE3D699df3df07a573f1aFf642888B97B7aA961`  
TreasuryBridgeV3: `0xa208982212978550594A7FEEB70a61665d129003`  
GB ERC-20: `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8`  
GB `admins(AAC)`: **true** on CoNET + Base after F5

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

**Remaining production-front obstacle:** SettlerF7c
`0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44` is scheduled on the live F7
proxy. `upgradeTo` is allowed only after **2026-10-17T13:25:41Z**, then
`repairCanaryRecord()`. Do not call `scheduleUpgrade` again. The Base → CoNET
0.01 USDC receipt is covered and settled. `sourceInitiateOpen` is true on Base and CoNET. CoNET destination `224422` stays
closed. The owner-to-multisig handoff is withdrawn. AAC Owner stays the EOA
`0x87cAeD…05E1`. Treasury `miners()` on Base and CoNET is that same EOA only.
F6 vote close is **EXECUTED**. Phase E HEALTHY (2026-10-15).

Evidence: [deployments/phase-B-gb-addAdmin-aac.json](../deployments/phase-B-gb-addAdmin-aac.json),
[deployments/phase-C-canary-prep.json](../deployments/phase-C-canary-prep.json)
(`status: EXECUTED`),
[deployments/phase-D-gb-setBridgePaused.json](../deployments/phase-D-gb-setBridgePaused.json),
[deployments/phase-E-monitor-baseline.json](../deployments/phase-E-monitor-baseline.json)
(`status: HEALTHY`),
[deployments/phase-F4-committee-rotate.json](../deployments/phase-F4-committee-rotate.json)
(`status: RUNBOOK_READY`),
[deployments/phase-F1-off-canary.json](../deployments/phase-F1-off-canary.json),
[deployments/phase-F2-conet-inclusion.json](../deployments/phase-F2-conet-inclusion.json),
[deployments/phase-F3-settle-consume.json](../deployments/phase-F3-settle-consume.json),
[deployments/phase-F5-settle-open.json](../deployments/phase-F5-settle-open.json)
(`ok:true`),
[deployments/phase-F6-usdc.json](../deployments/phase-F6-usdc.json)
(`status: BLOCKED`),
`{OWNER_KEY_FILE}`
(`status: BLOCKED`).

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
`voteBridgeMint`. USDC `TreasuryBridgeV3.voteBridgeOperation` was later **closed** (`voteBridgeClosed=true`, 2026-10-15).

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
| GB proxy | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` | same |
| Settler `settle()` | — | still reverts (custody closed) |

Source: `src/b-unit/GBToken.sol` (Base) / `GBTokenV2.sol` (CoNET) — `addAdmin(address)` is
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
| Treasury `voteBridgeOperation` | **CLOSED** (`voteBridgeClosed=true`, 2026-10-15) |
| AAC `settle` / custody | Still closed (`CustodyClosed`) |
| AAC `mintPaid` (admin path) | Still available to AAC proxy (pause does not block admin mint) |

---

## Phase E — Monitor + rollback (RECORDED HEALTHY 2026-10-15)

**Status:** **RECORDED HEALTHY**. Read-only post-D baseline. No on-chain writes.
Script: `node scripts/monitorPhaseE.mjs` →
[deployments/phase-E-monitor-baseline.json](../deployments/phase-E-monitor-baseline.json).

### Healthy baseline (must all hold)

> **Post-F1–F3 note:** Phase E baseline below was recorded while SettlerCanary
> was live and `admins(AAC)=true`. After F1–F3 the live expectations are:
> EIP-1967 = F3 Settler `0xf131…B2b0`; ConsumeOnce impl `0x75aC…A598` with
> gateway=AAC; `admins(AAC)=false`; no-arg `settle()` still reverts
> `CustodyClosed`; F3 settle proves COVER then `consumeFromSettler` same tx
> (mark only until F5 re-grants GB admin).

| Check | Live expectation (as of Phase E record) |
| --- | --- |
| AAC `custodyOpen` / `headerFinal` | Both `false` |
| AAC EIP-1967 impl (Phase E) | SettlerCanary `0x9b8D…9864` → **superseded by F1/F2** |
| AAC `canaryMintCompleted` + `canaryRecord` | Spent on canary bytecode (gone after F1) |
| AAC `settle()` | Reverts `CustodyClosed` (`0x61839255`) |
| GB `admins(OWNER)` + `admins(AAC)` (Phase E) | Both `true` → **F1 set AAC=false** |
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

## 2026-10-28 owner actions (sent through the operator's ops script)

| Action | Chain | Block | Transaction | Result |
| --- | --- | --- | --- | --- |
| CoNET GB `removeAdmin(TreasuryBridgeV3 0xa208…)` | CoNET 224422 | `1918566` | `0x576123e7136e18f32778befb6a66169f9b24192687a251b059514afece935f97` | success; the treasury is no longer a GB admin |
| Base treasury `setAacExecutor(owner EOA)` | Base 8453 | `53224719` | `0x55cfc060ee404cc2adf2579de214a5b516abd6662d8fd85881aa98028484f6ff` | success; the executor was the AAC proxy |
| Base treasury `completeFromAac(opId, USDC, to, 47859948, BurnRelease)` | Base 8453 | `53224722` | `0x20ad1487d05636fbf7fb65ea08514590875e8ec4fa5d7e5ee237f9279cc3ed80` | success; 47.859948 USDC moved to an externally owned wallet named by the owner; the treasury holds 0 USDC |

Not changed on 2026-10-28:

- The old Base treasury still holds 0.001 GB, its `sourceInitiateOpen` is true, and its owner can upgrade it.
- On CoNET, `conet-USDC` (`0x5209…`) and `TGB5` (`0xeb8c…`) still accept user-signed Mint. The owner chose to keep this for now (O12).
- The CoNET treasury's `treasuryAssetKind(GB)` is still GbPaid. The GB path is closed by the removed admin role; if the treasury becomes a GB admin again, it reopens.

## Explicit non-execution / execution record (updated 2026-10-15 F1–F7)

| Action | Status |
| --- | --- |
| Treasury role grant to AAC proxy | **Not sent** (F6 BLOCKED — no live setter) |
| GB role grant to AAC proxy | **EXECUTED** Phase B; **REVOKED** F1; **RE-GRANTED** F5; **REVOKED** on CoNET again at block `1798441` (2026-10-20; recorded from chain events on 2026-10-28) |
| Peer role grant | **Not sent** |
| Paid-GB miner `voteBridgeMint` pause (`setBridgePaused(true)`) | **EXECUTED** (Phase D — CoNET + Base; see above) |
| Treasury USDC `voteBridgeOperation` disable | **EXECUTED** (2026-10-15; `voteBridgeClosed=true` on Base and CoNET) |
| Phase C canary mint / release / proxy upgrade | **EXECUTED** (C0/C1/C2 — 0.01 paid GB; see above) |
| Phase E monitor baseline | **RECORDED HEALTHY** (read-only; see above) |
| F1 off-canary + GB `removeAdmin(AAC)` | **EXECUTED** (see below) |
| F2 CoNET inclusion (no self-hash) | **EXECUTED** (see below) |
| F3 settle ↔ consume-once same tx | **EXECUTED** (see below) |
| F4 committee rotation (`applyUpdate` one period) | **EXECUTED** 1883 → 1884 (`0x47a9…d9cb`, gas 11,504,959) |
| F5 settle-open (mint after consume + GB re-grant) | **EXECUTED** (SettlerF5 `0xa1aa…dA00`; see below) |
| F6 USDC / stop `voteBridgeOperation` | **EXECUTED** (vote closed; no AAC Treasury grant; see [F6-USDC.md](F6-USDC.md)) |
| F7 Owner key → multisig / timelock | **SCHEDULED** (F7b `0xfe5E…2C1f`; `upgradeTo` after 2026-10-17T13:02:09Z; Owner still EOA) |
| Historical canary unpause | **Not sent** |

Custody views remain closed (`custodyOpen` / `headerFinal` false). Production
**USDC** miner `voteBridgeOperation` is **closed**. Paid-GB miner
`voteBridgeMint` is **paused**. After F5, AAC **is** GB admin and SettlerF5 can
`mintPaid` same-tx after consume (needs a **new** Cover-eligible BridgeOperation
for live mint; F3 COVER sample already consumed).

---

## F1 — Off canary + revoke GB admins(AAC) (EXECUTED 2026-10-15)

Owner auth: 「请依据审计报告, 依次移除生产前障碍」.  
Script: [scripts/executeF1OffCanary.mjs](../scripts/executeF1OffCanary.mjs)  
JSON: [deployments/phase-F1-off-canary.json](../deployments/phase-F1-off-canary.json)

| Step | Tx | Block | Result |
| --- | --- | --- | --- |
| Base `upgradeTo(closed Settler)` | `0x5335badf…aa58` | `52624237` | EIP-1967 → `0x3085…3442` |
| CoNET `GB.removeAdmin(AAC)` | `0x40da22bb…4800` | `1718720` | `admins(AAC)=false` |
| Base `GB.removeAdmin(AAC)` | `0x732050aa…f6e2` | `52624242` | `admins(AAC)=false` |

Verify: no-arg settle closed; canary selectors gone; owners remain GB admin.

**Status (2026-10-28):** superseded for GB admins. F5 re-granted `admins(AAC)` on Base (block `52625416`) and on CoNET (block `1719111`). The CoNET role was removed again at block `1798441` (2026-10-20). See F5.

---

## F2 — CoNET inclusion (no self-hash) (EXECUTED 2026-10-15)

Owner auth: same F1–F7 message.  
Script: [scripts/executeF2ConetInclusion.mjs](../scripts/executeF2ConetInclusion.mjs)  
JSON: [deployments/phase-F2-conet-inclusion.json](../deployments/phase-F2-conet-inclusion.json)

| Component | Address |
| --- | --- |
| `AacConetMessageInclusion` | `0x7064860E3594aE120f71700B2F46151c6D370559` |
| Finality impl (verifyAggregate) | `0xdAF6…218a` |
| Settler F2 (live AAC EIP-1967) | `0xeC199F6ebDf0f0F1d7F4e5C2e8b4A1B9D3c7688F` |

Pass: independent Aggregate + CoNET EL receipt MPT + beacon walk; old
`settleFromConet(bytes32,uint256,bytes)` selector gone; Base COVER settle
smoke OK; custody still closed.

---

## F3 — Settle ↔ consume-once same tx (EXECUTED 2026-10-15)

Owner auth: same F1–F7 message.  
Script: [scripts/executeF3SettleConsume.mjs](../scripts/executeF3SettleConsume.mjs)  
JSON: [deployments/phase-F3-settle-consume.json](../deployments/phase-F3-settle-consume.json)

| Component | Address |
| --- | --- |
| Settler F3 (live AAC EIP-1967) | `0xf131359EE46d261B91cEedE8772DE18fB821B2b0` |
| ConsumeOnce impl F3 | `0x75aC7020976C6048FCB2bb8741fCA72e2d1cA598` |
| ConsumeOnce proxy | `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F` (gateway = AAC) |
| OkEffect / RevertEffect | `0x8Cdb…CbAF` / `0x6A44…2480` |

| Smoke | Tx / result |
| --- | --- |
| RevertEffect | `0x7ad4…65c5` — EffectFailed; opId left **unconsumed** |
| OkEffect | `0x01f9…0115` — consume mark + Settled; `mintedOf=10000` (no GB mint) |
| Double OkEffect | reverts `AlreadyConsumed` |
| Custody | `custodyOpen=false`; no-arg settle still closed |

Pass: `settle` / `settleBridge` / `settleFromConet` take `address effect` last;
same tx proves COVER/Inclusion then `consumeFromSettler`; no double cover;
`GB.admins(AAC)` still false.

---

## F4 — Committee rotation (RUNBOOK + SCRIPT READY 2026-10-15)

Owner auth: same F1–F7 message.  
Runbook: [F4-COMMITTEE-ROTATION.md](F4-COMMITTEE-ROTATION.md)  
Script: [scripts/executeF4CommitteeRotate.mjs](../scripts/executeF4CommitteeRotate.mjs)  
JSON: [deployments/phase-F4-committee-rotate.json](../deployments/phase-F4-committee-rotate.json)
(`status: RUNBOOK_READY`; period **1883** → next **1884**)

| Pass condition (audit) | Status |
| --- | --- |
| Next period in a **separate** `applyUpdate` tx | Script enforces; dry-run OK |
| Keep old-period message proof window | Documented; drain Cover+settle before rotate |
| Gas under Base pairing budget (≤16,777,216) | Measured median ~11.5M; script refuses estimate ≥ cap |

Live `CheckpointRoot.applyUpdate(Update)` broadcast waits for a period-`P` →
`P+1` Update payload from Ethereum beacon (`PHASE_F4_EXECUTE=1` +
`F4_UPDATE_JSON`). Custody views stay closed.

---

## F5 — Settle-open + GB.admins re-grant (EXECUTED 2026-10-15)

Owner auth: same F1–F7 message.  
Doc: [F5-SETTLE-OPEN.md](F5-SETTLE-OPEN.md)  
Script: [scripts/executeF5SettleOpen.mjs](../scripts/executeF5SettleOpen.mjs)  
JSON: [deployments/phase-F5-settle-open.json](../deployments/phase-F5-settle-open.json)
(`ok:true`)

| Component | Address |
| --- | --- |
| SettlerF5 (live AAC EIP-1967) | `0xa1aa63BF44128E9f14260886263c8775C4A2dA00` |
| Prior F3 Settler | `0xf131359EE46d261B91cEedE8772DE18fB821B2b0` |

| Step | Result |
| --- | --- |
| CoNET `GB.addAdmin(AAC)`, block `1719111` (tx `0xe583cf0c…67cd`); Base `GB.addAdmin(AAC)`, block `52625416` (tx `0xcb294358…456a`). Both sent by the owner EOA | `admins(AAC)=true` on both chains after F5 |
| AAC `upgradeTo(F5)` | live SettlerF5 |
| COVER smoke settle | `AlreadyConsumed` (opId from F3; expected) |
| Views | `custodyOpen=false`, `headerFinal=false` |

Later change, not part of F1–F7 (recorded from chain events on 2026-10-28):

| Step | Result |
| --- | --- |
| CoNET `GB.removeAdmin(AAC)`, block `1798441`, 2026-10-20 17:40:31 UTC, tx `0xc15fac44…7e8a`, sent by the owner EOA, status success | `admins(AAC)=false` on CoNET. Not in the F1–F7 record before this entry |

Pass: settle APIs take `mintTo` + `effect`; same tx `consumeFromSettler` then
`GB.mintPaid(mintTo, amount)`. Live mint of a **new** lock needs a fresh
Cover-eligible BridgeOperation.

---

## F6 — USDC / Treasury cutover (vote closure EXECUTED; Treasury grant NOT sent)

Chain check 2026-10-16 (read-only, Base): Treasury `voteBridgeClosed()` = `true`, so the miner `voteBridgeOperation` closure is in effect. The AAC has no Treasury role. The section below is the original probe record from 2026-10-15 and is kept for history.


Owner auth: same F1–F7 message (probe only — no invent).  
Doc: [F6-USDC.md](F6-USDC.md)  
Script: [scripts/executeF6Usdc.mjs](../scripts/executeF6Usdc.mjs)  
JSON: [deployments/phase-F6-usdc.json](../deployments/phase-F6-usdc.json)
(`status: BLOCKED`)

| Probe | Result |
| --- | --- |
| Treasury impl | `0xf7474cac9c9833fa35ce10e3b22f442096ed0a06` |
| `setBridgePaused` / `pause` / `paused` | **absent** |
| `voteBridgeOperation` | **closed** (`voteBridgeClosed=true`) |
| `isMiner(AAC)` / `allowedMintCallbacks(AAC)` | **false** / **false** |
| Broadcast | **none** |

Unblock requires explicit auth to upgrade Treasury (AAC grant + pause) or an
accepted residual that USDC stays on miner vote.

---

## F7 — Owner key → multisig / timelock (BLOCKED 2026-10-15)

Owner auth: same F1–F7 message (probe only — no invent).  
Doc: [F7-OWNER-KEY.md](F7-OWNER-KEY.md)  
Script: [scripts/executeF7OwnerKey.mjs](../scripts/executeF7OwnerKey.mjs)  
JSON: `{OWNER_KEY_FILE}`
(`status: BLOCKED`)

| Probe | Result |
| --- | --- |
| AAC `owner()` | `0x87cAe…05E1` (EOA) |
| Settler `transferOwnership` / `setOwner` / `acceptOwnership` | **absent** |
| Settler `upgradeTo` | **present** (onlyOwner) |
| Broadcast | **none** |

Unblock requires naming a multisig/timelock **and** a Settler upgrade (or
equivalent) that can transfer AAC `owner` storage — then Blockscout verify.

---

## Related

- [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md)
- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md)
- [PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md)
- [M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md) — F4 rotation rules
- [F4-COMMITTEE-ROTATION.md](F4-COMMITTEE-ROTATION.md) — F4 runbook
- [F5-SETTLE-OPEN.md](F5-SETTLE-OPEN.md) — F5 settle-open + mint (EXECUTED)
- [F6-USDC.md](F6-USDC.md) — F6 USDC / Treasury (BLOCKED)
- [F7-OWNER-KEY.md](F7-OWNER-KEY.md) — F7 Owner key (BLOCKED)
