# bridgeAAC MVP

**Status:** Phase 6 shadow service scans a saved block cursor on Base and CONET. It advances that cursor only after the whole range is stored. Custody activation remains closed.

The live USDC and GB bridges keep miner votes until a reviewed finality adapter exists. This plan does not turn those votes off.

## Phase 0 — State machine (this crate)

Delivered:

- Deposit leaf and AAC id, both domain-separated with Keccak-256.
- Asset policy: USDC lock-mint, USDC burn-release, paid GB, unbound developer tokens.
- Rejection of free GB and of GB-priced developer tokens.
- Sorted-pair Merkle inclusion.
- `FinalityVerifier` plus `MockFinality`.
- Destination gateway: `submit` → `Verified`, `reserve` → `Reserved`, `consume` → `Minted` or `Released`.
- Pause that blocks new transitions and leaves stored records in place.
- CLI `bridge-aac aac-id`.
- `cargo test` covers replay, a bad path, an unregistered header, and consume-without-reserve.

Acceptance:

- A second consume of the same id fails.
- A proof against the wrong root fails.
- A header the mock verifier did not register fails.
- `is_reserved` is true only in `Reserved`.

Explicitly absent:

- Ethereum receipt trie.
- OP Stack output roots.
- CONET consensus verification.
- Any RPC client.
- Any transaction against TreasuryBridgeV3, the GB token, or Peer v5.

## Phase 1 — Linux proof builder

Delivered:

- `bridge-aac prove` reads a JSON receipt fixture and builds a phase-0 sorted-pair inclusion proof of one log.
- The report contains the deposit leaf, sibling hashes, header hash, and state root. The phase-0 gateway verifies that bundle.
- Finality stays on `MockFinality`. The report prints `final true` only after that allowlist accepts the header. Otherwise the report does not contain the substring `final`. The status line is `header-check mock-allowlist`.

Acceptance fixture: `fixtures/base-lock-receipt.json`.

```bash
bridge-aac prove fixtures/base-lock-receipt.json 0
bridge-aac prove fixtures/base-lock-receipt.json 0 --allow-header 0x44
```

Still absent: Ethereum receipt trie, OP Stack output-root proofs, CONET beacon signature checks, and any mainnet transaction.

## Phase 2 — Finality adapters

Delivered:

- `BaseFinality` accepts a header only on chain id 8453.
- `ConetFinality` accepts a header only on chain id 224422.
- Both ask the execution client for `eth_chainId`, `eth_getBlockByHash`, and `eth_getBlockByNumber`. The header must be canonical at its height and that height must be at or behind `safe` or `finalized`.
- A receipt path is not consulted. `MockFinality` remains the named test double.
- `bridge-aac check-header` prints `final true` only after that check. Otherwise the report does not contain the substring `final`. `tag F` means the finalized tag. `tag S` means safe. The report always says `light-client no`.

This adapter trusts the execution client's tag. It does not recompute an OP output root and it does not verify CONET beacon signatures.

```bash
bridge-aac check-header --chain base --rpc https://base-rpc.conet.network --level finalized
bridge-aac check-header --chain conet --rpc https://publicrpc.conet.network --level finalized
bridge-aac check-header --chain base --rpc https://base-rpc.conet.network --level finalized --header 0x44
```

## Phase 3 — Asset adapters on a test network

Delivered on an in-process ledger. No transaction is broadcast.

| AAC class | Source transaction | Destination transaction after `Reserved` |
| --- | --- | --- |
| USDC lock-mint | Base TreasuryBridgeV3 locks Circle USDC | `aacConsumeMint` on CONET TreasuryBridgeV3 |
| USDC burn-release | CONET TreasuryBridgeV3 burns `conet-USDC` | `aacConsumeRelease` pays Circle USDC from the Base treasury balance |
| Paid GB | Source GB `bridgeOut` burns paid GB | `executeBridgeMint` consumes the AAC and `mintPaid`s |
| Unbound developer token | Source Peer v5 burns the token | `aacConsumeMintDeveloper` mints the same address |

`executeBridgeMint` runs only as that GB consume step. `voteBridgeMint`, `voteBridgeOperation`, and `voteMintDeveloper` are rejected.

If the Base treasury's Circle balance is below the AAC amount, consume does not run and the record stays `Reserved`.

`aligned_create_address` requires one `createERC20` on each chain, at the same nonce, with the same parameters. Only a `CREATE` advances the nonce. The address is the Ethereum `CREATE` address of Peer v5. The consume selectors are not deployed.

