# External Treasury Units: Base Sepolia Testnet Acceptance Record

Status: **testnet acceptance passed on chain; Blockscout source verification pending; not audited; not deployed to any mainnet.**

Date: 2026-10-26 (UTC). Chain: Base Sepolia, chain ID `84532`.

This record covers an experiment on the external reserve-unit treasury design. The code and the deployment records live in the parent repository `BeamioContract`, not in this crate. This document sits here because it tracks a bridge-side treasury experiment. No bridge-aac code was changed.

## Scope

- Design: each accepted deposit gets its own deposit unit (DU). The DU is derived with CREATE2 as an ERC-1167 clone and is funded directly by the deposit. The treasury holds nothing at rest. Withdrawals draw from Active units first in first out, chosen by the contract. A payment is atomic across units. Unit states, accounting buckets and refunds follow the privacy-fragmentation whitepaper (v0.3 draft, sections 3, 6.1 and 9).
- Code (parent repository): `src/b-unit/external-treasury-units/` (`ExternalTreasuryUnits.sol`, `DepositUnitFactory.sol`, `DepositUnit.sol`, the interfaces and the mocks).
- Not in scope: a real CoNET proof verifier, a Base state-proof adapter, and real USDC.

## Local verification

| Check | Result |
| --- | --- |
| `npx hardhat --no-typechain test` over `test/external-treasury-units.test.ts`, `test/external-treasury-immutable.test.ts` and `test/gb-immutable.test.ts` | 69 passing, 0 failing (28 new, 13 existing, 28 GB) |

## Deployment (Base Sepolia)

| Contract | Address | Creation transaction |
| --- | --- | --- |
| ExternalTreasuryUnits (treasury) | `0x3C3203A3574e5724f1CA3ef410694Df0f837B7a8` | `0x72b380e9a7b486fcf785bf59b254984be72965f37f85edd309f3e608ea4a6b8f` |
| DepositUnitFactory | `0xA07421f74ad029F91777113ef0bA00C25a9fb762` | created by the treasury constructor |
| DepositUnit (implementation) | `0xed12Aea79F723132Eb783037a250675066610D03` | `0x7c2c7790e438c1fad19b196d69df09484e829f2b22df59a314d3291e57f1e7ed` |
| DepositUnitMockUSDC (test token, 6 decimals) | `0xb55B0c5832D545ea49Ab8F4A0b069Fc42774988b` | `0xb343b002bfb070075cb1f9b59763299eb2a21510a5080099ef79649595cb69a7` |
| ExternalTreasuryMockVerifier (test CoNET proof double) | `0x2EF79D60082bE7efb59af25A50932511125E181c` | `0xd85b6f3f42e4ddf61559bd9934e049ac299b78ff46420db1c3630749741e17fc` |
| UnitStateMockVerifier (test state-proof double) | `0xE12B6a5728751567179CB53FdB2b504A2c6f0c3f` | `0xf814f711f58f377adab005ec3a262ed41ba67793813249a8375e43e164f92942` |

Parameters: per-deposit cap 1,000 USDC (raw `1000000000`); `MAX_PROOF_AGE` 2000 blocks (testnet value); at most 16 units per payment; at most 256 queue entries scanned per payment.

Bytecode check: the deployed bytecode of all six contracts equals the compiled artifacts, with immutable values masked.

## On-chain acceptance flow

Test USDC was minted to the deployer and approved for the treasury (mint `0x9cc178237b20e6417e15b926aaedfaa89094f8de21892e3832e5287cfd36220e`, approve `0x70fa4088c5cab4959723826bb40b43ef7f41812bf5363853bed87212377d2d27`).

### Deposits

