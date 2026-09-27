# bridgeAAC

Linux reference gateway for the Beamio Atomic Asset Container (AAC).

An AAC is a one-time destination-chain record. The source chain locks or burns an asset. The destination chain accepts that fact only after a state proof, marks the record reserved, and then mints or releases the matching asset once.

This repository is phase 0 of that gateway. It is a Rust library and a small CLI. It does not submit mainnet transactions, and it does not contain a Base or CONET light client.

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

Compute an AAC id for a Base-to-CONET USDC deposit. The ID depends on the source chain, source gateway, deposit id, and target domain. It does not depend on the amount.

```bash
bridge-aac aac-id 8453 0xa208982212978550594A7FEEB70a61665d129003 \
  0x0000000000000000000000000000000000000000000000000000000000000001 \
  0x0000000000000000000000000000000000000000000000000000000000000002
```

## Library map

| Module | Responsibility |
| --- | --- |
| `assets` | Which assets may cross, and whether the destination mints or releases |
| `merkle` | Phase-0 inclusion proofs |
| `finality` | Header acceptance. Production verifiers implement the same trait |
| `gateway` | `submit`, `reserve`, `consume`, pause |
| `types` | Deposit leaf and AAC id |

Pause rejects new `submit`, `reserve`, and `consume` calls. It does not delete a record that is already stored.
