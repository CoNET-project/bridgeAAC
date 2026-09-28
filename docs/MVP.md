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

`shadow-service` stores `last_scanned` separately for Base and CONET. A cycle reads `last + 1` through the lower execution-tagged height agreed by both readers, at most 32 blocks. The two readers may have different tips. Each scanned height must still return the same block hash and receipts root from both. A gap between the two reader tips stays on the alert page. `stable yes` counts only blocks where the cursor remained within 64 of the lower tip. That gap does not erase the count, and `stable reset` is printed only when the cursor falls behind that lower tip. The first observation records that height as the deployment floor. Scanning never starts at block 0 and never moves below the floor. An existing cursor keeps its scanned height as the floor, so an upgrade does not rescan earlier history. The cursor file is replaced only after the log write succeeds. A corrupt cursor prints `cursor no` and is left in place. An initiated `BridgeOperation` that is still not executed or cancelled after 256 blocks on its own chain prints `reconcile pending`. Alerts are also written as `BRIDGE_AAC_ALERT` on stdout for journald.

The production Base quorum reader is also available as `base-quorum-reader`. It accepts two independent execution RPCs, requires chain ID 8453, uses the lower `finalized` height as its ceiling, and verifies block hash, state root, and receipts root at every requested height. The HTTP and WS ports of one process do not count as two readers. This command is read-only and does not use Ethereum L1 signing.

```bash
bridge-aac shadow --chain base --rpc https://base-rpc.conet.network --rpc https://mainnet.base.org \
  --tx 0xd043a1f51fa8d198ef8c77d93ab89cdf68fa8e2894c59472b7836b462b83a0a3 \
  --journal /tmp/aac-shadow.json
```

## Phase 7 — Custody activation gate

`bridge-aac base-l1-output` is a read-only Ethereum L1 observer. It reads the pinned Base OptimismPortal, checks that `isGameClaimValid` agrees with `getAnchorRoot`, and compares one Base block with that anchor sequence. A 2026-09-28 read on `38.102.126.30` reported anchor L2 block 51,678,960 and Base execution block 51,895,863, so the report was `l1-anchor yes`, `covered no`, `execution-ahead yes`. The command always prints `custody closed`, `light-client no`, and `fault-proof-replay no`. It does not replay a fault proof, does not feed `shadow-service`, and does not print `final true`.

`bridge-aac conet-consensus` is a read-only beacon observer. It compares the beacon finalized execution payload with the execution client's `finalized` tag. Matching tags print `beacon-agreed yes`. The command always prints `signature-check no`, because it does not verify Casper FFG or sync-committee BLS signatures. A missing `/eth/v1/beacon/light_client/finality_update` prints `light-client-update absent`. It does not feed `shadow-service` and does not print `final true`.

`bridge-aac destination-consumer` is a read-only selector observation of `aacConsumeMint`, `aacConsumeRelease`, `aacConsumeMintPaid`, and `aacConsumeMintDeveloper`. It counts only Solidity `PUSH4` hits in the Treasury and GB implementations and at the predicted Peer v5 address. A raw 4-byte collision is not a hit. `selector-observation present` means those four PUSH4 selectors were seen. The command still prints `semantic-proof no`, `consume-once no`, `consumer observation-only`, `audit no`, and `custody-gate no`. Selector bytes do not pass the destination gate. The command does not deploy or call a consumer, and it does not feed `shadow-service`.

`bridge-aac gb-mint-authority` is a read-only CoNET observer of GBToken `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8`. Paid-GB `voteBridgeMint`, `mint`, and `mintPaid` live on that token, not on TreasuryBridgeV3. The command reads the EIP-1967 implementation behind that proxy and reports `admin-mint open` when that implementation still dispatches `mint(address,uint256)` or `mintPaid(address,uint256)`, and `vote-mint open` when `voteBridgeMint` is present, the bridge is not paused, and `validatorCount` is nonzero. `selectors-absent yes` means those three selectors were not found. That is not mint closure: the command always prints `upgrade-authority unread`, `mint-closed no`, and `custody-gate no`. The command does not call mint, vote, or execute, and it does not feed `shadow-service`.

Mainnet AAC custody stays closed until all of these exist:

- Base finality is a finalized OP output anchored to Ethereum L1, not only an execution tag plus a receipt proof. The L1 anchor observer above records the registry anchor; an execution tag ahead of that anchor does not pass this gate.
- CONET finality verifies consensus signatures. The beacon observer above records tag agreement only; `signature-check no` does not pass this gate.
- A destination contract stores the AAC id and consumes it once. The observer above records PUSH4 selector presence only; `consume-once no` stays until proof binding, persisted ids, role separation, atomic rollback, replay and reentrancy tests, upgrade layout, and an independent audit all exist.
- Paid GB can no longer be minted by a bare admin key, and the upgrade authority that could restore that mint is closed. The GB observer above records selector absence only; `mint-closed no` stays while `upgrade-authority unread`.
- An independent review has accepted the integrated proof and contracts.
- Miner `voteBridgeOperation` and `voteBridgeMint` remain the live paths until that cutover.

## Build

```bash
cd src/bridgeAAC
cargo test
cargo build --release --target x86_64-unknown-linux-gnu
```

The Linux artifact is an ELF at `target/x86_64-unknown-linux-gnu/release/bridge-aac`.