| # | Amount (USDC) | Deposit unit | Transaction | Block |
| --- | --- | --- | --- | --- |
| 1 | 100 | U1 `0x3562BE11c1BDc474CE2308CC59B1F9108804bfEC` | `0x73b32ad86791b0bbbb289894012365e9b9cf522ab62122a282ed62adf2923c66` | 50632869 |
| 2 | 50 | U2 `0x829FD700a271eA71E49C3c946C1Ab3Cf720db70F` | `0x5beac67ec6b6973c1afb638c442f968a62bbaa371e7ec66bbbf92fbde4e16cd1` | 50632879 |
| 3 | 80 | U3 `0x9F4A91cA2d759FedcB934e9828eaB054E46674D9` | `0x914c8b03861e4217d2155a24841c6d46d66ea80c66e65981b182f043c9dc23db` | 50632889 |

Each deposit derives its unit first and then transfers the tokens straight into it.

### Activation (state proof, then report)

| Unit | Proof registration | Report | Status after | Block |
| --- | --- | --- | --- | --- |
| U1 `0x3562BE11c1BDc474CE2308CC59B1F9108804bfEC` | `0x06bef67ebc324b12628d987b99955e27d0a8f60cb222e575e78eec547f2fb2ad` | `0x269631888ef18521afd0a1a2bc77c007215b098efccc92c5382597b31e627062` | ACTIVE | 50632906 |
| U2 `0x829FD700a271eA71E49C3c946C1Ab3Cf720db70F` | `0x004c9ce159efa18440387a4fae193077c34eb87ef621dc8ee8071498d09f1a63` | `0x5a3c34224f9223c97c6c5fd2f4c0b3d751c434befe41580b78d4ddf5de57b5fb` | ACTIVE | 50632928 |
| U3 `0x9F4A91cA2d759FedcB934e9828eaB054E46674D9` | `0x0862d48d93220c6cb76f942001934c26e52005ee76c3452f111e9a938970fabc` | `0xb4d2f3b44312ccf4a268195b609fac6b27025e5ac01789e60616805eb281f720` | ACTIVE | 50632944 |

### Withdrawals

| # | Amount (USDC) | Units paid (USDC each) | Burn-proof registration | Release | Block |
| --- | --- | --- | --- | --- | --- |
| 1 | 120 | U1 100, U2 20 (two transfers in one transaction) | `0x3ed8613f0659a1cd76dfe0774d98f14163c314ea1caf4fa16e77680100e564f2` | `0x6cfd1db7ab4a690cff738574d3a35996c8ac020108e5f30a855875e86eb321c8` | 50632965 |
| 2 | 30 | U2 30 | `0x561728fd07cb751b32afde650a1169a208da1f92d7e9e429e9a76e64395bbfd2` | `0x7ebe72c445fe9d6d533aa0f1b37fcf4f9c3a8662413b0806dfe444559a9c9d87` | 50632979 |
| 3 | 50 | U3 50 | `0x37fae5a311b36e3732d451fa0c1c9af707d21f947b423ff67be05e3b1a5e570f` | `0x011a070a1759729662a5ff25eddc83208182b065652a7fd52899f9d668030c15` | 50632988 |

Each release is one transaction. Withdrawal 1 pays from two different units to the same recipient. Withdrawal 2 pays only from the leftover of U2, which was partly drawn by withdrawal 1.

### Final state

| Unit | Status | Remaining (USDC) | Token balance (USDC) |
| --- | --- | --- | --- |
| U1 `0x3562BE11c1BDc474CE2308CC59B1F9108804bfEC` | SPENT | 0 | 0 |
| U2 `0x829FD700a271eA71E49C3c946C1Ab3Cf720db70F` | SPENT | 0 | 0 |
| U3 `0x9F4A91cA2d759FedcB934e9828eaB054E46674D9` | ACTIVE | 30 | 30 |

| Item | Value |
| --- | --- |
| Buckets (USDC): registered / active / restricted / unverified / confirmed loss | 0 / 30 / 0 / 0 / 0 |
| `principalOf` (USDC) | 30 |
| Treasury token balance (USDC) | 0 |
| Recipient balance (USDC) | 200 |

