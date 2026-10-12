# Ethereum Beacon Header

Status: **deployed on Base. The beacon block header hashes to the accepted
beacon root. This is not beacon finality, and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0xa9A07770335138A1c37a25bD1F0bb2A5BeC838dE` |
| Deployment | `0xc453073e256e47b01718aa49b9f43f369ac0caa12fbc6c31da6ef2c515f1839a` |
| Beacon slot | `15406750` |
| Proposer index | `665390` |
| Parent beacon root | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| State root | `0xd76ecb4a62849bdea4c583647c331719a4f03cd2249255336858d19504f68cfe` |
| Body root | `0xd1afa9902289b021cfd866901c6711c524ece0d6816697305279a1b89fd94581` |
| Beacon block root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` hashes the five beacon-block fields with SHA-256. The parent root is
the beacon root committed by execution header `26167826`. The resulting block
root is the beacon root committed by execution header `26167827`, and the
payload proof shows that block contains execution hash `0xbeeaebea…d725`.
A wrong proposer reverts `InvalidHeader`.

The finalized checkpoint is still a separate proof. The production gate was
not upgraded.

Acceptance: [M4-ETHEREUM-BEACON-HEADER-ACCEPTANCE.md](M4-ETHEREUM-BEACON-HEADER-ACCEPTANCE.md).
