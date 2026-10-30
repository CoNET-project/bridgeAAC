# Beamio AAC Governance Multisig: Design White Paper and Audit Brief

| Field | Value |
| --- | --- |
| Document | AAC-GOV-WP, draft 0.1 |
| Date | 2026-10-18 |
| Scope | Owner and admin control of the AAC production stack on Base (chain 8453) and CoNET L1 (chain 224422) |
| Status | **Draft. Design only.** No multisig is deployed. No owner or admin role has been moved. |
| Code baseline | `src/bridgeAAC`, branch `main`, commit `326f244`, plus the uncommitted files listed in §13.3. No freeze commit exists yet. |
| Distribution | Confidential. Not approved for any third party (see §15). |
| Redactions | No private keys, key storage locations, RPC endpoints, node addresses, or access details appear here. |

**Evidence tags used in this document**

- **[repo]**: checked against source or record files in this repository on 2026-10-18. File and line are given.
- **[memo]**: an on-chain fact recorded in `docs/OWNER-MULTISIG-DECISION-2026-10-18.md` (read-only, 2026-10-18). It was **not** re-read for this document.
- **[proposal]**: a design choice the operator has not yet approved.

---

## 1. Summary

The AAC production stack controls a custody-gated path that mints paid GB on Base, a USDC treasury on Base, and the Ethereum and CoNET finality roots that the bridge trusts. Today every privileged function in that stack is callable by one externally owned account (EOA). This document specifies how control moves to multisig governance, how the design is enforced on-chain, and which engineering work must be finished before each step can run.

**Recommended (Phase 1): per-chain Safes.**

- A Safe v1.4.1 multisig on Base and one on CoNET, with identical owners and threshold. Whether they also share an address depends on the deployment prerequisite in §5.1, which is not yet verified.
- Two-step ownership transfer wherever the contract supports it. One-step transfers are upgraded or blocked first (§6).
- Settler upgrades keep the existing two-day delay. [repo: `contracts/AacProductionCustodyGateSettlerF7.sol:23`, `contracts/AacProductionCustodyGateSettlerF10.sol:66`, `contracts/AacEthereumCheckpointRootTimelock.sol:13`, `contracts/AacConetSourceFinalityTimelock.sol:13`]
- A pause-only guardian reaches each chain through a small immutable adapter. The guardian never holds GB admin rights.

**Optional (Phase 2): CoNET-to-Base pause executor. Deferred; not approved.** The CoNET Safe would queue pause-only actions on Base through the bridge's proof path. Phase 2 is blocked by the finality defects in §10. Its two-day delay also makes it a slow control, so the Phase 1 guardian is the emergency path (§7.8).

**What changed from the 2026-10-18 decision memo.** Three findings are new in this document and change the plan:

1. The GB pause does not stop the live settler's mint path. The live F7 `mintPaid` call has no `bridgePaused` check [repo: `contracts/AacProductionCustodyGateSettlerF7.sol:214`]. Direct admin `mintPaid` is also not blocked by the pause [repo/record: `docs/CUTOVER-CUSTODY.md:276`]. The pause is therefore not an emergency stop until F11 (§8.1) and a restricted GB admin set exist (§6).
2. The "same Safe address on both chains via Arachnid" premise is unverified. Canonical Safe addresses depend on the deployer and initializer used to create them (§5.1). This must be checked before it is relied on (G-20).
3. The live settler has no pause, and its only closure is indirect (G-16). Its upgrade path also has no expiry (G-12).

**Current state.** The owner remains the EOA on every controlled contract [memo]. The live settler cannot yet take a clean ownership handoff because of a storage alias (G-01). The 2026-10-15 withdrawal of the owner handoff is superseded by this document, pending operator confirmation (D4).

**What we ask of the auditor:** §13.4.

---

## 2. Background and current state

### 2.1 The bridge's trust model

A cross-chain effect is accepted only when five things hold:

1. The source event is in a finalized source block.
2. That block's header is authenticated: sync-committee BLS aggregate, finality, ancestry, and payload binding.
3. The receipt is included under the authenticated receipts root (Merkle-Patricia proof).
4. The emitter, topic, and fields decode to a known operation.
5. The operation identifier is consumed once. The destination effect is then bounded by that operation.

Phase 1 does not use this path. Phase 2 would.

### 2.2 Controlled contracts

