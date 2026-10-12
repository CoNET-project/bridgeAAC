# Production Custody Gate Beacon Quote Acceptance

Status: **PASS as a closed upgrade. Settlement reverts. `headerFinal` stays
false. Custody remains closed.**

Replayed at `2026-10-12T02:52:27Z` through the stable proxy. The 100-header
chain, the Base receipt proof, and the EIP-4788 storage proof were rebuilt
and passed to both quote functions.

| Check | Result |
|---|---|
| Proxy | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |
| Implementation slot | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Runtime | 2961 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Owner | `0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` |
| Stored proof link | `0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b` |
| Beacon link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| On-chain newest hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| `headerFinal()` | false |
| `custodyOpen()` | false |
| `settle()` | reverts `CustodyClosed` (`0x61839255`) |
| Implementation `initialize` | reverts `AlreadyInitialized` (`0x0dc149f0`) |
| `quoteBeacon` links | `100` |
| `quoteBeacon` output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| `quoteBeacon` beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `quoteBeacon` amount | `236185820404` base units |
| `quoteBeacon` `headerFinal` | false |
| Previous `quote` links | `100` |
| Previous `quote` amount | `236185820404` base units |
| Previous `quote` `headerFinal` | false |
| Shortened header chain | reverts `InvalidLink` (`0x6d0b539d`) |
| Sourcify | implementation `match` |

The proxy address did not change. Both quotes read the ordinary USDC
transfer already accepted for header `26167826`. `quoteBeacon` also returns
the execution-state beacon root. Neither quote settles, and neither reports
beacon finality.

Machine-readable result:
`deployments/base-AacProductionCustodyGateBeacon-acceptance.json`.
