/**
 * Deploy the CoNET-side Base receipt verifier and destination-224422 settler.
 * Does not call setSettler. Does not open Base source initiate.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO = resolve(ROOT, '../..')
const { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } = createRequire(
  join(REPO, 'package.json'),
)('ethers')

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const PROBE = '0x864896C7dD5CA603AA11C3dC0BA329EB78Cc5F78'

function loadOwnerKey() {
  const raw = JSON.parse(readFileSync(join(homedir(), '.master.json'), 'utf8'))
  for (const list of [raw.settle_contractAdmin, raw.beamio_Admins]) {
    if (!Array.isArray(list)) continue
    for (const key of list) {
      if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)) return `0x${key}`
    }
  }
  throw new Error('no admin key')
}

function readText(name) {
  return readFileSync(join(ROOT, 'contracts', name), 'utf8')
}

function compile(names, outName) {
  const sources = {}
  for (const name of names) sources[`contracts/${name}`] = { content: readText(name) }
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(join(ROOT, 'deployments', outName), JSON.stringify(input))
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const errors = (out.errors || []).filter((item) => item.severity === 'error')
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage || item.message).join('\n'))
  return { input, out }
}

function art(compiled, file, name) {
  const item = compiled.out.contracts[`contracts/${file}`][name]
  const deployed = item.evm.deployedBytecode.object
  const bytes = deployed.length / 2
  if (bytes > 24576) throw new Error(`${name} runtime ${bytes}`)
  console.log(name, 'runtime', bytes)
  return item
}

async function deploy(factory, args) {
  const contract = await factory.deploy(...args)
  const receipt = await contract.deploymentTransaction().wait()
  return { address: getAddress(await contract.getAddress()), tx: receipt.hash }
}

async function main() {
  throw new Error('superseded by scripts/redeployBlsProbe.mjs; this script would deploy a second checkpoint')
  const key = loadOwnerKey()
  const provider = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const wallet = new Wallet(key, provider)
  const probe = new Contract(PROBE, ['function available() view returns (bool)'], provider)
  if (await probe.available()) throw new Error('probe already available; this deploy must not setSettler blindly')
  const chainEffect = new Contract(EFFECT, ['function settler() view returns (address)'], provider)
  if ((await chainEffect.settler()) !== '0x0000000000000000000000000000000000000000') throw new Error('settler already set')

  const receiptC = compile(['AacReceiptMptVerifier.sol'], 'conet-AacReceiptMptVerifier-standard-input.json')
  const storeC = compile(['AacEthereumCheckpointRoot.sol'], 'conet-AacEthereumCheckpointRoot-standard-input.json')
  const effectC = compile(['AacBridgeEffect.sol'], 'conet-AacBridgeEffect-standard-input.json')
  const coverC = compile(['AacConetBaseMessageCover.sol'], 'conet-AacConetBaseMessageCover-standard-input.json')
  const settlerC = compile(['AacConetBaseSettler.sol'], 'conet-AacConetBaseSettler-standard-input.json')
  const receipt = art(receiptC, 'AacReceiptMptVerifier.sol', 'AacReceiptMptVerifier')
  const store = art(storeC, 'AacEthereumCheckpointRoot.sol', 'AacEthereumCheckpointRoot')
  const effect = art(effectC, 'AacBridgeEffect.sol', 'AacBridgeEffect')
  const cover = art(coverC, 'AacConetBaseMessageCover.sol', 'AacConetBaseMessageCover')
  const settler = art(settlerC, 'AacConetBaseSettler.sol', 'AacConetBaseSettler')
  const proxyArt = JSON.parse(
    readFileSync(join(REPO, 'artifacts/src/b-unit/AacErc1967Proxy.sol/AacErc1967Proxy.json'), 'utf8'),
  )
  const proxyBytecode = typeof proxyArt.bytecode === 'string' ? proxyArt.bytecode : proxyArt.bytecode.object

  const receiptDeployed = await deploy(new ContractFactory(receipt.abi, '0x' + receipt.evm.bytecode.object, wallet), [])
  const storeImpl = await deploy(new ContractFactory(store.abi, '0x' + store.evm.bytecode.object, wallet), [])
  const init = new Contract(storeImpl.address, store.abi).interface.encodeFunctionData('initialize', [OWNER])
  const storeProxy = await deploy(new ContractFactory(proxyArt.abi, proxyBytecode, wallet), [storeImpl.address, init])
  const effectDeployed = await deploy(new ContractFactory(effect.abi, '0x' + effect.evm.bytecode.object, wallet), [])
  const coverDeployed = await deploy(new ContractFactory(cover.abi, '0x' + cover.evm.bytecode.object, wallet), [
    storeProxy.address,
    receiptDeployed.address,
  ])
  const settlerDeployed = await deploy(new ContractFactory(settler.abi, '0x' + settler.evm.bytecode.object, wallet), [
    coverDeployed.address,
    effectDeployed.address,
  ])

  if ((await chainEffect.settler()) !== '0x0000000000000000000000000000000000000000') throw new Error('settler was set')
  const live = new Contract(
    settlerDeployed.address,
    ['function settle(tuple(bytes,bytes,tuple(uint256,uint256,bytes32,bytes32,bytes32),uint256,bytes),tuple(uint256,uint256,bytes32,bytes32,bytes32),bytes32[7],bytes,bytes,bytes[],uint64,uint256,tuple(uint256,uint256,bytes32,bytes32,bytes32)[],address)'],
    provider,
  )
  let reverted = false
  try {
    await live.settle.staticCall(
      ['0x', '0x', [0, 0, '0x' + '00'.repeat(32), '0x' + '00'.repeat(32), '0x' + '00'.repeat(32)], 0, '0x'],
      [0, 0, '0x' + '00'.repeat(32), '0x' + '00'.repeat(32), '0x' + '00'.repeat(32)],
      Array(7).fill('0x' + '00'.repeat(32)),
      '0x',
      '0x',
      [],
      0,
      0,
      [],
      OWNER,
    )
  } catch (error) {
    const blob = `${error?.data || ''} ${error?.info?.error?.data || ''} ${error?.shortMessage || ''}`
    reverted = blob.toLowerCase().includes('3e5a86c8') || /precompile|revert/i.test(blob)
    if (!reverted) throw error
  }
  if (!reverted) throw new Error('empty settle did not revert')

  const report = {
    receiptVerifier: receiptDeployed,
    checkpointImpl: storeImpl,
    checkpoint: storeProxy,
    effectReader: effectDeployed,
    cover: coverDeployed,
    settler: settlerDeployed,
    probeAvailable: false,
    chainEffectSettler: await chainEffect.settler(),
  }
  writeFileSync(join(ROOT, 'deployments', 'phase-conet-base-verifier.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
