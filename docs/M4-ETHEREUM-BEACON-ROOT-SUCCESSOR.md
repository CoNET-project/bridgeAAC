# Ethereum Beacon Root Successor

Status: **deployed on Base. The next execution header extends the accepted
header. This is not beacon finality, and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x486BF16d9bDd87F12eb983C27905a1deBABb004c` |
| Deployment | `0x427095fa577ab6a321778638b79cdf92d470e4d86353b1f099f77c1712ce3b9f` |
| Parent header | `26167826` / `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| Child header | `26167827` / `0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff` |
| Child beacon root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Child timestamp | `1791705035` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` accepts the call only when the parent header is the already accepted
execution header, the child header's parent hash is that header, the child
number is `26167827`, and the child's EIP-4788 beacon-roots contract stores
the child's own beacon root. Swapping the parent and child headers reverts
`InvalidHeader`.

The production gate was not upgraded. Its `settle` path still reverts.

Acceptance, including the later replay:
[M4-ETHEREUM-BEACON-ROOT-SUCCESSOR-ACCEPTANCE.md](M4-ETHEREUM-BEACON-ROOT-SUCCESSOR-ACCEPTANCE.md).
