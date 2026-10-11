# Base L1 Origin Ancestry

Status: **accepted. The proven Ethereum header is an ancestor of the L1
origin currently committed by Base. Beacon finality is not claimed.
Custody remains closed.**

`AacBaseL1OriginAncestry` walks a parent-hash chain. The newest header
must equal `hash()` and `number()` on the Base L1Block predeploy
`0x4200000000000000000000000000000000000015`. The chain is capped at 64
headers. `headerFinal` stays false.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x4b73C39F2db3F68f89A8ce711c54F00410CbeDbf` |
| Deployment | `0x6db706d8d36fb874e463396be632faad1d21fed77e276ca323cf619b505b534f` |
| Oldest Ethereum block | `26167726` |
| Oldest header | `0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa` |
| Accepted origin block | `26167779` |
| Accepted origin hash | `0x57ba49119d800fdf4768fd6d2ec0f8687920048cd627999615e862548187fcc1` |
| Parent links | `53` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance replayed 54 consecutive Ethereum headers, from the header
already bound by `AacEthereumHeaderAnchor` through the L1 origin Base
reported at call time. Each header's parent hash matched the previous
header hash, and the tip matched L1Block.

This shows that Base currently treats the proven header as an ancestor of
its L1 origin. It does not show that Ethereum beacon finality includes
that header. The paused canary was not changed and has no role on
Treasury or GB.
