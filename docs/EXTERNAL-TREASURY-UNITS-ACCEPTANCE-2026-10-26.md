# External Treasury Units: Base Sepolia Testnet Acceptance Record

Status: **testnet acceptance passed on chain; all six current contracts are exact-match verified on Sourcify and fully verified on Blockscout; not audited; not deployed to any mainnet.**

Dates: the first deployment was made on 2026-10-26 and is superseded. The current deployment was made on 2026-10-27 (UTC). Chain: Base Sepolia, chain ID `84532`.

This record covers an experiment on the external reserve-unit treasury design. The code and the deployment records live in the parent repository `BeamioContract`, not in this crate. This document sits here because it tracks a bridge-side treasury experiment. No bridge-aac code was changed.

## Scope

- Design: each accepted deposit gets its own deposit unit (DU). The DU is derived with CREATE2 as an ERC-1167 clone and is funded directly by the deposit. The treasury holds nothing at rest. Withdrawals draw from Active units first in first out, chosen by the contract. A payment is atomic across units. Unit states, accounting buckets and refunds follow the privacy-fragmentation whitepaper (v0.3 draft, sections 3, 6.1 and 9).
- Code (parent repository): `src/b-unit/external-treasury-units/` (`ExternalTreasuryUnits.sol`, `DepositUnitFactory.sol`, `DepositUnit.sol`, the interfaces and the mocks), and `src/b-unit/external-treasury-immutable/mocks/ExternalTreasuryMockVerifier.sol`.
- Not in scope: a real CoNET proof verifier, a Base state-proof adapter, and real USDC.

## Local verification

| Check | Result |
| --- | --- |
| `npx hardhat --no-typechain test` over `test/external-treasury-units.test.ts`, `test/external-treasury-immutable.test.ts` and `test/gb-immutable.test.ts` | 69 passing, 0 failing (28 new, 13 existing, 28 GB). Re-run on 2026-10-27 after the compiler configuration change. |
| Dry run of `scripts/deployExternalTreasuryUnitsAcceptance.ts` on the in-process network (chain 31337) | Deployment, acceptance flow and invariants all passed. Nothing was written. Run before the Base Sepolia deployment. |

## Why the deployment was replaced

Sourcify reports `exact_match` only when the metadata hash embedded in the bytecode matches the recompiled metadata. The first set was compiled with `settings.metadata.bytecodeHash: "none"`, so its bytecode carried no hash. Sourcify could only report `match` (partial), and Blockscout could only show it as partially verified.

The repository-wide compiler setting stays `none`. The six contracts now compile with `bytecodeHash: "ipfs"` through per-file overrides in `hardhat.config.ts`. Every other contract keeps `none`, and the rebuild confirmed that their compiler settings are unchanged. Redeploying changed all six addresses.

## Deployment (Base Sepolia, 2026-10-27)

Deployer: `0x4642e1EF8705f7EF6ede04b643d5B64010bd7263`.

| Contract | Address | Creation transaction |
| --- | --- | --- |
| ExternalTreasuryUnits (treasury) | `0xeC708cDC106E76B86DF88868315855E3af41e115` | `0x3ed6998c70fdb083b139174c064d4bdbd8bf1b95ff1972a8950e896360a36fb7` |
| DepositUnitFactory | `0x143824C75CAcdc9E1a56463F9cD8Adae728f9256` | created by the treasury constructor |
| DepositUnit (implementation) | `0xDbB8cB074608484f276Eb8D8d1b6eF1A84045dEe` | `0x0ff63ba3463ca95d1910866f3eef0939a66aacf304f939731462f67831372d57` |
| DepositUnitMockUSDC (test token, 6 decimals) | `0xF50a08AfAc949b0412F8B8784A9f7B915c03E617` | `0xd07d1577c5abde354b060bca767766adfd8a58b8e77018ad7385f8e588c04db2` |
| ExternalTreasuryMockVerifier (test CoNET proof double) | `0x3f780e94Bf5329b182d75EE611074A9Dc65C5744` | `0x464f963f609ae7fa4239da5d56790df72a74b5ddfdfaedf21ebbd725a2f46bb4` |
| UnitStateMockVerifier (test state-proof double) | `0x1F73d05a76759DC2C7a5D3818e7beD302Fd742F6` | `0x3f8a0d4072694711210f03cfe016ddc1d39fad0ede08df916665dec590bbc3a1` |

