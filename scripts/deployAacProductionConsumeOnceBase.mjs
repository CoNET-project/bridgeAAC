#!/usr/bin/env node
/**
 * Obstacle 4: deploy AacProductionConsumeOnce on Base and prove consume-once.
 * CoNET-origin path uses obstacle-3 rootReady (already true).
 * Does not unpause canary, does not upgrade 0x9051…, does not grant Treasury roles.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEthers() {
  for (const candidate of [resolve(ROOT, '../../package.json'), resolve(ROOT, '../package.json')]) {
    if (existsSync(candidate)) return createRequire(candidate)('ethers')
  }
  return createRequire(import.meta.url)('ethers')
}

const { Contract, ContractFactory, JsonRpcProvider, Wallet, id, Interface } = loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const CONET_FINALITY = '0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9'
const COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const COMPILER = '0.8.35+commit.47b9dedd'

function loadDeployerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  const k = raw.settle_contractAdmin?.[0]
  if (typeof k !== 'string' || !/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('settle_contractAdmin[0] missing or not 64 hex')
  }
  return `0x${k}`
}

function compile() {
  const consumeSrc = readFileSync(join(ROOT, 'contracts/AacProductionConsumeOnce.sol'), 'utf8')
  const proxySrc = readFileSync(join(ROOT, 'contracts/AacErc1967Proxy.sol'), 'utf8')
  const input = {
    language: 'Solidity',
    sources: {
      'contracts/AacProductionConsumeOnce.sol': { content: consumeSrc },
      'contracts/AacErc1967Proxy.sol': { content: proxySrc },
    },
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
        },
      },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const inputPath = join(ROOT, 'deployments/base-AacProductionConsumeOnce-standard-input.json')
  writeFileSync(inputPath, JSON.stringify(input, null, 2))
  const r = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  }
  const out = JSON.parse(r.stdout)
  if (out.errors?.some((e) => e.severity === 'error')) {
    throw new Error(out.errors.map((e) => e.formattedMessage || e.message).join('\n'))
  }
  const consume = out.contracts['contracts/AacProductionConsumeOnce.sol']
  const proxy = out.contracts['contracts/AacErc1967Proxy.sol'].AacErc1967Proxy
  return {
    inputPath,
    standardInput: input,
    impl: consume.AacProductionConsumeOnce,
    gateway: consume.AacProductionConsumeGateway,
    okEffect: consume.AacProductionConsumeOkEffect,
    revertEffect: consume.AacProductionConsumeRevertEffect,
    proxy,
  }
}

async function deployContract(wallet, abi, bytecode, args = []) {
  const factory = new ContractFactory(abi, bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`, wallet)
  const c = await factory.deploy(...args)
  await c.waitForDeployment()
  const tx = c.deploymentTransaction()
  const receipt = await tx.wait()
  return { address: await c.getAddress(), txHash: tx.hash, gasUsed: Number(receipt.gasUsed) }
}

async function main() {
  console.log(JSON.stringify({ phase: 'compile_start' }))
  const art = compile()
  console.log(
    JSON.stringify({
      phase: 'compile_ok',
      implBytes: art.impl.evm.bytecode.object.length / 2,
      proxyBytes: art.proxy.evm.bytecode.object.length / 2,
    }),
  )

  const provider = new JsonRpcProvider(RPC, 8453)
  const wallet = new Wallet(loadDeployerKey(), provider)
  const deployer = await wallet.getAddress()
  console.log(JSON.stringify({ phase: 'deployer', address: deployer, rpc: RPC }))

  const finality = new Contract(CONET_FINALITY, ['function rootReady() view returns (bool)'], provider)
  const rootReady = await finality.rootReady()
  if (!rootReady) throw new Error('obstacle 3 rootReady is false; cannot open CoNET-origin consume')

  const gw = await deployContract(wallet, art.gateway.abi, art.gateway.evm.bytecode.object, [deployer])
  console.log(JSON.stringify({ phase: 'gateway', ...gw }))
  const okFx = await deployContract(wallet, art.okEffect.abi, art.okEffect.evm.bytecode.object)
  console.log(JSON.stringify({ phase: 'okEffect', ...okFx }))
  const badFx = await deployContract(wallet, art.revertEffect.abi, art.revertEffect.evm.bytecode.object)
  console.log(JSON.stringify({ phase: 'revertEffect', ...badFx }))
  const impl = await deployContract(wallet, art.impl.abi, art.impl.evm.bytecode.object)
  console.log(JSON.stringify({ phase: 'implementation', ...impl }))

  const initData = new Interface(art.impl.abi).encodeFunctionData('initialize', [OWNER, gw.address])
  const proxy = await deployContract(wallet, art.proxy.abi, art.proxy.evm.bytecode.object, [impl.address, initData])
  console.log(JSON.stringify({ phase: 'proxy', ...proxy }))

  const consumer = new Contract(proxy.address, art.impl.abi, wallet)
  const gateway = new Contract(gw.address, art.gateway.abi, wallet)

  const id1 = id('aac.obstacle4.consume.1')
  const id2 = id('aac.obstacle4.consume.fail-effect')
  const header = id('aac.obstacle4.header')
  const root = id('aac.obstacle4.root')
  const leaf1 = id('aac.obstacle4.leaf.1')
  const leaf2 = id('aac.obstacle4.leaf.2')
  const amount = 1_000_000n
  const ACTION_MINT = 1

  const consumeData = (aacId, leaf, effect) =>
    consumer.interface.encodeFunctionData('consumeAfterConetRoot', [
      aacId,
      header,
      root,
      leaf,
      ACTION_MINT,
      amount,
      effect,
    ])

  const tx1 = await gateway.forward(proxy.address, consumeData(id1, leaf1, okFx.address))
  const rc1 = await tx1.wait()
  const consumed1 = await consumer.isConsumed(id1)
  const minted1 = await consumer.mintedOf(id1)
  console.log(
    JSON.stringify({
      phase: 'consume_ok',
      tx: tx1.hash,
      gasUsed: Number(rc1.gasUsed),
      consumed: consumed1,
      minted: minted1.toString(),
    }),
  )
  if (!consumed1 || minted1 !== amount) throw new Error('consume_ok failed state')

  let doubleReverted = false
  let doubleError = ''
  try {
    const tx = await gateway.forward(proxy.address, consumeData(id1, leaf1, okFx.address))
    await tx.wait()
  } catch (e) {
    doubleReverted = true
    doubleError = e.shortMessage || e.message || String(e)
  }
  console.log(JSON.stringify({ phase: 'consume_double', reverted: doubleReverted, error: doubleError.slice(0, 240) }))
  if (!doubleReverted) throw new Error('second consume did not revert')

  let effectReverted = false
  let effectError = ''
  try {
    const tx = await gateway.forward(proxy.address, consumeData(id2, leaf2, badFx.address))
    await tx.wait()
  } catch (e) {
    effectReverted = true
    effectError = e.shortMessage || e.message || String(e)
  }
  const consumed2 = await consumer.isConsumed(id2)
  const minted2 = await consumer.mintedOf(id2)
  console.log(
    JSON.stringify({
      phase: 'consume_effect_fail',
      reverted: effectReverted,
      error: effectError.slice(0, 240),
      consumed: consumed2,
      minted: minted2.toString(),
    }),
  )
  if (!effectReverted || consumed2 || minted2 !== 0n) {
    throw new Error('failed effect left consume/mint mark')
  }

  const views = {
    admin: await consumer.admin(),
    gateway: await consumer.gateway(),
    cover: await consumer.COVER(),
    conetFinality: await consumer.CONET_FINALITY(),
    rootReady: true,
    consumedId1: consumed1,
    mintedId1: minted1.toString(),
    consumedId2: consumed2,
    mintedId2: minted2.toString(),
  }

  const snap = {
    chainId: 8453,
    generatedAt: new Date().toISOString(),
    proxy: proxy.address,
    implementation: impl.address,
    gateway: gw.address,
    okEffect: okFx.address,
    revertEffect: badFx.address,
    owner: OWNER,
    deployer,
    cover: COVER,
    conetFinality: CONET_FINALITY,
    compiler: COMPILER,
    settings: {
      viaIR: true,
      optimizerRuns: 2,
      bytecodeHash: 'none',
      evmVersion: 'cancun',
    },
    proofPath: 'conet-origin-rootReady',
    smoke: {
      id1,
      id2,
      amount: amount.toString(),
      action: 'mint',
      consumeOkTx: tx1.hash,
      consumeOkGasUsed: Number(rc1.gasUsed),
      doubleConsumeReverted: true,
      failedEffectReverted: true,
      failedEffectLeftUnconsumed: true,
    },
    views,
    transactions: {
      gateway: gw.txHash,
      okEffect: okFx.txHash,
      revertEffect: badFx.txHash,
      implementation: impl.txHash,
      proxy: proxy.txHash,
      consumeOk: tx1.hash,
    },
    custody: 'closed',
    obstacle: 4,
    standardJson: 'deployments/base-AacProductionConsumeOnce-standard-input.json',
    excluded: {
      specificationConsumeOnce: '0xA13843C75f68F726e1DC4dbA75d07597EE18d999',
      pausedCanaryBase: '0x04e07edd…',
      pausedCanaryConet: '0xc9a4BCc0…',
      settleProxy: '0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd',
    },
  }
  const outPath = join(ROOT, 'deployments/base-AacProductionConsumeOnce.json')
  writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n')
  console.log(JSON.stringify({ phase: 'written', path: outPath, proxy: proxy.address }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
