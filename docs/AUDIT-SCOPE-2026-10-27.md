# bridgeAAC audit scope (draft, 2026-10-27)

**Status: DRAFT.** Not frozen. Not sent to any auditor. Handoff needs the owner's approval of this scope and the name of the recipient.

This scope covers the Base and CoNET cover versions, the CoNET header verifiers, the CoNET BLS finality check, settlers F9 and F10, the chain-effect C2/C3 fixes, and the Treasury integration. The cutover gate scope stays in [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) §3. Auditor eligibility and the acceptance form follow §2 of that document.

---

## 1. Pinned code

| Repository | Candidate pin | Covers |
|---|---|---|
| `src/bridgeAAC`, branch `docs/external-treasury-acceptance-2026-10-26` | `7756ffb` | Covers, verifiers, settlers, chain effect, tests |
| Parent repository, branch `feat/external-treasury-units` | `3ed37d29` | `src/b-unit/TreasuryBridgeV3.sol` (not changed by this work) |

The freeze commit records both SHAs in the engagement letter. The auditor audits only the files listed in §2. Files outside the pin are not in scope.

---

## 2. In-scope items

| ID | Component | Files | Status at pin |
|---|---|---|---|
| S1 | CoNET finality V2 and BLS aggregate check | `contracts/AacConetSourceFinalityV2.sol` | Code and tests (`conet-bls-v2`, 4). Fork version by epoch: `0x20000093` before epoch 56902, `0x20000094` before 57050, `0x20000095` from 57050. No deployment record in `deployments/` (G-07). |
| S2 | CoNET header verifier | `contracts/AacConetHeaderAuthenticator.sol`, `contracts/AacSszBranch.sol`, `contracts/AacBridgeReceiptLog.sol`, `contracts/AacReceiptMptVerifier.sol` | Code and tests (`conet-authenticator`, 7). Accepts Deneb-layout headers only: finalized root at gindex 105, execution payload at gindex 6444. Electra and Fulu layouts are not handled (G-09). |
| S3 | Base cover V2 | `contracts/AacCheckpointMessageCoverV2.sol` | Deployed at Base `0x68c2aC69E8F0A81685693D48C5e9B07f0228d394`. Not wired. Binds the Base header hash to the L1 output-root anchor, but does not authenticate the L1 header (G-17). **Not sound for custody. Do not wire.** Audited as the defect record. |
| S4 | Base cover V3 | `contracts/AacCheckpointMessageCoverV3.sol` | Adds the L1 header binding to the finalized beacon payload (gindex 6444, 12-node branch). Tests `cover-v3-l1` (5), synthetic data only. No deployment record. Not wired. Real-data acceptance pending (G-17). |
| S5 | CoNET-side Base cover V4 | `contracts/AacConetBaseMessageCoverV4.sol` (commit `de17a8b`) | Binds the Base header hash to the output-root anchor and the L1 header to the finalized payload. No owner, no upgrade path. Tests `conet-base-cover-v4` (15). No deployment record. No settler uses it. Replaces the unbound CoNET-side cover (G-14). |
| S6 | Settler F9 | `contracts/AacProductionCustodyGateSettlerF9.sol` | F8 storage layout. Base path calls the cover passed to the constructor. The contract's natspec names V2 (see D1). Tests `f9-light-gate` (6). No deployment record. |
| S7 | Settler F10 | `contracts/AacProductionCustodyGateSettlerF10.sol` | F9 plus the CoNET path, which calls `AacConetHeaderAuthenticator` in the same call. Tests `f10-conet-settler` (6). No deployment record. |
| S8 | Chain effect, C2 and C3 fixes | `contracts/AacChainEffectV2.sol` | Route allowlist per `(asset, mode)` with a per-operation cap (C2). `consumed[operationId]` blocks replay (C3). `bridgePaused` is checked before `mintPaid` (C3). Only the settler may call `complete`. Tests `fix.test.ts` (25). No deployment record. |
| S9 | Treasury integration | `src/b-unit/TreasuryBridgeV3.sol` (parent repository) | Unchanged by this work. `completeFromAac` accepts calls only from `aacExecutor`. Auditor confirms that `aacExecutor` is `AacChainEffectV2` on each chain and nothing else. Ownership is one-step (G-05). |
| S10 | C1 header authority and gate | `contracts/AacHeaderAuthority.sol`, `contracts/AacAuthenticatedHeaderGate.sol`, `contracts/AacConetBaseSettlerV2.sol` (commit `5d8ba86`) | Code only. `AacHeaderAuthority` is not deployed (G-18). No contract in this repository calls `AacHeaderAuthority.authenticate`. The CoNET path in F10 calls the authenticator directly (S7). |

