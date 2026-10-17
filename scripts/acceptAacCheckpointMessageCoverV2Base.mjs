#!/usr/bin/env node
/**
 * Read-only acceptance for AacCheckpointMessageCoverV2 on Base (chain 8453).
 *
 * No transaction and no signer. Everything is eth_call or eth_getCode.
 *   1. The on-chain runtime matches a fresh compile of the V2 source.
 *   2. The constants match the source.
 *   3. The original cover 0x01506527...233 reproduces its live success on the
 *      coverTx inputs, then accepts a forged Base header. This is the live defect.
 *   4. V2 rejects the same forged input.
 *
 * Writes deployments/base-AacCheckpointMessageCoverV2-acceptance.json.
 * A positive run against a real L1 output-root anchor is not part of this script.
 */
import { readFileSync, writeFileSync } from 'node:fs'
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

const { JsonRpcProvider, Interface, ethers } = loadEthers()

const SOLC =
  process.env.SOLC ||
  `${homedir()}/Library/Caches/hardhat-nodejs/compilers-v3/macosx-amd64/solc-macosx-amd64-v0.8.35+commit.47b9dedd`
const RPC = process.env.BASE_RPC_URL || 'https://base-rpc.conet.network'
const ORIGINAL_COVER = '0x01506527a4Dab14141038Db15f5341dcF4729233'
const ORIGINAL_COVER_TX = '0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d'
const BRIDGE_TOPIC = '0x3da6c53997af9ec249ba82273b099b7529ae3c371e100fda75e390d8a1f122ba'
const TREASURY = '0xa208982212978550594A7FEEB70a61665d129003'
const ZERO = '0x' + '00'.repeat(32)
const ZERO_ADDR = '0x' + '00'.repeat(20)
const ANCHOR_INPUT = { ethereumHeaderRlp: '0x', gameAccountProof: [], gameCode: '0x', messagePasserProof: [] }

function compile(source, name) {
  const input = {
    language: 'Solidity',
    sources: { [source]: { content: readFileSync(join(ROOT, source), 'utf8') } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'cancun',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  }
  // AacBaseAnchorReceiptRoot.sol is imported by V2; include it when it is needed.
  if (source.endsWith('AacCheckpointMessageCoverV2.sol')) {
    input.sources['contracts/AacBaseAnchorReceiptRoot.sol'] = {
      content: readFileSync(join(ROOT, 'contracts/AacBaseAnchorReceiptRoot.sol'), 'utf8'),
    }
  }
  const r = spawnSync(SOLC, ['--standard-json'], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`solc failed: ${r.stderr || r.stdout}`)
  const out = JSON.parse(r.stdout)
  const errors = (out.errors || []).filter((e) => e.severity === 'error')
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage || e.message).join('\n'))
  const c = out.contracts[source][name]
  return { abi: c.abi, runtime: `0x${c.evm.deployedBytecode.object}` }
}

// Mirrors _header in the cover contract: the beacon block root of a finalized header.
const u64le = (v) => {
  const b = new Uint8Array(32)
  let x = BigInt(v)
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn)
    x >>= 8n
  }
  return ethers.hexlify(b)
}
function headerRoot(h) {
  const h01 = ethers.sha256(ethers.concat([u64le(h.slot), u64le(h.proposer)]))
  const h23 = ethers.sha256(ethers.concat([h.parentRoot, h.stateRoot]))
  const h45 = ethers.sha256(ethers.concat([h.bodyRoot, ZERO]))
  const h67 = ethers.sha256(ethers.concat([ZERO, ZERO]))
  return ethers.sha256(ethers.concat([ethers.sha256(ethers.concat([h01, h23])), ethers.sha256(ethers.concat([h45, h67]))]))
}

// One TREASURY log in a type-2 receipt, as _bridgeLog and _amount read it.
function receiptRlp(operationId, gross) {
  const data = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint8', 'uint8', 'address', 'address', 'address', 'address', 'address[]', 'uint256[]', 'uint256'],
    [0, 0, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, [], [gross], gross],
  )
  const log = [TREASURY, [BRIDGE_TOPIC, operationId], data]
  return ethers.concat(['0x02', ethers.encodeRlp(['0x01', '0x5208', '0x' + '00'.repeat(256), [log]])])
}

// Single-leaf receipt trie for receiptIndex 0 (key rlp(0) = 0x80, leaf path nibbles 8,0).
function singleLeafTrie(receipt) {
  const leaf = ethers.encodeRlp(['0x2080', receipt])
  return { root: ethers.keccak256(leaf), proof: [leaf] }
}

// Base header with fields 3, 5 and 19 meaningful. The others are 32-byte placeholders.
function baseHeader(receiptsRoot, parentBeaconBlockRoot) {
  const fields = Array(20).fill(ZERO)
  fields[5] = receiptsRoot
  fields[19] = parentBeaconBlockRoot
  return ethers.encodeRlp(fields)
}

const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)))

async function callOrRevert(provider, to, data, blockTag = 'latest') {
  try {
    const out = await provider.call({ to, data, blockTag })
    return { ok: true, data: out }
  } catch (e) {
    return { ok: false, data: e.data || e.info?.error?.data || null, message: e.shortMessage || e.message }
  }
}

