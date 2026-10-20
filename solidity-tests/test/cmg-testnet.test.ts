import { expect } from "chai";
import { network } from "hardhat";

// Local tests for the TESTNET-ONLY CMG contracts. They cover the manifest's positive path (S6) and
// negative path (S7) on the in-process network only. Nothing here connects to CoNET or any other chain.
const { ethers } = await network.connect();

type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

// Test parameters from the manifest, decision B: gate 0.01 cnet and cap 0.05 cnet. The lock, maturity, voting and
// delay values are the manifest's draft values, which are not confirmed yet.
const GATE = ethers.parseEther("0.01");
const CAP = ethers.parseEther("0.05");
const LOCK = 3600n;
const MATURITY = 120n;
const VOTING = 600n;
const DELAY = 120n;
const BUMP_SELECTOR = ethers.id("bump()").slice(0, 10);

// Advance the chain clock and mine a block so that reads see the new time.
async function warp(seconds: bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

// A fresh system wired the way the manifest describes: target, registry, core, then setCore from the target's deployer.
async function deploySystem() {
  const [owner, outsider, alice, bob, carol, mallory] = await ethers.getSigners();
  const target = await ethers.deployContract("CmgTestTarget", [], owner);
  const registry = await ethers.deployContract("CmgRegistryTestnet", [
    [alice.address, bob.address, carol.address],
    GATE,
    CAP,
    LOCK,
    MATURITY,
    owner.address,
  ]);
  const core = await ethers.deployContract("CmgCoreTestnet", [
    registry.target,
    target.target,
    owner.address,
    VOTING,
    DELAY,
  ]);
  await target.connect(owner).setCore(core.target);
  const bump = target.interface.encodeFunctionData("bump");
  return { owner, outsider, alice, bob, carol, mallory, target, registry, core, bump };
}

type System = Awaited<ReturnType<typeof deploySystem>>;

// Stake each amount from its signer, then wait until those stakes have matured.
async function stakeAndMature(s: System, stakes: readonly (readonly [Signer, bigint])[]) {
  for (const [signer, amount] of stakes) {
    await s.registry.connect(signer).stake({ value: amount });
  }
  await warp(MATURITY + 5n);
}

// Propose bump() from `signer` and return the id the proposal gets.
async function propose(s: System, signer: Signer) {
  const id = await s.core.nextProposalId();
  await s.core.connect(signer).propose(s.bump);
  return id;
}

// A constructor revert has no deployed instance to decode against, so the factory supplies the ABI.
async function expectRegistryRejected(args: unknown[]) {
  const factory = await ethers.getContractFactory("CmgRegistryTestnet");
  await expect(factory.deploy(...args)).to.be.revertedWithCustomError(factory, "BadConfig");
}

describe("CmgRegistryTestnet", () => {
  it("rejects bad registry configurations, including a gate above the cap and a cap below the gate", async () => {
    const [owner, alice] = await ethers.getSigners();
    const seventeen = Array.from({ length: 17 }, (_, i) => ethers.zeroPadValue(ethers.toBeHex(0x1000 + i), 20));
    // A gate of 0.1 cnet under the 0.05 cnet cap is the combination the first request asked for.
    await expectRegistryRejected([[alice.address], ethers.parseEther("0.1"), CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[alice.address], GATE, ethers.parseEther("0.005"), LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[alice.address], 0n, CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[alice.address], GATE, CAP, LOCK, LOCK, owner.address]);
    await expectRegistryRejected([[], GATE, CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([seventeen, GATE, CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[alice.address, alice.address], GATE, CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[ethers.ZeroAddress], GATE, CAP, LOCK, MATURITY, owner.address]);
    await expectRegistryRejected([[alice.address], GATE, CAP, LOCK, MATURITY, ethers.ZeroAddress]);
  });

  it("lists the fixed depositors and records a stake", async () => {
    const s = await deploySystem();
    expect(await s.registry.depositors()).to.deep.equal([s.alice.address, s.bob.address, s.carol.address]);
    await expect(s.registry.connect(s.alice).stake({ value: GATE })).to.emit(s.registry, "Staked");
    expect(await s.registry.outstanding()).to.equal(GATE);
    expect(await s.registry.depositCount(s.alice.address)).to.equal(1n);
    const [amount, , withdrawn] = await s.registry.depositOf(s.alice.address, 0);
    expect(amount).to.equal(GATE);
    expect(withdrawn).to.equal(0n);
  });

  it("rejects stakes from non-depositors, zero value and stakes above the cap", async () => {
    const s = await deploySystem();
    await expect(s.registry.connect(s.mallory).stake({ value: GATE })).to.be.revertedWithCustomError(
      s.registry,
      "NotDepositor",
    );
    await expect(s.registry.connect(s.alice).stake({ value: 0n })).to.be.revertedWithCustomError(
      s.registry,
      "ZeroValue",
    );
    // Fill the cap exactly: 0.02 + 0.02 + 0.01 = 0.05 cnet.
    await s.registry.connect(s.alice).stake({ value: (CAP * 2n) / 5n });
    await s.registry.connect(s.bob).stake({ value: (CAP * 2n) / 5n });
    await s.registry.connect(s.carol).stake({ value: CAP / 5n });
    await expect(s.registry.connect(s.alice).stake({ value: 1n })).to.be.revertedWithCustomError(
      s.registry,
      "CapExceeded",
    );
  });

  it("caps the number of deposits per account", async () => {
    const s = await deploySystem();
    const max = Number(await s.registry.MAX_DEPOSITS_PER_ACCOUNT());
    for (let i = 0; i < max; i++) {
      await s.registry.connect(s.alice).stake({ value: 1n });
    }
    await expect(s.registry.connect(s.alice).stake({ value: 1n })).to.be.revertedWithCustomError(
      s.registry,
      "TooManyDeposits",
    );
  });

  it("gives weight only between maturity and the end of the lock", async () => {
    const s = await deploySystem();
    await s.registry.connect(s.alice).stake({ value: GATE });
    expect(await s.registry.weightOf(s.alice.address)).to.equal(0n);
    await warp(MATURITY + 5n);
    expect(await s.registry.weightOf(s.alice.address)).to.equal(GATE);
    await warp(LOCK);
    expect(await s.registry.weightOf(s.alice.address)).to.equal(0n);
  });

  it("refuses withdrawals while locked, then pays out after the lock", async () => {
    const s = await deploySystem();
    await s.registry.connect(s.alice).stake({ value: GATE });
    await warp(MATURITY + 5n);
    await expect(s.registry.connect(s.alice).withdraw(0, GATE)).to.be.revertedWithCustomError(
      s.registry,
      "LockActive",
    );
    await warp(LOCK);
    await expect(s.registry.connect(s.alice).withdraw(0, GATE))
      .to.emit(s.registry, "Withdrawn")
      .withArgs(s.alice.address, 0n, GATE);
    expect(await s.registry.outstanding()).to.equal(0n);
    const [, , withdrawn] = await s.registry.depositOf(s.alice.address, 0);
    expect(withdrawn).to.equal(GATE);
  });

  it("rejects empty, oversized and unknown withdrawals", async () => {
    const s = await deploySystem();
    await s.registry.connect(s.alice).stake({ value: GATE });
    await warp(LOCK);
    await expect(s.registry.connect(s.alice).withdraw(0, 0n)).to.be.revertedWithCustomError(
      s.registry,
      "AmountTooLarge",
    );
    await expect(s.registry.connect(s.alice).withdraw(0, GATE + 1n)).to.be.revertedWithCustomError(
      s.registry,
      "AmountTooLarge",
    );
    await expect(s.registry.connect(s.alice).withdraw(7, GATE)).to.be.revertedWithCustomError(s.registry, "BadIndex");
  });

  it("lets the owner pause new deposits while withdrawals stay open", async () => {
    const s = await deploySystem();
    await s.registry.connect(s.alice).stake({ value: GATE });
    await expect(s.registry.connect(s.alice).setPaused(true)).to.be.revertedWithCustomError(s.registry, "NotOwner");
    await s.registry.connect(s.owner).setPaused(true);
    await expect(s.registry.connect(s.bob).stake({ value: GATE })).to.be.revertedWithCustomError(
      s.registry,
      "IsPaused",
    );
    await warp(LOCK);
    await expect(s.registry.connect(s.alice).withdraw(0, GATE)).to.emit(s.registry, "Withdrawn");
  });
});

describe("CmgTestTarget", () => {
  it("counts bump() only from the core, and the core is wired once", async () => {
    const s = await deploySystem();
    await expect(s.target.connect(s.alice).bump()).to.be.revertedWithCustomError(s.target, "NotCore");
    await expect(s.target.connect(s.alice).setCore(s.alice.address)).to.be.revertedWithCustomError(
      s.target,
      "NotDeployer",
    );
    await expect(s.target.connect(s.owner).setCore(s.alice.address)).to.be.revertedWithCustomError(
      s.target,
      "CoreAlreadySet",
    );
    expect(await s.target.core()).to.equal(await s.core.getAddress());
    expect(await s.target.count()).to.equal(0n);
  });
});

describe("CmgCoreTestnet", () => {
  it("refuses a target the core owner did not deploy, and a contract without deployer()", async () => {
    const s = await deploySystem();
    const coreFactory = await ethers.getContractFactory("CmgCoreTestnet");
    const otherTarget = await ethers.deployContract("CmgTestTarget", [], s.outsider);
    await expect(
      coreFactory.deploy(s.registry.target, otherTarget.target, s.owner.address, VOTING, DELAY),
    ).to.be.revertedWithCustomError(coreFactory, "BadConfig");
    // The registry has no deployer(), so it stands in for a production address. The constructor call reverts.
    let rejected = false;
    try {
      await coreFactory.deploy(s.registry.target, s.registry.target, s.owner.address, VOTING, DELAY);
    } catch {
      rejected = true;
    }
    expect(rejected).to.equal(true);
  });

  it("snapshots weights at proposal time and rejects ineligible proposers and other calldata", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.carol, GATE / 2n],
    ]);
    await expect(s.core.connect(s.carol).propose(s.bump)).to.be.revertedWithCustomError(s.core, "NotEligible");
    await expect(s.core.connect(s.mallory).propose(s.bump)).to.be.revertedWithCustomError(s.core, "NotEligible");
    const other = s.target.interface.encodeFunctionData("setCore", [s.alice.address]);
    await expect(s.core.connect(s.alice).propose(other)).to.be.revertedWithCustomError(s.core, "BadCalldata");

    const id = await propose(s, s.alice);
    const p = await s.core.proposals(id);
    expect(p.proposer).to.equal(s.alice.address);
    expect(p.totalWeight).to.equal(GATE + GATE / 2n);
    expect(await s.core.snapshotWeight(id, s.alice.address)).to.equal(GATE);
    expect(await s.core.snapshotWeight(id, s.carol.address)).to.equal(GATE / 2n);
    expect(await s.core.snapshotWeight(id, s.bob.address)).to.equal(0n);
  });

  it("passes at exactly two thirds of the snapshot weight and emits ProposalPassed", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.bob, GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    const p = await s.core.proposals(id);
    expect(p.totalWeight).to.equal(3n * GATE);
    await s.core.connect(s.alice).vote(id, true);
    await s.core.connect(s.bob).vote(id, false);
    expect((await s.core.proposals(id)).passed).to.equal(false);
    await expect(s.core.connect(s.carol).vote(id, true))
      .to.emit(s.core, "ProposalPassed")
      .withArgs(id, s.target.target, BUMP_SELECTOR, p.snapshotTime, 3n * GATE, 2n * GATE);
    expect((await s.core.proposals(id)).passed).to.equal(true);
    await expect(s.core.connect(s.bob).vote(id, true)).to.be.revertedWithCustomError(s.core, "AlreadyPassed");
  });

  it("uses each voter's own weight at the two-thirds boundary", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.bob, 2n * GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    await s.core.connect(s.alice).vote(id, true);
    await s.core.connect(s.carol).vote(id, true);
    // 0.2 yes out of 0.4 total is half, which is below two thirds.
    expect((await s.core.proposals(id)).passed).to.equal(false);
    await s.core.connect(s.bob).vote(id, true);
    expect((await s.core.proposals(id)).passed).to.equal(true);
  });

  it("rejects duplicate votes and voters who were not eligible at the snapshot", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.carol, GATE],
    ]);
    // Bob stakes after the other two matured, so his weight is zero when the proposal is taken.
    await s.registry.connect(s.bob).stake({ value: GATE });
    const id = await propose(s, s.alice);
    await s.core.connect(s.alice).vote(id, true);
    await expect(s.core.connect(s.alice).vote(id, true)).to.be.revertedWithCustomError(s.core, "AlreadyVoted");
    await warp(MATURITY + 5n);
    // Bob matures now, but the snapshot already excludes him.
    await expect(s.core.connect(s.bob).vote(id, true)).to.be.revertedWithCustomError(s.core, "NotEligible");
    await expect(s.core.connect(s.mallory).vote(id, true)).to.be.revertedWithCustomError(s.core, "NotEligible");
    await expect(s.core.connect(s.alice).vote(999n, true)).to.be.revertedWithCustomError(s.core, "NoProposal");
  });

  it("rejects votes after the voting period", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    await warp(VOTING + 5n);
    await expect(s.core.connect(s.carol).vote(id, true)).to.be.revertedWithCustomError(s.core, "VotingClosed");
  });

  it("runs only after passing and the delay, and runs once", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.bob, GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    await expect(s.core.connect(s.mallory).execute(id)).to.be.revertedWithCustomError(s.core, "NotPassed");
    await s.core.connect(s.alice).vote(id, true);
    await s.core.connect(s.bob).vote(id, true);
    await expect(s.core.connect(s.mallory).execute(id)).to.be.revertedWithCustomError(s.core, "TooEarly");
    await warp(DELAY + 5n);
    await expect(s.core.connect(s.mallory).execute(id)).to.emit(s.core, "Executed").withArgs(id);
    expect(await s.target.count()).to.equal(1n);
    await expect(s.core.connect(s.mallory).execute(id)).to.be.revertedWithCustomError(s.core, "AlreadyExecuted");
  });

  it("pause stops propose, vote and execute, and only the owner can pause", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.bob, GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    await s.core.connect(s.alice).vote(id, true);
    await s.core.connect(s.bob).vote(id, true);
    await warp(DELAY + 5n);
    await expect(s.core.connect(s.alice).setPaused(true)).to.be.revertedWithCustomError(s.core, "NotOwner");
    await s.core.connect(s.owner).setPaused(true);
    await expect(s.core.connect(s.alice).propose(s.bump)).to.be.revertedWithCustomError(s.core, "IsPaused");
    await expect(s.core.connect(s.carol).vote(id, true)).to.be.revertedWithCustomError(s.core, "IsPaused");
    await expect(s.core.connect(s.mallory).execute(id)).to.be.revertedWithCustomError(s.core, "IsPaused");
    await s.core.connect(s.owner).setPaused(false);
    await expect(s.core.connect(s.mallory).execute(id)).to.emit(s.core, "Executed").withArgs(id);
  });

  it("runs the acceptance path: stake, mature, propose, vote, pass, delay, execute, then withdraw after the lock", async () => {
    const s = await deploySystem();
    await stakeAndMature(s, [
      [s.alice, GATE],
      [s.bob, GATE],
      [s.carol, GATE],
    ]);
    const id = await propose(s, s.alice);
    await s.core.connect(s.alice).vote(id, true);
    await s.core.connect(s.bob).vote(id, true);
    await warp(DELAY + 5n);
    await s.core.connect(s.mallory).execute(id);
    expect(await s.target.count()).to.equal(1n);
    expect(await s.registry.weightOf(s.alice.address)).to.equal(GATE);
    await warp(LOCK);
    expect(await s.registry.weightOf(s.alice.address)).to.equal(0n);
    await expect(s.registry.connect(s.alice).withdraw(0, GATE)).to.emit(s.registry, "Withdrawn");
    expect(await s.registry.outstanding()).to.equal(2n * GATE);
  });
});
