# Base Bridge Beacon Parent Link Acceptance

Status: **PASS as a parent-link proof. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T08:10:28Z`.

| Check | Result |
|---|---|
| Contract | `0x58F6560184EdD9912F2032060D56fc726a042960` |
| Runtime | 3444 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Base block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| Beacon root | `0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Links | `284` |
| `headerFinal` | false |
| Changed receipt proof | reverts `InvalidProof` (`0x09bde339`) |
| Shortened header list | reverts `InvalidHeader` (`0xbabb01dd`) |
| Changed proposer | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The local SSZ hash of each supplied header matched the previous parent before
deployment. The newest header is slot `15413404`. The oldest header is slot
`15413121`.

Machine-readable result: `deployments/base-AacBaseBridgeBeaconParentLink.json`.
