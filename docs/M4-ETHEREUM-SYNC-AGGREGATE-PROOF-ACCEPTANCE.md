# Ethereum Sync Aggregate Proof Acceptance

Status: **PASS as an aggregate signature check. `headerFinal` stays false.
Custody remains closed.**

Collected at `2026-10-12T05:56:22Z`.

| Check | Result |
|---|---|
| Contract | `0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341` |
| Runtime | 2737 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Signing root | `0xcef166bab13cbbbe9ec443badd41cfecf6d94d01db7064b95ce1d4beb115ba49` |
| Participants | `505` |
| `aggregateVerified` | true |
| `headerFinal` | false |
| Changed committee key | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The ancestry contract already connects this finalized block to beacon slot
`15406751`. This call adds the sync-aggregate check for the same finalized
root. The two calls are separate, and `headerFinal` remains false.

Machine-readable result: `deployments/base-AacEthereumSyncAggregateProof.json`.
