import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
// Each test starts from the snapshot taken when this file loaded. Storage at the
// hardcoded GB and CONSUME addresses otherwise survives between tests, because
// hardhat_setCode copies code only. Run each file in its own process.
let baseSnap = "";
before(async () => {
  baseSnap = await ethers.provider.send("evm_snapshot", []);
});
const fixture = async <T>(f: () => Promise<T>): Promise<T> => {
  await ethers.provider.send("evm_revert", [baseSnap]);
  baseSnap = await ethers.provider.send("evm_snapshot", []);
  return f();
};

const ZERO = "0x" + "00".repeat(32);
const GB_ADDR = "0xC3EF02DaE632b4C10abB66e07d92a387c10838D8";
const CONSUME_ADDR = "0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F";
const BASE_CHAIN = 8453n;
const CONET_CHAIN = 224422n;

const aggregate = () => ({
  signerUncompressed: "0x",
  bits: "0x",
  attested: { slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO },
  signatureSlot: 0,
  signaturePoint: "0x",
});
const header = () => ({ slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO });
const branch = () => Array(7).fill(ZERO);
const receiptFor = (beneficiary: string, gross: bigint) =>
  ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [beneficiary, gross]);
const hashOf = (hex: string) => ethers.keccak256(hex);
const opId = (n: number) => ethers.zeroPadValue(ethers.toBeHex(n), 32);

async function deployAt(address: string, contractName: string) {
  const c = await ethers.deployContract(contractName);
  const code = await ethers.provider.getCode(await c.getAddress());
  await ethers.provider.send("hardhat_setCode", [address, code]);
  return ethers.getContractAt(contractName, address);
}

async function setup() {
  const [owner, verifier, settler, alice, bob] = await ethers.getSigners();
  const authority = await ethers.deployContract("AacHeaderAuthority", [owner.address]);
  await authority.setVerifier(verifier.address);
  const baseCover = await ethers.deployContract("MockBaseCover");
  const conetInclusion = await ethers.deployContract("MockConetInclusion");
  const gate = await ethers.deployContract("AacAuthenticatedHeaderGate", [
    await authority.getAddress(),
    await baseCover.getAddress(),
    await conetInclusion.getAddress(),
  ]);
  const payee = await ethers.deployContract("MockPayee");
  const gb = await deployAt(GB_ADDR, "MockGB");
  const consume = await deployAt(CONSUME_ADDR, "MockConsume");
  const f8 = await ethers.deployContract("AacProductionCustodyGateSettlerF8", [
    await payee.getAddress(),
    await gate.getAddress(),
  ]);
  return { owner, verifier, settler, alice, bob, authority, baseCover, conetInclusion, gate, payee, gb, consume, f8 };
}

describe("C1: header authority and gate (fail-closed)", () => {
  it("refuses every header when nothing is authenticated", async () => {
    const { baseCover, gate, alice } = await fixture(setup);
    await baseCover.set(opId(1), 5n, true, true);
    await expect(
      gate.connect(alice).cover(aggregate(), header(), branch(), "0x1234", "0x", [], 0n, 0n, [])
    ).to.be.revertedWithCustomError(gate, "HeaderNotAuthenticated");
    expect(await baseCover.calls()).to.equal(0n);
  });

  it("only the verifier can authenticate a header", async () => {
    const { authority, alice } = await fixture(setup);
    await expect(authority.connect(alice).authenticate(BASE_CHAIN, hashOf("0x1234")))
      .to.be.revertedWithCustomError(authority, "NotVerifier");
  });

  it("forwards an authenticated Base header to the cover", async () => {
    const { authority, verifier, baseCover, gate, alice } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(1), 5n, true, true);
    await gate.connect(alice).cover(aggregate(), header(), branch(), "0x1234", "0x", [], 0n, 0n, []);
    expect(await baseCover.calls()).to.equal(1n);
  });

  it("binds the chain id: a CoNET authentication does not authorize a Base header (H2)", async () => {
    const { authority, verifier, baseCover, gate, alice } = await fixture(setup);
    await authority.connect(verifier).authenticate(CONET_CHAIN, hashOf("0x1234"));
    await expect(
      gate.connect(alice).cover(aggregate(), header(), branch(), "0x1234", "0x", [], 0n, 0n, [])
    ).to.be.revertedWithCustomError(gate, "HeaderNotAuthenticated");
    expect(await baseCover.calls()).to.equal(0n);
  });

  it("requires CoNET header authentication for coverConet", async () => {
    const { authority, verifier, conetInclusion, gate, alice } = await fixture(setup);
    await expect(
      gate.connect(alice).coverConet(aggregate(), "0x5678", "0x", [], 0n, 0n, [])
    ).to.be.revertedWithCustomError(gate, "HeaderNotAuthenticated");
    await authority.connect(verifier).authenticate(CONET_CHAIN, hashOf("0x5678"));
    await conetInclusion.set(opId(2), 7n, true, true);
    await gate.connect(alice).coverConet(aggregate(), "0x5678", "0x", [], 0n, 0n, []);
    expect(await conetInclusion.calls()).to.equal(1n);
  });

  it("owner revocation takes effect at once", async () => {
    const { owner, authority, verifier, baseCover, gate, alice } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await authority.connect(owner).revoke(BASE_CHAIN, hashOf("0x1234"));
    await expect(
      gate.connect(alice).cover(aggregate(), header(), branch(), "0x1234", "0x", [], 0n, 0n, [])
    ).to.be.revertedWithCustomError(gate, "HeaderNotAuthenticated");
    expect(await baseCover.calls()).to.equal(0n);
  });
});

