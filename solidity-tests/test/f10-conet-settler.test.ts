import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
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
const ZERO_ADDR = "0x" + "00".repeat(20);
const RECEIPT_VERIFIER_ADDR = "0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10";
const TREASURY_ADDR = "0xa208982212978550594A7FEEB70a61665d129003";
const GB_ADDR = "0xC3EF02DaE632b4C10abB66e07d92a387c10838D8";
const CONSUME_ADDR = "0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F";
const BRIDGE_TOPIC = "0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba";
const OP = ethers.zeroPadValue("0x0c", 32);
const AMOUNT = 10000n;
const enc = ethers.AbiCoder.defaultAbiCoder();

async function deployAt(address: string, name: string) {
  const c = await ethers.deployContract(name);
  await ethers.provider.send("hardhat_setCode", [address, await ethers.provider.getCode(await c.getAddress())]);
  return ethers.getContractAt(name, address);
}

// One TREASURY bridge log in a type-2 receipt, as the shared library reads it.
const receiptRlp = (operationId: string, gross: bigint) => {
  const data = enc.encode(
    ["uint8", "uint8", "address", "address", "address", "address", "address[]", "uint256[]", "uint256"],
    [0, 0, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, [], [gross], gross],
  );
  const log = [TREASURY_ADDR, [BRIDGE_TOPIC, operationId], data];
  return ethers.concat(["0x02", ethers.encodeRlp(["0x01", "0x5208", "0x" + "00".repeat(256), [log]])]);
};
// Single-leaf receipt trie for receiptIndex 0.
const singleLeafTrie = (receipt: string) => {
  const leaf = ethers.encodeRlp(["0x2080", receipt]);
  return { root: ethers.keccak256(leaf), proof: [leaf] };
};
const aggregate = () => ({
  signerUncompressed: "0x",
  bits: "0x",
  attested: { slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO },
  signatureSlot: 0,
  signaturePoint: "0x",
});
const header = () => ({ slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO });

async function setup() {
  const verifier = await ethers.deployContract("AacReceiptMptVerifier");
  await ethers.provider.send("hardhat_setCode", [RECEIPT_VERIFIER_ADDR, await ethers.provider.getCode(await verifier.getAddress())]);
  const gb = await deployAt(GB_ADDR, "MockGB");
  const consume = await deployAt(CONSUME_ADDR, "MockConsume");
  const payee = await ethers.deployContract("MockPayeeF9");
  const baseCover = await ethers.deployContract("MockBaseCover");
  const auth = await ethers.deployContract("MockConetAuthenticator");
  const f10 = await ethers.deployContract("AacProductionCustodyGateSettlerF10", [
    await payee.getAddress(),
    await baseCover.getAddress(),
    await auth.getAddress(),
  ]);
  return { gb, consume, payee, auth, f10, verifier: await ethers.getContractAt("AacReceiptMptVerifier", RECEIPT_VERIFIER_ADDR) };
}

describe("F10 settler: CoNET-origin mint goes through the in-call CoNET header authenticator", () => {
  it("mints once for a receipt under the authenticated receipts root", () =>
    fixture(async () => {
      const { gb, payee, auth, f10 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await f10.connect(alice).settleFromConet(
        aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
        [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
      );
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses when the header authenticator rejects the CoNET header", () =>
    fixture(async () => {
      const { gb, payee, auth, f10 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, true);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f10.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(auth, "InvalidProof");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("refuses a receipt that is not under the authenticated receipts root", () =>
    fixture(async () => {
      const { gb, payee, auth, f10, verifier } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes("other root")), false);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f10.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(verifier, "InvalidProof");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("refuses to mint while the GB bridge is paused (C3)", () =>
    fixture(async () => {
      const { gb, payee, auth, f10 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await gb.setPaused(true);
      await expect(
        f10.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f10, "BridgePaused");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("consumes each CoNET operationId once", () =>
    fixture(async () => {
      const { gb, payee, auth, f10 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      const args = [
        aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
        [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
      ] as const;
      await f10.connect(alice).settleFromConet(...args);
      const consumeMock = await ethers.getContractAt("MockConsume", CONSUME_ADDR);
      await expect(f10.connect(alice).settleFromConet(...args)).to.be.revertedWithCustomError(consumeMock, "AlreadyConsumed");
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses a beneficiary that the receipt does not name", () =>
    fixture(async () => {
      const { gb, payee, auth, f10 } = await setup();
      const [alice, bob, carol, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f10.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, carol.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f10, "BadMintTo");
      expect(await gb.minted(carol.address)).to.equal(0n);
    }));
});
