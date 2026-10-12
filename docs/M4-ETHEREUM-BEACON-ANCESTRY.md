# Ethereum Beacon Ancestry

Status: **deployed on Base. One finalized checkpoint's parent chain reaches
the accepted beacon block at slot 15406751. This is not a sync-committee
signature, and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x4E28D764151AD328d7c50a0fFB380935d07a26dF` |
| Deployment | `0x0d9e2d03a813deaf62cac25820f8bd2a1466e531f2ccefc9ad72ca1f8a95740b` |
| Finalized slot | `15413120` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Links | `6348` |
| Oldest header slot | `15406752` |
| Anchor slot | `15406751` |
| Anchor root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` hashes each beacon header with SHA-256. The headers are in descending
slot order. Each parent root is the next header's hash. The last parent root
is beacon block `15406751`, which already contains execution block `26167827`
and extends the beacon block that contains execution hash `0xbeeaebea…d725`.

The finalized root is pinned from a beacon header observation. The call does
not check a sync-committee aggregate. A changed proposer reverts
`InvalidHeader`. The production gate was not upgraded.

Acceptance: [M4-ETHEREUM-BEACON-ANCESTRY-ACCEPTANCE.md](M4-ETHEREUM-BEACON-ANCESTRY-ACCEPTANCE.md).
