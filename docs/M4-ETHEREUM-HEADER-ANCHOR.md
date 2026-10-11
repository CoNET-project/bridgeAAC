# Ethereum Header-Bound Anchor Proof

Status: **accepted. Header hash is checked. Canonical finality is not
claimed. Custody remains closed.** Acceptance:
[M4-ETHEREUM-HEADER-ANCHOR-ACCEPTANCE.md](M4-ETHEREUM-HEADER-ANCHOR-ACCEPTANCE.md).

`AacEthereumHeaderAnchor` checks `keccak256(headerRlp)`, reads that header's
state root, and passes the root to the accepted storage-proof contract. A
matching header only proves that the anchor game is inside that header's
state. It does not prove that Ethereum finalized the header, so `headerFinal`
stays false.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x7dec59217677Ed0C485642264dfe49E777bF16a6` |
| Deployment | `0x4446f7623be1a43c818f026164fb8c5e62777b19aa64491d5b06698bda7d899e` |
| Storage proof | `0x8248Fe0Ee2f9B70AD18675efc303D08FD306c3A9` |
| Ethereum block | `26167726` |
| Header hash | `0xdd3fe0ec9dad8d8dcf13953eba383c251776b527900bf50f8b39acb1a40453aa` |
| Anchor game | `0x0896E5a1469847D56089e1f073f3a100Bc041c44` |
| `headerFinal` | false |

The paused canary was not changed and cannot call this contract.
