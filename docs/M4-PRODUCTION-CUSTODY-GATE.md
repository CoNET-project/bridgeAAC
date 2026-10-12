# Production Custody Gate

Status: **deployed on Base and accepted as closed. Custody is not open.
Beacon finality is not claimed.**

The stable production address is an ERC-1967 proxy. The first implementation
quoted only the header-and-log proof. The proxy now uses
`AacProductionCustodyGateBeacon` at
`0x7e90446e56A1D736842d252c8bc238f43861e91D`, which also quotes the
beacon-root link. `settle()` still reverts `CustodyClosed`. `headerFinal()`
and `custodyOpen()` both return false.

This proxy is not the paused canary. No Treasury, GB, or Peer role was
granted. The deployer remains the upgrade authority. Neither implementation
has a settle path.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Current implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Previous implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Beacon link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| `headerFinal` | false |
| `custodyOpen` | false |

Current implementation: [M4-PRODUCTION-CUSTODY-GATE-BEACON.md](M4-PRODUCTION-CUSTODY-GATE-BEACON.md).

First implementation acceptance, including the later replay:
[M4-PRODUCTION-CUSTODY-GATE-ACCEPTANCE.md](M4-PRODUCTION-CUSTODY-GATE-ACCEPTANCE.md).
