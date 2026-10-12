# Ethereum Beacon Payload Proof Acceptance

Status: **PASS as a payload inclusion proof. `headerFinal` stays false.
Custody remains closed.**

Collected at `2026-10-12T03:12:36Z`.

| Check | Result |
|---|---|
| Contract | `0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` |
| Runtime | 833 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Execution hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Beacon block root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Beacon slot | `15406750` |
| `headerFinal` | false |
| Tampered branch | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |

The local Fulu SSZ hash of beacon block `15406750` is the same root. The
12-node branch reaches that root from the execution block hash at generalized
index `6444`. The proof does not show that this beacon block is the finalized
checkpoint.

Machine-readable result: `deployments/base-AacEthereumBeaconPayloadProof.json`.
