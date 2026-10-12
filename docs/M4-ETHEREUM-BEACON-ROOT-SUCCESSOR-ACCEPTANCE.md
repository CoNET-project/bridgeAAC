# Ethereum Beacon Root Successor Acceptance

Status: **PASS as one parent-hash step. `headerFinal` stays false. Custody
remains closed.**

Replayed at `2026-10-12T03:05:29Z` by refetching Ethereum blocks `26167826`
and `26167827`, rebuilding the child EIP-4788 storage proof, and calling
`verify` again.

| Check | Result |
|---|---|
| Contract | `0x486BF16d9bDd87F12eb983C27905a1deBABb004c` |
| Runtime | 6136 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| On-chain parent header | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| On-chain parent number | `26167826` |
| On-chain parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| On-chain child header | `0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff` |
| On-chain child number | `26167827` |
| Quoted child beacon root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Quoted child timestamp | `1791705035` |
| Quoted `headerFinal` | false |
| Swapped parent header | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The child execution header extends the accepted header by one block, and its
beacon root is the value stored by EIP-4788 in that child state. The step
does not prove that the beacon chain finalized either root.

Machine-readable result:
`deployments/base-AacEthereumBeaconRootSuccessor-acceptance.json`.
