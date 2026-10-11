# Base Output Root Proof

Status: **accepted. The pinned game's output root is the Optimism output
root of Base block 52239960. Beacon finality is not claimed. Custody remains
closed.**

`AacBaseOutputRootProof` calls the accepted game-code proof, then checks the
Base execution header:

1. The Base header number equals the game's L2 sequence number.
2. The message-passer account proof opens at that header's state root.
3. `keccak256(version 0, state root, message-passer storage root, block hash)`
   equals the game's output root.

`headerFinal` stays false. The paused canary was not changed.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x57A498086d00A7Da80c8304F6189712b583c34C4` |
| Deployment | `0xa2710464b939c04f6098ff89623714cf5e300a6f77606960ddf3603ac2fb9c96` |
| Game-code proof | `0x09849ead789E902fA2F497dB08Ff2B6f0a19b716` |
| Message passer | `0x4200000000000000000000000000000000000016` |
| Base block | `52239960` |
| Base block hash | `0x4c766d1b4a530a35b14fb4847f8e910a6cbabec6c326f5953abd1617d610b278` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance: [M4-BASE-OUTPUT-ROOT-PROOF-ACCEPTANCE.md](M4-BASE-OUTPUT-ROOT-PROOF-ACCEPTANCE.md).
