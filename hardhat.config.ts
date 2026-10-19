import { defineConfig } from "hardhat/config"
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers"

// Test-only config for the bridgeAAC settlement fixes. It does not read the operator key file
// and defines no networks except the in-process Hardhat network.
// The Hardhat project root is this folder, so every Solidity source must live under it.
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  paths: {
    sources: ["contracts", "solidity-tests/contracts"],
    tests: "solidity-tests/test",
    artifacts: "solidity-tests/artifacts",
    cache: "solidity-tests/cache",
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.35",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "prague",
        },
      },
    },
  },
})
