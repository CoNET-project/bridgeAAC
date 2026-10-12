# Base Bridge Beacon Parent Link

Status: **deployed on Base. The beacon root stored in the 0.01 USDC bridge
block walks back to the accepted checkpoint. That newer beacon slot is not
itself finalized, so `headerFinal` stays false and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x58F6560184EdD9912F2032060D56fc726a042960` |
| Deployment | `0x9957ab7165d3e9084b647434e19d1228d0be5736f21c35b251dc15a20837f93f` |
| Base block | `52497860` |
| Base block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Stored beacon root | `0x0fd49e9e9fcf2db840cbcd14744c84ada07605f71334d8eec6f5cc72684109d5` |
| Beacon slot | `15413404` |
| Finalized root | `0x010febf9edfb97cbea1ac737e5e7e4fbdd49b5f1c1f91af877a8a26b38283a1e` |
| Finalized slot | `15413120` |
| Parent links | `284` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

One call checks the already deployed bridge-receipt inclusion and then reads
field 19 of the same Base header. That field is the L1 beacon parent observed
by the Base block. The contract hashes 284 beacon headers from slot
`15413404` down to slot `15413121`, whose parent is the accepted finalized
root.

Slot `15413404` is later than finalized slot `15413120`. A descendant of a
checkpoint is not a finalized header. This call does not finish gate 1 or
gate 2. The production gate was not upgraded.

Acceptance: [M4-BASE-BRIDGE-BEACON-PARENT-LINK-ACCEPTANCE.md](M4-BASE-BRIDGE-BEACON-PARENT-LINK-ACCEPTANCE.md).
