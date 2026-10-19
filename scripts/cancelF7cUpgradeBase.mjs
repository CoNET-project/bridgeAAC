#!/usr/bin/env node
/**
 * Cancel the scheduled SettlerF7c upgrade on the live Base AAC proxy 0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd.
 *
 *   node scripts/cancelF7cUpgradeBase.mjs         # dry run: read the pending upgrade and simulate cancelUpgrade from the owner
 *   node scripts/cancelF7cUpgradeBase.mjs --send  # send cancelUpgrade() from the owner and verify the cleared state
 *
 * F7c calls the original cover 0x01506527...233 directly, without the header
 * authority or the Base header binding. Upgrading to it would put that defect in
 * the mint path. cancelUpgrade() has no time lock, so it can run at any time before
 * upgradeTo. The signer is the owner key, read in-process from the file named by OWNER_KEY_FILE,
 * and never printed.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEthers() {
  for (const candidate of [resolve(ROOT, '../../package.json'), resolve(ROOT, '../package.json')]) {
    try {
      return createRequire(candidate)('ethers')
    } catch {
      // try the next candidate
    }
  }
  return createRequire(import.meta.url)('ethers')
}

const { JsonRpcProvider, Wallet, ethers } = loadEthers()

const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const PROXY = '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const F7C = '0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44'

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  const k = raw.settle_contractAdmin?.[0]
  if (typeof k !== 'string' || !/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('settle_contractAdmin[0] missing or not 64 hex')
  }
  return `0x${k}`
}

const sel = (sig) => ethers.id(sig).slice(0, 10)

async function readState(provider) {
  const pending = ethers.getAddress('0x' + (await provider.call({ to: PROXY, data: sel('pendingImplementation()') })).slice(-40))
  const readyAt = BigInt(await provider.call({ to: PROXY, data: sel('upgradeReadyAt()') }))
  const owner = ethers.getAddress('0x' + (await provider.call({ to: PROXY, data: sel('owner()') })).slice(-40))
  return { owner, pending, upgradeReadyAt: readyAt.toString(), upgradeReadyAtUtc: readyAt ? new Date(Number(readyAt) * 1000).toISOString() : null }
}

async function main() {
  const send = process.argv.includes('--send')
  const provider = new JsonRpcProvider(RPC, 8453)
  const network = await provider.getNetwork()
  if (network.chainId !== 8453n) throw new Error(`RPC chain id ${network.chainId} is not 8453`)

  const before = await readState(provider)
  console.log(JSON.stringify({ mode: send ? 'send' : 'dry-run', rpc: RPC, proxy: PROXY, before }, null, 2))
  if (before.owner.toLowerCase() !== OWNER.toLowerCase()) throw new Error(`proxy owner is ${before.owner}, not ${OWNER}`)
  if (before.pending.toLowerCase() !== F7C.toLowerCase()) {
    console.log('No F7c upgrade is pending. Nothing to cancel.')
    return
  }

  const data = sel('cancelUpgrade()')
  await provider.call({ from: OWNER, to: PROXY, data })
  console.log('simulation: cancelUpgrade() from the owner succeeds')
  if (!send) return

  const wallet = new Wallet(loadOwnerKey(), provider)
  if (wallet.address.toLowerCase() !== OWNER.toLowerCase()) throw new Error(`signer ${wallet.address} is not the owner`)
  const tx = await wallet.sendTransaction({ to: PROXY, data })
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`cancelUpgrade failed: ${tx.hash}`)

  const after = await readState(provider)
  console.log(JSON.stringify({ cancelTx: tx.hash, blockNumber: receipt.blockNumber, after }, null, 2))
  if (after.pending !== ethers.ZeroAddress || after.upgradeReadyAt !== '0') throw new Error('pending upgrade was not cleared')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