| Chain | Contract | Address | Role | Control today |
| --- | --- | --- | --- | --- |
| Base | AAC settlement proxy (live implementation F7 `0x29e1…`) | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` | Paid-GB mint path; holds the upgrade timelock | EOA owner [memo]. Two-step transfer. Two-day upgrade delay [repo: F7 lines 23, 128–161] |
| Base | Original Base cover, used by live F7 | `0x01506527a4Dab14141038Db15f5341dcF4729233` | Base header cover with no header-hash binding (G-15) | No owner. Constant in F7 [repo: F7 line 19] |
| Base | Base cover V2, deployed but unwired | `0x68c2aC69E8F0A81685693D48C5e9B07f0228d394` | Base cover with header binding | No owner. Must not be wired before review [repo: `deployments/base-AacCheckpointMessageCoverV2.json`] |
| Base and CoNET | TreasuryBridgeV3 | `0xa208982212978550594A7FEEB70a61665d129003` | USDC treasury and bridge operations | EOA owner [memo]. OpenZeppelin `OwnableUpgradeable` 5.4.0, one-step `transferOwnership` [repo: `src/b-unit/TreasuryBridgeV3.sol:5, 36`] |
| Base | Ethereum checkpoint root (timelock variant, implementation `0x4880…`) | `0xcEE3D699df3df07a573f1aFf642888B97B7aA961` | Ethereum finality trust root | EOA owner [memo]. Two-step. Two-day upgrade delay [repo: `AacEthereumCheckpointRootTimelock.sol:13`] |
| Base | CoNET finality (V1 family, timelock variant) | `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` | CoNET sync-committee finality | EOA owner [memo]. Two-step. Upgrade path present [memo] |
| Base | Ethereum committee store | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` | Ethereum sync-committee store | EOA [memo]. `upgradeTo` only per memo. Ownership function not confirmed |
| Base and CoNET | GBToken (Base); GBTokenV2 (CoNET) | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` | Paid GB. Flat admin role, no `owner()` | Admin map includes the AAC proxy and the EOA on both chains [repo: `src/b-unit/GBToken.sol:60, 294–349` (Base); `src/b-unit/GBTokenV2.sol` (CoNET); record: `docs/CUTOVER-CUSTODY.md:160–170`] |
| Base | ConsumeOnce | `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F` | Consume-once registry | Role-based [memo]. Roles not enumerated here |
| CoNET | Ethereum checkpoint | `0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a` | Ethereum finality on CoNET | EOA [memo] |
| CoNET | ConsumeOnce proxy | `0xA13843C75f68F726e1DC4dbA75d07597EE18d999` | Consume-once registry | `rescueAdmin` = EOA [memo] |

### 2.3 Timeline

Timestamps and block numbers are as recorded in the cited files.

| When (UTC) | Event | Record |
| --- | --- | --- |
| 2026-10-15 00:58 | AAC proxy added as GB admin on CoNET (tx `0x0cea02390f02594a722f9ff90d1e45219332fd509dca6f104996608d32603604`, block 1716737) and on Base (tx `0xc41287df1815ed9b8bd88fa4bdf3639823c2a674dc5def65d19941f78eca336a`, block 52618294) | `deployments/phase-B-gb-addAdmin-aac.json` |
| 2026-10-15 01:35 | GB `setBridgePaused(true)` on CoNET (tx `0x3a0c47577076fe65ab42ed3759be8aca9992fba4ef04568a12ba2aa537968040`, block 1717104) and on Base (tx `0xd0732bdebadd70b83a116b71937020ba50a75df2ed135cd8ab0c20097e5ac4f0`, block 52619394). Treasury `voteBridgeOperation` closed (`voteBridgeClosed=true`) | `deployments/phase-D-gb-setBridgePaused.json`; `docs/CUTOVER-CUSTODY.md` |
| 2026-10-15 | Owner-to-multisig handoff withdrawn. Owner stays the EOA | `docs/F7-OWNER-KEY.md`; `docs/CUTOVER-CUSTODY.md` |
| 2026-10-15 (Base block 52639991) | Upgrade to SettlerF7b scheduled. Earliest `upgradeTo` 2026-10-17 13:02:09Z | `docs/F7-OWNER-KEY.md` |
| Before cancellation | Pending upgrade to SettlerF7c (`0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44`) present, ready 2026-10-17 13:25:41Z | `deployments/containment-f7c-cancel-base.json` |
| Base block 52704286 | `cancelUpgrade()` by the owner EOA, status 1 (tx `0x5e0ac9068745b7cc45599e8b0342bafd16ee1f385dbe67ff62e87bdeaf977724`). Live implementation unchanged. Pending state cleared | `deployments/containment-f7c-cancel-base.json` |
| 2026-10-18 | Decision memo written. Signers and threshold not chosen | `docs/OWNER-MULTISIG-DECISION-2026-10-18.md` |

### 2.4 Control state that the design must change

- The EOA owns the AAC proxy, the Ethereum checkpoint root, the CoNET finality on Base, and Treasury on both chains [memo].
- The EOA and the AAC proxy are GB admins on both chains. GB has no `owner()`; its control is the admin map [record: `docs/CUTOVER-CUSTODY.md:160–170`].
- GB is paused on both chains. This does not stop the live F7 mint path or direct admin `mintPaid` (G-02, G-03).
- `settle()` on the live settler reverts. The record calls this "custody closed" (G-16).

---

## 3. Goals and non-goals

**Goals**

- **G1. No single key can** upgrade a custody or trust-root contract, change an owner, or mint paid GB.
- **G2. Visible delay.** Every code change and ownership change is scheduled on-chain and can be cancelled before it executes.
- **G3. Pause without power.** An emergency pause exists that does not need the owner set, cannot unpause, and cannot move assets or change code.
- **G4. No silent loss of control.** Ownership transfers are two-step where the contract allows. One-step transfers are upgraded or blocked.
- **G5. Enumerable roles.** Every privileged role can be listed and checked by a read-only tool (§8.3). An unexpected EOA role fails the check.
- **G6. Chain-local authority.** Each chain's Safe controls that chain's contracts. Cross-chain influence exists only through the proof path in §7, and only if Phase 2 is approved.

**Non-goals**

- Improving the security of CoNET consensus, the CoNET sync committee, or Ethereum beacon finality.
- Solving CoNET GB supply integrity (G-13). That question limits what a burn proof demonstrates and is tracked separately.
- Specifying the signing ceremony beyond the minimum in §5.2.
- Auditing Safe v1.4.1 internals or Circle's USDC contract (assumptions A1 and A2).

---

## 4. Assumptions and threat model

### 4.1 Assumptions

| ID | Assumption |
| --- | --- |
| A1 | Safe v1.4.1 (singleton, proxy factory, MultiSend, and the fallback handler chosen in §5.2) behaves as upstream specifies. |
| A2 | Circle USDC behaves as specified. Freeze and blocklist actions are outside this design's control. |
| A3 | Fewer than the threshold of owner signers are compromised at any time. At 3-of-5 (proposed), at most two. |
| A4 | Guardian signers do not collude with a threshold of owners. The guardian can pause, but cannot upgrade, unpause, or mint. |
| A5 | Ethereum beacon finality and the committee store and checkpoint root behave as the existing AAC design assumes. |
| A6 | The CoNET finalized state is honest. Phase 1 does not depend on it. Phase 2 would. The Base-side CoNET trust root is the snapshot chosen at one-shot install, not CoNET genesis. This is an explicit assumption for review (Q6). |
| A7 | Deployed bytecode matches the audited source. §12 describes how to check this. |
| A8 | After handoff, the EOA key is not used for any privileged role. |

### 4.2 Assets

- **A-1** USDC held by TreasuryBridgeV3 on Base.
- **A-2** Paid-GB mint authority on Base and CoNET.
- **A-3** Integrity of the custody settler code.
- **A-4** Integrity of the Ethereum and CoNET trust roots.
- **A-5** Consume-once state.
- **A-6** Liveness of bridge operations.

### 4.3 Threats

| ID | Threat | Design response | Residual risk |
| --- | --- | --- | --- |
| T1 | Single EOA compromise. The EOA can upgrade the settler, mint GB, and change admins. | Move every privileged role to a Safe (§5, §9). Retire the EOA (§9, step 11). | Until handoff completes, the EOA is the single point of failure (G-19). |
| T2 | Owner collusion, or theft of threshold-many owner keys. | Threshold. Two-day delay on upgrades. Guardian pause. F11 adds guardian cancel (§8.1). | Accepted at 3-of-5 (D1). A threshold-holding attacker can still act after two days. |
| T3 | Malicious or broken upgrade. | Two-day delay. `upgradeTo` accepts only the exact pending address. | No expiry on scheduled upgrades today (G-12). |
| T4 | Storage collision on upgrade. | F11 uses the F7c layout. Storage comparison in CI (§8.1). | Open until F11 exists (G-01). |
| T5 | Mistyped ownership transfer. | Two-step where available. Treasury and new contracts upgraded or built two-step (§6). | Live Treasury and the not-yet-deployed AacHeaderAuthority and AacChainEffectV2 are one-step until fixed (G-05, G-06). |
| T6 | Any GB admin mints, adds admins, changes validators, or pauses and unpauses. | Remove EOA admins. Add only the Safe and the pause adapter. Enumerate admins from `AdminAdded` and `AdminRemoved` events (§6). | Any remaining admin has full power (G-03). Direct `mintPaid` is not blocked by the pause (G-03). |
| T7 | Mint path ignores the GB pause. | F11 adds the `bridgePaused` check. F8 and F10 already have it. | The live F7 ignores the pause until F11 (G-02). |
| T8 | Guardian misuse: unpause, upgrade, or mint. | Guardian holds no GB admin. Adapter exposes only `pauseGb()`. Guardian cannot schedule or execute upgrades. | The guardian can deny service by pausing. |
| T9 | Forged CoNET message (Phase 2 only). | Header authentication, receipt inclusion, emitter and topic check, consume-once (§7.5). | Depends on G-07 to G-10 being fixed. |
| T10 | Replay across chains, relays, or executors (Phase 2 only). | Chain IDs, relay, executor, and nonce inside `messageId`. Consume-once. Deadline. | A redeployed relay needs a Base-side update by the Base Safe. |
| T11 | Censorship or stalling of CoNET messages (Phase 2 only). | Anyone may submit a valid proof. The Phase 1 path remains. | Stalled messages delay pauses. |
| T12 | CoNET finality stalls or goes stale on Base (Phase 2 only). | Rotation via V2, which is not built. | Phase 2 unavailable until fixed (G-08, G-10). |
| T13 | Wrong contract at the same address on the other chain (for example, a Safe on CoNET). | Compare runtime code hash and owner set on both chains before handoff (§5.4). | Operator error remains possible. The check is a required gate. |
| T14 | Malicious transaction presented to signers: wrong calldata, or unexpected delegatecall. | Change ticket states the expected calldata hash. Delegatecall only to the canonical MultiSend (§5.2). | Human factor. |
| T15 | Upgrade or ownership change on the wrong chain or against the wrong address. | Chain-ID checks in scripts. Dry-run by default. Address equality checks. | Operator error. |

---

## 5. Phase 1: per-chain Safes

### 5.1 Components

| Component | Chain | Address or status |
| --- | --- | --- |
| Safe v1.4.1 singleton (plain; see D7) | Base | `0x41675C099F32341bf84BFc5382aF534df5C7461a`. Recorded in the 2026-10-18 research session. Not in this repository. Re-verify against Safe's published deployments before use |
| Safe v1.4.1 proxy factory | Base | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`. Same caveat |
| Safe singleton and proxy factory | CoNET | Not deployed [memo] |
| Arachnid deterministic deployer | Base and CoNET | `0x4e59b44847b379578588920ca78fbf26c0b4956c`. Present on both [memo] |
| Owner Safe | Base | Not created (D1) |
| Owner Safe | CoNET | Not created. Same owners and threshold as Base (D1) |
| Guardian Safe | Base, and CoNET if CoNET adapters are used | Not created (D2) |
| Pause adapter | Base and CoNET | Not built (§8.2) |

