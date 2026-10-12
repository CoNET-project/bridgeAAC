# Production Custody Gate Beacon Quote Acceptance

Status: **PASS as a closed upgrade. Settlement reverts. `headerFinal` stays
false. Custody remains closed.**

Collected at `2026-10-12T02:50:29Z` through the stable proxy after the
implementation upgrade.

| Check | Result |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation slot | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Runtime | 2961 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Beacon link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| `headerFinal()` | false |
| `custodyOpen()` | false |
| `settle()` | reverts `CustodyClosed` (`0x61839255`) |
| Implementation `initialize` | reverts |
| `quoteBeacon` links | `100` |
| `quoteBeacon` output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `quoteBeacon` beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `quoteBeacon` amount | `236185820404` base units |
| `quoteBeacon` `headerFinal` | false |
| Previous `quote` amount | `236185820404` base units |
| Previous `quote` `headerFinal` | false |
| Sourcify | implementation `match` |

The proxy address did not change. The quote reads the ordinary USDC transfer
and the execution-state beacon root already accepted for header
`26167826`. It does not prove beacon finality and does not settle.

Machine-readable result: `deployments/base-AacProductionCustodyGateBeacon.json`.