describe("C1/C3: F8 Base settler", () => {
  it("refuses an unauthenticated Base header before any mint or consume", async () => {
    const { baseCover, gb, consume, f8, alice, bob } = await fixture(setup);
    await baseCover.set(opId(1), 10n, true, true);
    await expect(
      f8.connect(alice).settle(aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address)
    ).to.be.revertedWithCustomError(await ethers.getContractAt("AacAuthenticatedHeaderGate", await f8.GATE()), "HeaderNotAuthenticated");
    expect(await gb.mintCalls()).to.equal(0n);
    expect(await consume.calls()).to.equal(0n);
  });

  it("settles an authenticated header once and mints to the proven beneficiary", async () => {
    const { authority, verifier, baseCover, gb, consume, f8, alice, bob } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(1), 10n, true, true);
    await expect(
      f8.connect(alice).settle(aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address)
    ).to.emit(f8, "Minted");
    expect(await gb.minted(bob.address)).to.equal(10n);
    expect(await consume.consumed(opId(1))).to.equal(true);
  });

  it("refuses GB minting while the bridge is paused, and leaves nothing consumed", async () => {
    const { authority, verifier, baseCover, gb, consume, f8, alice, bob } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(3), 10n, true, true);
    await gb.setPaused(true);
    await expect(
      f8.connect(alice).settle(aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address)
    ).to.be.revertedWithCustomError(f8, "BridgePaused");
    expect(await gb.mintCalls()).to.equal(0n);
    expect(await consume.consumed(opId(3))).to.equal(false);
  });

  it("refuses a replayed operationId", async () => {
    const { authority, verifier, baseCover, gb, consume, f8, alice, bob } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(4), 10n, true, true);
    const args = [aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address] as const;
    await f8.connect(alice).settle(...args);
    await expect(f8.connect(alice).settle(...args)).to.be.revertedWithCustomError(consume, "AlreadyConsumed");
    expect(await gb.minted(bob.address)).to.equal(10n);
  });

  it("refuses a mintTo that is not the receipt beneficiary", async () => {
    const { authority, verifier, baseCover, f8, alice, bob } = await fixture(setup);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(5), 10n, true, true);
    await expect(
      f8.connect(alice).settle(aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], alice.address, alice.address)
    ).to.be.revertedWithCustomError(f8, "BadMintTo");
  });

  it("refuses an unauthenticated CoNET header on settleFromConet", async () => {
    const { conetInclusion, gate, f8, alice, bob } = await fixture(setup);
    await conetInclusion.set(opId(6), 10n, true, true);
    await expect(
      f8.connect(alice).settleFromConet(aggregate(), "0x5678", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address)
    ).to.be.revertedWithCustomError(gate, "HeaderNotAuthenticated");
    expect(await conetInclusion.calls()).to.equal(0n);
  });

  it("settles an authenticated CoNET header", async () => {
    const { authority, verifier, conetInclusion, gb, f8, alice, bob } = await fixture(setup);
    await authority.connect(verifier).authenticate(CONET_CHAIN, hashOf("0x5678"));
    await conetInclusion.set(opId(7), 10n, true, true);
    await f8.connect(alice).settleFromConet(aggregate(), "0x5678", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address);
    expect(await gb.minted(bob.address)).to.equal(10n);
  });
});

