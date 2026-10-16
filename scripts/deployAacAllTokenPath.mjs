/**
 * AAC all-token path, inside the existing upgrade window:
 * - Treasury: miner completion removed, completeFromAac added, source initiates stay closed
 * - Base settler F7c scheduled (resets the 48h clock to now + 2 days)
 * - CoNET effect shell is the treasury executor; its settler stays unset
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO = resolve(ROOT, '../..')
const { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } = createRequire(
  join(REPO, 'package.json'),
)('ethers')

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const GB = '0xC3EF02DaE632b4C10abB66e07d92a387c10838D8'
const CHAINS = [
  { name: 'base', url: 'https://base-rpc.conet.network', chainId: 8453 },
  { name: 'conet', url: 'https://rpc1.conet.network', chainId: 224422 },
]

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  for (const list of [raw.settle_contractAdmin, raw.beamio_Admins]) {
    if (!Array.isArray(list)) continue
    for (const key of list) {
      if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`
    }
  }
  throw new Error('no admin key')
}

function readText(name) {
  return readFileSync(join(ROOT, 'contracts', name), 'utf8')
}

function solc(sources, outName) {
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'storageLayout'] },
      },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(join(ROOT, 'deployments', outName), JSON.stringify(input))
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const errors = (out.errors || []).filter((item) => item.severity === 'error')
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage || item.message).join('\n'))
  return out
}

function compileSettler() {
  const names = [
    'AacProductionCustodyGateSettlerF7c.sol',
    'AacProductionCustodyGateSettlerF5.sol',
    'AacProductionCustodyGateBridge.sol',
    'AacProductionCustodyGateBeacon.sol',
  ]
  const sources = {}
  for (const name of names) sources[`contracts/${name}`] = { content: readText(name) }
  const out = solc(sources, 'base-AacProductionCustodyGateSettlerF7c-standard-input.json')
  const art = out.contracts['contracts/AacProductionCustodyGateSettlerF7c.sol'].AacProductionCustodyGateSettlerF7c
  const slots = Object.fromEntries(art.storageLayout.storage.map((item) => [item.label, item.slot]))
  const expected = {
    canaryMintDone: '49',
    canaryUsedAacId: '50',
    canaryRecipient: '51',
    canaryAmountMinted: '52',
    pendingImplementation: '53',
    upgradeReadyAt: '54',
    pendingOwner: '55',
  }
  for (const [label, slot] of Object.entries(expected)) {
    if (slots[label] !== slot) throw new Error(`${label} slot ${slots[label]} expected ${slot}`)
  }
  console.log('F7c storage ok')
  return art
}

function treasuryArtifact() {
  const json = JSON.parse(
    readFileSync(join(REPO, 'artifacts/src/b-unit/TreasuryBridgeV3.sol/TreasuryBridgeV3.json'), 'utf8'),
  )
  const bytecode = typeof json.bytecode === 'string' ? json.bytecode : json.bytecode.object
  const deployed = typeof json.deployedBytecode === 'string' ? json.deployedBytecode : json.deployedBytecode.object
  const bytes = deployed.length / 2
  if (bytes > 24576) throw new Error(`treasury runtime ${bytes}`)
  console.log('treasury runtime', bytes)
  return { abi: json.abi, bytecode }
}

async function deploy(factory, args) {
  const contract = await factory.deploy(...args)
  const receipt = await contract.deploymentTransaction().wait()
  return { address: getAddress(await contract.getAddress()), tx: receipt.hash, block: receipt.blockNumber }
}

async function main() {
  const key = loadOwnerKey()
  const settlerArt = compileSettler()
  const effectOut = solc(
    { 'contracts/AacBridgeEffect.sol': { content: readText('AacBridgeEffect.sol') } },
    'base-AacBridgeEffect-standard-input.json',
  )
  const effectArt = effectOut.contracts['contracts/AacBridgeEffect.sol'].AacBridgeEffect
  const chainOut = solc(
    { 'contracts/AacChainEffect.sol': { content: readText('AacChainEffect.sol') } },
    'conet-AacChainEffect-standard-input.json',
  )
  const chainArt = chainOut.contracts['contracts/AacChainEffect.sol'].AacChainEffect
  const treasuryArt = treasuryArtifact()
  const report = { chains: {} }

  const base = new JsonRpcProvider(CHAINS[0].url, CHAINS[0].chainId)
  const baseWallet = new Wallet(key, base)
  const effect = await deploy(new ContractFactory(effectArt.abi, '0x' + effectArt.evm.bytecode.object, baseWallet), [])
  console.log('effect', effect.address)
  const settler = await deploy(
    new ContractFactory(settlerArt.abi, '0x' + settlerArt.evm.bytecode.object, baseWallet),
    [effect.address],
  )
  console.log('settler', settler.address)

  const aac = new Contract(AAC, ['function scheduleUpgrade(address)', 'function upgradeReadyAt() view returns (uint256)', 'function pendingImplementation() view returns (address)', 'function custodyOpen() view returns (bool)'], baseWallet)
  const scheduled = await aac.scheduleUpgrade(settler.address)
  const scheduleRcpt = await scheduled.wait()
  const readyAt = await aac.upgradeReadyAt()
  const pending = await aac.pendingImplementation()
  if (pending.toLowerCase() !== settler.address.toLowerCase()) throw new Error('pending mismatch')
  if (await aac.custodyOpen()) throw new Error('custody opened')
  report.baseSettler = { ...settler, effect: effect.address, scheduleTx: scheduleRcpt.hash, upgradeReadyAt: readyAt.toString(), upgradeReadyAtIso: new Date(Number(readyAt) * 1000).toISOString() }

  for (const chain of CHAINS) {
    const provider = new JsonRpcProvider(chain.url, chain.chainId)
    const wallet = new Wallet(key, provider)
    let executor = AAC
    let chainEffect = null
    if (chain.name === 'conet') {
      chainEffect = await deploy(new ContractFactory(chainArt.abi, '0x' + chainArt.evm.bytecode.object, wallet), [TREASURY, GB])
      executor = chainEffect.address
      console.log('conet effect', executor)
    }
    const factory = new ContractFactory(treasuryArt.abi, treasuryArt.bytecode, wallet)
    const impl = await deploy(factory, [])
    const proxy = new Contract(TREASURY, ['function upgradeToAndCall(address,bytes)', 'function aacExecutor() view returns (address)', 'function voteBridgeClosed() view returns (bool)', 'function sourceInitiateOpen() view returns (bool)', 'function developerFxIssuer() view returns (address)'], wallet)
    const data = new Contract(TREASURY, treasuryArt.abi).interface.encodeFunctionData('setAacExecutor', [executor])
    const up = await proxy.upgradeToAndCall(impl.address, data)
    const upRcpt = await up.wait()
    const closed = await proxy.voteBridgeClosed()
    const initiate = await proxy.sourceInitiateOpen()
    const exec = await proxy.aacExecutor()
    if (!closed || initiate) throw new Error(`${chain.name} flag mismatch closed=${closed} initiate=${initiate}`)
    if (exec.toLowerCase() !== executor.toLowerCase()) throw new Error(`${chain.name} executor ${exec}`)
    report.chains[chain.name] = {
      treasuryImpl: impl.address,
      treasuryDeployTx: impl.tx,
      upgradeTx: upRcpt.hash,
      aacExecutor: exec,
      voteBridgeClosed: closed,
      sourceInitiateOpen: initiate,
      chainEffect,
    }
    console.log(chain.name, 'treasury', impl.address, 'executor', exec)
  }

  const out = join(ROOT, 'deployments', 'phase-aac-all-token.json')
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
