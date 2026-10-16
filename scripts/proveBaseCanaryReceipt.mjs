/**
 * Prove the 0.01 Base USDC lock on the CoNET cover. Waits until an Ethereum
 * finalized header is at least as late as the receipt's beacon slot. On a
 * covered eth_call, installs the settler and settles that same receipt.
 * Does not open CoNET source initiate.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(ROOT, '../..')
const { Contract, JsonRpcProvider, Wallet, keccak256 } = createRequire(join(REPO, 'package.json'))('ethers')

const LOCK = JSON.parse(readFileSync(join(ROOT, 'deployments/phase-base-conet-canary-lock.json'), 'utf8'))
const DEPLOYED = JSON.parse(readFileSync(join(ROOT, 'deployments/phase-conet-bls-probe.json'), 'utf8'))
const MESSAGE_ROOT = '0x351ee79a8ac484f69e1c15a3b724e351b25e2e5e98d54b1a06f38c2b86857519'
const MESSAGE_SLOT = 15438793n
const COVER = DEPLOYED.cover.address
const SETTLER = DEPLOYED.settler.address
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
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

async function waitForFinality() {
  for (let i = 0; i < 40; i++) {
    const update = lighthouse('/eth/v1/beacon/light_client/finality_update').data
    const finalized = BigInt(update.finalized_header.beacon.slot)
    console.log('finalized', finalized.toString(), 'need', MESSAGE_SLOT.toString())
    if (finalized >= MESSAGE_SLOT && finalized - MESSAGE_SLOT <= 256n) return update
    if (finalized > MESSAGE_SLOT + 256n) throw new Error('finalized header is more than 256 slots after the receipt')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
  }
  throw new Error('Ethereum finality did not reach the receipt beacon slot')
}

function beaconChain(finalizedRoot) {
  const headers = []
  let root = finalizedRoot
  for (let i = 0; i < 257; i++) {
    const body = lighthouse(`/eth/v1/beacon/headers/${root}`)
    const message = body.data.header.message
    headers.push(headerOf(message))
    if (root.toLowerCase() === MESSAGE_ROOT.toLowerCase()) return headers.reverse()
    root = message.parent_root
  }
  throw new Error('beacon header chain exceeded 256')
}

async function main() {
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const raw = await base.send('eth_getBlockByHash', [LOCK.blockHash || null, false]).catch(() => null)
  const block = raw || await base.send('eth_getBlockByNumber', ['0x' + Number(LOCK.blockNumber).toString(16), false])
  const encoded = headerRlp(block)
  if (keccak256(encoded).toLowerCase() !== block.hash.toLowerCase()) throw new Error('header rlp does not hash to the Base block')
  const exported = spawnSync(join(ROOT, 'target/release/export-receipt'), ['https://base-rpc.conet.network', LOCK.lock], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (exported.status !== 0) throw new Error(exported.stderr || 'receipt export failed')
  const proof = JSON.parse(exported.stdout)
  const receipt = await base.getTransactionReceipt(LOCK.lock)
  const logIndex = receipt.logs.findIndex((log) => log.topics[0]?.toLowerCase() === TOPIC.toLowerCase())
  if (logIndex < 0) throw new Error('BridgeOperation log was not in the lock receipt')

  const update = await waitForFinality()
  const finalized = headerOf(update.finalized_header.beacon)
  const attested = headerOf(update.attested_header.beacon)
  const finalizedRoot = lighthouse(`/eth/v1/beacon/headers/${finalized.slot}`).data.root
  const headers = beaconChain(finalizedRoot)
  const last = headers[headers.length - 1]
  if (last.slot !== finalized.slot || last.stateRoot.toLowerCase() !== finalized.stateRoot.toLowerCase()) {
    throw new Error('header chain does not end at the finalized header')
  }
  const boot = lighthouse(`/eth/v1/beacon/light_client/bootstrap/${finalizedRoot}`)
  const pubkeys = boot.data.current_sync_committee.pubkeys
  const expanded = spawnSync(join(ROOT, 'target/release/expand-sync-committee'), {
    input: JSON.stringify({ pubkeys, signature: update.sync_aggregate.sync_committee_signature }),
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
  const args = [
    aggregate,
    finalized,
    update.finality_branch,
    '0x' + encoded.toString('hex'),
    proof.receipt,
    proof.proof,
    BigInt(proof.receipt_index),
    BigInt(logIndex),
    headers,
  ]
  const { FetchRequest } = createRequire(join(REPO, 'package.json'))('ethers')
  const request = new FetchRequest('http://38.102.126.30:8889')
  request.timeout = 180_000
  const conet = new JsonRpcProvider(request, 224422, { staticNetwork: true })
  const cover = new Contract(COVER, coverAbi, conet)
  console.log('headers', headers.length, 'finalized', finalized.slot.toString(), 'cover', COVER)
  let covered
  try {
    covered = await cover.cover.staticCall(...args, { gasLimit: 50_000_000n })
  } catch (error) {
    console.error(JSON.stringify({
      code: error.code,
      data: error.data,
      info: error.info?.error,
      message: error.shortMessage || error.message,
    }))
    throw error
  }
  console.log('cover', covered[0], covered[1].toString(), covered[2], covered[3])
  if (!covered[2] || !covered[3] || covered[1] !== 10_000n) throw new Error('cover did not accept the 0.01 receipt')

  const wallet = new Wallet(loadOwnerKey(), conet)
  const effect = new Contract(EFFECT, ['function settler() view returns (address)', 'function setSettler(address)'], wallet)
  if ((await effect.settler()) === '0x0000000000000000000000000000000000000000') {
    const tx = await effect.setSettler(SETTLER)
    console.log('setSettler', tx.hash)
    await tx.wait()
  }
  const settler = new Contract(SETTLER, settleAbi, wallet)
  const settled = await settler.settle.staticCall(...args, LOCK.beneficiary)
  console.log('settle call', settled[0], settled[1].toString())
  const tx = await settler.settle(...args, LOCK.beneficiary, { gasLimit: 20_000_000n })
  console.log('settle', tx.hash)
  const receiptTx = await tx.wait()
  if (receiptTx.status !== 1) throw new Error('settle failed')
  const report = {
    lock: LOCK.lock,
    operationId: covered[0],
    amount: covered[1].toString(),
    covered: true,
    headerFinal: true,
    settler: await effect.settler(),
    settle: tx.hash,
    finalizedSlot: finalized.slot.toString(),
    messageSlot: MESSAGE_SLOT.toString(),
  }
  writeFileSync(join(ROOT, 'deployments/phase-base-conet-canary-proof.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
