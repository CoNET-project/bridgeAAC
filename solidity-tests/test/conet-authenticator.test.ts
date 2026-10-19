import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { ethers } = await network.connect();

// Real CoNET data. The message block P (slot 1804319) is an ancestor of the finalized block F
// (slot 1804320), which is proven by the sync aggregate in attested slot 1804388.
const here = dirname(fileURLToPath(import.meta.url));
const chain = JSON.parse(readFileSync(join(here, "../fixtures/conet-finality-chain-1804388.json"), "utf8"));
const P = chain.chain[0];
const F = chain.chain[1];

const SNAPSHOT_SLOT = 1804000;
const SNAPSHOT_STATE_ROOT = ethers.keccak256(ethers.toUtf8Bytes("conet-snapshot-test-state-root"));

async function setup() {
  const bls = await ethers.deployContract("AacConetSourceFinalityV2");
  const blsAddr = await bls.getAddress();
  await ethers.provider.send("hardhat_setStorageAt", [blsAddr, "0x0", ethers.ZeroHash]);
  const [owner] = await ethers.getSigners();
  await bls.connect(owner).initialize(owner.address);
  await bls.connect(owner).install(
    "0x" + chain.committeeCompressed.map((k: string) => k.slice(2)).join(""),
    SNAPSHOT_SLOT,
    SNAPSHOT_STATE_ROOT,
  );
  const auth = await ethers.deployContract("AacConetHeaderAuthenticator", [blsAddr]);
  return { auth, bls };
}

function aggregate(bitsOverride?: string) {
  const a = chain.attested;
  return {
    signerUncompressed: "0x" + chain.committeeUncompressed.map((k: string) => k.slice(2)).join(""),
    bits: bitsOverride ?? chain.syncCommitteeBits,
    attested: { slot: a.slot, proposer: a.proposer, parentRoot: a.parentRoot, stateRoot: a.stateRoot, bodyRoot: a.bodyRoot },
    signatureSlot: chain.signatureSlot,
    signaturePoint: chain.signaturePoint,
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

describe("AacConetHeaderAuthenticator: real CoNET header from the finalized chain", () => {
  it("authenticates the message block P as an ancestor of the finalized block F", async () => {
    const { auth } = await setup();
    const [headerHash, receiptsRoot] = await auth.authenticate(
      aggregate(),
      headerOf(F.header),
      chain.finalityBranch,
      [headerOf(P.header), headerOf(F.header)],
      P.payloadBranch,
      P.headerRlp,
    );
    expect(headerHash).to.equal(P.blockHash);
    expect(receiptsRoot).to.equal(receiptsRootOf(P.headerRlp));
  });

  it("authenticates the finalized block F as the message block itself", async () => {
    const { auth } = await setup();
    const [headerHash, receiptsRoot] = await auth.authenticate(
      aggregate(),
      headerOf(F.header),
      chain.finalityBranch,
      [headerOf(F.header)],
      F.payloadBranch,
      F.headerRlp,
    );
    expect(headerHash).to.equal(F.blockHash);
    expect(receiptsRoot).to.equal(receiptsRootOf(F.headerRlp));
  });

  it("rejects a header RLP with one byte changed", async () => {
    const { auth } = await setup();
    const rlp = P.headerRlp.slice(0, -2) + (P.headerRlp.slice(-2) === "00" ? "01" : "00");
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), chain.finalityBranch, [headerOf(P.header), headerOf(F.header)], P.payloadBranch, rlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a payload branch with one node changed", async () => {
    const { auth } = await setup();
    const branch = [...P.payloadBranch];
    branch[3] = ethers.keccak256(ethers.toUtf8Bytes("tampered node"));
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), chain.finalityBranch, [headerOf(P.header), headerOf(F.header)], branch, P.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a beacon chain whose parent link is broken", async () => {
    const { auth } = await setup();
    const broken = { ...headerOf(P.header), parentRoot: ethers.keccak256(ethers.toUtf8Bytes("not the parent")) };
    await expect(
      auth.authenticate(aggregate(), headerOf(F.header), chain.finalityBranch, [broken, headerOf(F.header)], P.payloadBranch, P.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects a finalized header that the finality branch does not commit to", async () => {
    const { auth } = await setup();
    const tampered = { ...headerOf(F.header), proposer: F.header.proposer + 1 };
    await expect(
      auth.authenticate(aggregate(), tampered, chain.finalityBranch, [headerOf(P.header), tampered], P.payloadBranch, P.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });

  it("rejects the call when the sync aggregate loses a participant", async () => {
    const { auth } = await setup();
    const bits = ethers.getBytes(chain.syncCommitteeBits);
    bits[0] &= 0xfe;
    await expect(
      auth.authenticate(aggregate(ethers.hexlify(bits)), headerOf(F.header), chain.finalityBranch, [headerOf(P.header), headerOf(F.header)], P.payloadBranch, P.headerRlp),
    ).to.be.revertedWithCustomError(auth, "InvalidProof");
  });
});
