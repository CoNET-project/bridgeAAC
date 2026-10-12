# Ethereum Beacon Ancestry Acceptance

Status: **PASS as a parent-chain walk. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T05:49:51Z`.

| Check | Result |
|---|---|
| Contract | `0x4E28D764151AD328d7c50a0fFB380935d07a26dF` |
| Runtime | 1384 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Links | `6348` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Oldest header slot | `15406752` |
| Anchor root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| `headerFinal` | false |
| Changed proposer | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The walk shows that beacon slot `15406751` is an ancestor of the pinned
finalized checkpoint at slot `15413120`. It does not show that a sync
committee signed that checkpoint.

Machine-readable result: `deployments/base-AacEthereumBeaconAncestry.json`.
