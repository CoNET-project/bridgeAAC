# Base Bridge Operation Inclusion Acceptance

Status: **PASS as a receipt inclusion proof. `headerFinal` stays false.
Custody remains closed.**

Collected at `2026-10-12T06:09:00Z`.

| Check | Result |
|---|---|
| Contract | `0x80Eb248985Ef0B6a5cF6C84A83a6A872666d1621` |
| Runtime | 3632 bytes |
| Metadata tail | `solc 0.8.35` (`000823`) |
| Block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| Amount | `10000` |
| `headerFinal` | false |
| Changed proof node | reverts `InvalidProof` (`0x09bde339`) |
| Sourcify | `match` |
| Production gate implementation | `0x7e90446e56A1D736842d252c8bc238f43861e91D` |
| Production gate `headerFinal` / `custodyOpen` | false / false |
| Production gate `settle` | reverts `CustodyClosed` (`0x61839255`) |

The log is the lock initiated in transaction
`0x619c29aa8ead655863fecedf467cd186919968cfb59ec46bb62944913dc7fc1c`.
Base block `52497860` is later than the accepted beacon anchor, so this proof
does not yet place the message under that checkpoint.

Machine-readable result: `deployments/base-AacBaseBridgeOperationInclusion.json`.
