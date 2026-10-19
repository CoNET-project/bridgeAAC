# bridgeAAC settlement fix tests

Adversarial and positive tests for the settlement fixes in `../contracts`:
`AacHeaderAuthority`, `AacAuthenticatedHeaderGate`, `AacChainEffectV2`,
`AacConetBaseSettlerV2`, `AacProductionCustodyGateSettlerF8`.

`baseline.test.ts` runs the same kinds of call against the original
`AacChainEffect` and `AacProductionCustodyGateSettlerF7` and shows the bugs
they still have (replay, pause bypass, unrestricted asset and mode).

## Run

These tests use Hardhat 3 with `@nomicfoundation/hardhat-toolbox-mocha-ethers`
and solc 0.8.35 (viaIR, evmVersion prague). The Hardhat project is the repository root,
because the audited sources in `contracts/` and the mocks here must both sit under it.
The toolchain is pinned in `package.json` and `package-lock.json` at the root.

```bash
npm ci
npx hardhat test solidity-tests/test/*.test.ts
```

Pass the test files explicitly if you want a subset. Expected result on the pinned
toolchain: 82 passing, 0 failing.

The config does not read the owner key file and defines no network except the
in-process Hardhat network.

## Mocks

`contracts/Mocks.sol` contains test doubles only (covers, consume-once, GB,
payee, treasury, effect reader, probe). `contracts/CoverMocks.sol` holds the
checkpoint store and output-root proof doubles used by `cover-binding.test.ts`.
They are not deployed. The fixed
contracts are tested through their real code, with the hardcoded GB and CONSUME
addresses placed by `hardhat_setCode`.

Each test starts from an EVM snapshot taken when the file loads, so state
does not carry over between tests.
