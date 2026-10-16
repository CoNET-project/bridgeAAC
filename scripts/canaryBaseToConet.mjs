/**
 * 0.01 Base → CoNET canary. Refuses until the BLS probe is true, the CoNET
 * settler is installed, and Base source initiate is open. Wrapped CNET on
 * CoNET must be completed as mode 2 (release), never as an unbacked mint.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { Contract: EthersContract, JsonRpcProvider: EthersProvider } = createRequire(join(REPO, 'package.json'))('ethers')
const DEPLOYED = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../deployments/phase-conet-bls-probe.json'), 'utf8'),
)

const PROBE = DEPLOYED.probe.address
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const SETTLER = DEPLOYED.settler.address
const WCNET = '0x5a2D096968fC85861d8FDC7CE9A747Fe4bcb87D5'

async function main() {
  const conet = new EthersProvider('https://rpc1.conet.network', 224422)
  const base = new EthersProvider('https://base-rpc.conet.network', 8453)
  const treasuryAbi = [
    'function sourceInitiateOpen() view returns (bool)',
    'function aacDestinationOpen(uint256) view returns (bool)',
    'function voteBridgeClosed() view returns (bool)',
  ]
  const state = {
    available: await new EthersContract(PROBE, ['function available() view returns (bool)'], conet).available(),
    settler: await new EthersContract(EFFECT, ['function settler() view returns (address)'], conet).settler(),
    baseInitiate: await new EthersContract(TREASURY, treasuryAbi, base).sourceInitiateOpen(),
    baseDestConet: await new EthersContract(TREASURY, treasuryAbi, base).aacDestinationOpen(224422),
    voteClosed: await new EthersContract(TREASURY, treasuryAbi, base).voteBridgeClosed(),
    amount6: '10000',
    wcnetReleaseMode: 2,
    wcnet: WCNET,
  }
  console.log(JSON.stringify(state, null, 2))
  const blocked = []
  if (!state.available) blocked.push('BLS probe is false')
  if (state.settler.toLowerCase() !== SETTLER.toLowerCase()) blocked.push('chain effect settler is not the CoNET Base settler')
  if (!state.baseDestConet) blocked.push('Base destination 224422 is closed')
  if (!state.baseInitiate) blocked.push('Base source initiate is closed')
  if (!state.voteClosed) blocked.push('miner vote bridge is not closed')
  if (!process.argv.includes('--receipt')) blocked.push('no Base receipt in the current beacon period was supplied')
  if (blocked.length) {
    console.log('CANARY_BLOCKED')
    for (const line of blocked) console.log(`- ${line}`)
    console.log('no Base lock; wCNET completion stays mode 2 release')
    process.exit(2)
  }
  throw new Error('receipt proof broadcast is refused without a covered eth_call on CoNET')
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
