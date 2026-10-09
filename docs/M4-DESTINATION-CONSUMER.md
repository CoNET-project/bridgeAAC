# M4 Destination Consumer Interface Package

Status: **interface-only; not deployed; custody closed**.

This package defines the ABI boundary for the next AAC milestone. It does not
claim that TreasuryBridgeV3, GBToken, Peer v5, or a proof verifier currently
accept these calls.

Source:

```text
contracts/AacDestinationConsumerInterfaces.sol
deployments/aac-destination-consumer-interface.json
```

## Required flow

```text
source receipt
  -> off-chain proof package
  -> on-chain finality verifier
  -> consume-once consumer
  -> exactly one asset adapter
  -> atomic mint/release
```

The consumer must reject:

- a source chain or destination chain mismatch;
- an untrusted or non-final source header;
- a receipt proof whose receipts root differs from the authenticated header;
- a leaf or AAC id that is already consumed;
- a recipient, asset, amount, or target domain different from the registered
  record;
- any direct call from an account other than the configured gateway;
- any asset kind that does not map to exactly one adapter.

## Proof boundary

`IAacOnchainProofVerifier` is intentionally separate from the consumer. It
must bind:

```text
sourceChainId
sourceHeader
receiptsRoot
receiptIndex
receiptRlp
receiptProof
```

The verifier must authenticate the source header with the relevant finality
adapter before accepting the receipt trie proof. Base requires the Ethereum L1
output-anchor path. CoNET requires an independently trusted beacon finality
path. The current Rust observers are read-only evidence producers; they are
not this on-chain verifier.

## Asset adapters

The consumer calls one and only one adapter:

| Asset intent | Adapter |
|---|---|
| Base lock → CoNET USDC mint | `IAacTreasuryMintAdapter` |
| CoNET burn → Base USDC release | `IAacTreasuryReleaseAdapter` |
| Paid GB bridge | `IAacPaidGbMintAdapter` |
| Unbound developer ERC-20 | `IAacDeveloperTokenMintAdapter` |

The canonical target addresses are recorded in
`deployments/aac-destination-consumer-interface.json`. The interface package
does not grant roles or imply that the target contracts implement these
functions.

## Role and upgrade requirements

Before any custody deployment:

1. `admin`, `gateway`, and proof verifier must be distinct and explicitly
   recorded.
2. Every adapter must enforce the consumer caller.
3. `pause` must stop registration and consumption without deleting records.
4. A consumed AAC id must be durable and impossible to consume twice.
5. Upgrade authorization and storage layout must be independently reviewed.
6. A failed asset effect must revert the consume-once state atomically.
7. The deployed implementation, proxy, roles, and adapter addresses must be
   verified on the relevant explorer.

No M4 deployment, role wiring, mint, release, or miner-vote cutover is
authorized by this interface package.
