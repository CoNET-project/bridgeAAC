# Production Custody Gate Beacon Quote

Status: **the stable proxy now quotes the beacon-root link. Custody remains
closed. `headerFinal` stays false.**

| Item | Value |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Implementation deployment | `0x4bc94a3df9d2b108e23e0a9e5f442f7a6a6b657a0dfcaf694d9a704eb60dc936` |
| Upgrade | `0x417d904f7f12d052d6b4bcac10c486a77e6477f990877d09fd47fecf6a4d51f2` |
| Previous implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Beacon link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |

`quoteBeacon` on the proxy reads the accepted beacon-root link. The returned
header hash, output root, beacon root, USDC sender, and amount match the
earlier acceptance. `headerFinal` is false. The previous `quote` path still
reads the stored log-proof link and also returns `headerFinal` false.

`settle` reverts `CustodyClosed` (`0x61839255`). Direct `initialize` on the
implementation reverts. No Treasury, GB, or Peer role was granted. The
deployer can still replace the implementation. This implementation has no
settle path.

Acceptance, including the later replay:
[M4-PRODUCTION-CUSTODY-GATE-BEACON-ACCEPTANCE.md](M4-PRODUCTION-CUSTODY-GATE-BEACON-ACCEPTANCE.md).
