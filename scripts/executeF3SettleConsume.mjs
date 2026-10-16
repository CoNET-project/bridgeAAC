#!/usr/bin/env node
/**
 * Phase F3 — Settler same-tx consume-once (no double cover).
 *
 * 1) Upgrade ConsumeOnce with consumeFromSettler; setGateway(AAC)
 * 2) Deploy Settler F3 (CONSUME wired; settle* take effect last); AAC upgradeTo
 * 3) Smoke (same COVER opId): RevertEffect → unconsumed; OkEffect → consumed;
 *    OkEffect again → AlreadyConsumed; custody stays closed; no GB mint
 *
 * Dry-run by default. Broadcast: PHASE_F3_EXECUTE=1
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
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

const { Contract, ContractFactory, JsonRpcProvider, Wallet, Interface, getAddress, id, keccak256, solidityPacked } =
  loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC_PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const PROOF_LINK = '0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b'
const INCLUSION = '0x7064860E3594aE120f71700B2F46151c6D370559'
const CONSUME_PROXY = '0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F'
const OK_EFFECT = '0x8Cdb0DB088c67A70a5db45dB8A4B2e1b9E4BCbAF'
const REVERT_EFFECT = '0x6A4469c7337185c60f311f9B6f2958aB3dDb2480'
const SETTLER_F2 = '0xeC19d84625edA6213F3126033B66397633d8688F'
const COVER_SMOKE_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const COMPILER = '0.8.35+commit.47b9dedd'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EXECUTE = process.env.PHASE_F3_EXECUTE === '1'
/** Skip redeploy when upgrades already live; only run smoke + write EXECUTED artifact. */
const SMOKE_ONLY = process.env.PHASE_F3_SMOKE_ONLY === '1'
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'
/** Live F3 impls after first EXECUTE upgrade (2026-10-15). */
const CONSUME_IMPL_F3 = '0x75aC7020976C6048FCB2bb8741fCA72e2d1cA598'
const SETTLER_IMPL_F3 = '0xf131359EE46d261B91cEedE8772DE18fB821B2b0'

const AAC_ABI = [
  'function owner() view returns (address)',
  'function custodyOpen() view returns (bool)',
  'function headerFinal() view returns (bool)',
  'function proofLink() view returns (address)',
  'function COVER() view returns (address)',
  'function CONET_INCLUSION() view returns (address)',
  'function CONSUME() view returns (address)',
  'function upgradeTo(address newImplementation)',
]

const CONSUME_ABI = [
  'function admin() view returns (address)',
  'function gateway() view returns (address)',
  'function isConsumed(bytes32 id) view returns (bool)',
  'function mintedOf(bytes32 id) view returns (uint256)',
  'function setGateway(address gateway_)',
  'function upgradeToAndCall(address newImpl, bytes data)',
  'function consumeFromSettler(bytes32 id, bytes32 header, bytes32 root, bytes32 leaf, uint8 action, uint256 amount, address effect)',
]

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) return `0x${k}`
  }
  throw new Error('no 64-hex admin key in ~/.master.json')
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

function compileConsumeOnce() {
  const src = readFileSync(join(ROOT, 'contracts/AacProductionConsumeOnce.sol'), 'utf8')
  if (!src.includes('function consumeFromSettler')) {
    throw new Error('ConsumeOnce missing consumeFromSettler')
  }
  const { standardInput, out } = solcCompile(
    { 'contracts/AacProductionConsumeOnce.sol': { content: src } },
    join(ROOT, 'deployments/base-AacProductionConsumeOnce-F3-standard-input.json'),
  )
  const art = out.contracts['contracts/AacProductionConsumeOnce.sol'].AacProductionConsumeOnce
  if (!art?.evm?.bytecode?.object) throw new Error('ConsumeOnce bytecode missing')
  return { art, standardInput }
}