Read-back: after the run, a separate read-only script read the same state from the public RPC. All six contracts have code, every transaction listed above has status 1, and the buckets and unit states match the tables.

## Blockscout verification

Status: **pending**.

- The Blockscout instance for Base Sepolia (`base-sepolia.blockscout.com`) rejected verification submissions with HTTP 429 (rate limited). The legacy `/api` route used by the Hardhat verify plugin had no quota left. The v2 `verification/via/standard-input` route also returned 429 in the attempts recorded here.
- One earlier submission of the full build input returned HTTP 400 for `DepositUnitMockUSDC`. The cause is not established.
- No contract is verified on Blockscout at the time of writing.
- Standard JSON inputs are ready in the parent repository, one per contract, under `deployments/`. Compiler `v0.8.35+commit.47b9dedd`, license MIT, optimizer enabled with 2 runs, viaIR, EVM `cancun`.

| Contract | Address | Standard JSON input | Source files | Constructor arguments |
| --- | --- | --- | --- | --- |
| ExternalTreasuryMockVerifier | `0x2EF79D60082bE7efb59af25A50932511125E181c` | `baseSepolia-ExternalTreasuryUnits-standard-input-ExternalTreasuryMockVerifier.json` | 2 | none |
| UnitStateMockVerifier | `0xE12B6a5728751567179CB53FdB2b504A2c6f0c3f` | `baseSepolia-ExternalTreasuryUnits-standard-input-UnitStateMockVerifier.json` | 2 | none |
| DepositUnit | `0xed12Aea79F723132Eb783037a250675066610D03` | `baseSepolia-ExternalTreasuryUnits-standard-input-DepositUnit.json` | 8 | none |
| DepositUnitMockUSDC | `0xb55B0c5832D545ea49Ab8F4A0b069Fc42774988b` | `baseSepolia-ExternalTreasuryUnits-standard-input-DepositUnitMockUSDC.json` | 6 | none |
| ExternalTreasuryUnits | `0x3C3203A3574e5724f1CA3ef410694Df0f837B7a8` | `baseSepolia-ExternalTreasuryUnits-standard-input-ExternalTreasuryUnits.json` | 15 | yes |
| DepositUnitFactory | `0xA07421f74ad029F91777113ef0bA00C25a9fb762` | `baseSepolia-ExternalTreasuryUnits-standard-input-DepositUnitFactory.json` | 5 | yes |

Constructor arguments are ABI-encoded without the `0x` prefix:

```text
ExternalTreasuryUnits: 0000000000000000000000002ef79d60082be7efb59af25a50932511125e181c000000000000000000000000e12b6a5728751567179cb53fdb2b504a2c6f0c3f000000000000000000000000ed12aea79f723132eb783037a250675066610d0300000000000000000000000000000000000000000000000000000000000007d000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000b55b0c5832d545ea49ab8f4a0b069fc42774988b0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000003b9aca00
DepositUnitFactory:   0000000000000000000000003c3203a3574e5724f1ca3ef410694df0f837b7a8000000000000000000000000ed12aea79f723132eb783037a250675066610d03
```

To finish verification, one of these is needed: (1) resume the submission once the rate-limit window resets; (2) obtain a Blockscout API key at dev.blockscout.com, which raises the limit (a user action); (3) upload the matching standard JSON on each contract page in the explorer.

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

The second command needs a funded testnet deployer key in the local environment. The key is not stored in this record or in the repository. Running the script again deploys a new set of contracts.

## Changes in the parent repository

Committed on branch `feat/external-treasury-units` as commit `d503e84f` and integrated into the `main` branch of the parent repository on 2026-10-26.

- New: the contracts, the mocks, the local test file, the acceptance script, the module README, and the deployment and verification records under `deployments/`.
- Changed: `hardhat.config.ts` gained a `blockscout` explorer descriptor for chain `84532`.
