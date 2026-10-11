# Base Anchor Log Proof

Status: **accepted. One USDC Transfer log is inside a receipt of the anchored
Base block. Beacon finality is not claimed. Custody remains closed.**

`AacBaseAnchorLogProof` calls the accepted receipt-inclusion proof, then reads
log `13` from that type-2 receipt. The log emitter is Base USDC and the first
topic is `Transfer`. This is an ordinary token transfer in block `52239960`.
It is not an AAC custody event.

`headerFinal` stays false. The paused canary was not changed.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x1815d6DA04DE7910A5438168E1642e0f4eA25D28` |
| Deployment | `0x69e8a967690dd65790ba64514a36b748543563afc5e86051e888d7fa210f0211` |
| Receipt inclusion | `0x9D246a233A4197ae63ab8852b625B3DCE466b727` |
| Base block | `52239960` |
| Receipt index | `9` |
| Log index | `13` |
| Transaction | `0x9c82a2144101b7cbf81827921fc45189cbe16417864423185813a3b6d54140f2` |
| From | `0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59` |
| To | `0xb093da272A66D47b7445cA389CEbdc6d3Ac7753D` |
| Amount | `236185820404` base units (`236,185.820404` USDC) |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance, including the later replay:
[M4-BASE-ANCHOR-LOG-PROOF-ACCEPTANCE.md](M4-BASE-ANCHOR-LOG-PROOF-ACCEPTANCE.md).
