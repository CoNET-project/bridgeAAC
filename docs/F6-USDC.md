# F6 — USDC miner vote closed

**Date:** 2026-10-15  
**Status:** **EXECUTED** — miner `voteBridgeOperation` is closed on Base and CoNET. USDC deposits that depend on that vote are stopped. AAC was **not** granted a Treasury mint/release role.  
**Owner auth:** 「请关闭矿工 voteBridgeOperation, usdc入金可以被关闭」  
**Script:** [scripts/closeVoteBridgeOperation.mjs](../../../scripts/closeVoteBridgeOperation.mjs)  
**JSON:** [deployments/close-vote-bridge-operation.json](../../../deployments/close-vote-bridge-operation.json)

---

## What closed

`TreasuryBridgeV3` proxy `0xa208982212978550594A7FEEB70a61665d129003`.

| Chain | New implementation | Upgrade tx | `voteBridgeClosed` |
| --- | --- | --- | --- |
| CoNET | `0xc426f2aE938Ba28ad18b3cf7470c7c8c27362a15` | `0xf979091ea84489a64ac93610519f650d350805286f5f6525b2f972dfb21d6898` | true |
| Base | `0xB6fD1A2fB9497021f6604E4869cD5d49890db53A` | `0xb1702e9573ea81f2b6a5dc4c75c60e8d8e6a7f67c9291fb6d054bbac2f02d621` | true |

The flag is packed into storage slot 21 beside `developerFxIssuer` (offset 20). CoNET `developerFxIssuer` stayed `0x083da39C81D9078fE5d31e852eBAdb34B885b698`. On 2026-10-15 the three node miners were removed. `minerCount` is now **1** on both chains, and `miners()` is only the owner EOA. A miner `voteBridgeOperation` eth_call from the owner reverts `VoteBridgeClosed`.

CoNET implementation Blockscout: `is_verified` / `is_partially_verified` true. Base implementation standard JSON is `deployments/base-TreasuryBridgeV3-standard-input-FULL.json`; Basescan was not submitted because no API key is configured.

## What still moves tokens

`voteBridgeClosed` rejects:

- `voteBridgeOperation` (the miner listener path)
- `executeMint`
- `initiateLockMint`, `initiateBurnMintForUser`, and `initiateBurnRelease`

`executeRelease` is not gated. The runtime is 24570 bytes, and the EIP-170 limit is 24576. That signature release path can still finish an already started burn/release. New lock and burn initiates cannot start.

Re-open is `setVoteBridgeClosed(false)` by the Treasury owner. No AAC replacement path was added.

## Earlier probe

The 2026-10-15 probe found no pause setter on the previous implementations (`0xd813b3FB2789d7A404b3888b5f14f7Ce03d76Da1` on CoNET, `0xf7474cac9c9833fa35ce10e3b22f442096ed0a06` on Base). Closing required this upgrade.

---

## Related

- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md)
- [F5-SETTLE-OPEN.md](F5-SETTLE-OPEN.md)
- [F7-OWNER-KEY.md](F7-OWNER-KEY.md)