**Same-address prerequisite (G-20).** A Safe proxy address depends on the factory address, the singleton address, the initializer (owners, threshold, fallback handler), and the salt nonce. The decision memo states that Arachnid's presence on both chains lets the same Safe address be produced. That has not been verified. The canonical Safe v1.4.1 addresses were produced by a specific deployer and init code. Reproducing them on CoNET requires the same deployer address and init code. If that deployer is absent on CoNET, the singleton and factory must be deployed another way, and the addresses may differ. The owner set can still be identical either way. Until this is verified, do not claim a shared address in any record.

### 5.2 Owner Safe configuration

- **Version.** Safe v1.4.1. Plain singleton or SafeL2 is decision D7. SafeL2 emits additional events that help monitoring.
- **Owners.** Five hardware-wallet keys held by five different people (D1). **[proposal]** Threshold 3.
- **Modules.** None enabled.
- **Guard.** None in Phase 1. D7 may add a guard that blocks `enableModule`, `setGuard`, and delegatecall to anything other than the canonical MultiSend. **[proposal]**
- **Delegatecall.** Only to the canonical MultiSend library. **[proposal]**
- **Fallback handler.** The canonical CompatibilityFallbackHandler for v1.4.1. Record its address in the deployment file. **[proposal]**
- **Signing.** Each owner verifies the expected calldata hash on their device before signing. The change ticket states the target, calldata, value, and that hash. **[proposal]**
- **Owner-set changes.** Each chain's Safe executes its own owner-set change. Phase 1 has no cross-chain synchronization.

### 5.3 Guardian Safe

- **Scope.** One Safe per chain where a pause adapter is deployed. **[proposal]** Threshold 2-of-3, with signers distinct from the owner signers (D2).
- **Permitted.** Call `pauseGb()` on that chain's adapter.
- **Permitted after F11.** Call `guardianPause()` on the settler, which blocks the settle paths and cannot unpause. Call `guardianCancelUpgrade()`, which clears a pending upgrade and cannot schedule one. **[proposal, D9]**
- **Not permitted.** GB admin, owner, `upgradeTo`, `transferOwnership`, or any unpause.
- **Unpause.** Owner Safe only. Once the owner Safe is a GB admin (§9, step 9), it can call `setBridgePaused(false)`, as the record notes [record: `docs/CUTOVER-CUSTODY.md:273`].

### 5.4 Pre-handoff checks for each Safe

Run these before any owner moves to a Safe.

1. Runtime code hash of the Safe proxy, singleton, and factory on each chain. Equal across chains only if a shared address is claimed.
2. `getOwners()` and `getThreshold()` equal across chains.
3. No modules enabled. No guard set (Phase 1).
4. A zero-value no-op transaction, executed by threshold signers, on each chain. This is the only write in this list.

### 5.5 Upgrade process for timelocked contracts

1. Owner Safe calls `scheduleUpgrade(newImpl)` at threshold.
2. Wait `UPGRADE_DELAY` (2 days). [repo: F7 line 23; F10 line 66; both timelock variants line 13]
3. Owner Safe calls `upgradeTo(newImpl)`. Only the exact pending address succeeds [repo: F7 lines 141–150].
4. Before step 3, the owner audit (§8.3) must show no unexpected pending state.
5. **Expiry.** None in current contracts (G-12). **[proposal]** F11 adds an expiry.
6. **Guardian cancel.** None in current contracts. Only the owner's `cancelUpgrade` exists [repo: F7 lines 135–139]. **[proposal]** F11 adds guardian cancel.

---

## 6. Ownership handoff rules by contract

| Contract (chain) | Current owner functions | Handoff method | Blocking items | Check after handoff |
| --- | --- | --- | --- | --- |
| AAC proxy F7 (Base) | `transferOwnership`, `acceptOwnership` (two-step). `scheduleUpgrade`, `cancelUpgrade`, `upgradeTo` (2 days) | Two-step, **after F11 is installed.** Do not call `transferOwnership` on the live F7. Its `pendingOwner` aliases the Phase C canary record at slot 51 [record: `docs/F7-OWNER-KEY.md:49, 57`] | G-01, G-02 | `owner()` = Owner Safe. `pendingOwner()` = 0. Canary slots unchanged |
| TreasuryBridgeV3 (Base and CoNET) | OpenZeppelin `transferOwnership`, one-step [repo: `src/b-unit/TreasuryBridgeV3.sol:5, 36`] | Upgrade to two-step ownership first (§8.4). Then two-step handoff. **Never transfer one-step.** | G-05 | `owner()` = Owner Safe. Pending owner = 0 |
| Ethereum checkpoint root (Base) | Two-step (timelock variant) [memo] | Two-step | None known | Same as above |
| CoNET finality (Base) | Two-step (timelock variant) [memo] | Two-step. Ownership transfer does not fix G-07 | None for the handoff itself | Same as above |
| Ethereum committee store (Base) | `upgradeTo` only [memo] | Confirm whether an ownership function exists. If not, add two-step in an upgrade first | Not confirmed | `owner()` |
| GBToken (Base); GBTokenV2 (CoNET) | Flat admin map. No `owner()` [repo: `src/b-unit/GBToken.sol:60, 294–349` (Base); `src/b-unit/GBTokenV2.sol` (CoNET)] | Add the Owner Safe as admin. The EOA cannot remove itself, because `removeAdmin` reverts when the account is `msg.sender` [repo: `GBToken.sol:303`]. The Owner Safe removes the EOA. Add the pause adapter as admin only after review | G-03 | `admins(Owner Safe)` = true. `admins(EOA)` = false. Review `AdminAdded` and `AdminRemoved` logs |
| ConsumeOnce (Base) | Role-based [memo] | Enumerate roles. Move each to the Owner Safe | Roles not enumerated | Role reads |
| ConsumeOnce (CoNET) | `rescueAdmin` = EOA [memo] | Change to CoNET Safe | None known | Read |
| Ethereum checkpoint (CoNET) | Owner = EOA [memo] | Two-step to CoNET Safe. Confirm the function name | Not confirmed | `owner()` |
| AacHeaderAuthority (not deployed) | `setOwner` (one-step), `setVerifier`, `revoke` [repo: `contracts/AacHeaderAuthority.sol:33, 38, 52`] | Deploy with the Owner Safe as owner, after changing `setOwner` to two-step | G-06, G-18 | Read after deployment |
| AacChainEffectV2 (not deployed) | `setOwner` (one-step) [repo: `contracts/AacChainEffectV2.sol:65`] | Same as above | G-06 | Read after deployment |

