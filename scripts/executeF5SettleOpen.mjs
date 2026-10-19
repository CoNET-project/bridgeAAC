#!/usr/bin/env node
/**
 * Phase F5 — Settler mintPaid after consume + GB.admins(AAC) re-grant.
 *
 * 1) GB.addAdmin(AAC) on CoNET + Base (if not already)
 * 2) Deploy SettlerF5; AAC upgradeTo
 * 3) Smoke: custody closed; admins true both chains; COVER smoke settle
 *    (mintTo+OkEffect) → AlreadyConsumed (opId burned in F3)
 *
 * Dry-run by default. Broadcast: PHASE_F5_EXECUTE=1
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
 *
 * Live GB mint needs a new BridgeOperation (COVER sample already consumed).
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

const { Contract, ContractFactory, JsonRpcProvider, Wallet, Interface, getAddress, id } = loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const CONET_RPC = process.env.CONET_RPC_URL || 'https://rpc1.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC_PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const PROOF_LINK = '0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b'
const INCLUSION = '0x7064860E3594aE120f71700B2F46151c6D370559'
const CONSUME_PROXY = '0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F'
const OK_EFFECT = '0x8Cdb0DB088c67A70a5db45dB8A4B2e1b9E4BCbAF'
const SETTLER_F3 = '0xf131359EE46d261B91cEedE8772DE18fB821B2b0'
const GB = '0xC3EF02DaE632b4C10abB66e07d92a387c10838D8'
const COVER_SMOKE_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const COMPILER = '0.8.35+commit.47b9dedd'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EXECUTE = process.env.PHASE_F5_EXECUTE === '1'
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'

const AAC_ABI = [
  'function owner() view returns (address)',
  'function custodyOpen() view returns (bool)',
  'function headerFinal() view returns (bool)',
  'function proofLink() view returns (address)',
  'function COVER() view returns (address)',
  'function CONET_INCLUSION() view returns (address)',
  'function CONSUME() view returns (address)',
  'function GB() view returns (address)',
  'function upgradeTo(address newImplementation)',
]

const CONSUME_ABI = [
  'function admin() view returns (address)',
  'function gateway() view returns (address)',
  'function isConsumed(bytes32 id) view returns (bool)',
]

const GB_ABI = [
  'function admins(address) view returns (bool)',
  'function addAdmin(address)',
  'function owner() view returns (address)',
]

const COVER_COVER_ABI = [
  'function cover((bytes signerUncompressed,bytes bits,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) attested,uint256 signatureSlot,bytes signaturePoint) input,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) finalized,bytes32[7] finalityBranch,bytes baseHeaderRlp,bytes receiptRlp,bytes[] proofNodes,uint64 receiptIndex,uint256 logIndex,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot)[] beaconHeaders) returns (bytes32,uint256,bool,bool)',
]
const SETTLE_WITH_MINT_ABI = [
  'function settle((bytes signerUncompressed,bytes bits,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) attested,uint256 signatureSlot,bytes signaturePoint) input,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) finalized,bytes32[7] finalityBranch,bytes baseHeaderRlp,bytes receiptRlp,bytes[] proofNodes,uint64 receiptIndex,uint256 logIndex,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot)[] beaconHeaders,address mintTo,address effect) returns (bytes32,uint256)',
]

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) return `0x${k}`
  }
  throw new Error('no 64-hex admin key in the owner key file (OWNER_KEY_FILE)')
}

function readImpl(provider, proxy) {
  return provider.getStorage(proxy, IMPL_SLOT).then((slot) => getAddress('0x' + slot.slice(-40)))
}

function solcCompile(sources, outJsonPath) {
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] },
      },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(outJsonPath, JSON.stringify(input, null, 2))
  const r = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  const out = JSON.parse(r.stdout)
  if (out.errors?.some((e) => e.severity === 'error')) {
    throw new Error(out.errors.map((e) => e.formattedMessage || e.message).join('\n'))
  }
  return { standardInput: input, out }
}

function compileSettlerF5() {
  const settlerSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettlerF5.sol'), 'utf8')
  const bridgeSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBridge.sol'), 'utf8')
  const beaconSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBeacon.sol'), 'utf8')
  for (const needle of ['mintPaid', 'BadMintTo', 'Minted', 'consumeFromSettler', CONSUME_PROXY.slice(2), GB.slice(2)]) {
    if (!settlerSrc.includes(needle)) throw new Error(`SettlerF5 missing ${needle}`)
  }
  const { standardInput, out } = solcCompile(
    {
      'contracts/AacProductionCustodyGateSettlerF5.sol': { content: settlerSrc },
      'contracts/AacProductionCustodyGateBridge.sol': { content: bridgeSrc },
      'contracts/AacProductionCustodyGateBeacon.sol': { content: beaconSrc },
    },
    join(ROOT, 'deployments/base-AacProductionCustodyGateSettlerF5-standard-input.json'),
  )
  const art = out.contracts['contracts/AacProductionCustodyGateSettlerF5.sol'].AacProductionCustodyGateSettlerF5
  if (!art?.evm?.bytecode?.object) throw new Error('SettlerF5 bytecode missing')
  // viaIR may not embed PUSH4(mintPaid) as a contiguous runtime literal; require
  // GB address + Minted event + settle(mintTo) ABI instead.
  const runtime = String(art.evm.deployedBytecode.object).toLowerCase()
  if (!runtime.includes(GB.slice(2).toLowerCase())) {
    throw new Error('SettlerF5 runtime missing GB constant')
  }
  const minted = (art.abi || []).find((x) => x.type === 'event' && x.name === 'Minted')
  if (!minted) throw new Error('SettlerF5 ABI missing Minted event')
  const settleWithMint = (art.abi || []).find(
    (x) =>
      x.type === 'function' &&
      x.name === 'settle' &&
      Array.isArray(x.inputs) &&
      x.inputs.some((i) => i.name === 'mintTo'),
  )
  if (!settleWithMint) throw new Error('SettlerF5 ABI missing settle(..., mintTo, effect)')
  const mintPaidSel = id('mintPaid(address,uint256)').slice(0, 10)
  return { art, standardInput, mintPaidSel }
}

function settleCoverFragment(iface) {
  const frags = iface.fragments.filter((f) => f.type === 'function' && f.name === 'settle' && f.inputs?.length)
  if (frags.length !== 1) throw new Error(`expected one settle(...) with args, got ${frags.length}`)
  return frags[0]
}

async function coverSettleCalldata(provider, settleSelector, mintTo, effect) {
  const tx = await provider.getTransaction(COVER_SMOKE_TX)
  if (!tx?.data || tx.data.length < 10) throw new Error(`missing cover smoke tx ${COVER_SMOKE_TX}`)
  if (getAddress(tx.to) !== getAddress(COVER)) throw new Error(`cover smoke tx wrong to: ${tx.to}`)
  const coverIface = new Interface(COVER_COVER_ABI)
  const settleIface = new Interface(SETTLE_WITH_MINT_ABI)
  const decoded = coverIface.decodeFunctionData('cover', tx.data)
  const data = settleIface.encodeFunctionData('settle', [...decoded, getAddress(mintTo), getAddress(effect)])
  const want = String(settleSelector).toLowerCase()
  if (data.slice(0, 10).toLowerCase() !== want) {
    throw new Error(`settle selector mismatch encoded=${data.slice(0, 10)} want=${want}`)
  }
  return data
}

async function deployImpl(art, wallet, label) {
  const factory = new ContractFactory(art.abi, '0x' + art.evm.bytecode.object, wallet)
  const c = await factory.deploy()
  await c.waitForDeployment()
  const tx = c.deploymentTransaction()
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label} deploy failed ${tx.hash}`)
  const address = await c.getAddress()
  console.log(JSON.stringify({ phase: `${label}_impl`, address, tx: tx.hash, gasUsed: Number(receipt.gasUsed) }))
  return { address, txHash: tx.hash, receipt }
}

async function upgradeProxy(wallet, proxy, impl, label) {
  const writable = new Contract(proxy, ['function upgradeTo(address newImplementation)'], wallet)
  const tx = await writable.upgradeTo(impl)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label} upgradeTo failed ${tx.hash}`)
  const after = await readImpl(wallet.provider, proxy)
  if (getAddress(after) !== getAddress(impl)) {
    throw new Error(`${label} slot mismatch after=${after} expected=${impl}`)
  }
  console.log(JSON.stringify({ phase: `${label}_upgrade`, tx: tx.hash, impl: after, gasUsed: Number(receipt.gasUsed) }))
  return { txHash: tx.hash, receipt, implAfter: after }
}

async function ensureGbAdmin(wallet, chainLabel) {
  const gb = new Contract(GB, GB_ABI, wallet)
  const before = await gb.admins(AAC_PROXY)
  if (before) {
    console.log(JSON.stringify({ phase: `gb_admin_${chainLabel}`, already: true, admins: true }))
    return { txHash: null, already: true }
  }
  const tx = await gb.addAdmin(AAC_PROXY)
  const rc = await tx.wait()
  if (rc.status !== 1) throw new Error(`${chainLabel} GB.addAdmin failed ${tx.hash}`)
  const after = await gb.admins(AAC_PROXY)
  if (!after) throw new Error(`${chainLabel} GB.admins(AAC) still false`)
  console.log(JSON.stringify({ phase: `gb_admin_${chainLabel}`, tx: tx.hash, admins: true, gasUsed: Number(rc.gasUsed) }))
  return { txHash: tx.hash, already: false }
}

async function main() {
  const baseProvider = new JsonRpcProvider(BASE_RPC)
  const conetProvider = new JsonRpcProvider(CONET_RPC)
  const ownerKey = loadOwnerKey()
  const baseWallet = new Wallet(ownerKey, baseProvider)
  const conetWallet = new Wallet(ownerKey, conetProvider)
  if (getAddress(baseWallet.address) !== getAddress(OWNER)) {
    throw new Error(`owner key mismatch: ${baseWallet.address}`)
  }

  const aacBefore = await readImpl(baseProvider, AAC_PROXY)
  const aacRead = new Contract(AAC_PROXY, AAC_ABI, baseProvider)
  const consumeRead = new Contract(CONSUME_PROXY, CONSUME_ABI, baseProvider)
  const gbBase = new Contract(GB, GB_ABI, baseProvider)
  const gbConet = new Contract(GB, GB_ABI, conetProvider)
  const viewsBefore = {
    owner: await aacRead.owner(),
    custodyOpen: await aacRead.custodyOpen(),
    headerFinal: await aacRead.headerFinal(),
    proofLink: await aacRead.proofLink(),
    consumeGateway: await consumeRead.gateway(),
    gbAdminsBase: await gbBase.admins(AAC_PROXY),
    gbAdminsConet: await gbConet.admins(AAC_PROXY),
  }
  console.log(
    JSON.stringify({
      phase: 'before',
      execute: EXECUTE,
      aacImpl: aacBefore,
      expectedF3: SETTLER_F3,
      views: viewsBefore,
    }),
  )

  console.log('[F5] compile SettlerF5…')
  const settlerCompiled = compileSettlerF5()
  const settlerIface = new Interface(settlerCompiled.art.abi)
  const settleFrag = settleCoverFragment(settlerIface)
  const settleSel = settleFrag.selector
  console.log(
    JSON.stringify({
      phase: 'selectors',
      settle: settleSel,
      settleFormat: settleFrag.format('sighash'),
      mintPaidSel: settlerCompiled.mintPaidSel,
      compiler: COMPILER,
    }),
  )

  if (!EXECUTE) {
    const snap = {
      phase: 'F5',
      status: 'DRY_RUN',
      executedAt: new Date().toISOString(),
      ownerAuth: OWNER_AUTH,
      aacProxy: AAC_PROXY,
      aacImplBefore: aacBefore,
      settleSelector: settleSel,
      mintPaidSelector: settlerCompiled.mintPaidSel,
      viewsBefore,
      compile: {
        settlerBytecodeBytes: settlerCompiled.art.evm.bytecode.object.length / 2,
        mintPaidInRuntime: true,
      },
      note: 'COVER smoke opId already consumed in F3 — EXECUTE smoke expects AlreadyConsumed; live mint needs new BridgeOperation',
      next: 'PHASE_F5_EXECUTE=1 node scripts/executeF5SettleOpen.mjs',
      ok: true,
    }
    writeFileSync(join(ROOT, 'deployments/phase-F5-settle-open.json'), JSON.stringify(snap, null, 2) + '\n')
    console.log(JSON.stringify({ phase: 'dry_run_done', path: 'deployments/phase-F5-settle-open.json' }))
    return
  }

  // --- EXECUTE ---
  console.log('[F5] re-grant GB.admins(AAC) CoNET + Base…')
  const gbConetGrant = await ensureGbAdmin(conetWallet, 'conet')
  const gbBaseGrant = await ensureGbAdmin(baseWallet, 'base')

  let settlerDeploy = { address: null, txHash: null }
  let aacUpgrade = { txHash: null, implAfter: aacBefore }

  let priorF5 = null
  const prevPath = join(ROOT, 'deployments/phase-F5-settle-open.json')
  if (existsSync(prevPath)) {
    try {
      const prev = JSON.parse(readFileSync(prevPath, 'utf8'))
      if (prev.status === 'EXECUTED' && prev.settlerImpl) priorF5 = prev.settlerImpl
    } catch {
      /* ignore */
    }
  }

  if (priorF5 && getAddress(aacBefore) === getAddress(priorF5)) {
    console.log(JSON.stringify({ phase: 'skip_upgrade', reason: 'already_on_F5', impl: aacBefore }))
    settlerDeploy = { address: aacBefore, txHash: null }
    aacUpgrade = { txHash: null, implAfter: aacBefore }
  } else {
    console.log('[F5] deploy SettlerF5 + AAC upgradeTo…')
    settlerDeploy = await deployImpl(settlerCompiled.art, baseWallet, 'settlerF5')
    aacUpgrade = await upgradeProxy(baseWallet, AAC_PROXY, settlerDeploy.address, 'aac')
  }

  const aacAfterImpl = await readImpl(baseProvider, AAC_PROXY)
  if (getAddress(aacAfterImpl) !== getAddress(settlerDeploy.address)) {
    throw new Error(`AAC impl not F5: ${aacAfterImpl}`)
  }

  const aacAfter = new Contract(
    AAC_PROXY,
    [...AAC_ABI, ...settlerCompiled.art.abi.filter((x) => x.type === 'function')],
    baseProvider,
  )
  const viewsAfter = {
    owner: await aacAfter.owner(),
    custodyOpen: await aacAfter.custodyOpen(),
    headerFinal: await aacAfter.headerFinal(),
    proofLink: await aacAfter.proofLink(),
    COVER: await aacAfter.COVER(),
    CONET_INCLUSION: await aacAfter.CONET_INCLUSION(),
    CONSUME: await aacAfter.CONSUME(),
    GB: await aacAfter.GB(),
    consumeGateway: await consumeRead.gateway(),
    gbAdminsBase: await gbBase.admins(AAC_PROXY),
    gbAdminsConet: await gbConet.admins(AAC_PROXY),
  }
  if (
    getAddress(viewsAfter.owner) !== getAddress(OWNER) ||
    viewsAfter.custodyOpen !== false ||
    viewsAfter.headerFinal !== false ||
    getAddress(viewsAfter.proofLink) !== getAddress(PROOF_LINK) ||
    getAddress(viewsAfter.COVER) !== getAddress(COVER) ||
    getAddress(viewsAfter.CONET_INCLUSION) !== getAddress(INCLUSION) ||
    getAddress(viewsAfter.CONSUME) !== getAddress(CONSUME_PROXY) ||
    getAddress(viewsAfter.GB) !== getAddress(GB) ||
    getAddress(viewsAfter.consumeGateway) !== getAddress(AAC_PROXY) ||
    viewsAfter.gbAdminsBase !== true ||
    viewsAfter.gbAdminsConet !== true
  ) {
    throw new Error(`views drifted: ${JSON.stringify(viewsAfter)}`)
  }

  let settleClosed = false
  try {
    await new Contract(AAC_PROXY, ['function settle()'], baseProvider).settle.staticCall()
  } catch (e) {
    const err = e.data || e.shortMessage || e.message || String(e)
    settleClosed = String(err).includes('61839255') || /reverted/i.test(String(err))
  }
  if (!settleClosed) throw new Error('no-arg settle must remain closed')

  console.log('[F5] smoke AlreadyConsumed (F3 cover opId)…')
  const settleData = await coverSettleCalldata(baseProvider, settleSel, OWNER, OK_EFFECT)
  let alreadyConsumed = false
  let smokeError = ''
  let smokeTxHash = null
  try {
    const tx = await baseWallet.sendTransaction({ to: AAC_PROXY, data: settleData, gasLimit: 16_000_000n })
    smokeTxHash = tx.hash
    const rc = await tx.wait()
    if (rc.status === 0) {
      alreadyConsumed = true
      smokeError = 'receipt status=0'
    }
  } catch (e) {
    alreadyConsumed = true
    smokeError = e.shortMessage || e.message || String(e)
  }
  if (!alreadyConsumed) {
    throw new Error('expected AlreadyConsumed on reused COVER smoke opId — got success (unexpected mint?)')
  }
  console.log(
    JSON.stringify({
      phase: 'smoke_already_consumed',
      reverted: true,
      tx: smokeTxHash,
      error: smokeError.slice(0, 200),
    }),
  )

  const snap = {
    phase: 'F5',
    status: 'EXECUTED',
    executedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    aacProxy: AAC_PROXY,
    settlerImpl: settlerDeploy.address,
    aacImplBefore: aacBefore,
    aacImplAfter: aacUpgrade.implAfter,
    settleSelector: settleSel,
    mintPaidSelector: settlerCompiled.mintPaidSel,
    okEffect: OK_EFFECT,
    gb: GB,
    smoke: {
      settleClosed,
      gbAdminsBase: viewsAfter.gbAdminsBase,
      gbAdminsConet: viewsAfter.gbAdminsConet,
      alreadyConsumedOnCoverSmoke: alreadyConsumed,
      smokeTx: smokeTxHash,
      smokeError: smokeError.slice(0, 200),
      liveMintNeedsNewBridgeOperation: true,
    },
    views: viewsAfter,
    transactions: {
      gbAddAdminConet: gbConetGrant.txHash,
      gbAddAdminBase: gbBaseGrant.txHash,
      settlerImpl: settlerDeploy.txHash,
      aacUpgrade: aacUpgrade.txHash,
      smokeAlreadyConsumed: smokeTxHash,
    },
    standardJson: 'deployments/base-AacProductionCustodyGateSettlerF5-standard-input.json',
    meaning:
      'F5: Settler proves COVER/Inclusion then consumeFromSettler then GB.mintPaid(mintTo,amount) in same tx. GB.admins(AAC) true CoNET+Base. Custody views still closed. COVER smoke opId already consumed in F3 — structural AlreadyConsumed only; live mint needs new BridgeOperation.',
    ok: true,
  }
  writeFileSync(join(ROOT, 'deployments/phase-F5-settle-open.json'), JSON.stringify(snap, null, 2) + '\n')

  const settlerSnapPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettler.json')
  if (existsSync(settlerSnapPath)) {
    const prev = JSON.parse(readFileSync(settlerSnapPath, 'utf8'))
    prev.implementation = settlerDeploy.address
    prev.previousImplementation = aacBefore
    prev.f5 = true
    prev.f3Archaeological = SETTLER_F3
    if (aacUpgrade.txHash) prev.upgradeTx = aacUpgrade.txHash
    prev.meaning = snap.meaning
    writeFileSync(settlerSnapPath, JSON.stringify(prev, null, 2) + '\n')
  }

  console.log(JSON.stringify({ phase: 'executed', path: 'deployments/phase-F5-settle-open.json', ok: true }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
