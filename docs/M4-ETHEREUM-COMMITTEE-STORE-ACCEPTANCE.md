# Ethereum Committee Store Acceptance

Status: **PASS through the period-630 committee. The bridge message is not
covered. `headerFinal` stays false. Custody remains closed.**

Collected at `2026-10-12T10:30:11.813Z`.

| Check | Result |
|---|---|
| Proxy | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` |
| Implementation | `0x7c1345bEEFB2e4b081B5053B15536e50728aAD2c` |
| Runtime | 8743 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Periods | `629` to `630` |
| Participants | `510` |
| `messageCovered` | false |
| `headerFinal` | false |
| Changed next committee | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify implementation | `match` |
| Sourcify proxy | `match` |
| Production gate implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

Machine-readable result: `deployments/base-AacEthereumCommitteeStore.json`.
