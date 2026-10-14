#!/usr/bin/env node
/**
 * Obstacle 5: deploy AacProductionCustodyGateSettler and upgrade production proxy
 * 0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd. Smoke settle + settleBridge via COVER.
 * Does not consume AAC, unpause canary, or grant Treasury/GB/Peer roles.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEthers() {
  for (const candidate of [resolve(ROOT, '../../package.json'), resolve(ROOT, '../package.json')]) {
    if (existsSync(candidate)) return createRequire(candidate)('ethers')
  }
  return createRequire(import.meta.url)('ethers')
}

const { Contract, ContractFactory, JsonRpcProvider, Wallet, Interface, getAddress } = loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const CONET_FINALITY = '0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9'
const PROOF_LINK = '0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b'
const COVER_SMOKE_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const COMPILER = '0.8.35+commit.47b9dedd'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

const COVER_ABI = [
  `function cover(
    tuple(bytes signerUncompressed, bytes bits, tuple(uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes signaturePoint) input,
    tuple(uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) finalized,
    bytes32[7] finalityBranch,
    bytes baseHeaderRlp,
    bytes receiptRlp,
    bytes[] proofNodes,
    uint64 receiptIndex,
    uint256 logIndex,
    tuple(uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot)[] beaconHeaders
  ) returns (bytes32 operationId, uint256 amount, bool messageCovered_, bool headerFinal_)`,
]

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) {
      return `0x${k}`
    }
  }
  throw new Error('no 64-hex admin key in ~/.master.json')
}

function compile() {
  const settlerSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), 'utf8')
  const bridgeSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBridge.sol'), 'utf8')
  const beaconSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBeacon.sol'), 'utf8')
  const input = {
    language: 'Solidity',
    sources: {
      'contracts/AacProductionCustodyGateSettler.sol': { content: settlerSrc },
      'contracts/AacProductionCustodyGateBridge.sol': { content: bridgeSrc },
      'contracts/AacProductionCustodyGateBeacon.sol': { content: beaconSrc },
    },
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
        },
      },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const inputPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettler-standard-input.json')
  writeFileSync(inputPath, JSON.stringify(input, null, 2))
  const r = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  }
  const out = JSON.parse(r.stdout)
  if (out.errors?.some((e) => e.severity === 'error')) {
    throw new Error(out.errors.map((e) => e.formattedMessage || e.message).join('\n'))
  }
  const art = out.contracts['contracts/AacProductionCustodyGateSettler.sol'].AacProductionCustodyGateSettler
  return { inputPath, standardInput: input, art }
}

/** Reuse Obstacle 2 cover calldata body; swap 4-byte selector (avoids ethers frozen Result). */
async function coverCalldataWithSelector(provider, newSelector) {
  const tx = await provider.getTransaction(COVER_SMOKE_TX)
  if (!tx || !tx.data || tx.data.length < 10) {
    throw new Error(`missing cover smoke tx ${COVER_SMOKE_TX}`)
  }
  if (getAddress(tx.to) !== getAddress(COVER)) {
    throw new Error(`cover smoke tx wrong to: ${tx.to}`)
  }
  const sel = String(newSelector).toLowerCase().replace(/^0x/, '')
  if (sel.length !== 8) throw new Error(`bad selector ${newSelector}`)
  return `0x${sel}${tx.data.slice(10)}`
}

async function verifySourcify(address, creationTx, standardInput, contractIdentifier) {
  const body = {
    stdJsonInput: standardInput,
    compilerVersion: COMPILER,
    contractIdentifier,
    creationTransactionHash: creationTx,
  }
  const res = await fetch(`https://sourcify.dev/server/v2/verify/8453/${address}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok && !json.verificationId) {
    throw new Error(`sourcify submit ${address}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`)
  }
  const verificationId = json.verificationId
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await fetch(`https://sourcify.dev/server/v2/verify/${verificationId}`)
    const job = await poll.json()
    if (job.isJobCompleted || job.match || job.runtimeMatch) {
      return {
        verificationId,
        match: job.match || job.runtimeMatch || 'unknown',
        runtimeMatch: job.runtimeMatch,
        creationMatch: job.creationMatch,
        isJobCompleted: !!job.isJobCompleted,
      }
    }
  }
  throw new Error(`sourcify poll timeout ${verificationId}`)
}

