# Production Custody Gate Bridge Quote

Status: **the stable proxy can quote the 0.01 USDC bridge proof. Custody
remains closed. `headerFinal` stays false. `settle` still reverts.**

| Item | Value |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation | `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` |
| Implementation deployment | `0xc0f9446a0ad22e33e0aef89fb22089087dbefd97d64c3f978b8a1ff0d2e695da` |
| Upgrade | `0x2c647aceb13566dbb055418dcfb77dab8531902dc45b66458f8e8dd4c99a1131` |
| Previous implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Bridge extension | `0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |

`quoteBridge` on the proxy reads the bridge checkpoint extension. It returns
the Base block hash, the lock operation id, the stored beacon root, the
observed checkpoint root, and `580` parent links. `headerFinal` is false.

`settle` and `settleBridge` both revert `CustodyClosed` (`0x61839255`).
Calling `initialize` on the implementation reverts. The previous `quote` and
`quoteBeacon` functions remain. No Treasury, GB, or Peer role was granted.

This removes the gap where the stable address could only quote the old
ordinary USDC transfer. It does not finish the settling deployment. The five
custody deployments remain.

Acceptance: [M4-PRODUCTION-CUSTODY-GATE-BRIDGE-ACCEPTANCE.md](M4-PRODUCTION-CUSTODY-GATE-BRIDGE-ACCEPTANCE.md).
