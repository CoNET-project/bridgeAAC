# Owner multisig: what needs it, on which chain (2026-10-18)

Read-only research. No transaction was sent. Signer identities and the threshold are not decided here.

## Live state (read on-chain 2026-10-18)

Base (8453), `owner()` of each contract:

| Contract | Address | Owner now | Ownership functions in the live implementation |
| --- | --- | --- | --- |
| AAC settlement proxy (live impl `0x29e1…`) | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` | EOA `0x87cA…05E1` | `transferOwnership`, `acceptOwnership`, `scheduleUpgrade`, `upgradeTo`. **Storage aliased**, see below |
| TreasuryBridgeV3 (impl `0xA33c…`) | `0xa208982212978550594A7FEEB70a61665d129003` | EOA | `transferOwnership` only, **one-step** |
| CheckpointRoot (impl `0x4880…`) | `0xcEE3D699df3df07a573f1aFf642888B97B7aA961` | EOA | two-step (`transferOwnership`, `acceptOwnership`), `upgradeTo`, `scheduleUpgrade` |
| Finality (impl `0x2e92…`) | `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` | EOA | two-step, `upgradeTo`, `scheduleUpgrade` |
| Ethereum committee store | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` | EOA | `upgradeTo` |
| GB token | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` | EOA is an admin (no `owner()`) | admin set: `mintPaid`, `bridgePaused` |
| ConsumeOnce | `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F` | no `owner()` | role-based |
| Treasury `miners()` | same as Treasury | EOA only | USDC vote closed; paid-GB vote paused |

CoNET (224422), read through a team CoNET node's IPC:

| Contract | Owner now |
| --- | --- |
| Ethereum checkpoint `0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a` | EOA |
| Treasury `0xa208982212978550594A7FEEB70a61665d129003` | EOA |
| ConsumeOnce proxy `0xA13843C75f68F726e1DC4dbA75d07597EE18d999` | `rescueAdmin` = EOA |
| GB token (CoNET) admin | EOA (per CUTOVER records) |
| Covers, settlers, effects, probes | no `owner()` (fixed or constructor-set) |

The EOA is `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` on both chains. Its key is held in a plaintext local file on the operator's workstation. The location is in the operator's internal runbook.

## The blocker for the settlement proxy

The owner withdrew the owner-to-multisig handoff on 2026-10-15 (F7-OWNER-KEY.md, CUTOVER-CUSTODY.md). The record says no multisig address was named and the live F7 aliases its owner-handoff slot.

Measured with solc storage layouts:

| Settler | `pendingImplementation` | `upgradeReadyAt` | `pendingOwner` | Clean? |
| --- | --- | --- | --- | --- |
| F7, F8, F10 | slot 49 | slot 50 | slot 51 | **no**: slots 49–52 hold the Phase C canary record |
| F7b, F7c | slot 53 | slot 54 | slot 55 | yes |

So a settler with the F8, F9, or F10 layout cannot be upgraded onto the live proxy without corrupting the canary record, and its `transferOwnership` writes into that record. **The F9 and F10 we built are not safe to upgrade to as they stand.** Before any owner handoff, a settler with the F7c layout and the F10 logic must exist (call it F11). It must be built, tested, and storage-compared before use.

## Decision: which items need a multisig

All of these are owner-only today. Each needs a multisig, with the 48-hour delay where the contract already has one:

1. **AAC settlement proxy (Base)**. Can upgrade the custody logic and move GB mint authority. Highest priority, after F11 exists.
2. **TreasuryBridgeV3 (Base)**. Holds Circle USDC. The implementation has only a one-step `transferOwnership`, so a mistyped address is unrecoverable. Upgrade to a two-step version before the handoff, or verify the Safe address off-chain first.
3. **CheckpointRoot (Base)**. Decides which Ethereum committee is the trust root (`install`, one-shot). Upgrades change verification logic. Two-step handoff is available.
4. **Finality (Base)**. Rotation and upgrades. Two-step handoff is available.
5. **Ethereum committee store (Base)**. Upgrade-only. Low risk. Move it into the same Safe rather than leave a stray EOA with authority.
6. **GB token admin set (Base and CoNET)**. Mint and pause authority. Add the Safe as admin, then remove the EOA once verified.
7. **Treasury miner roles (Base and CoNET)**. The USDC vote is closed and paid-GB is paused, so these should be removed, not transferred.
8. **ConsumeOnce rescue admin (CoNET)**, and any Base equivalent. Moves funds on rescue. Change to the Safe.
9. **Ethereum checkpoint on CoNET (`0x52b3…`)**. Same role as item 3, on CoNET.
10. **AacHeaderAuthority (C1, not yet deployed)**. Must be owned by the multisig from deployment. Do not deploy with an EOA owner.

Items that do not need a multisig: the V2 cover deployed at `0x68c2…d394` (no owner, unwired; must not be wired), the probes, the covers, the settlers without `owner()`.

## Which chain: both, one Safe per chain

- Every admin call executes on the chain that holds the contract. Base holds the custody gate and the USDC, so **Base is first**. CoNET holds the conet-USDC, GB admin, the Ethereum checkpoint, and the ConsumeOnce rescue, so **CoNET is second and is required, not optional**.
- A Safe is a contract. Base has the canonical Safe deployment. CoNET does not, so its Safe singleton and factory must be deployed on CoNET first. That is a chain transaction and needs the signers.
- Use the same signer set on both chains. Deploying the same Safe address on both (CREATE2) makes the owner unambiguous.

## Signer model (recommendation, the numbers need your decision)

- Safe threshold 3-of-5, five hardware wallets held by five different people.
- Timelock (48 hours) on upgrades and ownership changes, as already built into the settler and the CheckpointRoot timelock variant.
- A separate guardian Safe that can pause without the timelock, for emergencies only (GB `bridgePaused`, the containment actions). Its threshold must be lower than the owner Safe's, for speed.
- The EOA key in the operator's local key file is retired after the last role moves. Until then it is the single point of failure.

## Order of operations

0. Build F11 (F10 logic, F7c layout). Test it. Compare storage with F7c. No chain action.
1. Deploy the Safe on Base, and the Safe singleton on CoNET then the Safe. Needs signers.
2. Base: EOA schedules the F11 upgrade (48 hours), then upgrades the AAC proxy.
3. Base: EOA `transferOwnership(Safe)` on the AAC proxy. Safe `acceptOwnership`. Verify `owner()`.
4. Base: Checkpoint and Finality, two-step. Treasury: upgrade to two-step first, then hand off.
5. Base: GB admin add Safe, remove EOA. ConsumeOnce rescue admin to Safe.
6. CoNET: checkpoint, Treasury, GB admin, ConsumeOnce rescue to CoNET Safe.
7. Verify every `owner()` and admin read equals the Safe. Retire the EOA key.

Rule: no step runs while another owner-side scheduled action is pending. The F7c schedule was cancelled on 2026-10-18.

## Questions for the owner (not decided here)

1. The five signers: names and addresses. Threshold: 3-of-5 as recommended, or another?
2. The guardian (pause) signers and threshold.
3. Confirm the decision reversal: the 2026-10-15 withdrawal said no multisig was needed. This memo says it is needed on both chains.
4. Approve building F11 now, before any chain action.

## Addendum: can the Base settlement owner be a multisig on CoNET? (2026-10-18)

Short answer: not directly. A Safe on CoNET is a CoNET account. Base contracts only accept calls from Base accounts. So the Base owner has to be a Base contract (an executor) that accepts governance messages from CoNET only after AAC-style proofs.

How the executor would check the CoNET signers (if this path is built):
1. The CoNET Safe calls a relay contract on CoNET. The relay accepts only `msg.sender == SAFE`, so the Safe threshold is enforced on CoNET.
2. The relay emits `Message(nonce, targetChain=8453, target, calldata, deadline)`.
3. On Base, the executor verifies: the CoNET header (BLS aggregate, finality, payload branch, keccak), the receipt inclusion under that header's receiptsRoot, the emitter address and topic, the nonce (consume-once), the deadline, and a selector allowlist.

What Base can prove: the message was executed on finalized CoNET with the Safe as `msg.sender`. What Base cannot prove without state proofs: the current CoNET signer set. Signer-set changes need their own governance messages or a storage proof.

Blockers found in this check (read-only):
- Base finality for CoNET (`0xE4f6`): period 215, snapshot slot 1763456, rootReady true. CoNET head is period 223 (slot 1833539, epoch 57298, Fulu). It is 8 periods behind and cannot rotate.
- The finality family (`AacConetSourceFinality` V1, Timelock, Rotate) hard-codes the signing fork version `0x20000093`. Signatures after Electra and Fulu fail. `applyUpdate` in the Rotate contract is permissionless, which is correct, but it inherits the same fork-version bug.
- `AacConetHeaderAuthenticator` uses finality gindex 105 (Deneb). CoNET is Fulu, where the finalized root is gindex 169 with a 7-node branch. The authenticator is therefore invalid for the current chain. Its fixtures are from Deneb epoch 56386, so the tests did not catch this.
- Payload gindex 6444 is expected to be unchanged for Electra and Fulu bodies (`execution_requests` is appended after index 11). This is not yet verified on a real Fulu block.
- CoNET has no Safe v1.4.1 singleton or factory. The deterministic deployer (Arachnid) is present, so the same Safe address can be produced on both chains. Base has the Safe v1.4.1 singleton and factory.

Recommendation: keep Base custody under a Base Safe and CoNET admin under a CoNET Safe, with the same signer set and the same CREATE2 address on both chains. Do not put Base custody under CoNET governance until the blockers above are fixed, the executor is audited, and a Base-side pause-only guardian exists.

Trust escalation if CoNET governs Base: Base custody and upgrades would depend on CoNET consensus, the CoNET sync committee, and the CoNET Safe signers. A CoNET halt would stop emergency upgrades on Base. A CoNET compromise would control Base assets. Latency is about two CoNET epochs for finality plus the relayer and the 48-hour upgrade delay.
