# Ethereum Header Beacon Root

Status: **deployed on Base. This reads one field. It does not prove beacon
finality, and it does not open custody.**

| Item | Value |
|---|---|
| Contract | `0xc9F20370b13266F3DfD71e257df8D2F84B8a3e0b` |
| Deployment | `0x9d64b4e7b2b9d3b76a3e7bbe6380166ef8b891168a0b7be523a06728ede50e41` |
| Execution header | `26167826` / `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| `parentBeaconBlockRoot` | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

The accepted execution header already commits a beacon block root as header
field 19. This contract checks that the supplied RLP hashes to that header
and returns the field. A matching execution header is still not a beacon
finality proof. The production gate was not upgraded and its `settle` path
still reverts.

Acceptance: [M4-ETHEREUM-HEADER-BEACON-ROOT-ACCEPTANCE.md](M4-ETHEREUM-HEADER-BEACON-ROOT-ACCEPTANCE.md).
