# bridgeAAC

Linux reference gateway for the Beamio Atomic Asset Container (AAC).

An AAC is a one-time destination-chain record. The source chain locks or burns an asset. The destination chain accepts that fact only after a state proof, marks the record reserved, and then mints or releases the matching asset once.

This repository is phase 6 of that gateway. The shadow command reads public execution clients and writes a decision. The paused registry cannot mint or release. The live miner vote path remains the production bridge. The current production-readiness decision is [docs/PRODUCTION-EVALUATION.md](docs/PRODUCTION-EVALUATION.md).

## What this crate checks

1. The asset is allowed to cross.
2. The source header was explicitly accepted by the configured finality verifier.
3. The deposit leaf is included in the header's Merkle root.
4. The same source deposit opens one AAC.
5. `reserve` runs only from `Verified`.
6. `consume` runs only from `Reserved`, then ends in `Minted` or `Released`.

`MockFinality` accepts only headers a test registers. It is a test double. It must not be described as a production light client.

The Merkle tree is a sorted-pair binary tree. It is the phase-0 commitment format. It is not an Ethereum receipt trie and it is not an OP Stack output root.

## Assets

| Asset | Source | Destination AAC | Settlement |
| --- | --- | --- | --- |
| Canonical USDC, Base to CONET | Base TreasuryBridgeV3 locks Circle USDC | CONET TreasuryBridgeV3 | Mint `conet-USDC` |
| Canonical USDC, CONET to Base | CONET TreasuryBridgeV3 burns `conet-USDC` | Base TreasuryBridgeV3 | Release Circle USDC from the treasury balance |
| GB, either direction | Source GB contract burns paid GB | Destination GB contract | `mintPaid` of the burned amount |
| Unbound developer ERC-20 | Source Peer v5 burns the token | Destination Peer v5 | Mint the same token address |

GB-priced developer tokens do not cross, so they have no AAC. Free GB does not cross. The GB-per-USDC rate vote stays on CONET Peer v5. It is parameter governance, not an AAC. The legacy treasury at `0xa311…` is not a gateway.

Intended addresses, same bytecode address on both chains, separate storage:

| Role | Address |
| --- | --- |
| TreasuryBridgeV3 | `0xa208982212978550594A7FEEB70a61665d129003` |
| CONET USDC | `0x5209865D404aA5646eDe5B91CD4218909eA72eDA` |
| Circle USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| GB token | `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` |
| Peer v5 | `0x1DF0F1826e9085caDB2bDc927A117140FAb39066` |

Chain ids: CONET `224422`, Base `8453`.

Until a production finality adapter is audited, miner votes on `voteBridgeOperation` and GB `voteBridgeMint` remain the live path. This crate does not replace them.

## Documents

- [Whitepaper](docs/WHITEPAPER.md)
- [MVP phases](docs/MVP.md)

## Build on Linux

Requires Rust 1.78 or newer.

```bash
cargo test
cargo build --release
```

The release binary is `target/release/bridge-aac`. On Linux that file is an ELF. From another operating system:

```bash
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu
```

Compute an AAC id:

```bash
bridge-aac aac-id 8453 0xa208982212978550594A7FEEB70a61665d129003 \
  0x0000000000000000000000000000000000000000000000000000000000000001 \
  0x0000000000000000000000000000000000000000000000000000000000000002
```

Build an inclusion proof from a fixture receipt. Without `--allow-header`, the output does not say the header is final.

```bash
bridge-aac prove fixtures/base-lock-receipt.json 0
bridge-aac prove fixtures/base-lock-receipt.json 0 --allow-header 0x44
```

`--allow-header` only registers the hash with `MockFinality`. It does not check Base or CONET.

Ask an execution client whether a header is at or behind its `finalized` tag. `tag F` is that tag. The third command uses a header that is not a real block, so it must not print `final`.

```bash
bridge-aac check-header --chain base --rpc https://base-rpc.conet.network --level finalized
bridge-aac check-header --chain conet --rpc https://publicrpc.conet.network --level finalized
bridge-aac check-header --chain base --rpc https://base-rpc.conet.network --level finalized --header 0x44
```

Settle one fixture log on the in-process test ledger. The command refuses `--rpc`. Without `--allow-header` the output does not say the header is final. `--circle-balance 0` keeps a burn-release AAC reserved.

```bash
bridge-aac settle fixtures/base-lock-receipt.json 0 --allow-header 0x44
bridge-aac settle fixtures/base-lock-receipt.json 1 --allow-header 0x44
bridge-aac settle fixtures/conet-burn-release.json 0 --allow-header 0x55 --circle-balance 0
bridge-aac settle fixtures/base-lock-receipt.json 0 --allow-header 0x44 --journal /tmp/aac-journal.json
```

`verify-receipt` prints `final true` only when the execution tag accepts the header and the receipt proof matches that header's receipts root.

```bash
bridge-aac verify-receipt --chain base --rpc https://base-rpc.conet.network \
  --header <block-hash> --index 0 --receipt <rlp-hex> --proof <node-hex>
```

`shadow` reads at least two execution clients. It proves one real receipt from TreasuryBridgeV3 or the GB token. A successful source receipt prints `execution-tag yes`, `registry paused`, and `consume denied`. The report does not print `final true`.

```bash
bridge-aac shadow-service --journal /var/lib/bridge-aac/journal.json \
  --cursor /var/lib/bridge-aac/cursor.json \
  --log /var/log/bridge-aac/shadow.log --alert /var/log/bridge-aac/alert.log --once
```

`shadow-service` scans from the saved cursor through the lower execution-tagged height. A quiet cycle scans at most 32 blocks. While the cursor is more than 64 blocks behind, it scans 128 blocks and starts the next cycle immediately. Both readers must agree on each block hash and receipts root. A reader gap or cursor gap above 64 blocks prints `reader-lag` or `cursor-lag`, raises `BRIDGE_AAC_ALERT`, and keeps `/var/lib/bridge-aac/page.txt` at `page open` until the gap falls back to the threshold. A chain prints `stable yes` only after 256 blocks with both gaps at or below 64. The first run records that height as the deployment floor and does not scan back to block 0. The cursor advances only after that range is written. A quiet caught-up cycle prints `heartbeat yes`. Quorum, receipt-proof, gateway, receipt-status, RPC, cursor, and reconcile failures print `BRIDGE_AAC_ALERT` on stdout and in the alert file. The process stays `custody closed`.

## Library map

| Module | Responsibility |
| --- | --- |
| `assets` | Which assets may cross, and whether the destination mints or releases |
| `merkle` | Phase-0 inclusion proofs |
| `execution` | Base and CONET checks against the execution client's safe or finalized tag |
| `adapter` | Phase-3 test-ledger settlement for the four bridgeable asset classes |
| `mpt` | Ethereum receipt Merkle-Patricia inclusion against an attested receipts root |
| `shadow` | Phase-5 read-only observation across two execution clients |
| `service` | Phase-6 read-only daemon, per-chain cursor, journal, and alerts |
| `journal` | Restart-safe AAC records for this process |
| `gateway` | `submit`, `reserve`, `consume`, pause |
| `receipt` | Phase-1 fixture proof builder |
| `types` | Deposit leaf and AAC id |

Pause rejects new `submit`, `reserve`, and `consume` calls. It does not delete a record that is already stored.
