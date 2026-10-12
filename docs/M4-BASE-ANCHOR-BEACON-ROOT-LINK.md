# Base Anchor Beacon Root Link

Status: **deployed on Base. One call binds two accepted proofs. `headerFinal`
stays false, and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| Deployment | `0xdf7c1e64916cfe0a708aeada6bcd4ff67fba32901c8da2ac9f77999e2cff6ca9` |
| Proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Beacon storage | `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` |
| Ethereum header | `26167826` / `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| Beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| USDC log | receipt `9`, log `13`, amount `236185820404` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` accepts the call only when the 100-step header chain, the anchored
Base USDC log, and the EIP-4788 beacon-root storage proof all use Ethereum
header `0xbeeaebea…d725`. The USDC log remains an ordinary transfer inside
Base block `52239960`. The beacon root remains an execution-state record.

The production gate was not upgraded. Its `settle` path still reverts.

Acceptance: [M4-BASE-ANCHOR-BEACON-ROOT-LINK-ACCEPTANCE.md](M4-BASE-ANCHOR-BEACON-ROOT-LINK-ACCEPTANCE.md).
