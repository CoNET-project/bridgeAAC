# Ethereum Beacon Payload Proof

Status: **deployed on Base. The accepted execution hash is inside one beacon
block. This is not beacon finality, and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` |
| Deployment | `0xd1ba451ce6293f5a1367b8a6df2420f7a3c35785963001b552db08c9bbc63e30` |
| Execution hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Beacon block root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Beacon slot | `15406750` |
| Parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| Generalized index | `6444` |
| Branch length | `12` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` checks a 12-node SHA-256 branch from the execution block hash to the
Fulu beacon block root. That root is the beacon root already proven inside
execution header `26167827`. A changed branch node reverts `InvalidProof`.

The beacon API reports this slot as finalized. That report is not the proof.
`headerFinal` stays false until a finalized-checkpoint proof is accepted.
The production gate was not upgraded.

Acceptance: [M4-ETHEREUM-BEACON-PAYLOAD-PROOF-ACCEPTANCE.md](M4-ETHEREUM-BEACON-PAYLOAD-PROOF-ACCEPTANCE.md).
