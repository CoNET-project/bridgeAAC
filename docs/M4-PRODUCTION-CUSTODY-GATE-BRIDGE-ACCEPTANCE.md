# Production Custody Gate Bridge Quote Acceptance

Status: **PASS as a closed quote upgrade. `headerFinal` stays false. Custody
remains closed.**

Collected at `2026-10-12T08:20:54Z`.

| Check | Result |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Runtime | 4385 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Base block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| Bridge beacon root | `0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5` |
| Checkpoint root | `0x480505bce46a8902cd88c95f6a2a3d9998c8cbdffd25f9c4aa7ef81d3a5e6453` |
| Links | `580` |
| `headerFinal` / `custodyOpen` | false / false |
| `settle` | reverts `CustodyClosed` (`0x61839255`) |
| `settleBridge` | reverts `CustodyClosed` (`0x61839255`) |
| Implementation `initialize` | reverts |
| Sourcify | `match` |

Machine-readable result: `deployments/base-AacProductionCustodyGateBridge.json`.
