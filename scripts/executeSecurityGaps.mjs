#!/usr/bin/env node
/**
 * Close the live audit gaps that F5 left open:
 * - 48h timelock on AAC / CheckpointRoot / CoNET finality upgradeTo
 * - two-step transferOwnership (no handoff; no multisig was named)
 * - mintTo must equal the single beneficiary in the proven receipt
 *
 * Does not pause Treasury voteBridgeOperation (that would halt USDC).
 * Broadcast: SECURITY_GAP_EXECUTE=1
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
const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const ROOT_PROXY = '0xcEE3D699df3df07a573f1aFf642888B97B7aA961'
const FINALITY = '0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const COVER_SMOKE_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EXECUTE = process.env.SECURITY_GAP_EXECUTE === '1'
const OWNER_AUTH = '请同时修正安全缺口'

const COVER_ABI = [
  'function cover((bytes signerUncompressed,bytes bits,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) attested,uint256 signatureSlot,bytes signaturePoint) input,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot) finalized,bytes32[7] finalityBranch,bytes baseHeaderRlp,bytes receiptRlp,bytes[] proofNodes,uint64 receiptIndex,uint256 logIndex,(uint256 slot,uint256 proposer,bytes32 parentRoot,bytes32 stateRoot,bytes32 bodyRoot)[] beaconHeaders) returns (bytes32,uint256,bool,bool)',
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

function readText(name) {
  return readFileSync(join(ROOT, 'contracts', name), 'utf8')
}

function solcCompile(sources, outName) {
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(join(ROOT, 'deployments', outName), JSON.stringify(input))
  const r = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  const out = JSON.parse(r.stdout)
  const errs = (out.errors || []).filter((e) => e.severity === 'error')
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage || e.message).join('\n'))
  return out
}

function artOf(out, file, name) {
  const art = out.contracts[file][name]
  if (!art?.evm?.bytecode?.object) throw new Error(`missing bytecode ${name}`)
  const runtimeBytes = art.evm.deployedBytecode.object.length / 2
  if (runtimeBytes > 24576) throw new Error(`${name} runtime ${runtimeBytes} exceeds 24576`)
  return art
}

function compileAll() {
  const payeeOut = solcCompile(
    { 'contracts/AacBridgePayee.sol': { content: readText('AacBridgePayee.sol') } },
    'base-AacBridgePayee-standard-input.json',
  )
  const rootOut = solcCompile(
    {
      'contracts/AacEthereumCheckpointRootTimelock.sol': { content: readText('AacEthereumCheckpointRootTimelock.sol') },
      'contracts/AacEthereumCheckpointRoot.sol': { content: readText('AacEthereumCheckpointRoot.sol') },
    },
    'base-AacEthereumCheckpointRootTimelock-standard-input.json',
  )
  const finOut = solcCompile(
    {
      'contracts/AacConetSourceFinalityTimelock.sol': { content: readText('AacConetSourceFinalityTimelock.sol') },
      'contracts/AacConetSourceFinality.sol': { content: readText('AacConetSourceFinality.sol') },
    },
    'base-AacConetSourceFinalityTimelock-standard-input.json',
  )
  const settlerOut = solcCompile(
    {
      'contracts/AacProductionCustodyGateSettlerF7.sol': { content: readText('AacProductionCustodyGateSettlerF7.sol') },
      'contracts/AacProductionCustodyGateSettlerF5.sol': { content: readText('AacProductionCustodyGateSettlerF5.sol') },
      'contracts/AacProductionCustodyGateBridge.sol': { content: readText('AacProductionCustodyGateBridge.sol') },
      'contracts/AacProductionCustodyGateBeacon.sol': { content: readText('AacProductionCustodyGateBeacon.sol') },
    },
    'base-AacProductionCustodyGateSettlerF7-standard-input.json',
  )
  return {
    payee: artOf(payeeOut, 'contracts/AacBridgePayee.sol', 'AacBridgePayee'),
    root: artOf(rootOut, 'contracts/AacEthereumCheckpointRootTimelock.sol', 'AacEthereumCheckpointRootTimelock'),
    finality: artOf(finOut, 'contracts/AacConetSourceFinalityTimelock.sol', 'AacConetSourceFinalityTimelock'),
    settler: artOf(settlerOut, 'contracts/AacProductionCustodyGateSettlerF7.sol', 'AacProductionCustodyGateSettlerF7'),
  }
}

async function readImpl(provider, proxy) {
  const slot = await provider.getStorage(proxy, IMPL_SLOT)
  return getAddress('0x' + slot.slice(-40))
}

async function deploy(art, wallet, args, label) {
  const factory = new ContractFactory(art.abi, '0x' + art.evm.bytecode.object, wallet)
  const c = await factory.deploy(...args)
  await c.waitForDeployment()
  const tx = c.deploymentTransaction()
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label} deploy failed ${tx.hash}`)
  const address = await c.getAddress()
  console.log(JSON.stringify({ phase: `${label}_impl`, address, tx: tx.hash, gasUsed: Number(receipt.gasUsed) }))
  return { address, txHash: tx.hash }
}

async function upgrade(wallet, proxy, impl, label) {
  const writable = new Contract(proxy, ['function upgradeTo(address)'], wallet)
  const tx = await writable.upgradeTo(impl)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label} upgrade failed ${tx.hash}`)
  const after = await readImpl(wallet.provider, proxy)
  if (getAddress(after) !== getAddress(impl)) throw new Error(`${label} impl mismatch ${after}`)
  console.log(JSON.stringify({ phase: `${label}_upgrade`, tx: tx.hash, impl: after, gasUsed: Number(receipt.gasUsed) }))
  return { txHash: tx.hash, impl: after }
}

async function expectUpgradeRevert(provider, proxy, impl) {
  const data = new Interface(['function upgradeTo(address)']).encodeFunctionData('upgradeTo', [impl])
  let reverted = false
  try {
    await provider.call({ from: OWNER, to: proxy, data })
  } catch {
    reverted = true
  }
  if (!reverted) throw new Error(`upgradeTo did not revert on ${proxy}`)
}

async function main() {
  console.log('[gaps] compile…')
  const arts = compileAll()
  const base = new JsonRpcProvider(BASE_RPC)
  const before = {
    aac: await readImpl(base, AAC),
    root: await readImpl(base, ROOT_PROXY),
    finality: await readImpl(base, FINALITY),
  }
  const rootRead = new Contract(ROOT_PROXY, ['function owner() view returns (address)', 'function period() view returns (uint256)', 'function rootReady() view returns (bool)'], base)
  const finRead = new Contract(FINALITY, ['function owner() view returns (address)', 'function rootReady() view returns (bool)', 'function period() view returns (uint256)'], base)
  const aacRead = new Contract(AAC, ['function owner() view returns (address)', 'function custodyOpen() view returns (bool)', 'function headerFinal() view returns (bool)'], base)
  const views = {
    aacOwner: await aacRead.owner(),
    custodyOpen: await aacRead.custodyOpen(),
    headerFinal: await aacRead.headerFinal(),
    rootOwner: await rootRead.owner(),
    rootPeriod: (await rootRead.period()).toString(),
    rootReady: await rootRead.rootReady(),
    finalityOwner: await finRead.owner(),
    finalityPeriod: (await finRead.period()).toString(),
    finalityReady: await finRead.rootReady(),
  }
  console.log(JSON.stringify({ phase: 'before', execute: EXECUTE, before, views }))
  if (!EXECUTE) {
    const snap = {
      phase: 'security-gaps',
      status: 'DRY_RUN',
      recordedAt: new Date().toISOString(),
      ownerAuth: OWNER_AUTH,
      before,
      views,
      runtimeBytes: {
        payee: arts.payee.evm.deployedBytecode.object.length / 2,
        settlerF7: arts.settler.evm.deployedBytecode.object.length / 2,
        rootTimelock: arts.root.evm.deployedBytecode.object.length / 2,
        finalityTimelock: arts.finality.evm.deployedBytecode.object.length / 2,
      },
      next: 'SECURITY_GAP_EXECUTE=1 node scripts/executeSecurityGaps.mjs',
      ok: true,
    }
    writeFileSync(join(ROOT, 'deployments/phase-security-gaps.json'), JSON.stringify(snap, null, 2) + '\n')
    console.log(JSON.stringify({ phase: 'dry_run_done' }))
    return
  }

  const wallet = new Wallet(loadOwnerKey(), base)
  if (getAddress(wallet.address) !== getAddress(OWNER)) throw new Error(`owner mismatch ${wallet.address}`)

  const payee = await deploy(arts.payee, wallet, [], 'payee')
  const smoke = await base.getTransaction(COVER_SMOKE_TX)
  const decoded = new Interface(COVER_ABI).decodeFunctionData('cover', smoke.data)
  const payeeC = new Contract(payee.address, ['function payee(bytes,uint256) view returns (address,uint256)'], base)
  const [beneficiary, gross] = await payeeC.payee(decoded.receiptRlp, decoded.logIndex)
  if (beneficiary === '0x0000000000000000000000000000000000000000' || gross === 0n) {
    throw new Error('payee decode returned empty')
  }
  console.log(JSON.stringify({ phase: 'payee_smoke', beneficiary, gross: gross.toString() }))

  const settler = await deploy(arts.settler, wallet, [payee.address], 'settlerF7')
  const bound = await new Contract(settler.address, ['function PAYEE() view returns (address)'], base).PAYEE()
  if (getAddress(bound) !== getAddress(payee.address)) throw new Error('PAYEE immutable mismatch')

  const root = await deploy(arts.root, wallet, [], 'rootTimelock')
  const finality = await deploy(arts.finality, wallet, [], 'finalityTimelock')

  const periodBefore = views.rootPeriod
  const readyBefore = views.rootReady
  const aacUp = await upgrade(wallet, AAC, settler.address, 'aac')
  const rootUp = await upgrade(wallet, ROOT_PROXY, root.address, 'root')
  const finUp = await upgrade(wallet, FINALITY, finality.address, 'finality')

  await expectUpgradeRevert(base, AAC, settler.address)
  await expectUpgradeRevert(base, ROOT_PROXY, root.address)
  await expectUpgradeRevert(base, FINALITY, finality.address)

  const afterViews = {
    aacOwner: await aacRead.owner(),
    custodyOpen: await aacRead.custodyOpen(),
    headerFinal: await aacRead.headerFinal(),
    rootOwner: await rootRead.owner(),
    rootPeriod: (await rootRead.period()).toString(),
    rootReady: await rootRead.rootReady(),
    finalityOwner: await finRead.owner(),
    finalityPeriod: (await finRead.period()).toString(),
    finalityReady: await finRead.rootReady(),
    upgradeDelay: (await new Contract(AAC, ['function UPGRADE_DELAY() view returns (uint256)'], base).UPGRADE_DELAY()).toString(),
    payee: await new Contract(AAC, ['function PAYEE() view returns (address)'], base).PAYEE(),
  }
  if (afterViews.aacOwner.toLowerCase() !== OWNER.toLowerCase()) throw new Error('aac owner changed')
  if (afterViews.custodyOpen !== false || afterViews.headerFinal !== false) throw new Error('custody opened')
  if (afterViews.rootPeriod !== periodBefore || afterViews.rootReady !== readyBefore) throw new Error('root state drifted')
  if (afterViews.upgradeDelay !== String(2 * 24 * 60 * 60)) throw new Error('delay mismatch')

  const snap = {
    phase: 'security-gaps',
    status: 'EXECUTED',
    recordedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    upgradeDelaySeconds: 172800,
    payee: { address: payee.address, tx: payee.txHash, smokeBeneficiary: beneficiary, smokeGross: gross.toString() },
    settlerF7: { address: settler.address, tx: settler.txHash, upgradeTx: aacUp.txHash },
    rootTimelock: { address: root.address, tx: root.txHash, upgradeTx: rootUp.txHash },
    finalityTimelock: { address: finality.address, tx: finality.txHash, upgradeTx: finUp.txHash },
    before,
    afterViews,
    instantUpgradeReverts: true,
    usdcVoteBridgeOperation: 'left live — pausing it would halt USDC with no AAC release path',
    ownerStillEoa: true,
    transferOwnership: 'present, not called',
    ok: true,
  }
  writeFileSync(join(ROOT, 'deployments/phase-security-gaps.json'), JSON.stringify(snap, null, 2) + '\n')
  console.log(JSON.stringify({ phase: 'done', ok: true, aac: settler.address, beneficiary }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