Parameters: per-deposit cap 1,000 USDC (raw `1000000000`); `MAX_PROOF_AGE` 2000 blocks (testnet value); at most 16 units per payment; at most 256 queue entries scanned per payment.

Bytecode check (read from the public RPC): the runtime bytecode of all six contracts equals the compiled artifacts, with immutable slots masked. Each runtime carries an `ipfs` metadata hash. The creation transaction input of the five contracts that have their own transaction equals creation code plus constructor arguments. The factory was created inside the treasury constructor and has no transaction of its own.

### Superseded deployment (2026-10-26)

The first set is kept as history only. Do not use these addresses.

| Contract | Superseded address | Status |
| --- | --- | --- |
| ExternalTreasuryUnits | `0x3C3203A3574e5724f1CA3ef410694Df0f837B7a8` | Sourcify `match`, Blockscout partially verified |
| DepositUnitFactory | `0xA07421f74ad029F91777113ef0bA00C25a9fb762` | Sourcify `match`, Blockscout partially verified |
| DepositUnit (implementation) | `0xed12Aea79F723132Eb783037a250675066610D03` | Sourcify `match`, Blockscout partially verified |
| DepositUnitMockUSDC | `0xb55B0c5832D545ea49Ab8F4A0b069Fc42774988b` | Sourcify `match`, Blockscout partially verified |
| ExternalTreasuryMockVerifier | `0x2EF79D60082bE7efb59af25A50932511125E181c` | Sourcify `match`, Blockscout partially verified |
| UnitStateMockVerifier | `0xE12B6a5728751567179CB53FdB2b504A2c6f0c3f` | Sourcify `match`, Blockscout partially verified |

The superseded deployment record, its acceptance transactions and its standard JSON inputs are in git history at commit `d503e84f`.

## On-chain acceptance flow (2026-10-27)

Test USDC was minted to the deployer and approved for the treasury (mint `0x847f4f2124eb901d81a08a97719adb452b03d9e8a02787a5cd1f23c2fc579daa`, approve `0xa6a7c7912ca48b80b26962f9d78f0f02d5ba380c5437c4365a4f49553eb1a497`).

### Deposits

| # | Amount (USDC) | Deposit unit | Transaction | Block |
| --- | --- | --- | --- | --- |
| 1 | 100 | U1 `0x5eFcbecd82eD4Dc8D341773c8035869E7a24c258` | `0x3fa555252ffd32127985bd9c90878a6b8d03f31f79cc76175bf8d95e6c6b0ce9` | 50849682 |
| 2 | 50 | U2 `0xaAD43Bc10e8CDCEEE282697CB351b4243374E3Ea` | `0x540fd6ce87c6b751293e0a2fedef8bc407eb5070231a229d54af1ccebc0cf46a` | 50849687 |
| 3 | 80 | U3 `0x2bd8853477f4D685dA501Ff64FF0Cd39C06759A4` | `0x590ec0be1e1017f83a9c239cb739a5a6ebbb2e8c572071a02a06159ef4d6a23b` | 50849691 |

Each deposit derives its unit first and then transfers the tokens straight into it.

### Activation (state proof, then report)

