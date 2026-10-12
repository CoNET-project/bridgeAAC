# Ethereum Beacon Header Acceptance

Status: **PASS as a beacon header hash. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T05:08:43Z`.

| Check | Result |
|---|---|
| Contract | `0xa9A07770335138A1c37a25bD1F0bb2A5BeC838dE` |
| Runtime | 1055 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Beacon slot | `15406750` |
| Parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| Beacon block root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| `headerFinal` | false |
| Wrong proposer | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |

The SSZ header hash matches the beacon block root already proven to contain
the accepted execution hash. The header's parent is the beacon root committed
by execution block `26167826`. The header is not shown to be the finalized
checkpoint.

Machine-readable result: `deployments/base-AacEthereumBeaconHeader.json`.
