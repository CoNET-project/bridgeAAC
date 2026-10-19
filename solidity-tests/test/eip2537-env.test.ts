import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// The test EVM is prague, so the EIP-2537 BLS precompiles must answer. Base and CoNET L1 both have them.
describe("test EVM: EIP-2537 BLS precompiles are available", () => {
  it("G1ADD (0x0b) returns a 128-byte point for two infinity points", async () => {
    const out = await ethers.provider.call({ to: "0x000000000000000000000000000000000000000b", data: "0x" + "00".repeat(256) });
    expect(ethers.getBytes(out).length).to.equal(128);
  });

  it("pairing (0x0f) returns 1 for an all-zero identity input", async () => {
    const out = await ethers.provider.call({ to: "0x000000000000000000000000000000000000000f", data: "0x" + "00".repeat(384) });
    expect(out).to.equal("0x" + "00".repeat(31) + "01");
  });
});
