# bridgeAAC audit scope (draft, 2026-10-27, updated 2026-10-28)

**Status: DRAFT.** Not frozen. Not sent to any auditor. Handoff needs the owner's approval of this scope and the name of the recipient.

This scope covers the Base and CoNET cover versions, the CoNET header verifiers (Deneb and Fulu), the CoNET BLS finality check, settlers F9, F10 and F11, the chain-effect C2/C3 fixes, the two-step owner handoffs, and the Treasury integration. The cutover gate scope stays in [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) §3. Auditor eligibility and the acceptance form follow §2 of that document. The blockers that remain before an audit can start are listed in [AUDIT-READINESS-2026-10-28.md](AUDIT-READINESS-2026-10-28.md).

---

## 1. Pinned code

| Repository | Candidate pin | Covers |
|---|---|---|
| `src/bridgeAAC`, branch `feat/aac-f11-and-ownership` | `1c6b3e8` (a test-only fix over `7d6c93d`) | Covers, verifiers (Deneb and Fulu), settlers (F11), chain effect and header authority (two-step handoff), tests, fixtures |
| `src/bridgeAAC`, branch `docs/aac-audit-scope-2026-10-28` (PR #1) | the commit that contains this document | This scope, `INDEPENDENT-AUDIT.md` §3.1, the readiness record |
| Parent repository, branch `feat/external-treasury-units` | `3ed37d29` | `src/b-unit/TreasuryBridgeV3.sol` (not changed by this work) |

The freeze commit records the SHAs in the engagement letter. The auditor audits only the files listed in §2. Files outside the pin are not in scope.

---

## 2. In-scope items

| ID | Component | Files | Status at pin |
|---|---|---|---|
| S1 | CoNET finality V2 and BLS aggregate check | `contracts/AacConetSourceFinalityV2.sol` | Code and tests (`conet-bls-v2`, 4). Fork version by epoch: `0x20000093` before epoch 56902, `0x20000094` before 57050, `0x20000095` from 57050. Used as the source of S12. No deployment record in `deployments/` (G-07). Not yet installed on Base for CoNET headers (D2). |
| S2 | CoNET header verifier, Deneb (history) | `contracts/AacConetHeaderAuthenticator.sol`, `contracts/AacSszBranch.sol`, `contracts/AacBridgeReceiptLog.sol`, `contracts/AacReceiptMptVerifier.sol` | Code and tests (`conet-authenticator`, 7). Deneb layout only: finalized root at gindex 105 with a 6-node branch, execution payload at gindex 6444. Kept for the Deneb-era fixtures. Not for CoNET headers after the Fulu fork (see S12, D2). |
| S3 | Base cover V2 | `contracts/AacCheckpointMessageCoverV2.sol` | Deployed at Base `0x68c2aC69E8F0A81685693D48C5e9B07f0228d394`. Not wired. Binds the Base header hash to the L1 output-root anchor, but does not authenticate the L1 header (G-17). **Not sound for custody. Do not wire.** Audited as the defect record. |
| S4 | Base cover V3 | `contracts/AacCheckpointMessageCoverV3.sol` | Adds the L1 header binding to the finalized beacon payload (gindex 6444, 12-node branch). Tests `cover-v3-l1` (5), synthetic data only. No deployment record. Not wired. Real-data acceptance pending (G-17). Its `cover` ABI is identical to V2's. |
| S5 | CoNET-side Base cover V4 | `contracts/AacConetBaseMessageCoverV4.sol` (commit `de17a8b`) | Binds the Base header hash to the output-root anchor and the L1 header to the finalized payload. No owner, no upgrade path. Tests `conet-base-cover-v4` (15). No deployment record. No settler uses it. Replaces the unbound CoNET-side cover (G-14). |
| S6 | Settler F9 (not for deployment) | `contracts/AacProductionCustodyGateSettlerF9.sol` | F8 storage layout, so pending variables sit in the canary slots 49–51. Base path calls the cover passed to the constructor. The contract's natspec names V2 (see D1). Tests `f9-light-gate` (6). No deployment record. Superseded by F11 (D3). |
| S7 | Settler F10 (not for deployment) | `contracts/AacProductionCustodyGateSettlerF10.sol` | F9 plus the CoNET path, which calls the authenticator passed to the constructor in the same call. Same storage layout as F9. Tests `f10-conet-settler` (6). No deployment record. Superseded by F11 (D3). |
| S8 | Chain effect, C2 and C3 fixes, two-step handoff | `contracts/AacChainEffectV2.sol` | Route allowlist per `(asset, mode)` with a per-operation cap (C2). `consumed[operationId]` blocks replay (C3). `bridgePaused` is checked before `mintPaid` (C3). Only the settler may call `complete`. Owner handoff is two-step: `transferOwnership`, then `acceptOwnership` (D5). Tests `fix.test.ts` (25) and `chain-effect-ownership` (5). No deployment record. |
| S9 | Treasury integration | `src/b-unit/TreasuryBridgeV3.sol` (parent repository) | Unchanged by this work. `completeFromAac` accepts calls only from `aacExecutor`. Auditor confirms that `aacExecutor` is `AacChainEffectV2` on each chain and nothing else. Ownership is one-step (G-05, D5). Live proxy. |
| S10 | C1 header authority and gate, two-step handoff | `contracts/AacHeaderAuthority.sol`, `contracts/AacAuthenticatedHeaderGate.sol`, `contracts/AacConetBaseSettlerV2.sol` (commit `5d8ba86`) | Code only. `AacHeaderAuthority` is not deployed (G-18). Owner handoff is two-step (tests `header-authority-ownership`, 5). No contract in this repository calls `AacHeaderAuthority.authenticate`. The CoNET path in F10 calls the authenticator directly (S7). |
| S11 | Settler F11 (deployment candidate) | `contracts/AacProductionCustodyGateSettlerF11.sol` | F10 logic on the F7c storage layout. The canary record stays in slots 49–52 and F11 never writes it. Pending variables are in slots 53–55. Upgrade expiry 7 days after the upgrade becomes ready (default, pending owner confirmation, D4). Tests `f11-settler` (11). Storage layout equals F7c's (compiler comparison, §4.1). |
| S12 | Fulu CoNET header authenticator | `contracts/AacConetHeaderAuthenticatorV2.sol` | Fulu layout: finalized root at gindex 169 with a 7-node branch, execution payload at gindex 6444 with a 12-node branch. Uses `AacConetSourceFinalityV2` (fork-aware) as its source. Tests `conet-authenticator-fulu` (9), against a real Fulu light-client update (attested slot 1973606, 512 participants, epoch 61675). Fixture `solidity-tests/fixtures/conet-fulu-finality-1973606.json`. Not deployed. |

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
| D1 | **G-17.** V2 does not authenticate the L1 header. F9 and F10 take the Base cover as a constructor argument, and their natspec names V2. The intended cover is V3, which the owner must confirm before any deployment. | S3, S4, S6, S7, S11 | Open. The `cover` ABIs of V2 and V3 are identical, so V3 can be passed without a code change. The owner chooses. | Confirm that no deployment passes V2 as the Base cover. Confirm that the F11 `cover` call matches V3's ABI. |
| D2 | **G-09.** The Deneb verifier (S2) handles the Deneb layout only. CoNET is past the Electra and Fulu forks. | S2, S7, S12 | Fixed in code (S12, for the Fulu layout). Open: CoNET finality V2 is not installed on Base, and the installation and trust root are not yet decided. | Confirm that S2 is not used for CoNET headers after the Fulu fork. Review the Fulu fixture checks (§4.1). |
| D3 | **G-01.** Storage slots 49 to 51 alias the canary record in F7, F8, F9 and F10. | S6, S7, S11, any upgrade | Fixed in F11 (layout: pending variables in slots 53–55). F9 and F10 are not for deployment. The live proxy keeps canary residue (§4.1). | Compare F11 with F7c. Confirm the live residue. Confirm that no upgrade into F9 or F10 is made. |
| D4 | **G-12.** Scheduled upgrades never expire in F9 and F10. | S6, S7, S11 | Fixed in F11: an upgrade expires 7 days after it becomes ready. The window is a default pending owner confirmation. | Confirm the window and the revert path. |
| D5 | **G-05, G-06.** One-step ownership in `TreasuryBridgeV3` (S9, live proxy), and in `AacChainEffectV2` and `AacHeaderAuthority` (S8, S10). | S8, S9, S10 | Fixed in S8 and S10 (two-step). Open: `TreasuryBridgeV3` is still one-step. | Confirm the two-step handoff in S8 and S10. Confirm the Treasury decision. |
| D6 | **G-11.** No explicit receipt status check. Logs of reverted calls are not emitted, so the impact is low. | S2, S4 | Open | Note only. |
| D7 | **G-18.** `AacHeaderAuthority` is not deployed, so the C1 gate has no authority data. | S10 | Open. Not deployed. Reverts at construction without an authority. Owner handoff is two-step. | Confirm that the gate fails closed without it. |
| D8 | **G-07.** The V1 finality contract hard-codes `0x20000093`. V2 is fork-aware and tested for the Deneb, Electra and Fulu epochs. | S1, S12 | V2 in code, tested. Open: the installation procedure, and V1 must not be installed. | Confirm that V2 is the only finality path after installation. |
| D9 | **G-14.** The earlier CoNET-side cover did not bind the Base header. | S5 | Fixed in code (V4). Not deployed. | Verify the binding. |
| D10 | **G-02.** The live F7 settler lacks the GB pause check. F9 (`AacProductionCustodyGateSettlerF9.sol:246`), F10 (`AacProductionCustodyGateSettlerF10.sol:277`) and F11 have it. | S6, S7, S11 | Closed in code for F9, F10 and F11. The GB token's own `mintPaid` is open (G-03, §4.1). | Verify. |

Live-path issues are disclosed but out of scope (see §6): G-02 on live F7, G-15 (original cover `0x0150…`), G-16 (no pause or closed flag on live F7), G-03 and G-04 (GB admin roles), G-13 (CoNET GB mint policy), G-19 (owner key), G-20 (Safe premise).

### 4.1 Verification record, 2026-10-28

Checked against the source, the existing tests and read-only RPC on Base (chain 8453). No transaction was sent and no contract was changed on chain.

- **D1.** `AacCheckpointMessageCoverV2.cover` and `AacCheckpointMessageCoverV3.cover` have the same parameters and return values. F9 calls `cover` through the V2 type (`AacProductionCustodyGateSettlerF9.sol:213`), so V3 can be passed as the Base cover without a code change. The owner still decides which cover to pass.
- **D2.** `AacConetHeaderAuthenticator` (S2) uses fixed Deneb values (`FINALIZED_GINDEX = 105`, `FINALITY_BRANCH_LENGTH = 6`, `PAYLOAD_GINDEX = 6444`). Fixed in S12 with `FINALIZED_GINDEX = 169` and `FINALITY_BRANCH_LENGTH = 7`. The payload position is unchanged: the execution payload and its place in the body did not change between Deneb and Fulu. Fulu fixture checks, run when the fixture was built: (1) the execution payload root reproduces the light-client `execution_branch` through the body; (2) the 12-node branch from `block_hash` reproduces the finalized beacon block root; (3) the execution header RLP hashes to `block_hash`. The contract test accepts the real update and rejects changed headers, branches, state root, participant bits, a Deneb-length branch and an empty beacon chain. Electra has the same finalized-root layout as Fulu for these fields, but no Electra fixture exists.
- **D3.** `F7`, `F8`, `F9` and `F10` have identical storage layouts: `__gap` at slots 2–48, `pendingImplementation` at 49, `upgradeReadyAt` at 50 and `pendingOwner` at 51. `AacProductionCustodyGateSettlerCanary` stores `canaryMintDone` at 49, `canaryUsedAacId` at 50, `canaryRecipient` at 51 and `canaryAmountMinted` at 52. F11's layout equals F7c's on slot, offset, label and type (11 entries, compiler `storageLayout`). On the live Base proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` (ERC-1967 implementation `0x29e10621fF159422237d2a0B9F020303F9BDdD12`, F7), read on 2026-10-28:
  - Slots 49 and 50 are 0. `cancelUpgrade()` (F7 lines 135–139) writes both, so the canary's `canaryMintDone` and `canaryUsedAacId` no longer exist in storage. Cancel transaction `0x5e0ac9068745b7cc45599e8b0342bafd16ee1f385dbe67ff62e87bdeaf977724`, block 52704286.
  - Slot 51 is `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1`, the owner. `pendingOwner` therefore equals the owner, and `acceptOwnership()` from any other address reverts. No third-party takeover path exists at this value.
  - Slot 52 is `10000000` (`0x989680`), the canary amount.
  The residue is a latent defect. F11 does not read slots 49–52, so an upgrade into F11 does not depend on it. The canary provenance must come from the transaction history, not from storage. The F7b record (`deployments/phase-F7b-storage-fix.json`) planned `repairCanaryRecord()` after an upgrade that was never executed. F7c was cancelled by containment.
- **D4.** `upgradeTo` in F9 (line 177) and F10 (line 208) checks only `upgradeReadyAt == 0 || block.timestamp < upgradeReadyAt`. F11 adds `block.timestamp > upgradeReadyAt + UPGRADE_EXPIRY` with `UPGRADE_EXPIRY = 7 days`.
- **D5.** `AacChainEffectV2` and `AacHeaderAuthority` now use `transferOwnership` and `acceptOwnership` (10 tests). `TreasuryBridgeV3` uses OpenZeppelin `OwnableUpgradeable`, which is one-step.
- **D7.** `AacAuthenticatedHeaderGate` reverts in its constructor if the authority, the Base cover or the CoNET inclusion address is zero. A gate cannot be deployed without an authority. The behaviour of a contract deployed at the authority address is not tested.
- **D9.** `conet-base-cover-v4` has 15 tests, including negative cases for the Base header binding, the receipts root, the L1 payload branch and the store proof. This is evidence, not an audit result.
- **D10.** F9 (line 246), F10 (line 277) and F11 check `bridgePaused()` before `mintPaid`. Tests `f9-light-gate`, `f10-conet-settler` and `f11-settler` refuse minting while the bridge is paused. F7 has no such check. On 2026-10-28 the GB `bridgePaused()` flag read `true` on Base and on CoNET. GB's own `mintPaid` has no such check either (G-03): every caller is a GB admin, and the flag does not stop them. A read-only simulation on Base and CoNET confirmed this on 2026-10-28.
- **Operational-detail scan.** The handoff documents contain no home paths, no `user@host` strings and no key file names. The only addresses are `127.0.0.1` and placeholders such as `{CONET_NODE_C}`. The Fulu fixture contains no hosts, paths or accounts.

### 4.2 Changes since the 2026-10-27 draft

- F11 (S11) and the Fulu authenticator (S12) added to the scope.
- Two-step owner handoff in `AacChainEffectV2` (S8) and `AacHeaderAuthority` (S10).
- F9 and F10 marked as not for deployment. F11 replaces them.
- The archive node's beacon endpoints for light clients are enabled (2026-10-28). This is an operator change and holds no operational detail in this repository.

---

## 5. Evidence pack

| Item | Location or command |
|---|---|
| Solidity tests | `npx hardhat test solidity-tests/test/*.test.ts` in `src/bridgeAAC`. Run on 2026-10-28 on a clean export of `1c6b3e8` (`7d6c93d` plus the test fix): 145 passing, 0 failing. `cargo test --locked` at `1c6b3e8`: 129 passing, 0 failing. |
| Compiler and EVM | `pragma solidity 0.8.35`. Hardhat `evmVersion` is `prague` (`hardhat.config.ts` at the root of `src/bridgeAAC`). |
| CoNET chain-rule regression | `scripts/conetHistoryRegression.mjs`. Read-only. Needs `CONET_SSH_USER` and `CONET_NODES_FILE`. The node list is not in the repository. Latest run against four archive nodes: all checks pass. |
| CoNET fixtures, Deneb | `solidity-tests/fixtures/conet-*.json`. Deneb-era, slots 1745494 and 1804388. |
| CoNET fixture, Fulu | `solidity-tests/fixtures/conet-fulu-finality-1973606.json`. Captured 2026-10-28 from the light-client endpoints of the CoNET archive beacon node. Attested slot 1973606, finalized slot 1973536, signature slot 1973607. |
| V2 Base deployment | `deployments/base-AacCheckpointMessageCoverV2.json`, `deployments/base-AacCheckpointMessageCoverV2-standard-input.json` |
| V2 read-only acceptance | `deployments/base-AacCheckpointMessageCoverV2-acceptance.json`, `scripts/acceptAacCheckpointMessageCoverV2Base.mjs` |
| F7c containment | `deployments/containment-f7c-cancel-base.json` |
| Storage layouts | Not yet in the repository. A dry run on 2026-10-28 compares F7, F8, F9, F10, F7c and F11 (§4.1). Generate the final JSON from the compiler `storageLayout` output at the freeze SHA. |

---

## 6. Out of scope

- The Rust gateway (`bridge-aac`) and the reproducible release build.
- The live F7 proxy and cutover phases B to D (see [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) §3).
- Owner multisig deployment, Safe setup and key custody (G-19, G-20). The multisig whitepaper is reference only.
- The Base executor for CoNET DAO governance. The owner chose DAO governance as the AAC owner on 2026-10-28. The executor is not in this candidate and needs its own scope.
- CoNET GB supply and mint policy (G-13), and GB admin roles (G-03, G-04). CoNET GB has ten current admins by event replay (2026-10-28); they are not classified in this document.
- Phase 2 rotation (G-08, G-10).
- Economic parameters: route caps, per-operation caps and canary amounts.

---

## 7. Non-claims

- Passing tests are not an audit result.
- The candidate is not safe to wire. V2 is unsound by design. V3 and V4 have no real-data acceptance.
- The Fulu fixture shows acceptance of one real update. It is not a general proof for all Fulu headers.
- F11's expiry window is a default pending owner confirmation.
- No deployment, role grant or on-chain action is authorized by this document.
- No claim about CoNET consensus safety (assumption A9 of the owner whitepaper).

---

## 8. Before handoff (owner checklist)

- [ ] Owner approves this scope and names the recipient (the auditor).
- [ ] Owner decides the Base cover for F11 (D1). V3 is the intended cover.
- [ ] Owner confirms the upgrade expiry window (D4). The default is 7 days.
- [ ] Owner confirms that F9 and F10 are not for deployment (D3).
- [ ] Owner decides the `TreasuryBridgeV3` two-step change (D5).
- [ ] Owner decides how CoNET finality V2 is installed on Base, and the trust root (D2, D8).
- [ ] Commit this document together with `docs/INDEPENDENT-AUDIT.md` §3.1. Record the freeze SHAs for `src/bridgeAAC` (the code branch) and for the parent repository.
- [ ] Keep these out of the freeze commit: uncommitted edits to `contracts/cmg/CmgRegistryTestnet.sol`, `docs/THIRD-PARTY-ACCEPTANCE.md` and `docs/CMG-CONET-TESTNET-MANIFEST-DRAFT-2026-10-19.md`; untracked `docs/SECURITY-REVIEW-2026-10-16.md` (unless the owner decides otherwise); untracked multisig whitepaper drafts `docs/OWNER-MULTISIG-WHITEPAPER-v0.2-2026-10-18.md` and `docs/OWNER-MULTISIG-WHITEPAPER-v0.3-2026-10-18.md` (decide); `types/` and `.DS_Store`.
- [ ] Generate storage layouts and rerun the test command on the freeze SHA.
- [ ] Scan the handoff copy for operational details: host addresses, account names, home paths and key locations.
