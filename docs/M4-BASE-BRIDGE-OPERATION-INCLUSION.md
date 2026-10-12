# Base Bridge Operation Inclusion

Status: **deployed on Base. The 0.01 USDC lock receipt is inside block
52497860. That block is not under the accepted beacon checkpoint, so
`headerFinal` stays false and custody remains closed.**

| Item | Value |
|---|---|
| Contract | `0x80Eb248985Ef0B6a5cF6C84A83a6A872666d1621` |
| Deployment | `0xb62754c5cf37beb5f6585669d2c488fa1e5695ffa0e8b49d7591c3a2c37b4907` |
| Base block | `52497860` |
| Block hash | `0xa3e839c0470a159f18b0efc873fbe56df0e5415a46a560c9b570fb387c7b7d08` |
| Receipts root | `0x6b1c954169e8c09544fbc5ce2bffd6e558cbdcd09d46ea0e563af12d5654dca7` |
| Lock transaction | `0x619c29aa8ead655863fecedf467cd186919968cfb59ec46bb62944913dc7fc1c` |
| Receipt index | `154` |
| Operation id | `0xbd91f602e72f2e2facb4e1de3291577179d60f45cc65e386819fa219a4bd1654` |
| Amount | `10000` (0.01 USDC) |
| `headerFinal` | false |
| Production gate | unchanged at `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` |

`verify` checks the Base header hash, reads its receipts root, and uses the
existing receipt trie verifier `0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10`.
The included receipt's second log is the treasury `BridgeOperation` for this
lock. A changed proof node reverts `InvalidProof`.

The accepted beacon checkpoint still ends at an earlier Base anchor. This
inclusion does not finish the message gate. The production gate was not
upgraded.

Acceptance: [M4-BASE-BRIDGE-OPERATION-INCLUSION-ACCEPTANCE.md](M4-BASE-BRIDGE-OPERATION-INCLUSION-ACCEPTANCE.md).
