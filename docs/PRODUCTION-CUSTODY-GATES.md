# Production custody gates

Status on `2026-10-12`: **custody closed.** The stable Base proxy
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` can quote accepted execution
proofs. `headerFinal()` is false. `settle()` reverts `CustodyClosed`.
Miner votes remain the live bridge.

This page is the current threshold plan. Historical Shadow approvals in
[PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md) do not open custody.

## What is already deployed

These Base contracts are accepted and stay fail-closed. None of them is a
beacon-finality proof, and none of them authorizes mint or release.

| Step | Contract | What it shows |
|---|---|---|
| Anchor storage | `0x8248Fe0Ee2f9B70AD18675efc303D08FD306c3A9` | Anchor game slot in one Ethereum state |
| Header binding | `0x7dec59217677Ed0C485642264dfe49E777bF16a6` | That state root is inside one execution header |
| Output root | `0x57A498086d00A7Da80c8304F6189712b583c34C4` | Base block `52239960` matches the anchor game claim |
| Header chain | `0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D` | 100 parent-hash links up to that Ethereum header |
| USDC log | `0x1815d6DA04DE7910A5438168E1642e0f4eA25D28` | One ordinary USDC transfer in that Base block |
| Beacon root storage | `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` | EIP-4788 stores the header's beacon root |
| Combined link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` | The log proof and the beacon-root proof use the same header |
| Closed gate | proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`, implementation `0x7e90446e56A1D736842d252c8bc238f43861e91D` | Quotes those proofs and cannot settle |
| Successor | `0x486BF16d9bDd87F12eb983C27905a1deBABb004c` | Execution block `26167827` extends `26167826` and stores its own beacon root |
| Beacon payload | `0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` | Execution hash `0xbeeaebea…d725` is inside beacon block `15406750` |
| Beacon header | `0xa9A07770335138A1c37a25bD1F0bb2A5BeC838dE` | That beacon block's parent root is `0xfa666216…a8a7` |
| Beacon successor | `0x532080e752ddebd0DD9b2c3611Ee9307513BfBdc` | Slot `15406751` extends that block and contains execution hash `0xcd01892c…e8ff` |
| Beacon ancestry | `0x4E28D764151AD328d7c50a0fFB380935d07a26dF` | `6348` headers connect finalized slot `15413120` to slot `15406751` |
| Sync aggregate | `0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341` | `505` of `512` committee keys signed that finalized block |
| Checkpoint link | `0xeA57144daa0d02A90794bC0FbE1dA92050f4f59E` | One call checks that ancestry and that aggregate together |
| Bridge operation | `0x80Eb248985Ef0B6a5cF6C84A83a6A872666d1621` | 0.01 USDC `BridgeOperation` receipt is inside Base block `52497860` |
| Bridge beacon parent | `0x58F6560184EdD9912F2032060D56fc726a042960` | That Base header's beacon root walks 284 parents to finalized slot `15413120` |
| Checkpoint extension | `0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b` | Observed slot `15413984` walks 580 parents to that same bridge beacon root |

The paused canary is not this proxy. No Treasury, GB, or Peer role has been
granted to the proxy.

## Remaining deployments

Five contract deployments remain before a custody cutover can be proposed.
Role grants and the miner-vote cutover are transactions after those
deployments, not extra contracts.

| Order | Deployment | Chain | Custody effect |
|---|---|---|---|
| 1 | Beacon finalized-checkpoint proof for slot `15406750` | Base | Still closed. The payload inclusion proof does not finish this gate. `headerFinal` may become true only inside the checkpoint proof |
| 2 | AAC message inclusion proof | Base | Still closed. The 0.01 USDC `BridgeOperation` is inside block `52497860`, and that block is not a finalized header |
| 3 | CoNET beacon finality verifier | CoNET | Still closed. The off-chain observer still has `trusted-committee no` |
| 4 | Production consume-once destination consumer | Destination chain for that direction | Still closed. The existing consume-once specification proxy is not this consumer |
| 5 | Upgrade the stable proxy to a settling implementation | Base | Deployed closed. `settle` stays reverted until the same call has passed gates 1 and 2 |

Gate 1 still keeps `headerFinal` false. The checkpoint link
`0xeA57144daa0d02A90794bC0FbE1dA92050f4f59E` checks the `6348`-header ancestry
and the `505`-of-`512` sync aggregate in one call. The committee is pinned
from that same block's bootstrap, so the combined call does not finish the
gate. The payload contract
`0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` only places the execution hash
inside that beacon block. The successor
`0x532080e752ddebd0DD9b2c3611Ee9307513BfBdc` extends that block by one slot.
The ancestry contract
`0x4E28D764151AD328d7c50a0fFB380935d07a26dF` walks `6348` headers from
finalized slot `15413120` to that successor. The sync-aggregate contract
`0x6ADD8D931b622C8FFd4B3bd41Dc23C478b09e341` checks that the committee inside
that finalized block signed it. The committee is pinned from the same block's
bootstrap, so the signature does not by itself set `headerFinal`.
An execution `finalized` tag, a longer parent-hash walk, another EIP-4788
storage proof, a beacon API `finalized` flag, or an `isGameClaimValid`
eth_call does not finish gate 1.

Gate 2 has a real lock receipt, and the Base block is still not finalized.
Contract `0x80Eb248985Ef0B6a5cF6C84A83a6A872666d1621` proves the 0.01 USDC
`BridgeOperation` is inside Base block `52497860`. Contract
`0x58F6560184EdD9912F2032060D56fc726a042960` reads the beacon root stored in
that same header and walks 284 parents from slot `15413404` to finalized slot
`15413120`. Contract `0x1ffD76a3176AD6e91b123e567D9A7EeF5bC5AE2b` walks 580
parents from observed slot `15413984` to that bridge beacon root. The later
slot has no sync-committee proof in this contract, so the walk does not
finish the gate. The ordinary USDC transfer in block `52239960` remains
unused.

Gate 3 is required for a CoNET mint or burn. A Base-only release still needs
gates 1, 2, and 5. Both directions need gate 4 on the destination chain.

Gate 5 keeps the proxy address. The new implementation may settle only when
the beacon proof and the AAC message proof succeed together. Shipping that
implementation early is allowed only while `settle` still reverts.

## Steps that are not deployments

| Step | When |
|---|---|
| Independent audit of gates 1–5 | Before any role grant |
| Grant Treasury or GB roles to the proxy | After the audit, in a separate cutover transaction |
| Leave miner `voteBridgeOperation` and `voteBridgeMint` live | Until that cutover transaction |
| Unpause the old canary, or point it at these proofs | Not part of this plan |

## Optional proof, not a threshold

A storage proof of `isGameClaimValid` for game
`0x0896E5a1469847D56089e1f073f3a100Bc041c44` can be one extra contract. An
eth_call that returns true is not that proof. Completing it does not reduce
the five deployments above.
