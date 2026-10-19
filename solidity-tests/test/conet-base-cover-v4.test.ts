import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
// Same snapshot pattern as the other cover tests. V4 takes its dependencies as constructor
// arguments, so each test deploys its own mocks. The snapshot keeps the test files independent.
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
const TREASURY_ADDR = "0xa208982212978550594A7FEEB70a61665d129003";
const OTHER_EMITTER = "0x" + "bb".repeat(20);
const BRIDGE_TOPIC = "0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba";
// Slot in period 1883 (8192 slots per period), the period MockCheckpointStore reports.
const FINALIZED_SLOT = 15427680;
const OP = ethers.zeroPadValue("0x0a", 32);
const OP_FAKE = ethers.zeroPadValue("0x0f", 32);
const enc = ethers.AbiCoder.defaultAbiCoder();

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

// One bridge log in a type-2 receipt, emitted by `emitter` with topics [BRIDGE_TOPIC, operationId].
const receiptRlp = (operationId: string, gross: bigint, emitter = TREASURY_ADDR) => {
  const data = enc.encode(
    ["uint8", "uint8", "address", "address", "address", "address", "address[]", "uint256[]", "uint256"],
    [0, 0, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, [], [gross], gross],
  );
  const log = [emitter, [BRIDGE_TOPIC, operationId], data];
  return ethers.concat(["0x02", ethers.encodeRlp(["0x01", "0x5208", "0x" + "00".repeat(256), [log]])]);
};

// Single-leaf receipt trie for receiptIndex 0. The key rlp(0) = 0x80 gives the leaf path nibbles 8, 0.
const singleLeafTrie = (receipt: string) => {
  const leaf = ethers.encodeRlp(["0x2080", receipt]);
  return { root: ethers.keccak256(leaf), proof: [leaf] };
};

// Base header with the state root at field 3, the receipts root at field 5 and the parent beacon root at field 19.
const baseHeader = (receiptsRoot: string, parentBeaconRoot: string, stateRoot = ZERO) => {
  const fields = Array(20).fill(ZERO);
  fields[3] = stateRoot;
  fields[5] = receiptsRoot;
  fields[19] = parentBeaconRoot;
  return ethers.encodeRlp(fields);
};

// An honest Base block and receipt, plus an L1 header whose hash sits in the finalized beacon block.
function scenario(emitter = TREASURY_ADDR) {
  const l1Header = ethers.encodeRlp(["0x01", "0x02", "0x03"]); // a stand-in L1 header RLP, any bytes
  const beacon = syntheticBeacon(ethers.keccak256(l1Header));
  const receipt = receiptRlp(OP, 10000n, emitter);
  const trie = singleLeafTrie(receipt);
  const base = baseHeader(trie.root, beacon.root);
  return { l1Header, beacon, receipt, trie, base };
}
type Scenario = ReturnType<typeof scenario>;

// What an attacker can offer: a receipt that verifies under its own root, and Base headers the anchor does not commit to.
function attacks(s: Scenario) {
  const fakeReceipt = receiptRlp(OP_FAKE, 10000000n);
  const fakeTrie = singleLeafTrie(fakeReceipt);
  return {
    fakeReceipt,
    fakeProof: fakeTrie.proof,
    // A fabricated receipts root under the real beacon root.
    fabricatedHeader: baseHeader(fakeTrie.root, s.beacon.root),
    // The real receipts root and receipt, with only the state root changed.
    retouchedHeader: baseHeader(s.trie.root, s.beacon.root, rnd("forged state root")),
  };
}

// The L1 anchor. The output-root mock does not read these proofs, so only the L1 header and branch matter here.
const anchorFor = (s: Scenario, overrides: { l1Header?: string; l1Branch?: string[] } = {}) => ({
  ethereumHeaderRlp: overrides.l1Header ?? s.l1Header,
  gameAccountProof: [] as string[],
  gameCode: "0x",
  messagePasserProof: [] as string[],
  l1PayloadBranch: overrides.l1Branch ?? s.beacon.branch,
});

