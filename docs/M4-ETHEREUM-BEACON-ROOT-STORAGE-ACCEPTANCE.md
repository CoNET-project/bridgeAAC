# Ethereum Beacon Root Storage Acceptance

Status: **PASS as an execution-state record. `headerFinal` stays false.
Custody remains closed.**

Collected at `2026-10-12T00:06:19Z`.

| Check | Result |
|---|---|
| Contract | `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` |
| Runtime | 5670 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Header hash | `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| State root | `0xa1fd16d6ff44d1225f45691aa863adb599f45e01e77773c891eebb0b99ede358` |
| Timestamp | `1791705023` |
| `parentBeaconBlockRoot` | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `headerFinal` | false |
| Sourcify | `match` |
| Production gate implementation | `0xbe066f3CDD4D4c32F10c6fC31DFBd52b6f9a5bbD` |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |
| Rejected deployment | `0x08946Cb2F8131C639958CA6c553BBf626e4749ee` |

The accepted call proves the EIP-4788 ring buffer in block `26167826` holds
the beacon root committed by that execution header. It does not prove beacon
finality, and it does not open custody.

Machine-readable result: `deployments/base-AacEthereumBeaconRootStorage.json`.