describe("C2/C3: AacChainEffectV2 (CoNET)", () => {
  async function effectSetup() {
    const [owner, settler, alice, bob] = await ethers.getSigners();
    const gb = await ethers.deployContract("MockGB");
    const treasury = await ethers.deployContract("MockTreasury");
    const effect = await ethers.deployContract("AacChainEffectV2", [
      await treasury.getAddress(),
      await gb.getAddress(),
      owner.address,
    ]);
    await effect.setSettler(settler.address);
    return { owner, settler, alice, bob, gb, treasury, effect };
  }

  it("accepts completion only from the settler", async () => {
    const { effect, alice, bob, gb } = await effectSetup();
    await effect.setRoute(await gb.getAddress(), 1, true, 100n);
    await expect(effect.connect(alice).complete(opId(1), await gb.getAddress(), bob.address, 10n, 1))
      .to.be.revertedWithCustomError(effect, "NotSettler");
  });

  it("refuses every route until the owner allows it", async () => {
    const { effect, settler, bob, gb } = await effectSetup();
    await expect(effect.connect(settler).complete(opId(2), await gb.getAddress(), bob.address, 10n, 1))
      .to.be.revertedWithCustomError(effect, "RouteNotAllowed");
  });

  it("enforces the per-operation cap", async () => {
    const { effect, settler, bob, gb } = await effectSetup();
    await effect.setRoute(await gb.getAddress(), 1, true, 10n);
    await expect(effect.connect(settler).complete(opId(3), await gb.getAddress(), bob.address, 11n, 1))
      .to.be.revertedWithCustomError(effect, "AmountOverCap");
  });

  it("consumes each operationId once", async () => {
    const { effect, settler, bob, gb } = await effectSetup();
    await effect.setRoute(await gb.getAddress(), 1, true, 100n);
    await effect.connect(settler).complete(opId(4), await gb.getAddress(), bob.address, 10n, 1);
    await expect(effect.connect(settler).complete(opId(4), await gb.getAddress(), bob.address, 10n, 1))
      .to.be.revertedWithCustomError(effect, "AlreadyConsumed");
    expect(await gb.minted(bob.address)).to.equal(10n);
  });

  it("refuses GB minting while the GB bridge is paused", async () => {
    const { effect, settler, bob, gb } = await effectSetup();
    await effect.setRoute(await gb.getAddress(), 1, true, 100n);
    await gb.setPaused(true);
    await expect(effect.connect(settler).complete(opId(5), await gb.getAddress(), bob.address, 10n, 1))
      .to.be.revertedWithCustomError(effect, "BridgePaused");
    expect(await effect.consumed(opId(5))).to.equal(false);
  });

  it("routes an allowed non-GB asset through the treasury", async () => {
    const { effect, settler, bob, treasury } = await effectSetup();
    const usdc = "0x5209865D404aA5646eDe5B91CD4218909eA72eDA";
    await effect.setRoute(usdc, 1, true, 100n);
    await effect.connect(settler).complete(opId(6), usdc, bob.address, 10n, 1);
    expect(await treasury.calls()).to.equal(1n);
    expect(await treasury.lastAsset()).to.equal(usdc);
    expect(await treasury.lastMode()).to.equal(1n);
  });

  it("refuses a different mode on the same asset", async () => {
    const { effect, settler, bob, treasury } = await effectSetup();
    const usdc = "0x5209865D404aA5646eDe5B91CD4218909eA72eDA";
    await effect.setRoute(usdc, 1, true, 100n);
    await expect(effect.connect(settler).complete(opId(7), usdc, bob.address, 10n, 2))
      .to.be.revertedWithCustomError(effect, "RouteNotAllowed");
    expect(await treasury.calls()).to.equal(0n);
  });
});

