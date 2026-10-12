# Altair Sync Committee Handoff Acceptance

Status: **PASS as the first independent committee handoff. `headerFinal`
stays false. Custody remains closed.**

Collected at `2026-10-12T08:47:05Z`.

| Check | Result |
|---|---|
| Contract | `0x80F29F94c75eE07DFA8Eca33DFbEA2A3edA34DC2` |
| Runtime | 5821 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Periods | `290` to `291` |
| Participants | `504` |
| Aggregate | verified |
| `headerFinal` | false |
| Changed next committee | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The local pairing used the Ethereum sync-committee signature domain and
matched before deployment. The Altair header root and both committee Merkle
branches were checked against the beacon state roots.

Machine-readable result: `deployments/base-AacEthereumAltairCommitteeHandoff.json`.