---

## 7. Phase 2 (optional, deferred): CoNET-to-Base pause executor

### 7.1 Purpose and limits

- **Purpose.** Let the CoNET Safe's signers pause Base paid-GB minting without a Base-side signing round.
- **Limits.** Pause-only. No upgrade, mint, ownership change, or allowlist change can be initiated from CoNET.
- **Why not CoNET upgrade authority (alternative B2).** Rejected for now. A CoNET consensus failure or CoNET Safe compromise could replace custody code on Base after the delay. The guardian would be the only brake.
- **Recommendation.** Do not build Phase 2 unless the operator wants CoNET signers to control Base pauses. Phase 1 covers emergencies without it (§7.8).

### 7.2 Components (none built)

| Component | Chain | Owner or immutables | Notes |
| --- | --- | --- | --- |
| GovernanceRelay | CoNET | Immutable `SAFE` | `dispatch` callable only by `SAFE`. A Safe `execTransaction` sets `msg.sender` |
| PauseAdapter | Base and CoNET | Immutable | Exposes only `pauseGb()`. GB admin. No unpause |
| PauseExecutor | Base | Owner Safe (Base) | Verifies CoNET messages. Queues. Executes after delay. Guardian can cancel and pause |
| CoNET finality V2 and rotation | Base | Owner Safe | Replaces the V1 family (G-07 to G-10). Neither is built |
| Header and receipt verification | Base | None | Reuses `AacConetHeaderAuthenticator`, `AacReceiptMptVerifier`, and `AacBridgeReceiptLog`, after fixes |

### 7.3 Message format

```
GovernanceMessage (emitted by the CoNET relay; decoded by the Base executor)
  sourceChainId  uint256   224422
  targetChainId  uint256   8453
  relay          address   the CoNET relay that emitted the event
  executor       address   the Base PauseExecutor that accepts it
  nonce          uint64    strictly increasing per relay
  deadline       uint64    unix time; queuing must happen at or before it
  target         address   Base contract; allowlisted (initially PauseAdapter only)
  callData       bytes     full calldata; value is always zero

messageId = keccak256(abi.encode(
    keccak256("AAC-GOV-MSG-V1"), sourceChainId, targetChainId,
    relay, executor, nonce, deadline, target, keccak256(callData)))
```

The CoNET event is `GovernanceMessage(bytes32 indexed messageId, address indexed executor, uint256 targetChainId, uint64 nonce, uint64 deadline, address target, bytes callData)`. The relay is the emitter. `sourceChainId` is fixed by the header that is proven.

### 7.4 Authorization on CoNET

`dispatch(executor, target, callData, deadline)` is callable only by `SAFE`. The relay also checks its own allowlist (defense in depth) and increments `nonce`. The Safe's threshold is enforced inside the Safe's `execTransaction` on CoNET. The last signer who submits the transaction is only the relayer of a threshold-approved call. Base never sees the signatures. It sees the event in a finalized CoNET block.

### 7.5 Base queue steps (`PauseExecutor.submit`)

1. Reject if the executor is paused.
2. Authenticate the CoNET header: BLS aggregate over the attested header; finalized checkpoint and finality branch; beacon ancestry to the finalized header; payload branch to the execution block hash; `keccak256(headerRlp)` binds the header.
3. Verify receipt inclusion under the header's receipts root (MPT).
4. Require receipt status = 1. Not present today (G-11).
5. Require the log's emitter to equal `RELAY`, topic0 to equal `GOV_TOPIC`, and the log to be at the claimed index.
6. Decode the fields. Recompute `messageId`. Require equality with topic 1.
7. Require `sourceChainId == 224422`, `targetChainId == block.chainid`, and `executor == address(this)`.
8. Require `block.timestamp <= deadline`.
9. Require `allowed[target][selector(callData)]`. Value is always zero.
10. Require `!consumed[messageId]`. Set `consumed[messageId] = true`.
11. Store `pending[messageId] = { target, callData, eta: now + DELAY, expiry: eta + GRACE, cancelled: false }`.

### 7.6 Execution and cancellation

- **`execute(messageId)`.** Permissionless after `eta` and before `expiry`. Reverts if paused or cancelled. Calls `target` with `callData` and zero value. Reverts bubble up.
- **`cancel(messageId)`.** Guardian only. Permanent. The message stays consumed, so a replacement needs a new nonce.
- **Parameters [proposal].** `DELAY = 2 days`, `GRACE = 7 days`.
- **Consume at queue.** This makes cancellation final. Q4 asks the auditor to assess it.

### 7.7 Why a bare hash is rejected, and why Base does not check the signer set

- A hash alone is not evidence of approval. Base would be trusting whoever submitted it. Base therefore accepts only proven CoNET events.
- Base does not verify signatures. The threshold is enforced by CoNET's Safe. Base trusts the finalized CoNET state (A6), which includes the Safe's execution. This is a deliberate trust escalation. The CoNET signer set can change without Base knowing.
- Changing the relay address, the allowlist, the delay, or the owner is the Base Safe's decision. CoNET cannot change them.

### 7.8 Trust statement and latency

- **A CoNET compromise can:** pause Base paid-GB minting (and any other allowlisted pause) after the delay, unless the guardian cancels.
- **A CoNET compromise cannot:** change code, owners, the allowlist, the relay address, or the delay; move USDC; mint GB; or unpause.
- **A CoNET halt** blocks new messages. It does not affect Phase 1 owner actions on Base.
- **Latency.** With a two-day delay, a CoNET-initiated pause takes effect about two days after the proof. That is not an emergency control. The Phase 1 guardian is the emergency control. An immediate-pause variant is possible, but it gives CoNET a one-transaction denial of service on Base minting. We do not recommend it.

---

## 8. Engineering prerequisites

