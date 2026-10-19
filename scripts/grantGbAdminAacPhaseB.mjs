#!/usr/bin/env node
/**
 * Cutover Phase B: GB.addAdmin(AAC proxy) on CoNET + Base.
 * Owner-authorized B1/B2 only. Does not unpause canaries, open settle, or grant Treasury.
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
  'function addAdmin(address account)',
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

async function grantOnChain(label, rpc, chainIdExpected) {
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
  console.log(`[${label}] signer=${wallet.address} admins(OWNER)=${beforeOwner} admins(AAC)=${beforeAac}`)
  if (!beforeOwner) throw new Error(`${label}: signer is not GB admin`)
  if (beforeAac) {
    console.log(`[${label}] AAC already admin — skip send`)
    return { chain: label, chainId: chainIdExpected, skipped: true, txHash: null, adminsAac: true }
  }
  const tx = await gb.addAdmin(AAC)
  console.log(`[${label}] sent ${tx.hash}`)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label}: tx failed ${tx.hash}`)
  const afterAac = await gb.admins(AAC)
  if (!afterAac) throw new Error(`${label}: admins(AAC) still false after ${tx.hash}`)
  console.log(`[${label}] OK admins(AAC)=true block=${receipt.blockNumber}`)
  return {
    chain: label,
    chainId: chainIdExpected,
    skipped: false,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    adminsAac: true,
  }
}

async function main() {
  const b1 = await grantOnChain('B1-CoNET', CONET_RPC, 224422)
  const b2 = await grantOnChain('B2-Base', BASE_RPC, 8453)

  // Post-grant settle still closed (Base proxy)
  const { Interface } = loadEthers()
  const settlerIface = new Interface(['function settle()'])
  const baseProvider = new JsonRpcProvider(BASE_RPC, 8453)
  let settleClosed = false
  try {
    await baseProvider.call({ to: AAC, data: settlerIface.encodeFunctionData('settle', []) })
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e)
    settleClosed = /CustodyClosed|0x61839255/i.test(msg) || msg.includes('execution reverted')
    console.log(`[smoke] settle() revert (expect CustodyClosed): ${msg.slice(0, 120)}`)
  }

  const out = {
    phase: 'B',
    executedAt: new Date().toISOString(),
    owner: OWNER,
    aacProxy: AAC,
    gbToken: GB,
    grants: [b1, b2],
    postGrant: {
      settleStillClosed: settleClosed,
      note: 'consume-once still records marks only; no mintPaid called in this task',
    },
  }
  const dir = join(ROOT, 'deployments')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'phase-B-gb-addAdmin-aac.json')
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n')
  console.log(`wrote ${path}`)
  if (!b1.adminsAac || !b2.adminsAac) process.exit(1)
  if (!settleClosed) {
    console.warn('WARN: settle() did not clearly revert CustodyClosed — inspect manually')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