| Unit | Proof registration | Report | Status after | Block |
| --- | --- | --- | --- | --- |
| U1 `0x5eFcbecd82eD4Dc8D341773c8035869E7a24c258` | `0x7d8461bdd3270060991d038824e18ec0c80e64ede3a291c189a410df30d07105` | `0xf24d1b9b5dfe4e16ce27c93fba5e5c67792e16d2c8bbc00da53affe55da5707e` | ACTIVE | 50849702 |
| U2 `0xaAD43Bc10e8CDCEEE282697CB351b4243374E3Ea` | `0x774e734ad49f25021317b22bda204508c14b6d970d65c41a1143479e78b01903` | `0x6c678565d724482df23bd25fd1f770c83933c4100a6b004c8018814508536fde` | ACTIVE | 50849712 |
| U3 `0x2bd8853477f4D685dA501Ff64FF0Cd39C06759A4` | `0x9cb9a0b56f1703441b30cb2644fab2416a2050ca03b022f7662609379ce02d58` | `0xe483b380deaec1b5b0300c938fd48c8a83408d9a63378437f7bb774b5e9400e2` | ACTIVE | 50849722 |

### Withdrawals

| # | Amount (USDC) | Units paid (USDC each) | Burn-proof registration | Release | Block |
| --- | --- | --- | --- | --- | --- |
| 1 | 120 | U1 100, U2 20 (two transfers in one transaction) | `0x09b28863de48c6c278f946d1fa60a97d9f2d68d41f4072053c59150c9931dc0b` | `0xabf04628ddac68bd55ab8390cecce8ddf1b0bbdbb49cfb5fa33bb8f2f64d7420` | 50849732 |
| 2 | 30 | U2 30 | `0xc16248514e67e11883299c041ea590e4bcced747bc93c491234b1168779db3ab` | `0xa00c32bec2bda2199364e5d373cb162611641d8fa4adbc56b881df2adfb1ba4a` | 50849741 |
| 3 | 50 | U3 50 | `0xf2ffa4e0e7856b994e79c31a9dd36d54e35329e90c83762411148afce51fa3cf` | `0x6b6b72e40e418e688f5659d33bdda917a5ffeba27e954a9b293c66ed5644b984` | 50849760 |

Each release is one transaction. Withdrawal 1 pays from two different units to the same recipient. Withdrawal 2 pays only from the leftover of U2, which was partly drawn by withdrawal 1.

### Final state

| Unit | Status | Remaining (USDC) | Token balance (USDC) |
| --- | --- | --- | --- |
| U1 `0x5eFcbecd82eD4Dc8D341773c8035869E7a24c258` | SPENT | 0 | 0 |
| U2 `0xaAD43Bc10e8CDCEEE282697CB351b4243374E3Ea` | SPENT | 0 | 0 |
| U3 `0x2bd8853477f4D685dA501Ff64FF0Cd39C06759A4` | ACTIVE | 30 | 30 |

| Item | Value |
| --- | --- |
| Buckets (USDC): registered / active / restricted / unverified / confirmed loss | 0 / 30 / 0 / 0 / 0 |
| `principalOf` (USDC) | 30 |
| Treasury token balance (USDC) | 0 |
| Recipient balance (USDC) | 200 |

The script waited for every receipt before it continued. Before it wrote the record, it checked these invariants: each unit's token balance equals its registered remaining amount, the treasury holds nothing at rest, principal equals deposits minus withdrawals, and the buckets sum to principal.

## Verification

### Current deployment (2026-10-27)

- **Sourcify:** all six contracts report `exact_match` for creation and runtime code. The standard JSON inputs were submitted between 09:05:54 and 09:06:01 UTC. Each input carries `settings.metadata.bytecodeHash: "ipfs"` and compiler `0.8.35+commit.47b9dedd`. The sources are public on Sourcify.
- **Blockscout** (`base-sepolia.blockscout.com`): Blockscout imported each contract when its endpoint `GET /api/v2/smart-contracts/{address}` was requested, between 09:06:24 and 09:06:30 UTC. Every contract returns `is_fully_verified: true`, `is_partially_verified: false` and `is_verified: true`, with compiler `0.8.35+commit.47b9dedd`, EVM `cancun` and optimizer runs 2.

