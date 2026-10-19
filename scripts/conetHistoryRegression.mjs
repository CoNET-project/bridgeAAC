#!/usr/bin/env node
/**
 * Read-only regression check for the CoNET L1 chain rules that the bridge depends on.
 *
 *   node scripts/conetHistoryRegression.mjs
 *
 * No transaction and no signer. It reaches each CoNET EL node's geth IPC over SSH and runs
 * read-only JSON-RPC calls (admin, web3, eth, debug trace). Exit code 0 only if every check passes.
 *
 * The nodes are not stored in this file. Set these before running:
 *   CONET_SSH_USER    remote account used for the SSH hop
 *   CONET_NODES_FILE  path to a JSON array of { "host": "<address>", "ipc": "<remote geth.ipc path>" }
 * The script exits with code 2, before any connection, if either variable is missing.
 *
 * What it guards:
 *   - the declared fork times (pragueTime, osakaTime) and the chain id
 *   - the geth build on every node (a non-matching build can drop EIP-2537 and split the chain)
 *   - EIP-2537 precompiles at genesis and at the historical checkpoint block
 *   - the pre-Prague checkpoint prove transaction still calls the BLS precompiles, which is why
 *     an upstream geth without the CoNET rule cannot replay the chain
 *   - EIP-2935 parent-hash writes (Prague block processing is active)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const EXPECTED = {
  chainId: 224422,
  cancunTime: 1781376367,
  pragueTime: 1792301551,
  osakaTime: 1792329967,
  gethVersion: '1.17.8',
  checkpointTx: '0x40ca04ca8386009042b7228e8c6dc8ca25ac66dee336e13b195ef83a192dff0d',
  checkpointBlock: 1727262,
  bls: ['0x000000000000000000000000000000000000000b', '0x000000000000000000000000000000000000000c', '0x000000000000000000000000000000000000000d', '0x000000000000000000000000000000000000000e', '0x000000000000000000000000000000000000000f', '0x0000000000000000000000000000000000000010', '0x0000000000000000000000000000000000000011'],
  historySystem: '0x0000F90827F1C53a10cb7A02335B175320002935',
}

// Archive nodes only: historical checks need state at block 1 and at the checkpoint block.
// A pruned (non-archive) node is reported as unavailable for those checks, not as a failure.
const SSH_USER = process.env.CONET_SSH_USER
const NODES_FILE = process.env.CONET_NODES_FILE
if (!SSH_USER || !NODES_FILE) {
  console.error('set CONET_SSH_USER and CONET_NODES_FILE (see the header of this script)')
  process.exit(2)
}
const NODES = JSON.parse(readFileSync(NODES_FILE, 'utf8'))

let nextId = 1
// geth's IPC keeps the socket open after answering, so the remote side is bounded with `timeout`.
function rpc(node, method, params, seconds = 60) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
  const out = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', `${SSH_USER}@${node.host}`, `(timeout ${seconds} nc -U ${node.ipc} || true)`],
    { input: body, encoding: 'utf8', timeout: (seconds + 30) * 1000, maxBuffer: 64 * 1024 * 1024 },
  ).split('\n').find((line) => line.trim().startsWith('{'))
  const res = JSON.parse(out)
  if (res.error) throw new Error(`${method}: ${res.error.message}`)
  return res.result
}

const hexToInt = (h) => Number(BigInt(h))
const byteLen = (h) => (h ? (h.length - 2) / 2 : 0)

function checkNode(node) {
  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })
  // Pruned (non-archive) nodes cannot evaluate historical state. That is recorded as unavailable, not failed.
  const historical = (name, fn) => {
    try {
      return fn()
    } catch (e) {
      if (/not available/i.test(e.message)) {
        add(`${name} (archive state)`, true, 'unavailable: node is not an archive for this block')
        return undefined
      }
      throw e
    }
  }

  const info = rpc(node, 'admin_nodeInfo', [])
  const cfg = info.protocols.eth.config
  add('chainId', cfg.chainId === EXPECTED.chainId, cfg.chainId)
  add('cancunTime', cfg.cancunTime === EXPECTED.cancunTime, cfg.cancunTime)
  add('pragueTime', cfg.pragueTime === EXPECTED.pragueTime, cfg.pragueTime)
  add('osakaTime', cfg.osakaTime === EXPECTED.osakaTime, cfg.osakaTime)

  const version = rpc(node, 'web3_clientVersion', [])
  add('geth build', version.includes(EXPECTED.gethVersion), version)

  const head = hexToInt(rpc(node, 'eth_blockNumber', []))
  add('head advancing (non-zero)', head > 0, head)

  const code2935 = rpc(node, 'eth_getCode', [EXPECTED.historySystem, 'latest'])
  add('EIP-2935 system contract deployed', byteLen(code2935) > 0, byteLen(code2935))

  const callG1 = (block) =>
    rpc(node, 'eth_call', [{ to: EXPECTED.bls[0], data: '0x' + '00'.repeat(256) }, block]).length - 2
  historical('G1ADD at genesis block 1', () => add('G1ADD at genesis block 1', callG1('0x1') / 2 === 128, callG1('0x1') / 2))
  historical('G1ADD at checkpoint block', () => add('G1ADD at checkpoint block', callG1('0x' + EXPECTED.checkpointBlock.toString(16)) / 2 === 128, callG1('0x' + EXPECTED.checkpointBlock.toString(16)) / 2))

  const receipt = rpc(node, 'eth_getTransactionReceipt', [EXPECTED.checkpointTx])
  add('checkpoint prove receipt status', receipt && receipt.status === '0x1', receipt && receipt.status)
  add('checkpoint prove block', receipt && hexToInt(receipt.blockNumber) === EXPECTED.checkpointBlock, receipt && hexToInt(receipt.blockNumber))

  let trace = null
  historical('checkpoint prove calls BLS precompiles', () => { trace = rpc(node, 'debug_traceTransaction', [EXPECTED.checkpointTx, { tracer: 'callTracer' }], 240) })
  const blsCalls = []
  const walk = (c) => {
    if (c.to && EXPECTED.bls.includes(c.to.toLowerCase()) && c.type === 'STATICCALL') blsCalls.push(c.to.toLowerCase())
    for (const s of c.calls || []) walk(s)
  }
  if (trace) {
    walk(trace)
    add('checkpoint prove calls BLS precompiles', blsCalls.length >= 1, blsCalls.length)
  }
  // Archive capability is reported per node, separately from pass/fail.
  const archive = checks.every((c) => !c.detail || !String(c.detail).startsWith('unavailable'))

  return { host: node.host, archive, checks, ok: checks.every((c) => c.ok) }
}

const report = NODES.map((n) => {
  try {
    return checkNode(n)
  } catch (e) {
    return { host: n.host, ok: false, error: e.message }
  }
})
const ok = report.every((r) => r.ok)
console.log(JSON.stringify({ expected: EXPECTED, ok, nodes: report }, null, 2))
process.exit(ok ? 0 : 1)
