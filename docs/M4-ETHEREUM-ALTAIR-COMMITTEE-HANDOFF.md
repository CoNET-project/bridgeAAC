# Altair Sync Committee Handoff

Status: **deployed on Base. The Altair period-290 committee signed the first
distinct next committee. `headerFinal` stays false. Slot `15406750` is not
reached. Custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x80F29F94c75eE07DFA8Eca33DFbEA2A3edA34DC2` |
| Deployment | `0xa5a1bf77f9ff42f0a75249b5f7de45bbe5e0fd52a2f8f1523956647d6d3d10ec` |
| Altair block | slot `2375680` |
| Altair root | `0x4df61a042151aa94fe5412063bdc7357e7a0266348745fc741ea669487ce6553` |
| From period | `290` |
| To period | `291` |
| Attested slot | `2389361` |
| Participants | `504` of `512` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

Period 290 started with the same current and next committees. The attested
header is in period 291, so its next committee is the first different one.
The signature uses the committee stored in the Altair fork block. It does not
use the committee published inside a later finalized block.

A changed next committee reverts `InvalidProof`. This is one handoff. The
periods from `291` through `1880` are still required before slot `15406750`
can be treated as finalized.

Acceptance: [M4-ETHEREUM-ALTAIR-COMMITTEE-HANDOFF-ACCEPTANCE.md](M4-ETHEREUM-ALTAIR-COMMITTEE-HANDOFF-ACCEPTANCE.md).
