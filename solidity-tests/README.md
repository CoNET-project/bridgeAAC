# bridgeAAC settlement fix tests

Adversarial and positive tests for the settlement fixes in `../contracts`:
`AacHeaderAuthority`, `AacAuthenticatedHeaderGate`, `AacChainEffectV2`,
`AacConetBaseSettlerV2`, `AacProductionCustodyGateSettlerF8`.

`baseline.test.ts` runs the same kinds of call against the original
`AacChainEffect` and `AacProductionCustodyGateSettlerF7` and shows the bugs
they still have (replay, pause bypass, unrestricted asset and mode).

## Run

These tests use Hardhat 3 with `@nomicfoundation/hardhat-toolbox-mocha-ethers`
and solc 0.8.35 (viaIR, cancun). Use an existing `node_modules` that has them:

```bash
cd solidity-tests
ln -s /path/to/node_modules node_modules   # if not already installed here
npx hardhat test test/fix.test.ts test/baseline.test.ts
```

Pass the test files explicitly. A bare `npx hardhat test` in this folder
runs only the Solidity-test stage and does not run the mocha suites.

The config does not read `~/.master.json` and defines no network except the
in-process Hardhat network.

## Mocks

`contracts/Mocks.sol` contains test doubles only (covers, consume-once, GB,
payee, treasury, effect reader, probe). They are not deployed. The fixed
contracts are tested through their real code, with the hardcoded GB and CONSUME
addresses placed by `hardhat_setCode`.

Each test starts from an EVM snapshot taken when the file loads, so state
does not carry over between tests.
