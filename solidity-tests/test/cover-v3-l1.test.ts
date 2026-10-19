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
const STORE_ADDR = "0xcEE3D699df3df07a573f1aFf642888B97B7aA961";
const RECEIPT_VERIFIER_ADDR = "0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10";
const TREASURY_ADDR = "0xa208982212978550594A7FEEB70a61665d129003";
const OUTPUT_ROOT_PROOF_ADDR = "0x57A498086d00A7Da80c8304F6189712b583c34C4";
const BRIDGE_TOPIC = "0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba";
const FINALIZED_SLOT = 15427680;
const OP = ethers.zeroPadValue("0x0a", 32);
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

// Merkle tree over `leaves`, padded with zero chunks to a power of two. Returns the root and the levels.
function merkle(leaves: string[]) {
  let size = 1;
  while (size < leaves.length) size <<= 1;
  const levels: string[][] = [[...leaves, ...Array(size - leaves.length).fill(ZERO)]];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(ethers.sha256(ethers.concat([prev[i], prev[i + 1]])));
    levels.push(next);
  }
  return { root: levels[levels.length - 1][0], levels };
}

// Siblings from the leaf up to the root, the order AacSszBranch expects.
function branchOf(levels: string[][], index: number) {
  const out: string[] = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    out.push(levels[l][idx ^ 1]);
    idx >>= 1;
  }
  return out;
}

const rnd = (tag: string) => ethers.sha256(ethers.toUtf8Bytes(tag));

// A synthetic Deneb beacon block whose execution payload holds `l1HeaderHash` at block_hash (field 12).
// The tree has the real shape: payload (17 fields -> 32 leaves), body (12 fields -> 16 leaves),
// block header (5 fields -> 8 leaves). The branch is 5 + 4 + 3 = 12 nodes, gindex 6444.
function syntheticBeacon(l1HeaderHash: string) {
  const payloadLeaves = Array.from({ length: 17 }, (_, i) => rnd(`payload-${i}`));
  payloadLeaves[12] = l1HeaderHash;
  const payload = merkle(payloadLeaves);
  const payloadBranch = branchOf(payload.levels, 12);

  const bodyLeaves = Array.from({ length: 12 }, (_, i) => rnd(`body-${i}`));
  bodyLeaves[9] = payload.root;
  const body = merkle(bodyLeaves);
  const bodyBranch = branchOf(body.levels, 9);

  const fin = {
    slot: FINALIZED_SLOT,
    proposer: 7,
    parentRoot: rnd("parent"),
    stateRoot: rnd("state"),
    bodyRoot: body.root,
  };
  const blockLeaves = [u64le(fin.slot), u64le(fin.proposer), fin.parentRoot, fin.stateRoot, fin.bodyRoot];
  const block = merkle(blockLeaves);
  const blockBranch = branchOf(block.levels, 4);

  return { finalized: fin, root: block.root, branch: [...payloadBranch, ...bodyBranch, ...blockBranch] };
}

const aggregate = () => ({
  signerUncompressed: "0x",
  bits: "0x",
  attested: { slot: 0, proposer: 0, parentRoot: ZERO, stateRoot: ZERO, bodyRoot: ZERO },
  signatureSlot: 0,
  signaturePoint: "0x",
});
const branch7 = () => Array(7).fill(ZERO);

// One TREASURY bridge log in a type-2 receipt.
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
// Base header with the receipts root at field 5 and the L1 origin beacon root at field 19.
const baseHeader = (receiptsRoot: string, parentBeaconRoot: string) => {
  const fields = Array(20).fill(ZERO);
  fields[5] = receiptsRoot;
  fields[19] = parentBeaconRoot;
  return ethers.encodeRlp(fields);
};

