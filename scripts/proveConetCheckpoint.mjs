/**
 * Prove one sync aggregate for a committee already installed on the CoNET
 * checkpoint. Does not call setSettler and does not open Base source initiate.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(ROOT, '../..')
const { Contract, JsonRpcProvider, Wallet } = createRequire(join(REPO, 'package.json'))('ethers')
const CHECKPOINT = '0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a'
const RPC = 'https://rpc1.conet.network'
const abi = [
  'function period() view returns (uint256)',
  'function rootReady() view returns (bool)',
  'function compressedDigest() view returns (bytes32)',
  'function proveAggregate((bytes signerUncompressed, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes signaturePoint) input) returns (uint256 participants, bool headerFinal_)',
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

async function main() {
  const input = JSON.parse(readFileSync('/tmp/conet-proof-input.json', 'utf8'))
  const expanded = spawnSync(join(ROOT, 'target/release/expand-sync-committee'), {
    input: JSON.stringify({ pubkeys: input.pubkeys, signature: input.signature }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (expanded.status !== 0) throw new Error(expanded.stderr || 'expand failed')
  const points = JSON.parse(expanded.stdout)
  const proofInput = {
    signerUncompressed: points.signerUncompressed,
    bits: input.bits,
    attested: {
      slot: BigInt(input.attested.slot),
      proposer: BigInt(input.attested.proposer),
      parentRoot: input.attested.parentRoot,
      stateRoot: input.attested.stateRoot,
      bodyRoot: input.attested.bodyRoot,
    },
    signatureSlot: BigInt(input.signatureSlot),
    signaturePoint: points.signaturePoint,
  }
  const provider = new JsonRpcProvider(RPC, 224422)
  const checkpoint = new Contract(CHECKPOINT, abi, provider)
  const period = await checkpoint.period()
  if (period === 0n) throw new Error('committee is not installed')
  if (await checkpoint.rootReady()) throw new Error('checkpoint is already ready')
  if (proofInput.signatureSlot / 8192n !== period || proofInput.attested.slot / 8192n !== period) {
    throw new Error(`proof period does not match stored ${period}`)
  }
  const proved = await checkpoint.proveAggregate.staticCall(proofInput)
  console.log('proof call', proved[0].toString(), proved[1])
  if (!proved[1] || proved[0] * 3n < 512n * 2n) throw new Error('aggregate is below two thirds')
  const wallet = new Wallet(loadOwnerKey(), provider)
  const tx = await checkpoint.connect(wallet).proveAggregate(proofInput, { gasLimit: 16_000_000n })
  console.log('prove', tx.hash)
  await tx.wait()
  if (!(await checkpoint.rootReady())) throw new Error('rootReady stayed false')
  const report = {
    checkpoint: CHECKPOINT,
    period: (await checkpoint.period()).toString(),
    rootReady: true,
    compressedDigest: await checkpoint.compressedDigest(),
    participants: proved[0].toString(),
    attestedSlot: input.attested.slot,
    signatureSlot: input.signatureSlot,
    prove: tx.hash,
  }
  writeFileSync(join(ROOT, 'deployments/phase-conet-checkpoint-prove.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
