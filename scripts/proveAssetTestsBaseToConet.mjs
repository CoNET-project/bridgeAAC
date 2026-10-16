/**
 * Cover and settle every Base → CoNET lock in phase-asset-tests-lock.json.
 * Uses the already installed settler. Does not call setSettler or scheduleUpgrade.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(ROOT, '../..')
const { Contract, FetchRequest, JsonRpcProvider, Wallet, keccak256 } = createRequire(join(REPO, 'package.json'))('ethers')

const DEPLOYED = JSON.parse(readFileSync(join(ROOT, 'deployments/phase-conet-bls-probe.json'), 'utf8'))
const LOCKS = JSON.parse(readFileSync(join(ROOT, 'deployments/phase-asset-tests-lock.json'), 'utf8'))
const COVER = DEPLOYED.cover.address
const SETTLER = DEPLOYED.settler.address
const TOPIC = '0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba'

const coverAbi = [
  'function cover((bytes signerUncompressed, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes signaturePoint) input, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) finalized, bytes32[7] finalityBranch, bytes baseHeaderRlp, bytes receiptRlp, bytes[] proofNodes, uint64 receiptIndex, uint256 logIndex, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot)[] beaconHeaders) returns (bytes32 operationId, uint256 amount, bool messageCovered, bool headerFinal)',
]
const settleAbi = [
  ...coverAbi,
  'function settle((bytes signerUncompressed, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes signaturePoint) input, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) finalized, bytes32[7] finalityBranch, bytes baseHeaderRlp, bytes receiptRlp, bytes[] proofNodes, uint64 receiptIndex, uint256 logIndex, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot)[] beaconHeaders, address mintTo) returns (bytes32, uint256)',
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

function lighthouse(path) {
  const raw = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', 'peter@38.102.126.50', `curl -s -m 25 http://127.0.0.1:5052${path}`],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  )
  return JSON.parse(raw)
}

function rlpLength(length) {
  let hex = length.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return Buffer.from(hex, 'hex')
}

function rlpBytes(buf) {
  if (buf.length === 1 && buf[0] < 0x80) return buf
  if (buf.length <= 55) return Buffer.concat([Buffer.from([0x80 + buf.length]), buf])
  const len = rlpLength(buf.length)
  return Buffer.concat([Buffer.from([0xb7 + len.length]), len, buf])
}

function rlpList(items) {
  const payload = Buffer.concat(items)
  if (payload.length <= 55) return Buffer.concat([Buffer.from([0xc0 + payload.length]), payload])
  const len = rlpLength(payload.length)
  return Buffer.concat([Buffer.from([0xf7 + len.length]), len, payload])
}

function rlpUint(value) {
  let n = BigInt(value)
  if (n === 0n) return Buffer.from([0x80])
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return rlpBytes(Buffer.from(hex, 'hex'))
}

function rlpWord(hex) {
  return rlpBytes(Buffer.from(hex.replace(/^0x/i, ''), 'hex'))
}

function headerRlp(block) {
  return rlpList([
    rlpWord(block.parentHash),
    rlpWord(block.sha3Uncles),
    rlpWord(block.miner),
    rlpWord(block.stateRoot),
    rlpWord(block.transactionsRoot),
    rlpWord(block.receiptsRoot),
    rlpWord(block.logsBloom),
    rlpUint(block.difficulty),
    rlpUint(block.number),
    rlpUint(block.gasLimit),
    rlpUint(block.gasUsed),
    rlpUint(block.timestamp),
    rlpWord(block.extraData),
    rlpWord(block.mixHash),
    rlpWord(block.nonce),
    rlpUint(block.baseFeePerGas),
    rlpWord(block.withdrawalsRoot),
    rlpUint(block.blobGasUsed),
    rlpUint(block.excessBlobGas),
    rlpWord(block.parentBeaconBlockRoot),
    rlpWord(block.requestsHash),
  ])
}

function headerOf(message) {
  return {
    slot: BigInt(message.slot),
    proposer: BigInt(message.proposer_index),
    parentRoot: message.parent_root,
    stateRoot: message.state_root,
    bodyRoot: message.body_root,
  }
}

async function waitForFinality(messageSlot) {
  for (let i = 0; i < 40; i++) {
    const update = lighthouse('/eth/v1/beacon/light_client/finality_update').data
    const finalized = BigInt(update.finalized_header.beacon.slot)
    console.log('finalized', finalized.toString(), 'need', messageSlot.toString())
    if (finalized >= messageSlot && finalized - messageSlot <= 256n) return update
    if (finalized > messageSlot + 256n) throw new Error('finalized header is more than 256 slots after the receipt')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
  }
  throw new Error('Ethereum finality did not reach the receipt beacon slot')
}

function beaconChain(finalizedRoot, messageRoot) {
  const headers = []
  let root = finalizedRoot
  for (let i = 0; i < 257; i++) {
    const body = lighthouse(`/eth/v1/beacon/headers/${root}`)
    const message = body.data.header.message
    headers.push(headerOf(message))
    if (root.toLowerCase() === messageRoot.toLowerCase()) return headers.reverse()
    root = message.parent_root
  }
  throw new Error('beacon header chain exceeded 256')
}

async function main() {
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const request = new FetchRequest('http://38.102.126.30:8889')
  request.timeout = 180_000
  const conet = new JsonRpcProvider(request, 224422, { staticNetwork: true })
  const wallet = new Wallet(loadOwnerKey(), conet)
  const cover = new Contract(COVER, coverAbi, conet)
  const settler = new Contract(SETTLER, settleAbi, wallet)
  const results = []

  let latestSlot = 0n
  const prepared = []
  for (const lock of LOCKS.locks) {
    const block = await base.send('eth_getBlockByNumber', ['0x' + Number(lock.blockNumber).toString(16), false])
    const encoded = headerRlp(block)
    if (keccak256(encoded).toLowerCase() !== block.hash.toLowerCase()) throw new Error(`${lock.name} header rlp mismatch`)
    const messageRoot = block.parentBeaconBlockRoot
    const message = lighthouse(`/eth/v1/beacon/headers/${messageRoot}`).data.header.message
    const messageSlot = BigInt(message.slot)
    if (messageSlot > latestSlot) latestSlot = messageSlot
    const exported = spawnSync(join(ROOT, 'target/release/export-receipt'), ['https://base-rpc.conet.network', lock.lock], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    if (exported.status !== 0) throw new Error(exported.stderr || `${lock.name} receipt export failed`)
    const proof = JSON.parse(exported.stdout)
    const receipt = await base.getTransactionReceipt(lock.lock)
    const logIndex = receipt.logs.findIndex((log) => log.topics[0]?.toLowerCase() === TOPIC.toLowerCase())
    if (logIndex < 0) throw new Error(`${lock.name} BridgeOperation log missing`)
    prepared.push({ lock, encoded, messageRoot, messageSlot, proof, logIndex })
  }

  const update = await waitForFinality(latestSlot)
  const finalized = headerOf(update.finalized_header.beacon)
  const attested = headerOf(update.attested_header.beacon)
  const finalizedRoot = lighthouse(`/eth/v1/beacon/headers/${finalized.slot}`).data.root
  const boot = lighthouse(`/eth/v1/beacon/light_client/bootstrap/${finalizedRoot}`)
  const expanded = spawnSync(join(ROOT, 'target/release/expand-sync-committee'), {
    input: JSON.stringify({
      pubkeys: boot.data.current_sync_committee.pubkeys,
      signature: update.sync_aggregate.sync_committee_signature,
    }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (expanded.status !== 0) throw new Error(expanded.stderr || 'expand failed')
  const points = JSON.parse(expanded.stdout)
  const aggregate = {
    signerUncompressed: points.signerUncompressed,
    bits: update.sync_aggregate.sync_committee_bits,
    attested,
    signatureSlot: BigInt(update.signature_slot),
    signaturePoint: points.signaturePoint,
  }

  for (const item of prepared) {
    const headers = beaconChain(finalizedRoot, item.messageRoot)
    const last = headers[headers.length - 1]
    if (last.slot !== finalized.slot) throw new Error(`${item.lock.name} header chain does not end at the finalized header`)
    const args = [
      aggregate,
      finalized,
      update.finality_branch,
      '0x' + item.encoded.toString('hex'),
      item.proof.receipt,
      item.proof.proof,
      BigInt(item.proof.receipt_index),
      BigInt(item.logIndex),
      headers,
    ]
    const covered = await cover.cover.staticCall(...args, { gasLimit: 50_000_000n })
    console.log(item.lock.name, 'cover', covered[0], covered[1].toString(), covered[2], covered[3])
    if (!covered[2] || !covered[3] || covered[1] !== BigInt(item.lock.amount)) {
      throw new Error(`${item.lock.name} cover rejected the receipt`)
    }
    const settled = await settler.settle.staticCall(...args, item.lock.beneficiary, { gasLimit: 20_000_000n })
    console.log(item.lock.name, 'settle call', settled[0], settled[1].toString())
    const tx = await settler.settle(...args, item.lock.beneficiary, { gasLimit: 20_000_000n })
    console.log(item.lock.name, 'settle', tx.hash)
    const receiptTx = await tx.wait()
    if (receiptTx.status !== 1) throw new Error(`${item.lock.name} settle failed`)
    results.push({
      name: item.lock.name,
      lock: item.lock.lock,
      operationId: covered[0],
      amount: covered[1].toString(),
      mode: item.lock.mode,
      settle: tx.hash,
      messageSlot: item.messageSlot.toString(),
      finalizedSlot: finalized.slot.toString(),
    })
  }

  const report = { settledAt: new Date().toISOString(), results }
  writeFileSync(join(ROOT, 'deployments/phase-asset-tests-proof.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
