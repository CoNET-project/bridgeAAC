# Base Output Root Proof Acceptance

Status: **PASS. The game output root matches Base block 52239960.
`headerFinal` stays false. Custody remains closed.**

Collected by replaying the accepted Ethereum game-code proof together with
the Base header and the L2-to-L1 message passer account proof.

| Check | Result |
|---|---|
| Contract | `0x57A498086d00A7Da80c8304F6189712b583c34C4` |
| Game-code proof | `0x09849ead789E902fA2F497dB08Ff2B6f0a19b716` |
| Base block | `52239960` |
| Base block hash | `0x4c766d1b4a530a35b14fb4847f8e910a6cbabec6c326f5953abd1617d610b278` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| L2 sequence | `52239960` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result: `deployments/base-AacOutputRootProof.json`.

A later replay of the same proofs returned the same output root, Base block
hash, sequence `52239960`, and `headerFinal = false`. Sourcify remained
`match`.