```bash
bridge-aac settle fixtures/base-lock-receipt.json 0 --allow-header 0x44
bridge-aac settle fixtures/base-lock-receipt.json 1 --allow-header 0x44
bridge-aac settle fixtures/conet-burn-release.json 0 --allow-header 0x55 --circle-balance 0
```

## Phase 4 — Authenticated receipts and durable replay

Delivered in this crate. This phase does not cut over mainnet and does not disable miner votes.

- `submit` accepts a header only when the verifier attests that exact hash together with the same receipts root. A valid sorted-pair proof under a different root is `DigestMismatch`.
- `verify-receipt` checks an Ethereum Merkle-Patricia receipt proof against the receipts root returned with that same execution-client header. `final true` is printed only when the header tag and the inclusion both succeed.
- `--journal` stores consumed AAC ids. A second `settle` of the same deposit prints `replay yes` and does not settle again.
- The execution tag is still not an OP output proof or a CONET beacon proof. The report keeps `light-client no`.
- Destination consume selectors are still not deployed. The journal is process storage, not the destination contract.

```bash
bridge-aac check-header --chain base --rpc https://base-rpc.conet.network --level finalized
bridge-aac verify-receipt --chain base --rpc https://base-rpc.conet.network --header <hash> --index 0 --receipt <rlp> --proof <node>
bridge-aac settle fixtures/base-lock-receipt.json 0 --allow-header 0x44 --journal /tmp/aac-journal.json
```

## Phase 5 — Shadow deployment

Delivered as a read-only observer. It does not broadcast a transaction, mint, or release.

- At least two execution clients must agree on chain id, header hash, number, state root, and receipts root. Disagreement is `quorum no` and the report does not contain `final`.
- One real receipt is rebuilt and checked under that agreed receipts root. Base deposit receipts include the post-Canyon nonce and receipt version.
- A legacy `BridgeOperation` or `BridgeOut` log is reported as `decision observe`, with `settle-now no` and `miner-vote live`.
- A second observation of the same block receipt is `duplicate yes` and stays `settled no`.
- The report always says `shadow yes`, `broadcast no`, `custody closed`, and `light-client no`.

```bash
bridge-aac shadow --chain base \
  --rpc https://base-rpc.conet.network --rpc https://mainnet.base.org \
  --tx 0xd043a1f51fa8d198ef8c77d93ab89cdf68fa8e2894c59472b7836b462b83a0a3 \
  --journal /tmp/aac-shadow.json
bridge-aac shadow --chain conet \
  --rpc https://publicrpc.conet.network --rpc https://mainnet-rpc1.conet.network \
  --tx 0xc932930e324cc713da07f13b050cd9b6f82939dcf391106b228337c11ac37127 \
  --journal /tmp/aac-shadow.json
```

## Phase 6 — Paused registry

Delivered as a permanently paused registry. `note` and `consume` revert. The contract has no token call and no function that clears pause. Miner votes stay live.

The shadow report no longer prints `final true`. A matched, successful receipt prints `execution-tag yes` together with `registry paused` and `consume denied`. A failed receipt or a log from any other contract prints `accepted no`.

`shadow-service` stores `last_scanned` separately for Base and CONET. A cycle reads `last + 1` through the agreed execution-tagged head, at most 32 blocks. A missing cursor starts 32 blocks behind that head. The cursor file is replaced only after the log write succeeds. A corrupt cursor prints `cursor no` and is left in place. An initiated `BridgeOperation` that is still not executed after 256 blocks prints `reconcile pending`. Alerts are also written as `BRIDGE_AAC_ALERT` on stdout for journald.

```bash
bridge-aac shadow --chain base --rpc https://base-rpc.conet.network --rpc https://mainnet.base.org \
  --tx 0xd043a1f51fa8d198ef8c77d93ab89cdf68fa8e2894c59472b7836b462b83a0a3 \
  --journal /tmp/aac-shadow.json
```

## Phase 7 — Custody activation gate

Mainnet AAC custody stays closed until all of these exist:

- Base finality is a finalized OP output anchored to Ethereum L1, not only an execution tag plus a receipt proof.
- CONET finality verifies consensus signatures.
- A destination contract stores the AAC id and consumes it once.
- Paid GB can no longer be minted by a bare admin key.
- An independent review has accepted the integrated proof and contracts.
- Miner `voteBridgeOperation` and `voteBridgeMint` remain the live paths until that cutover.

## Build

```bash
cd src/bridgeAAC
cargo test
cargo build --release --target x86_64-unknown-linux-gnu
```

The Linux artifact is an ELF at `target/x86_64-unknown-linux-gnu/release/bridge-aac`.
