# Committee Handoff Through Period 293 Acceptance

Status: **PASS as the second linked handoff. The bridge message is not
covered. `headerFinal` stays false. Custody remains closed.**

Collected at `2026-10-12T08:51:30Z`.

| Check | Result |
|---|---|
| Contract | `0x34EF23A8F16F008097661bd7Ced70C20C6e03B6C` |
| Runtime | 5897 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Periods | `292` to `293` |
| Participants | `509` |
| Aggregate | verified |
| `messageCovered` | false |
| `headerFinal` | false |
| Changed next committee | reverts `InvalidLink` (`0x6d0b539d`) |
| Sourcify | `match` |
| Production gate implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

Machine-readable result: `deployments/base-AacEthereumCommitteeHandoff292.json`.
