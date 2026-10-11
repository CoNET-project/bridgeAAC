# Base Anchor Receipt Inclusion Acceptance

Status: **PASS. Receipt index 1 of Base block 52239960 is included in the
bound receipts root. `headerFinal` stays false. Custody remains closed.**

The receipt trie was rebuilt from all 158 receipts in the block. Its root
matches the previously accepted receipts root. The deployed receipt trie
verifier accepted the index `1` proof before this contract was called.

| Check | Result |
|---|---|
| Contract | `0x9D246a233A4197ae63ab8852b625B3DCE466b727` |
| Base block | `52239960` |
| Receipt index | `1` |
| Transaction | `0x1b05ca7e26ca07789fa6064309ade835872fe8ee36c5da6882ba4465911a7455` |
| Receipt type | `2` |
| Status | success |
| Logs | `0` |
| Receipt hash | `0x3cdd0b1cbd772d18f6b7b9a3a85f6863d796f985b2f26483bfb651707ffe609a` |
| Receipts root | `0xd173446a38a5f51df48b36ee47bc926691d797529c4ef98036756207efccfaa8` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result: `deployments/base-AacAnchorReceiptInclusion.json`.
