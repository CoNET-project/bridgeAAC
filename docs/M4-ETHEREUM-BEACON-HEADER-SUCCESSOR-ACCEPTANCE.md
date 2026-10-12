# Ethereum Beacon Header Successor Acceptance

Status: **PASS as one beacon-slot successor. `headerFinal` stays false.
Custody remains closed.**

Collected at `2026-10-12T05:12:22Z`.

| Check | Result |
|---|---|
| Contract | `0x532080e752ddebd0DD9b2c3611Ee9307513BfBdc` |
| Runtime | 1728 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Child slot | `15406751` |
| Parent beacon root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Child beacon root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| Execution hash | `0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff` |
| `headerFinal` | false |
| Wrong proposer | reverts `InvalidHeader` (`0xbabb01dd`) |
| Tampered branch | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The child header parent is beacon block `15406750`. The child body contains
execution block `26167827`. This is one slot closer to a finalized checkpoint
and does not authenticate that checkpoint.

Machine-readable result: `deployments/base-AacEthereumBeaconHeaderSuccessor.json`.
