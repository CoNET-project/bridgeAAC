#!/usr/bin/env node
/**
 * Deploy AacCheckpointMessageCoverV2 on Base (chain 8453) and record it.
 *
 *   node scripts/deployAacCheckpointMessageCoverV2Base.mjs          # dry run: compile, size, balance, gas. No transaction.
 *   node scripts/deployAacCheckpointMessageCoverV2Base.mjs --deploy # send the deployment transaction and write the record.
 *
 * The signer is the contract admin key in the owner key file (OWNER_KEY_FILE). It is read in-process
 * and never printed. The V2 cover has no constructor arguments and no owner, so
 * the deployment grants no role and wires nothing. The production gate is not
 * changed.
 */
import { readOwnerKeyFile } from './lib/opsEnv.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const CHAIN_ID = 8453n
const COMPILER = '0.8.35+commit.47b9dedd'
const SOURCE = 'contracts/AacCheckpointMessageCoverV2.sol'
const IMPORT = 'contracts/AacBaseAnchorReceiptRoot.sol'
const CONTRACT = 'AacCheckpointMessageCoverV2'
const EIP170_LIMIT = 24576

// Constants the V2 cover reads. These must match the source: STORE, RECEIPT_VERIFIER, TREASURY, OUTPUT_ROOT_PROOF.
const EXPECTED = {
  STORE: '0xcEE3D699df3df07a573f1aFf642888B97B7aA961',
  RECEIPT_VERIFIER: '0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10',
  TREASURY: '0xa208982212978550594A7FEEB70a61665d129003',
  OUTPUT_ROOT_PROOF: '0x57A498086d00A7Da80c8304F6189712b583c34C4',
  BRIDGE_TOPIC: '0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba',
}

function loadDeployerKey() {
  const raw = readOwnerKeyFile()
  const k = raw.settle_contractAdmin?.[0]
  if (typeof k !== 'string' || !/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('settle_contractAdmin[0] missing or not 64 hex')
  }
  return `0x${k}`
}

function compile() {
  const source = readFileSync(join(ROOT, SOURCE), 'utf8')
  const imported = readFileSync(join(ROOT, IMPORT), 'utf8')
  const input = {
    language: 'Solidity',
    sources: {
      [SOURCE]: { content: source },
      [IMPORT]: { content: imported },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
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
  const r = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  const out = JSON.parse(r.stdout)
  const errors = (out.errors || []).filter((e) => e.severity === 'error')
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage || e.message).join('\n'))
  const c = out.contracts[SOURCE][CONTRACT]
  const creation = `0x${c.evm.bytecode.object}`
  const runtime = `0x${c.evm.deployedBytecode.object}`
  return { input, abi: c.abi, creation, runtime }
}

async function main() {
  const deploy = process.argv.includes('--deploy')
  const compiled = compile()
  const runtimeBytes = (compiled.runtime.length - 2) / 2
  const creationBytes = (compiled.creation.length - 2) / 2
  if (runtimeBytes > EIP170_LIMIT) throw new Error(`runtime ${runtimeBytes} bytes exceeds EIP-170 ${EIP170_LIMIT}`)

  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  const stdInputPath = join(ROOT, `deployments/base-${CONTRACT}-standard-input.json`)
  writeFileSync(stdInputPath, JSON.stringify(compiled.input, null, 2))

  const provider = new JsonRpcProvider(RPC, Number(CHAIN_ID))
  const network = await provider.getNetwork()
  if (network.chainId !== CHAIN_ID) throw new Error(`RPC chain id ${network.chainId} is not ${CHAIN_ID}`)
  const wallet = new Wallet(loadDeployerKey(), provider)
  const deployer = wallet.address
  const balance = await provider.getBalance(deployer)
  const nonce = await provider.getTransactionCount(deployer, 'latest')
  const predicted = ethers.getCreateAddress({ from: deployer, nonce })
  const feeData = await provider.getFeeData()
  const gas = await provider.estimateGas({ from: deployer, data: compiled.creation })

  const summary = {
    mode: deploy ? 'deploy' : 'dry-run',
    chainId: Number(CHAIN_ID),
    rpc: RPC,
    deployer,
    balanceEth: ethers.formatEther(balance),
    nonce,
    predictedAddress: predicted,
    runtimeBytes,
    creationBytes,
    gasEstimate: gas.toString(),
    maxFeePerGasGwei: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : null,
    estimatedCostEth: feeData.maxFeePerGas ? ethers.formatEther(gas * feeData.maxFeePerGas) : null,
    compiler: COMPILER,
    standardInput: stdInputPath,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (!deploy) return

  if (balance < gas * (feeData.maxFeePerGas ?? 0n)) throw new Error('deployer balance is below the estimated cost')
  const tx = await wallet.sendTransaction({ data: compiled.creation })
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error(`deployment transaction failed: ${tx.hash}`)
  const address = receipt.contractAddress
  if (address !== predicted) throw new Error(`deployed to ${address}, predicted ${predicted}`)
  const onchainRuntime = await provider.getCode(address)
  if (onchainRuntime.toLowerCase() !== compiled.runtime.toLowerCase()) {
    throw new Error('on-chain runtime does not match the compiled runtime')
  }

  const constants = {}
  const reader = new ethers.Contract(
    address,
    [
      'function STORE() view returns (address)',
      'function RECEIPT_VERIFIER() view returns (address)',
      'function TREASURY() view returns (address)',
      'function OUTPUT_ROOT_PROOF() view returns (address)',
      'function BRIDGE_TOPIC() view returns (bytes32)',
    ],
    provider,
  )
  for (const name of Object.keys(EXPECTED)) {
    const value = await reader[name]()
    if (value.toLowerCase() !== EXPECTED[name].toLowerCase()) throw new Error(`${name} mismatch: ${value}`)
    constants[name] = value
  }

  const record = {
    generatedAt: new Date().toISOString(),
    chainId: Number(CHAIN_ID),
    contract: CONTRACT,
    address,
    deployTx: tx.hash,
    blockNumber: receipt.blockNumber,
    deployer,
    compiler: COMPILER,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'cancun', bytecodeHash: 'none' },
    standardInput: `deployments/base-${CONTRACT}-standard-input.json`,
    runtimeBytes,
    runtimeCodeHash: ethers.keccak256(compiled.runtime),
    onchainRuntimeMatches: true,
    constants,
    wired: false,
    note: 'Not wired to any gate. The original cover 0x01506527a4Dab14141038Db15f5341dcF4729233 is unchanged.',
  }
  writeFileSync(join(ROOT, `deployments/base-${CONTRACT}.json`), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ deployed: address, deployTx: tx.hash, blockNumber: receipt.blockNumber }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