describe("C1: gate constructor", () => {
  it("refuses a zero cover or inclusion address", async () => {
    const [owner, , , , carol] = await ethers.getSigners();
    const authority = await ethers.deployContract("AacHeaderAuthority", [owner.address]);
    const deployThrows = async (args: string[]) => {
      try {
        await ethers.deployContract("AacAuthenticatedHeaderGate", args);
        return false;
      } catch {
        return true;
      }
    };
    expect(await deployThrows([await authority.getAddress(), ethers.ZeroAddress, carol.address])).to.equal(true);
    expect(await deployThrows([await authority.getAddress(), carol.address, ethers.ZeroAddress])).to.equal(true);
  });
});

describe("C1: CoNET settler v2 wiring", () => {
  it("takes the chain effect as a constructor argument", async () => {
    const [, , , , carol] = await ethers.getSigners();
    const settler = await ethers.deployContract("AacConetBaseSettlerV2", [
      carol.address, carol.address, carol.address, carol.address,
    ]);
    expect(await settler.EFFECT()).to.equal(carol.address);
  });

  it("refuses a zero effect address", async () => {
    const [, , , , carol] = await ethers.getSigners();
    await expect(ethers.deployContract("AacConetBaseSettlerV2", [carol.address, carol.address, carol.address, ethers.ZeroAddress]))
      .to.be.revert(ethers);
  });
});

describe("C1 + C2/C3: CoNET settler v2 -> gate -> AacChainEffectV2 -> GB", () => {
  async function coNetPath() {
    const [owner, verifier, alice, bob] = await ethers.getSigners();
    const authority = await ethers.deployContract("AacHeaderAuthority", [owner.address]);
    await authority.setVerifier(verifier.address);
    const baseCover = await ethers.deployContract("MockBaseCover");
    const conetInclusion = await ethers.deployContract("MockConetInclusion");
    const gate = await ethers.deployContract("AacAuthenticatedHeaderGate", [
      await authority.getAddress(), await baseCover.getAddress(), await conetInclusion.getAddress(),
    ]);
    const gb = await deployAt(GB_ADDR, "MockGB");
    const treasury = await ethers.deployContract("MockTreasury");
    const effect = await ethers.deployContract("AacChainEffectV2", [await treasury.getAddress(), GB_ADDR, owner.address]);
    const reader = await ethers.deployContract("MockEffectReader");
    const probe = await ethers.deployContract("MockProbe");
    const settler = await ethers.deployContract("AacConetBaseSettlerV2", [
      await gate.getAddress(), await reader.getAddress(), await probe.getAddress(), await effect.getAddress(),
    ]);
    await effect.setSettler(await settler.getAddress());
    await effect.setRoute(await gb.getAddress(), 1, true, 100n);
    return { owner, verifier, alice, bob, authority, baseCover, gate, gb, treasury, effect, settler };
  }
  const coNetReceipt = (to: string, gross: bigint) =>
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint8", "uint256"],
      [to, gross, GB_ADDR, 1, CONET_CHAIN],
    );

  it("refuses an unauthenticated Base header before the effect is reached", async () => {
    const { settler, baseCover, gb, effect, alice, bob } = await fixture(coNetPath);
    await baseCover.set(opId(10), 10n, true, true);
    await expect(
      settler.connect(alice).settle(aggregate(), header(), branch(), "0x1234", coNetReceipt(bob.address, 10n), [], 0n, 0n, [], bob.address)
    ).to.be.revertedWithCustomError(await ethers.getContractAt("AacAuthenticatedHeaderGate", await settler.cover()), "HeaderNotAuthenticated");
    expect(await gb.mintCalls()).to.equal(0n);
    expect(await effect.consumed(opId(10))).to.equal(false);
  });

  it("settles an authenticated Base header end to end, once", async () => {
    const { verifier, authority, baseCover, gb, effect, settler, alice, bob } = await fixture(coNetPath);
    await authority.connect(verifier).authenticate(BASE_CHAIN, hashOf("0x1234"));
    await baseCover.set(opId(11), 10n, true, true);
    const args = [aggregate(), header(), branch(), "0x1234", coNetReceipt(bob.address, 10n), [], 0n, 0n, [], bob.address] as const;
    await settler.connect(alice).settle(...args);
    expect(await gb.minted(bob.address)).to.equal(10n);
    expect(await effect.consumed(opId(11))).to.equal(true);
    await expect(settler.connect(alice).settle(...args)).to.be.revertedWithCustomError(effect, "AlreadyConsumed");
  });
});
