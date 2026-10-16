#!/usr/bin/env node
/**
 * Phase F4 — CheckpointRoot one-period committee rotate (applyUpdate).
 *
 * - Separate tx only (never bundle with Cover / settle)
 * - Drain period-P covers before rotate (Cover: messageSlot/8192 == period)
 * - Gas under Base pairing budget (16_777_216)
 *
 * Dry-run by default. Broadcast: PHASE_F4_EXECUTE=1 + F4_UPDATE_JSON=/path/to/update.json
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEthers() {
  for (const candidate of [resolve(ROOT, '../../package.json'), resolve(ROOT, '../package.json')]) {
    if (existsSync(candidate)) return createRequire(candidate)('ethers')
  }
  return createRequire(import.meta.url)('ethers')
}

const { Contract, JsonRpcProvider, Wallet, Interface, getAddress, keccak256, hexlify, getBytes, ZeroHash } =
  loadEthers()

const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC_PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const CHECKPOINT_ROOT = '0xcEE3D699df3df07a573f1aFf642888B97B7aA961'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const CONSUME_PROXY = '0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F'
const SETTLER_F3 = '0xf131359EE46d261B91cEedE8772DE18fB821B2b0'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const COMMITTEE_SIZE = 512
const SLOTS_PER_PERIOD = 8192n
/** Audit / M4 pairing budget — refuse estimate at or above this. */
const PAIRING_GAS_CAP = 16_777_216n
const MEASURED_MEDIAN_GAS = 11_481_348n
const EXECUTE = process.env.PHASE_F4_EXECUTE === '1'
const UPDATE_JSON_PATH = process.env.F4_UPDATE_JSON || ''
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'

const ROOT_ABI = [
  'function owner() view returns (address)',
  'function period() view returns (uint256)',
  'function rootReady() view returns (bool)',
  'function compressedDigest() view returns (bytes32)',
  'function applyUpdate((bytes signerUncompressed, bytes nextCompressed, bytes nextAggregate, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes32[6] branch, bytes signaturePoint) update) returns (uint256 fromPeriod, uint256 toPeriod, uint256 participants, bool messageCovered_, bool headerFinal_)',
]

const AAC_ABI = [
  'function owner() view returns (address)',
  'function custodyOpen() view returns (bool)',
  'function COVER() view returns (address)',
]

const COVER_ABI = ['function STORE() view returns (address)']

const APPLY_IFACE = new Interface([
  'function applyUpdate((bytes signerUncompressed, bytes nextCompressed, bytes nextAggregate, bytes bits, (uint256 slot, uint256 proposer, bytes32 parentRoot, bytes32 stateRoot, bytes32 bodyRoot) attested, uint256 signatureSlot, bytes32[6] branch, bytes signaturePoint) update)',
])

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) return `0x${k}`
  }
  throw new Error('no 64-hex admin key in ~/.master.json')
}

async function readImpl(provider, proxy) {
  const slot = await provider.getStorage(proxy, IMPL_SLOT)
  return getAddress('0x' + slot.slice(-40))
}

function asHexBytes(v, label, expectedLen) {
  if (typeof v !== 'string') throw new Error(`${label}: expected 0x hex string`)
  const h = v.startsWith('0x') ? v : `0x${v}`
  const bytes = getBytes(h)
  if (expectedLen != null && bytes.length !== expectedLen) {
    throw new Error(`${label}: expected ${expectedLen} bytes, got ${bytes.length}`)
  }
  return hexlify(bytes)
}

function asUint256(v, label) {
  const n = typeof v === 'string' ? BigInt(v) : BigInt(v)
  if (n < 0n) throw new Error(`${label}: negative`)
  return n
}

function asBytes32(v, label) {
  const h = typeof v === 'string' && v.startsWith('0x') ? v : `0x${v}`
  const bytes = getBytes(h)
  if (bytes.length !== 32) throw new Error(`${label}: expected bytes32`)
  return hexlify(bytes)
}

/**
 * Load Update from JSON. Accepts flat Update or { update: … }.
 * Hex fields: 0x… ; slots may be number or string.
 */
function loadUpdate(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const u = raw.update && typeof raw.update === 'object' ? raw.update : raw
  const attested = u.attested
  if (!attested || typeof attested !== 'object') throw new Error('update.attested missing')
  const branchRaw = u.branch
  if (!Array.isArray(branchRaw) || branchRaw.length !== 6) {
    throw new Error('update.branch must be length-6 bytes32[]')
  }
  const update = {
    signerUncompressed: asHexBytes(u.signerUncompressed, 'signerUncompressed', COMMITTEE_SIZE * 128),
    nextCompressed: asHexBytes(u.nextCompressed, 'nextCompressed', COMMITTEE_SIZE * 48),
    nextAggregate: asHexBytes(u.nextAggregate, 'nextAggregate', 48),
    bits: asHexBytes(u.bits, 'bits', 64),
    attested: {
      slot: asUint256(attested.slot, 'attested.slot'),
      proposer: asUint256(attested.proposer ?? attested.proposerIndex ?? 0, 'attested.proposer'),
      parentRoot: asBytes32(attested.parentRoot, 'attested.parentRoot'),
      stateRoot: asBytes32(attested.stateRoot, 'attested.stateRoot'),
      bodyRoot: asBytes32(attested.bodyRoot, 'attested.bodyRoot'),
    },
    signatureSlot: asUint256(u.signatureSlot, 'signatureSlot'),
    branch: branchRaw.map((b, i) => asBytes32(b, `branch[${i}]`)),
    signaturePoint: asHexBytes(u.signaturePoint, 'signaturePoint', 256),
  }
  return update
}

