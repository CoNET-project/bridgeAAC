#!/usr/bin/env node
/**
 * Cutover Phase E: read-only post-D monitor baseline + rollback criteria.
 * Does NOT send txs, open settle, revoke roles, or touch Treasury USDC.
 *
 * Healthy baseline after Phases B–D:
 *   - AAC proxy: custody closed, SettlerCanary impl, canary spent
 *   - settle() reverts CustodyClosed
 *   - GB admins(OWNER)+admins(AAC) true on CoNET + Base
 *   - GB bridgePaused true on CoNET + Base (paid-GB voteBridgeMint)
 *
 * Rollback actions are documented in output JSON / CUTOVER-CUSTODY.md —
 * this script only reports whether the live state matches the healthy
 * baseline or triggers a rollback symptom flag.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
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

const { Contract, JsonRpcProvider, getAddress, Interface, id } = loadEthers()

const OWNER = getAddress('0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1')
const AAC = getAddress('0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd')
const GB = getAddress('0xC3EF02DaE632b4C10abB66e07d92a387c10838D8')
const SETTLER_CANARY = getAddress('0x9b8DDa3d27473A4EdD351fFD4106c388876A9864')
const SETTLER_CLOSED = getAddress('0x3085216E8329eF7d10c914cB1C43Cd8168f53442')
const CANARY_AAC_ID = '0x166dca2560308688f371222e4b7ef51ed2ae1ac427671ec95b537314d547da56'
const CANARY_AMOUNT = '10000000'
const EIP1967_IMPL_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const CUSTODY_CLOSED_SELECTOR = '0x61839255'

const CONET_RPC = process.env.CONET_RPC_URL || 'https://rpc1.conet.network'
const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'

const AAC_ABI = [
  'function custodyOpen() view returns (bool)',
  'function headerFinal() view returns (bool)',
  'function owner() view returns (address)',
  'function canaryMintCompleted() view returns (bool)',
  'function canaryRecord() view returns (bytes32 aacId, address to, uint256 amount, bool done)',
  'function settle() returns (bool)',
]

const GB_ABI = [
  'function admins(address) view returns (bool)',
  'function bridgePaused() view returns (bool)',
  'function validatorCount() view returns (uint256)',
  'function requiredVotes() view returns (uint256)',
]

const ROLLBACK = {
  canaryMismatchOrDoubleSpend: {
    symptom: 'Canary mismatch / double-spend attempt (unexpected mint, wrong canaryRecord, or second mint succeeds)',
    actions: [
      'Owner: pause AAC gateway path (do not open settle; upgradeTo closed Settler 0x3085…3442 if needed)',
      'Owner/GB admin: revoke Phase B GB admins(AAC) via removeAdmin(AAC) on CoNET + Base if selector present',
      'Leave miner votes as-is for USDC (Treasury untouched); paid-GB already bridgePaused',
    ],
  },
  settlerUnexpectedlyOpen: {
    symptom: 'settle() succeeds or custodyOpen/headerFinal become true without Accepted open',
    actions: [
      'Owner: upgradeTo(closed Obstacle-5 Settler 0x3085216E8329eF7d10c914cB1C43Cd8168f53442)',
      'Do not grant further Treasury/GB/Peer roles',
      'Re-run this monitor until settle reverts CustodyClosed and custody flags false',
    ],
  },
  postWaiveGateDefect: {
    symptom: 'Post-waive gate defect / bad grant after Phases B–D',
    actions: [
      'Freeze cutover: no further role grants or settle-open',
      'Revoke Phase B GB admins(AAC) on CoNET + Base if granted',
      'Keep GB.setBridgePaused(true) unless emergency re-enable of voteBridgeMint is Accepted',
      'Re-open gates document before any new Accepted phase',
    ],
  },
}

function slotToAddress(word) {
  if (!word || word === '0x') return null
  return getAddress('0x' + word.slice(-40))
}

async function readGb(label, rpc, chainIdExpected) {
  const provider = new JsonRpcProvider(rpc, chainIdExpected)
  const net = await provider.getNetwork()
  if (Number(net.chainId) !== chainIdExpected) {
    throw new Error(`${label}: expected chainId ${chainIdExpected}, got ${net.chainId}`)
  }
  const gb = new Contract(GB, GB_ABI, provider)
  const [adminsOwner, adminsAac, bridgePaused, validatorCount, requiredVotes, blockNumber] =
    await Promise.all([
      gb.admins(OWNER),
      gb.admins(AAC),
      gb.bridgePaused(),
      gb.validatorCount(),
      gb.requiredVotes(),
      provider.getBlockNumber(),
    ])
  const healthy =
    adminsOwner === true &&
    adminsAac === true &&
    bridgePaused === true
  return {
    chain: label,
    chainId: chainIdExpected,
    rpc,
    blockNumber,
    gb: GB,
    adminsOwner,
    adminsAac,
    bridgePaused,
    validatorCount: validatorCount.toString(),
    requiredVotes: requiredVotes.toString(),
    healthyBaseline: healthy,
  }
}

async function readAacBase() {
  const provider = new JsonRpcProvider(BASE_RPC, 8453)
  const net = await provider.getNetwork()
  if (Number(net.chainId) !== 8453) {
    throw new Error(`base: expected chainId 8453, got ${net.chainId}`)
  }
  const aac = new Contract(AAC, AAC_ABI, provider)
  const [custodyOpen, headerFinal, owner, canaryDone, canaryRec, implWord, blockNumber] =
    await Promise.all([
      aac.custodyOpen(),
      aac.headerFinal(),
      aac.owner(),
      aac.canaryMintCompleted(),
      aac.canaryRecord(),
      provider.getStorage(AAC, EIP1967_IMPL_SLOT),
      provider.getBlockNumber(),
    ])
  const implementation = slotToAddress(implWord)

  let settle = { reverts: false, selector: null, error: null }
  try {
    await aac.settle.staticCall()
    settle = { reverts: false, selector: null, error: 'settle succeeded (UNEXPECTED)' }
  } catch (e) {
    const data = e?.data || e?.info?.error?.data || e?.error?.data || null
    const hex = typeof data === 'string' ? data : data?.data || null
    const sel = hex && hex.length >= 10 ? hex.slice(0, 10) : null
    settle = {
      reverts: true,
      selector: sel,
      custodyClosed: sel === CUSTODY_CLOSED_SELECTOR,
      error: e?.shortMessage || e?.message || String(e),
    }
  }

  const aacId = canaryRec.aacId
  const to = getAddress(canaryRec.to)
  const amount = canaryRec.amount.toString()
  const done = canaryRec.done

  const healthy =
    custodyOpen === false &&
    headerFinal === false &&
    getAddress(owner) === OWNER &&
    canaryDone === true &&
    done === true &&
    aacId.toLowerCase() === CANARY_AAC_ID.toLowerCase() &&
    to === OWNER &&
    amount === CANARY_AMOUNT &&
    implementation === SETTLER_CANARY &&
    settle.reverts === true &&
    settle.custodyClosed === true

  return {
    chain: 'base',
    chainId: 8453,
    rpc: BASE_RPC,
    blockNumber,
    proxy: AAC,
    custodyOpen,
    headerFinal,
    owner: getAddress(owner),
    implementation,
    expectedImplementation: SETTLER_CANARY,
    closedSettlerReference: SETTLER_CLOSED,
    canaryMintCompleted: canaryDone,
    canaryRecord: { aacId, to, amount, done },
    settle,
    healthyBaseline: healthy,
  }
}

function collectSymptoms(aac, gbConet, gbBase) {
  const flags = []
  if (aac.custodyOpen || aac.headerFinal || !aac.settle.reverts || !aac.settle.custodyClosed) {
    flags.push('settlerUnexpectedlyOpen')
  }
  if (
    aac.implementation !== SETTLER_CANARY ||
    !aac.canaryMintCompleted ||
    aac.canaryRecord.aacId.toLowerCase() !== CANARY_AAC_ID.toLowerCase() ||
    aac.canaryRecord.to !== OWNER ||
    aac.canaryRecord.amount !== CANARY_AMOUNT
  ) {
    flags.push('canaryMismatchOrDoubleSpend')
  }
  if (!gbConet.adminsAac || !gbBase.adminsAac || !gbConet.adminsOwner || !gbBase.adminsOwner) {
    flags.push('postWaiveGateDefect')
  }
  if (!gbConet.bridgePaused || !gbBase.bridgePaused) {
    flags.push('postWaiveGateDefect')
  }
  return [...new Set(flags)]
}

async function main() {
  console.log('Phase E monitor (read-only)…')
  const [aac, gbConet, gbBase] = await Promise.all([
    readAacBase(),
    readGb('conet', CONET_RPC, 224422),
    readGb('base', BASE_RPC, 8453),
  ])

  const symptomFlags = collectSymptoms(aac, gbConet, gbBase)
  const allHealthy =
    aac.healthyBaseline && gbConet.healthyBaseline && gbBase.healthyBaseline && symptomFlags.length === 0

  const payload = {
    phase: 'E',
    action: 'monitor-baseline-read-only',
    status: allHealthy ? 'HEALTHY' : 'SYMPTOM',
    executedAt: new Date().toISOString(),
    note: 'No on-chain writes. Rollback rows are runbook only until a symptom is Accepted for action.',
    addresses: {
      owner: OWNER,
      aac: AAC,
      gb: GB,
      settlerCanary: SETTLER_CANARY,
      settlerClosedObstacle5: SETTLER_CLOSED,
    },
    aacBase: aac,
    gb: { conet: gbConet, base: gbBase },
    healthyBaseline: allHealthy,
    symptomFlags,
    rollbackCriteria: ROLLBACK,
    emergencyReEnablePaidGbVote: 'GB.setBridgePaused(false) by same GB admin/owner (Accepted only)',
    treasuryVoteBridgeOperation: 'NOT MONITORED AS AAC PATH — USDC still miner-vote; not Phase E scope',
  }

  const outDir = join(ROOT, 'deployments')
  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, 'phase-E-monitor-baseline.json')
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n')
  console.log('wrote', path)
  console.log(JSON.stringify(payload, null, 2))
  if (!allHealthy) {
    console.error('Phase E: SYMPTOM flags present — review rollbackCriteria')
    process.exit(2)
  }
  console.log('Phase E: HEALTHY baseline')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