| Contract | Address | Sourcify | Blockscout | Source files | Constructor arguments |
| --- | --- | --- | --- | --- | --- |
| ExternalTreasuryMockVerifier | `0x3f780e94Bf5329b182d75EE611074A9Dc65C5744` | `exact_match` | fully verified | 2 | none |
| UnitStateMockVerifier | `0x1F73d05a76759DC2C7a5D3818e7beD302Fd742F6` | `exact_match` | fully verified | 2 | none |
| DepositUnit | `0xDbB8cB074608484f276Eb8D8d1b6eF1A84045dEe` | `exact_match` | fully verified | 8 | none |
| DepositUnitMockUSDC | `0xF50a08AfAc949b0412F8B8784A9f7B915c03E617` | `exact_match` | fully verified | 6 | none |
| ExternalTreasuryUnits | `0xeC708cDC106E76B86DF88868315855E3af41e115` | `exact_match` | fully verified | 15 | 320 bytes |
| DepositUnitFactory | `0x143824C75CAcdc9E1a56463F9cD8Adae728f9256` | `exact_match` | fully verified | 5 | 64 bytes |

- Standard JSON inputs are in the parent repository under `deployments/`, one per contract: `baseSepolia-ExternalTreasuryUnits-standard-input-<Contract>.json`. Each contains only the contract's import closure, with the settings of the build that compiled it.
- Constructor arguments are ABI-encoded and recorded in `deployments/baseSepolia-ExternalTreasuryUnits-verify-meta.json`. For `ExternalTreasuryUnits` they are the verifier, the state verifier, the DepositUnit implementation, `MAX_PROOF_AGE` 2000, the token list `[DepositUnitMockUSDC]` and the cap list `[1,000 USDC]`. For `DepositUnitFactory` they are the treasury and the DepositUnit implementation.

### Earlier attempts (2026-10-26 and 2026-10-27, superseded)

- The Blockscout standard-input route (`verification/via/standard-input`) accepted the first set's submissions but never verified them. It failed twice and was not repeated. Blockscout returned HTTP 429 (rate limited) before 22:30 UTC on 2026-10-26.
- 2026-10-27 00:42 to 00:44 UTC: the first set was submitted to Sourcify (`match`) and imported by Blockscout as partially verified, because its bytecode carried no metadata hash.

## Limitations

- The burn proofs and state proofs were registered by the deployer through test contracts. They do not come from CoNET or from a state-proof system. The run shows unit selection, atomic payment, state transitions and accounting. It does not show cross-chain safety.
- The token is a test token with a blacklist and a pause switch. Real USDC behaviour was not tested on testnet.
- The deployer account played every role: depositor, proof registrar and recipient.
- Negative paths (stale proofs, restricted units, failing transfers, refunds, losses) are covered only by the local test suite, not on testnet.
- `MAX_PROOF_AGE`, the unit limit and the scan limit are testnet values. Mainnet parameters are still open (whitepaper Q11).
- Not audited. The whitepaper gate applies: no mainnet deployment before audit.

## Reproduction

```bash
npx hardhat --no-typechain test test/external-treasury-units.test.ts
npx hardhat run scripts/deployExternalTreasuryUnitsAcceptance.ts --network baseSepolia
```

The second command needs a funded testnet deployer key in the local environment. The key is not stored in this record or in the repository. Running the script again deploys a new set of contracts and overwrites `deployments/baseSepolia-ExternalTreasuryUnits.json`. The standard JSON inputs and `verify-meta` were written by a one-off script from the Hardhat build-info; that script is not committed.

## Changes in the parent repository

- Committed on branch `feat/external-treasury-units` as commit `d503e84f` and integrated into the `main` branch of the parent repository on 2026-10-26: the contracts, the mocks, the local test file, the acceptance script, the module README, the deployment and verification records under `deployments/`, and a `blockscout` explorer descriptor for chain `84532` in `hardhat.config.ts`.
- Not committed yet (2026-10-27):
  - `hardhat.config.ts`: the Solidity settings move to `compilers` plus `overrides`. The six contract source files compile with `bytecodeHash: "ipfs"`. All other files keep `"none"`.
  - `deployments/`: the current deployment record, the six standard JSON inputs and `verify-meta`, all for the 2026-10-27 addresses.