function compileSettler() {
  const settlerSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), 'utf8')
  const bridgeSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBridge.sol'), 'utf8')
  const beaconSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBeacon.sol'), 'utf8')
  if (!settlerSrc.includes('consumeFromSettler') || !settlerSrc.includes(CONSUME_PROXY.slice(2))) {
    throw new Error('Settler missing CONSUME / consumeFromSettler wiring')
  }
  if (!settlerSrc.includes('address effect')) {
    throw new Error('Settler settle* missing effect parameter')
  }
  const { standardInput, out } = solcCompile(
    {
      'contracts/AacProductionCustodyGateSettler.sol': { content: settlerSrc },
      'contracts/AacProductionCustodyGateBridge.sol': { content: bridgeSrc },
      'contracts/AacProductionCustodyGateBeacon.sol': { content: beaconSrc },
    },
    join(ROOT, 'deployments/base-AacProductionCustodyGateSettler-F3-standard-input.json'),
  )
  const art = out.contracts['contracts/AacProductionCustodyGateSettler.sol'].AacProductionCustodyGateSettler
  if (!art?.evm?.bytecode?.object) throw new Error('Settler bytecode missing')
  return { art, standardInput }
}

/** Cover.cover args match settle(...) before the trailing effect address. */
const COVER_COVER_ABI = [
  'function cover((bytes signerUncompressed,bytes bits,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) attested,uint256 signatureSlot,bytes signaturePoint) input,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) finalized,bytes32[7] finalityBranch,bytes baseHeaderRlp,bytes receiptRlp,bytes[] proofNodes,uint64 receiptIndex,uint256 logIndex,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot)[] beaconHeaders) returns (bytes32,uint256,bool,bool)',
]
const SETTLE_WITH_EFFECT_ABI = [
  'function settle((bytes signerUncompressed,bytes bits,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) attested,uint256 signatureSlot,bytes signaturePoint) input,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) finalized,bytes32[7] finalityBranch,bytes baseHeaderRlp,bytes receiptRlp,bytes[] proofNodes,uint64 receiptIndex,uint256 logIndex,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot)[] beaconHeaders,address effect) returns (bytes32,uint256)',
]

/**
 * Rebuild settle(coverArgs…, effect). Must re-encode — cannot append address onto
 * Cover calldata (dynamic args shift head offsets; naive append → EffectFailed).
 */
async function coverSettleCalldata(provider, settleSelector, effect) {
  const tx = await provider.getTransaction(COVER_SMOKE_TX)
  if (!tx?.data || tx.data.length < 10) throw new Error(`missing cover smoke tx ${COVER_SMOKE_TX}`)
  if (getAddress(tx.to) !== getAddress(COVER)) throw new Error(`cover smoke tx wrong to: ${tx.to}`)
  const coverIface = new Interface(COVER_COVER_ABI)
  const settleIface = new Interface(SETTLE_WITH_EFFECT_ABI)
  const decoded = coverIface.decodeFunctionData('cover', tx.data)
  const data = settleIface.encodeFunctionData('settle', [...decoded, getAddress(effect)])
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

function parseSettledOpId(receipt, iface) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data })
      if (parsed?.name === 'Settled') return parsed.args.operationId
    } catch {
      /* skip */
    }
  }
  return null
}

/** Full settle(...) fragment — Beacon also exposes no-arg settle() via inheritance. */
function settleCoverFragment(iface) {
  const frags = iface.fragments.filter((f) => f.type === 'function' && f.name === 'settle' && f.inputs?.length)
  if (frags.length !== 1) throw new Error(`expected one settle(...) with args, got ${frags.length}`)
  return frags[0]
}

