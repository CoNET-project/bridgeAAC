/**
 * Blockscout-verify the CoNET Base-receipt verifier stack.
 * Accepts immutable address slots that are zero in the local compile.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SOLC = `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const SCAN = 'https://mainnet.conet.network'
const RPC = 'https://rpc1.conet.network'
const COMPILER = 'v0.8.35+commit.47b9dedd'

const targets = [
  ['conet-AacReceiptMptVerifier-standard-input.json', 'contracts/AacReceiptMptVerifier.sol', 'AacReceiptMptVerifier', '0x6B44d8469c902F0BbF74333AAfE7E164D020943f'],
  ['conet-AacEthereumCheckpointRoot-standard-input.json', 'contracts/AacEthereumCheckpointRoot.sol', 'AacEthereumCheckpointRoot', '0xcC64299b08B43c45217f1fB4fef210c0d7a2b728'],
  ['conet-AacBridgeEffect-standard-input.json', 'contracts/AacBridgeEffect.sol', 'AacBridgeEffect', '0x3EFD6b90A19B5d1027b734460672A330764c27Df'],
  ['conet-AacConetBaseMessageCover-standard-input.json', 'contracts/AacConetBaseMessageCover.sol', 'AacConetBaseMessageCover', '0xB862FA2351d7910F960eE8e5d2176f89df44b2fa'],
  ['conet-AacConetBaseSettler-standard-input.json', 'contracts/AacConetBaseSettler.sol', 'AacConetBaseSettler', '0x1C302DE6a6c4d9BE30193A6Bcd65A522C9b9898D'],
]

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

async function verified(addr) {
  const response = await fetch(`${SCAN}/api/v2/smart-contracts/${addr}`)
  if (!response.ok) return false
  const body = await response.json()
  return Boolean(body.is_verified || body.is_partially_verified || (body.source_code || '').length > 20)
}

async function submit(jsonPath, file, name, addr) {
  if (await verified(addr)) {
    console.log('already', name, addr)
    return
  }
  const json = readFileSync(jsonPath)
  const form = new FormData()
  form.set('compiler_version', COMPILER)
  form.set('contract_name', `${file}:${name}`)
  form.set('autodetect_constructor_args', 'true')
  form.set('license_type', 'mit')
  form.set('files[0]', new File([json], 'standard-input.json', { type: 'application/json' }))
  const response = await fetch(`${SCAN}/api/v2/smart-contracts/${addr}/verification/via/standard-input`, {
    method: 'POST',
    body: form,
  })
  console.log('submit', name, response.status, (await response.text()).slice(0, 180))
}

async function main() {
  for (const [fileName, file, name, addr] of targets) {
    const path = join(ROOT, 'deployments', fileName)
    const local = localBytecode(path, file, name)
    const chain = await onchain(addr)
    if (!immutableOk(local, chain)) throw new Error(`${name} bytecode mismatch local=${local.length} chain=${chain.length}`)
    console.log('bytecode ok', name)
    await submit(path, file, name, addr)
  }
  for (let i = 0; i < 40; i++) {
    const pending = []
    for (const item of targets) {
      if (!(await verified(item[3]))) pending.push(item[2])
    }
    if (pending.length === 0) {
      console.log('all verified')
      return
    }
    console.log('waiting', pending.join(','))
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
  throw new Error('verification poll timeout')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
