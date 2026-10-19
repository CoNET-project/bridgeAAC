# bridgeAAC

Linux reference gateway for the Beamio Atomic Asset Container (AAC).

An AAC is a one-time destination-chain record. The source chain locks or burns an asset. The destination chain accepts that fact only after a state proof, marks the record reserved, and then mints or releases the matching asset once.

This repository is phase 6 of that gateway. The shadow command reads public execution clients and writes a decision. The paused registry cannot mint or release. Production settle stays closed. The milestone list below is the current cutover record.

## Milestones

Recorded on 2026-10-16. Custody views stay closed. Release `bridge-aac-v0.33.12` closes the internal review findings; see [docs/AUDIT-2026-10-16.md](docs/AUDIT-2026-10-16.md).

| Milestone | State |
| --- | --- |
| Obstacles 1–5 | **Accepted** (2026-10-14). Evidence: [docs/PRODUCTION-CUSTODY-GATES.md](docs/PRODUCTION-CUSTODY-GATES.md) |
| Assurance | Rust tests and fail-closed smoke **PASS**. Independent audit and third-party acceptance **WAIVED BY OWNER 2026-10-14**. [docs/PRODUCTION-ASSURANCE.md](docs/PRODUCTION-ASSURANCE.md) |
| Phase B | GB `addAdmin(AAC)` **executed** on CoNET and Base |
| Phase C | Bounded paid-GB canary **executed** (0.01 GB) |
| Phase D | Paid-GB `setBridgePaused(true)` **executed** on CoNET and Base |
| Phase E | Monitor baseline **recorded healthy** (read-only). [docs/CUTOVER-CUSTODY.md](docs/CUTOVER-CUSTODY.md) |
| F4 committee | CheckpointRoot `0xcEE3D699df3df07a573f1aFf642888B97B7aA961` rotated period **1883 → 1884** |
| Miner completion | `voteBridgeOperation`, `executeMint`, and `executeRelease` revert `VoteBridgeClosed` on Base and CoNET |
| Destination allowlist | `aacDestinationOpen(8453)` is true on both treasuries. Base `aacDestinationOpen(224422)` is true. CoNET `aacDestinationOpen(224422)` stays false. `sourceInitiateOpen` is true on both treasuries. Later chains use `setAacDestinationOpen` without another treasury upgrade |
| SettlerF7c | Pending implementation `0xefb038ec81aaBfEe9E5a2625B7e50ee3e1FABE44`. `upgradeTo` is allowed only after **2026-10-17T13:25:41Z**. The live AAC implementation is still F7 `0x29e10621fF159422237d2a0B9F020303F9BDdD12` |
| wCNET | CoNET `0x5a2D096968fC85861d8FDC7CE9A747Fe4bcb87D5` (native wrap on). Base `0x0E01ca7a99B38a4E021C25B7BE01356E71158B66` (wrap off). CoNET completion of wCNET must release locked tokens, not mint |
| Base → CoNET proof | Probe `0xed2E4B55152A657B43A5065a01B9655dB0033713`, cover `0xA5bB063652A9f21ddF600e78AC1c7db1A0812E06`, settler `0x7285fD9a9e62751e952697f95DD753C82Bb84BbE`. Checkpoint `0x52b3bc7A8c58EC64A57a62783E2e1F8CB8457b3a` is period **1884**, `rootReady` true. The 0.01 USDC lock `0xa1ed9817ac5361dcf1613d9ef863d8f868e5b54e987fad2710481693dc290b2a` covered with `headerFinal` true. `setSettler` `0xf84d10d8…679a3` installed that settler. `settle` `0x72642602…b34d` minted 0.01 canonical CoNET-USDC to the beneficiary |
| Execution client | The checked CoNET execution clients (`{CONET_NODE_A}:8889`, `{CONET_NODE_B}` ports `8888`/`8883`/`8884`, `{CONET_NODE_C}:8885`) run patched Geth 1.17.8. Empty `eth_call` to `0x0b` returns `invalid input length`. Prague stays off |

