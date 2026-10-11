# Base Anchor Log Proof Acceptance

Status: **PASS. The USDC Transfer log is inside the included receipt.
`headerFinal` stays false. Custody remains closed.**

Collected at `2026-10-11T11:04:08Z` by rebuilding the receipt trie for Base
block `52239960` and replaying the inclusion proof through the deployed
contract.

| Check | Result |
|---|---|
| Contract | `0x1815d6DA04DE7910A5438168E1642e0f4eA25D28` |
| Receipt inclusion | `0x9D246a233A4197ae63ab8852b625B3DCE466b727` |
| Base block | `52239960` |
| Receipt index | `9` |
| Log index | `13` |
| Transaction | `0x9c82a2144101b7cbf81827921fc45189cbe16417864423185813a3b6d54140f2` |
| Emitter | Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| From | `0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59` |
| To | `0xb093da272A66D47b7445cA389CEbdc6d3Ac7753D` |
| Amount | `236185820404` base units |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| Receipts root | `0xd173446a38a5f51df48b36ee47bc926691d797529c4ef98036756207efccfaa8` |
| `headerFinal` | false |
| Runtime size | 3112 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result:
`deployments/base-AacAnchorLogProof-acceptance.json`.
