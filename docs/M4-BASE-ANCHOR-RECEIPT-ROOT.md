# Base Anchor Receipt Root

Status: **accepted. The receipts root of Base block 52239960 is bound to the
pinned anchor output root. Beacon finality is not claimed. Custody remains
closed.**

`AacBaseAnchorReceiptRoot` calls the accepted output-root proof, then reads
the state root and receipts root from that same Base header. A later receipt
inclusion proof can use this receipts root. `headerFinal` stays false.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Address | `0x1b455F3C47EaAA675E2288dA7d74d542B74aF60A` |
| Deployment | `0xf6cb682f963e94c2fa16a57944268673837a149d3e248021c2598749d849c7c6` |
| Output-root proof | `0x57A498086d00A7Da80c8304F6189712b583c34C4` |
| Base block | `52239960` |
| Base block hash | `0x4c766d1b4a530a35b14fb4847f8e910a6cbabec6c326f5953abd1617d610b278` |
| State root | `0x8d50f47c6cf7780a1fa98f3577f05e9dc61576550a79fd26169a381805372877` |
| Receipts root | `0xd173446a38a5f51df48b36ee47bc926691d797529c4ef98036756207efccfaa8` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Sourcify | creation `match`, runtime `match` |

Acceptance: [M4-BASE-ANCHOR-RECEIPT-ROOT-ACCEPTANCE.md](M4-BASE-ANCHOR-RECEIPT-ROOT-ACCEPTANCE.md).
