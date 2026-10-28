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
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_LIKE_ADDR = "0x00000000000000000000000000000000000f1101";
const OP = ethers.zeroPadValue("0x0c", 32);
const AMOUNT = 10000n;
const DAY = 24 * 3600;
const enc = ethers.AbiCoder.defaultAbiCoder();

// F7c layout: canary record in slots 49-52, pending variables in slots 53-55.
const slotHex = (n: number) => ethers.toBeHex(n, 32);
const word = (addr: string) => ethers.zeroPadValue(addr, 32);

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
  const f11 = await ethers.deployContract("AacProductionCustodyGateSettlerF11", [
    await payee.getAddress(),
    await baseCover.getAddress(),
    await auth.getAddress(),
  ]);
  return { gb, consume, payee, auth, f11, verifier: await ethers.getContractAt("AacReceiptMptVerifier", RECEIPT_VERIFIER_ADDR) };
}

// The implementation's runtime code copied to PROXY_LIKE_ADDR. The implementation's immutables still name the
// implementation, so the NotProxy check sees a proxy whose ERC-1967 slot points at the implementation.
async function proxyLike(owner: string) {
  const payee = await ethers.deployContract("MockPayeeF9");
  const baseCover = await ethers.deployContract("MockBaseCover");
  const auth = await ethers.deployContract("MockConetAuthenticator");
  const impl = await ethers.deployContract("AacProductionCustodyGateSettlerF11", [
    await payee.getAddress(),
    await baseCover.getAddress(),
    await auth.getAddress(),
  ]);
  const implAddress = await impl.getAddress();
  await ethers.provider.send("hardhat_setCode", [PROXY_LIKE_ADDR, await ethers.provider.getCode(implAddress)]);
  await ethers.provider.send("hardhat_setStorageAt", [PROXY_LIKE_ADDR, slotHex(0), ethers.toBeHex((BigInt(owner) << 8n) | 1n, 32)]);
  await ethers.provider.send("hardhat_setStorageAt", [PROXY_LIKE_ADDR, IMPLEMENTATION_SLOT, word(implAddress)]);
  return {
    f11: await ethers.getContractAt("AacProductionCustodyGateSettlerF11", PROXY_LIKE_ADDR),
    payeeAddress: await payee.getAddress(),
  };
}

