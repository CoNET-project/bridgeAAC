#!/usr/bin/env node
/**
 * F1 — Off canary + revoke GB admins(AAC).
 *
 * 1) Base AAC proxy upgradeTo(closed Settler 0x3085…3442)
 * 2) GB.removeAdmin(AAC) on CoNET + Base
 *
 * Default: dry-run preflight. Set PHASE_F1_EXECUTE=1 to broadcast.
 * Owner auth: 「请依据审计报告, 依次移除生产前障碍」.
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

const { Contract, JsonRpcProvider, Wallet, Interface, getAddress } = loadEthers()

const OWNER = getAddress('0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1')
const AAC = getAddress('0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd')
const GB = getAddress('0xC3EF02DaE632b4C10abB66e07d92a387c10838D8')
const CLOSED_SETTLER = getAddress('0x3085216E8329eF7d10c914cB1C43Cd8168f53442')
const CANARY_IMPL = getAddress('0x9b8DDa3d27473A4EdD351fFD4106c388876A9864')
const CONET_RPC = process.env.CONET_RPC_URL || 'https://rpc1.conet.network'
const BASE_RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EXECUTE = process.env.PHASE_F1_EXECUTE === '1'

const GB_ABI = [
  'function admins(address) view returns (bool)',
  'function removeAdmin(address account)',
]
const PROXY_ABI = [
  'function owner() view returns (address)',
  'function upgradeTo(address newImplementation)',
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

async function readImpl(provider, proxy) {
  const raw = await provider.getStorage(proxy, IMPL_SLOT)
  return getAddress('0x' + raw.slice(-40))
}

async function checkSettleClosed(provider) {
  const iface = new Interface(['function settle()', 'function canaryMintCompleted() view returns (bool)'])
  let settleClosed = false
  let settleError = ''
  try {
    await provider.call({ to: AAC, data: iface.encodeFunctionData('settle', []) })
  } catch (e) {
    settleError = String(e?.shortMessage || e?.message || e)
    settleClosed = /CustodyClosed|0x61839255/i.test(settleError) || settleError.includes('execution reverted')
  }
  let canarySelectorGone = false
  try {
    await provider.call({ to: AAC, data: iface.encodeFunctionData('canaryMintCompleted', []) })
  } catch (e) {
    canarySelectorGone = true
  }
  return { settleClosed, settleError: settleError.slice(0, 160), canarySelectorGone }
}

async function revokeOnChain(label, rpc, chainIdExpected) {
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
  const beforeOwner = await gb.admins(OWNER)
  const beforeAac = await gb.admins(AAC)
  console.log(`[${label}] admins(OWNER)=${beforeOwner} admins(AAC)=${beforeAac}`)
  if (!beforeOwner) throw new Error(`${label}: signer is not GB admin`)
  if (!beforeAac) {
    console.log(`[${label}] AAC already not admin — skip`)
    return { chain: label, chainId: chainIdExpected, skipped: true, txHash: null, adminsAac: false }
  }
  if (!EXECUTE) {
    console.log(`[${label}] dry-run: would removeAdmin(AAC)`)
    return { chain: label, chainId: chainIdExpected, skipped: false, dryRun: true, txHash: null, adminsAac: true }
  }
  const tx = await gb.removeAdmin(AAC)
  console.log(`[${label}] sent ${tx.hash}`)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label}: tx failed ${tx.hash}`)
  const afterAac = await gb.admins(AAC)
  if (afterAac) throw new Error(`${label}: admins(AAC) still true after ${tx.hash}`)
  console.log(`[${label}] OK admins(AAC)=false block=${receipt.blockNumber}`)
  return {
    chain: label,
    chainId: chainIdExpected,
    skipped: false,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    adminsAac: false,
  }
}

async function main() {
  const baseProvider = new JsonRpcProvider(BASE_RPC, 8453)
  const implBefore = await readImpl(baseProvider, AAC)
  const proxy = new Contract(AAC, PROXY_ABI, baseProvider)
  const owner = getAddress(await proxy.owner())
  console.log(`[F1] proxy=${AAC} owner=${owner} implBefore=${implBefore}`)
  console.log(`[F1] target closed settler=${CLOSED_SETTLER} (was canary=${CANARY_IMPL})`)
  if (owner !== OWNER) throw new Error(`proxy owner ${owner} != OWNER`)

  const closedCode = await baseProvider.getCode(CLOSED_SETTLER)
  if (!closedCode || closedCode === '0x') throw new Error('closed settler has no code on Base')

  let upgrade = { skipped: false, dryRun: !EXECUTE, txHash: null, implAfter: implBefore }
  if (implBefore === CLOSED_SETTLER) {
    console.log('[F1-upgrade] already on closed settler — skip')
    upgrade = { skipped: true, dryRun: false, txHash: null, implAfter: CLOSED_SETTLER }
  } else if (!EXECUTE) {
    console.log(`[F1-upgrade] dry-run: would upgradeTo(${CLOSED_SETTLER}) from ${implBefore}`)
  } else {
    const wallet = new Wallet(loadOwnerKey(), baseProvider)
    if (getAddress(wallet.address) !== OWNER) throw new Error(`signer ${wallet.address} != OWNER`)
    const writable = new Contract(AAC, PROXY_ABI, wallet)
    const tx = await writable.upgradeTo(CLOSED_SETTLER)
    console.log(`[F1-upgrade] sent ${tx.hash}`)
    const receipt = await tx.wait()
    if (receipt.status !== 1) throw new Error(`upgradeTo failed ${tx.hash}`)
    const implAfter = await readImpl(baseProvider, AAC)
    if (implAfter !== CLOSED_SETTLER) {
      throw new Error(`impl after upgrade ${implAfter} != ${CLOSED_SETTLER}`)
    }
    console.log(`[F1-upgrade] OK impl=${implAfter} block=${receipt.blockNumber}`)
    upgrade = {
      skipped: false,
      dryRun: false,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      implAfter,
    }
  }

  const r1 = await revokeOnChain('F1-CoNET-removeAdmin', CONET_RPC, 224422)
  const r2 = await revokeOnChain('F1-Base-removeAdmin', BASE_RPC, 8453)

  const implNow = await readImpl(baseProvider, AAC)
  const smoke = await checkSettleClosed(baseProvider)
  const conetGb = new Contract(GB, GB_ABI, new JsonRpcProvider(CONET_RPC, 224422))
  const baseGb = new Contract(GB, GB_ABI, baseProvider)
  const admins = {
    conetAac: await conetGb.admins(AAC),
    baseAac: await baseGb.admins(AAC),
    conetOwner: await conetGb.admins(OWNER),
    baseOwner: await baseGb.admins(OWNER),
  }
  console.log('[F1-verify]', { implNow, smoke, admins })

  const ok =
    EXECUTE &&
    implNow === CLOSED_SETTLER &&
    smoke.settleClosed &&
    smoke.canarySelectorGone &&
    admins.conetAac === false &&
    admins.baseAac === false

  const out = {
    phase: 'F1',
    status: EXECUTE ? (ok ? 'EXECUTED' : 'FAILED') : 'DRY_RUN',
    executedAt: new Date().toISOString(),
    ownerAuth: '请依据审计报告, 依次移除生产前障碍',
    proxy: AAC,
    closedSettler: CLOSED_SETTLER,
    canaryImpl: CANARY_IMPL,
    implBefore,
    implAfter: implNow,
    upgrade,
    removeAdmin: { conet: r1, base: r2 },
    verify: { smoke, admins },
    ok: EXECUTE ? ok : null,
  }

  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const path = join(ROOT, 'deployments/phase-F1-off-canary.json')
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n')
  console.log(`[F1] wrote ${path} status=${out.status}`)
  if (EXECUTE && !ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
