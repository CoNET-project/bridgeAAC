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

The paused canary is not this proxy. No Treasury, GB, or Peer role has been
granted to the proxy.

## Remaining deployments

Five contract deployments remain before a custody cutover can be proposed.
Role grants and the miner-vote cutover are transactions after those
deployments, not extra contracts.

| Order | Deployment | Chain | Custody effect |
|---|---|---|---|
| 1 | Beacon finalized-checkpoint proof for slot `15406750` | Base | Still closed. The payload inclusion proof does not finish this gate. `headerFinal` may become true only inside the checkpoint proof |
| 2 | AAC message inclusion proof | Base | Still closed. The proved object must be a bridge message, not the ordinary USDC transfer already quoted |
| 3 | CoNET beacon finality verifier | CoNET | Still closed. The off-chain observer still has `trusted-committee no` |
| 4 | Production consume-once destination consumer | Destination chain for that direction | Still closed. The existing consume-once specification proxy is not this consumer |
| 5 | Upgrade the stable proxy to a settling implementation | Base | Deployed closed. `settle` stays reverted until the same call has passed gates 1 and 2 |

Gate 1 still needs a proof that beacon block `15406750` is an ancestor of the
finalized checkpoint, with the checkpoint authenticated by a sync-committee
signature. The payload contract
`0x302ab591Fd8e46a3c482dA60EFE0bAC4Cf64dE55` only places the execution hash
inside that beacon block. An execution `finalized` tag, a longer parent-hash
walk, another EIP-4788 storage proof, or an `isGameClaimValid` eth_call does
not finish gate 1.

Gate 2 cannot reuse receipt `9` / log `13` of Base block `52239960`. That log
is an ordinary USDC transfer. The anchored block has no message-passer or
portal log.

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
