# Anchor Game Code Proof

Status: **accepted. The pinned game's runtime code is inside an Ethereum
header, and that code carries the output root and L2 sequence. Beacon
finality is not claimed. Custody remains closed.**

`AacAnchorGameCodeProof` checks three things:

1. `keccak256(headerRlp)` is the Ethereum header hash, and item 3 of that
   header is its state root.
2. The account proof for game `0x0896E5a1469847D56089e1f073f3a100Bc041c44`
   opens at that state root, and the account's code hash equals
   `keccak256(code)`.
3. The code has the clone marker `803e606057fd5bf3` at byte 90. Byte 118 is
   the output root. Byte 182 is the L2 sequence number.

`headerFinal` stays false. The paused canary was not changed.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x09849ead789E902fA2F497dB08Ff2B6f0a19b716` |
| Deployment | `0xbde89564daa796b1ebb3715a259f7b55de7379cea0ab0029dcdb9e9938abe766` |
| Game | `0x0896E5a1469847D56089e1f073f3a100Bc041c44` |
| Code first read | Ethereum block `26167726` |
| Code proven | Ethereum block `26167826` |
| Header hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Code hash | `0x1e01d4f7d3ab0f3de2ccb41e9e954da615ee826af109fb35fef2a4a4cf7affbd` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| L2 sequence | `52239960` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

The code hash at block `26167726`, where this game was the registry anchor,
is the same hash proven inside block `26167826`. This binds the output root
to that game's code. It does not prove that Ethereum beacon finality includes
either header.
