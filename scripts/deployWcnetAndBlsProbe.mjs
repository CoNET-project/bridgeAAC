/**
 * Deploy canonical wCNET (TreasuryCanonicalERC20V3) on CoNET and Base.
 * CoNET enables 1:1 native wrap. Base wrap stays off.
 * Does not open source initiate, does not set the CoNET settler, does not
 * add chain 224422 to aacDestinationOpen.
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
const { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress, id } = createRequire(
  join(REPO, 'package.json'),
)('ethers')

const OWNER = '0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const EFFECT = '0x0661C8116D027907e387667Df5aCad2F2E9ad30b'
const SOLC = `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const WRAP_WEI = 1_000_000_000_000_000n

const tokenAbi = [
  'function initialize(string,string,uint8,address,address,string)',
  'function setNativeWrapEnabled(bool)',
  'function deposit() payable',
  'function withdraw(uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function nativeWrapEnabled() view returns (bool)',
  'function symbol() view returns (string)',
  'function hasRole(bytes32,address) view returns (bool)',
]
const probeAbi = ['function available() view returns (bool)']
const effectAbi = ['function settler() view returns (address)']

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

function artifact(rel) {
  const json = JSON.parse(readFileSync(join(REPO, rel), 'utf8'))
  const bytecode = typeof json.bytecode === 'string' ? json.bytecode : json.bytecode.object
  return { abi: json.abi, bytecode }
}

function compileProbe() {
  const source = readFileSync(join(ROOT, 'contracts', 'AacEthereumBlsProbe.sol'), 'utf8')
  const input = {
    language: 'Solidity',
    sources: { 'contracts/AacEthereumBlsProbe.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 2 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(join(ROOT, 'deployments', 'conet-AacEthereumBlsProbe-standard-input.json'), JSON.stringify(input))
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const errors = (out.errors || []).filter((item) => item.severity === 'error')
  if (errors.length) throw new Error(errors.map((item) => item.message).join('\n'))
  return out.contracts['contracts/AacEthereumBlsProbe.sol'].AacEthereumBlsProbe
}

async function deploy(factory, args) {
  const contract = await factory.deploy(...args)
  const receipt = await contract.deploymentTransaction().wait()
  return { address: getAddress(await contract.getAddress()), tx: receipt.hash }
}

async function deployToken(wallet, wrap) {
  const tokenArt = artifact('artifacts/src/b-unit/TreasuryCanonicalERC20V3.sol/TreasuryCanonicalERC20V3.json')
  const proxyArt = artifact('artifacts/src/b-unit/AacErc1967Proxy.sol/AacErc1967Proxy.json')
  const impl = await deploy(new ContractFactory(tokenArt.abi, tokenArt.bytecode, wallet), [])
  const init = new Contract(impl.address, tokenAbi).interface.encodeFunctionData('initialize', [
    'Wrapped CoNET',
    'wCNET',
    18,
    OWNER,
    TREASURY,
    '',
  ])
  const proxy = await deploy(new ContractFactory(proxyArt.abi, proxyArt.bytecode, wallet), [impl.address, init])
  const token = new Contract(proxy.address, tokenAbi, wallet)
  if (wrap) {
    const tx = await token.setNativeWrapEnabled(true)
    await tx.wait()
  }
  return { impl, proxy, token }
}

async function main() {
  const key = loadOwnerKey()
  const report = { chains: {}, blsProbe: null }
  const chains = [
    { name: 'conet', url: 'https://rpc1.conet.network', chainId: 224422, wrap: true },
    { name: 'base', url: 'https://base-rpc.conet.network', chainId: 8453, wrap: false },
  ]
  for (const chain of chains) {
    const provider = new JsonRpcProvider(chain.url, chain.chainId)
    const wallet = new Wallet(key, provider)
    const deployed = await deployToken(wallet, chain.wrap)
    const token = deployed.token
    const symbol = await token.symbol()
    const wrapOn = await token.nativeWrapEnabled()
    if (symbol !== 'wCNET') throw new Error(`${chain.name} symbol ${symbol}`)
    if (wrapOn !== chain.wrap) throw new Error(`${chain.name} wrap ${wrapOn}`)
    if (!(await token.hasRole(id('BRIDGE_ROLE'), TREASURY))) throw new Error(`${chain.name} treasury is not bridge`)
    let wrapProof = null
    if (chain.wrap) {
      const before = await provider.getBalance(OWNER)
      if (before < WRAP_WEI * 2n) throw new Error('owner CNET balance too low for wrap proof')
      const dep = await token.deposit({ value: WRAP_WEI })
      await dep.wait()
      const bal = await token.balanceOf(OWNER)
      if (bal !== WRAP_WEI) throw new Error(`wrapped balance ${bal}`)
      const wd = await token.withdraw(WRAP_WEI)
      await wd.wait()
      if ((await token.balanceOf(OWNER)) !== 0n) throw new Error('withdraw left a balance')
      wrapProof = { depositTx: dep.hash, withdrawTx: wd.hash, amountWei: WRAP_WEI.toString() }
    }
    report.chains[chain.name] = {
      token: deployed.proxy.address,
      impl: deployed.impl.address,
      implTx: deployed.impl.tx,
      proxyTx: deployed.proxy.tx,
      nativeWrapEnabled: wrapOn,
      bridge: TREASURY,
      wrapProof,
    }
    console.log(chain.name, deployed.proxy.address, 'impl', deployed.impl.address)
  }

  const conet = new JsonRpcProvider('https://rpc1.conet.network', 224422)
  const conetWallet = new Wallet(key, conet)
  const probeArt = compileProbe()
  const probe = await deploy(
    new ContractFactory(probeArt.abi, '0x' + probeArt.evm.bytecode.object, conetWallet),
    [],
  )
  const available = await new Contract(probe.address, probeAbi, conet).available()
  if (available) throw new Error('BLS probe unexpectedly available')
  const settler = await new Contract(EFFECT, effectAbi, conet).settler()
  if (settler !== '0x0000000000000000000000000000000000000000') throw new Error('settler was set')
  report.blsProbe = { address: probe.address, tx: probe.tx, available: false, settler }
  console.log('bls probe', probe.address, 'available', available)

  writeFileSync(join(ROOT, 'deployments', 'phase-wcnet.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
