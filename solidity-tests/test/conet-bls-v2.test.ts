import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { ethers } = await network.connect();

// Real CoNET sync aggregate for attested slot 1804388 (signature slot 1804389), Deneb epoch.
const here = dirname(fileURLToPath(import.meta.url));
const chain = JSON.parse(readFileSync(join(here, "../fixtures/conet-finality-chain-1804388.json"), "utf8"));

// A snapshot in the same period as the attested slot (period 220). Its root is a test value,
// distinct from the attested state root, as the contract requires.
const SNAPSHOT_SLOT = 1804000;
const SNAPSHOT_STATE_ROOT = ethers.keccak256(ethers.toUtf8Bytes("conet-snapshot-test-state-root"));

function aggregateInput(overrides: { bits?: string; attestedStateRoot?: string } = {}) {
  const a = chain.attested;
  return {
    signerUncompressed: "0x" + chain.committeeUncompressed.map((k: string) => k.slice(2)).join(""),
    bits: overrides.bits ?? chain.syncCommitteeBits,
    attested: {
      slot: a.slot,
      proposer: a.proposer,
      parentRoot: a.parentRoot,
      stateRoot: overrides.attestedStateRoot ?? a.stateRoot,
      bodyRoot: a.bodyRoot,
    },
    signatureSlot: chain.signatureSlot,
    signaturePoint: chain.signaturePoint,
  };
}

async function setup() {
  const v2 = await ethers.deployContract("AacConetSourceFinalityV2");
  const addr = await v2.getAddress();
  // The constructor sets initialized = 1 for the implementation. Reset it so this deployment can initialize,
  // as a proxy would on first use. Test-only.
  await ethers.provider.send("hardhat_setStorageAt", [addr, "0x0", ethers.ZeroHash]);
  const [owner] = await ethers.getSigners();
  await v2.connect(owner).initialize(owner.address);
  const compressed = "0x" + chain.committeeCompressed.map((k: string) => k.slice(2)).join("");
  await v2.connect(owner).install(compressed, SNAPSHOT_SLOT, SNAPSHOT_STATE_ROOT);
  return v2;
}

describe("AacConetSourceFinalityV2: real CoNET sync aggregate", () => {
  it("verifies the real CoNET sync aggregate with 512 participants", async () => {
    const v2 = await setup();
    const [participants, ok] = await v2.verifyAggregate(aggregateInput());
    expect(ok).to.equal(true);
    expect(participants).to.equal(512n);
  });

  it("rejects the same aggregate with one participant cleared", async () => {
    const v2 = await setup();
    const bits = ethers.getBytes(chain.syncCommitteeBits);
    bits[0] &= 0xfe;
    await expect(v2.verifyAggregate(aggregateInput({ bits: ethers.hexlify(bits) }))).to.be.revertedWithCustomError(
      v2,
      "InvalidProof",
    );
  });

  it("rejects the same aggregate with a tampered attested state root", async () => {
    const v2 = await setup();
    const tampered = ethers.keccak256(ethers.toUtf8Bytes("tampered state root"));
    await expect(
      v2.verifyAggregate(aggregateInput({ attestedStateRoot: tampered })),
    ).to.be.revertedWithCustomError(v2, "InvalidProof");
  });

  it("uses the CoNET fork version by epoch: Deneb, Electra, then Fulu", async () => {
    const v2 = await setup();
    expect(await v2.forkVersionAt(0)).to.equal("0x20000093");
    expect(await v2.forkVersionAt(56386)).to.equal("0x20000093"); // the real fixture epoch
    expect(await v2.forkVersionAt(56901)).to.equal("0x20000093");
    expect(await v2.forkVersionAt(56902)).to.equal("0x20000094");
    expect(await v2.forkVersionAt(57049)).to.equal("0x20000094");
    expect(await v2.forkVersionAt(57050)).to.equal("0x20000095");
    expect(await v2.forkVersionAt(57105)).to.equal("0x20000095");
  });
});
