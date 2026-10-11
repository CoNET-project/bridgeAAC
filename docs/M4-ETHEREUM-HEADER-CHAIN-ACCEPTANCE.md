# Ethereum Header Parent Chain Acceptance

Status: **PASS. The output-root header extends the registry-proof header.
`headerFinal` stays false. Custody remains closed.**

Collected at `2026-10-11T08:28:40Z` by fetching Ethereum blocks `26167726`
through `26167826` again and replaying them through the deployed contract.

| Check | Result |
|---|---|
| Contract | `0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D` |
| Oldest block | `26167726` |
| Oldest hash | `0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa` |
| Newest block | `26167826` |
| Newest hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Parent links | `100` |
| Numbers increase by one | yes |
| `headerFinal` | false |
| Runtime size | 1923 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result:
`deployments/base-AacEthereumHeaderChain-acceptance.json`.