---

## 3. Assumptions

The security of the items above rests on these cryptographic primitives:

- **Hash functions.** keccak-256 is preimage- and collision-resistant (MPT receipt proofs, Base output roots, `operationId`, `consumeOnce` keys). SHA-256 is collision-resistant (SSZ merkleization and the beacon branches).
- **Signatures.** secp256k1 ECDSA is unforgeable, so `ecrecover` in the relay verifiers accepts only attestations from the signer keys.
- **Pairing group.** BLS12-381 aggregate signatures are unforgeable (sync committee; EIP-2537 precompiles `0x0b`–`0x11`).

**Not assumed:** the Exponential Time Hypothesis (ETH), the Strong ETH (SETH), Gap-ETH, or any NP-hardness statement. A search of `src/bridgeAAC` and `docs/` on 2026-10-27 found no gate or proof that depends on them. An unreviewed preprint dated 2026-10-25 claims ETH is false ([openai/math](https://github.com/openai/math/blob/main/preprints/The-Exponential-Time-Hypothesis-is-False-October-25-2026/paper.pdf)). It contains no algorithm for discrete logarithms or for keccak-256 or SHA-256 preimages, so it does not affect the three assumptions above.

Governance and operational assumptions are listed in [OWNER-MULTISIG-WHITEPAPER-2026-10-18.md](OWNER-MULTISIG-WHITEPAPER-2026-10-18.md) §4.1.

---

## 4. Known defects and open items

The auditor reads this section before testing. Each row names the scope items it affects.

| ID | Item | Affects | Status at pin | Auditor task |
|---|---|---|---|---|
| D1 | **G-17.** V2 does not authenticate the L1 header. F9 and F10 take the Base cover as a constructor argument, and their natspec names V2. The intended cover is V3, which the owner must confirm before any deployment. | S3, S6, S7 | Open | Confirm that no deployment passes V2 as the Base cover. Confirm that V3 has the same `cover` call shape that F9 and F10 use. |
| D2 | **G-09.** The header verifier handles the Deneb layout only. CoNET is past the Electra and Fulu forks. | S2, S7 | Open | Confirm that Electra- and Fulu-layout headers are rejected, not accepted. |
| D3 | **G-01.** Storage slots 49 to 51 alias the canary record in F7, F8 and F10. F9 has the F8 layout. | S6, S7, any upgrade | Open | Compare storage layouts of F7, F8, F9, F10 and the live proxy (dry run in §4.1). No upgrade into F9 or F10 until resolved. |
| D4 | **G-12.** Scheduled upgrades never expire. F9 and F10 use `upgradeReadyAt` with no expiry check. | S6, S7 | Open | Confirm. Expiry is an open fix. |
| D5 | **G-05, G-06.** One-step ownership in `TreasuryBridgeV3` (S9) and in `AacChainEffectV2.setOwner` (S8, `contracts/AacChainEffectV2.sol:65`). | S8, S9 | Open. Pre-deployment for S8. | Confirm the handoff path before deployment. |
| D6 | **G-11.** No explicit receipt status check. Logs of reverted calls are not emitted, so the impact is low. | S2, S4 | Open | Note only. |
| D7 | **G-18.** `AacHeaderAuthority` is not deployed, so the C1 gate has no authority data. | S10 | Open | Confirm that the gate fails closed without it. |
| D8 | **G-07.** The V1 finality contract hard-codes `0x20000093`. V2 exists in code only. | S1 | V2 in code; no deployment record | Confirm that V2 is the only path after installation. |
| D9 | **G-14.** The earlier CoNET-side cover did not bind the Base header. | S5 | Fixed in code (V4). Not deployed. | Verify the binding. |
| D10 | **G-02.** The live F7 settler lacks the GB pause check. F9 (`AacProductionCustodyGateSettlerF9.sol:246`) and F10 (`AacProductionCustodyGateSettlerF10.sol:277`) have it. | S6, S7 | Closed in code | Verify. |

Live-path issues are disclosed but out of scope (see §6): G-02 on live F7, G-15 (original cover `0x0150…`), G-16 (no pause or closed flag on live F7), G-03 and G-04 (GB admin roles), G-13 (CoNET GB mint policy), G-19 (owner key), G-20 (Safe premise).

### 4.1 Verification record, 2026-10-28

Checked against the source, the existing tests and read-only RPC on Base (chain 8453). No transaction was sent and no contract was changed.

- **D1.** `AacCheckpointMessageCoverV2.cover` and `AacCheckpointMessageCoverV3.cover` have the same parameters and return values. F9 calls `cover` through the V2 type (`AacProductionCustodyGateSettlerF9.sol:213`), so V3 can be passed as the Base cover without a code change. The owner still decides which cover to pass. The F9 natspec still names V2 (lines 27–29).
- **D2.** `AacConetHeaderAuthenticator` uses fixed Deneb values (`FINALIZED_GINDEX = 105`, `PAYLOAD_GINDEX = 6444`, fixed branch lengths) and has no fork check. No test shows that an Electra- or Fulu-layout header is rejected. `conet-bls-v2` selects the fork version by epoch, but the header path does not. Electra and Fulu fixtures are needed before this can be closed.
- **D3.** Verified in part. `F7`, `F8`, `F9` and `F10` have identical storage layouts: `__gap` at slots 2–48, `pendingImplementation` at 49, `upgradeReadyAt` at 50 and `pendingOwner` at 51. `AacProductionCustodyGateSettlerCanary` stores `canaryMintDone` at 49, `canaryUsedAacId` at 50, `canaryRecipient` at 51 and `canaryAmountMinted` at 52. On the live Base proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` (ERC-1967 implementation `0x29e10621fF159422237d2a0B9F020303F9BDdD12`, F7), read on 2026-10-28:
  - Slots 49 and 50 are 0. `cancelUpgrade()` (F7 lines 135–139) writes both, so the canary's `canaryMintDone` and `canaryUsedAacId` no longer exist in storage. Cancel transaction `0x5e0ac9068745b7cc45599e8b0342bafd16ee1f385dbe67ff62e87bdeaf977724`, block 52704286.
  - Slot 51 is `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`, the owner. `pendingOwner` therefore equals the owner, and `acceptOwnership()` from any other address reverts. No third-party takeover path exists at this value.
  - Slot 52 is `10000000` (`0x989680`), the canary amount.
  The residue is a latent defect. Before any upgrade into F9 or F10, `pendingOwner` must be cleared, and the canary provenance must come from the transaction history, not from storage. The F7b record (`deployments/phase-F7b-storage-fix.json`) planned `repairCanaryRecord()` after an upgrade that was never executed. F7c was cancelled by containment.
- **D4.** Confirmed. `upgradeTo` in F9 (line 177) and F10 (line 208) checks only `upgradeReadyAt == 0 || block.timestamp < upgradeReadyAt`. Nothing bounds the window from above.
- **D5.** Confirmed. `AacChainEffectV2.setOwner` (line 65) is one-step. `TreasuryBridgeV3` uses OpenZeppelin `OwnableUpgradeable`, which is also one-step.
- **D7.** `AacAuthenticatedHeaderGate` reverts in its constructor if the authority, the Base cover or the CoNET inclusion address is zero (line 28). A gate cannot be deployed without an authority. The behaviour of a contract deployed at the authority address is not tested.
- **D9.** `conet-base-cover-v4` has 15 tests, including negative cases for the Base header binding, the receipts root, the L1 payload branch and the store proof. This is evidence, not an audit result.
- **D10.** F9 (line 246) and F10 (line 277) check `bridgePaused()` before `mintPaid`. Tests `f9-light-gate` and `f10-conet-settler` refuse minting while the bridge is paused. F7 has no such check.
- **Operational-detail scan.** The handoff documents contain no home paths, no `user@host` strings and no key file names. The only addresses are `127.0.0.1` and placeholders such as `{CONET_NODE_C}`.

---

## 5. Evidence pack

| Item | Location or command |
|---|---|
| Solidity tests | `npx hardhat test solidity-tests/test/*.test.ts` in `src/bridgeAAC`. Run on 2026-10-27 against the candidate tree: 115 passing, 0 failing. |
| Compiler and EVM | `pragma solidity 0.8.35`. Hardhat `evmVersion` is `prague` (`hardhat.config.ts` at the root of `src/bridgeAAC`). |
| CoNET chain-rule regression | `scripts/conetHistoryRegression.mjs`. Read-only. Needs `CONET_SSH_USER` and `CONET_NODES_FILE`. The node list is not in the repository. Latest run against four archive nodes: all checks pass. |
| CoNET fixtures | `solidity-tests/fixtures/conet-*.json`. Deneb-era, slots 1745494 and 1804388. |
| V2 Base deployment | `deployments/base-AacCheckpointMessageCoverV2.json`, `deployments/base-AacCheckpointMessageCoverV2-standard-input.json` |
| V2 read-only acceptance | `deployments/base-AacCheckpointMessageCoverV2-acceptance.json`, `scripts/acceptAacCheckpointMessageCoverV2Base.mjs` |
| F7c containment | `deployments/containment-f7c-cancel-base.json` |
| Storage layouts | Not in the repository. Generate from the compiler `storageLayout` output for F7, F8, F9, F10 at the freeze SHA. A dry run on 2026-10-28 is in §4.1 (D3). |

---

## 6. Out of scope

- The Rust gateway (`bridge-aac`) and the reproducible release build.
- The live F7 proxy and cutover phases B to D (see [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) §3).
- Owner multisig deployment, Safe setup and key custody (G-19, G-20). The multisig whitepaper is reference only.
- CoNET GB supply and mint policy (G-13), and GB admin roles (G-03, G-04).
- Phase 2 rotation (G-08, G-10).
- Economic parameters: route caps and canary amounts.

---

## 7. Non-claims

- Passing tests are not an audit result.
- The candidate is not safe to wire. V2 is unsound by design. V3 and V4 have no real-data acceptance.
- No deployment, role grant or on-chain action is authorized by this document.
- No claim about CoNET consensus safety (assumption A9 of the owner whitepaper).

---

## 8. Before handoff (owner checklist)

- [ ] Owner approves this scope and names the recipient.
- [ ] Owner decides the Base cover for F9 and F10 (D1).
- [ ] Commit this document together with `docs/INDEPENDENT-AUDIT.md` §3.1. Record the freeze SHA for `src/bridgeAAC` and for the parent repository.
- [ ] Keep these out of the freeze commit: uncommitted edits to `contracts/cmg/CmgRegistryTestnet.sol`, `docs/THIRD-PARTY-ACCEPTANCE.md` and `docs/CMG-CONET-TESTNET-MANIFEST-DRAFT-2026-10-19.md`; untracked `docs/SECURITY-REVIEW-2026-10-16.md`.
- [ ] Generate storage layouts and rerun the test command on the freeze SHA.
- [ ] Scan the handoff copy for operational details: host addresses, account names, home paths and key locations.
