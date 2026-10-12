# Ethereum Beacon Checkpoint Link Acceptance

Status: **PASS as one combined call. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T06:01:36Z`.

| Check | Result |
|---|---|
| Contract | `0xeA57144daa0d02A90794bC0FbE1dA92050f4f59E` |
| Runtime | 1252 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Anchor root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| Links | `6348` |
| Participants | `505` |
| `aggregateVerified` | true |
| `headerFinal` | false |
| Changed committee key | reverts `InvalidProof` (`0x09bde339`) |
| Shortened header list | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The call binds the parent chain and the sync aggregate to the same finalized
root. It does not turn that committee into an independent trust anchor.

Machine-readable result: `deployments/base-AacEthereumBeaconCheckpointLink.json`.
