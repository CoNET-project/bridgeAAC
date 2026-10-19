/**
 * Open Base (8453) as an AAC source destination. Any later chain is the same
 * owner setter — this upgrade does not hard-code the allowlist.
 * Does not call scheduleUpgrade. Does not set sourceInitiateOpen.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO = resolve(ROOT, '../..')
const { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } = createRequire(
  join(REPO, 'package.json'),
)('ethers')

const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const BASE_CHAIN = 8453n
const CONET_CHAIN = 224422n
const F7C = '0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44'
const READY_AT = 1792243541n
const CHAINS = [
  { name: 'base', url: 'https://base-rpc.conet.network', chainId: 8453, executor: AAC },
  { name: 'conet', url: 'https://rpc1.conet.network', chainId: 224422, executor: EFFECT },
]

const treasuryAbi = [
  'function upgradeToAndCall(address,bytes)',
  'function setAacDestinationOpen(uint256,bool)',
  'function aacDestinationOpen(uint256) view returns (bool)',
  'function aacExecutor() view returns (address)',
  'function voteBridgeClosed() view returns (bool)',
  'function sourceInitiateOpen() view returns (bool)',
  'function developerFxIssuer() view returns (address)',
]
const aacAbi = [
  'function pendingImplementation() view returns (address)',
  'function upgradeReadyAt() view returns (uint256)',
  'function custodyOpen() view returns (bool)',
]

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  for (const list of [raw.settle_contractAdmin, raw.beamio_Admins]) {
    if (!Array.isArray(list)) continue
    for (const key of list) {
      if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`
    }
  }
  throw new Error('no admin key')
}

function treasuryArtifact() {
  const json = JSON.parse(
    readFileSync(join(REPO, 'artifacts/src/b-unit/TreasuryBridgeV3.sol/TreasuryBridgeV3.json'), 'utf8'),
  )
  const bytecode = typeof json.bytecode === 'string' ? json.bytecode : json.bytecode.object
  const deployed = typeof json.deployedBytecode === 'string' ? json.deployedBytecode : json.deployedBytecode.object
  const bytes = (deployed.startsWith('0x') ? deployed.length - 2 : deployed.length) / 2
  if (bytes > 24576) throw new Error(`treasury runtime ${bytes}`)
  const infoId = json.buildInfoId
  const layout = JSON.parse(
    readFileSync(join(REPO, 'artifacts/build-info', `${infoId}.output.json`), 'utf8'),
  )
  const storage = layout.output.contracts['project/src/b-unit/TreasuryBridgeV3.sol'].TreasuryBridgeV3.storageLayout.storage
  const slot = Object.fromEntries(storage.map((item) => [item.label, `${item.slot}:${item.offset}`]))
  const expected = {
    developerFxIssuer: '21:0',
    voteBridgeClosed: '21:20',
    sourceInitiateOpen: '21:21',
    aacExecutor: '22:0',
    aacDestinationOpen: '23:0',
  }
  for (const [label, value] of Object.entries(expected)) {
    if (slot[label] !== value) throw new Error(`${label} ${slot[label]} expected ${value}`)
  }
  console.log('treasury runtime', bytes, 'destination slot 23')
  return { abi: json.abi, bytecode }
}

async function main() {
  const baseRead = new JsonRpcProvider(CHAINS[0].url, CHAINS[0].chainId)
  const aac = new Contract(AAC, aacAbi, baseRead)
  const pending = await aac.pendingImplementation()
  const ready = await aac.upgradeReadyAt()
  const custody = await aac.custodyOpen()
  if (pending.toLowerCase() !== F7C.toLowerCase()) throw new Error(`pending ${pending}`)
  if (ready !== READY_AT) throw new Error(`upgradeReadyAt ${ready}`)
  if (custody) throw new Error('custody open')
  console.log('schedule frozen', pending, ready.toString())

  const key = loadOwnerKey()
  const art = treasuryArtifact()
  const report = { chains: {}, note: 'aacDestinationOpen[8453]=true; other chains stay closed; sourceInitiateOpen unchanged' }

  for (const chain of CHAINS) {
    const provider = new JsonRpcProvider(chain.url, chain.chainId)
    const wallet = new Wallet(key, provider)
    if ((await wallet.getAddress()).toLowerCase() !== OWNER.toLowerCase()) throw new Error('signer is not owner')
    const before = new Contract(TREASURY, treasuryAbi, provider)
    const issuerBefore = await before.developerFxIssuer()
    const executorBefore = await before.aacExecutor()
    if (executorBefore.toLowerCase() !== chain.executor.toLowerCase()) {
      throw new Error(`${chain.name} executor ${executorBefore}`)
    }
    const factory = new ContractFactory(art.abi, art.bytecode, wallet)
    const impl = await factory.deploy()
    const implRcpt = await impl.deploymentTransaction().wait()
    const implAddress = getAddress(await impl.getAddress())
    const proxy = new Contract(TREASURY, treasuryAbi, wallet)
    const data = proxy.interface.encodeFunctionData('setAacDestinationOpen', [BASE_CHAIN, true])
    const up = await proxy.upgradeToAndCall(implAddress, data)
    const upRcpt = await up.wait()
    const closed = await proxy.voteBridgeClosed()
    const initiate = await proxy.sourceInitiateOpen()
    const executor = await proxy.aacExecutor()
    const baseOpen = await proxy.aacDestinationOpen(BASE_CHAIN)
    const conetOpen = await proxy.aacDestinationOpen(CONET_CHAIN)
    const issuer = await proxy.developerFxIssuer()
    if (!closed || initiate) throw new Error(`${chain.name} flags closed=${closed} initiate=${initiate}`)
    if (executor.toLowerCase() !== chain.executor.toLowerCase()) throw new Error(`${chain.name} executor moved`)
    if (!baseOpen || conetOpen) throw new Error(`${chain.name} destination base=${baseOpen} conet=${conetOpen}`)
    if (issuer.toLowerCase() !== issuerBefore.toLowerCase()) throw new Error(`${chain.name} issuer moved`)
    report.chains[chain.name] = {
      treasuryImpl: implAddress,
      treasuryDeployTx: implRcpt.hash,
      upgradeTx: upRcpt.hash,
      aacExecutor: executor,
      voteBridgeClosed: closed,
      sourceInitiateOpen: initiate,
      baseDestinationOpen: baseOpen,
      conetDestinationOpen: conetOpen,
    }
    console.log(chain.name, implAddress, upRcpt.hash)
  }

  const out = join(ROOT, 'deployments', 'phase-aac-destination-base.json')
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  const addressesPath = join(REPO, 'deployments', 'conet-addresses.json')
  const addresses = JSON.parse(readFileSync(addressesPath, 'utf8'))
  addresses.TreasuryBridgeV3Impl = report.chains.conet.treasuryImpl
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
