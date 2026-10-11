# Ethereum Header Parent Chain

Status: **accepted. Block 26167826 extends the registry-proof header at
block 26167726 by 100 parent links. Beacon finality is not claimed. Custody
remains closed.**

`AacEthereumHeaderChain` checks that each header's parent hash is the
previous header hash and that the block numbers increase by one. The chain
is capped at 128 headers. `headerFinal` stays false.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D` |
| Deployment | `0x2fb34087b92964f5bf46c5225be3aca5664e3a39735318ae277b58e210427ad3` |
| Oldest block | `26167726` |
| Oldest hash | `0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa` |
| Newest block | `26167826` |
| Newest hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Parent links | `100` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

The oldest header is the one that contains the registry anchor-game storage
proof. The newest header is the one whose state contains the anchor-game
code used for the Base output root. This parent chain connects those two
proofs. It does not prove that Ethereum beacon finality includes either
header.

Acceptance, including the later replay:
[M4-ETHEREUM-HEADER-CHAIN-ACCEPTANCE.md](M4-ETHEREUM-HEADER-CHAIN-ACCEPTANCE.md).
