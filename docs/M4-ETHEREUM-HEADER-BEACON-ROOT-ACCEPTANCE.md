# Ethereum Header Beacon Root Acceptance

Status: **PASS as a field read. `headerFinal` stays false. Custody remains
closed.**

Collected at `2026-10-11T20:46:54Z`.

| Check | Result |
|---|---|
| Contract | `0xc9F20370b13266F3DfD71e257df8D2F84B8a3e0b` |
| Runtime | 1509 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Header hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| Header number | `26167826` |
| `parentBeaconBlockRoot` | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `headerFinal` | false |
| Sourcify | `match` |

The returned root is the value committed inside the already accepted
execution header. It does not prove that the beacon finalized that header.
The production custody gate was not upgraded, no role was granted, and
settlement still reverts.

Machine-readable result: `deployments/base-AacEthereumHeaderBeaconRoot.json`.
