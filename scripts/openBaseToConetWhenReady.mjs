/**
 * After the BLS probe is true and a real Base receipt proof returns covered,
 * set the CoNET chain-effect settler and open only the Base source lock.
 * Refuses while the probe is false. Does not schedule an AAC upgrade.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { Contract, JsonRpcProvider, Wallet } = createRequire(join(REPO, 'package.json'))('ethers')

const DEPLOYED = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../deployments/phase-conet-bls-probe.json'), 'utf8'),
)
const PROBE = DEPLOYED.probe.address
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const SETTLER = DEPLOYED.settler.address
const CONET = 224422n

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
  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const available = await new Contract(PROBE, ['function available() view returns (bool)'], conet).available()
  const settler = await new Contract(EFFECT, ['function settler() view returns (address)'], conet).settler()
  console.log(JSON.stringify({ available, settler, plannedSettler: SETTLER }))
  if (!available) {
    console.log('NOT_READY probe available=false; refusing setSettler and Base source initiate')
    process.exit(2)
  }
  if (!process.argv.includes('--proof')) {
    console.log('NOT_READY no real Base receipt proof was supplied')
    process.exit(2)
  }
  if (!process.argv.includes('--broadcast')) {
    console.log('READY but --broadcast was not passed')
    process.exit(2)
  }
  const key = loadOwnerKey()
  const effect = new Contract(EFFECT, ['function setSettler(address)', 'function settler() view returns (address)'], new Wallet(key, conet))
  if ((await effect.settler()) === '0x0000000000000000000000000000000000000000') {
    const tx = await effect.setSettler(SETTLER)
    await tx.wait()
  }
  const treasuryAbi = [
    'function setAacDestinationOpen(uint256,bool)',
    'function setSourceInitiateOpen(bool)',
    'function aacDestinationOpen(uint256) view returns (bool)',
    'function sourceInitiateOpen() view returns (bool)',
  ]
  const baseTreasury = new Contract(TREASURY, treasuryAbi, new Wallet(key, base))
  if (!(await baseTreasury.aacDestinationOpen(CONET))) {
    const tx = await baseTreasury.setAacDestinationOpen(CONET, true)
    await tx.wait()
  }
  if (!(await baseTreasury.sourceInitiateOpen())) {
    const tx = await baseTreasury.setSourceInitiateOpen(true)
    await tx.wait()
  }
  const conetTreasury = new Contract(TREASURY, treasuryAbi, conet)
  if (await conetTreasury.sourceInitiateOpen()) throw new Error('CoNET source initiate must stay on its own window')
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
