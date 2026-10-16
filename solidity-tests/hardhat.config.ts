import { defineConfig } from "hardhat/config"
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers"

// Test-only config for the bridgeAAC settlement fixes. It does not read
// ~/.master.json and defines no networks except the in-process Hardhat network.
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  paths: {
    // Resolved from this file, not from the working directory.
    sources: [
      new URL("../contracts", import.meta.url).pathname,
      new URL("./contracts", import.meta.url).pathname,
    ],
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.35",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
    },
  },
})