### 8.1 F11 settler (to build, required before any settler upgrade or handoff)

- **Layout.** F7c layout: timelock fields at slots 53 to 55, slots 49 to 52 untouched. Verified by a solc storage-layout comparison in CI against live F7 and F7c. Recorded in [memo] and [record: `docs/F7-OWNER-KEY.md`]. Re-run it; do not rely on the record.
- **Logic.** F10 logic. The `bridgePaused` check before `mintPaid` (F10 line 277). CoNET path via the authenticator. Base path via the chosen cover.
- **Base cover.** V3 recommended, because it binds the L1 header to the finalized beacon payload. V2 is the alternative. Positive acceptance on real L1 data is still pending (G-17). D8.
- **Must not use** the original cover `0x0150…` on the Base path (G-15).
- **Guardian functions.** `guardianPause()` (blocks settle; no unpause). `guardianCancelUpgrade()`. D9.
- **Upgrade expiry.** `UPGRADE_EXPIRY` **[proposal, 7 days]** after `upgradeReadyAt`, enforced in `upgradeTo`.
- **Receipt status check** in the shared receipt path (G-11).
- **Tests.** Canary-slot preservation. Pause blocks mint. Expiry. Guardian permissions. Two-step handoff. Existing 82 tests still pass.
- **Out of scope for F11.** Changes to custody business rules.

### 8.2 Pause adapter (to build; Base and CoNET)

- Immutable. No proxy. No owner-changing function. Holds the GB token address set at construction.
- One function: `pauseGb()`, which calls `GBToken.setBridgePaused(true)`.
- Access: the guardian Safe on that chain. Phase 2, if approved, adds the executor.
- Emits an event with the caller.
- No unpause. No mint. No admin management. Unauthorized calls revert.
- Because `setBridgePaused` is `onlyAdmin`, the adapter must be a GB admin. Its admin status is covered by §6.

### 8.3 Owner audit tool (to build; read-only)

- Reads every role in Appendix B and compares it with an expected-values file checked into the repository. The file contains no secrets.
- Fails if any privileged role is an EOA not on the allowlist, if any pending owner or pending upgrade exists without a matching change ticket, or if runtime code hashes differ from the records.
- Writes a JSON report. Never signs or sends.
- Run before each handoff step and on a schedule after handoff.

### 8.4 Treasury two-step upgrade (to build; Base and CoNET)

- Replace one-step `transferOwnership` with two-step ownership.
- Storage-compatible. Verify with a layout comparison.
- Tests: pending owner is set, accepted by the pending owner, and cancelable. Old owner loses control only after acceptance.

### 8.5 Deployment requirements for contracts not yet deployed

- AacHeaderAuthority and AacChainEffectV2: two-step ownership, and the owner is the Owner Safe at deployment. No EOA owner.

### 8.6 Safe deployment tooling (to build)

- Dry-run by default, with an explicit send flag. Follow the pattern in `scripts/cancelF7cUpgradeBase.mjs`.
- Computes predicted addresses. Checks runtime code. Builds transactions without sending.

### 8.7 Phase 2 prerequisites (only if approved)

- CoNET finality V2 installed at a documented snapshot, with fork version chosen by epoch (G-07).
- V2 rotation contract (G-10).
- Authenticator fixed for Fulu: finalized gindex 169 with a seven-node branch, plus Fulu fixtures (G-09).
- Receipt status check (G-11).
- Full archive-aware CoNET regression rerun (G-21).
- Relay and executor built and audited.
- CoNET Safe deployed (G-20).

---

## 9. Migration procedure (ordered)

Each step has a precondition, an action, a check, and a rollback. No owner-side step runs while another owner-side action is pending.

| # | Step | Precondition | Check | Rollback |
| --- | --- | --- | --- | --- |
| 0 | Gate: F11, pause adapter, owner audit tool, and Treasury two-step are audited. No pending upgrade or owner change on any contract | Auditor sign-off | Owner audit clean | Stop |
| 1 | Deploy Safe singleton and factory on CoNET, if the deployer method requires it | Deployer present. Base addresses known (G-20) | Runtime code hash equal to Base | None. No ownership has moved |
| 2 | Create owner and guardian Safes on Base. Create the owner Safe on CoNET with identical owners, threshold, and salt | D1 and D2 decided | Owners and threshold equal. Addresses equal only if G-20 is closed | None |
| 3 | Deploy pause adapters (Base and CoNET). The current EOA admin adds each as GB admin | Adapter audited | `admins(adapter)` = true | Owner Safe removes adapter |
| 4 | EOA `scheduleUpgrade(F11)` on the AAC proxy. Wait 2 days. EOA `upgradeTo(F11)` | F11 audited. Storage comparison passed | `implementation` = F11. Slots 49 to 55 equal before and after | Before `upgradeTo`: EOA `cancelUpgrade()` |
| 5 | AAC proxy handoff: EOA `transferOwnership(Owner Safe)`. Owner Safe `acceptOwnership()` | Step 4 done. Canary slots unchanged | `owner()` = Owner Safe. `pendingOwner()` = 0 | Before accept: EOA `transferOwnership(EOA)` |
| 6 | Ethereum checkpoint root and CoNET finality (Base): two-step handoffs | Step 0 | `owner()` = Owner Safe | As step 5 |
| 7 | Ethereum committee store: add two-step in an upgrade, or confirm the existing function, then hand off | Step 0 | `owner()` = Owner Safe | As step 5 |
| 8 | TreasuryBridgeV3 (Base and CoNET): two-step upgrade, then handoff | Step 0 (§8.4) | `owner()` = Owner Safe | As step 5 |
| 9 | GB (Base): EOA calls `addAdmin(Owner Safe)`. Owner Safe executes a no-op `addAdmin(Owner Safe)` to prove it can call admin functions. Owner Safe calls `removeAdmin(EOA)`. Owner Safe adds the pause adapter as admin after review | Owner Safe can execute | `admins(EOA)` = false. `admins(Owner Safe)` = true. Review `AdminAdded` and `AdminRemoved` events | Owner Safe calls `addAdmin(EOA)` (threshold) |
| 10 | CoNET (GB, Treasury, checkpoint, ConsumeOnce rescue): same patterns | CoNET Safe ready | Reads | As above |
| 11 | Owner audit clean. EOA retired from all privileged roles. Key material handled per policy | — | Owner audit report | — |
| 12 | Publish verification report: addresses, transaction hashes, owner-audit output | — | — | — |

---

## 10. Known gaps and blockers

