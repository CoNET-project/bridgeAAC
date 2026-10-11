# Base Anchor Receipt Inclusion

Status: **accepted. One real receipt from Base block 52239960 is inside the
receipts root bound to the pinned anchor output root. Beacon finality is not
claimed. Custody remains closed.**

`AacBaseAnchorReceiptInclusion` calls the accepted receipt-root proof, then
checks that receipt with the already deployed receipt trie verifier. The
proved receipt is transaction index `1` in that block. It is an ordinary
successful transaction with no logs. It is not an AAC custody event.

`headerFinal` stays false. The paused canary was not changed.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x9D246a233A4197ae63ab8852b625B3DCE466b727` |
| Deployment | `0xdc3a1a6068ee5a5cef932de55a578ac1dc15aa2709d6235f42be609bd3058347` |
| Receipt-root proof | `0x1b455F3C47EaAA675E2288dA7d74d542B74aF60A` |
| Receipt trie verifier | `0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10` |
| Base block | `52239960` |
| Receipt index | `1` |
| Transaction | `0x1b05ca7e26ca07789fa6064309ade835872fe8ee36c5da6882ba4465911a7455` |
| Receipt hash | `0x3cdd0b1cbd772d18f6b7b9a3a85f6863d796f985b2f26483bfb651707ffe609a` |
| Receipts root | `0xd173446a38a5f51df48b36ee47bc926691d797529c4ef98036756207efccfaa8` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance: [M4-BASE-ANCHOR-RECEIPT-INCLUSION-ACCEPTANCE.md](M4-BASE-ANCHOR-RECEIPT-INCLUSION-ACCEPTANCE.md).
