/**
 * Base → CoNET locks that the installed settler can finish:
 *   GB LockMint (mode 1) — CoNET completion is mintPaid
 *   wCNET BurnRelease (mode 2) — CoNET completion releases wrapped inventory
 *   USDC LockMint — the treasury-issued canonical ERC20
 * Does not scheduleUpgrade, does not open CoNET destination 224422,
 * and does not mint unbacked wCNET on CoNET.
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
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const GB = '0xC3EF02DaE632b4C10abB66e07d92a387c10838D8'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_CONET = '0x5209865D404aA5646eDe5B91CD4218909eA72eDA'
const W_BASE = '0x0E01ca7a99B38a4E021C25B7BE01356E71158B66'
const W_CONET = '0x5a2D096968fC85861d8FDC7CE9A747Fe4bcb87D5'
const DEST = 224422n
const GB_AMOUNT = 1_000_000n
const USDC_AMOUNT = 1_000n
const W_AMOUNT = 100_000_000_000_000n

const policyTuple = 'tuple(uint256 sourceChainId, address sourceTreasury, address sourceAsset, address destinationAsset, uint8 mode, uint8 decimals, bool enabled, uint256 version)'

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

async function send(label, txPromise) {
  const tx = await txPromise
  console.log(label, tx.hash)
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`${label} failed`)
  return receipt
}

async function main() {
  const base = new JsonRpcProvider('https://base-rpc.conet.network', 8453)
  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const key = loadOwnerKey()
  const baseWallet = new Wallet(key, base)
  const conetWallet = new Wallet(key, conet)
  const baseTreasury = new Contract(TREASURY, [
    'function proposeAssetPolicy(' + policyTuple + ') returns (bytes32)',
    'function policyId(' + policyTuple + ') view returns (bytes32)',
    'function assetPolicy(bytes32) view returns (uint256 sourceChainId, address sourceTreasury, address sourceAsset, address destinationAsset, uint8 mode, uint8 decimals, bool enabled, uint256 version)',
    'function setBridgeAssetAuthorization(address,bool)',
    'function authorizedBridgeAsset(address) view returns (bool)',
    'function initiateLockMint(uint256,address,address,address[],uint256[],bytes32,uint256) returns (bytes32)',
    'function initiateBurnRelease(address,uint256,address,address[],uint256[],bytes32,uint256) returns (bytes32)',
    'function aacDestinationOpen(uint256) view returns (bool)',
    'function sourceInitiateOpen() view returns (bool)',
  ], baseWallet)
  if (!(await baseTreasury.aacDestinationOpen(DEST))) throw new Error('Base destination 224422 is closed')
  if (!(await baseTreasury.sourceInitiateOpen())) throw new Error('Base source initiate is closed')

  const gbConet = new Contract(GB, ['function admins(address) view returns (bool)', 'function addAdmin(address)'], conetWallet)
  if (!(await gbConet.admins(EFFECT))) {
    await send('gb addAdmin effect', gbConet.addAdmin(EFFECT))
  }

  async function ensurePolicy(asset, destAsset, mode, decimals) {
    const policy = {
      sourceChainId: 8453n,
      sourceTreasury: TREASURY,
      sourceAsset: asset,
      destinationAsset: destAsset,
      mode,
      decimals,
      enabled: true,
      version: 1n,
    }
    const id = await baseTreasury.policyId(policy)
    const current = await baseTreasury.assetPolicy(id)
    if (current.enabled) return id
    await send(`policy ${asset} mode ${mode}`, baseTreasury.proposeAssetPolicy(policy))
    const after = await baseTreasury.assetPolicy(id)
    if (!after.enabled) throw new Error('policy did not enable')
    return id
  }

  const gbId = await ensurePolicy(GB, GB, 1, 9)
  const usdcId = await ensurePolicy(USDC_BASE, USDC_CONET, 1, 6)

  const wcnet = new Contract(W_CONET, [
    'function deposit() payable',
    'function transfer(address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ], conetWallet)
  const treasuryW = await wcnet.balanceOf(TREASURY)
  if (treasuryW < W_AMOUNT) {
    if (await conet.getBalance(baseWallet.address) < W_AMOUNT) throw new Error('owner CNET is below the wrap amount')
    await send('wcnet deposit', wcnet.deposit({ value: W_AMOUNT }))
    await send('wcnet fund treasury', wcnet.transfer(TREASURY, W_AMOUNT))
  }

  const wbase = new Contract(W_BASE, [
    'function setTreasury(address)',
    'function setBridge(address)',
    'function revokeBridge(address)',
    'function mint(address,uint256)',
    'function hasRole(bytes32,address) view returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function TREASURY_ROLE() view returns (bytes32)',
    'function BRIDGE_ROLE() view returns (bytes32)',
  ], baseWallet)
  const treasuryRole = await wbase.TREASURY_ROLE()
  if (!(await wbase.hasRole(treasuryRole, TREASURY))) {
    await send('wcnet setTreasury', wbase.setTreasury(TREASURY))
  }
  const bridgeRole = await wbase.BRIDGE_ROLE()
  if ((await wbase.balanceOf(baseWallet.address)) < W_AMOUNT) {
    if (!(await wbase.hasRole(bridgeRole, baseWallet.address))) {
      await send('wcnet setBridge owner', wbase.setBridge(baseWallet.address))
    }
    await send('wcnet mint source', wbase.mint(baseWallet.address, W_AMOUNT))
    if (await wbase.hasRole(bridgeRole, baseWallet.address)) {
      await send('wcnet revokeBridge owner', wbase.revokeBridge(baseWallet.address))
    }
  }
  if (!(await baseTreasury.authorizedBridgeAsset(W_BASE))) {
    await send('wcnet authorize', baseTreasury.setBridgeAssetAuthorization(W_BASE, true))
  }
  const wId = await ensurePolicy(W_BASE, W_CONET, 2, 18)

  async function approve(token, amount) {
    const erc = new Contract(token, [
      'function approve(address,uint256) returns (bool)',
      'function allowance(address,address) view returns (uint256)',
    ], baseWallet)
    if ((await erc.allowance(baseWallet.address, TREASURY)) < amount) {
      await send(`approve ${token}`, erc.approve(TREASURY, amount))
    }
  }

  const locks = []
  async function record(name, asset, destAsset, mode, amount, policyId, receipt, sourceTxHash, nonce) {
    const block = await base.send('eth_getBlockByNumber', ['0x' + receipt.blockNumber.toString(16), false])
    locks.push({
      name,
      sourceAsset: asset,
      destinationAsset: destAsset,
      mode,
      amount: amount.toString(),
      policyId,
      beneficiary: baseWallet.address,
      nonce: nonce.toString(),
      sourceTxHash,
      lock: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: block.hash,
      parentBeaconBlockRoot: block.parentBeaconBlockRoot,
    })
  }

  await approve(GB, GB_AMOUNT)
  {
    const nonce = BigInt(Date.now())
    const sourceTxHash = keccak256(toUtf8Bytes(`aac-gb-${nonce}`))
    const receipt = await send('gb lock', baseTreasury.initiateLockMint(
      DEST, GB, GB, [baseWallet.address], [GB_AMOUNT], sourceTxHash, nonce,
    ))
    await record('gb', GB, GB, 1, GB_AMOUNT, gbId, receipt, sourceTxHash, nonce)
  }

  await approve(USDC_BASE, USDC_AMOUNT)
  {
    const nonce = BigInt(Date.now()) + 1n
    const sourceTxHash = keccak256(toUtf8Bytes(`aac-usdc-${nonce}`))
    const receipt = await send('usdc lock', baseTreasury.initiateLockMint(
      DEST, USDC_BASE, USDC_CONET, [baseWallet.address], [USDC_AMOUNT], sourceTxHash, nonce,
    ))
    await record('usdc', USDC_BASE, USDC_CONET, 1, USDC_AMOUNT, usdcId, receipt, sourceTxHash, nonce)
  }

  {
    const nonce = BigInt(Date.now()) + 2n
    const sourceTxHash = keccak256(toUtf8Bytes(`aac-wcnet-${nonce}`))
    const receipt = await send('wcnet burn-release', baseTreasury.initiateBurnRelease(
      W_BASE, DEST, W_CONET, [baseWallet.address], [W_AMOUNT], sourceTxHash, nonce,
    ))
    await record('wcnet', W_BASE, W_CONET, 2, W_AMOUNT, wId, receipt, sourceTxHash, nonce)
  }

  const report = { createdAt: new Date().toISOString(), locks }
  writeFileSync(join(ROOT, 'deployments/phase-asset-tests-lock.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
