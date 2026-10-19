/**
 * Open Base destination 224422 and source initiate, then lock 0.01 USDC
 * toward CoNET. Does not set the CoNET settler and does not open CoNET
 * source initiate. The receipt is the sample for the period-1884 proof.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(ROOT, '../..')
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } = createRequire(join(REPO, 'package.json'))('ethers')

const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const CONET_USDC = '0x5209865D404aA5646eDe5B91CD4218909eA72eDA'
const AMOUNT = 10_000n
const CONET = 224422n

function loadOwnerKey() {
  const raw = readOwnerKeyFile()
  for (const list of [raw.settle_contractAdmin, raw.beamio_Admins]) {
    if (!Array.isArray(list)) continue
    for (const key of list) {
      if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`
    }
  }
  throw new Error('no admin key')
}

async function main() {
  const provider = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const wallet = new Wallet(loadOwnerKey(), provider)
  const treasury = new Contract(TREASURY, [
    'function setAacDestinationOpen(uint256,bool)',
    'function setSourceInitiateOpen(bool)',
    'function aacDestinationOpen(uint256) view returns (bool)',
    'function sourceInitiateOpen() view returns (bool)',
    'function initiateLockMint(uint256,address,address,address[],uint256[],bytes32,uint256) returns (bytes32)',
  ], wallet)
  const usdc = new Contract(USDC, [
    'function approve(address,uint256) returns (bool)',
    'function allowance(address,address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
  ], wallet)
  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const conetOpen = await new Contract(TREASURY, ['function sourceInitiateOpen() view returns (bool)'], conet).sourceInitiateOpen()
  if (conetOpen) throw new Error('CoNET source initiate must stay closed')
  if ((await usdc.balanceOf(wallet.address)) < AMOUNT) throw new Error('owner USDC balance is below 0.01')

  if (!(await treasury.aacDestinationOpen(CONET))) {
    const tx = await treasury.setAacDestinationOpen(CONET, true)
    console.log('dest', tx.hash)
    await tx.wait()
  }
  if (!(await treasury.sourceInitiateOpen())) {
    const tx = await treasury.setSourceInitiateOpen(true)
    console.log('initiate', tx.hash)
    await tx.wait()
  }
  if ((await usdc.allowance(wallet.address, TREASURY)) < AMOUNT) {
    const tx = await usdc.approve(TREASURY, AMOUNT)
    console.log('approve', tx.hash)
    await tx.wait()
  }
  const nonce = BigInt(Date.now())
  const sourceTxHash = keccak256(toUtf8Bytes(`aac-base-conet-canary-${nonce}`))
  const tx = await treasury.initiateLockMint(CONET, USDC, CONET_USDC, [wallet.address], [AMOUNT], sourceTxHash, nonce)
  console.log('lock', tx.hash)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error('lock failed')
  const report = {
    amount6: AMOUNT.toString(),
    beneficiary: wallet.address,
    destinationChainId: CONET.toString(),
    sourceAsset: USDC,
    destinationAsset: CONET_USDC,
    nonce: nonce.toString(),
    sourceTxHash,
    lock: tx.hash,
    blockNumber: receipt.blockNumber,
    baseDestOpen: await treasury.aacDestinationOpen(CONET),
    baseInitiateOpen: await treasury.sourceInitiateOpen(),
    conetInitiateOpen: false,
  }
  writeFileSync(join(ROOT, 'deployments/phase-base-conet-canary-lock.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