async function main() {
  const provider = new JsonRpcProvider(RPC)
  const ownerWallet = new Wallet(loadOwnerKey(), provider)
  if (getAddress(ownerWallet.address) !== getAddress(OWNER)) {
    throw new Error(`owner key mismatch: ${ownerWallet.address}`)
  }

  const aacBefore = await readImpl(provider, AAC_PROXY)
  const consumeBefore = await readImpl(provider, CONSUME_PROXY)
  const aacRead = new Contract(AAC_PROXY, AAC_ABI, provider)
  const consumeRead = new Contract(CONSUME_PROXY, CONSUME_ABI, provider)
  const viewsBefore = {
    owner: await aacRead.owner(),
    custodyOpen: await aacRead.custodyOpen(),
    headerFinal: await aacRead.headerFinal(),
    proofLink: await aacRead.proofLink(),
    consumeAdmin: await consumeRead.admin(),
    consumeGateway: await consumeRead.gateway(),
  }
  console.log(
    JSON.stringify({
      phase: 'before',
      execute: EXECUTE,
      aacImpl: aacBefore,
      consumeImpl: consumeBefore,
      expectedAacF2: SETTLER_F2,
      views: viewsBefore,
    }),
  )
  if (getAddress(aacBefore) !== getAddress(SETTLER_F2)) {
    console.warn(`[F3] WARN: AAC impl ${aacBefore} != F2 Settler ${SETTLER_F2}`)
  }
  if (getAddress(viewsBefore.consumeAdmin) !== getAddress(OWNER)) {
    throw new Error(`ConsumeOnce admin mismatch: ${viewsBefore.consumeAdmin}`)
  }

  console.log('[F3] compile ConsumeOnce…')
  const consumeCompiled = compileConsumeOnce()
  console.log('[F3] compile Settler…')
  const settlerCompiled = compileSettler()
  const settlerIfaceEarly = new Interface(settlerCompiled.art.abi)
  const settleFrag = settleCoverFragment(settlerIfaceEarly)
  const settleSel = settleFrag.selector
  console.log(
    JSON.stringify({
      phase: 'selectors',
      settle: settleSel,
      settleFormat: settleFrag.format('sighash'),
      compiler: COMPILER,
    }),
  )

  if (!EXECUTE) {
    const snap = {
      phase: 'F3',
      status: 'DRY_RUN',
      executedAt: new Date().toISOString(),
      ownerAuth: OWNER_AUTH,
      aacProxy: AAC_PROXY,
      consumeProxy: CONSUME_PROXY,
      aacImplBefore: aacBefore,
      consumeImplBefore: consumeBefore,
      settleSelector: settleSel,
      viewsBefore,
      compile: {
        consumeBytecodeBytes: consumeCompiled.art.evm.bytecode.object.length / 2,
        settlerBytecodeBytes: settlerCompiled.art.evm.bytecode.object.length / 2,
      },
      next: 'PHASE_F3_EXECUTE=1 node scripts/executeF3SettleConsume.mjs',
      ok: true,
    }
    writeFileSync(join(ROOT, 'deployments/phase-F3-settle-consume.json'), JSON.stringify(snap, null, 2) + '\n')
    console.log(JSON.stringify({ phase: 'dry_run_done', path: 'deployments/phase-F3-settle-consume.json' }))
    return
  }

  // --- EXECUTE ---
  const alreadyF3 =
    getAddress(aacBefore) === getAddress(SETTLER_IMPL_F3) &&
    getAddress(consumeBefore) === getAddress(CONSUME_IMPL_F3) &&
    getAddress(viewsBefore.consumeGateway) === getAddress(AAC_PROXY)
  const skipUpgrade = SMOKE_ONLY || alreadyF3

  let consumeDeploy = { address: CONSUME_IMPL_F3, txHash: null }
  let consumeUpgradeTx = { hash: null }
  let consumeImplAfter = consumeBefore
  let gwTx = { hash: null }
  let settlerDeploy = { address: SETTLER_IMPL_F3, txHash: null }
  let aacUpgrade = { txHash: null, implAfter: aacBefore }
  let notGw = false

  const consumeWrite = new Contract(CONSUME_PROXY, CONSUME_ABI, ownerWallet)

  if (skipUpgrade) {
    console.log(
      JSON.stringify({
        phase: 'skip_upgrade',
        reason: SMOKE_ONLY ? 'PHASE_F3_SMOKE_ONLY=1' : 'already_on_F3_impls',
        aacImpl: aacBefore,
        consumeImpl: consumeBefore,
        gateway: viewsBefore.consumeGateway,
      }),
    )
    consumeImplAfter = await readImpl(provider, CONSUME_PROXY)
    const aacImplLive = await readImpl(provider, AAC_PROXY)
    aacUpgrade = { txHash: null, implAfter: aacImplLive }
    consumeDeploy = { address: consumeImplAfter, txHash: null }
    settlerDeploy = { address: aacImplLive, txHash: null }
  } else {
    console.log('[F3] deploy ConsumeOnce impl + upgrade…')
    consumeDeploy = await deployImpl(consumeCompiled.art, ownerWallet, 'consume')
    consumeUpgradeTx = await consumeWrite.upgradeToAndCall(consumeDeploy.address, '0x')
    const consumeUpgradeRc = await consumeUpgradeTx.wait()
    if (consumeUpgradeRc.status !== 1) throw new Error(`ConsumeOnce upgrade failed ${consumeUpgradeTx.hash}`)
    consumeImplAfter = await readImpl(provider, CONSUME_PROXY)
    if (getAddress(consumeImplAfter) !== getAddress(consumeDeploy.address)) {
      throw new Error(`ConsumeOnce slot mismatch ${consumeImplAfter}`)
    }
    console.log(
      JSON.stringify({
        phase: 'consume_upgrade',
        tx: consumeUpgradeTx.hash,
        impl: consumeImplAfter,
        gasUsed: Number(consumeUpgradeRc.gasUsed),
      }),
    )

    console.log('[F3] setGateway(AAC)…')
    gwTx = await consumeWrite.setGateway(AAC_PROXY)
    const gwRc = await gwTx.wait()
    if (gwRc.status !== 1) throw new Error(`setGateway failed ${gwTx.hash}`)
    const gatewayAfter = await consumeRead.gateway()
    if (getAddress(gatewayAfter) !== getAddress(AAC_PROXY)) {
      throw new Error(`gateway not AAC: ${gatewayAfter}`)
    }
    console.log(JSON.stringify({ phase: 'set_gateway', tx: gwTx.hash, gateway: gatewayAfter }))

    console.log('[F3] deploy Settler F3 + AAC upgradeTo…')
    settlerDeploy = await deployImpl(settlerCompiled.art, ownerWallet, 'settler')
    aacUpgrade = await upgradeProxy(ownerWallet, AAC_PROXY, settlerDeploy.address, 'aac')
  }

  // Direct consumeFromSettler from non-AAC must NotGateway
  try {
    await consumeWrite.consumeFromSettler.staticCall(id('x'), id('h'), id('r'), id('l'), 1, 1n, OK_EFFECT)
  } catch (e) {
    notGw = /NotGateway|reverted/i.test(String(e.shortMessage || e.message || e))
  }
  if (!notGw) throw new Error('consumeFromSettler must reject non-gateway caller')

  const aacAfter = new Contract(AAC_PROXY, [...AAC_ABI, ...settlerCompiled.art.abi.filter((x) => x.type === 'function')], provider)
  const viewsAfter = {
    owner: await aacAfter.owner(),
    custodyOpen: await aacAfter.custodyOpen(),
    headerFinal: await aacAfter.headerFinal(),
    proofLink: await aacAfter.proofLink(),
    COVER: await aacAfter.COVER(),
    CONET_INCLUSION: await aacAfter.CONET_INCLUSION(),
    CONSUME: await aacAfter.CONSUME(),
    consumeGateway: await consumeRead.gateway(),
  }
  if (
    getAddress(viewsAfter.owner) !== getAddress(OWNER) ||
    viewsAfter.custodyOpen !== false ||
    viewsAfter.headerFinal !== false ||
    getAddress(viewsAfter.proofLink) !== getAddress(PROOF_LINK) ||
    getAddress(viewsAfter.COVER) !== getAddress(COVER) ||
    getAddress(viewsAfter.CONET_INCLUSION) !== getAddress(INCLUSION) ||
    getAddress(viewsAfter.CONSUME) !== getAddress(CONSUME_PROXY) ||
    getAddress(viewsAfter.consumeGateway) !== getAddress(AAC_PROXY)
  ) {
    throw new Error(`views drifted: ${JSON.stringify(viewsAfter)}`)
  }

  // No-arg settle still closed
  let settleClosed = false
  try {
    await new Contract(AAC_PROXY, ['function settle()'], provider).settle.staticCall()
  } catch (e) {
    const err = e.data || e.shortMessage || e.message || String(e)
    settleClosed = String(err).includes('61839255') || /reverted/i.test(String(err))
  }
  if (!settleClosed) throw new Error('no-arg settle must remain closed')

  const settlerIface = new Interface(settlerCompiled.art.abi)

  // --- Smoke 1: RevertEffect → EffectFailed, unconsumed ---
  console.log('[F3] smoke RevertEffect…')
  const revertData = await coverSettleCalldata(provider, settleSel, REVERT_EFFECT)
  let revertFailed = false
  let revertError = ''
  let opIdProbe = null
  let revertTxHash = null
  try {
    const revertTx = await ownerWallet.sendTransaction({ to: AAC_PROXY, data: revertData, gasLimit: 16_000_000n })
    revertTxHash = revertTx.hash
    const revertRc = await revertTx.wait()
    if (revertRc.status === 0) {
      revertFailed = true
      revertError = 'receipt status=0 (EffectFailed expected)'
    }
  } catch (e) {
    revertFailed = true
    revertError = e.shortMessage || e.message || String(e)
  }
  if (!revertFailed) throw new Error('RevertEffect settle must fail')

  // Derive expected opId by calling COVER.cover static via eth_call with cover selector rebuild
  // Use settler staticCall with OkEffect to get return values without consuming… can't — would need eth_call
  // Decode: call AAC settle staticCall with OkEffect — if opId already unconsumed, staticCall succeeds and returns opId
  let staticOk
  try {
    const okData = await coverSettleCalldata(provider, settleSel, OK_EFFECT)
    staticOk = await provider.call({ to: AAC_PROXY, data: okData, from: ownerWallet.address })
  } catch (e) {
    throw new Error(`static settle OkEffect probe failed after Revert: ${e.shortMessage || e.message}`)
  }
  const settleFragExec = settleCoverFragment(settlerIface)
  const decoded = settlerIface.decodeFunctionResult(settleFragExec, staticOk)
  opIdProbe = decoded[0]
  const amountProbe = decoded[1]
  const consumedAfterRevert = await consumeRead.isConsumed(opIdProbe)
  if (consumedAfterRevert) throw new Error(`RevertEffect left consumed mark on ${opIdProbe}`)
  console.log(
    JSON.stringify({
      phase: 'smoke_revert',
      opId: opIdProbe,
      amount: amountProbe.toString(),
      leftUnconsumed: true,
      error: revertError.slice(0, 160),
    }),
  )

  // --- Smoke 2: OkEffect → consume ---
  console.log('[F3] smoke OkEffect…')
  const okData = await coverSettleCalldata(provider, settleSel, OK_EFFECT)
  const okTx = await ownerWallet.sendTransaction({ to: AAC_PROXY, data: okData, gasLimit: 16_000_000n })
  const okRc = await okTx.wait()
  if (okRc.status !== 1) throw new Error(`OkEffect settle failed ${okTx.hash}`)
  const settledOpId = parseSettledOpId(okRc, settlerIface) || opIdProbe
  const consumedOk = await consumeRead.isConsumed(settledOpId)
  const mintedOk = await consumeRead.mintedOf(settledOpId)
  if (!consumedOk || mintedOk === 0n) {
    throw new Error(`OkEffect did not consume/mint: consumed=${consumedOk} minted=${mintedOk}`)
  }
  console.log(
    JSON.stringify({
      phase: 'smoke_ok',
      tx: okTx.hash,
      opId: settledOpId,
      minted: mintedOk.toString(),
      gasUsed: Number(okRc.gasUsed),
    }),
  )

  // --- Smoke 3: double OkEffect → AlreadyConsumed ---
  console.log('[F3] smoke AlreadyConsumed…')
  let doubleReverted = false
  let doubleError = ''
  try {
    await ownerWallet.sendTransaction({ to: AAC_PROXY, data: okData, gasLimit: 16_000_000n }).then((tx) => tx.wait())
  } catch (e) {
    doubleReverted = true
    doubleError = e.shortMessage || e.message || String(e)
  }
  if (!doubleReverted) throw new Error('second OkEffect settle must revert AlreadyConsumed')
  console.log(JSON.stringify({ phase: 'smoke_double', reverted: true, error: doubleError.slice(0, 160) }))

  // Binding sanity (documented formula)
  const header = keccak256(solidityPacked(['bytes32', 'uint8'], [settledOpId, 1]))
  const root = keccak256(solidityPacked(['bytes32', 'uint8'], [settledOpId, 2]))

  const snap = {
    phase: 'F3',
    status: 'EXECUTED',
    executedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    skipUpgrade,
    aacProxy: AAC_PROXY,
    consumeProxy: CONSUME_PROXY,
    settlerImpl: settlerDeploy.address,
    consumeImpl: consumeDeploy.address,
    aacImplBefore: aacBefore,
    aacImplAfter: aacUpgrade.implAfter,
    consumeImplBefore: consumeBefore,
    consumeImplAfter,
    settleSelector: settleSel,
    okEffect: OK_EFFECT,
    revertEffect: REVERT_EFFECT,
    smoke: {
      settleClosed,
      notGatewayRejected: notGw,
      revertEffectFailed: revertFailed,
      revertTx: revertTxHash,
      revertLeftUnconsumed: !consumedAfterRevert,
      revertError: revertError.slice(0, 200),
      okTx: okTx.hash,
      okGasUsed: Number(okRc.gasUsed),
      operationId: settledOpId,
      amount: amountProbe.toString(),
      minted: mintedOk.toString(),
      doubleReverted,
      doubleError: doubleError.slice(0, 200),
      binding: { header, root, leaf: settledOpId },
    },
    views: viewsAfter,
    transactions: {
      consumeImpl: consumeDeploy.txHash,
      consumeUpgrade: consumeUpgradeTx.hash,
      setGateway: gwTx.hash,
      settlerImpl: settlerDeploy.txHash,
      aacUpgrade: aacUpgrade.txHash,
      settleRevert: revertTxHash,
      settleOk: okTx.hash,
    },
    priorUpgradeNote: skipUpgrade
      ? 'Upgrades already live from first F3 EXECUTE; this run is smoke + EXECUTED artifact only (coverSettleCalldata re-encode fix).'
      : null,
    standardJson: {
      consume: 'deployments/base-AacProductionConsumeOnce-F3-standard-input.json',
      settler: 'deployments/base-AacProductionCustodyGateSettler-F3-standard-input.json',
    },
    meaning:
      'F3: settle/settleBridge/settleFromConet prove COVER/Inclusion then call ConsumeOnce.consumeFromSettler in the same tx (effect last arg). Gateway=AAC. No double cover. Settled emits only after consume. GB.admins(AAC) still false — mark only until F5.',
    ok: true,
  }
  writeFileSync(join(ROOT, 'deployments/phase-F3-settle-consume.json'), JSON.stringify(snap, null, 2) + '\n')

  // Mirror consume + settler deploy JSON
  const consumeSnapPath = join(ROOT, 'deployments/base-AacProductionConsumeOnce.json')
  if (existsSync(consumeSnapPath)) {
    const prev = JSON.parse(readFileSync(consumeSnapPath, 'utf8'))
    prev.implementation = consumeDeploy.address
    prev.previousImplementation = consumeBefore
    prev.gateway = AAC_PROXY
    prev.f3 = true
    if (consumeUpgradeTx.hash) prev.upgradeTx = consumeUpgradeTx.hash
    if (gwTx.hash) prev.setGatewayTx = gwTx.hash
    prev.smokeOkTx = okTx.hash
    writeFileSync(consumeSnapPath, JSON.stringify(prev, null, 2) + '\n')
  }
  const settlerSnapPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettler.json')
  if (existsSync(settlerSnapPath)) {
    const prev = JSON.parse(readFileSync(settlerSnapPath, 'utf8'))
    prev.implementation = settlerDeploy.address
    prev.previousImplementation = aacBefore
    prev.consume = CONSUME_PROXY
    prev.f3 = true
    if (aacUpgrade.txHash) prev.upgradeTx = aacUpgrade.txHash
    prev.smokeOkTx = okTx.hash
    prev.meaning = snap.meaning
    writeFileSync(settlerSnapPath, JSON.stringify(prev, null, 2) + '\n')
  }

  console.log(JSON.stringify({ phase: 'executed', path: 'deployments/phase-F3-settle-consume.json', ok: true }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