Do not schedule another AAC upgrade. A second `scheduleUpgrade` resets the 48-hour clock. `sourceInitiateOpen` is true on Base and CoNET. The presence check calls precompile `0x0b` with a 100,000 gas stipend: a reverting precompile burns the whole stipend, and an uncapped call exhausts the receipt proof before the pairing. The earlier probe `0xbaff644E…EB6B` and settler `0x1E160EFB…3814` are superseded.

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

Miner `voteBridgeOperation`, `executeMint`, and `executeRelease` revert `VoteBridgeClosed`. Paid-GB `voteBridgeMint` is paused. This crate still does not mint or release. The checked execution clients run patch-geth. The Base → CoNET 0.01 USDC canary is covered and settled through `AacChainEffect`. CoNET wCNET completion stays mode 2 (release). `sourceInitiateOpen` is true on Base and CoNET.

## Documents

- [patch-geth](https://github.com/CoNET-project/patch-geth) — Cancun-only EIP-2537 build for the CoNET execution client
- [Audit record 2026-10-16](docs/AUDIT-2026-10-16.md) (H1, H2, M1–M6 fixes; reproducible 0.33.12 build)
- [Whitepaper](docs/WHITEPAPER.md)
- [MVP phases](docs/MVP.md)
- [Production custody gates](docs/PRODUCTION-CUSTODY-GATES.md)
- [Production assurance](docs/PRODUCTION-ASSURANCE.md)
- [Custody cutover proposal](docs/CUTOVER-CUSTODY.md)
- [Independent audit runbook](docs/INDEPENDENT-AUDIT.md) (how to complete; GitHub publish)
- [Third-party acceptance guide](docs/THIRD-PARTY-ACCEPTANCE.md) (Shadow / M3 track — not the cutover audit)
- [M4 destination consumer interface package](docs/M4-DESTINATION-CONSUMER.md)
- [M4 testnet acceptance record](docs/M4-TESTNET-ACCEPTANCE.md)
- [M4 paused mainnet canary](docs/M4-MAINNET-CANARY.md)
- [Ethereum L1 Base anchor view](docs/M4-ETHEREUM-L1-ANCHOR-VIEW.md)
- [Ethereum L1 anchor acceptance](docs/M4-ETHEREUM-L1-ANCHOR-ACCEPTANCE.md)
- [Base anchor storage proof](docs/M4-BASE-ANCHOR-STORAGE-PROOF.md)
- [Base anchor storage proof acceptance](docs/M4-BASE-ANCHOR-STORAGE-PROOF-ACCEPTANCE.md)
- [Ethereum header-bound anchor proof](docs/M4-ETHEREUM-HEADER-ANCHOR.md)
- [Ethereum header-bound anchor acceptance](docs/M4-ETHEREUM-HEADER-ANCHOR-ACCEPTANCE.md)
- [Base L1 origin ancestry](docs/M4-BASE-L1-ORIGIN-ANCESTRY.md)
- [Base L1 origin ancestry acceptance](docs/M4-BASE-L1-ORIGIN-ANCESTRY-ACCEPTANCE.md)
- [Anchor game code proof](docs/M4-ANCHOR-GAME-CODE-PROOF.md)
- [Anchor game code proof acceptance](docs/M4-ANCHOR-GAME-CODE-PROOF-ACCEPTANCE.md)
- [Base output root proof](docs/M4-BASE-OUTPUT-ROOT-PROOF.md)
- [Base output root proof acceptance](docs/M4-BASE-OUTPUT-ROOT-PROOF-ACCEPTANCE.md)
- [Ethereum header parent chain](docs/M4-ETHEREUM-HEADER-CHAIN.md)
- [Ethereum header parent chain acceptance](docs/M4-ETHEREUM-HEADER-CHAIN-ACCEPTANCE.md)
- [Base anchor receipt root](docs/M4-BASE-ANCHOR-RECEIPT-ROOT.md)
- [Base anchor receipt root acceptance](docs/M4-BASE-ANCHOR-RECEIPT-ROOT-ACCEPTANCE.md)
- [Base anchor receipt inclusion](docs/M4-BASE-ANCHOR-RECEIPT-INCLUSION.md)
- [Base anchor receipt inclusion acceptance](docs/M4-BASE-ANCHOR-RECEIPT-INCLUSION-ACCEPTANCE.md)
- [Base anchor log proof](docs/M4-BASE-ANCHOR-LOG-PROOF.md)
- [Base anchor log proof acceptance](docs/M4-BASE-ANCHOR-LOG-PROOF-ACCEPTANCE.md)
- [Base anchor header and log link](docs/M4-BASE-ANCHOR-HEADER-LOG-LINK.md)
- [Base anchor header and log link acceptance](docs/M4-BASE-ANCHOR-HEADER-LOG-LINK-ACCEPTANCE.md)
- [Production custody gate](docs/M4-PRODUCTION-CUSTODY-GATE.md)
- [Production custody gate acceptance](docs/M4-PRODUCTION-CUSTODY-GATE-ACCEPTANCE.md)
- [Production custody gate beacon quote](docs/M4-PRODUCTION-CUSTODY-GATE-BEACON.md)
- [Production custody gate beacon quote acceptance](docs/M4-PRODUCTION-CUSTODY-GATE-BEACON-ACCEPTANCE.md)
- [Ethereum header beacon root](docs/M4-ETHEREUM-HEADER-BEACON-ROOT.md)
- [Ethereum header beacon root acceptance](docs/M4-ETHEREUM-HEADER-BEACON-ROOT-ACCEPTANCE.md)
- [Ethereum beacon root storage](docs/M4-ETHEREUM-BEACON-ROOT-STORAGE.md)
- [Ethereum beacon root storage acceptance](docs/M4-ETHEREUM-BEACON-ROOT-STORAGE-ACCEPTANCE.md)
- [Base anchor beacon root link](docs/M4-BASE-ANCHOR-BEACON-ROOT-LINK.md)
- [Base anchor beacon root link acceptance](docs/M4-BASE-ANCHOR-BEACON-ROOT-LINK-ACCEPTANCE.md)
- [Ethereum beacon root successor](docs/M4-ETHEREUM-BEACON-ROOT-SUCCESSOR.md)
- [Ethereum beacon root successor acceptance](docs/M4-ETHEREUM-BEACON-ROOT-SUCCESSOR-ACCEPTANCE.md)
- [Ethereum beacon payload proof](docs/M4-ETHEREUM-BEACON-PAYLOAD-PROOF.md)
- [Ethereum beacon payload proof acceptance](docs/M4-ETHEREUM-BEACON-PAYLOAD-PROOF-ACCEPTANCE.md)
- [Ethereum beacon header](docs/M4-ETHEREUM-BEACON-HEADER.md)
- [Ethereum beacon header acceptance](docs/M4-ETHEREUM-BEACON-HEADER-ACCEPTANCE.md)
- [Ethereum beacon header successor](docs/M4-ETHEREUM-BEACON-HEADER-SUCCESSOR.md)
- [Ethereum beacon header successor acceptance](docs/M4-ETHEREUM-BEACON-HEADER-SUCCESSOR-ACCEPTANCE.md)
- [Ethereum beacon ancestry](docs/M4-ETHEREUM-BEACON-ANCESTRY.md)
- [Ethereum beacon ancestry acceptance](docs/M4-ETHEREUM-BEACON-ANCESTRY-ACCEPTANCE.md)
- [Ethereum sync aggregate proof](docs/M4-ETHEREUM-SYNC-AGGREGATE-PROOF.md)
- [Ethereum sync aggregate proof acceptance](docs/M4-ETHEREUM-SYNC-AGGREGATE-PROOF-ACCEPTANCE.md)
- [Ethereum beacon checkpoint link](docs/M4-ETHEREUM-BEACON-CHECKPOINT-LINK.md)
- [Ethereum beacon checkpoint link acceptance](docs/M4-ETHEREUM-BEACON-CHECKPOINT-LINK-ACCEPTANCE.md)
- [Altair committee handoff](docs/M4-ETHEREUM-ALTAIR-COMMITTEE-HANDOFF.md)
- [Altair committee handoff acceptance](docs/M4-ETHEREUM-ALTAIR-COMMITTEE-HANDOFF-ACCEPTANCE.md)
- [Committee handoff through period 293](docs/M4-ETHEREUM-COMMITTEE-HANDOFF-292.md)
- [Committee handoff through period 293 acceptance](docs/M4-ETHEREUM-COMMITTEE-HANDOFF-292-ACCEPTANCE.md)
- [Committee handoff through period 294](docs/M4-ETHEREUM-COMMITTEE-HANDOFF-293.md)
- [Committee handoff through period 294 acceptance](docs/M4-ETHEREUM-COMMITTEE-HANDOFF-293-ACCEPTANCE.md)
- [Ethereum committee store](docs/M4-ETHEREUM-COMMITTEE-STORE.md)
- [Ethereum committee store acceptance](docs/M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md)
- [Sync committee checkpoint root](docs/M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md)
- [Base bridge operation inclusion](docs/M4-BASE-BRIDGE-OPERATION-INCLUSION.md)
- [Base bridge operation inclusion acceptance](docs/M4-BASE-BRIDGE-OPERATION-INCLUSION-ACCEPTANCE.md)
- [Base bridge beacon parent link](docs/M4-BASE-BRIDGE-BEACON-PARENT-LINK.md)
- [Base bridge beacon parent link acceptance](docs/M4-BASE-BRIDGE-BEACON-PARENT-LINK-ACCEPTANCE.md)
- [Base bridge beacon checkpoint extension](docs/M4-BASE-BRIDGE-BEACON-CHECKPOINT-EXTENSION.md)
- [Base bridge beacon checkpoint extension acceptance](docs/M4-BASE-BRIDGE-BEACON-CHECKPOINT-EXTENSION-ACCEPTANCE.md)
- [Production custody gate bridge quote](docs/M4-PRODUCTION-CUSTODY-GATE-BRIDGE.md)
- [Production custody gate bridge quote acceptance](docs/M4-PRODUCTION-CUSTODY-GATE-BRIDGE-ACCEPTANCE.md)

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

The production Shadow release helper uses the locked dependency graph and
defaults to the `x86_64-unknown-linux-gnu` target:

```bash
./scripts/shadow-release.sh
```

It refuses non-ELF output. Run it on a Linux build host, or provide a working
cross-linker on another host; a macOS Mach-O binary must never be installed as
the production observer.

The toolchain is pinned by `rust-toolchain.toml` (rustc 1.99.1). The script and
the release workflow set `RUSTFLAGS` with `--remap-path-prefix` for the checkout
and the cargo home, so the same commit built on a Linux host and in CI gives the
same SHA-256. The 0.33.12 artifact was reproduced this way. A binary built with a
different rustc or from another checkout path will have a different hash.

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

For a Base custody review, add an Ethereum L1 RPC. This path requires the
canonical OptimismPortal wiring, a claim-valid dispute-game anchor, and that the
requested block is exactly the block the anchored game commits to. The header is
rebuilt from the RPC block and must hash to the requested hash. The OP output
root `keccak256(0x00…00 ‖ stateRoot ‖ storageRoot ‖ blockHash)` is recomputed
from an account proof of the message passer (`0x4200…0016`) and must equal the
anchored root. Blocks behind the anchor are refused (`accepted no`) until an
ancestry proof exists. The path does not treat the Base execution `finalized` tag
as sufficient and does not open custody:

```bash
bridge-aac check-header --chain base \
  --rpc https://base-rpc.conet.network \
  --l1-rpc https://<ethereum-l1-reader> \
  --level finalized --header <block-hash>
```

Settle one fixture log on the in-process test ledger. The command refuses `--rpc`. Without `--allow-header` the output does not say the header is final. The Circle balance defaults to `0`, so a burn-release AAC stays reserved unless `--circle-balance` is given.

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

The same command accepts `--l1-rpc` to bind the receipt root to the Base block
that the anchored dispute game commits to (same rules as `check-header` above).
Any other block is refused.

`shadow` reads at least two execution clients. It proves one real receipt from TreasuryBridgeV3 or the GB token. A successful source receipt prints `execution-tag yes`, `registry paused`, and `consume denied`. The report does not print `final true`.

```bash
bridge-aac shadow-service --journal /var/lib/bridge-aac/journal.json \
  --cursor /var/lib/bridge-aac/cursor.json \
  --base-rpc http://127.0.0.1:8547 --base-rpc http://{CONET_NODE_C}:8547 \
  --conet-rpc http://127.0.0.1:8889 --conet-rpc http://{CONET_NODE_B}:8888 \
  --log /var/log/bridge-aac/shadow.log --alert /var/log/bridge-aac/alert.log --once
```

`shadow-service` scans from the saved cursor through the lower execution-tagged height. A quiet cycle scans at most 32 blocks. While the cursor is more than 64 blocks behind, it scans 256 blocks and starts the next cycle immediately. Both readers must agree on each block hash and receipts root. A temporary difference between reader finalized tips is reported as advisory `reader-lag-warning` with hysteresis; it does not by itself open the page or reset stable. A `cursor-lag` above 256 blocks, quorum mismatch, receipt-proof failure, RPC failure, or cursor error remains blocking and keeps `/var/lib/bridge-aac/page.txt` at `page open`. `stable yes` means the cursor stayed within 256 blocks of the lower head for 256 verified blocks. The first run records that height as the deployment floor and does not scan back to block 0. The cursor advances only after that range is written. A quiet caught-up cycle prints `heartbeat yes`. Quorum, receipt-proof, gateway, receipt-status, RPC, cursor, and reconcile failures print `BRIDGE_AAC_ALERT` on stdout and in the alert file. The process stays `custody closed`.

A missing cursor file is reported as `cursor missing` and pages `alert cursor-missing`; a fresh start then begins at the current finalized head. A cancellation recorded in any scan window stays cancelled.

The production-side Base reader is a separate read-only command. It takes two independently reachable execution RPCs, chooses the lower `finalized` height, and checks every requested height against both readers:

```bash
bridge-aac base-quorum-reader \
  --rpc http://127.0.0.1:8547 \
  --rpc http://<independent-base-reader>:8547 \
  --from <deployment-floor> --blocks 128
```

It requires Base chain ID `8453`, rejects height zero or a range above the lower finalized head, and compares the block hash, state root, and receipts root. It never broadcasts or uses Ethereum L1 signing credentials. HTTP and WS endpoints from the same execution process are not an independent quorum.

## Library map

| Module | Responsibility |
| --- | --- |
| `assets` | Which assets may cross, and whether the destination mints or releases |
| `merkle` | Phase-0 inclusion proofs |
| `execution` | Base and CONET checks against the execution client's safe or finalized tag; the returned hash must equal the requested hash |
| `base_output_root` | OP output-root binding for the Base L1 anchor path (header rebuild, account proof, output root) |
| `adapter` | Phase-3 test-ledger settlement for the four bridgeable asset classes |
| `mpt` | Ethereum receipt Merkle-Patricia inclusion against an attested receipts root |
| `shadow` | Phase-5 read-only observation across two execution clients |
| `service` | Phase-6 read-only daemon, per-chain cursor, journal, and alerts |
| `journal` | Restart-safe AAC records for this process |
| `gateway` | `submit`, `reserve`, `consume`, pause |
| `receipt` | Phase-1 fixture proof builder |
| `types` | Deposit leaf and AAC id |

Pause rejects new `submit`, `reserve`, and `consume` calls. It does not delete a record that is already stored.