function errorNames(source) {
  const names = [...source.matchAll(/error\s+(\w+)\s*\(/g)].map((m) => m[1])
  return [...new Set(names)]
}

async function main() {
  const record = JSON.parse(readFileSync(join(ROOT, 'deployments/base-AacCheckpointMessageCoverV2.json'), 'utf8'))
  const provider = new JsonRpcProvider(RPC, 8453)
  const checks = {}

  // 1. Bytecode: the on-chain runtime against a fresh compile of the V2 source.
  const v2 = compile('contracts/AacCheckpointMessageCoverV2.sol', 'AacCheckpointMessageCoverV2')
  const onchain = await provider.getCode(record.address)
  checks.bytecodeMatchesCompiled = onchain.toLowerCase() === v2.runtime.toLowerCase()
  checks.runtimeCodeHash = ethers.keccak256(onchain)
  checks.runtimeCodeHashMatchesRecord = checks.runtimeCodeHash === record.runtimeCodeHash

  // 2. Constants read on-chain against the source.
  const v2Iface = new Interface(v2.abi)
  const constants = {}
  for (const name of ['STORE', 'RECEIPT_VERIFIER', 'TREASURY', 'OUTPUT_ROOT_PROOF', 'BRIDGE_TOPIC']) {
    const out = await provider.call({ to: record.address, data: v2Iface.encodeFunctionData(name, []) })
    constants[name] = v2Iface.decodeFunctionResult(name, out)[0]
  }
  checks.constantsMatchRecord = Object.keys(constants).every((k) => constants[k] === record.constants[k] || constants[k].toLowerCase() === record.constants[k].toLowerCase())

  // 3. Original cover on the live chain: reproduce the coverTx success, then forge.
  const original = compile('contracts/AacCheckpointMessageCover.sol', 'AacCheckpointMessageCover')
  const origIface = new Interface(original.abi)
  const origTx = await provider.getTransaction(ORIGINAL_COVER_TX)
  const decoded = origIface.decodeFunctionData('cover', origTx.data)
  const [input, finalized, finalityBranch, , receiptRlpLive, proofLive, receiptIndexLive, logIndexLive] = decoded
  // The store rotates periods, so the original call is replayed at the block where it succeeded.
  const liveBlock = origTx.blockNumber
  const storePeriodAt = async (tag) => BigInt(await provider.call({ to: '0xcEE3D699df3df07a573f1aFf642888B97B7aA961', data: ethers.id('period()').slice(0, 10), blockTag: tag })).toString()
  checks.storePeriodAtCoverTx = await storePeriodAt(liveBlock)
  checks.storePeriodLatest = await storePeriodAt('latest')
  const liveOut = await callOrRevert(provider, ORIGINAL_COVER, origTx.data, liveBlock)
  checks.originalReproducesLiveSuccess = liveOut.ok
  const fakeOperation = ethers.zeroPadValue('0x0f', 32)
  const fakeReceipt = receiptRlp(fakeOperation, 10000000n)
  const fakeTrie = singleLeafTrie(fakeReceipt)
  const beaconRoot = headerRoot(finalized)
  const forgedHeader = baseHeader(fakeTrie.root, beaconRoot)
  const forgedArgs = [input, finalized, finalityBranch, forgedHeader, fakeReceipt, fakeTrie.proof, 0n, 0n, [finalized]]
  const originalForged = await callOrRevert(provider, ORIGINAL_COVER, origIface.encodeFunctionData('cover', forgedArgs), liveBlock)
  checks.originalAcceptsForgedHeader = originalForged.ok
  const originalResult = originalForged.ok ? origIface.decodeFunctionResult('cover', originalForged.data) : null

  // 4. V2 with the same forged inputs and no real anchor. Expect a revert from the anchor path.
  const v2Forged = await callOrRevert(
    provider,
    record.address,
    v2Iface.encodeFunctionData('cover', [ANCHOR_INPUT, input, finalized, finalityBranch, forgedHeader, fakeReceipt, fakeTrie.proof, 0n, 0n, [finalized]]),
  )
  checks.v2RejectsForgedHeader = !v2Forged.ok
  const selector = v2Forged.data && v2Forged.data.length >= 10 ? v2Forged.data.slice(0, 10) : null
  const anchorSource = readFileSync(join(ROOT, 'contracts/AacBaseOutputRootProof.sol'), 'utf8')
  const knownErrors = [...errorNames(anchorSource), 'HeaderNotAnchored', 'UnexpectedFinality', 'InvalidProof']
  const revertName = selector ? knownErrors.find((n) => ethers.id(`${n}()`).slice(0, 10) === selector) || `unknown ${selector}` : null

  const pass = checks.bytecodeMatchesCompiled && checks.runtimeCodeHashMatchesRecord && checks.constantsMatchRecord && checks.v2RejectsForgedHeader && checks.originalAcceptsForgedHeader
  const acceptance = {
    generatedAt: new Date().toISOString(),
    chainId: 8453,
    address: record.address,
    originalCover: ORIGINAL_COVER,
    originalCoverTx: ORIGINAL_COVER_TX,
    checks,
    originalForgedResult: originalResult ? { operationId: originalResult[0], amount: originalResult[1].toString(), messageCovered: originalResult[2], headerFinal: originalResult[3] } : null,
    v2ForgedRevert: { selector, name: revertName, note: 'The anchor proof reverts before HeaderNotAnchored, because the dummy anchor input is invalid. The rejection is real, but its reason is the anchor path.' },
    notRun: ['positive run against a real L1 output-root anchor (needs a valid anchor bundle for a block in period 1883)', 'Sourcify verification of the V2 deployment'],
    pass,
    partial: true,
  }
  writeFileSync(join(ROOT, 'deployments/base-AacCheckpointMessageCoverV2-acceptance.json'), JSON.stringify(plain(acceptance), null, 2))
  console.log(JSON.stringify(plain(acceptance), null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
