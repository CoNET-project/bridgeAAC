import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { ethers } = await network.connect();

// Real CoNET data for attested slot 1804388 and the sync aggregate in slot 1804389.
// Produced from the node's finalized state and block, with the Rust verifier as the check.
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "../fixtures/conet-sync-finality-1804388.json"), "utf8"));

describe("CoNET real sync data: finality branch and aggregate inputs", () => {
  let mock: any;
  before(async () => {
    mock = await ethers.deployContract("SszBranchMock");
  });

  it("the finality branch reaches the attested state root from the finalized root (gindex 105)", async () => {
    expect(fixture.finalityGindex).to.equal(105);
    expect(fixture.finalityBranch.length).to.equal(6);
    expect(await mock.verify(fixture.finalizedRoot, 105, fixture.finalityBranch, fixture.stateRoot)).to.equal(true);
  });

  it("rejects a finalized root that the branch does not commit to", async () => {
    const other = ethers.keccak256(ethers.toUtf8Bytes("not the finalized root"));
    expect(await mock.verify(other, 105, fixture.finalityBranch, fixture.stateRoot)).to.equal(false);
  });

  it("the signing root recomputed from the domain matches the fixture", () => {
    const gvr = fixture.genesisValidatorsRoot;
    const forkRoot = ethers.sha256(ethers.concat([fixture.forkVersion.padEnd(10, "0") + "00".repeat(28), gvr]));
    const domain = ethers.concat(["0x07000000", ethers.dataSlice(forkRoot, 0, 28)]);
    const signingRoot = ethers.sha256(ethers.concat([fixture.attestedRoot, domain]));
    expect(signingRoot).to.equal(fixture.signingRoot);
  });

  it("the sync bitfield marks 512 participants and the committee has 512 keys", () => {
    const bits = ethers.getBytes(fixture.syncCommitteeBits);
    let count = 0;
    for (let i = 0; i < 512; i++) if ((bits[Math.floor(i / 8)] >> (i % 8)) & 1) count++;
    expect(count).to.equal(512);
    expect(fixture.committeePubkeys.length).to.equal(512);
    expect(fixture.participants).to.equal(512);
  });
});