// The cover's arguments. Each override replaces one input under test; everything else is honest.
const coverArgs = (
  s: Scenario,
  o: {
    anchor?: ReturnType<typeof anchorFor>;
    header?: string;
    receipt?: string;
    proof?: string[];
    logIndex?: bigint;
    beaconHeaders?: unknown[];
  } = {},
): unknown[] => [
  o.anchor ?? anchorFor(s),
  aggregate(),
  s.beacon.finalized,
  branch7(),
  o.header ?? s.base,
  o.receipt ?? s.receipt,
  o.proof ?? s.trie.proof,
  0n,
  o.logIndex ?? 0n,
  o.beaconHeaders ?? [s.beacon.finalized],
];

// Fresh mocks for each test. The store and output-root proof are the doubles in CoverMocks.sol.
async function setup() {
  const store = await ethers.deployContract("MockCheckpointStore");
  const outputProof = await ethers.deployContract("MockOutputRootProof");
  const verifier = await ethers.deployContract("AacReceiptMptVerifier");
  const v4 = await ethers.deployContract("AacConetBaseMessageCoverV4", [
    await store.getAddress(),
    await outputProof.getAddress(),
    await verifier.getAddress(),
  ]);
  return { v4, store, outputProof, verifier };
}

describe("AacConetBaseMessageCoverV4: the Base header must be the block the L1 anchor commits to", () => {
  it("accepts the header the anchor commits to, and returns its operationId and gross amount", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const [operationId, amount, covered, headerFinal] = await v4.cover.staticCall(...coverArgs(s));
      expect(covered).to.equal(true);
      expect(headerFinal).to.equal(true);
      expect(operationId).to.equal(OP);
      expect(amount).to.equal(10000n);
    }));

  it("emits MessageCovered with the operation, the amount and the beacon slots", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      await expect(v4.cover(...coverArgs(s)))
        .to.emit(v4, "MessageCovered")
        .withArgs(OP, 10000n, FINALIZED_SLOT, FINALIZED_SLOT, 511n);
    }));

  it("rejects a Base header the anchor does not commit to", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      const a = attacks(s);
      await outputProof.set(ethers.keccak256(s.base), false);
      // The receipt and the receipts root are the real ones, so only the header hash can fail.
      await expect(
        v4.cover.staticCall(...coverArgs(s, { header: a.retouchedHeader })),
      ).to.be.revertedWithCustomError(v4, "HeaderNotAnchored");
    }));

  it("rejects a fabricated receipts root, even with a receipt that verifies under that root", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      const a = attacks(s);
      await outputProof.set(ethers.keccak256(s.base), false);
      await expect(
        v4.cover.staticCall(...coverArgs(s, { header: a.fabricatedHeader, receipt: a.fakeReceipt, proof: a.fakeProof })),
      ).to.be.revertedWithCustomError(v4, "HeaderNotAnchored");
    }));

  it("trusts the output-root anchor: a header the anchor commits to is accepted whatever it contains", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      const a = attacks(s);
      // The binding is only as strong as the anchor. A forged output-root proof would reopen G-14,
      // so the anchor stays the audited trust root. This test records that boundary.
      await outputProof.set(ethers.keccak256(a.fabricatedHeader), false);
      const [operationId, , covered] = await v4.cover.staticCall(
        ...coverArgs(s, { header: a.fabricatedHeader, receipt: a.fakeReceipt, proof: a.fakeProof }),
      );
      expect(covered).to.equal(true);
      expect(operationId).to.equal(OP_FAKE);
    }));

  it("rejects an anchor that claims beacon finality, which only the store may claim", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), true);
      await expect(v4.cover.staticCall(...coverArgs(s))).to.be.revertedWithCustomError(v4, "UnexpectedFinality");
    }));
});

