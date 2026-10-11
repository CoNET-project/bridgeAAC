# M4 Destination Consumer Interface Package

Status: **interface-only; not deployed; custody closed**.

This package defines the ABI boundary for the next AAC milestone. It does not
claim that TreasuryBridgeV3, GBToken, Peer v5, or a proof verifier currently
accept these calls.

Source:

```text
contracts/AacReceiptMptVerifier.sol
contracts/AacHeaderCommitment.sol
contracts/AacDestinationConsumerInterfaces.sol
contracts/AacBaseFinalityVerifier.sol
contracts/AacConetFinalityVerifier.sol
contracts/AacBaseHeaderProofRelayVerifier.sol
contracts/AacConetSyncCommitteeRelayVerifier.sol
contracts/AacDestinationConsumerTestnet.sol
contracts/AacTestM4Mocks.sol
contracts/AacCanonicalAssetAdapterInterfaces.sol
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

`AacReceiptMptVerifier.sol` now supplies the standalone receipt-trie verifier
boundary. It verifies the transaction-index trie key, branch/extension/leaf
nodes, typed receipt bytes, and the authenticated `receiptsRoot`. It does not
authenticate header finality or identify an AAC event; those remain separate
consumer/verifier responsibilities.

`AacBaseFinalityVerifier.sol` supplies the Base-side orchestration boundary. It
requires two injected proof contracts:

```text
IBaseOutputAnchorProofVerifier
IBaseHeaderProofVerifier
```

It rejects a block above `anchorL2` and rejects any block hash/state root that
does not match the L1 output anchor. The injected proof contracts are not yet
implemented or deployed; this contract is therefore an interface-level,
fail-closed component and is not a custody authorization.

`AacL1OutputAnchorRelayVerifier.sol` is a **testnet-only** implementation of
the output-anchor dependency. It accepts a fixed EIP-712 signer quorum,
stores a monotonic anchor, and exposes it through the verifier interface. It
does not verify Ethereum L1 consensus or AnchorStateRegistry storage proofs;
therefore it must not be used for mainnet custody. A trustless Ethereum light
client or an audited canonical relay must replace it before production.

`AacConetFinalityVerifier.sol` supplies the corresponding CoNET-side
orchestration boundary. It requires the injected proof verifier to establish
the genesis validators root, finalized execution payload, state-root binding,
committee handoff, trusted committee, and a two-thirds sync-committee quorum.
Forced updates are rejected. The injected verifier must perform the actual
BLS/SSZ light-client verification; this boundary itself is not a production
light client.

Both finality boundaries now return the shared
`AacHeaderCommitment.Commitment` shape:

```text
sourceChainId
finalityHeight
blockNumber
blockHash
stateRoot
receiptsRoot
finalityDigest
```

This is the only header commitment shape that the future consumer may accept.

`AacBaseHeaderProofRelayVerifier.sol` is the testnet-only companion for the
Base header proof boundary. It makes the Base Sepolia pipeline executable for
integration tests; it is an EIP-712 relay, not a trustless Base light client.

`AacConetSyncCommitteeRelayVerifier.sol` is the corresponding CoNET testnet
integration relay. It carries the same evidence fields required by
`AacConetFinalityVerifier`, including genesis root, finalized execution
payload, state binding, committee handoff, quorum, trusted-committee status,
and forced-update count. It is not a BLS/SSZ light client and must not be used
for mainnet custody.

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

`AacDestinationConsumerTestnet.sol` now connects the unified header commitment,
receipt MPT verifier, consume-once state, and test adapters. It is explicitly
testnet-only: it does not contain canonical Treasury/GB/Peer adapters and must
not be deployed as a production custody consumer.

`AacTestM4Mocks.sol` supplies the Base Sepolia integration-only finality,
receipt, and asset-effect mocks. They deliberately do not validate real
proofs or move assets.

`AacCanonicalAssetAdapterInterfaces.sol` records the verified ABI boundary:

- TreasuryBridgeV3 `executeMint` / `executeRelease` require the complete
  operation payload and validator signatures.
- GBTokenV2 uses `executeBridgeMint(bytes32 sourceTxHash)`.
- The canonical Peer v5 address currently has no deployed code, so the
  developer-token adapter cannot yet be wired or deployed.

No adapter may call a simplified `mint`, `release`, or `execute` selector in
place of these verified interfaces.

`AacCanonicalAdaptersTestnet.sol` provides strict testnet-only forwarding
boundaries for the verified TreasuryBridgeV3 and GBTokenV2 selectors. They
allow only the configured consumer to call the target and revert on target
failure. They are not connected to production Treasury/GB roles. Peer v5
remains blocked until its canonical address has deployed code and a verified
ABI.

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