async function main() {
  console.log(JSON.stringify({ phase: 'compile_start' }))
  const { inputPath, standardInput, art } = compile()
  const bytecode = art.evm.bytecode.object.startsWith('0x')
    ? art.evm.bytecode.object
    : `0x${art.evm.bytecode.object}`
  console.log(
    JSON.stringify({
      phase: 'compile_ok',
      implBytes: bytecode.length / 2 - 1,
      standardJson: inputPath,
    }),
  )

  const provider = new JsonRpcProvider(RPC, 8453)
  const ownerWallet = new Wallet(loadOwnerKey(), provider)
  const deployer = await ownerWallet.getAddress()
  if (getAddress(deployer) !== getAddress(OWNER)) {
    throw new Error(`admin key address ${deployer} is not owner ${OWNER}`)
  }
  console.log(JSON.stringify({ phase: 'owner', address: deployer, rpc: RPC }))

  const proxyRead = new Contract(
    PROXY,
    [
      'function owner() view returns (address)',
      'function proofLink() view returns (address)',
      'function custodyOpen() view returns (bool)',
      'function headerFinal() view returns (bool)',
      'function settle() pure',
      'function upgradeTo(address) external',
      'function COVER() view returns (address)',
      'function CONET_FINALITY() view returns (address)',
    ],
    provider,
  )
  const before = {
    owner: await proxyRead.owner(),
    proofLink: await proxyRead.proofLink(),
    custodyOpen: await proxyRead.custodyOpen(),
    headerFinal: await proxyRead.headerFinal(),
  }
  const slot = await provider.getStorage(PROXY, IMPL_SLOT)
  const prevImpl = getAddress('0x' + slot.slice(-40))
  console.log(JSON.stringify({ phase: 'before', ...before, implementation: prevImpl }))

  const factory = new ContractFactory(art.abi, bytecode, ownerWallet)
  const impl = await factory.deploy()
  await impl.waitForDeployment()
  const implTx = impl.deploymentTransaction()
  const implReceipt = await implTx.wait()
  const implAddress = await impl.getAddress()
  console.log(
    JSON.stringify({
      phase: 'implementation',
      address: implAddress,
      tx: implTx.hash,
      gasUsed: Number(implReceipt.gasUsed),
      block: implReceipt.blockNumber,
    }),
  )

  const proxyWrite = new Contract(PROXY, ['function upgradeTo(address newImplementation) external'], ownerWallet)
  const upgradeTx = await proxyWrite.upgradeTo(implAddress)
  const upgradeReceipt = await upgradeTx.wait()
  const slotAfter = await provider.getStorage(PROXY, IMPL_SLOT)
  const implAfter = getAddress('0x' + slotAfter.slice(-40))
  if (getAddress(implAfter) !== getAddress(implAddress)) {
    throw new Error(`upgrade failed: slot=${implAfter} expected=${implAddress}`)
  }
  console.log(
    JSON.stringify({
      phase: 'upgrade',
      tx: upgradeTx.hash,
      gasUsed: Number(upgradeReceipt.gasUsed),
      block: upgradeReceipt.blockNumber,
      implementation: implAfter,
    }),
  )

  const afterViews = {
    owner: await proxyRead.owner(),
    proofLink: await proxyRead.proofLink(),
    custodyOpen: await proxyRead.custodyOpen(),
    headerFinal: await proxyRead.headerFinal(),
    COVER: await new Contract(PROXY, art.abi, provider).COVER(),
    CONET_FINALITY: await new Contract(PROXY, art.abi, provider).CONET_FINALITY(),
  }
  if (
    getAddress(afterViews.owner) !== getAddress(OWNER) ||
    getAddress(afterViews.proofLink) !== getAddress(PROOF_LINK) ||
    afterViews.custodyOpen !== false ||
    afterViews.headerFinal !== false
  ) {
    throw new Error(`storage/views drifted: ${JSON.stringify(afterViews)}`)
  }

  let noArgSettleRevert = ''
  try {
    await proxyRead.settle.staticCall()
  } catch (e) {
    noArgSettleRevert = e.data || e.shortMessage || e.message || String(e)
  }
  if (!String(noArgSettleRevert).includes('61839255')) {
    throw new Error(`no-arg settle must still CustodyClosed, got ${noArgSettleRevert}`)
  }
  console.log(JSON.stringify({ phase: 'no_arg_settle', reverts: '0x61839255' }))

  const settler = new Contract(PROXY, art.abi, ownerWallet)
  // settle = 0x50b1cadb, settleBridge = 0x4e83f2d2 (same args as cover 0x41ba3f33)
  const settleData = await coverCalldataWithSelector(provider, '0x50b1cadb')
  const settleBridgeData = await coverCalldataWithSelector(provider, '0x4e83f2d2')
  console.log(
    JSON.stringify({
      phase: 'settle_cover_start',
      coverTx: COVER_SMOKE_TX,
      settleSelector: '0x50b1cadb',
      settleBridgeSelector: '0x4e83f2d2',
      settleDataBytes: settleData.length / 2 - 1,
    }),
  )

  const settleTx = await ownerWallet.sendTransaction({
    to: PROXY,
    data: settleData,
    gasLimit: 16_000_000n,
  })
  const settleRc = await settleTx.wait()
  console.log(
    JSON.stringify({
      phase: 'settle_ok',
      tx: settleTx.hash,
      gasUsed: Number(settleRc.gasUsed),
      status: settleRc.status,
    }),
  )
  if (settleRc.status !== 1) throw new Error('settle failed')

  const settleBridgeTx = await ownerWallet.sendTransaction({
    to: PROXY,
    data: settleBridgeData,
    gasLimit: 16_000_000n,
  })
  const settleBridgeRc = await settleBridgeTx.wait()
  console.log(
    JSON.stringify({
      phase: 'settleBridge_ok',
      tx: settleBridgeTx.hash,
      gasUsed: Number(settleBridgeRc.gasUsed),
      status: settleBridgeRc.status,
    }),
  )
  if (settleBridgeRc.status !== 1) throw new Error('settleBridge failed')

  const rootReady = await new Contract(CONET_FINALITY, ['function rootReady() view returns (bool)'], provider).rootReady()
  if (!rootReady) throw new Error('CONET_FINALITY.rootReady must be true for settleFromConet smoke')
  const { AbiCoder, id } = loadEthers()
  const conetOp = id('aac.obstacle5.conet.settle')
  const conetAmount = 10000n
  const inclusion = AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [conetOp, conetAmount])
  const conetTx = await settler.settleFromConet(conetOp, conetAmount, inclusion, { gasLimit: 500_000n })
  const conetRc = await conetTx.wait()
  console.log(
    JSON.stringify({
      phase: 'settleFromConet_ok',
      tx: conetTx.hash,
      gasUsed: Number(conetRc.gasUsed),
      rootReady,
      status: conetRc.status,
    }),
  )
  if (conetRc.status !== 1) throw new Error('settleFromConet failed')

  let badGateReverted = false
  try {
    const bad = await settler.settleFromConet(conetOp, conetAmount, '0xdead', { gasLimit: 200_000n })
    await bad.wait()
  } catch {
    badGateReverted = true
  }
  if (!badGateReverted) throw new Error('bad inclusion must revert')

  console.log(JSON.stringify({ phase: 'sourcify_start', address: implAddress }))
  const sourcify = await verifySourcify(
    implAddress,
    implTx.hash,
    standardInput,
    'contracts/AacProductionCustodyGateSettler.sol:AacProductionCustodyGateSettler',
  )
  console.log(JSON.stringify({ phase: 'sourcify_done', sourcify }))

  const snap = {
    chainId: 8453,
    generatedAt: new Date().toISOString(),
    proxy: PROXY,
    implementation: implAddress,
    previousImplementation: prevImpl,
    owner: OWNER,
    proofLink: PROOF_LINK,
    cover: COVER,
    conetFinality: CONET_FINALITY,
    headerFinal: false,
    custodyOpen: false,
    compiler: COMPILER,
    settings: {
      viaIR: true,
      optimizerRuns: 2,
      bytecodeHash: 'none',
      evmVersion: 'cancun',
    },
    smoke: {
      coverSmokeTx: COVER_SMOKE_TX,
      settleTx: settleTx.hash,
      settleGasUsed: Number(settleRc.gasUsed),
      settleBridgeTx: settleBridgeTx.hash,
      settleBridgeGasUsed: Number(settleBridgeRc.gasUsed),
      settleFromConetTx: conetTx.hash,
      settleFromConetGasUsed: Number(conetRc.gasUsed),
      noArgSettleReverts: '0x61839255',
      badInclusionReverted: true,
      rootReady,
    },
    views: afterViews,
    transactions: {
      implementation: implTx.hash,
      upgrade: upgradeTx.hash,
      settle: settleTx.hash,
      settleBridge: settleBridgeTx.hash,
      settleFromConet: conetTx.hash,
    },
    implementationBlock: implReceipt.blockNumber,
    upgradeBlock: upgradeReceipt.blockNumber,
    custody: 'closed',
    obstacle: 5,
    standardJson: 'deployments/base-AacProductionCustodyGateSettler-standard-input.json',
    sourcify: {
      implementation: sourcify,
      match: sourcify.match,
    },
    meaning:
      'Production proxy upgraded to settler. settle/settleBridge succeed only via COVER.cover in the same call. settleFromConet requires rootReady + inclusion binding. No-arg settle still CustodyClosed. custodyOpen and headerFinal remain false. No AAC consume and no Treasury/GB/Peer roles.',
  }
  const outPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettler.json')
  writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n')
  // Mirror proxy pointer for continuity with prior bridge JSON
  const bridgePath = join(ROOT, 'deployments/base-AacProductionCustodyGateBridge.json')
  if (existsSync(bridgePath)) {
    const bridge = JSON.parse(readFileSync(bridgePath, 'utf8'))
    bridge.implementation = implAddress
    bridge.previousImplementation = prevImpl
    bridge.upgradeTx = upgradeTx.hash
    bridge.upgradeBlock = upgradeReceipt.blockNumber
    bridge.settler = outPath
    bridge.obstacle5 = true
    writeFileSync(bridgePath, JSON.stringify(bridge, null, 2) + '\n')
  }
  console.log(JSON.stringify({ phase: 'written', path: outPath, proxy: PROXY, implementation: implAddress }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
