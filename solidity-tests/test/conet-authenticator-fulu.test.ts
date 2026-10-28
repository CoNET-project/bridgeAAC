import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { ethers } = await network.connect();

// Real CoNET Fulu data, captured 2026-10-28. The message block is the finalized block itself (slot 1973536),
// and the sync aggregate is in attested slot 1973606 (signature slot 1973607), epoch 61675, period 240.
const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "../fixtures/conet-fulu-finality-1973606.json"), "utf8"));
const F = fx.chain[0];

async function setup() {
  const v2 = await ethers.deployContract("AacConetSourceFinalityV2");
  const addr = await v2.getAddress();
  // The constructor sets initialized = 1 for the implementation. Reset it so this deployment can initialize,
  // as a proxy would on first use. Test-only.
  await ethers.provider.send("hardhat_setStorageAt", [addr, "0x0", ethers.ZeroHash]);
  const [owner] = await ethers.getSigners();
  await v2.connect(owner).initialize(owner.address);
  await v2.connect(owner).install(
    "0x" + fx.committeeCompressed.map((k: string) => k.slice(2)).join(""),
    fx.snapshot.slot,
    fx.snapshot.stateRoot,
  );
  const auth = await ethers.deployContract("AacConetHeaderAuthenticatorV2", [addr]);
  return { auth, v2 };
}

function aggregate(overrides: { bits?: string; attestedStateRoot?: string } = {}) {
  const a = fx.attested;
  return {
    signerUncompressed: "0x" + fx.committeeUncompressed.map((k: string) => k.slice(2)).join(""),
    bits: overrides.bits ?? fx.syncCommitteeBits,
    attested: {
      slot: a.slot,
      proposer: a.proposer,
      parentRoot: a.parentRoot,
      stateRoot: overrides.attestedStateRoot ?? a.stateRoot,
      bodyRoot: a.bodyRoot,
    },
    signatureSlot: fx.signatureSlot,
    signaturePoint: fx.signaturePoint,
  };
}

const headerOf = (h: any) => ({
  slot: h.slot,
  proposer: h.proposer,
  parentRoot: h.parentRoot,
  stateRoot: h.stateRoot,
  bodyRoot: h.bodyRoot,
});

// The receipts root is field 5 of the execution header RLP.
const receiptsRootOf = (headerRlp: string) => ethers.decodeRlp(headerRlp)[5];

describe("AacConetHeaderAuthenticatorV2: real Fulu header from the CoNET beacon chain", () => {
  it("authenticates the finalized Fulu block as the message block", async () => {
    const { auth } = await setup();
    const [headerHash, receiptsRoot] = await auth.authenticate(
      aggregate(),
      headerOf(F.header),
      fx.finalityBranch,
      [headerOf(F.header)],
      F.payloadBranch,
      F.headerRlp,
    );
    expect(headerHash).to.equal(F.blockHash);
    expect(receiptsRoot).to.equal(receiptsRootOf(F.headerRlp));
  });

  it("rejects a header RLP with one byte changed", async () => {
    const { auth } = await setup();
    const rlp = F.headerRlp.slice(0, -2) + (F.headerRlp.slice(-2) === "00" ? "01" : "00");
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), fx.finalityBranch, [headerOf(F.header)], F.payloadBranch, rlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a payload branch with one node changed", async () => {
    const { auth } = await setup();
    const branch = [...F.payloadBranch];
    branch[3] = ethers.keccak256(ethers.toUtf8Bytes("tampered node"));
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), fx.finalityBranch, [headerOf(F.header)], branch, F.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a finality branch with one node changed", async () => {
    const { auth } = await setup();
    const branch = [...fx.finalityBranch];
    branch[2] = ethers.keccak256(ethers.toUtf8Bytes("tampered finality node"));
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), branch, [headerOf(F.header)], F.payloadBranch, F.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects the Deneb-layout finality branch of 6 nodes", async () => {
    const { auth } = await setup();
    const sixNodes = fx.finalityBranch.slice(0, 6);
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), sixNodes, [headerOf(F.header)], F.payloadBranch, F.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a tampered attested state root", async () => {
    const { auth } = await setup();
    const tampered = ethers.keccak256(ethers.toUtf8Bytes("tampered attested state root"));
    await expect(
      auth.authenticate(
        aggregate({ attestedStateRoot: tampered }),
        headerOf(F.header),
        fx.finalityBranch,
        [headerOf(F.header)],
        F.payloadBranch,
        F.headerRlp,
      ),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects the sync aggregate with one participant cleared", async () => {
    const { auth } = await setup();
    const bits = ethers.getBytes(fx.syncCommitteeBits);
    bits[0] &= 0xfe;
    await expect(
      auth.authenticate(
        aggregate({ bits: ethers.hexlify(bits) }),
        headerOf(F.header),
        fx.finalityBranch,
        [headerOf(F.header)],
        F.payloadBranch,
        F.headerRlp,
      ),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("refuses an empty beacon chain", async () => {
    const { auth } = await setup();
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), fx.finalityBranch, [], F.payloadBranch, F.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("signs with the Fulu fork version for the attested epoch", async () => {
    const { v2 } = await setup();
    expect(await v2.forkVersionAt(61675)).to.equal("0x20000095");
    expect(await v2.forkVersionAt(57050)).to.equal("0x20000095");
  });
});
