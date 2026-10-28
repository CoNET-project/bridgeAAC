# bridgeAAC external audit: readiness record (2026-10-28)

**Status:** Not frozen. Not sent to any auditor. This record lists what stands between the current candidate and an external audit, what each blocker needs, and what has already been removed.

The scope itself is in [AUDIT-SCOPE-2026-10-27.md](AUDIT-SCOPE-2026-10-27.md) (updated 2026-10-28). The owner's decisions made on 2026-10-28 are recorded below.

---

## 1. Candidate pins (not frozen)

| Repository | Branch | Commit | Contents |
|---|---|---|---|
| `src/bridgeAAC` | `feat/aac-f11-and-ownership` | `7d6c93d` | Contracts, tests, fixtures: F11 settler, Fulu CoNET authenticator, two-step owner handoffs |
| `src/bridgeAAC` | `docs/aac-audit-scope-2026-10-28` (PR #1) | the commit that contains this record | Scope draft, `INDEPENDENT-AUDIT.md` §3.1, this record |
| Parent repository | `feat/external-treasury-units` | `3ed37d29` | `src/b-unit/TreasuryBridgeV3.sol` (unchanged by this work) |

---

## 2. Owner decisions (the team cannot close these)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| O1 | Approve the scope and name the auditor (INDEPENDENT-AUDIT §2) | Name the auditor before freezing | Handoff |
| O2 | Base cover for F11 | V3. V2 must not be wired | D1 |
| O3 | Upgrade expiry window in F11 | 7 days (current default) | D4 |
| O4 | `TreasuryBridgeV3` two-step handoff (live proxy, one-step today) | Upgrade to two-step before the owner handoff | D5, S9 |
| O5 | F9 and F10 retired from deployment, replaced by F11 | Retire | D3 |
| O6 | Untracked security-review and multisig whitepaper drafts: in the handoff or not | Keep out of the freeze commit unless reviewed | Handoff hygiene |
| O7 | Route caps and per-operation caps for `AacChainEffectV2` | Set values before any deployment | Deployment (not audit) |
| O8 | Owner of the AAC settler after deployment: the CoNET DAO governance contract (decided 2026-10-28), operated through a Base executor | Build and scope the executor before the handoff | Handoff |
| O9 | How CoNET finality V2 is installed on Base: re-install from a recent trusted checkpoint (decided 2026-10-28), with multi-observer checks | Design the checkpoint and observer procedure; it changes the trust root and needs its own owner approval | Production path, not the code audit |

---

## 3. Engineering status of the blockers

| Item | Status | Evidence |
|---|---|---|
| D1. Base cover | Open (O2). The `cover` ABIs of V2 and V3 are identical | Scope §4.1 |
| D2. CoNET header layout | **Fixed in code** for the Fulu layout (`AacConetHeaderAuthenticatorV2`, gindex 169). Open: CoNET finality V2 is not yet installed on Base (O9) | `conet-authenticator-fulu` (9 tests); the fixture passed three consistency checks (scope §4.1) |
| D3. Storage aliasing | **Fixed in F11**: pending variables in slots 53–55. F9 and F10 retired (O5). Live proxy residue remains and is disclosed | F11 layout equals F7c's (11 entries, compiler `storageLayout`); `f11-settler` (11 tests) |
| D4. Upgrade expiry | **Fixed in F11** (7 days, O3) | `f11-settler` |
| D5. Two-step handoff | **Fixed** in `AacChainEffectV2` and `AacHeaderAuthority`. Open: `TreasuryBridgeV3` (O4) | `chain-effect-ownership` (5), `header-authority-ownership` (5) |
| D6. Receipt status | Note only | Scope |
| D7. Authority not deployed | Open. Not deployed. Reverts at construction without an authority | Scope §4.1 |
| D8. Finality fork versions | V2 is fork-aware and tested for Deneb, Electra and Fulu. Open: installation (O9) | `conet-bls-v2` (4 tests) |
| D9. V4 binding | Covered by tests. Not deployed | `conet-base-cover-v4` (15 tests) |
| D10. GB pause check | **Closed** in F9, F10 and F11. The live F7 lacks it (disclosed, out of scope) | `f9-light-gate`, `f10-conet-settler`, `f11-settler` |

Full test suite at `7d6c93d`: **145 passing, 0 failing** (115 at the 2026-10-27 pin, plus 11 for F11, 10 for the two-step handoffs, 9 for the Fulu authenticator).

---

## 4. Evidence pack status

| Item | Status |
|---|---|
| Solidity tests | Passing at `7d6c93d` (145). Re-run at the freeze SHA |
| Storage layouts | Dry run done on 2026-10-28 for F7, F8, F9, F10, F7c and F11. The final JSON comes from the compiler output at the freeze SHA |
| Live reads, Base | 2026-10-28: proxy implementation, owner, canary slots, GB `bridgePaused()` on Base and CoNET. Re-read at freeze |
| CoNET Fulu data | Light-client finality update captured on 2026-10-28; the fixture was built with three consistency checks |
| Operational-detail scan | Clean as of 2026-10-28 for the handoff documents. Re-run at freeze |

---

## 5. Freeze procedure (after O1)

1. Freeze the candidate: record the code SHA and the docs SHA in the engagement letter.
2. Generate storage layouts at the freeze SHA with the compiler `storageLayout` output, and commit them under `docs/evidence/`.
3. Run `npx hardhat test solidity-tests/test/*.test.ts` at the freeze SHA.
4. Re-run the operational-detail scan on the handoff copy.
5. Keep out of the freeze commit: `contracts/cmg/CmgRegistryTestnet.sol`, `docs/THIRD-PARTY-ACCEPTANCE.md`, `docs/CMG-CONET-TESTNET-MANIFEST-DRAFT-2026-10-19.md`, `docs/SECURITY-REVIEW-2026-10-16.md` (unless O6 says otherwise), the multisig whitepaper drafts (O6), `types/` and `.DS_Store`.

---

## 6. Live-path disclosures for the auditor

These are out of scope but the auditor must be told. They are facts, not claims about safety.

- The live Base proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` runs F7 (`0x29e10621fF159422237d2a0B9F020303F9BDdD12`) with cover `0x01506527a4Dab14141038Db15f5341dcF4729233`. F7 has no GB pause check (G-02, G-15).
- The paid GB bridge is paused on Base and on CoNET (`bridgePaused()` read `true` on 2026-10-28). The containment depends on this pause. Whether GB's own `mintPaid` also refuses while paused was not verified in this record.
- The live proxy holds canary residue in slots 49–52 (scope §4.1, D3).
- The owner is an externally owned account. Its key is held in a plaintext file on the operator's workstation (G-19). The owner handoff in O8 replaces it.
- CoNET finality on Base (`0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`) is the V1 Deneb contract. Its last installed period was 215 as of the 2026-10-18 read. It cannot verify Fulu signatures until V2 is installed (O9).

---

## 7. What is left before an audit can start

1. Owner: O1 (scope approval and the auditor's name).
2. Owner: O2, O3, O4, O5 (decisions that change the code or the scope).
3. Owner: O6 (which untracked drafts go into the handoff).
4. Team: freeze the candidate after O1–O6, then run section 5.
5. Owner, before any deployment: O7, O8, O9. These are not audit blockers for the code, but the auditor will ask for them, and O8 and O9 change the owner handoff and the trust root.

---

## 8. CoNET finality V2 install procedure (draft, O9)

The committee installed in `AacConetSourceFinalityV2` is the trust root for CoNET headers. The install therefore needs independent observers, as the Ethereum checkpoint did (obstacle 1).

1. Choose a finalized CoNET checkpoint: slot `S` with state root `R`, in the current sync period.
2. Two independent archive nodes must return the same finalized header (slot, state root, body root) and the same committee: the same 512 validator indices and the same committee digest `D`, which is `keccak256` of the 512 compressed public keys concatenated in committee order.
3. Record `S`, `R`, `D`, the period and the observers in a deployment record before any transaction.
4. The owner approves the exact install transaction (512 compressed keys, `S`, `R`) by name. This follows the hard-stop rule in `CUTOVER-CUSTODY.md`.
5. After installation, run `verifyAggregate` read-only on a later aggregate in the same period. It must return `ok = true`. This does not change state.
6. Only `AacConetSourceFinalityV2` is installed for CoNET headers. The V1 contract on Base (`0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`) is not used for them after this (D8).

Example from the read-only check on 2026-10-28. The install must use a fresh checkpoint, not these values:

- finalized slot 1973664 (epoch 61677, sync period 240);
- state root `0x1e3d1f74bd03ea97990f3533255ef5093370f5be662424d442373d9cd8c83eee`;
- committee digest `0xb520f522d13d5416fe324d19f10523f67b6e5aec2ac865426d0a4c8bd6e4c19c`;
- two independent archive nodes agree on the header, the committee indices and the digest.

O9 stays open until the owner approves a checkpoint and the install transaction.
