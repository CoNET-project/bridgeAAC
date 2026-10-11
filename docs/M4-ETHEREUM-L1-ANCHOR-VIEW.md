# Ethereum L1 Base Anchor View

Status: **accepted; observation only; custody closed**. See
[the acceptance report](M4-ETHEREUM-L1-ANCHOR-ACCEPTANCE.md).

`AacEthereumL1AnchorView` reads the pinned Optimism portal and anchor registry
on Ethereum. It checks that the portal still points at the expected factory
and registry, then returns the current anchor game, output root, L2 sequence,
claim validity, and game root. `covered(baseBlock)` is true only when that
anchor is internally consistent and the supplied Base block is not ahead of it.

This is the same observation already used by the read-only Rust
`base-l1-output` command. It does not replay a fault proof, does not prove a
Base execution header, and cannot be called by the paused canary: the canary's
finality address is immutable and remains the fail-closed placeholder.

| Item | Value |
|---|---|
| Chain | Ethereum `1` |
| Address | `0x9b027ac2d98dc8d2C9d5Dd08F98002538177Aa72` |
| Deployment | `0xa1d8e106f4997a93d3066e8829429165cca6da9050622c92b3a391263ecfbcce` |
| Live check | anchor sequence `52239360`, claim valid, contract output matches the registry |
| `covered(anchor)` | true |
| `covered(anchor + 1)` | false |
| Verification | Sourcify `match` for creation and runtime |

The paused canary stays closed. A future custody consumer still needs a
trustless way to carry this L1 observation onto Base, plus the CoNET
sync-committee verifier, before any role can be considered.
