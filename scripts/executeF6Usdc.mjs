#!/usr/bin/env node
/**
 * Phase F6 — USDC / Treasury cutover probe (RECORD_ONLY / BLOCKED).
 *
 * Audit ask: authorize AAC on Treasury + stop miner `voteBridgeOperation`.
 * Live TreasuryBridgeV3 has neither a pause setter nor an AAC mint/release role
 * for the AAC proxy. Do not invent setters. This script only probes + writes JSON.
 *
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
 * There is no PHASE_F6_EXECUTE broadcast path (would require explicit Treasury upgrade auth).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEPLOYMENTS = join(ROOT, 'deployments')

function loadEthers() {
  for (const candidate of [resolve(ROOT, '../../package.json'), resolve(ROOT, '../package.json')]) {
    if (existsSync(candidate)) return createRequire(candidate)('ethers')
  }
  return createRequire(import.meta.url)('ethers')
}

const { Contract, JsonRpcProvider, id, getAddress } = loadEthers()

const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const AAC = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_CONET = '0x5209865D404aA5646eDe5B91CD4218909eA72eDA'

const TREASURY_ABI = [
  'function owner() view returns (address)',
  'function minerCount() view returns (uint256)',
  'function isMiner(address) view returns (bool)',
  'function authorizedBridgeAsset(address) view returns (bool)',
  'function allowedMintCallbacks(address) view returns (bool)',
]

const SELECTORS = [
  'setBridgePaused(bool)',
  'voteBridgeOperation(bytes32,uint256,uint256,address,address,address,address[],uint256[],uint8,uint256,uint256,bytes32,uint256,address)',
  'addMiner(address)',
  'removeMiner(address)',
  'setBridgeAssetAuthorization(address,bool)',
  'setMintCallbackAllowed(address,bool)',
  'isMiner(address)',
  'minerCount()',
  'transferOwnership(address)',
  'owner()',
  'isAdmin(address)',
  'hasRole(bytes32,address)',
  'pause()',
  'paused()',
]

function slotToAddress(hex) {
  return getAddress(`0x${hex.slice(-40)}`)
}

async function main() {
  const provider = new JsonRpcProvider(BASE_RPC)
  const implRaw = await provider.getStorage(TREASURY, IMPL_SLOT)
  const impl = slotToAddress(implRaw)
  const implCode = (await provider.getCode(impl)).slice(2).toLowerCase()

  const selectors = {}
  for (const sig of SELECTORS) {
    const sel = id(sig).slice(2, 10)
    selectors[sig.split('(')[0]] = { selector: `0x${sel}`, present: implCode.includes(sel) }
  }

  const t = new Contract(TREASURY, TREASURY_ABI, provider)
  const views = {
    owner: await t.owner(),
    minerCount: Number(await t.minerCount()),
    isMinerAac: await t.isMiner(AAC),
    isMinerOwner: await t.isMiner(OWNER),
    allowedMintCallbacksAac: await t.allowedMintCallbacks(AAC),
    authorizedBridgeAssetUsdcBase: await t.authorizedBridgeAsset(USDC_BASE),
    authorizedBridgeAssetUsdcConet: await t.authorizedBridgeAsset(USDC_CONET),
  }

  // Source confirmation: no setBridgePaused in TreasuryBridgeV3.sol
  let sourceHasSetBridgePaused = null
  const srcPath = resolve(ROOT, '../../b-unit/TreasuryBridgeV3.sol')
  if (existsSync(srcPath)) {
    const src = readFileSync(srcPath, 'utf8')
    sourceHasSetBridgePaused = /\bfunction\s+setBridgePaused\b/.test(src)
  }

  const blockedReasons = [
    'Live TreasuryBridgeV3 has no setBridgePaused / pause / paused (impl bytecode + source).',
    'Live Treasury has no isAdmin / hasRole for AAC mint/release authority.',
    'voteBridgeOperation remains onlyMiner; cannot disable without inventing a setter or upgrading Treasury.',
    'removeMiner requires remaining miners ≥ 1; cannot zero the miner set.',
    'setMintCallbackAllowed / setBridgeAssetAuthorization are not AAC settle/mint authority for USDC vote path.',
    'CUTOVER Phase B already recorded Treasury role grant to AAC as NOT EXECUTED — do not invent.',
  ]

  const snap = {
    phase: 'F6',
    status: 'BLOCKED',
    recordedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    meaning:
      'F6 USDC cutover cannot complete on live TreasuryBridgeV3 without an explicit Treasury upgrade that adds AAC authorization and/or a pause for voteBridgeOperation. Probe only; no broadcast.',
    treasuryProxy: TREASURY,
    treasuryImpl: impl,
    aacProxy: AAC,
    selectors,
    views,
    sourceHasSetBridgePaused,
    blockedReasons,
    requiredNextAuth:
      'Explicit written auth to upgrade TreasuryBridgeV3 (UUPS) with AAC grant + voteBridgeOperation pause/disable, then Blockscout verify on the spot — or product decision to leave USDC on miner vote permanently.',
    ok: true,
    executeBroadcast: false,
  }

  mkdirSync(DEPLOYMENTS, { recursive: true })
  const out = join(DEPLOYMENTS, 'phase-F6-usdc.json')
  writeFileSync(out, `${JSON.stringify(snap, null, 2)}\n`)
  console.log(`phase:F6 status:BLOCKED path:${out}`)
  console.log(`treasuryImpl:${impl} setBridgePaused:${selectors.setBridgePaused.present} voteBridgeOperation:${selectors.voteBridgeOperation.present}`)
  console.log(`minerCount:${views.minerCount} isMiner(AAC):${views.isMinerAac} allowedMintCallbacks(AAC):${views.allowedMintCallbacksAac}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
