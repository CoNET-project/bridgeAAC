# Ethereum Beacon Header Successor

Status: **deployed on Base. Beacon slot 15406751 extends slot 15406750.
This is one slot of ancestry. It is not beacon finality, and custody remains
closed.**

| Item | Value |
|---|---|
| Contract | `0x532080e752ddebd0DD9b2c3611Ee9307513BfBdc` |
| Deployment | `0x86579e471ff17ef8af706083777925fb1843291498f01608638863ba0719e93c` |
| Parent slot | `15406750` |
| Parent beacon root | `0x126db0df05bfed9cf62088da5fb708c9ceaf8096d0cd2231e0fd9d97b32c11f3` |
| Child slot | `15406751` |
| Proposer index | `2139912` |
| State root | `0xd99fef489b31389ab9b54cbd0d05329b05d803b89c98c726e9eeb952c0f0668a` |
| Body root | `0x3cfb34462c9b0976471c1eb8ebde156efff824a88400a61b9b40bd3e239d84b0` |
| Child beacon root | `0x3f0e150dbeb2f069e1671d13178de3a1b747c4c462101c316ea480b40c9b06bf` |
| Execution block | `26167827` |
| Execution hash | `0xcd01892c4bce87f301fde730d1792e755dac14b923038171afb3fc4f8b02e8ff` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` hashes the child beacon header with SHA-256. The parent field is the
beacon root already proven to contain execution hash `0xbeeaebea…d725`. The
same call walks a 12-node SSZ branch from execution hash `0xcd01892c…e8ff` to
the child beacon root. That execution hash is block `26167827`, the execution
successor already accepted on Base.

A wrong proposer reverts `InvalidHeader`. A tampered branch reverts
`InvalidProof`. A beacon API `finalized` flag is not an input to this
contract. The finalized checkpoint is still a separate proof. The production
gate was not upgraded.

Acceptance: [M4-ETHEREUM-BEACON-HEADER-SUCCESSOR-ACCEPTANCE.md](M4-ETHEREUM-BEACON-HEADER-SUCCESSOR-ACCEPTANCE.md).
