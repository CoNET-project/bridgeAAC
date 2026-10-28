import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const ZERO_ADDR = ethers.ZeroAddress;
const TREASURY = "0x0000000000000000000000000000000000000001";
const GB = "0x0000000000000000000000000000000000000002";

async function deploy(owner: string) {
  return ethers.deployContract("AacChainEffectV2", [TREASURY, GB, owner]);
}

describe("AacChainEffectV2 owner handoff is two-step", () => {
  it("nominates a pending owner without changing the owner", async () => {
    const [owner, next] = await ethers.getSigners();
    const effect = await deploy(owner.address);
    await expect(effect.connect(owner).transferOwnership(next.address))
      .to.emit(effect, "OwnershipNominated")
      .withArgs(next.address);
    expect(await effect.owner()).to.equal(owner.address);
    expect(await effect.pendingOwner()).to.equal(next.address);
  });

  it("lets only the nominee accept, and then moves the owner", async () => {
    const [owner, next, other] = await ethers.getSigners();
    const effect = await deploy(owner.address);
    await effect.connect(owner).transferOwnership(next.address);
    await expect(effect.connect(other).acceptOwnership()).to.be.revertedWithCustomError(effect, "NotPendingOwner");
    await expect(effect.connect(next).acceptOwnership())
      .to.emit(effect, "OwnershipTransferred")
      .withArgs(owner.address, next.address);
    expect(await effect.owner()).to.equal(next.address);
    expect(await effect.pendingOwner()).to.equal(ZERO_ADDR);
  });

  it("removes the old owner's rights after the handoff", async () => {
    const [owner, next, settler] = await ethers.getSigners();
    const effect = await deploy(owner.address);
    await effect.connect(owner).transferOwnership(next.address);
    await effect.connect(next).acceptOwnership();
    await expect(effect.connect(owner).setSettler(settler.address)).to.be.revertedWithCustomError(effect, "NotOwner");
    await effect.connect(next).setSettler(settler.address);
    expect(await effect.settler()).to.equal(settler.address);
  });

  it("refuses a zero nominee and a nomination by a non-owner", async () => {
    const [owner, other] = await ethers.getSigners();
    const effect = await deploy(owner.address);
    await expect(effect.connect(owner).transferOwnership(ZERO_ADDR)).to.be.revertedWithCustomError(effect, "BadAddress");
    await expect(effect.connect(other).transferOwnership(other.address)).to.be.revertedWithCustomError(effect, "NotOwner");
  });

  it("lets the owner replace a pending nominee before it is accepted", async () => {
    const [owner, first, second] = await ethers.getSigners();
    const effect = await deploy(owner.address);
    await effect.connect(owner).transferOwnership(first.address);
    await effect.connect(owner).transferOwnership(second.address);
    await expect(effect.connect(first).acceptOwnership()).to.be.revertedWithCustomError(effect, "NotPendingOwner");
    await effect.connect(second).acceptOwnership();
    expect(await effect.owner()).to.equal(second.address);
  });
});