function periodOfSlot(slot) {
  return slot / SLOTS_PER_PERIOD
}

function validateUpdateShape(update, fromPeriod) {
  const errs = []
  const sigPeriod = periodOfSlot(update.signatureSlot)
  const attPeriod = periodOfSlot(update.attested.slot)
  if (sigPeriod !== fromPeriod) errs.push(`signatureSlot period ${sigPeriod} != store period ${fromPeriod}`)
  if (attPeriod !== fromPeriod) errs.push(`attested.slot period ${attPeriod} != store period ${fromPeriod}`)
  if (update.signatureSlot <= update.attested.slot) errs.push('signatureSlot must be > attested.slot')
  const nextDigest = keccak256(update.nextCompressed)
  return { errs, nextDigest, sigPeriod, attPeriod }
}

function countParticipants(bitsHex) {
  const bytes = getBytes(bitsHex)
  let n = 0
  for (const b of bytes) {
    let x = b
    while (x) {
      n += x & 1
      x >>= 1
    }
  }
  return n
}

async function main() {
  const provider = new JsonRpcProvider(RPC)
  const root = new Contract(CHECKPOINT_ROOT, ROOT_ABI, provider)
  const aac = new Contract(AAC_PROXY, AAC_ABI, provider)
  const cover = new Contract(COVER, COVER_ABI, provider)

  const [period, rootReady, compressedDigest, rootOwner, aacOwner, custodyOpen, coverStore, aacImpl, tip] =
    await Promise.all([
      root.period(),
      root.rootReady(),
      root.compressedDigest(),
      root.owner(),
      aac.owner(),
      aac.custodyOpen(),
      cover.STORE(),
      readImpl(provider, AAC_PROXY),
      provider.getBlock('latest'),
    ])

  const fromPeriod = BigInt(period)
  const checks = {
    rootReady: Boolean(rootReady),
    rootOwnerIsCustodyOwner: getAddress(rootOwner) === getAddress(OWNER),
    aacOwnerIsCustodyOwner: getAddress(aacOwner) === getAddress(OWNER),
    custodyStillClosed: custodyOpen === false,
    aacImplPresent: getAddress(aacImpl) !== '0x0000000000000000000000000000000000000000',
    coverStoreIsCheckpointRoot: getAddress(coverStore) === getAddress(CHECKPOINT_ROOT),
    periodNonZero: fromPeriod > 0n,
    tipGasLimitAbovePairingCap: BigInt(tip.gasLimit) >= PAIRING_GAS_CAP,
  }

  const blockers = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)

  const artifact = {
    phase: 'F4',
    status: 'DRY_RUN',
    ownerAuth: OWNER_AUTH,
    recordedAt: new Date().toISOString(),
    addresses: {
      checkpointRoot: CHECKPOINT_ROOT,
      aac: AAC_PROXY,
      aacImpl: aacImpl,
      settlerF3Expected: SETTLER_F3,
      cover: COVER,
      consumeOnce: CONSUME_PROXY,
      owner: OWNER,
    },
    live: {
      period: fromPeriod.toString(),
      nextPeriod: (fromPeriod + 1n).toString(),
      rootReady: Boolean(rootReady),
      compressedDigest,
      tipBlock: tip.number,
      tipGasLimit: tip.gasLimit.toString(),
      pairingGasCap: PAIRING_GAS_CAP.toString(),
      measuredMedianGas: MEASURED_MEDIAN_GAS.toString(),
    },
    checks,
    blockers,
    proofWindow: {
      rule: 'Cover.cover requires messageSlot/8192 == STORE.period(); Settler re-runs Cover each settle',
      actionBeforeRotate: 'Drain Cover+settle for all locks with messageSlot in current period',
      afterRotate: 'Old-period slots cannot obtain new Cover proofs; ConsumeOnce storage unchanged',
    },
    runbook: 'docs/F4-COMMITTEE-ROTATION.md',
    updatePath: UPDATE_JSON_PATH || null,
    updateValidation: null,
    estimateGas: null,
    tx: null,
    next: UPDATE_JSON_PATH
      ? EXECUTE
        ? null
        : 'PHASE_F4_EXECUTE=1 F4_UPDATE_JSON=… node scripts/executeF4CommitteeRotate.mjs'
      : 'F4_UPDATE_JSON=/path/to/update.json node scripts/executeF4CommitteeRotate.mjs',
  }

  if (blockers.length) {
    artifact.status = 'BLOCKED'
    writeArtifact(artifact)
    console.error('F4 blocked:', blockers.join(', '))
    process.exit(1)
  }

  if (!UPDATE_JSON_PATH) {
    artifact.status = 'RUNBOOK_READY'
    artifact.note =
      'Readiness OK. Supply F4_UPDATE_JSON to validate/estimate; PHASE_F4_EXECUTE=1 to broadcast one applyUpdate.'
    writeArtifact(artifact)
    console.log(JSON.stringify({ status: artifact.status, period: artifact.live.period, next: artifact.next }, null, 2))
    return
  }

  const update = loadUpdate(UPDATE_JSON_PATH)
  const shape = validateUpdateShape(update, fromPeriod)
  const participants = countParticipants(update.bits)
  const quorumOk = participants * 3 >= COMMITTEE_SIZE * 2
  const nextDigestDiffersFromStored = shape.nextDigest !== compressedDigest
  artifact.updateValidation = {
    path: resolve(UPDATE_JSON_PATH),
    shapeErrors: shape.errs,
    participants,
    quorumOk,
    nextDigest: shape.nextDigest,
    nextDigestDiffersFromStored,
    signaturePeriod: shape.sigPeriod.toString(),
    attestedPeriod: shape.attPeriod.toString(),
  }

  if (shape.errs.length || !quorumOk || !nextDigestDiffersFromStored) {
    artifact.status = 'UPDATE_INVALID'
    writeArtifact(artifact)
    console.error('F4 update invalid:', artifact.updateValidation)
    process.exit(1)
  }

  const positional = [
    update.signerUncompressed,
    update.nextCompressed,
    update.nextAggregate,
    update.bits,
    [
      update.attested.slot,
      update.attested.proposer,
      update.attested.parentRoot,
      update.attested.stateRoot,
      update.attested.bodyRoot,
    ],
    update.signatureSlot,
    update.branch,
    update.signaturePoint,
  ]
  const calldata = APPLY_IFACE.encodeFunctionData('applyUpdate', [positional])
  let gasEstimate
  try {
    gasEstimate = await provider.estimateGas({
      from: OWNER,
      to: CHECKPOINT_ROOT,
      data: calldata,
    })
  } catch (e) {
    artifact.status = 'ESTIMATE_FAILED'
    artifact.estimateGas = { error: String(e?.shortMessage || e?.message || e).slice(0, 500) }
    writeArtifact(artifact)
    console.error('F4 estimateGas failed:', artifact.estimateGas.error)
    process.exit(1)
  }

  const gas = BigInt(gasEstimate)
  artifact.estimateGas = {
    wei: gas.toString(),
    underPairingCap: gas < PAIRING_GAS_CAP,
    pairingGasCap: PAIRING_GAS_CAP.toString(),
  }

  if (gas >= PAIRING_GAS_CAP) {
    artifact.status = 'GAS_OVER_CAP'
    writeArtifact(artifact)
    console.error(`F4 gas ${gas} >= pairing cap ${PAIRING_GAS_CAP}`)
    process.exit(1)
  }

  if (!EXECUTE) {
    artifact.status = 'UPDATE_VALIDATED'
    artifact.note = 'estimateGas under pairing cap; set PHASE_F4_EXECUTE=1 to broadcast'
    writeArtifact(artifact)
    console.log(
      JSON.stringify(
        {
          status: artifact.status,
          period: artifact.live.period,
          estimateGas: artifact.estimateGas.wei,
          next: artifact.next,
        },
        null,
        2,
      ),
    )
    return
  }

  const wallet = new Wallet(loadOwnerKey(), provider)
  if (getAddress(wallet.address) !== getAddress(OWNER)) {
    throw new Error(`owner key address ${wallet.address} != ${OWNER}`)
  }

  const rootW = new Contract(CHECKPOINT_ROOT, ROOT_ABI, wallet)
  const tx = await rootW.applyUpdate(positional)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`applyUpdate failed status=${receipt.status}`)

  const periodAfter = await root.period()
  const digestAfter = await root.compressedDigest()
  const readyAfter = await root.rootReady()

  if (BigInt(periodAfter) !== fromPeriod + 1n) {
    throw new Error(`period after rotate ${periodAfter} != ${fromPeriod + 1n}`)
  }
  if (digestAfter !== shape.nextDigest) {
    throw new Error(`compressedDigest mismatch after rotate`)
  }
  if (!readyAfter) throw new Error('rootReady false after rotate')

  artifact.status = 'EXECUTED'
  artifact.tx = {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    fromPeriod: fromPeriod.toString(),
    toPeriod: periodAfter.toString(),
    compressedDigest: digestAfter,
  }
  artifact.next = 'F5 settle-open + GB.admins(AAC) — see docs/CUTOVER-CUSTODY.md'
  writeArtifact(artifact)
  console.log(JSON.stringify({ status: artifact.status, tx: artifact.tx }, null, 2))
}

function writeArtifact(artifact) {
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const path = join(ROOT, 'deployments', 'phase-F4-committee-rotate.json')
  writeFileSync(path, JSON.stringify(artifact, null, 2) + '\n')
  console.error('wrote', path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
