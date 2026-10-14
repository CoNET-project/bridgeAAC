# Sync committee checkpoint root

Status: **installed on Base, obstacle 1 accepted, custody closed.** New Base
finality proofs for AAC use a recent Ethereum sync-committee checkpoint as
their first public-key root. They do not replay the Altair fork. The
historical 0.01 USDC lock is not a sample for this root. The proxy
`headerFinal()` view stays false. A proof may return true only for the call
that verifies the aggregate.

The Altair handoff contracts and the committee store at
`0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` remain historical Base
deployments. They are not this root, and they are not extended by replaying
periods `630` through `1880`.

## What the root is

The root is the 512-key sync committee that signs beacon slots in one chosen
period. The installed checkpoint is period `1883`. The period length stays
`8192` slots, about
`27.3` hours. The protocol does not define a shorter committee period.

The installed proxy is `0xcEE3D699df3df07a573f1aFf642888B97B7aA961`.
Its implementation is `0x5D92bC7d8b87BC84142C396417f26b55b7B11863`.
The finalized beacon slot is `15427520`, the beacon root is
`0xbfd339bc85988b6c6c44decccb7de54564ea1fe5f7d0e754c4fb20917a0e939a`,
and the compressed digest is
`0xb5e26546712793699378679bbfe918ce15ea3a230259d05113189599b634db94`.
The aggregate proof is transaction
`0xa2c193ee67a86f35d5e48abe092496659c3c615f1c56591cbbdbdc7857e971c5`.

`headerFinal` inside a later proof means the header is final relative to this
agreed root. It does not mean the keys were signed forward from the Altair
fork block.

## Installation

All of the following are required before the compressed committee digest may
be stored. Storing the digest is not itself finality.

1. **Finalized beacon block.** Choose a finalized beacon block at slot `S`.
   Its period is `P = S / 8192`. The root keys are `current_sync_committee`
   in that block's beacon state: the committee that signs slots in period `P`.
2. **State inclusion.** A Merkle proof binds those 512 keys to that block's
   beacon `state_root`. The stored value is `keccak256` of the compressed
   keys. A beacon HTTP document without this branch is not an installation.
3. **EIP-4788 record.** The same beacon block root is present in the
   Ethereum execution-layer beacon-roots contract
   `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02` for an execution header whose
   account proof is checked. This records that the execution layer stored the
   root. It does not, by itself, prove that the beacon chain finalized the
   header. The existing storage proof
   `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` already shows that limit.
4. **Observer agreement.** More than one CoNET observer recomputes the same
   compressed digest from the beacon state and the Merkle branch. The
   installation record names those observers and their matching digest. One
   beacon endpoint is not an observer set. Observers agree only on this
   initial root.
5. **Live aggregate.** After the digest is stored, one sync aggregate from a
   beacon block in period `P` must verify under those keys. At least two
   thirds of the 512 keys participate (`participants * 3 >= 512 * 2`). The
   signed header is in period `P`. If verification fails, the root is
   rejected and cannot be used.

A Base output root is not this root. An output root commits to a Base
execution state, a message-passer storage root, and a Base block hash. It
does not contain the 512 sync-committee keys. Base follows Ethereum's chain,
so a Base L1-origin match does not elect the Ethereum committee.

## Forward updates

After installation, one Base contract stores one committee.

| Rule | Requirement |
|---|---|
| Rotation | `applyUpdate` advances exactly one period |
| Signer | The stored committee signs the attested header |
| Quorum | At least two thirds of the 512 keys |
| Period | The signature slot and the attested slot are in the stored period, and the signature slot is later than the attested slot |
| Skip | A jump of more than one period is rejected |
| Forced update | An aggregate below two thirds does not rotate the committee |
| Where | Pairing uses Base EIP-2537 precompiles `0x0b`–`0x11` |

CoNET execution at those same addresses returns empty results. Committee
pairing stays on Base. CoNET does not call Base's precompiles.

New locks are accepted only for beacon slots that the stored committee can
sign. Settlement waits until a finalized beacon header is at least as late as
the lock's beacon slot. Finality lags by about two epochs. Many receipts
under that one finalized header share its BLS verification. Each receipt
still has its own inclusion proof and can be consumed once.

The next period's keys are accepted only through the one-period update above.
Observer signatures do not replace that update.

## Cost

Skipping the Altair replay removes the historical handoff transactions. It
does not remove later rotations. At the rate measured on Base on 2026-10-12
(median `11,481,348` gas, effective gas price `0.006` gwei), one rotation
costs about `0.000069` ETH. A year is about `321` rotations, about `0.022`
ETH at that price. Gas price changes move the ETH cost in proportion. The
`512`-key pairing dominates the gas. Calldata of about `91` KB is included in
that measurement.

One Base transaction cannot carry two such pairings. The per-transaction gas
cap is `16,777,216`, and one rotation already uses about `11.5` million gas.
A finalized-header proof for a settlement batch is a separate transaction
when it needs its own pairing.

## Production acceptance

Deployment and pass/fail rules for this root are obstacle 1 and obstacle 2 in
[PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md). Obstacle 1 is a new
Base store initialized at the checkpoint committee. Obstacle 2 is one new
message proved under that committee. The Altair store is neither obstacle.

## What stays closed

The checkpoint is installed and obstacle 2 has one covered message. The
store views stay false. This page does not authorize `settle`. The
production proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` still reverts
`CustodyClosed`. Miner votes remain the live bridge.

The historical 0.01 USDC `BridgeOperation` in Base block `52497860`, beacon
slot `15413404`, period `1881`, is outside this protocol. Covering it is not
required.
