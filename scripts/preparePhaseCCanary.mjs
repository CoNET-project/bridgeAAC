#!/usr/bin/env node
/**
 * Cutover Phase C prep (paid-GB canary gateway).
 *
 * Default: compile + preflight + print proposed C0/C1/C2 (no broadcast).
 * PHASE_C_DEPLOY_IMPL=1 — deploy SettlerCanary impl only (does not upgrade proxy).
 * PHASE_C_EXECUTE=1 — requires PHASE_C_AMOUNT + PHASE_C_AAC_ID + PHASE_C_TO matching
 *   contract ceilings; then upgradeTo + canaryMintPaid. Do not set without an owner
 *   message that names amount / aacId / ceiling.
 *
 * Does not grant Treasury/Peer, unpause historical canaries, or disable miner votes.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
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

const {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  Interface,
  getAddress,
  keccak256,
  toUtf8Bytes,
  ZeroAddress,
} = loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = getAddress('0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1')
const PROXY = getAddress('0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd')
const GB = getAddress('0xC3EF02DaE632b4C10abB66e07d92a387c10838D8')
const COVER = getAddress('0x01506527a4Dab14141038Db15f5341dcF4729233')
const CONET_FINALITY = getAddress('0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9')
const COMPILER = '0.8.35+commit.47b9dedd'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

const CANARY_LABEL = 'beamio.aac.phase-c.canary.v1'
const CANARY_AAC_ID = keccak256(toUtf8Bytes(CANARY_LABEL))
const CANARY_MAX_AMOUNT = 10_000_000n // 0.01 GB @ 9 decimals
const PROPOSED_AMOUNT = 10_000_000n
const PROPOSED_TO = OWNER

const GB_ABI = ['function admins(address) view returns (bool)', 'function balanceOf(address) view returns (uint256)']
const PROXY_ABI = [
  'function owner() view returns (address)',
  'function upgradeTo(address newImplementation)',
  'function canaryMintPaid(address to, uint256 amount, bytes32 aacId) returns (bool)',
  'function canaryMintCompleted() view returns (bool)',
  'function CANARY_AAC_ID() view returns (bytes32)',
  'function CANARY_MAX_AMOUNT() view returns (uint256)',
]

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) {
      return `0x${k}`
    }
  }
  throw new Error('no 64-hex admin key in the owner key file (OWNER_KEY_FILE)')
}

function compile() {
  const sources = {
    'contracts/AacProductionCustodyGateSettlerCanary.sol': {
      content: readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettlerCanary.sol'), 'utf8'),
    },
    'contracts/AacProductionCustodyGateSettler.sol': {
      content: readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), 'utf8'),
    },
    'contracts/AacProductionCustodyGateBridge.sol': {
      content: readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBridge.sol'), 'utf8'),
    },
    'contracts/AacProductionCustodyGateBeacon.sol': {
      content: readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBeacon.sol'), 'utf8'),
    },
  }
  const input = {
    language: 'Solidity',
    sources,
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
  const inputPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettlerCanary-standard-input.json')
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
  const art =
    out.contracts['contracts/AacProductionCustodyGateSettlerCanary.sol']
      .AacProductionCustodyGateSettlerCanary
  const iface = new Interface(art.abi)
  const onChainAacId = iface.getFunction('CANARY_AAC_ID')
    ? null
    : null
  void onChainAacId
  return { inputPath, art, iface }
}

async function readImpl(provider) {
  const raw = await provider.getStorage(PROXY, IMPL_SLOT)
  return getAddress(`0x${raw.slice(-40)}`)
}

async function preflight(provider) {
  const gb = new Contract(GB, GB_ABI, provider)
  const proxy = new Contract(PROXY, ['function owner() view returns (address)'], provider)
  const [adminsAac, adminsOwner, owner, impl, code] = await Promise.all([
    gb.admins(PROXY),
    gb.admins(OWNER),
    proxy.owner(),
    readImpl(provider),
    provider.getCode(PROXY),
  ])
  if (!code || code === '0x') throw new Error('proxy has no code')
  return {
    adminsAac: Boolean(adminsAac),
    adminsOwner: Boolean(adminsOwner),
    owner: getAddress(owner),
    impl,
    gap:
      'Obstacle 5 settler emits Settled only; consume OkEffect is empty; mintPaid requires AAC code path (this canary).',
  }
}

function proposedEnvelope() {
  return {
    chainId: 8453,
    proxy: PROXY,
    gb: GB,
    cover: COVER,
    conetFinality: CONET_FINALITY,
    proposed: {
      label: CANARY_LABEL,
      aacId: CANARY_AAC_ID,
      amount: PROPOSED_AMOUNT.toString(),
      amountHuman: '0.01 paid GB',
      to: PROPOSED_TO,
      ceiling: CANARY_MAX_AMOUNT.toString(),
      ceilingHuman: '0.01 paid GB (CANARY_MAX_AMOUNT)',
    },
    steps: [
      {
        id: 'C0',
        action: 'deploy AacProductionCustodyGateSettlerCanary impl',
        requires: 'PHASE_C_DEPLOY_IMPL=1 or PHASE_C_EXECUTE=1',
      },
      {
        id: 'C1',
        action: `upgradeTo(canaryImpl) on proxy ${PROXY}`,
        requires: 'PHASE_C_EXECUTE=1 + named amount/aacId/ceiling',
      },
      {
        id: 'C2',
        action: `canaryMintPaid(to, amount, aacId)`,
        requires: 'PHASE_C_EXECUTE=1 + PHASE_C_AMOUNT + PHASE_C_AAC_ID + PHASE_C_TO',
      },
    ],
    hardStop:
      'Owner must name amount / aacId / ceiling in a separate message before PHASE_C_EXECUTE=1.',
  }
}

async function deployImpl(wallet, art) {
  const factory = new ContractFactory(art.abi, art.evm.bytecode.object, wallet)
  const contract = await factory.deploy()
  const tx = contract.deploymentTransaction()
  console.log(`[C0] deploy sent ${tx.hash}`)
  await contract.waitForDeployment()
  const addr = getAddress(await contract.getAddress())
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`C0 deploy failed ${tx.hash}`)
  console.log(`[C0] impl=${addr} block=${receipt.blockNumber}`)
  return { address: addr, txHash: tx.hash, blockNumber: receipt.blockNumber }
}

async function executeCanary(wallet, art, implAddress) {
  const amountRaw = process.env.PHASE_C_AMOUNT
  const aacIdRaw = process.env.PHASE_C_AAC_ID
  const toRaw = process.env.PHASE_C_TO
  if (!amountRaw || !aacIdRaw || !toRaw) {
    throw new Error('PHASE_C_EXECUTE requires PHASE_C_AMOUNT, PHASE_C_AAC_ID, PHASE_C_TO')
  }
  const amount = BigInt(amountRaw)
  const aacId = aacIdRaw.toLowerCase()
  const to = getAddress(toRaw)
  if (aacId !== CANARY_AAC_ID.toLowerCase()) {
    throw new Error(`aacId mismatch: got ${aacId}, expected ${CANARY_AAC_ID}`)
  }
  if (amount === 0n || amount > CANARY_MAX_AMOUNT) {
    throw new Error(`amount ${amount} outside (0, ${CANARY_MAX_AMOUNT}]`)
  }
  if (to === ZeroAddress) throw new Error('to is zero')

  const proxy = new Contract(PROXY, PROXY_ABI, wallet)
  const beforeImpl = await readImpl(wallet.provider)
  console.log(`[C1] upgradeTo ${implAddress} (was ${beforeImpl})`)
  const upTx = await proxy.upgradeTo(implAddress)
  console.log(`[C1] sent ${upTx.hash}`)
  const upRc = await upTx.wait()
  if (upRc.status !== 1) throw new Error(`C1 failed ${upTx.hash}`)
  const afterImpl = await readImpl(wallet.provider)
  if (getAddress(afterImpl) !== getAddress(implAddress)) {
    throw new Error(`C1 impl mismatch after upgrade: ${afterImpl}`)
  }

  const live = new Contract(PROXY, PROXY_ABI, wallet)
  const onChainId = await live.CANARY_AAC_ID()
  const onChainMax = await live.CANARY_MAX_AMOUNT()
  if (String(onChainId).toLowerCase() !== CANARY_AAC_ID.toLowerCase()) {
    throw new Error(`on-chain CANARY_AAC_ID mismatch ${onChainId}`)
  }
  if (BigInt(onChainMax) !== CANARY_MAX_AMOUNT) {
    throw new Error(`on-chain CANARY_MAX_AMOUNT mismatch ${onChainMax}`)
  }
  if (await live.canaryMintCompleted()) {
    throw new Error('canary already completed on this proxy')
  }

  const gb = new Contract(GB, GB_ABI, wallet.provider)
  const balBefore = await gb.balanceOf(to)
  console.log(`[C2] canaryMintPaid to=${to} amount=${amount} aacId=${aacId}`)
  const mintTx = await live.canaryMintPaid(to, amount, aacId)
  console.log(`[C2] sent ${mintTx.hash}`)
  const mintRc = await mintTx.wait()
  if (mintRc.status !== 1) throw new Error(`C2 failed ${mintTx.hash}`)
  const balAfter = await gb.balanceOf(to)
  const done = await live.canaryMintCompleted()
  if (!done) throw new Error('canaryMintCompleted still false')
  console.log(`[C2] OK balance ${balBefore} → ${balAfter} delta=${balAfter - balBefore}`)
  return {
    upgradeTx: upTx.hash,
    upgradeBlock: upRc.blockNumber,
    mintTx: mintTx.hash,
    mintBlock: mintRc.blockNumber,
    balBefore: balBefore.toString(),
    balAfter: balAfter.toString(),
  }
}

async function main() {
  const deployImplFlag = process.env.PHASE_C_DEPLOY_IMPL === '1'
  const executeFlag = process.env.PHASE_C_EXECUTE === '1'
  console.log(`[phase-c] compile SettlerCanary (solc ${COMPILER})`)
  const { inputPath, art, iface } = compile()
  const encodedAacId = iface.getFunction('canaryMintPaid')
  void encodedAacId
  // Sanity: bytecode embeds expected aacId constant
  const bytecode = art.evm.bytecode.object.toLowerCase()
  if (!bytecode.includes(CANARY_AAC_ID.slice(2).toLowerCase())) {
    throw new Error('compiled bytecode missing CANARY_AAC_ID constant')
  }
  console.log(`[phase-c] standard-json ${inputPath}`)
  console.log(`[phase-c] proposed aacId=${CANARY_AAC_ID} max=${CANARY_MAX_AMOUNT}`)

  const provider = new JsonRpcProvider(RPC, 8453)
  const net = await provider.getNetwork()
  if (Number(net.chainId) !== 8453) throw new Error(`expected Base 8453, got ${net.chainId}`)
  const pf = await preflight(provider)
  console.log(`[phase-c] preflight`, pf)
  if (!pf.adminsAac) {
    console.warn('[phase-c] WARN: GB.admins(AAC) is false — Phase B required before C2')
  }
  if (getAddress(pf.owner) !== OWNER) {
    throw new Error(`proxy owner ${pf.owner} != OWNER ${OWNER}`)
  }

  const envelope = proposedEnvelope()
  envelope.preflight = pf
  envelope.compiler = COMPILER
  envelope.standardJson = inputPath
  envelope.status = 'PREP_ONLY'
  envelope.generatedAt = new Date().toISOString()

  let implResult = null
  let execResult = null

  if (deployImplFlag || executeFlag) {
    const wallet = new Wallet(loadOwnerKey(), provider)
    if (getAddress(wallet.address) !== OWNER) {
      throw new Error(`signer ${wallet.address} != OWNER`)
    }
    implResult = await deployImpl(wallet, art)
    envelope.c0 = implResult
    if (executeFlag) {
      execResult = await executeCanary(wallet, art, implResult.address)
      envelope.c1c2 = execResult
      envelope.status = 'EXECUTED'
    } else {
      envelope.status = 'IMPL_DEPLOYED'
      console.log('[phase-c] impl deployed; proxy NOT upgraded (set PHASE_C_EXECUTE=1 after named auth)')
    }
  } else {
    console.log('[phase-c] dry-run only (set PHASE_C_DEPLOY_IMPL=1 to deploy impl)')
  }

  const outPath = join(ROOT, 'deployments/phase-C-canary-prep.json')
  writeFileSync(outPath, JSON.stringify(envelope, null, 2) + '\n')
  console.log(`[phase-c] wrote ${outPath}`)
  console.log(JSON.stringify({ status: envelope.status, proposed: envelope.proposed, c0: implResult }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
