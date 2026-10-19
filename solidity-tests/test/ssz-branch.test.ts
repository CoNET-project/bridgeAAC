import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Builds a complete SSZ-style binary tree of 2^depth leaves and returns the root and the
// sibling branch for one leaf. The hashing matches AacSszBranch: sha256(left || right),
// with the even generalized index on the left.
function buildTree(depth: number, seed: number) {
  const leaves: string[] = [];
  for (let i = 0; i < 2 ** depth; i++) {
    leaves.push(ethers.sha256(ethers.toUtf8Bytes(`leaf-${seed}-${i}`)));
  }
  const levels: string[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(ethers.sha256(ethers.concat([prev[i], prev[i + 1]])));
    }
    levels.push(next);
  }
  return { root: levels[levels.length - 1][0], levels };
}

// Generalized index of leaf k in a tree of 2^depth leaves, and the sibling branch from leaf to root.
function branchFor(levels: string[][], depth: number, k: number) {
  const gindex = 2 ** depth + k;
  const branch: string[] = [];
  let idx = k;
  for (let level = 0; level < depth; level++) {
    branch.push(levels[level][idx ^ 1]);
    idx >>= 1;
  }
  return { gindex, branch };
}

describe("AacSszBranch: generalized-index branch check", () => {
  let mock: any;
  before(async () => {
    mock = await ethers.deployContract("SszBranchMock");
  });

  it("accepts the branch for every leaf of a depth-3 tree", async () => {
    const tree = buildTree(3, 1);
    for (let k = 0; k < 8; k++) {
      const { gindex, branch } = branchFor(tree.levels, 3, k);
      expect(await mock.verify(tree.levels[0][k], gindex, branch, tree.root)).to.equal(true);
    }
  });

  it("reproduces the root from a depth-12 leaf at the Electra/Fulu execution-payload gindex shape", async () => {
    // gindex 6444 has depth 12 (the same length AacEthereumBeaconPayloadProof checks), so this
    // tree has 4096 leaves and leaf index 2348.
    const tree = buildTree(12, 2);
    const k = 6444 - 4096;
    const { gindex, branch } = branchFor(tree.levels, 12, k);
    expect(gindex).to.equal(6444);
    expect(branch.length).to.equal(12);
    expect(await mock.root(tree.levels[0][k], gindex, branch)).to.equal(tree.root);
  });

  it("rejects a tampered leaf", async () => {
    const tree = buildTree(4, 3);
    const { gindex, branch } = branchFor(tree.levels, 4, 5);
    const bad = ethers.sha256(ethers.toUtf8Bytes("not the leaf"));
    expect(await mock.verify(bad, gindex, branch, tree.root)).to.equal(false);
  });

  it("rejects a tampered sibling", async () => {
    const tree = buildTree(4, 4);
    const { gindex, branch } = branchFor(tree.levels, 4, 5);
    branch[2] = ethers.sha256(ethers.toUtf8Bytes("tampered sibling"));
    expect(await mock.verify(tree.levels[0][5], gindex, branch, tree.root)).to.equal(false);
  });

  it("rejects the same leaf and branch at a different gindex", async () => {
    const tree = buildTree(4, 5);
    const { branch } = branchFor(tree.levels, 4, 5);
    // Leaf 4 has the same parent as leaf 5 but the opposite side, so the path is different.
    expect(await mock.verify(tree.levels[0][5], 16 + 4, branch, tree.root)).to.equal(false);
  });

  it("reverts when the branch length does not match the gindex depth", async () => {
    const tree = buildTree(4, 6);
    const { gindex, branch } = branchFor(tree.levels, 4, 5);
    await expect(mock.verify(tree.levels[0][5], gindex, branch.slice(1), tree.root)).to.be.revert(ethers);
  });

  it("reverts for gindex 0", async () => {
    await expect(mock.verify(ethers.ZeroHash, 0, [], ethers.ZeroHash)).to.be.revert(ethers);
  });
});
