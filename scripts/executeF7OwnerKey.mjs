#!/usr/bin/env node
/**
 * Phase F7 — Owner key → multisig / timelock probe (RECORD_ONLY / BLOCKED).
 *
 * Live AAC Settler (Beacon layout) exposes `owner` + `upgradeTo` but **no**
 * `transferOwnership` / `setOwner` / Ownable two-step. Moving the Owner EOA to a
 * multisig requires a named Settler upgrade (or other explicit path) plus a
 * deployed multisig/timelock — neither is inventable in this script.
 *
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」
 * No PHASE_F7_EXECUTE broadcast (would invent ownership transfer).
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

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
const SETTLER_F5 = '0xa1aa63BF44128E9f14260886263c8775C4A2dA00'
const CHECKPOINT_ROOT = '0xcEE3D699df3df07a573f1aFf642888B97B7aA961'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const FINALITY = '0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const CONSUME = '0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F'
const INCLUSION = '0x7064860E3594aE120f71700B2F46151c6D370559'
const PROOF_LINK = '0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const OWNER_AUTH = '请依据审计报告, 依次移除生产前障碍'

const OWNER_ABI = ['function owner() view returns (address)']

const OWNERSHIP_SIGS = [
  'owner()',
  'transferOwnership(address)',
  'renounceOwnership()',
  'setOwner(address)',
  'acceptOwnership()',
  'nominateOwner(address)',
  'upgradeTo(address)',
]

async function tryOwner(provider, label, address) {
  try {
    const o = await new Contract(address, OWNER_ABI, provider).owner()
    return { label, address, owner: o, hasOwnerView: true }
  } catch (e) {
    return {
      label,
      address,
      owner: null,
      hasOwnerView: false,
      error: (e.shortMessage || e.message || String(e)).slice(0, 120),
    }
  }
}

function scanSelectors(codeHex) {
  const hex = codeHex.slice(2).toLowerCase()
  const out = {}
  for (const sig of OWNERSHIP_SIGS) {
    const sel = id(sig).slice(2, 10)
    out[sig.split('(')[0]] = { selector: `0x${sel}`, present: hex.includes(sel) }
  }
  return out
}

async function main() {
  const provider = new JsonRpcProvider(BASE_RPC)
  const targets = [
    ['AAC', AAC],
    ['SettlerF5Impl', SETTLER_F5],
    ['CheckpointRoot', CHECKPOINT_ROOT],
    ['Treasury', TREASURY],
    ['Finality', FINALITY],
    ['Cover', COVER],
    ['Consume', CONSUME],
    ['Inclusion', INCLUSION],
    ['ProofLink', PROOF_LINK],
  ]

  const ownership = []
  for (const [label, address] of targets) {
    ownership.push(await tryOwner(provider, label, address))
  }

  const aacImplRaw = await provider.getStorage(AAC, IMPL_SLOT)
  const aacImpl = getAddress(`0x${aacImplRaw.slice(-40)}`)
  const aacImplCode = await provider.getCode(aacImpl)
  const treasuryImplRaw = await provider.getStorage(TREASURY, IMPL_SLOT)
  const treasuryImpl = getAddress(`0x${treasuryImplRaw.slice(-40)}`)
  const treasuryImplCode = await provider.getCode(treasuryImpl)
  const rootCode = await provider.getCode(CHECKPOINT_ROOT)

  const selectors = {
    aacImpl: scanSelectors(aacImplCode),
    treasuryImpl: scanSelectors(treasuryImplCode),
    checkpointRoot: scanSelectors(rootCode),
  }

  const aacOwnerRow = ownership.find((r) => r.label === 'AAC')
  const ownerIsEoa = aacOwnerRow?.owner?.toLowerCase() === OWNER.toLowerCase()
  const canTransferAac =
    selectors.aacImpl.transferOwnership.present ||
    selectors.aacImpl.setOwner.present ||
    selectors.aacImpl.acceptOwnership.present

  const blockedReasons = [
    'AAC proxy owner is still the production EOA 0x87cAe…05E1 (not a multisig/timelock).',
    'Live SettlerF5 / Beacon layout has owner() + upgradeTo(owner-only) but no transferOwnership / setOwner / acceptOwnership.',
    'Cannot move AAC owner without a named Settler upgrade that adds ownership transfer (or equivalent) — do not invent.',
    'No multisig / timelock address is named in this cutover for Owner handoff.',
    'Treasury Ownable transferOwnership exists on impl, but F7 gate is AAC custody Owner key; Treasury handoff is a separate explicit auth.',
  ]

  const snap = {
    phase: 'F7',
    status: 'BLOCKED',
    recordedAt: new Date().toISOString(),
    ownerAuth: OWNER_AUTH,
    meaning:
      'F7 Owner key migration to multisig/timelock is blocked: AAC owner remains EOA and live Settler has no ownership-transfer entrypoint. Probe only; no broadcast.',
    expectedOwnerEoa: OWNER,
    aacProxy: AAC,
    aacImpl,
    ownership,
    selectors,
    ownerIsEoa,
    canTransferAacOnLiveSettler: canTransferAac,
    blockedReasons,
    requiredNextAuth:
      'Explicit written auth to (1) deploy/name a multisig or timelock, (2) upgrade AAC Settler to add ownership transfer (or replace Owner via a named path), (3) transfer AAC (+ optionally CheckpointRoot / Treasury) ownership, then Blockscout-verify any new impl.',
    ok: true,
    executeBroadcast: false,
  }

  mkdirSync(DEPLOYMENTS, { recursive: true })
  const out = join(DEPLOYMENTS, 'phase-F7-owner-key.json')
  writeFileSync(out, `${JSON.stringify(snap, null, 2)}\n`)
  console.log(`phase:F7 status:BLOCKED path:${out}`)
  console.log(`aacOwner:${aacOwnerRow?.owner} canTransferAac:${canTransferAac} ownerIsEoa:${ownerIsEoa}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
