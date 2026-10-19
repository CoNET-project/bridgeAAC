/**
 * At upgradeReadyAt, install the already scheduled SettlerF7c and restore the
 * Phase C canary record. Refuses to broadcast before that timestamp.
 * Does not call scheduleUpgrade. Does not change sourceInitiateOpen.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO = resolve(ROOT, '../..')
const { Contract, Interface, JsonRpcProvider, Wallet, id } = createRequire(join(REPO, 'package.json'))('ethers')

const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const F7C = '0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44'
const READY_AT = 1792243541n
const CANARY_ID = '0x166dca2560308688f371222e4b7ef51ed2ae1ac427671ec95b537314d547da56'
const CANARY_AMOUNT = 10_000_000n
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

const aacAbi = [
  'function pendingImplementation() view returns (address)',
  'function upgradeReadyAt() view returns (uint256)',
  'function custodyOpen() view returns (bool)',
  'function headerFinal() view returns (bool)',
  'function upgradeTo(address)',
  'function repairCanaryRecord()',
  'function canaryRecord() view returns (bytes32 aacId, address to, uint256 amount, bool done)',
  'function voteBridgeOperation(bytes32,uint8,address,address,address,address,bytes32,uint256,uint256,bytes32,uint256,address,bytes)',
  'function executeMint(bytes32,address,address,address[],uint256[],uint256,uint256,bytes32,uint256,address)',
  'function executeRelease(bytes32,address,address,address[],uint256[],uint256,uint256,bytes32,uint256)',
]
const treasuryAbi = [
  'function voteBridgeClosed() view returns (bool)',
  'function sourceInitiateOpen() view returns (bool)',
  'function aacExecutor() view returns (address)',
  'function aacDestinationOpen(uint256) view returns (bool)',
  'function voteBridgeOperation(bytes32,uint8,address,address,address,address,bytes32,uint256,uint256,bytes32,uint256,address,bytes)',
  'function executeMint(bytes32,address,address,address[],uint256[],uint256,uint256,bytes32,uint256,address)',
  'function executeRelease(bytes32,address,address,address[],uint256[],uint256,uint256,bytes32,uint256)',
]
const effectAbi = ['function settler() view returns (address)']

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

function selector(signature) {
  return id(signature).slice(0, 10)
}

async function expectVoteClosed(url, label) {
  const abi = new Interface([
    'function voteBridgeOperation(bytes32,uint256,uint256,address,address,address,address[],uint256[],uint8,uint256,uint256,bytes32,uint256,address)',
    'function executeMint(bytes32,uint256,uint256,address,address,address,address[],uint256[],uint8,uint256,uint256,bytes32,uint256,address,bytes[])',
    'function executeRelease(bytes32,uint256,uint256,address,address,address,address[],uint256[],uint256,uint256,bytes32,uint256,bytes[])',
  ])
  const z = '0x' + '00'.repeat(32)
  const addr = '0x0000000000000000000000000000000000000001'
  const calls = [
    ['voteBridgeOperation', [z, 0, 0, addr, addr, addr, [addr], [1], 0, 1, 0, z, 0, addr]],
    ['executeMint', [z, 0, 0, addr, addr, addr, [addr], [1], 0, 1, 0, z, 0, addr, []]],
    ['executeRelease', [z, 0, 0, addr, addr, addr, [addr], [1], 1, 0, z, 0, []]],
  ]
  const closed = selector('VoteBridgeClosed()').slice(2)
  for (const [name, args] of calls) {
    const data = abi.encodeFunctionData(name, args)
    const raw = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: TREASURY, data }, 'latest'],
      }),
    }).then((res) => res.json())
    const blob = JSON.stringify(raw).toLowerCase()
    if (!blob.includes(closed)) throw new Error(`${label} ${name} is not VoteBridgeClosed`)
  }
}

async function main() {
  const broadcast = process.argv.includes('--broadcast')
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const block = await base.getBlock('latest')
  const now = BigInt(block.timestamp)
  const aacRead = new Contract(AAC, aacAbi, base)
  const pending = await aacRead.pendingImplementation()
  const ready = await aacRead.upgradeReadyAt()
  if (pending.toLowerCase() !== F7C.toLowerCase() && ready !== 0n) {
    throw new Error(`schedule drifted pending=${pending} ready=${ready}`)
  }
  await expectVoteClosed('https://base-rpc.conet.network', 'base')
  await expectVoteClosed('https://rpc1.conet.network', 'conet')
  console.log('miner entries revert VoteBridgeClosed')
  if (now < READY_AT) {
    console.log(`NOT_READY now=${now} readyAt=${READY_AT} iso=${new Date(Number(READY_AT) * 1000).toISOString()}`)
    console.log('refusing upgradeTo; scheduleUpgrade was not called')
    process.exit(2)
  }
  if (!broadcast) {
    console.log('READY but --broadcast was not passed; no transaction sent')
    process.exit(2)
  }

  const wallet = new Wallet(loadOwnerKey(), base)
  if ((await wallet.getAddress()).toLowerCase() !== OWNER.toLowerCase()) throw new Error('signer is not owner')
  const aac = new Contract(AAC, aacAbi, wallet)
  const beforeImpl = await base.getStorage(AAC, IMPL_SLOT)
  if (!beforeImpl.toLowerCase().endsWith('29e10621ff159422237d2a0b9f020303f9bddd12')) {
    const current = '0x' + beforeImpl.slice(-40)
    if (current.toLowerCase() === F7C.toLowerCase()) {
      console.log('F7c already installed; repairing canary only')
    } else {
      throw new Error(`unexpected implementation ${current}`)
    }
  } else {
    const up = await aac.upgradeTo(F7C)
    const upRcpt = await up.wait()
    console.log('upgradeTo', upRcpt.hash)
  }
  const impl = '0x' + (await base.getStorage(AAC, IMPL_SLOT)).slice(-40)
  if (impl.toLowerCase() !== F7C.toLowerCase()) throw new Error(`impl ${impl}`)
  const repair = await aac.repairCanaryRecord()
  const repairRcpt = await repair.wait()
  const record = await aac.canaryRecord()
  if (record.aacId.toLowerCase() !== CANARY_ID.toLowerCase()) throw new Error('canary id')
  if (record.to.toLowerCase() !== OWNER.toLowerCase()) throw new Error('canary recipient')
  if (record.amount !== CANARY_AMOUNT) throw new Error('canary amount')
  if (!record.done) throw new Error('canary not done')
  if (await aac.custodyOpen()) throw new Error('custody opened')
  if (await aac.headerFinal()) throw new Error('headerFinal opened')

  const baseTreasury = new Contract(TREASURY, treasuryAbi, base)
  const conetTreasury = new Contract(TREASURY, treasuryAbi, conet)
  const conetInitiate = await conetTreasury.sourceInitiateOpen()
  if (!(await baseTreasury.voteBridgeClosed()) || !(await conetTreasury.voteBridgeClosed())) {
    throw new Error('vote bridge not closed')
  }
  if ((await baseTreasury.aacExecutor()).toLowerCase() !== AAC.toLowerCase()) throw new Error('Base executor')
  if ((await conetTreasury.aacExecutor()).toLowerCase() !== EFFECT.toLowerCase()) throw new Error('CoNET executor')
  const expectedSettler = JSON.parse(
    readFileSync(join(ROOT, 'deployments/phase-conet-bls-probe.json'), 'utf8'),
  ).settler.address
  const effect = new Contract(EFFECT, effectAbi, conet)
  const settler = await effect.settler()
  if (settler.toLowerCase() !== expectedSettler.toLowerCase()) throw new Error(`settler ${settler}`)
  await expectVoteClosed('https://base-rpc.conet.network', 'base-after')
  await expectVoteClosed('https://rpc1.conet.network', 'conet-after')

  const report = {
    upgradeReadyAt: READY_AT.toString(),
    implementation: impl,
    repairTx: repairRcpt.hash,
    canaryId: record.aacId,
    canaryRecipient: record.to,
    canaryAmount: record.amount.toString(),
    custodyOpen: false,
    headerFinal: false,
    baseSourceInitiateOpen: await baseTreasury.sourceInitiateOpen(),
    conetSourceInitiateOpen: conetInitiate,
    conetSettler: settler,
  }
  writeFileSync(join(ROOT, 'deployments', 'phase-aac-f7c-installed.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
