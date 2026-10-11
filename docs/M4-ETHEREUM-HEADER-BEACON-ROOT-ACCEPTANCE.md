# Ethereum Header Beacon Root Acceptance

Status: **PASS as a field read. `headerFinal` stays false. Custody remains
closed.**

Replayed at `2026-10-11T22:15:41Z` by fetching Ethereum block `26167826`,
rebuilding its header RLP, and calling `verify` again.

| Check | Result |
|---|---|
| Contract | `0xc9F20370b13266F3DfD71e257df8D2F84B8a3e0b` |
| Runtime | 1509 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| On-chain `HEADER_HASH` | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| On-chain `HEADER_NUMBER` | `26167826` |
| Quoted header hash | same as `HEADER_HASH` |
| Quoted `parentBeaconBlockRoot` | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| Execution header field | same beacon root |
| Quoted `headerFinal` | false |
| Altered header | reverts `InvalidHeader` (`0xbabb01dd`) |
| Sourcify | `match` |
| Production gate implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The returned root is the value committed inside the already accepted
execution header. It does not prove that the beacon finalized that header.
The production custody gate was not upgraded, no role was granted, and
settlement still reverts.

Machine-readable result:
`deployments/base-AacEthereumHeaderBeaconRoot-acceptance.json`.
