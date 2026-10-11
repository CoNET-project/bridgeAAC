# Ethereum Header Parent Chain Acceptance

Status: **PASS. The output-root header extends the registry-proof header.
`headerFinal` stays false. Custody remains closed.**

The output-root contract was replayed in the same pass. It still returns
output root `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f`
for Base block `52239960`, with `headerFinal = false`.

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
| Sourcify | creation `match`, runtime `match` |

Machine-readable result: `deployments/base-AacEthereumHeaderChain.json`.
