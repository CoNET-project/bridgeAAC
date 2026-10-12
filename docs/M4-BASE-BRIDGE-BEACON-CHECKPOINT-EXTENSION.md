# Base Bridge Beacon Checkpoint Extension

Status: **deployed on Base. A later observed beacon checkpoint walks back to
the beacon root stored in the 0.01 USDC bridge block. That later checkpoint
has no sync-committee proof here, so `headerFinal` stays false and custody
remains closed.**

| Item | Value |
|---|---|
| Contract | `0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b` |
| Deployment | `0x64e88feb41b3fa1494b6b9ed4a27a05293ec34c8a6745b2a8740a1a195ad8539` |
| Base block | `52497860` |
| Bridge beacon root | `0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5` |
| Bridge beacon slot | `15413404` |
| Observed checkpoint | slot `15413984` |
| Checkpoint root | `0x480505bce46a8902cd88c95f6a2a3d9998c8cbdffd25f9c4aa7ef81d3a5e6453` |
| Parent links | `580` |
| Prior checkpoint | slot `15413120`, `284` links |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

One call checks the already deployed bridge parent link and then hashes 580
beacon headers. The newest header is slot `15413984`. The oldest header is
slot `15413405`, whose parent is the beacon root stored in Base block
`52497860`.

The later root is a pinned header observation. This contract does not check
its sync aggregate. A parent walk does not finish gate 1 or gate 2. The
production gate was not upgraded.

Acceptance: [M4-BASE-BRIDGE-BEACON-CHECKPOINT-EXTENSION-ACCEPTANCE.md](M4-BASE-BRIDGE-BEACON-CHECKPOINT-EXTENSION-ACCEPTANCE.md).
