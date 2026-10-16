/**
 * Replace the BLS probe that treated a reverting precompile as missing.
 * Redeploy the cover and settler that bind the probe. Does not call setSettler
 * and does not open Base source initiate.
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
const OLD_PROBE = '0x864896C7dD5CA603AA11C3dC0BA329EB78Cc5F78'
const STORE = '0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a'
const RECEIPT = '0x6B44d8469c902F0BbF74333AAfE7E164D020943f'
const EFFECT_READER = '0x3EFD6b90A19B5d1027b734460672A330764c27Df'
const RPC = 'https://rpc1.conet.network'
const SCAN = 'https://mainnet.conet.network'
const COMPILER = 'v0.8.35+commit.47b9dedd'

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
  const jsonPath = join(ROOT, 'deployments', outName)
  writeFileSync(jsonPath, JSON.stringify(input))
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const errors = (out.errors || []).filter((item) => item.severity === 'error')
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage || item.message).join('\n'))
  return { out, jsonPath }
}

function art(compiled, file, name) {
  const item = compiled.out.contracts[`contracts/${file}`][name]
  const bytes = item.evm.deployedBytecode.object.length / 2
  if (bytes > 24576) throw new Error(`${name} runtime ${bytes}`)
  console.log(name, 'runtime', bytes)
  return item
}

async function deploy(factory, args) {
  const contract = await factory.deploy(...args)
  const receipt = await contract.deploymentTransaction().wait()
  return { address: getAddress(await contract.getAddress()), tx: receipt.hash }
}

function localBytecode(jsonPath, file, name) {
  const compiled = spawnSync(SOLC, ['--standard-json'], {
    input: readFileSync(jsonPath),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.stdout)
  const out = JSON.parse(compiled.stdout)
  const object = out.contracts?.[file]?.[name]?.evm?.deployedBytecode?.object
  if (!object) throw new Error(`no bytecode for ${name}`)
  return object.toLowerCase()
}

async function onchain(addr) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addr, 'latest'] }),
  })
  return (await response.json()).result.replace(/^0x/i, '').toLowerCase()
}

function immutableOk(local, chain) {
  if (local === chain) return true
  if (local.length !== chain.length) return false
  for (let i = 0; i < local.length; i++) {
    if (local[i] === chain[i]) continue
    if (local.slice(i, i + 40) === '0'.repeat(40) && /^[0-9a-f]{40}$/.test(chain.slice(i, i + 40))) {
      i += 39
      continue
    }
    return false
  }
  return true
}

async function submit(jsonPath, file, name, addr) {
  const local = localBytecode(jsonPath, file, name)
  const chain = await onchain(addr)
  if (!immutableOk(local, chain)) throw new Error(`bytecode mismatch ${name}`)
  const form = new FormData()
  form.set('compiler_version', COMPILER)
  form.set('contract_name', `${file}:${name}`)
  form.set('autodetect_constructor_args', 'true')
  form.set('license_type', 'mit')
  form.set('files[0]', new File([readFileSync(jsonPath)], 'standard-input.json', { type: 'application/json' }))
  const response = await fetch(`${SCAN}/api/v2/smart-contracts/${addr}/verification/via/standard-input`, {
    method: 'POST',
    body: form,
  })
  const text = await response.text()
  console.log('submit', name, response.status, text.slice(0, 240))
  if (!response.ok) throw new Error(`verify submit failed ${name}`)
}

async function waitVerified(addr, name) {
  for (let i = 0; i < 90; i++) {
    const response = await fetch(`${SCAN}/api/v2/smart-contracts/${addr}`)
    const body = await response.json()
    if (body.is_verified || body.is_partially_verified) {
      console.log('verified', name, addr, body.is_verified, body.is_partially_verified)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
  throw new Error(`Blockscout did not verify ${name} ${addr}`)
}

async function main() {
  const key = loadOwnerKey()
  const provider = new JsonRpcProvider(RPC, 224422)
  const wallet = new Wallet(key, provider)
  const oldProbe = new Contract(OLD_PROBE, ['function available() view returns (bool)'], provider)
  if (await oldProbe.available()) throw new Error('old probe already true; do not redeploy blindly')
  const chainEffect = new Contract(EFFECT, ['function settler() view returns (address)'], provider)
  if ((await chainEffect.settler()) !== '0x0000000000000000000000000000000000000000') {
    throw new Error('settler already set')
  }

  const probeC = compile(['AacEthereumBlsProbe.sol'], 'conet-AacEthereumBlsProbe-v3-standard-input.json')
  const probeArt = art(probeC, 'AacEthereumBlsProbe.sol', 'AacEthereumBlsProbe')
  const probe = await deploy(new ContractFactory(probeArt.abi, '0x' + probeArt.evm.bytecode.object, wallet), [])
  const liveProbe = new Contract(probe.address, ['function available() view returns (bool)'], provider)
  if (!(await liveProbe.available())) throw new Error('new probe still false on rpc1')

  const coverC = compile(['AacConetBaseMessageCover.sol'], 'conet-AacConetBaseMessageCover-v3-standard-input.json')
  const settlerC = compile(['AacConetBaseSettler.sol'], 'conet-AacConetBaseSettler-v3-standard-input.json')
  const coverArt = art(coverC, 'AacConetBaseMessageCover.sol', 'AacConetBaseMessageCover')
  const settlerArt = art(settlerC, 'AacConetBaseSettler.sol', 'AacConetBaseSettler')
  const cover = await deploy(new ContractFactory(coverArt.abi, '0x' + coverArt.evm.bytecode.object, wallet), [
    STORE,
    RECEIPT,
    probe.address,
  ])
  const settler = await deploy(new ContractFactory(settlerArt.abi, '0x' + settlerArt.evm.bytecode.object, wallet), [
    cover.address,
    EFFECT_READER,
    probe.address,
  ])
  if ((await chainEffect.settler()) !== '0x0000000000000000000000000000000000000000') throw new Error('settler was set')

  const report = {
    oldProbe: OLD_PROBE,
    probe,
    cover,
    settler,
    checkpoint: STORE,
    receiptVerifier: RECEIPT,
    effectReader: EFFECT_READER,
    probeAvailable: true,
    chainEffectSettler: await chainEffect.settler(),
    note: 'setSettler stays unset until a committee is installed and a real Base receipt proof is covered',
  }
  writeFileSync(join(ROOT, 'deployments', 'phase-conet-bls-probe.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))

  const jobs = [
    [probeC.jsonPath, 'contracts/AacEthereumBlsProbe.sol', 'AacEthereumBlsProbe', probe.address],
    [coverC.jsonPath, 'contracts/AacConetBaseMessageCover.sol', 'AacConetBaseMessageCover', cover.address],
    [settlerC.jsonPath, 'contracts/AacConetBaseSettler.sol', 'AacConetBaseSettler', settler.address],
  ]
  for (const job of jobs) await submit(...job)
  for (const job of jobs) await waitVerified(job[3], job[2])
}

main().catch((error) => {
  console.error(error?.shortMessage || error?.message || error)
  process.exit(1)
})
