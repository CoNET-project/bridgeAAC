# M4 Paused Mainnet Canary

Status: **accepted; custody remains closed**.

This canary places the receipt verifier, a fail-closed finality placeholder,
and the payload-bound consumer on Base and CoNET. The consumer is paused in
its constructor. `unpause` always reverts. Finality verification always
reverts. No TreasuryBridgeV3, GBToken, or Peer role was granted, and no mint,
release, or settlement transaction was sent.

The canary address is intentionally not the future custody address. It is not
upgradeable, so the pause lock cannot be removed by an implementation upgrade.

| Chain | Consumer | Receipt verifier | Finality placeholder |
|---|---|---|---|
| Base `8453` | `0x04e07eddB62e8c9EBee0DA411b1575ead55104d9` | `0xC9D0949f7D54eD827BAdb51fD4970baEdE5B5d10` | `0x4D4E6056150Dba14abeDC0BE2f070949aa40BC28` |
| CoNET `224422` | `0xc9a4BCc087d51851cFa4cb7B5C581D9139487720` | `0x805BF6E41df8Ce5C106A5993fc062095dBFDE61E` | `0x757709739c6bA273c23928A793becE1A6Bc7978F` |

Acceptance on both chains, re-read after deployment: `paused == true`,
`unpause` reverts, the finality placeholder reverts, both adapters point at
the canonical Treasury and GB addresses, and none of the canary contracts is
the Treasury owner. Peer v5 still has no code. The record is
`deployments/mainnet-AacPausedCanary-acceptance.json`.

Verification:

- Base: Sourcify `match` for creation and runtime code on all five contracts.
- CoNET: Blockscout `is_verified == true` for all five contracts. Sourcify does
  not index chain `224422`.
- Compiler: `v0.8.35+commit.47b9dedd`, `viaIR`, optimizer runs `2`,
  `bytecodeHash: none`. The on-chain metadata tail is `000823`.

Standard JSON: `deployments/verify-input/mainnet-aac-canary-standard-input.json`.
Deployment record: `deployments/mainnet-AacPausedCanary.json`.
