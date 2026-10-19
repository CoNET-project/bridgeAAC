#!/usr/bin/env node
/**
 * Cutover Phase D: pause GB voteBridgeMint on CoNET + Base via setBridgePaused(true).
 * Assets served by AAC after Phase C = paid GB only. Does NOT touch Treasury
 * voteBridgeOperation (USDC still on miner vote). Emergency re-enable:
 * setBridgePaused(false) by the same GB admin / owner.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
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

const { Contract, JsonRpcProvider, Wallet, getAddress } = loadEthers()

const OWNER = getAddress('0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1')
const AAC = getAddress('0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd')
const GB = getAddress('0xC3EF02DaE632b4C10abB66e07d92a387c10838D8')
const CONET_RPC = process.env.CONET_RPC_URL || 'https://rpc1.conet.network'
const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'

const GB_ABI = [
  'function admins(address) view returns (bool)',
  'function bridgePaused() view returns (bool)',
  'function validatorCount() view returns (uint256)',
  'function requiredVotes() view returns (uint256)',
  'function setBridgePaused(bool paused)',
]

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  const candidates = []
  if (Array.isArray(raw.settle_contractAdmin)) candidates.push(...raw.settle_contractAdmin)
  if (Array.isArray(raw.beamio_Admins)) candidates.push(...raw.beamio_Admins)
  for (const k of candidates) {
    if (typeof k === 'string' && /^[0-9a-fA-F]{64}$/.test(k)) {
      return `0x${k}`
    }
  }
  throw new Error('no 64-hex admin key in the owner key file (OWNER_KEY_FILE)')
}

async function pauseOnChain(label, rpc, chainIdExpected) {
  const provider = new JsonRpcProvider(rpc, chainIdExpected)
  const net = await provider.getNetwork()
  if (Number(net.chainId) !== chainIdExpected) {
    throw new Error(`${label}: expected chainId ${chainIdExpected}, got ${net.chainId}`)
  }
  const wallet = new Wallet(loadOwnerKey(), provider)
  if (getAddress(wallet.address) !== OWNER) {
    throw new Error(`${label}: signer ${wallet.address} != OWNER ${OWNER}`)
  }
  const gb = new Contract(GB, GB_ABI, wallet)
  const [isAdmin, pausedBefore, vc, rv, aacAdmin] = await Promise.all([
    gb.admins(OWNER),
    gb.bridgePaused(),
    gb.validatorCount(),
    gb.requiredVotes(),
    gb.admins(AAC),
  ])
  console.log(
    `[${label}] signer=${wallet.address} admins(OWNER)=${isAdmin} admins(AAC)=${aacAdmin} ` +
      `bridgePaused=${pausedBefore} validatorCount=${vc} requiredVotes=${rv}`,
  )
  if (!isAdmin) throw new Error(`${label}: signer is not GB admin`)
  if (!aacAdmin) throw new Error(`${label}: AAC must remain GB admin (Phase B)`)
  if (pausedBefore) {
    console.log(`[${label}] already paused — skip send`)
    return {
      chain: label,
      chainId: chainIdExpected,
      skipped: true,
      txHash: null,
      bridgePaused: true,
      validatorCount: vc.toString(),
      requiredVotes: rv.toString(),
    }
  }
  const tx = await gb.setBridgePaused(true)
  console.log(`[${label}] sent ${tx.hash}`)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label}: tx failed ${tx.hash}`)
  const pausedAfter = await gb.bridgePaused()
  if (!pausedAfter) throw new Error(`${label}: bridgePaused still false after ${tx.hash}`)
  console.log(`[${label}] OK bridgePaused=true block=${receipt.blockNumber}`)
  return {
    chain: label,
    chainId: chainIdExpected,
    skipped: false,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    bridgePaused: true,
    validatorCount: vc.toString(),
    requiredVotes: rv.toString(),
  }
}

async function main() {
  const only = (process.env.PHASE_D_CHAIN || 'both').toLowerCase()
  const results = []
  if (only === 'both' || only === 'conet') {
    results.push(await pauseOnChain('conet', CONET_RPC, 224422))
  }
  if (only === 'both' || only === 'base') {
    results.push(await pauseOnChain('base', BASE_RPC, 8453))
  }
  const outDir = join(ROOT, 'deployments')
  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, 'phase-D-gb-setBridgePaused.json')
  const payload = {
    phase: 'D',
    action: 'setBridgePaused(true)',
    asset: 'paid-GB',
    gb: GB,
    aac: AAC,
    owner: OWNER,
    emergencyReEnable: 'GB.setBridgePaused(false) by same GB admin/owner',
    treasuryVoteBridgeOperation: 'NOT TOUCHED — USDC not served by AAC',
    executedAt: new Date().toISOString(),
    results,
  }
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n')
  console.log('wrote', path)
  console.log(JSON.stringify(payload, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