async function setup() {
  const verifier = await ethers.deployContract("AacReceiptMptVerifier");
  await ethers.provider.send("hardhat_setCode", [RECEIPT_VERIFIER_ADDR, await ethers.provider.getCode(await verifier.getAddress())]);
  const store = await deployAt(STORE_ADDR, "MockCheckpointStore");
  const outputProof = await deployAt(OUTPUT_ROOT_PROOF_ADDR, "MockOutputRootProof");
  const v3 = await ethers.deployContract("AacCheckpointMessageCoverV3");
  return { v3, store, outputProof };
}

// An honest Base block and receipt, plus an L1 header whose hash sits in the finalized beacon block.
function scenario() {
  const l1Header = ethers.encodeRlp(["0x01", "0x02", "0x03"]); // a stand-in L1 header RLP, any bytes
  const beacon = syntheticBeacon(ethers.keccak256(l1Header));
  const receipt = receiptRlp(OP, 10000n);
  const trie = singleLeafTrie(receipt);
  const base = baseHeader(trie.root, beacon.root);
  return { l1Header, beacon, receipt, trie, base };
}

const anchorFor = (s: ReturnType<typeof scenario>, overrides: { l1Header?: string; l1Branch?: string[] } = {}) => ({
  ethereumHeaderRlp: overrides.l1Header ?? s.l1Header,
  gameAccountProof: [],
  gameCode: "0x",
  messagePasserProof: [],
  l1PayloadBranch: overrides.l1Branch ?? s.beacon.branch,
});

describe("AacCheckpointMessageCoverV3: the L1 header must be the finalized beacon payload", () => {
  it("covers an honest Base message when the L1 header is the finalized payload", () =>
    fixture(async () => {
      const { v3, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const [operationId, amount, covered, headerFinal] = await v3.cover.staticCall(
        anchorFor(s),
        aggregate(),
        s.beacon.finalized,
        branch7(),
        s.base,
        s.receipt,
        s.trie.proof,
        0n,
        0n,
        [s.beacon.finalized],
      );
      expect(covered).to.equal(true);
      expect(headerFinal).to.equal(true);
      expect(operationId).to.equal(OP);
      expect(amount).to.equal(10000n);
    }));

  it("rejects an L1 header that is not the finalized payload", () =>
    fixture(async () => {
      const { v3, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const forgedL1 = ethers.encodeRlp(["0x09", "0x09", "0x09"]);
      await expect(
        v3.cover.staticCall(anchorFor(s, { l1Header: forgedL1 }), aggregate(), s.beacon.finalized, branch7(), s.base, s.receipt, s.trie.proof, 0n, 0n, [s.beacon.finalized]),
      ).to.be.revertedWithCustomError(v3, "L1HeaderNotFinal");
    }));

  it("rejects a tampered L1 payload branch", () =>
    fixture(async () => {
      const { v3, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const branch = [...s.beacon.branch];
      branch[4] = rnd("tampered-node");
      await expect(
        v3.cover.staticCall(anchorFor(s, { l1Branch: branch }), aggregate(), s.beacon.finalized, branch7(), s.base, s.receipt, s.trie.proof, 0n, 0n, [s.beacon.finalized]),
      ).to.be.revertedWithCustomError(v3, "L1HeaderNotFinal");
    }));

  it("rejects a branch of the wrong length", () =>
    fixture(async () => {
      const { v3, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      await expect(
        v3.cover.staticCall(anchorFor(s, { l1Branch: s.beacon.branch.slice(1) }), aggregate(), s.beacon.finalized, branch7(), s.base, s.receipt, s.trie.proof, 0n, 0n, [s.beacon.finalized]),
      ).to.be.revertedWithCustomError(v3, "InvalidProof");
    }));

  it("still rejects a Base header that the output-root anchor does not commit to", () =>
    fixture(async () => {
      const { v3, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(rnd("another base header")), false);
      await expect(
        v3.cover.staticCall(anchorFor(s), aggregate(), s.beacon.finalized, branch7(), s.base, s.receipt, s.trie.proof, 0n, 0n, [s.beacon.finalized]),
      ).to.be.revertedWithCustomError(v3, "HeaderNotAnchored");
    }));
});
