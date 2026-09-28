# bridgeAAC Whitepaper

**Version:** 0.16.0  
**Status:** The read-only production Shadow observer is approved and running. AAC custody is closed. Not a light client.

## Abstract

bridgeAAC is the cross-chain settlement record for three Beamio assets: canonical USDC, paid GB, and unbound developer ERC-20 tokens. The source chain locks or burns the asset in one transaction. The destination chain mints or releases the corresponding asset only after it verifies a state proof of that source transaction.

The destination record is an Atomic Asset Container (AAC). `isReserved` means that container is held for one source deposit, one amount, and one recipient. A second mint or release of the same deposit reverts.

Miner votes are how the live bridge attests a remote deposit today. This paper specifies the state machine that replaces that per-deposit vote. It does not claim the replacement is already running on CONET or Base.

The production Shadow validates the observer and reconciliation path without controlling assets. It scans from a deployment floor, requires two readers per chain, persists its cursor, pages on reader divergence, and emits no settlement transaction. Production mint and release remain on the existing miner-vote contracts.

## 1. Problem

`TreasuryBridgeV3` miners call `voteBridgeOperation`. GB bridge validators call `voteBridgeMint`. Both ask a committee whether a remote burn or lock happened.

That committee can be fast to ship, and it is the live path. It is not a proof that the source transaction is final. A proof-driven gateway has to separate five checks:

1. The lock or burn exists under a source state commitment.
2. The commitment belongs to a real source header.
3. That header is final under the source chain's rules.
4. The asset, amount, recipient, domain, and deposit id match the AAC.
5. The destination state machine consumes the deposit once.

A Merkle inclusion path answers only the first check. An event log answers none of them by itself.

## 2. AAC

An AAC binds:

```text
source chain id
source gateway
source deposit id
source asset
destination asset
amount
recipient
target domain
asset class
```

The AAC id is:

```text
keccak256(
  "beamio.bridge-aac.aac-id.v1" ||
  source chain id ||
  source gateway ||
  source deposit id ||
  target domain
)
```

The id is not a token. It is the key of one destination right.

### 2.1 States

```text
submit proof  ->  Verified
reserve       ->  Reserved     (isReserved = true)
consume       ->  Minted       for mint assets
consume       ->  Released     for USDC burn-release
```

`Minted` and `Released` do not return to `Reserved`. Pause stops new transitions. Pause does not erase a stored AAC and cannot invent a source deposit.

`isReserved` is the destination soft lock against a double mint. The source lock or burn is the custody event. One does not substitute for the other.

### 2.2 Settlement

| Class | Destination action |
| --- | --- |
| USDC lock-mint | Mint canonical CONET USDC |
| USDC burn-release | Transfer Circle USDC out of the Base treasury balance |
| Paid GB | `mintPaid` the burned amount |
| Unbound developer token | Mint that token |

The amount comes from the verified deposit. The caller does not get to substitute a larger amount at consume time.

## 3. Two treasuries, three gateways

TreasuryBridgeV3 is deployed at `0xa208982212978550594A7FEEB70a61665d129003` on both CONET (chain id 224422) and Base (chain id 8453). The address matches. The storage does not. The source treasury only locks or burns. The destination treasury writes the USDC AAC.

### 3.1 Canonical USDC

Base to CONET:

