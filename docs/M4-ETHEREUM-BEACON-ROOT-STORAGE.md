# Ethereum Beacon Root Storage

Status: **deployed on Base. The execution state records the beacon root.
This is not beacon finality, and it does not open custody.**

| Item | Value |
|---|---|
| Contract | `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` |
| Deployment | `0x5fdb4d9abc3bf5ebd446e1e881334aacaa0466b9edf0e828dc45fc2c1e928b67` |
| Header reader | `0xc9F20370b13266F3DfD71e257df8D2F84B8a3e0b` |
| Beacon roots contract | `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02` |
| Execution header | `26167826` / `0xbeeaebea63023a336d15c612675ccc8de94b5b86700d4809ceda897d4638d725` |
| State root | `0xa1fd16d6ff44d1225f45691aa863adb599f45e01e77773c891eebb0b99ede358` |
| Timestamp | `1791705023` |
| Storage slot | `5683` (`timestamp % 8191`) |
| `parentBeaconBlockRoot` | `0xfa666216f53dc78986e48e6d44c2cc733c32ca163622a5dec4c17e230b39a8a7` |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` checks three things:

1. The header reader accepts the execution header and returns its committed
   beacon root, with `headerFinal` false.
2. The account proof shows that the EIP-4788 beacon-roots contract is present
   in that header's state root, with the known code hash.
3. Slot `timestamp % 8191` stores the header timestamp, and the following
   ring-buffer slot stores the same beacon root.

An earlier deployment at `0x08946Cb2F8131C639958CA6c553BBf626e4749ee` read the
RLP wrapper as the storage value and reverted `InvalidProof`. It is not
accepted.

The beacon-roots contract is written by the execution client. A matching
storage value does not prove that the beacon chain finalized this header.
The production gate was not upgraded, and its `settle` path still reverts.

Acceptance: [M4-ETHEREUM-BEACON-ROOT-STORAGE-ACCEPTANCE.md](M4-ETHEREUM-BEACON-ROOT-STORAGE-ACCEPTANCE.md).
