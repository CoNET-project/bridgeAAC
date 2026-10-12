# Ethereum Beacon Root Successor Acceptance

Status: **PASS as one parent-hash step. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T02:54:48Z`.

| Check | Result |
|---|---|
| Contract | `0x486BF16d9bDd87F12eb983C27905a1deBABb004c` |
| Runtime | 6136 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Parent header | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Parent number | `26167826` |
| Parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| Child header | `0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff` |
| Child number | `26167827` |
| Child beacon root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Child timestamp | `1791705035` |
| `headerFinal` | false |
| Swapped parent header | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |

The child execution header extends the accepted header by one block, and its
beacon root is the value stored by EIP-4788 in that child state. The step
does not prove that the beacon chain finalized either root.

Machine-readable result: `deployments/base-AacEthereumBeaconRootSuccessor.json`.
