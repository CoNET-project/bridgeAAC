# Base Anchor Storage Proof

Status: **accepted. The Ethereum header is not authenticated. Custody remains
closed.** See [the acceptance report](M4-BASE-ANCHOR-STORAGE-PROOF-ACCEPTANCE.md).

`AacBaseAnchorStorageProof` runs on Base. It verifies an Ethereum Merkle
proof that the pinned AnchorStateRegistry account contains `anchorGame` in
storage slot 2. The returned `headerFinal` value is always false: the caller
supplies the Ethereum state root, and this contract does not check that the
root belongs to a finalized Ethereum header.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x8248Fe0Ee2f9B70AD18675efc303D08FD306c3A9` |
| Deployment | `0x485224ab394e75fe8a2d11e94dda146357d0809bc6f47a2b1880908b852caa08` |
| Registry | `0x909f6cf47ed12f010A796527f562bFc26C7F4E72` |
| Slot | `2` |
| Ethereum block used for the proof | `26167726` |
| Proven anchor game | `0x0896E5a1469847D56089e1f073f3a100Bc041c44` |
| `headerFinal` | false |

The paused canary is unchanged and still cannot consume this proof. A later
custody step needs an Ethereum header finality check before this state root
can be trusted, and the CoNET sync-committee verifier is still separate.