describe("AacConetBaseMessageCoverV4: the L1 header must be the finalized beacon payload", () => {
  it("rejects an L1 header that is outside the finalized payload", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const forgedL1 = ethers.encodeRlp(["0x09", "0x09", "0x09"]);
      await expect(
        v4.cover.staticCall(...coverArgs(s, { anchor: anchorFor(s, { l1Header: forgedL1 }) })),
      ).to.be.revertedWithCustomError(v4, "L1HeaderNotFinal");
    }));

  it("rejects a tampered L1 payload branch", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const l1Branch = [...s.beacon.branch];
      l1Branch[4] = rnd("tampered-node");
      await expect(
        v4.cover.staticCall(...coverArgs(s, { anchor: anchorFor(s, { l1Branch }) })),
      ).to.be.revertedWithCustomError(v4, "L1HeaderNotFinal");
    }));

  it("rejects an L1 payload branch of the wrong length", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      const tooShort = s.beacon.branch.slice(1);
      const tooLong = [...s.beacon.branch, ZERO];
      for (const l1Branch of [tooShort, tooLong]) {
        await expect(
          v4.cover.staticCall(...coverArgs(s, { anchor: anchorFor(s, { l1Branch }) })),
        ).to.be.revertedWithCustomError(v4, "InvalidProof");
      }
    }));
});

describe("AacConetBaseMessageCoverV4: receipt, bridge log and store checks", () => {
  it("rejects a tampered receipt proof node", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      // Flip the last byte of the only proof node, so the node no longer hashes to the receipts root.
      const node = s.trie.proof[0];
      const flipped = node.slice(0, -2) + (node.endsWith("00") ? "01" : "00");
      await expect(
        v4.cover.staticCall(...coverArgs(s, { proof: [flipped] })),
      ).to.be.revertedWithCustomError(v4, "InvalidProof");
    }));

  it("rejects a bridge log emitted by an address other than the treasury", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario(OTHER_EMITTER);
      // The header is anchored and the receipt verifies under its root; only the emitter is wrong.
      await outputProof.set(ethers.keccak256(s.base), false);
      await expect(v4.cover.staticCall(...coverArgs(s))).to.be.revertedWithCustomError(v4, "InvalidProof");
    }));

  it("rejects a finalized beacon proof that the store does not prove", () =>
    fixture(async () => {
      const { v4, outputProof, store } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      await store.setUnproven(true);
      await expect(v4.cover.staticCall(...coverArgs(s))).to.be.revertedWithCustomError(v4, "InvalidProof");
    }));

  it("rejects an empty beacon header chain", () =>
    fixture(async () => {
      const { v4, outputProof } = await setup();
      const s = scenario();
      await outputProof.set(ethers.keccak256(s.base), false);
      await expect(
        v4.cover.staticCall(...coverArgs(s, { beaconHeaders: [] })),
      ).to.be.revertedWithCustomError(v4, "InvalidProof");
    }));
});

describe("AacConetBaseMessageCoverV4: deployment", () => {
  it("rejects a zero address for the store, the output-root proof or the receipt verifier", () =>
    fixture(async () => {
      const { store, outputProof, verifier } = await setup();
      const factory = await ethers.getContractFactory("AacConetBaseMessageCoverV4");
      const store_ = await store.getAddress();
      const proof_ = await outputProof.getAddress();
      const verifier_ = await verifier.getAddress();
      for (const args of [
        [ZERO_ADDR, proof_, verifier_],
        [store_, ZERO_ADDR, verifier_],
        [store_, proof_, ZERO_ADDR],
      ]) {
        await expect(factory.deploy(...args)).to.be.revertedWithCustomError(factory, "ZeroAddress");
      }
    }));

  it("exposes no owner, admin or upgrade function", () =>
    fixture(async () => {
      const { v4 } = await setup();
      const names: string[] = [];
      v4.interface.forEachFunction((f) => names.push(f.name));
      expect(names).to.include("cover");
      for (const banned of ["owner", "transferOwnership", "upgradeTo", "upgradeToAndCall", "setSettler"]) {
        expect(names).to.not.include(banned);
      }
    }));
});
