# Base Anchor Receipt Root Acceptance

Status: **PASS. The receipts root matches Base block 52239960 and is bound
to the pinned output root. `headerFinal` stays false. Custody remains
closed.**

Collected at `2026-10-11T09:02:34Z` by replaying the Ethereum game-code proof,
the Base header, and the message-passer account proof through the deployed
contract.

| Check | Result |
|---|---|
| Contract | `0x1b455F3C47EaAA675E2288dA7d74d542B74aF60A` |
| Output-root proof | `0x57A498086d00A7Da80c8304F6189712b583c34C4` |
| Base block | `52239960` |
| Base block hash | `0x4c766d1b4a530a35b14fb4847f8e910a6cbabec6c326f5953abd1617d610b278` |
| State root | `0x8d50f47c6cf7780a1fa98f3577f05e9dc61576550a79fd26169a381805372877` |
| Receipts root | `0xd173446a38a5f51df48b36ee47bc926691d797529c4ef98036756207efccfaa8` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `headerFinal` | false |
| Runtime size | 2227 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Sourcify | creation `match`, runtime `match` |

Machine-readable result:
`deployments/base-AacAnchorReceiptRoot-acceptance.json`.
