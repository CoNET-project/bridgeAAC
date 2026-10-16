/**
 * Deploy SettlerF7b and schedule the 48h AAC upgrade.
 * F7's timelock variables overlap the Phase C canary record (slots 49–52).
 * F7b keeps that record and starts the timelock at slot 53.
 *
 * The live upgradeTo still clears slots 49–50 when the delay elapses.
 * repairCanaryRecord() restores the known Phase C flag after that upgrade.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } = createRequire(
  resolve(ROOT, '../../package.json'),
)('ethers')

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const PAYEE = '0xA4559e916b399e3e084Fbc2be5ce04d5e3425C1E'
const EXPECTED = {
  canaryMintDone: '49',
  canaryUsedAacId: '50',
  canaryRecipient: '51',
  canaryAmountMinted: '52',
  pendingImplementation: '53',
  upgradeReadyAt: '54',
  pendingOwner: '55',
}

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const key of candidates) {
    if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`
  }
  throw new Error('no 64-hex admin key')
}

function readText(name) {
  return readFileSync(join(ROOT, 'contracts', name), 'utf8')
}

function compile() {
  const sources = {}
  for (const name of [
    'AacProductionCustodyGateSettlerF7b.sol',
    'AacProductionCustodyGateSettlerF5.sol',
    'AacProductionCustodyGateBridge.sol',
    'AacProductionCustodyGateBeacon.sol',
  ]) {
    sources[`contracts/${name}`] = { content: readText(name) }
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
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'storageLayout'] },
      },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const jsonPath = join(ROOT, 'deployments', 'base-AacProductionCustodyGateSettlerF7b-standard-input.json')
  writeFileSync(jsonPath, JSON.stringify(input))
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const errors = (out.errors || []).filter((item) => item.severity === 'error')
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage || item.message).join('\n'))
  const art = out.contracts['contracts/AacProductionCustodyGateSettlerF7b.sol'].AacProductionCustodyGateSettlerF7b
  const slots = {}
  for (const item of art.storageLayout.storage) slots[item.label] = item.slot
  for (const [label, slot] of Object.entries(EXPECTED)) {
    if (slots[label] !== slot) throw new Error(`${label} slot ${slots[label]} expected ${slot}`)
  }
  console.log('storage layout ok', JSON.stringify(EXPECTED))
  return art
}

async function main() {
  const art = compile()
  const provider = new JsonRpcProvider(RPC, 8453)
  const wallet = new Wallet(loadOwnerKey(), provider)
  if ((await wallet.getAddress()).toLowerCase() !== OWNER.toLowerCase()) throw new Error('signer is not owner')
  const proxy = new Contract(
    AAC,
    [
      'function owner() view returns (address)',
      'function scheduleUpgrade(address)',
      'function pendingImplementation() view returns (address)',
      'function upgradeReadyAt() view returns (uint256)',
      'function custodyOpen() view returns (bool)',
    ],
    wallet,
  )
  if ((await proxy.owner()).toLowerCase() !== OWNER.toLowerCase()) throw new Error('proxy owner mismatch')
  if (await proxy.custodyOpen()) throw new Error('custody already open')

  const factory = new ContractFactory(art.abi, '0x' + art.evm.bytecode.object, wallet)
  const impl = await factory.deploy(PAYEE)
  const deployRcpt = await impl.deploymentTransaction().wait()
  const implAddr = getAddress(await impl.getAddress())
  console.log('impl', implAddr, deployRcpt.hash)

  const before52 = await provider.getStorage(AAC, 52)
  const tx = await proxy.scheduleUpgrade(implAddr)
  const rcpt = await tx.wait()
  const pending = await proxy.pendingImplementation()
  const readyAt = await proxy.upgradeReadyAt()
  const after52 = await provider.getStorage(AAC, 52)
  if (pending.toLowerCase() !== implAddr.toLowerCase()) throw new Error(`pending ${pending}`)
  if (readyAt < 1_700_000_000n || readyAt > 2_000_000_000n) throw new Error(`readyAt ${readyAt}`)
  if (after52 !== before52) throw new Error('slot 52 canary amount changed')
  if (await proxy.custodyOpen()) throw new Error('custody opened')

  const report = {
    status: 'SCHEDULED',
    impl: implAddr,
    deployTx: deployRcpt.hash,
    scheduleTx: rcpt.hash,
    scheduleBlock: rcpt.blockNumber,
    upgradeReadyAt: readyAt.toString(),
    upgradeReadyAtIso: new Date(Number(readyAt) * 1000).toISOString(),
    canaryAmountSlot52: after52,
    note: 'upgradeTo is available after upgradeReadyAt. Then call repairCanaryRecord().',
  }
  writeFileSync(join(ROOT, 'deployments', 'phase-F7b-storage-fix.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
