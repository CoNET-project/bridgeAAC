import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

function loadEthers() {
  const candidates = [
    path.resolve(root, "../../package.json"),
    path.resolve(root, "../package.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return createRequire(candidate)("ethers");
  }
  return createRequire(import.meta.url)("ethers");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { Contract, ContractFactory, JsonRpcProvider, Wallet, id, getAddress } = loadEthers();
const solc = path.join(
  os.homedir(),
  "Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd",
);
const rpcUrl = process.env.CONET_RPC_URL || "https://rpc1.conet.network";
const files = [
  "AacConsumeOnceV1.sol",
  "AacConsumeOnceV2.sol",
  "AacConsumeOnceReorder.sol",
  "AacConsumeHarness.sol",
];

function compile() {
  const sources = {};
  for (const name of files) {
    sources[`contracts/${name}`] = { content: fs.readFileSync(path.join(root, "contracts", name), "utf8") };
  }
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: false,
      metadata: { bytecodeHash: "ipfs" },
      outputSelection: {
        "*": {
          "": ["ast"],
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "storageLayout", "metadata"],
        },
      },
    },
  };
  const compiled = spawnSync(solc, ["--standard-json"], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (compiled.status !== 0) throw new Error(compiled.stderr || "solc failed");
  const out = JSON.parse(compiled.stdout);
  const errors = (out.errors || []).filter((item) => item.severity === "error");
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  return { input, out };
}

function artifact(out, file, name) {
  const item = out.contracts[`contracts/${file}`][name];
  return { abi: item.abi, bytecode: "0x" + item.evm.bytecode.object };
}

async function expectRevert(label, sent) {
  try {
    const tx = await sent;
    const receipt = await tx.wait();
    throw new Error(`${label} mined successfully ${receipt.hash}`);
  } catch (error) {
    const receipt = error.receipt;
    if (!receipt || receipt.status !== 0) throw error;
    console.log(label, receipt.hash);
    return receipt.hash;
  }
}

async function expectSuccess(label, sent) {
  const tx = await sent;
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${label} status ${receipt.status}`);
  console.log(label, receipt.hash);
  return receipt.hash;
}

const { input, out } = compile();
const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 224422n) throw new Error(`chain ${network.chainId}`);
const master = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".master.json"), "utf8"));
const rawKey = master.settle_contractAdmin[0];
const admin = new Wallet(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`, provider);
console.log("deployer", admin.address);

const v1 = artifact(out, "AacConsumeOnceV1.sol", "AacConsumeOnceV1");
const v2 = artifact(out, "AacConsumeOnceV2.sol", "AacConsumeOnceV2");
const reorder = artifact(out, "AacConsumeOnceReorder.sol", "AacConsumeOnceReorder");
const harness = artifact(out, "AacConsumeHarness.sol", "AacErc1967Proxy");
const gatewayArt = artifact(out, "AacConsumeHarness.sol", "AacGatewayCaller");
const revertArt = artifact(out, "AacConsumeHarness.sol", "AacRevertEffect");

const v1Impl = await new ContractFactory(v1.abi, v1.bytecode, admin).deploy();
await v1Impl.waitForDeployment();
const v2Impl = await new ContractFactory(v2.abi, v2.bytecode, admin).deploy();
await v2Impl.waitForDeployment();
const reorderImpl = await new ContractFactory(reorder.abi, reorder.bytecode, admin).deploy();
await reorderImpl.waitForDeployment();
const gateway = await new ContractFactory(gatewayArt.abi, gatewayArt.bytecode, admin).deploy();
await gateway.waitForDeployment();
const revertEffect = await new ContractFactory(revertArt.abi, revertArt.bytecode, admin).deploy();
await revertEffect.waitForDeployment();

const gatewayAddress = await gateway.getAddress();
const init = new Contract(gatewayAddress, v1.abi, admin).interface.encodeFunctionData("initialize", [
  admin.address,
  gatewayAddress,
]);
const proxyDeploy = await new ContractFactory(harness.abi, harness.bytecode, admin).deploy(await v1Impl.getAddress(), init);
await proxyDeploy.waitForDeployment();
const proxyAddress = await proxyDeploy.getAddress();
const consumer = new Contract(proxyAddress, v1.abi, admin);
await (await gateway.bind(proxyAddress)).wait();

