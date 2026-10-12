# Base Anchor Beacon Root Link Acceptance

Status: **PASS as a combined read. `headerFinal` stays false. Custody remains
closed.**

Collected at `2026-10-12T01:03:03Z` by rebuilding the 100-header chain, the
Base receipt proof, and the EIP-4788 storage proof, then calling `verify`.

| Check | Result |
|---|---|
| Contract | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` |
| Runtime | 1947 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Newest header | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Links | `100` |
| Output root | `0x999dc682fc4314499686d62633c7a9f26038927dd4f1e93ae2f8fda3016bc80f` |
| Beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| USDC from | `0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59` |
| USDC amount | `236185820404` base units |
| `headerFinal` | false |
| Sourcify | `match` |
| Production gate implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The call shows that the accepted log proof and the accepted beacon-root
storage proof describe the same execution header. It does not prove beacon
finality, and it does not settle the USDC transfer.

Machine-readable result: `deployments/base-AacAnchorBeaconRootLink.json`.