| ID | Gap | Evidence | Effect on this plan | Required action | Status |
| --- | --- | --- | --- | --- | --- |
| G-01 | Canary-slot collision. Slots 49 to 51 (`pendingImplementation`, `upgradeReadyAt`, `pendingOwner`) alias the Phase C canary record in F7, F8, F10. F7b and F7c use slots 53 to 55 | [memo table]; [record: `docs/F7-OWNER-KEY.md:4, 49`] | An F8, F9, or F10 upgrade or an F7 `transferOwnership` corrupts the canary record | F11 with F7c layout (§8.1) | Open |
| G-02 | Live F7 mint path does not check GB `bridgePaused`. F8 and F10 do. F7c does not | `contracts/AacProductionCustodyGateSettlerF7.sol:214`; F8 `:234`; F10 `:277`; F7c `:255` (no check) | GB pause does not stop the live settler's mint path | F11 includes the check. Operator to confirm the live closure (G-16) | Open |
| G-03 | GB admin role is flat. Any admin can upgrade the implementation (`_authorizeUpgrade`), mint free GB (`mint`, `mintReward`, `airdrop`, `airdropEqual`) or paid GB (`mintPaid`), burn any account's paid GB (`burnPaidFrom`), change admins, change validators, pause, and unpause. CoNET's GBTokenV2 adds `consumeFree` (burns any account's free GB), `consumeGb` (any account's free GB, then paid GB), `burnFreeFrom` (admins may burn any account's free GB) and `setValidatorDepositRedeem` (sets the contract that authorizes node-wallet burns). The pause does not block admin `mintPaid` | `src/b-unit/GBToken.sol:156, 294–373, 403` (Base); `src/b-unit/GBTokenV2.sol:178, 286–293, 319–434, 477` (CoNET); [record: `docs/CUTOVER-CUSTODY.md:276`] | Any remaining EOA admin keeps full power after the pause | Restrict the admin set. Enumerate from events. Remove EOA. Add adapter only | Open |
| G-04 | GB admin can unpause (`setBridgePaused(false)`). This is the documented emergency re-enable path | [record: `docs/CUTOVER-CUSTODY.md:273`] | Guardian must not be a GB admin | Guardian uses the adapter (§8.2) | Design |
| G-05 | Treasury ownership is one-step (OpenZeppelin 5.4.0 `OwnableUpgradeable`) | `src/b-unit/TreasuryBridgeV3.sol:5, 36` | A mistyped transfer is unrecoverable | Two-step upgrade (§8.4) before handoff | Open |
| G-06 | `AacHeaderAuthority.setOwner` and `AacChainEffectV2.setOwner` are one-step | `contracts/AacHeaderAuthority.sol:33`; `contracts/AacChainEffectV2.sol:65` | Same as G-05 once deployed | Two-step before deployment | Open (pre-deployment) |
| G-07 | V1 finality hard-codes fork version `0x20000093` for every signature | `contracts/AacConetSourceFinality.sol:18`, also returned at `:302` | Post-Electra CoNET signatures fail on live Base finality. Blocks Phase 2 | V2 installed and checked (§8.7) | Open |
| G-08 | Live Base finality is stale: period 215 against CoNET head period 223 | [memo] (not re-read) | Cannot advance without rotation | V2 rotation (G-10) | Open |
| G-09 | Authenticator uses finalized gindex 105 (Deneb). CoNET is on Fulu, where the finalized root is gindex 169 with a seven-node branch | `contracts/AacConetHeaderAuthenticator.sol:40`; [memo] | Rejects current headers. Blocks Phase 2 | Parameterize by fork. Add Fulu fixtures | Open |
| G-10 | No V2 rotation contract. `AacConetSourceFinalityRotate.applyUpdate` has no caller check and inherits G-07 | `contracts/AacConetSourceFinalityRotate.sol:27` | Stale finality cannot be fixed | Build V2 rotation. Q6 | Open |
| G-11 | No explicit receipt status check in the decoding path | `contracts/AacBridgeReceiptLog.sol`; `contracts/AacReceiptMptVerifier.sol`; `contracts/AacCheckpointMessageCoverV3.sol`. Grep finds no status check | Low impact, because the EVM does not keep logs from reverted transactions. Defense in depth | Add the check and a test with a status-0 receipt | Open |
| G-12 | Scheduled upgrades never expire. `upgradeTo` checks only `block.timestamp >= upgradeReadyAt` | `contracts/AacProductionCustodyGateSettlerF7.sol:147` | A stale schedule can be executed at any later time | F11 adds expiry (§8.1) | Open |
| G-13 | CoNET GB admin-mint open. `validator-count 0`, `mint-closed no`, custody closed | [record: `docs/CUTOVER-CUSTODY.md:133`] | A valid burn proof does not show reserve backing. Base supply integrity depends on CoNET mint policy | Close or control CoNET admin-mint before relying on burn proofs. Phase 2 does not change this | Open (threat model) |
| G-14 | CoNET-side Base cover has no header-hash binding. The file contains no `keccak256` call | `contracts/AacConetBaseMessageCover.sol` | Same defect class as the original Base cover | V4 binding. Outside Phase 1 governance path, inside the audit | Open |
| G-15 | Live F7 uses the original cover `0x0150…` (constant). In the cover-binding test, with the checkpoint store mock reporting finality and the output-root mock accepting the attacker's header hash, the original cover accepts a fabricated Base header and an attacker-chosen operation | `contracts/AacProductionCustodyGateSettlerF7.sol:19, 182`; `solidity-tests/test/cover-binding.test.ts:129` | F7 is safe only while `headerFinal` is false | F11 uses V2 or V3 | Open |
| G-16 | Live F7 has no pause and no explicit closed flag. `settle` relies on `headerFinal` from the original cover. The record says `settle()` reverts | `contracts/AacProductionCustodyGateSettlerF7.sol` (`settle`, `_settleCover`); [record: `docs/CUTOVER-CUSTODY.md:168`] | The closure depends on store state and wiring, not a switch | Operator to record the exact revert condition before relying on it | Open (operator) |
| G-17 | L1 header not authenticated in V2. V3 binds it to the finalized beacon payload, but is tested only with synthetic data | `contracts/AacCheckpointMessageCoverV3.sol`; `solidity-tests/test/cover-v3-l1.test.ts` | Custody readiness depends on this | Positive acceptance with real L1 data. Electra and Fulu body support in the fixture generator | Open |
| G-18 | `AacHeaderAuthority` not deployed. Authority not populated (C1) | Repo: no deployment record | `gateConet` authority unpopulated | Deploy owned by the Owner Safe, after G-06 | Open |
| G-19 | Owner key is a hot EOA. Key material is held in a plaintext local file on the operator workstation | Operator record (location omitted) | Single point of failure until handoff | Retire at handoff. No key material in the repository | Open |
| G-20 | Same-address Safe premise unverified. CoNET has no Safe singleton or factory [memo] | §5.1 | Shared addresses may not be reproducible | Verify the deployer method (§8.6) before claiming shared addresses | Open |
| G-21 | CoNET chain-rule regression. The last completed run had two archive nodes passing and one non-archive node failing historical-state checks. Full archive-aware rerun pending | `scripts/conetHistoryRegression.mjs`; last run output held by the operator, not in the repository | Phase 2 prerequisite. Not a Phase 1 blocker | Rerun with the archive-aware script | Open |

---

## 11. Failure modes and recovery

| Scenario | Immediate response | Recovery |
| --- | --- | --- |
| Up to two owner signers lost (3-of-5) | Remaining signers proceed | Change the owner set on each chain. Each chain's Safe executes its own change |
| Threshold of owners compromised | Guardian pauses GB. After F11, guardian pauses the settler and cancels pending upgrades | Rotate owners on both chains. Stolen USDC cannot be recovered by this design. Circle freeze is outside the design (A2) |
| Guardian compromised | Denial of service only. Owner Safe unpauses if needed | Deploy a new adapter and change GB admins through the Owner Safe |
| Bad upgrade passes the delay | After F11: guardian pauses the settler. Fix forward with a new scheduled upgrade | Before F11, the GB pause does not stop F7 (G-02). This is an operational gap until F11 |
| Wrong ownership address accepted | Two-step prevents it, as long as the transfer was two-step | Owner Safe transfers again. Only possible where two-step exists (§6) |
| Safe singleton defect | Stop use of the affected Safe | Create a new Safe. Hand off each contract. Possible only because every owner contract is two-step (§6) |
| CoNET halt | Phase 1 unaffected | Phase 2 paused by nature |
| CoNET reorg beyond finality | Out of model (A6) | Not applicable to Phase 1 |

---

## 12. Verification performed for this document

1. **Repository review (read-only).** Each [repo] reference in this document was checked on 2026-10-18 against the file and line given.
2. **Test run (local, in-process Hardhat; no network).** `solidity-tests/`, 12 test files, **82 passing, 0 failing**. Toolchain: Hardhat 3.18.1; solc 0.8.35 with `viaIR`, optimizer 200 runs, `evmVersion: prague`; OpenZeppelin contracts 5.4.0. Command, from `solidity-tests/`: `npx hardhat --config ./hardhat.config.ts test test/*.test.ts`. The run required no symlink. Re-run before the freeze (§13.3).
3. **No chain was contacted for this document, and no transaction was sent.** Statements tagged [memo] come from the decision memo's 2026-10-18 read and must be re-read before any decision depends on them.
4. **Not verified in this document.** Safe addresses (not in this repository). CoNET finality numbers (memo). CoNET chain-rule regression (G-21).
5. **Not done.** Positive acceptance with real Ethereum L1 data for V2 and V3. Fulu fixtures. Fork tests against live state. Safe integration tests. Formal verification. Fuzzing of the receipt decoder.

---

## 13. Audit scope, freeze, and questions

### 13.1 In scope

- **Design.** §5 to §9 (Phase 1). §7 (Phase 2) as design review only, unless approved.
- **Contracts on the Phase 1 path.**
  - `contracts/AacProductionCustodyGateSettlerF7.sol` (live reference)
  - `contracts/AacProductionCustodyGateSettlerF7c.sol` (containment reference)
  - `contracts/AacProductionCustodyGateSettlerF8.sol`, `…F9.sol`, `…F10.sol`
  - F11 (to be built)
  - `contracts/AacCheckpointMessageCoverV2.sol`, `contracts/AacCheckpointMessageCoverV3.sol`
  - `contracts/AacSszBranch.sol`, `contracts/AacConetSourceFinalityV2.sol`, `contracts/AacConetHeaderAuthenticator.sol`
  - `contracts/AacBridgeReceiptLog.sol`, `contracts/AacReceiptMptVerifier.sol` (as used)
  - `contracts/AacHeaderAuthority.sol`, `contracts/AacChainEffectV2.sol` (C2 and C3 fixes)
  - `contracts/AacConetBaseMessageCover.sol` (G-14)
  - `contracts/AacEthereumCheckpointRootTimelock.sol`, `contracts/AacConetSourceFinalityTimelock.sol`
  - `contracts/AacConetSourceFinality.sol` (V1, reference for G-07)
  - `src/b-unit/TreasuryBridgeV3.sol` (owner functions; two-step upgrade to build)
  - `src/b-unit/GBToken.sol` (Base) and `src/b-unit/GBTokenV2.sol` (CoNET) (admin functions as used)
- **Tests.** `solidity-tests/test/` (12 files).

### 13.2 Out of scope

- Safe v1.4.1 internals. Circle USDC. Ethereum and CoNET consensus. geth. Hardware wallets. Front ends.
- CoNET-side keys and infrastructure.
- `docs/SECURITY-REVIEW-2026-10-16.md`. It belongs to another review track and is excluded from this freeze.

### 13.3 Freeze (not yet created)

Proposed: one commit containing every in-scope file, with a manifest listing the SHA-256 of each file, the Hardhat config, the solc settings, and the exact test command. At the time of writing, `git status` in `src/bridgeAAC` shows a modified `solidity-tests/hardhat.config.ts` and many untracked contracts, tests, fixtures, deployment records, documents, and scripts. The freeze is created only after operator approval (§15).

### 13.4 Questions for the auditor

- **Q1 (storage).** Is the F11 plan (F7c layout plus F10 logic) sound? Is the canary alias fully characterized?
- **Q2 (expiry and guardian cancel).** Propose the values in D9. Is guardian cancel a new risk?
- **Q3 (pause adapter).** Is the permission surface minimal? Can any GB admin path bypass a GB pause, such as direct `mintPaid` by the AAC proxy? What exactly does the pause protect?
- **Q4 (Treasury upgrade).** Is the two-step upgrade storage-compatible? Any issue with a pending owner across the upgrade?
- **Q5 (owner audit).** Is Appendix B complete? Are there privileged functions missing from it?
- **Q6 (CoNET trust root).** Is one-shot install at a chosen snapshot acceptable? What must the install procedure prove to a reviewer?
- **Q7 (Phase 2, if considered).** Is the `messageId` construction sufficient for domain separation? Are there replay paths across relays or executors? Is consume-at-queue correct? Is `execute` safe against reentrancy?
- **Q8 (receipt decoding).** Consider log-index ambiguity, duplicate topics, emitter spoofing, and status handling.
- **Q9 (Safe configuration).** Are "no modules, no guard, MultiSend-only delegatecall" sufficient? SafeL2 or plain?
- **Q10 (delay).** Is two days adequate for T2 and T3?
- **Q11 (privileges).** Do GBToken, Treasury, or ConsumeOnce hold privileges beyond Appendix B?
- **Q12 (architecture).** Is it right to keep Base custody under Base governance, with no CoNET upgrade authority? Are there designs that reduce single-chain failure modes further?

### 13.5 Note on this document's origin

The operator team drafted this document with AI assistance. Every claim should be verified independently. Report any error to the operator.

---

## 14. Decisions required from the operator

| ID | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| D1 | Owner signers and threshold | Five people, 3-of-5 | Open |
| D2 | Guardian signers and threshold, per chain | 2-of-3, distinct people from the owners | Open |
| D3 | Phase 2 (CoNET-to-Base pause executor) | Defer. Do not build now | Open |
| D4 | Confirm the 2026-10-15 handoff withdrawal is superseded | Yes | Open |
| D5 | Build F11, the pause adapter, and the owner audit tool (engineering only, no chain actions) | Yes | Open |
| D6 | Build the Treasury two-step upgrade (engineering only) | Yes | Open |
| D7 | Safe singleton variant and guard | SafeL2 if available on both chains, for event visibility. Guard that blocks module enablement and non-MultiSend delegatecall | Open |
| D8 | Base cover for F11 | V3 | Open |
| D9 | Guardian cancel and upgrade expiry | Guardian cancel allowed. Expiry 7 days | Open |
| D10 | Approve handoff to a third-party auditor, and the freeze | Not before §15 is met | Open |

---

## 15. Distribution and approval

- No copy of this document leaves the operator without written approval.
- Before handoff, all of the following must hold:
  - The freeze exists (§13.3).
  - D1 to D9 are decided, or explicitly deferred with the auditor told which parts are design-only.
  - The audit firm is under confidentiality terms. **[TBD]**
  - Every [memo] fact has been re-read on-chain (read-only) immediately before handoff.
- Do not publish this document or link to it publicly.

---

## Appendix A. Address and transaction registry

| Item | Chain | Value | Source |
| --- | --- | --- | --- |
| AAC settlement proxy | Base | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` | [repo] `{OWNER_KEY_FILE}`; [memo] |
| Live F7 implementation | Base | `0x29e10621fF159422237d2a0B9F020303F9BDdD12` | [repo] `deployments/containment-f7c-cancel-base.json` |
| F7c (pending, cancelled) | Base | `0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44` | [repo] `deployments/containment-f7c-cancel-base.json` |
| Original Base cover (constant in F7) | Base | `0x01506527a4Dab14141038Db15f5341dcF4729233` | [repo] `contracts/AacProductionCustodyGateSettlerF7.sol:19` |
| Base cover V2 (unwired) | Base | `0x68c2aC69E8F0A81685693D48C5e9B07f0228d394` | [repo] `deployments/base-AacCheckpointMessageCoverV2.json` |
| TreasuryBridgeV3 | Base and CoNET | `0xa208982212978550594A7FEEB70a61665d129003` | [memo]; [repo] `{OWNER_KEY_FILE}` |
| Ethereum checkpoint root | Base | `0xcEE3D699df3df07a573f1aFf642888B97B7aA961` | [memo] |
| Checkpoint root timelock implementation | Base | `0x4880137b52d040BD387504bEA2a04C3898879DDa` | [repo] `deployments/phase-security-gaps.json` |
| CoNET finality (V1 family) | Base | `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` | [memo] |
| Ethereum committee store | Base | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` | [memo] |
| GBToken (Base); GBTokenV2 (CoNET) | Base and CoNET | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` | [repo] `docs/CUTOVER-CUSTODY.md:167` |
| ConsumeOnce | Base | `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F` | [memo] |
| Ethereum checkpoint | CoNET | `0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a` | [memo] |
| ConsumeOnce proxy | CoNET | `0xA13843C75f68F726e1DC4dbA75d07597EE18d999` | [memo] |
| Owner EOA | Base and CoNET | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` | [repo] `{OWNER_KEY_FILE}`; [memo] |
| Safe v1.4.1 singleton (plain) | Base | `0x41675C099F32341bf84BFc5382aF534df5C7461a` | Research session. Re-verify (G-20) |
| Safe v1.4.1 proxy factory | Base | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | Research session. Re-verify (G-20) |
| Arachnid deterministic deployer | Base and CoNET | `0x4e59b44847b379578588920ca78fbf26c0b4956c` | [memo] |
| Phase B txs (AAC added as GB admin) | CoNET, Base | `0x0cea02390f02594a722f9ff90d1e45219332fd509dca6f104996608d32603604`, `0xc41287df1815ed9b8bd88fa4bdf3639823c2a674dc5def65d19941f78eca336a` | [repo] `deployments/phase-B-gb-addAdmin-aac.json` |
| Phase D txs (GB paused) | CoNET, Base | `0x3a0c47577076fe65ab42ed3759be8aca9992fba4ef04568a12ba2aa537968040`, `0xd0732bdebadd70b83a116b71937020ba50a75df2ed135cd8ab0c20097e5ac4f0` | [repo] `deployments/phase-D-gb-setBridgePaused.json` |
| F7c cancel tx | Base | `0x5e0ac9068745b7cc45599e8b0342bafd16ee1f385dbe67ff62e87bdeaf977724` (block 52704286) | [repo] `deployments/containment-f7c-cancel-base.json` |

## Appendix B. Privileged-role inventory

| Contract (chain) | Privileged functions | Guard | Expected final holder |
| --- | --- | --- | --- |
| AAC proxy F7 (Base) | `scheduleUpgrade`, `cancelUpgrade`, `upgradeTo`, `transferOwnership` | `msg.sender == owner` [repo: F7 lines 128–157] | Owner Safe (Base) |
| AAC proxy F7 (Base) | `acceptOwnership` | `msg.sender == pendingOwner` [repo: F7 line 161] | Owner Safe (Base) |
| GBToken (Base); GBTokenV2 (CoNET) | `addAdmin`, `removeAdmin`, `addValidator`, `removeValidator`, `setBridgePaused`, `mint`, `mintReward`, `mintPaid`, `airdrop`, `airdropEqual`, `burnPaidFrom`, `_authorizeUpgrade`; GBTokenV2 also `consumeFree`, `consumeGb`, `setValidatorDepositRedeem` | `admins[msg.sender]` [repo: `GBToken.sol:133`] | Owner Safe (admin). Pause adapter (admin; can only pause) |
| TreasuryBridgeV3 (Base and CoNET) | `transferOwnership` (one-step) and all `onlyOwner` functions | OpenZeppelin `onlyOwner` | Owner Safe, after two-step upgrade |
| TreasuryBridgeV3 (Base and CoNET) | Miner-vote functions. `voteBridgeOperation` closed [record] | Per source | Enumerate. Leave closed |
| Checkpoint root timelock (Base) | `scheduleUpgrade`, `upgradeTo`, `transferOwnership`, `acceptOwnership` | Owner or pending owner | Owner Safe |
| CoNET finality (Base) | `install` (one-shot), `scheduleUpgrade`, `upgradeTo`, `transferOwnership`, `acceptOwnership` | Owner or pending owner [repo: `AacConetSourceFinality.sol:86`] | Owner Safe |
| Committee store (Base) | `upgradeTo` [memo] | Owner | Owner Safe, after the ownership function is confirmed (§6) |
| ConsumeOnce (Base) | Role-based [memo] | Roles | To enumerate |
| ConsumeOnce (CoNET) | Rescue | `rescueAdmin` [memo] | CoNET Safe |
| Ethereum checkpoint (CoNET) | Owner functions | Owner [memo] | CoNET Safe |
| AacHeaderAuthority (not deployed) | `setOwner`, `setVerifier`, `revoke` | Owner [repo: `AacHeaderAuthority.sol:33, 38, 52`] | Owner Safe |
| AacChainEffectV2 (not deployed) | `setOwner`, route and cap configuration | Owner [repo: `AacChainEffectV2.sol:65`] | Owner Safe |

## Appendix C. Glossary

- **AAC.** The cross-chain verification and effect framework in this repository.
- **BLS aggregate.** The aggregated sync-committee signature over a beacon header.
- **Canary record.** A Phase C record occupying storage slots 49 to 52 of the live settler.
- **Consume-once.** An operation identifier can be consumed at most one time.
- **gindex.** Generalized index of a leaf in an SSZ Merkle tree.
- **Owner Safe.** The Safe that owns contracts on one chain.
- **Guardian Safe.** The pause-only Safe on one chain.
- **Pause adapter.** An immutable contract that is a GB admin and exposes only `pauseGb()`.
- **Timelock.** The delay between `scheduleUpgrade` and `upgradeTo`.
- **Two-step ownership.** Transfer sets a pending owner. The pending owner must accept.
