import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
// Same snapshot pattern as fix.test.ts: the hardcoded addresses keep their storage
// between tests, because hardhat_setCode copies code only.
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
const BRIDGE_TOPIC = "0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba";
// Period 1883 at 8192 slots per period, so the store mock reports the same period as the deployment.
const FINALIZED_SLOT = 15427680;
const OP_REAL = ethers.zeroPadValue("0x0a", 32);
const OP_FAKE = ethers.zeroPadValue("0x0f", 32);
const enc = ethers.AbiCoder.defaultAbiCoder();

async function deployAt(address: string, name: string) {
  const c = await ethers.deployContract(name);
  await ethers.provider.send("hardhat_setCode", [address, await ethers.provider.getCode(await c.getAddress())]);
  return ethers.getContractAt(name, address);
}

// SSZ-style little-endian u64 in a 32-byte chunk, as _u64 in the cover contract.
const u64le = (v: number) => {
  const b = new Uint8Array(32);
  let x = BigInt(v);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return ethers.hexlify(b);
};

// Mirrors _header in the cover contract: the beacon block root of a finalized header.
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

// One Bridge log in a type-2 receipt. The log is emitted by TREASURY with topics [BRIDGE_TOPIC, operationId].
const receiptRlp = (operationId: string, gross: bigint) => {
  const data = enc.encode(
    ["uint8", "uint8", "address", "address", "address", "address", "address[]", "uint256[]", "uint256"],
    [0, 0, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, [], [gross], gross],
  );
  const log = [TREASURY_ADDR, [BRIDGE_TOPIC, operationId], data];
  return ethers.concat(["0x02", ethers.encodeRlp(["0x01", "0x5208", "0x" + "00".repeat(256), [log]])]);
};

// Single-leaf receipt trie for receiptIndex 0. The key rlp(0) = 0x80 gives the leaf path nibbles 8,0.
const singleLeafTrie = (receipt: string) => {
  const leaf = ethers.encodeRlp(["0x2080", receipt]);
  return { root: ethers.keccak256(leaf), proof: [leaf] };
};

// Base header with only fields 3 (stateRoot), 5 (receiptsRoot) and 19 (parentBeaconBlockRoot) meaningful.
const baseHeader = (receiptsRoot: string, parentBeaconBlockRoot: string) => {
  const fields = Array(20).fill(ZERO);
  fields[3] = ZERO;
  fields[5] = receiptsRoot;
  fields[19] = parentBeaconBlockRoot;
  return ethers.encodeRlp(fields);
};

// The real header, and an attacker header that reuses the real beacon root but a fabricated receipts root.
function scenario() {
  const fin = finalized();
  const beaconRoot = headerRoot(fin);
  const realReceipt = receiptRlp(OP_REAL, 10000n);
  const realTrie = singleLeafTrie(realReceipt);
  const realHeader = baseHeader(realTrie.root, beaconRoot);
  const fakeReceipt = receiptRlp(OP_FAKE, 10000000n);
  const fakeTrie = singleLeafTrie(fakeReceipt);
  const fakeHeader = baseHeader(fakeTrie.root, beaconRoot);
  return { fin, realReceipt, realTrie, realHeader, fakeReceipt, fakeTrie, fakeHeader };
}

async function setup() {
  const verifier = await ethers.deployContract("AacReceiptMptVerifier");
  await ethers.provider.send("hardhat_setCode", [
    RECEIPT_VERIFIER_ADDR,
    await ethers.provider.getCode(await verifier.getAddress()),
  ]);
  const store = await deployAt(STORE_ADDR, "MockCheckpointStore");
  const outputProof = await deployAt(OUTPUT_ROOT_PROOF_ADDR, "MockOutputRootProof");
  const original = await ethers.deployContract("AacCheckpointMessageCover");
  const v2 = await ethers.deployContract("AacCheckpointMessageCoverV2");
  return { original, v2, store, outputProof };
}

// The L1 anchor inputs are not checked by the mock; only the Base block hash it reports matters here.
const anchor = () => ({ ethereumHeaderRlp: "0x", gameAccountProof: [], gameCode: "0x", messagePasserProof: [] });

