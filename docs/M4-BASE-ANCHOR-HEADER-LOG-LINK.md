# Base Anchor Header and Log Link

Status: **accepted. The USDC log proof uses the Ethereum header at the end of
the 100-step parent chain. Beacon finality is not claimed. Custody remains
closed.**

`AacBaseAnchorHeaderLogLink` calls the accepted header chain and the accepted
log proof in one read. The chain must start at Ethereum block `26167726` and
contain exactly 100 parent links. The log proof's Ethereum header must be the
newest header in that chain.

`headerFinal` stays false. The paused canary was not changed.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Deployment | `0x339c92e26444a011b461d4ad772c3f8fddbe9f98c3285b9b0fd112809dfb5543` |
| Header chain | `0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D` |
| Log proof | `0x1815d6DA04DE7910A5438168E1642e0f4eA25D28` |
| Oldest block | `26167726` |
| Newest block | `26167826` |
| Newest hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Parent links | `100` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance: [M4-BASE-ANCHOR-HEADER-LOG-LINK-ACCEPTANCE.md](M4-BASE-ANCHOR-HEADER-LOG-LINK-ACCEPTANCE.md).
