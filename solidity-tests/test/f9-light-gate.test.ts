import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
// Same snapshot pattern as the other test files: hardcoded addresses keep storage between tests,
// because hardhat_setCode copies code only.
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
const STORE_ADDR = "0xcEE3D699df3df07a573f1aFf642888B97B7aA961";
const RECEIPT_VERIFIER_ADDR = "0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10";
const TREASURY_ADDR = "0xa208982212978550594A7FEEB70a61665d129003";
const OUTPUT_ROOT_PROOF_ADDR = "0x57A498086d00A7Da80c8304F6189712b583c34C4";
const GB_ADDR = "0xC3EF02DaE632b4C10abB66e07d92a387c10838D8";
const CONSUME_ADDR = "0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F";
const BRIDGE_TOPIC = "0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba";
const FINALIZED_SLOT = 15427680; // period 1883, as the store mock reports
const OP_REAL = ethers.zeroPadValue("0x0a", 32);
const AMOUNT = 10000n;
const enc = ethers.AbiCoder.defaultAbiCoder();

async function deployAt(address: string, name: string) {
  const c = await ethers.deployContract(name);
  await ethers.provider.send("hardhat_setCode", [address, await ethers.provider.getCode(await c.getAddress())]);
  return ethers.getContractAt(name, address);
}

const u64le = (v: number) => {
  const b = new Uint8Array(32);
  let x = BigInt(v);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return ethers.hexlify(b);
};

const headerRoot = (h: { slot: number; proposer: number; parentRoot: string; stateRoot: string; bodyRoot: string }) => {
  const h01 = ethers.sha256(ethers.concat([u64le(h.slot), u64le(h.proposer)]));
  const h23 = ethers.sha256(ethers.concat([h.parentRoot, h.stateRoot]));
  const h45 = ethers.sha256(ethers.concat([h.bodyRoot, ZERO]));
  const h67 = ethers.sha256(ethers.concat([ZERO, ZERO]));
  return ethers.sha256(
    ethers.concat([ethers.sha256(ethers.concat([h01, h23])), ethers.sha256(ethers.concat([h45, h67]))]),
  );
};

const finalized = () => ({
  slot: FINALIZED_SLOT,
  proposer: 7,
  parentRoot: "0x" + "11".repeat(32),
  stateRoot: "0x" + "22".repeat(32),
  bodyRoot: "0x" + "33".repeat(32),
});
const aggregate = () => ({
  signerUncompressed: "0x",
  bits: "0x",
  attested: finalized(),
  signatureSlot: FINALIZED_SLOT + 1,
  signaturePoint: "0x",
});
const branch = () => Array(7).fill(ZERO);
const anchor = () => ({ ethereumHeaderRlp: "0x", gameAccountProof: [], gameCode: "0x", messagePasserProof: [] });

const receiptRlp = (operationId: string, gross: bigint) => {
  const data = enc.encode(
    ["uint8", "uint8", "address", "address", "address", "address", "address[]", "uint256[]", "uint256"],
    [0, 0, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, [], [gross], gross],
  );
  const log = [TREASURY_ADDR, [BRIDGE_TOPIC, operationId], data];
  return ethers.concat(["0x02", ethers.encodeRlp(["0x01", "0x5208", "0x" + "00".repeat(256), [log]])]);
};

const singleLeafTrie = (receipt: string) => {
  const leaf = ethers.encodeRlp(["0x2080", receipt]);
  return { root: ethers.keccak256(leaf), proof: [leaf] };
};

const baseHeader = (receiptsRoot: string, parentBeaconBlockRoot: string) => {
  const fields = Array(20).fill(ZERO);
  fields[5] = receiptsRoot;
  fields[19] = parentBeaconBlockRoot;
  return ethers.encodeRlp(fields);
};

function scenario() {
  const fin = finalized();
  const beaconRoot = headerRoot(fin);
  const receipt = receiptRlp(OP_REAL, AMOUNT);
  const trie = singleLeafTrie(receipt);
  const header = baseHeader(trie.root, beaconRoot);
  const forgedReceipt = receiptRlp(ethers.zeroPadValue("0x0f", 32), 10000000n);
  const forgedTrie = singleLeafTrie(forgedReceipt);
  const forgedHeader = baseHeader(forgedTrie.root, beaconRoot);
  return { fin, receipt, trie, header, forgedReceipt, forgedTrie, forgedHeader };
}

async function setup() {
  const verifier = await ethers.deployContract("AacReceiptMptVerifier");
  await ethers.provider.send("hardhat_setCode", [
    RECEIPT_VERIFIER_ADDR,
    await ethers.provider.getCode(await verifier.getAddress()),
  ]);
  const store = await deployAt(STORE_ADDR, "MockCheckpointStore");
  const outputProof = await deployAt(OUTPUT_ROOT_PROOF_ADDR, "MockOutputRootProof");
  const gb = await deployAt(GB_ADDR, "MockGB");
  const consume = await deployAt(CONSUME_ADDR, "MockConsume");
  const payee = await ethers.deployContract("MockPayeeF9");
  const cover = await ethers.deployContract("AacCheckpointMessageCoverV2");
  const conetGate = await ethers.deployContract("MockConetInclusion");
  const f9 = await ethers.deployContract("AacProductionCustodyGateSettlerF9", [
    await payee.getAddress(),
    await cover.getAddress(),
    await conetGate.getAddress(),
  ]);
  return { store, outputProof, gb, consume, payee, cover, f9 };
}

describe("F9 settler: Base-origin mint goes through the light-client cover", () => {
  it("mints once for a header the L1 anchor commits to, with a finalized beacon proof", () =>
    fixture(async () => {
      const { outputProof, gb, payee, f9 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, AMOUNT);
      await f9.connect(alice).settle(
        anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
      );
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses an attacker header that the anchor does not commit to, and mints nothing", () =>
    fixture(async () => {
      const { outputProof, gb, payee, cover, f9 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, 10000000n);
      await expect(
        f9.connect(alice).settle(
          anchor(), aggregate(), s.fin, branch(), s.forgedHeader, s.forgedReceipt, s.forgedTrie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(cover, "HeaderNotAnchored");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("refuses to mint while the GB bridge is paused (C3)", () =>
    fixture(async () => {
      const { outputProof, gb, payee, f9 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, AMOUNT);
      await gb.setPaused(true);
      await expect(
        f9.connect(alice).settle(
          anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f9, "BridgePaused");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("consumes each operationId once", () =>
    fixture(async () => {
      const { outputProof, gb, payee, consume, f9 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, AMOUNT);
      await f9.connect(alice).settle(
        anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
      );
      const consumeMock = await ethers.getContractAt("MockConsume", CONSUME_ADDR);
      await expect(
        f9.connect(alice).settle(
          anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(consumeMock, "AlreadyConsumed");
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses a beneficiary that the receipt does not name", () =>
    fixture(async () => {
      const { outputProof, gb, payee, f9 } = await setup();
      const [alice, bob, carol, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f9.connect(alice).settle(
          anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], carol.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f9, "BadMintTo");
      expect(await gb.minted(carol.address)).to.equal(0n);
    }));

  it("refuses when the finalized beacon proof is rejected by the store", () =>
    fixture(async () => {
      const { outputProof, store, gb, payee, cover, f9 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.header), false);
      await payee.set(bob.address, AMOUNT);
      await store.setUnproven(true);
      await expect(
        f9.connect(alice).settle(
          anchor(), aggregate(), s.fin, branch(), s.header, s.receipt, s.trie.proof, 0n, 0n, [s.fin], bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(cover, "InvalidProof");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));
});