describe("F11 settler: CoNET-origin mint goes through the in-call CoNET header authenticator", () => {
  it("mints once for a receipt under the authenticated receipts root", () =>
    fixture(async () => {
      const { gb, payee, auth, f11 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await f11.connect(alice).settleFromConet(
        aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
        [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
      );
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses when the header authenticator rejects the CoNET header", () =>
    fixture(async () => {
      const { gb, payee, auth, f11 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, true);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f11.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(auth, "InvalidProof");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("refuses a receipt that is not under the authenticated receipts root", () =>
    fixture(async () => {
      const { gb, payee, auth, f11, verifier } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes("other root")), false);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f11.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(verifier, "InvalidProof");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("refuses to mint while the GB bridge is paused (C3)", () =>
    fixture(async () => {
      const { gb, payee, auth, f11 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await gb.setPaused(true);
      await expect(
        f11.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f11, "BridgePaused");
      expect(await gb.minted(bob.address)).to.equal(0n);
    }));

  it("consumes each CoNET operationId once", () =>
    fixture(async () => {
      const { gb, payee, auth, f11 } = await setup();
      const [alice, bob, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      const args = [
        aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
        [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, bob.address, effect.address,
      ] as const;
      await f11.connect(alice).settleFromConet(...args);
      const consumeMock = await ethers.getContractAt("MockConsume", CONSUME_ADDR);
      await expect(f11.connect(alice).settleFromConet(...args)).to.be.revertedWithCustomError(consumeMock, "AlreadyConsumed");
      expect(await gb.minted(bob.address)).to.equal(AMOUNT);
    }));

  it("refuses a beneficiary that the receipt does not name", () =>
    fixture(async () => {
      const { gb, payee, auth, f11 } = await setup();
      const [alice, bob, carol, effect] = await ethers.getSigners();
      const r = receiptRlp(OP, AMOUNT);
      const trie = singleLeafTrie(r);
      await auth.set(ethers.ZeroHash, trie.root, false);
      await payee.set(bob.address, AMOUNT);
      await expect(
        f11.connect(alice).settleFromConet(
          aggregate(), header(), [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], [header()],
          [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, ZERO], "0x1234", r, trie.proof, 0n, 0n, carol.address, effect.address,
        ),
      ).to.be.revertedWithCustomError(f11, "BadMintTo");
      expect(await gb.minted(carol.address)).to.equal(0n);
    }));
});

describe("F11 settler: storage layout is the F7c layout", () => {
  it("keeps the canary record in slots 49-52 and reads it from there", () =>
    fixture(async () => {
      const [owner, next] = await ethers.getSigners();
      const { f11 } = await proxyLike(owner.address);
      const at = PROXY_LIKE_ADDR;
      const aacId = ethers.id("canary");
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(49), slotHex(1)]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(50), aacId]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(51), word(next.address)]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(52), slotHex(10_000_000)]);
      const [readId, to, amount, done] = await f11.canaryRecord();
      expect(done).to.equal(true);
      expect(readId).to.equal(aacId);
      expect(to).to.equal(next.address);
      expect(amount).to.equal(10_000_000n);
    }));

  it("writes pending owner, pending implementation and ready time only to slots 53-55", () =>
    fixture(async () => {
      const [owner, next] = await ethers.getSigners();
      const { f11, payeeAddress } = await proxyLike(owner.address);
      const at = PROXY_LIKE_ADDR;
      const aacId = ethers.id("canary");
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(49), slotHex(1)]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(50), aacId]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(51), word(next.address)]);
      await ethers.provider.send("hardhat_setStorageAt", [at, slotHex(52), slotHex(10_000_000)]);

      await f11.connect(owner).transferOwnership(next.address);
      expect(await f11.pendingOwner()).to.equal(next.address);
      expect(await ethers.provider.getStorage(at, slotHex(55))).to.equal(word(next.address));

      await f11.connect(owner).scheduleUpgrade(payeeAddress);
      expect(await ethers.provider.getStorage(at, slotHex(53))).to.equal(word(payeeAddress));
      const readyAt = BigInt(await ethers.provider.getStorage(at, slotHex(54)));
      expect(readyAt).to.be.greaterThan(0n);

      // Slots 49-52 are untouched by the owner and upgrade writes.
      expect(await ethers.provider.getStorage(at, slotHex(49))).to.equal(slotHex(1));
      expect(await ethers.provider.getStorage(at, slotHex(50))).to.equal(aacId);
      expect(await ethers.provider.getStorage(at, slotHex(51))).to.equal(word(next.address));
      expect(await ethers.provider.getStorage(at, slotHex(52))).to.equal(slotHex(10_000_000));
    }));
});

describe("F11 settler: upgrade timelock and expiry", () => {
  it("refuses an upgrade before the 48h schedule", () =>
    fixture(async () => {
      const [owner] = await ethers.getSigners();
      const { f11, payeeAddress } = await proxyLike(owner.address);
      await f11.connect(owner).scheduleUpgrade(payeeAddress);
      await expect(f11.connect(owner).upgradeTo(payeeAddress)).to.be.revertedWithCustomError(f11, "UpgradeNotReady");
    }));

  it("upgrades inside the expiry window", () =>
    fixture(async () => {
      const [owner] = await ethers.getSigners();
      const { f11, payeeAddress } = await proxyLike(owner.address);
      await f11.connect(owner).scheduleUpgrade(payeeAddress);
      await ethers.provider.send("evm_increaseTime", [2 * DAY + 1]);
      await ethers.provider.send("evm_mine", []);
      await f11.connect(owner).upgradeTo(payeeAddress);
      expect(await ethers.provider.getStorage(PROXY_LIKE_ADDR, IMPLEMENTATION_SLOT)).to.equal(word(payeeAddress));
    }));

  it("refuses an upgrade after UPGRADE_EXPIRY has passed", () =>
    fixture(async () => {
      const [owner] = await ethers.getSigners();
      const { f11, payeeAddress } = await proxyLike(owner.address);
      expect(await f11.UPGRADE_EXPIRY()).to.equal(BigInt(7 * DAY));
      await f11.connect(owner).scheduleUpgrade(payeeAddress);
      await ethers.provider.send("evm_increaseTime", [2 * DAY + 7 * DAY + 1]);
      await ethers.provider.send("evm_mine", []);
      const implBefore = await ethers.provider.getStorage(PROXY_LIKE_ADDR, IMPLEMENTATION_SLOT);
      await expect(f11.connect(owner).upgradeTo(payeeAddress)).to.be.revertedWithCustomError(f11, "UpgradeExpired");
      expect(await ethers.provider.getStorage(PROXY_LIKE_ADDR, IMPLEMENTATION_SLOT)).to.equal(implBefore);
    }));
});
