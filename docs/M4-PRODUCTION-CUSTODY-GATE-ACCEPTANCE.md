# Production Custody Gate Acceptance

Status: **PASS as a closed gate. Settlement reverts. `headerFinal` stays
false. Custody remains closed.**

Collected at `2026-10-11T20:43:27Z` by replaying the proxy, the implementation
lock, and the full proof quote.

| Check | Result |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation slot | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| `headerFinal()` | false |
| `custodyOpen()` | false |
| `settle()` | reverts `CustodyClosed` (`0x61839255`) |
| Implementation `initialize` | reverts |
| Proxy runtime | 86 bytes |
| Implementation runtime | 1904 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Quote links | `100` |
| Quote output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| Quote amount | `236185820404` base units |
| Quote `headerFinal` | false |
| Sourcify | proxy and implementation `match` |

The quote reads the ordinary USDC transfer already accepted in block
`52239960`. It does not settle that transfer and does not open custody.

Machine-readable result:
`deployments/base-AacProductionCustodyGate-acceptance.json`.
