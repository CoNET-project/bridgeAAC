# Ethereum Sync Aggregate Proof

Status: **deployed on Base. The sync committee inside finalized slot
15413120 signed that block. `headerFinal` stays false, and custody remains
closed.**

| Item | Value |
|---|---|
| Contract | `0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341` |
| Deployment | `0x595ee96d52012313d8485198b1ec272752a078c66564a5c97199a50b4e63a082` |
| Finalized slot | `15413120` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Signing root | `0xcef166bab13cbbbe9ec443badd41cfecf6d94d01db7064b95ce1d4beb115ba49` |
| Participants | `505` of `512` |
| `aggregateVerified` | true |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` checks the supplied public keys against the pinned committee digest,
aggregates the 505 participating keys with the BLS12-381 G1 multiexponentiation
precompile, and checks the pairing against the pinned signature. A changed key
reverts `InvalidProof`.

The committee comes from that block's own light-client bootstrap. A matching
aggregate shows the committee signed the block. It does not make the committee
an independent trust anchor, so `headerFinal` stays false. The production gate
was not upgraded.

Acceptance: [M4-ETHEREUM-SYNC-AGGREGATE-PROOF-ACCEPTANCE.md](M4-ETHEREUM-SYNC-AGGREGATE-PROOF-ACCEPTANCE.md).
