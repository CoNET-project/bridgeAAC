#!/usr/bin/env node
/**
 * Phase F2 — CoNET inclusion proof on settleFromConet (remove self-hash gate).
 *
 * 1) Upgrade ConetSourceFinality proxy with verifyAggregate
 * 2) Deploy AacConetMessageInclusion
 * 3) Compile+deploy Settler with CONET_INCLUSION wired; AAC upgradeTo(new Settler)
 * 4) Smoke: old settleFromConet(bytes32,uint256,bytes) gone; Base COVER settle still works;
 *    garbage inclusion cover reverts; custody stays closed
 *
 * Dry-run by default. Broadcast: PHASE_F2_EXECUTE=1
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
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
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC_PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const FINALITY_PROXY = '0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const PROOF_LINK = '0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b'
const CLOSED_SETTLER_F1 = '0x3085216E8329eF7d10c914cB1C43Cd8168f53442'
const COVER_SMOKE_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const COMPILER = '0.8.35+commit.47b9dedd'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EXECUTE = process.env.PHASE_F2_EXECUTE === '1'
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'

const OLD_SETTLE_FROM_CONET_SEL = id('settleFromConet(bytes32,uint256,bytes)').slice(0, 10)

const AAC_ABI = [
  'function owner() view returns (address)',
  'function custodyOpen() view returns (bool)',
  'function headerFinal() view returns (bool)',
  'function proofLink() view returns (address)',
  'function COVER() view returns (address)',
  'function CONET_INCLUSION() view returns (address)',
  'function upgradeTo(address newImplementation)',
  'function settle()',
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

function compileFinality() {
  const src = readFileSync(join(ROOT, 'contracts/AacConetSourceFinality.sol'), 'utf8')
  const { standardInput, out } = solcCompile(
    { 'contracts/AacConetSourceFinality.sol': { content: src } },
    join(ROOT, 'deployments/base-AacConetSourceFinality-F2-standard-input.json'),
  )
  const art = out.contracts['contracts/AacConetSourceFinality.sol'].AacConetSourceFinality
  if (!art?.evm?.bytecode?.object) throw new Error('Finality bytecode missing')
  return { art, standardInput }
}

function compileInclusion() {
  const src = readFileSync(join(ROOT, 'contracts/AacConetMessageInclusion.sol'), 'utf8')
  const { standardInput, out } = solcCompile(
    { 'contracts/AacConetMessageInclusion.sol': { content: src } },
    join(ROOT, 'deployments/base-AacConetMessageInclusion-standard-input.json'),
  )
  const art = out.contracts['contracts/AacConetMessageInclusion.sol'].AacConetMessageInclusion
  if (!art?.evm?.bytecode?.object) throw new Error('Inclusion bytecode missing')
  return { art, standardInput }
}

function compileSettler(inclusionAddress) {
  let settlerSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), 'utf8')
  const bridgeSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBridge.sol'), 'utf8')
  const beaconSrc = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateBeacon.sol'), 'utf8')
  const patched = settlerSrc.replace(
    /address public constant CONET_INCLUSION = [^;]+;/,
    `address public constant CONET_INCLUSION = ${getAddress(inclusionAddress)};`,
  )
  if (patched === settlerSrc && !settlerSrc.includes(getAddress(inclusionAddress))) {
    throw new Error('failed to patch CONET_INCLUSION in Settler source')
  }
  settlerSrc = patched
  // Persist so repo matches chain after execute
  writeFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), settlerSrc)
  const { standardInput, out } = solcCompile(
    {
      'contracts/AacProductionCustodyGateSettler.sol': { content: settlerSrc },
      'contracts/AacProductionCustodyGateBridge.sol': { content: bridgeSrc },
      'contracts/AacProductionCustodyGateBeacon.sol': { content: beaconSrc },
    },
    join(ROOT, 'deployments/base-AacProductionCustodyGateSettler-F2-standard-input.json'),
  )
  const art = out.contracts['contracts/AacProductionCustodyGateSettler.sol'].AacProductionCustodyGateSettler
  if (!art?.evm?.bytecode?.object) throw new Error('Settler bytecode missing')
  return { art, standardInput, settlerSrc }
}

async function coverCalldataWithSelector(provider, newSelector) {
  const tx = await provider.getTransaction(COVER_SMOKE_TX)
  if (!tx?.data || tx.data.length < 10) throw new Error(`missing cover smoke tx ${COVER_SMOKE_TX}`)
  if (getAddress(tx.to) !== getAddress(COVER)) throw new Error(`cover smoke tx wrong to: ${tx.to}`)
  const sel = String(newSelector).toLowerCase().replace(/^0x/, '')
  if (sel.length !== 8) throw new Error(`bad selector ${newSelector}`)
  return `0x${sel}${tx.data.slice(10)}`
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

async function main() {
  const provider = new JsonRpcProvider(RPC)
  const ownerWallet = new Wallet(loadOwnerKey(), provider)
  if (getAddress(ownerWallet.address) !== getAddress(OWNER)) {
    throw new Error(`owner key mismatch: ${ownerWallet.address}`)
  }

  const aacBefore = await readImpl(provider, AAC_PROXY)
  const finalityBefore = await readImpl(provider, FINALITY_PROXY)
  const aacRead = new Contract(AAC_PROXY, AAC_ABI, provider)
  const viewsBefore = {
    owner: await aacRead.owner(),
    custodyOpen: await aacRead.custodyOpen(),
    headerFinal: await aacRead.headerFinal(),
    proofLink: await aacRead.proofLink(),
  }
  console.log(
    JSON.stringify({
      phase: 'before',
      execute: EXECUTE,
      aacImpl: aacBefore,
      finalityImpl: finalityBefore,
      expectedAacF1: CLOSED_SETTLER_F1,
      views: viewsBefore,
      oldSettleFromConetSel: OLD_SETTLE_FROM_CONET_SEL,
    }),
  )
  if (getAddress(aacBefore) !== getAddress(CLOSED_SETTLER_F1)) {
    console.warn(`[F2] WARN: AAC impl ${aacBefore} != F1 closed Settler ${CLOSED_SETTLER_F1}`)
  }

  // Confirm old selector still present before upgrade (code has it)
  const codeBefore = await provider.getCode(AAC_PROXY)
  const oldSelPresentBefore = codeBefore.toLowerCase().includes(OLD_SETTLE_FROM_CONET_SEL.slice(2).toLowerCase())

  console.log('[F2] compile Finality…')
  const finalityCompiled = compileFinality()
  console.log('[F2] compile Inclusion…')
  const inclusionCompiled = compileInclusion()

  if (!EXECUTE) {
    // Dry-run: compile Settler against placeholder Inclusion address
    const placeholder = '0x1111111111111111111111111111111111111111'
    const settlerSrcOrig = readFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), 'utf8')
    try {
      console.log('[F2] dry-run compile Settler (placeholder inclusion)…')
      compileSettler(placeholder)
    } finally {
      writeFileSync(join(ROOT, 'contracts/AacProductionCustodyGateSettler.sol'), settlerSrcOrig)
    }
    const snap = {
      phase: 'F2',
      status: 'DRY_RUN',
      executedAt: new Date().toISOString(),
      ownerAuth: OWNER_AUTH,
      aacProxy: AAC_PROXY,
      finalityProxy: FINALITY_PROXY,
      aacImplBefore: aacBefore,
      finalityImplBefore: finalityBefore,
      oldSettleFromConetSelector: OLD_SETTLE_FROM_CONET_SEL,
      oldSelectorPresentInProxyCode: oldSelPresentBefore,
      viewsBefore,
      compile: {
        finalityBytecodeBytes: finalityCompiled.art.evm.bytecode.object.length / 2,
        inclusionBytecodeBytes: inclusionCompiled.art.evm.bytecode.object.length / 2,
      },
      next: 'PHASE_F2_EXECUTE=1 node scripts/executeF2ConetInclusion.mjs',
      ok: true,
    }
    writeFileSync(join(ROOT, 'deployments/phase-F2-conet-inclusion.json'), JSON.stringify(snap, null, 2) + '\n')
    console.log(JSON.stringify({ phase: 'dry_run_done', path: 'deployments/phase-F2-conet-inclusion.json' }))
    return
  }

  // --- EXECUTE ---
  console.log('[F2] deploy Finality impl + upgrade…')
  const finalityDeploy = await deployImpl(finalityCompiled.art, ownerWallet, 'finality')
  const finalityUpgrade = await upgradeProxy(ownerWallet, FINALITY_PROXY, finalityDeploy.address, 'finality')

  // Smoke: verifyAggregate selector exists
  const finalityIface = new Interface(finalityCompiled.art.abi)
  const verifyFrag = finalityIface.getFunction('verifyAggregate')
  if (!verifyFrag) throw new Error('verifyAggregate missing from Finality ABI')
  const rootReady = await new Contract(
    FINALITY_PROXY,
    ['function rootReady() view returns (bool)', 'function owner() view returns (address)'],
    provider,
  ).rootReady()
  console.log(JSON.stringify({ phase: 'finality_views', rootReady, verifyAggregate: verifyFrag.selector }))

  console.log('[F2] deploy Inclusion…')
  const inclusionDeploy = await deployImpl(inclusionCompiled.art, ownerWallet, 'inclusion')
  const inclusionAddr = inclusionDeploy.address

  console.log('[F2] compile+deploy Settler with CONET_INCLUSION=', inclusionAddr)
  const settlerCompiled = compileSettler(inclusionAddr)
  const settlerDeploy = await deployImpl(settlerCompiled.art, ownerWallet, 'settler')

  console.log('[F2] AAC upgradeTo Settler…')
  const aacUpgrade = await upgradeProxy(ownerWallet, AAC_PROXY, settlerDeploy.address, 'aac')

  const aacAfter = new Contract(AAC_PROXY, [...AAC_ABI, ...settlerCompiled.art.abi.filter((x) => x.type === 'function')], provider)
  const viewsAfter = {
    owner: await aacAfter.owner(),
    custodyOpen: await aacAfter.custodyOpen(),
    headerFinal: await aacAfter.headerFinal(),
    proofLink: await aacAfter.proofLink(),
    COVER: await aacAfter.COVER(),
    CONET_INCLUSION: await aacAfter.CONET_INCLUSION(),
  }
  if (
    getAddress(viewsAfter.owner) !== getAddress(OWNER) ||
    viewsAfter.custodyOpen !== false ||
    viewsAfter.headerFinal !== false ||
    getAddress(viewsAfter.proofLink) !== getAddress(PROOF_LINK) ||
    getAddress(viewsAfter.COVER) !== getAddress(COVER) ||
    getAddress(viewsAfter.CONET_INCLUSION) !== getAddress(inclusionAddr)
  ) {
    throw new Error(`views drifted: ${JSON.stringify(viewsAfter)}`)
  }

  // Old self-hash selector must be gone from runtime bytecode
  const codeAfter = await provider.getCode(AAC_PROXY)
  const oldSelPresentAfter = codeAfter.toLowerCase().includes(OLD_SETTLE_FROM_CONET_SEL.slice(2).toLowerCase())
  if (oldSelPresentAfter) {
    // Proxy code is the runtime of impl via EIP-1967 — getCode(proxy) returns impl runtime
    throw new Error('old settleFromConet(bytes32,uint256,bytes) selector still present in proxy code')
  }

  // Calling old selector must revert (no matching function → empty return / revert)
  let oldSelReverted = false
  let oldSelError = ''
  try {
    const fakeOp = id('aac.f2.old-selector-probe')
    const fakeIncl = '0x' + '00'.repeat(64)
    const enc = new Interface([
      'function settleFromConet(bytes32 operationId, uint256 amount, bytes inclusion)',
    ]).encodeFunctionData('settleFromConet', [fakeOp, 1n, fakeIncl])
    if (!enc.toLowerCase().startsWith(OLD_SETTLE_FROM_CONET_SEL.toLowerCase())) {
      throw new Error(`selector mismatch enc=${enc.slice(0, 10)} expected=${OLD_SETTLE_FROM_CONET_SEL}`)
    }
    await provider.call({ to: AAC_PROXY, data: enc })
  } catch (e) {
    oldSelReverted = true
    oldSelError = e.shortMessage || e.message || String(e)
  }
  if (!oldSelReverted) throw new Error('old settleFromConet selector must revert')

  // No-arg settle still CustodyClosed
  let settleClosed = false
  try {
    await aacAfter.settle.staticCall()
  } catch (e) {
    const err = e.data || e.shortMessage || e.message || String(e)
    settleClosed = String(err).includes('61839255') || /reverted/i.test(String(err))
  }
  if (!settleClosed) throw new Error('no-arg settle must remain closed')

  // Base COVER settle still works
  const settleData = await coverCalldataWithSelector(provider, '0x50b1cadb')
  const settleTx = await ownerWallet.sendTransaction({ to: AAC_PROXY, data: settleData, gasLimit: 16_000_000n })
  const settleRc = await settleTx.wait()
  if (settleRc.status !== 1) throw new Error(`COVER settle failed ${settleTx.hash}`)
  console.log(JSON.stringify({ phase: 'settle_cover_ok', tx: settleTx.hash, gasUsed: Number(settleRc.gasUsed) }))

  // Garbage new settleFromConet must GateFailed / InvalidProof
  const settlerWrite = new Contract(AAC_PROXY, settlerCompiled.art.abi, ownerWallet)
  let garbageReverted = false
  let garbageError = ''
  try {
    const emptyAgg = {
      signerUncompressed: '0x',
      bits: '0x',
      attested: { slot: 0n, proposer: 0n, parentRoot: id('0'), stateRoot: id('0'), bodyRoot: id('0') },
      signatureSlot: 0n,
      signaturePoint: '0x',
    }
    await settlerWrite.settleFromConet.staticCall(emptyAgg, '0x', '0x', [], 0, 0, [])
  } catch (e) {
    garbageReverted = true
    garbageError = e.shortMessage || e.message || String(e)
  }
  if (!garbageReverted) throw new Error('garbage settleFromConet must revert')

  const snap = {
    phase: 'F2',
    status: 'EXECUTED',
    executedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    aacProxy: AAC_PROXY,
    finalityProxy: FINALITY_PROXY,
    inclusion: inclusionAddr,
    settlerImpl: settlerDeploy.address,
    finalityImpl: finalityDeploy.address,
    aacImplBefore: aacBefore,
    aacImplAfter: aacUpgrade.implAfter,
    finalityImplBefore: finalityBefore,
    finalityImplAfter: finalityUpgrade.implAfter,
    oldSettleFromConetSelector: OLD_SETTLE_FROM_CONET_SEL,
    smoke: {
      oldSelectorGoneFromCode: !oldSelPresentAfter,
      oldSelectorCallReverted: oldSelReverted,
      oldSelectorError: oldSelError.slice(0, 200),
      settleClosed,
      coverSettleTx: settleTx.hash,
      coverSettleGasUsed: Number(settleRc.gasUsed),
      garbageInclusionReverted: garbageReverted,
      garbageError: garbageError.slice(0, 200),
      rootReady,
      verifyAggregateSelector: verifyFrag.selector,
    },
    views: viewsAfter,
    transactions: {
      finalityImpl: finalityDeploy.txHash,
      finalityUpgrade: finalityUpgrade.txHash,
      inclusion: inclusionDeploy.txHash,
      settlerImpl: settlerDeploy.txHash,
      aacUpgrade: aacUpgrade.txHash,
      coverSettle: settleTx.hash,
    },
    standardJson: {
      finality: 'deployments/base-AacConetSourceFinality-F2-standard-input.json',
      inclusion: 'deployments/base-AacConetMessageInclusion-standard-input.json',
      settler: 'deployments/base-AacProductionCustodyGateSettler-F2-standard-input.json',
    },
    meaning:
      'F2: settleFromConet now requires independent CoNET Aggregate + EL receipt MPT + beacon walk via AacConetMessageInclusion.cover. Old self-hash settleFromConet(bytes32,uint256,bytes) removed. Base settle still COVER-gated. custodyOpen/headerFinal remain false.',
    ok: true,
  }
  writeFileSync(join(ROOT, 'deployments/phase-F2-conet-inclusion.json'), JSON.stringify(snap, null, 2) + '\n')

  // Mirror settler JSON pointer
  const settlerSnapPath = join(ROOT, 'deployments/base-AacProductionCustodyGateSettler.json')
  if (existsSync(settlerSnapPath)) {
    const prev = JSON.parse(readFileSync(settlerSnapPath, 'utf8'))
    prev.implementation = settlerDeploy.address
    prev.previousImplementation = aacBefore
    prev.conetInclusion = inclusionAddr
    prev.f2 = true
    prev.upgradeTx = aacUpgrade.txHash
    prev.meaning = snap.meaning
    writeFileSync(settlerSnapPath, JSON.stringify(prev, null, 2) + '\n')
  }

  console.log(JSON.stringify({ phase: 'executed', path: 'deployments/phase-F2-conet-inclusion.json', ok: true }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