1. The Base treasury locks Circle USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` and records a deposit.
2. The CONET treasury verifies that deposit against a final Base header.
3. The same CONET transaction reserves the AAC and mints `conet-USDC` `0x5209865D404aA5646eDe5B91CD4218909eA72eDA` to the recipient. The recipient may be a Beamio AA.

CONET to Base:

1. The CONET treasury burns `conet-USDC`.
2. The Base treasury verifies that burn against a final CONET header.
3. The same Base transaction reserves the AAC and pays Circle USDC from the treasury's own balance. If the balance is short, the transaction reverts and the AAC stays unconsumed.

### 3.2 Paid GB

GB uses the GB contract `0xC3EF02DaE632b4C10abB66e07d92a387c10838D8` on both chains, not the USDC treasury.

1. The source GB contract burns paid GB in `bridgeOut`. Free GB cannot leave.
2. The destination GB contract verifies the burn, reserves the AAC, and `mintPaid`s the same amount.
3. `voteBridgeMint` is removed on this path. `executeBridgeMint` only consumes an AAC that is already reserved. Validator count alone must not mint.

The route is symmetric: CONET to Base and Base to CONET.

### 3.3 Developer ERC-20

Unbound developer tokens use Peer v5 `0x1DF0F1826e9085caDB2bDc927A117140FAb39066` on both chains.

1. The source Peer v5 burns the holder's tokens.
2. The destination Peer v5 verifies the burn and mints the same token address.

The token address matches across chains only when both Peer v5 contracts `createERC20` at the same nonce. No other call on Peer v5 creates a contract.

A developer token that has a GB exchange rate cannot be transferred and cannot cross. `AssetIntent::Developer { gb_bound: true }` is rejected before an AAC id is stored.

### 3.4 What stays outside the AAC

- The GB-per-USDC rate and the 500 CONET voter threshold. Those votes stay on CONET Peer v5.
- GB-priced developer tokens.
- Free GB.
- The legacy treasury `0xa311c8fBE7CafC611603Ee925465A62493B73B30`.

## 4. Proofs

Phase 0 verifies a sorted-pair Merkle path against a root stored in a header commitment, and asks `FinalityVerifier` whether that header hash was accepted.

That split is deliberate:

- Inclusion proves the leaf sits under a root.
- Finality proves the root belongs to a source header that will not be reorged away.
- A header submitted by the relayer, with no finality check, is not a proof. A false header can mint assets.

Base is an OP Stack chain. A Base receipt proof still needs the block to be a finalized output. CONET headers are not automatically available to Base, so the CONET-to-Base direction needs its own CONET finality adapter. An OP output-root check and a CONET beacon-signature check are not in this crate.

Phase 2 adds `BaseFinality` and `ConetFinality`. They accept a header only when that chain's execution client reports it as canonical and at or behind `safe` or `finalized`. They do not verify OP fault proofs or CONET beacon signatures. `MockFinality` is still only a test double.

Phase 3 plans the destination consume for each bridgeable asset and applies it on an in-process test ledger. The command is `bridge-aac settle`. It does not open an RPC connection. A short Base Circle balance leaves the AAC `Reserved`. `executeBridgeMint` runs only for a reserved paid-GB AAC. Miner vote names are rejected. Peer v5 token addresses match across chains only when both sides `createERC20` at the same nonce. The consume selectors are not deployed contracts.

Phase 5 is the production read-only Shadow observer. Two reader paths per chain must agree at each scanned height on block hash, state root, and receipts root. The scanner chooses the lower finalized reader height, so one faster reader cannot advance the decision boundary by itself. It proves a real receipt under the agreed receipts root and reports legacy bridge logs as `decision observe`. It does not mint, release, or broadcast. `custody closed` stays in every report. Miner votes remain the live settlement path.

### 4.1 Production Shadow deployment

Release `bridge-aac-v0.16.0` is deployed on `38.102.126.30` as `bridge-aac-shadow-prod.service`.

- Base readers are the independent Base nodes on `.30:8547` and `.58:8547`.
- CONET readers are the local `.30:8889` archive and the `publicrpc.conet.network` archive cluster.
- An existing cursor never falls below its deployment floor.
- Cursor safety is measured against the lower reader head. Production approval required both chains to complete a 256-block stable hold with lower-head cursor lag at or below 64.
- Reader divergence remains separately visible. It opens the page even when scanning the lower agreed chain remains safe.
- Cursor and page state persist across restarts; log-write, corrupt-cursor, restart, and logrotate drills passed.

At the final 2026-09-28 evaluation, Base and CONET both reported `stable yes` and lower-head cursor lag `0`. Base still showed periodic reader lag, including 177 blocks in the final sample, and correctly kept `alert reader-lag` open. This approval is evidence for continuous read-only observation only.

`base-l1-output` reads the Base OptimismPortal anchor on Ethereum L1 and checks `isGameClaimValid`. It reports whether a Base block is at or behind that anchor. It does not replay the fault proof, does not replace the execution-tag shadow, and does not print a custody-final result. `conet-consensus` compares the beacon finalized execution payload with the execution client's finalized tag and checks the sync-committee aggregate. A matching FastAggregateVerify prints `signature-check yes` and `trusted-committee no`. It does not accept that tag into shadow. `destination-consumer` searches for PUSH4 encodings of `aacConsumeMint`, `aacConsumeRelease`, `aacConsumeMintPaid`, and `aacConsumeMintDeveloper`. `selector-observation present` is not consume-once. The live command always reports `semantic-proof no`, `consume-once no`, `consumer observation-only`, and `custody-gate no`. `gb-mint-authority` reads whether GBToken still dispatches `mint`, `mintPaid`, and `voteBridgeMint`. Those selectors are on the GB token, not on TreasuryBridgeV3. Missing selectors print `selectors-absent yes` and still print `upgrade-authority unread` and `mint-closed no`. Neither command sends a transaction. A later `FinalityVerifier` may check OP output roots or a CONET consensus proof. The AAC state machine does not change when that verifier is replaced. Production custody stays closed until that verifier, a destination contract that passes the semantic gate, mint-authority closure, and an independent review exist.

## 5. Live path until the adapter exists

On mainnet, USDC still settles through miner `voteBridgeOperation` on TreasuryBridgeV3. GB still settles through `voteBridgeMint`. Peer v5 is specified and not yet the live developer bridge.

Those votes must not be labeled as Merkle proofs or as reserved AACs. The Rust gateway is the reference state machine for the replacement, not a switch that turns the live vote off.

## 6. Operators

Anyone may submit a proof. Only the destination gateway may reserve and consume, and only after verification. Developers do not receive a mint key that skips the proof.

A paused gateway rejects new submits, reserves, and consumes. Previously stored containers remain readable.

## 7. Non-goals of this draft

- Deploying AAC consume contracts, or moving custody off miner votes.
- Replacing the live miner quorum before a reviewed finality adapter exists.
- Treating an event log, a relayer signature, or a message-bus delivery receipt as a source-chain proof.
- Opening a cross-chain route for GB-priced developer tokens.
