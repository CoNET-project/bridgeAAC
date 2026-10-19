import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { ethers } = await network.connect();

// Real CoNET data: the finalized Deneb block 1745494 (slot 1803712) and its EL header.
// The fixture was produced on a team CoNET node, with that node's own py-ssz venv and geth IPC.
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "../fixtures/conet-deneb-1745494.json"), "utf8"));

describe("CoNET real block: header hash to beacon root (gindex 6444)", () => {
  let mock: any;
  before(async () => {
    mock = await ethers.deployContract("SszBranchMock");
  });

  it("the EL header RLP hashes to the beacon payload block_hash", () => {
    expect(ethers.keccak256(fixture.headerRlp)).to.equal(fixture.blockHash);
  });

  it("the 12-node branch from block_hash reaches the finalized beacon block root", async () => {
    expect(fixture.branch.length).to.equal(12);
    expect(await mock.verify(fixture.blockHash, fixture.gindex, fixture.branch, fixture.beaconBlockRoot)).to.equal(true);
  });

  it("rejects a header RLP with one byte changed", async () => {
    const bad = fixture.headerRlp.slice(0, -2) + (fixture.headerRlp.slice(-2) === "00" ? "01" : "00");
    expect(ethers.keccak256(bad)).to.not.equal(fixture.blockHash);
  });

  it("rejects the branch when block_hash is replaced", async () => {
    const other = ethers.keccak256(ethers.toUtf8Bytes("not the block hash"));
    expect(await mock.verify(other, fixture.gindex, fixture.branch, fixture.beaconBlockRoot)).to.equal(false);
  });

  it("rejects the branch against a different beacon block root", async () => {
    const other = ethers.keccak256(ethers.toUtf8Bytes("not the beacon root"));
    expect(await mock.verify(fixture.blockHash, fixture.gindex, fixture.branch, other)).to.equal(false);
  });
});
