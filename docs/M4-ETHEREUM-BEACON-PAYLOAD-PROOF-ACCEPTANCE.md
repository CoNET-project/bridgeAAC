# Ethereum Beacon Payload Proof Acceptance

Status: **PASS as a payload inclusion proof. `headerFinal` stays false.
Custody remains closed.**

Replayed at `2026-10-12T05:08:00Z`. The 12-node branch was rebuilt from the
Fulu beacon block and passed to `verify` again.

| Check | Result |
|---|---|
| Contract | `0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` |
| Runtime | 833 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| On-chain execution hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| On-chain beacon block root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| On-chain beacon slot | `15406750` |
| On-chain generalized index | `6444` |
| Quoted `headerFinal` | false |
| Tampered branch | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The local Fulu SSZ hash of beacon block `15406750` is the same root. The
branch reaches that root from the execution block hash. The proof does not
show that this beacon block is the finalized checkpoint.

Machine-readable result:
`deployments/base-AacEthereumBeaconPayloadProof-acceptance.json`.
