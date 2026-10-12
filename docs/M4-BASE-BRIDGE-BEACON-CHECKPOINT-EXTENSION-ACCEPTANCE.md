# Base Bridge Beacon Checkpoint Extension Acceptance

Status: **PASS as a parent-link proof. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T08:13:33Z`.

| Check | Result |
|---|---|
| Contract | `0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b` |
| Runtime | 2717 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Base block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| Bridge beacon root | `0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5` |
| Checkpoint root | `0x480505bce46a8902cd88c95f6a2a3d9998c8cbdffd25f9c4aa7ef81d3a5e6453` |
| Links | `580` |
| `headerFinal` | false |
| Changed receipt proof | reverts `InvalidProof` (`0x09bde339`) |
| Shortened header list | reverts `InvalidHeader` (`0xbabb01dd`) |
| Changed proposer | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The local SSZ hash of each extension header matched the previous parent
before deployment. The newest header is slot `15413984`. The oldest header is
slot `15413405`.

Machine-readable result: `deployments/base-AacBaseBridgeBeaconCheckpointExtension.json`.
