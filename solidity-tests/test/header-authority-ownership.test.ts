import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const ZERO_ADDR = ethers.ZeroAddress;

async function deploy(owner: string) {
  return ethers.deployContract("AacHeaderAuthority", [owner]);
}

describe("AacHeaderAuthority owner handoff is two-step", () => {
  it("nominates a pending owner without changing the owner", async () => {
    const [owner, next] = await ethers.getSigners();
    const authority = await deploy(owner.address);
    await expect(authority.connect(owner).transferOwnership(next.address))
      .to.emit(authority, "OwnershipNominated")
      .withArgs(next.address);
    expect(await authority.owner()).to.equal(owner.address);
    expect(await authority.pendingOwner()).to.equal(next.address);
  });

  it("lets only the nominee accept, then moves the owner and removes the old owner's rights", async () => {
    const [owner, next, other, verifier] = await ethers.getSigners();
    const authority = await deploy(owner.address);
    await authority.connect(owner).transferOwnership(next.address);
    await expect(authority.connect(other).acceptOwnership()).to.be.revertedWithCustomError(authority, "NotPendingOwner");
    await expect(authority.connect(next).acceptOwnership())
      .to.emit(authority, "OwnershipTransferred")
      .withArgs(owner.address, next.address);
    expect(await authority.owner()).to.equal(next.address);
    expect(await authority.pendingOwner()).to.equal(ZERO_ADDR);

    await expect(authority.connect(owner).setVerifier(verifier.address)).to.be.revertedWithCustomError(authority, "NotOwner");
    await authority.connect(next).setVerifier(verifier.address);
    expect(await authority.verifier()).to.equal(verifier.address);
  });

  it("refuses a zero nominee and a nomination by a non-owner", async () => {
    const [owner, other] = await ethers.getSigners();
    const authority = await deploy(owner.address);
    await expect(authority.connect(owner).transferOwnership(ZERO_ADDR)).to.be.revertedWithCustomError(authority, "BadAddress");
    await expect(authority.connect(other).transferOwnership(other.address)).to.be.revertedWithCustomError(authority, "NotOwner");
  });

  it("lets the owner replace a pending nominee before it is accepted", async () => {
    const [owner, first, second] = await ethers.getSigners();
    const authority = await deploy(owner.address);
    await authority.connect(owner).transferOwnership(first.address);
    await authority.connect(owner).transferOwnership(second.address);
    await expect(authority.connect(first).acceptOwnership()).to.be.revertedWithCustomError(authority, "NotPendingOwner");
    await authority.connect(second).acceptOwnership();
    expect(await authority.owner()).to.equal(second.address);
  });

  it("keeps the fail-closed default until a verifier is set after the handoff", async () => {
    const [owner, next, headerSigner] = await ethers.getSigners();
    const authority = await deploy(owner.address);
    await authority.connect(owner).transferOwnership(next.address);
    await authority.connect(next).acceptOwnership();
    expect(await authority.isAuthenticated(224422, ethers.id("header"))).to.equal(false);
    await expect(
      authority.connect(headerSigner).authenticate(224422, ethers.id("header")),
    ).to.be.revertedWithCustomError(authority, "NotVerifier");
  });
});