describe("cover binding: the original cover accepts a Base header it never authenticated", () => {
  it("accepts a header with a fabricated receipts root and an attacker-chosen operationId", () =>
    fixture(async () => {
      const { original } = await setup();
      const s = scenario();
      const [operationId, amount, covered, headerFinal] = await original.cover.staticCall(
        aggregate(),
        s.fin,
        branch(),
        s.fakeHeader,
        s.fakeReceipt,
        s.fakeTrie.proof,
        0n,
        0n,
        [s.fin],
      );
      // The header was never anchored on Base, yet the cover reports the message as covered and final.
      expect(covered).to.equal(true);
      expect(headerFinal).to.equal(true);
      expect(operationId).to.equal(OP_FAKE);
      expect(amount).to.equal(10000000n);
    }));

  it("accepts the real header too, so it cannot tell the two apart", () =>
    fixture(async () => {
      const { original } = await setup();
      const s = scenario();
      const [, , covered] = await original.cover.staticCall(
        aggregate(),
        s.fin,
        branch(),
        s.realHeader,
        s.realReceipt,
        s.realTrie.proof,
        0n,
        0n,
        [s.fin],
      );
      expect(covered).to.equal(true);
    }));
});

describe("AacCheckpointMessageCoverV2: the Base header must be the block the L1 anchor commits to", () => {
  it("accepts the real header that the anchor commits to, and reads its receipts root", () =>
    fixture(async () => {
      const { v2, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.realHeader), false);
      const [operationId, amount, covered, headerFinal] = await v2.cover.staticCall(
        anchor(),
        aggregate(),
        s.fin,
        branch(),
        s.realHeader,
        s.realReceipt,
        s.realTrie.proof,
        0n,
        0n,
        [s.fin],
      );
      expect(covered).to.equal(true);
      expect(headerFinal).to.equal(true);
      expect(operationId).to.equal(OP_REAL);
      expect(amount).to.equal(10000n);
    }));

  it("rejects the attacker header, which the anchor does not commit to", () =>
    fixture(async () => {
      const { v2, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.realHeader), false);
      await expect(
        v2.cover.staticCall(anchor(), aggregate(), s.fin, branch(), s.fakeHeader, s.fakeReceipt, s.fakeTrie.proof, 0n, 0n, [s.fin]),
      ).to.be.revertedWithCustomError(v2, "HeaderNotAnchored");
    }));

  it("trusts the L1 anchor: a header whose hash the anchor commits to is accepted, whatever it contains", () =>
    fixture(async () => {
      const { v2, outputProof } = await setup();
      const s = scenario();
      // The binding is only as strong as the anchor. If the output-root proof itself were forged,
      // this path would open again, so the anchor must stay the audited trust root.
      await outputProof.set(ethers.keccak256(s.fakeHeader), false);
      const [operationId, , covered] = await v2.cover.staticCall(
        anchor(),
        aggregate(),
        s.fin,
        branch(),
        s.fakeHeader,
        s.fakeReceipt,
        s.fakeTrie.proof,
        0n,
        0n,
        [s.fin],
      );
      // This is the one case where the anchor itself must be trusted; the test documents that trust boundary.
      expect(covered).to.equal(true);
      expect(operationId).to.equal(OP_FAKE);
    }));

  it("rejects an anchor that claims beacon finality, which only the store may claim", () =>
    fixture(async () => {
      const { v2, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.realHeader), true);
      await expect(
        v2.cover.staticCall(anchor(), aggregate(), s.fin, branch(), s.realHeader, s.realReceipt, s.realTrie.proof, 0n, 0n, [s.fin]),
      ).to.be.revertedWithCustomError(v2, "UnexpectedFinality");
    }));

  it("rejects a header whose finalized beacon proof fails", () =>
    fixture(async () => {
      const { v2, outputProof, store } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.realHeader), false);
      await store.setUnproven(true);
      await expect(
        v2.cover.staticCall(anchor(), aggregate(), s.fin, branch(), s.realHeader, s.realReceipt, s.realTrie.proof, 0n, 0n, [s.fin]),
      ).to.be.revertedWithCustomError(v2, "InvalidProof");
    }));
});
