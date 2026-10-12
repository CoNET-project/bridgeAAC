# Committee Handoff Through Period 294 Acceptance

Status: **PASS as the third linked handoff. The bridge message is not
covered. `headerFinal` stays false. Custody remains closed.**

Collected at `2026-10-12T09:00:35Z`.

| Check | Result |
|---|---|
| Contract | `0x61560D38FB6e27214c2530f212cA72d592da8628` |
| Runtime | 5464 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Periods | `293` to `294` |
| Participants | `511` |
| Aggregate | verified |
| `messageCovered` | false |
| `headerFinal` | false |
| Changed next committee | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

Machine-readable result: `deployments/base-AacEthereumCommitteeHandoff293.json`.
