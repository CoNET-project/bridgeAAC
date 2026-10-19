/**
 * 0.01 CoNET → Base canary. Refuses until SettlerF7c is installed.
 * Never opens Base sourceInitiateOpen, never sets the CoNET settler,
 * never schedules another AAC upgrade, and never treats native CNET as an ERC-20.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '../../..')
const { Contract, JsonRpcProvider } = createRequire(join(REPO, 'package.json'))('ethers')

const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const F7C = '0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const BASE_CHAIN = 8453n
const CONET_CHAIN = 224422n
const AMOUNT = 10_000n

const treasuryAbi = [
  'function sourceInitiateOpen() view returns (bool)',
  'function aacDestinationOpen(uint256) view returns (bool)',
  'function aacExecutor() view returns (address)',
  'function voteBridgeClosed() view returns (bool)',
]
const effectAbi = ['function settler() view returns (address)']
const rootAbi = ['function period() view returns (uint256)']

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

async function main() {
  if (process.argv.includes('--broadcast')) loadOwnerKey()
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const impl = '0x' + (await base.getStorage(AAC, IMPL_SLOT)).slice(-40)
  const baseTreasury = new Contract(TREASURY, treasuryAbi, base)
  const conetTreasury = new Contract(TREASURY, treasuryAbi, conet)
  const effect = new Contract(EFFECT, effectAbi, conet)
  const root = new Contract('0xcEE3D699df3df07a573f1aFf642888B97B7aA961', rootAbi, base)
  const state = {
    implementation: impl,
    f7cInstalled: impl.toLowerCase() === F7C.toLowerCase(),
    baseSourceInitiateOpen: await baseTreasury.sourceInitiateOpen(),
    conetSourceInitiateOpen: await conetTreasury.sourceInitiateOpen(),
    baseDestinationOpen: await conetTreasury.aacDestinationOpen(BASE_CHAIN),
    conetDestinationOpen: await baseTreasury.aacDestinationOpen(CONET_CHAIN),
    baseExecutor: await baseTreasury.aacExecutor(),
    conetExecutor: await conetTreasury.aacExecutor(),
    settler: await effect.settler(),
    checkpointPeriod: (await root.period()).toString(),
    amount6: AMOUNT.toString(),
  }
  console.log(JSON.stringify(state, null, 2))
  const blocked = []
  if (!state.f7cInstalled) blocked.push('SettlerF7c is not installed')
  if (!state.baseDestinationOpen) blocked.push('CoNET source may not name Base')
  if (state.conetExecutor.toLowerCase() !== EFFECT.toLowerCase()) blocked.push('CoNET executor moved')
  if (!state.conetSourceInitiateOpen) blocked.push('CoNET source initiate stays closed until F7c is live')
  if (!process.argv.includes('--receipt')) blocked.push('no Base-period receipt was supplied')
  if (blocked.length) {
    console.log('CANARY_BLOCKED')
    for (const line of blocked) console.log(`- ${line}`)
    console.log('no CoNET lock and no CoNET sourceInitiateOpen')
    process.exit(2)
  }
  throw new Error('receipt proof assembly is not part of this window script')
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
