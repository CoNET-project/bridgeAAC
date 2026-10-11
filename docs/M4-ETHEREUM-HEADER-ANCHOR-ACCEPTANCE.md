# Ethereum Header-Bound Anchor Acceptance

Status: **PASS. The header hash matches. The header is not finalized.
Custody remains closed.**

Collected by replaying the original Ethereum header and storage proof
through the deployed Base contract.

| Check | Result |
|---|---|
| Contract | `0x7dec59217677Ed0C485642264dfe49E777bF16a6` |
| Storage proof | `0x8248Fe0Ee2f9B70AD18675efc303D08FD306c3A9` |
| Ethereum block | `26167726` |
| Header hash | `0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa` |
| State root | `0x50a32b1ae6a5f3f70de2b4e303751a63d2b9b057c79d7e64aebfcfb2672e26e1` |
| Anchor game | `0x0896E5a1469847D56089e1f073f3a100Bc041c44` |
| `headerFinal` | false |
| Runtime size | 1883 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result:
`deployments/base-AacEthereumHeaderAnchor-acceptance.json`.

The same header is now checked as an ancestor of Base's current L1 origin
in [M4-BASE-L1-ORIGIN-ANCESTRY.md](M4-BASE-L1-ORIGIN-ANCESTRY.md). That
ancestry is still not Ethereum beacon finality.
