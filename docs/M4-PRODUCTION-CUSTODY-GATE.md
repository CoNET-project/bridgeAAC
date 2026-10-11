# Production Custody Gate

Status: **deployed on Base and accepted as closed. Custody is not open.
Beacon finality is not claimed.**

The stable production address is an ERC-1967 proxy. The current
implementation can quote the accepted header-and-log proof and cannot
settle. `headerFinal()` and `custodyOpen()` both return false. `settle()`
reverts `CustodyClosed`.

This proxy is not the paused canary. No Treasury, GB, or Peer role was
granted. The deployer is the upgrade authority and can replace the
implementation later. This implementation itself has no settle path.

| Item | Value |
|---|---|
| Chain | Base `8453` |
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Proxy deployment | `0xe0692d9486cca7afd219c42b2304e1e5740efc8c5f5a4b278bd4fd56a289702b` |
| Implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Implementation deployment | `0xf7b3dabef271b54c26e93312eeedf7e658e920b1391a013ced7018009d21ad64` |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| `headerFinal` | false |
| `custodyOpen` | false |
| Sourcify | proxy and implementation creation `match`, runtime `match` |

Acceptance, including the later replay:
[M4-PRODUCTION-CUSTODY-GATE-ACCEPTANCE.md](M4-PRODUCTION-CUSTODY-GATE-ACCEPTANCE.md).
