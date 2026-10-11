# Ethereum L1 Anchor View Acceptance

Status: **PASS. Observation only. Custody remains closed.**

Collected: 2026-10-11, against Ethereum chain id `1` through
`https://eth-rpc.conet.network`.

## Contract

| Item | Value |
|---|---|
| Contract | `AacEthereumL1AnchorView` |
| Address | `0x9b027ac2d98dc8d2C9d5Dd08F98002538177Aa72` |
| Deployment | `0xa1d8e106f4997a93d3066e8829429165cca6da9050622c92b3a391263ecfbcce` |
| Runtime code | 1087 bytes |
| Metadata tail | `64736f6c6343000823000a` (`solc 0.8.35`) |
| Sourcify | `match` / creation `match` / runtime `match` |

## Checks

| Check | Result |
|---|---|
| Chain id | `1` |
| Portal | `0x49048044D57e1C92A77f79988d21Fa8fAF74E97e` |
| Portal factory matches the pinned factory | yes |
| Portal registry matches the pinned registry | yes |
| `readAnchor()` matches direct registry and game calls | yes |
| Anchor game | `0xE28b612B506ABE85AA8269AF61f007472EA0d934` |
| Output root | `0xfc02aff63ed130070679bc9b47134d37f9b80539739808fb99380abcab5cbd9b` |
| L2 sequence | `52239360` |
| Game sequence | `52239360` |
| Game root equals output root | yes |
| Claim valid | yes |
| `covered(52239360)` | true |
| `covered(52239361)` | false |

The contract does not mint, release, or settle. The paused Base and CoNET
canaries were not changed. Their finality placeholders still revert, and this
Ethereum observer is not wired into either canary.

Machine-readable result:
`deployments/ethereum-AacL1AnchorView-acceptance.json`.
