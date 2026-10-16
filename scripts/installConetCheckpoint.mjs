/**
 * Install one finalized Ethereum sync committee on the CoNET checkpoint,
 * then prove one aggregate in that same period. Does not call setSettler
 * and does not open Base source initiate.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(ROOT, '../..')
const { Contract, JsonRpcProvider, Wallet, keccak256, getBytes } = createRequire(join(REPO, 'package.json'))('ethers')

const CHECKPOINT = '0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a'
const BEACONS = ['https://lodestar-mainnet.chainsafe.io']
const RPC = 'https://rpc1.conet.network'
const GINDEX = 86n

const abi = [
  'function period() view returns (uint256)',
  'function rootReady() view returns (bool)',
  'function compressedDigest() view returns (bytes32)',
  'function owner() view returns (address)',
  'function install((bytes compressed, bytes aggregate, bytes32[6] branch, uint256 slot, bytes32 beaconRoot_, bytes32 stateRoot_) input)',
  'function proveAggregate((bytes signerUncompressed, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes signaturePoint) input) returns (uint256 participants, bool headerFinal_)',
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

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

function sha256(parts) {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)
  return hash.digest()
}

function hash48(hexBytes) {
  const raw = Buffer.from(hexBytes.replace(/^0x/i, ''), 'hex')
  if (raw.length !== 48) throw new Error(`expected 48 bytes, got ${raw.length}`)
  return sha256([raw, Buffer.alloc(16)])
}

function committeeLeaf(pubkeys, aggregate) {
  let level = pubkeys.map(hash48)
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) next.push(sha256([level[i], level[i + 1]]))
    level = next
  }
  return sha256([level[0], hash48(aggregate)])
}

function walk(leaf, branch) {
  let node = leaf
  let index = GINDEX
  for (const siblingHex of branch) {
    const sibling = Buffer.from(siblingHex.replace(/^0x/i, ''), 'hex')
    node = (index & 1n) === 1n ? sha256([sibling, node]) : sha256([node, sibling])
    index >>= 1n
  }
  if (index !== 1n) throw new Error('branch did not reach the root')
  return `0x${node.toString('hex')}`
}

function bootstrapBody(base, body) {
  const committee = body.data.current_sync_committee
  const header = body.data.header.beacon
  return {
    base,
    pubkeys: committee.pubkeys,
    aggregate: committee.aggregate_pubkey,
    branch: body.data.current_sync_committee_branch,
    slot: header.slot,
    proposer: header.proposer_index,
    parentRoot: header.parent_root,
    stateRoot: header.state_root,
    bodyRoot: header.body_root,
  }
}

async function bootstrapFrom(base, root) {
  return bootstrapBody(base, await getJson(`${base}/eth/v1/beacon/light_client/bootstrap/${root}`))
}

async function main() {
  const provider = new JsonRpcProvider(RPC, 224422)
  const checkpoint = new Contract(CHECKPOINT, abi, provider)
  if ((await checkpoint.period()) !== 0n) throw new Error('checkpoint period is already set')
  if (await checkpoint.rootReady()) throw new Error('checkpoint is already ready')

  const head = await getJson(`${BEACONS[0]}/eth/v1/beacon/headers/finalized`)
  const beaconRoot = head.data.root
  const samples = [await bootstrapFrom(BEACONS[0], beaconRoot)]
  console.log('observer', BEACONS[0], 'ok')
  const localRaw = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', 'peter@38.102.126.50', `curl -s -m 30 http://127.0.0.1:5052/eth/v1/beacon/light_client/bootstrap/${beaconRoot}`],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
  samples.push(bootstrapBody('lighthouse@38.102.126.50:5052', JSON.parse(localRaw)))
  console.log('observer lighthouse@38.102.126.50:5052 ok')
  const first = samples[0]
  const digest = keccak256(getBytes('0x' + first.pubkeys.map((key) => key.replace(/^0x/i, '')).join('')))
  for (const sample of samples.slice(1)) {
    const other = keccak256(getBytes('0x' + sample.pubkeys.map((key) => key.replace(/^0x/i, '')).join('')))
    if (other !== digest || sample.stateRoot !== first.stateRoot) throw new Error('observers disagree')
  }
  const leaf = committeeLeaf(first.pubkeys, first.aggregate)
  const got = walk(leaf, first.branch)
  if (got.toLowerCase() !== first.stateRoot.toLowerCase()) {
    throw new Error(`merkle ${got} != state ${first.stateRoot}`)
  }
  console.log(JSON.stringify({
    slot: first.slot,
    period: (BigInt(first.slot) / 8192n).toString(),
    beaconRoot,
    stateRoot: first.stateRoot,
    digest,
  }))

  const installInput = {
    compressed: '0x' + first.pubkeys.map((key) => key.replace(/^0x/i, '')).join(''),
    aggregate: first.aggregate,
    branch: first.branch,
    slot: BigInt(first.slot),
    beaconRoot_: beaconRoot,
    stateRoot_: first.stateRoot,
  }
  await checkpoint.install.staticCall(installInput, { from: await checkpoint.owner() })
  const wallet = new Wallet(loadOwnerKey(), provider)
  const writer = checkpoint.connect(wallet)
  const installTx = await writer.install(installInput)
  console.log('install', installTx.hash)
  await installTx.wait()
  if ((await checkpoint.period()) === 0n) throw new Error('install did not store a period')

  const block = await getJson(`${BEACONS[0]}/eth/v2/beacon/blocks/${first.slot}`)
  const message = block.data.message
  const aggregate = message.body.sync_aggregate
  const attested = await getJson(`${BEACONS[0]}/eth/v1/beacon/headers/${message.parent_root}`)
  const attestedHeader = attested.data.header.message
  if (BigInt(attestedHeader.slot) / 8192n !== BigInt(first.slot) / 8192n) {
    throw new Error('attested header is outside the installed period')
  }
  const expanded = spawnSync(
    join(ROOT, 'target/release/expand-sync-committee'),
    { input: JSON.stringify({ pubkeys: first.pubkeys, signature: aggregate.sync_committee_signature }), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (expanded.status !== 0) throw new Error(expanded.stderr || 'expand failed')
  const points = JSON.parse(expanded.stdout)
  const proofInput = {
    signerUncompressed: points.signerUncompressed,
    bits: aggregate.sync_committee_bits,
    attested: {
      slot: BigInt(attestedHeader.slot),
      proposer: BigInt(attestedHeader.proposer_index),
      parentRoot: attestedHeader.parent_root,
      stateRoot: attestedHeader.state_root,
      bodyRoot: attestedHeader.body_root,
    },
    signatureSlot: BigInt(message.slot),
    signaturePoint: points.signaturePoint,
  }
  const proved = await checkpoint.proveAggregate.staticCall(proofInput)
  console.log('proof call', proved[0].toString(), proved[1])
  if (!proved[1] || proved[0] * 3n < 512n * 2n) throw new Error('aggregate is below two thirds')
  const proofTx = await writer.proveAggregate(proofInput, { gasLimit: 16_000_000n })
  console.log('prove', proofTx.hash)
  await proofTx.wait()
  if (!(await checkpoint.rootReady())) throw new Error('rootReady stayed false')
  const report = {
    checkpoint: CHECKPOINT,
    period: (await checkpoint.period()).toString(),
    rootReady: await checkpoint.rootReady(),
    compressedDigest: await checkpoint.compressedDigest(),
    beaconRoot,
    stateRoot: first.stateRoot,
    slot: first.slot,
    install: installTx.hash,
    prove: proofTx.hash,
    participants: proved[0].toString(),
    observers: samples.map((sample) => sample.base),
  }
  writeFileSync(join(ROOT, 'deployments/phase-conet-checkpoint-install.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