const header = id("aac-header");
const proofRoot = id("aac-root");
const leaf = id("aac-leaf");
const idReplay = id("aac-replay");
const idRollback = id("aac-rollback");
const idAfterUpgrade = id("aac-after-upgrade");
const txs = {};

txs.adminRejected = await expectRevert(
  "admin-consume-rejected",
  consumer.consume(idReplay, header, proofRoot, leaf, gatewayAddress, { gasLimit: 400000 }),
);
txs.reentrancy = await expectSuccess(
  "reentrancy-one-credit",
  gateway.consume(idReplay, header, proofRoot, leaf, gatewayAddress),
);
if (await consumer.credits() !== 1n) throw new Error(`credits ${await consumer.credits()}`);
if (!(await consumer.isConsumed(idReplay))) throw new Error("replay id missing");
txs.replayRejected = await expectRevert(
  "replay-rejected",
  gateway.consume(idReplay, header, proofRoot, leaf, gatewayAddress, { gasLimit: 400000 }),
);
if (await consumer.credits() !== 1n) throw new Error("credits changed after replay");
txs.rollback = await expectRevert(
  "effect-rollback",
  gateway.consume(idRollback, header, proofRoot, leaf, await revertEffect.getAddress(), { gasLimit: 400000 }),
);
if (await consumer.isConsumed(idRollback)) throw new Error("rolled-back id stuck");
if (await consumer.credits() !== 1n) throw new Error("credits changed after rollback");

txs.reorderRejected = await expectRevert(
  "reorder-upgrade-rejected",
  consumer.upgradeToAndCall(await reorderImpl.getAddress(), "0x", { gasLimit: 400000 }),
);
if (getAddress(await consumer.implementation()) !== getAddress(await v1Impl.getAddress())) {
  throw new Error("implementation changed after rejected upgrade");
}
txs.upgradeAppend = await expectSuccess(
  "append-upgrade",
  consumer.upgradeToAndCall(await v2Impl.getAddress(), "0x"),
);
const v2Consumer = new Contract(proxyAddress, v2.abi, admin);
if (getAddress(await v2Consumer.implementation()) !== getAddress(await v2Impl.getAddress())) {
  throw new Error("implementation is not v2");
}
if (!(await v2Consumer.isConsumed(idReplay))) throw new Error("consumed id lost across upgrade");
if (await v2Consumer.credits() !== 1n) throw new Error("credits lost across upgrade");
txs.setRescueAdmin = await expectSuccess("set-rescue-admin", v2Consumer.setRescueAdmin(admin.address));
if (getAddress(await v2Consumer.rescueAdmin()) !== getAddress(admin.address)) throw new Error("rescue admin unset");
txs.consumeAfterUpgrade = await expectSuccess(
  "consume-after-upgrade",
  gateway.consume(idAfterUpgrade, header, proofRoot, leaf, gatewayAddress),
);
if (await v2Consumer.credits() !== 2n) throw new Error(`credits ${await v2Consumer.credits()}`);
if (!(await v2Consumer.isConsumed(idAfterUpgrade))) throw new Error("post-upgrade id missing");

const deployment = {
  chainId: 224422,
  rpc: rpcUrl,
  deployer: admin.address,
  proxy: proxyAddress,
  v1Impl: await v1Impl.getAddress(),
  v2Impl: await v2Impl.getAddress(),
  reorderImpl: await reorderImpl.getAddress(),
  gateway: gatewayAddress,
  revertEffect: await revertEffect.getAddress(),
  rescueAdmin: admin.address,
  storage: {
    v1: "paused@0 admin@1 gateway@2 consumed@3 credits@4 __gap@5",
    v2Append: "rescueAdmin@55",
  },
  txs,
  custodyGate: "no",
  compiler: "v0.8.35+commit.47b9dedd",
  metadataBytecodeHash: "ipfs",
  note: "Specification consumer only. It does not mint or release. Independent audit is still absent, so the custody consume-once gate stays closed.",
};
const outDir = path.join(root, "deployments");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "conet-AacConsumeOnce.json"), JSON.stringify(deployment, null, 2));
fs.writeFileSync(path.join(outDir, "aac-consume-standard-input.json"), JSON.stringify(input));
console.log(JSON.stringify({ proxy: proxyAddress, txs }, null, 2));
