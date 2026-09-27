# bridgeAAC MVP

**Status:** Phase 0 is the Rust crate in this directory. Later phases are not implemented. MVP completion is not mainnet readiness.

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

A separate binary reads a source-chain receipt and builds an inclusion proof of the lock or burn log. The finality check stays on `MockFinality` or an equivalent allowlist, and the command output says so.

Acceptance:

- Given a fixture receipt, the builder emits the deposit leaf, the siblings, and the header hash the phase-0 gateway already verifies.
- The tool refuses to print "final" unless a finality verifier accepted the header.

## Phase 2 — Finality adapters

Two implementations of `FinalityVerifier`:

1. Base: the header is an OP Stack output that has reached the configured finality level. A Base receipt path alone is not enough.
2. CONET: the header is accepted under CONET consensus rules. Base cannot see CONET headers through Ethereum, so this adapter is required for CONET-to-Base USDC release and for GB or developer tokens leaving CONET.

Acceptance:

- An unknown or non-final header is `UnknownHeader`.
- Replacing the verifier does not change AAC ids or the `reserve` / `consume` rules.
- `MockFinality` remains available for tests and is still named as a test double.

## Phase 3 — Asset adapters on a test network

Wire the phase-0 transitions to contracts, still not mainnet:

| AAC class | Source transaction | Destination transaction after `Reserved` |
| --- | --- | --- |
| USDC lock-mint | Base TreasuryBridgeV3 locks Circle USDC | CONET TreasuryBridgeV3 mints `conet-USDC` |
| USDC burn-release | CONET TreasuryBridgeV3 burns `conet-USDC` | Base TreasuryBridgeV3 pays Circle USDC from its balance |
| Paid GB | Source GB `bridgeOut` burns paid GB | Destination GB `mintPaid` through consume of the AAC |
| Unbound developer token | Source Peer v5 burns the token | Destination Peer v5 mints the same address |

`executeBridgeMint` may run only as that GB consume step. `voteBridgeMint` is not an input.

If the Base treasury's Circle balance is below the AAC amount, consume reverts and the record stays `Reserved`.

Peer v5 `createERC20` on the two chains must stay at the same nonce. Only that call creates a contract.

## Phase 4 — Audit gate

Before any mainnet use:

- Independent review of the finality adapters and of the destination state machine.
- A written statement that miner `voteBridgeOperation` and `voteBridgeMint` are still the live paths until cutover.
- No documentation that calls a miner signature a Merkle proof.

Cutover is a separate decision. This MVP does not perform it.

## Build

```bash
cd src/bridgeAAC
cargo test
cargo build --release --target x86_64-unknown-linux-gnu
```

The Linux artifact is an ELF at `target/x86_64-unknown-linux-gnu/release/bridge-aac`.
