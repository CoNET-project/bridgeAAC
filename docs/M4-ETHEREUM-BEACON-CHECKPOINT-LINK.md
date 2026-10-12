# Ethereum Beacon Checkpoint Link

Status: **deployed on Base. One call checks the parent chain and the sync
aggregate for finalized slot 15413120. `headerFinal` stays false, and custody
remains closed.**

| Item | Value |
|---|---|
| Contract | `0xeA57144daa0d02A90794bC0FbE1dA92050f4f59E` |
| Deployment | `0xfc2dd86d358a0a816903d4a2ba3ea2634bc817c3b8ca6f1b6b905965c95cf293` |
| Ancestry | `0x4E28D764151AD328d7c50a0fFB380935d07a26dF` |
| Sync aggregate | `0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Anchor root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| Links | `6348` |
| Participants | `505` |
| `aggregateVerified` | true |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` requires both child proofs to name the same finalized root, with
`6348` ancestry links and `505` signers. A changed committee key reverts
`InvalidProof`. A shortened header list reverts `InvalidHeader`. The committee
is still that block's own bootstrap committee, so `headerFinal` stays false.
The production gate was not upgraded.

Acceptance: [M4-ETHEREUM-BEACON-CHECKPOINT-LINK-ACCEPTANCE.md](M4-ETHEREUM-BEACON-CHECKPOINT-LINK-ACCEPTANCE.md).
