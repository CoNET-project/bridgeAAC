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
const COVER_ADDR = "0x01506527a4Dab14141038Db15f5341dcF4729233";
const CONET_INCL_ADDR = "0x7064860E3594aE120f71700B2F46151c6D370559";
const opId = (n: number) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const aggregate = () => ({ signerUncompressed: "0x", bits: "0x", attested: { slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO }, signatureSlot: 0, signaturePoint: "0x" });
const header = () => ({ slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO });
const branch = () => Array(7).fill(ZERO);
const receiptFor = (b: string, g: bigint) => ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [b, g]);

async function deployAt(address: string, name: string) {
  const c = await ethers.deployContract(name);
  await ethers.provider.send("hardhat_setCode", [address, await ethers.provider.getCode(await c.getAddress())]);
  return ethers.getContractAt(name, address);
}

describe("baseline: the original contracts show the C2/C3 behavior", () => {
  it("v1 AacChainEffect completes the same operationId twice (C3 replay)", async () => {
    const [owner, settler, bob] = await ethers.getSigners();
    const gb = await ethers.deployContract("MockGB");
    const treasury = await ethers.deployContract("MockTreasury");
    const v1 = await ethers.deployContract("AacChainEffect", [await treasury.getAddress(), await gb.getAddress()]);
    await v1.setSettler(settler.address);
    await v1.connect(settler).complete(opId(1), await gb.getAddress(), bob.address, 10n, 1);
    await v1.connect(settler).complete(opId(1), await gb.getAddress(), bob.address, 10n, 1);
    expect(await gb.minted(bob.address)).to.equal(20n);
  });

  it("v1 AacChainEffect mints GB while the GB bridge is paused (C3 pause bypass)", async () => {
    const [, settler, bob] = await ethers.getSigners();
    const gb = await ethers.deployContract("MockGB");
    const treasury = await ethers.deployContract("MockTreasury");
    const v1 = await ethers.deployContract("AacChainEffect", [await treasury.getAddress(), await gb.getAddress()]);
    await v1.setSettler(settler.address);
    await gb.setPaused(true);
    await v1.connect(settler).complete(opId(2), await gb.getAddress(), bob.address, 10n, 1);
    expect(await gb.minted(bob.address)).to.equal(10n);
  });

  it("v1 AacChainEffect accepts any asset and mode into the treasury (C2)", async () => {
    const [, settler, bob] = await ethers.getSigners();
    const gb = await ethers.deployContract("MockGB");
    const treasury = await ethers.deployContract("MockTreasury");
    const v1 = await ethers.deployContract("AacChainEffect", [await treasury.getAddress(), await gb.getAddress()]);
    await v1.setSettler(settler.address);
    const anyToken = bob.address; // no route, no allowlist, no cap
    await v1.connect(settler).complete(opId(3), anyToken, bob.address, 999n, 2);
    expect(await treasury.calls()).to.equal(1n);
    expect(await treasury.lastAsset()).to.equal(anyToken);
    expect(await treasury.lastMode()).to.equal(2n);
  });

  it("F7 settler mints GB while the bridge is paused (C3 on the Base side)", async () => {
    const [, , , alice, bob] = await ethers.getSigners();
    const payee = await ethers.deployContract("MockPayee");
    const gb = await deployAt(GB_ADDR, "MockGB");
    await deployAt(CONSUME_ADDR, "MockConsume");
    const cover = await deployAt(COVER_ADDR, "MockBaseCover");
    await cover.set(opId(4), 10n, true, true);
    await deployAt(CONET_INCL_ADDR, "MockConetInclusion");
    const f7 = await ethers.deployContract("AacProductionCustodyGateSettlerF7", [await payee.getAddress()]);
    await gb.setPaused(true);
    await f7.connect(alice).settle(aggregate(), header(), branch(), "0x1234", receiptFor(bob.address, 10n), [], 0n, 0n, [], bob.address, bob.address);
    expect(await gb.minted(bob.address)).to.equal(10n);
  });
});
