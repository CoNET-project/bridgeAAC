# Production custody gates

Status on `2026-10-14` (Phase D updated `2026-10-15`): **custody closed.** The
stable Base proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` can quote
accepted execution proofs. `headerFinal()` is false. `settle()` reverts
`CustodyClosed`. Paid-GB miner `voteBridgeMint` is **paused** (Phase D);
USDC `voteBridgeOperation` remains the live USDC bridge.

This page is the current threshold plan. Historical Shadow approvals in
[PRODUCTION-EVALUATION.md](PRODUCTION-EVALUATION.md) do not open custody.

New Base finality proofs use the
[sync committee checkpoint root](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md).
That root is a recent finalized sync committee, not the Altair fork.
Obstacles **1–5 are Accepted** on 2026-10-14. Custody stays closed:
`custodyOpen()` and `headerFinal()` remain false; no-arg `settle()` still
reverts `CustodyClosed`. Independent audit and third-party acceptance were
**waived by owner 2026-10-14**. Post-gate engineering assurance:
[PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md). Cutover (Phase A
recorded; Phase B GB `addAdmin(AAC)` **EXECUTED** 2026-10-15; Phase C canary
**EXECUTED** 2026-10-15 — 0.01 paid GB; Phase D paid-GB `setBridgePaused(true)`
**EXECUTED** 2026-10-15 — CoNET + Base; Treasury USDC vote untouched):
[CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md).

| Obstacle | Accepted deployment (Base) |
|---|---|
| 1 | Checkpoint store proxy `0xcEE3D699df3df07a573f1aFf642888B97B7aA961` |
| 2 | Cover `0x01506527a4Dab14141038Db15f5341dcF4729233` + new lock in block `52583500` |
| 3 | CoNET-source finality proxy `0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` |
| 4 | Consume-once proxy `0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F` |
| 5 | Production settler proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` → Obstacle 5 impl `0x3085216E8329eF7d10c914cB1C43Cd8168f53442`; **live EIP-1967 after Phase C** → SettlerCanary `0x9b8DDa3d27473A4EdD351fFD4106c388876A9864` |

The historical 0.01 USDC lock in block `52497860` is not a sample for
obstacle 2. The Altair handoffs and the period-`630` store stay on Base as
history. They are not extended by replaying periods `630` through `1880`.

## What is already deployed

These Base contracts stay fail-closed. They are evidence of earlier proof
shapes. None of them is the checkpoint root, none of them sets `headerFinal`,
and none of them authorizes mint or release. Replaying them, or extending the
Altair store from period `630`, does not pass an obstacle below.

| Step | Contract | What it shows |
|---|---|---|
| Anchor storage | `0x8248Fe0Ee2f9B70AD18675efc303D08FD306c3A9` | Anchor game slot in one Ethereum state |
| Header binding | `0x7dec59217677Ed0C485642264dfe49E777bF16a6` | That state root is inside one execution header |
| Output root | `0x57A498086d00A7Da80c8304F6189712b583c34C4` | Base block `52239960` matches the anchor game claim |
| Header chain | `0x9C6Fd974650ad6cF6CBa8d1596DA34522C681E8D` | 100 parent-hash links up to that Ethereum header |
| USDC log | `0x1815d6DA04DE7910A5438168E1642e0f4eA25D28` | One ordinary USDC transfer in that Base block |
| Beacon root storage | `0x599D2FF48177CBb38eed5FDcd61e681cD441C953` | EIP-4788 stores the header's beacon root |
| Combined link | `0x11b7f8cD851dD3f990686f86ABD2179E9bF413e2` | The log proof and the beacon-root proof use the same header |
| Closed gate | proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`, implementation `0x0C18AF212DA3AdD0e1023C1f7d3Ca8D0e0Cf4ef2` | Quotes the old links and the 0.01 USDC bridge proof, and cannot settle |
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
| Altair handoff | `0x80F29F94c75eE07DFA8Eca33DFbEA2A3edA34DC2` | Period `290` Altair committee signs the first distinct committee in period `291` |
| Second handoff | `0x34EF23A8F16F008097661bd7Ced70C20C6e03B6C` | That committee signs period `293`. The bridge slot remains in period `1881` |

The paused canary is not this proxy. No Treasury, GB, or Peer role has been
granted to the proxy.

## Production obstacles

Five deployments remain before a custody cutover can be proposed. Role grants
and the miner-vote cutover come after these five, in separate transactions.
The rule for the committee root is
[M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md).

| Order | Deployment | Chain | Passes only when |
|---|---|---|---|
| 1 | Checkpoint-root committee store | Base | The installed keys are the signing committee of one finalized beacon block, and one two-thirds aggregate in that period verifies under those keys |
| 2 | One new AAC message under that committee | Base | The same call proves a finalized header at least as late as the message's beacon slot and proves that message's receipt |
| 3 | CoNET-source finality adapter | Destination of a CoNET-origin message | A CoNET header is final under a committee that was not taken from that same beacon response alone |
| 4 | Consume-once production consumer | Destination chain | One new consumer consumes one AAC id once and reverts on a second consume. It is not the paused canary and not the specification proxy |
| 5 | Settling implementation of the stable proxy | Base | `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` settles only when obstacles 1 and 2 succeed in that same call |

A Base-origin release uses obstacles 1, 2, 4, and 5. A CoNET-origin message
also uses obstacle 3. Obstacle 3 does not move Ethereum committee pairing onto
CoNET.

### Obstacle 1 — checkpoint root

**Deploy** a new Base store. Do not continue
`0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a`, and do not upgrade
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` in this step. Initialize it with
the `current_sync_committee` of a finalized beacon block chosen at
installation. Record the slot, the period, the beacon `state_root`, the Merkle
branch, the compressed-key digest, the EIP-4788 account proof, and the
observer names with that same digest.

**Accept** when all of the following are true on that store:

- the stored digest equals `keccak256` of the compressed keys;
- the Merkle branch binds those keys to the beacon `state_root`;
- the same beacon root is in EIP-4788 contract
  `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02`;
- at least two named CoNET observers recomputed that digest;
- one later call verifies a sync aggregate in the same period with
  `participants * 3 >= 512 * 2`;
- `headerFinal` is true only inside that successful proof, and means final
  relative to this checkpoint.

**Reject** an Altair replay, the period-`630` store, a same-block bootstrap,
a beacon API `finalized` flag, a single observer, an aggregate below two
thirds, a parent-hash walk, an output root, and a store that returns
`headerFinal == true` as a constant.

**Accepted** on 2026-10-14. Proxy
`0xcEE3D699df3df07a573f1aFf642888B97B7aA961`, implementation
`0x5D92bC7d8b87BC84142C396417f26b55b7B11863`. Both Sourcify matches are
`match` (verification ids `640eb4cb-bd6f-447e-96de-00a2d155988f` and
`5275499e-5632-4407-991b-a40e5fa06a23`). Finalized beacon slot `15427520`,
period `1883`, beacon root
`0xbfd339bc85988b6c6c44decccb7de54564ea1fe5f7d0e754c4fb20917a0e939a`,
state root
`0x7679d4ef04323293643c34c94eb6b81bb2823a4486006063164d0a1deb0d4c57`,
digest
`0xb5e26546712793699378679bbfe918ce15ea3a230259d05113189599b634db94`.
The Merkle branch is the bootstrap `current_sync_committee` branch at
generalized index `86`. EIP-4788 contract
`0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02` stores that beacon root at
timestamp slot `1014` and root slot `9205` for Ethereum execution block
`26188529`
(`0x61ae802d9c0b7412c6c0715eea34b77ce53ca6702ccfd74c19dde7e6faff8f4f`),
whose `parentBeaconBlockRoot` is the same root. CoNET observers
`38.102.126.30` and `216.225.202.82` recomputed the same digest from
different beacon endpoints. `proveAggregate` transaction
`0xa2c193ee67a86f35d5e48abe092496659c3c615f1c56591cbbdbdc7857e971c5`
verified `512` of `512` participants for attested slot `15425644` and
signature slot `15425645`, and that call returned `headerFinal = true`.
The `headerFinal()` view remains false. `messageCovered()` remains false.
`rootReady` is true. This acceptance does not settle, mint, or release.

### Obstacle 2 — one new message

**Deploy** one function on the obstacle-1 store, or one contract that calls
it. Create a new lock or burn only after the stored committee can sign that
message's beacon slot. The historical 0.01 USDC `BridgeOperation` in Base
block `52497860` is not this message.

**Accept** when one call does all of the following:

- verifies a finalized beacon header with the stored committee and a
  two-thirds aggregate;
- the finalized slot is at least as late as the message's beacon slot;
- the receipt for that new lock or burn is included under the execution
  payload committed by that header;
- the call reports the message covered and `headerFinal` true together.

Receipts under that same finalized header may share the BLS verification.
Each receipt still needs its own inclusion proof. A second pairing does not
fit in the committee-rotation transaction: one rotation already uses about
`11.5` million gas, and the Base per-transaction cap is `16,777,216`.

**Reject** the old 0.01 USDC receipt, an inclusion proof without the
checkpoint aggregate, and a finalized header from an earlier period than the
stored signing committee.

**Accepted** on 2026-10-14. New lock
`0x28c9b472313f3a7b1196b0ec3a7a5b4613cdb3e1e1f5be112d12d045932b7190`
in Base block `52583500`, receipt index `54`, log index `1`, operation
`0x365db5b664ff368928fbf362ba6905b63a16834e9693a9f2b11f58b094baa289`,
amount `10000` (0.01 USDC). Its beacon slot is `15427678`, inside period
`1883`. One call,
`0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d`,
on `0x01506527a4Dab14141038Db15f5341dcF4729233` verified a finalized beacon
header at slot `15427680` with `511` of `512` signers and proved that
receipt under the Base header whose parent beacon root is that message.
The call returned message covered and `headerFinal` true together. The
store views `headerFinal()` and `messageCovered()` remain false. This
acceptance does not settle, mint, or release.

### Obstacle 3 — CoNET as source

**Deploy** a destination adapter that checks a CoNET beacon header. Do not
deploy an Ethereum sync-committee verifier on CoNET. CoNET calls to
`0x0b`–`0x11` return empty results, so those addresses are not the Base
precompiles.

**Accept** when the adapter verifies the CoNET sync aggregate under a
committee that is not supplied only by the same beacon response that supplied
the header, the participation is at least two thirds, and `trusted-committee`
stays `no` for a same-beacon committee.

**Reject** a CoNET contract that treats an empty precompile call as a
pairing, and a report whose only committee source is that same beacon.

**Accepted** on 2026-10-14 on Base. Proxy
`0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`, implementation
`0x9C9AC8F5E3c3861DDfF3aF16b40C4131B59617f0`. Both Sourcify matches are
`match` (verification ids `01af3569-2148-4594-9793-ddd75e4f4765` and
`2021acde-5746-4c4a-bf4a-82a3cfd09f49`). The adapter uses Base EIP-2537
precompiles `0x0c` / `0x0d` / `0x0f` / `0x11`. The installed CoNET
committee snapshot is period `215`, snapshot slot `1763456`, state root
`0xa180f47b9c93ed1bd9bfde0b93e6593b1002da27f9518e94bceea6b18c00dbb1`,
compressed digest
`0xe26808badfcbbc05761f47f5f1efa366bcc4aaef51bdf6b5bd030f146fae86f7`.
That digest was recomputed from CoNET beacon host `38.102.126.30`
(`127.0.0.1:4100`) and confirmed against the same committee material on
`38.102.126.50` (Ethereum `:5052` is not the CoNET beacon). Install
transaction
`0x0cb74c4d152e2f0f4a47d7ca653e41cb3dccb9b9792e4e463e7758d0be53e9f7`
stored the committee separately from the later aggregate. Prove
transaction
`0x59898d797735cd7e3f9b9dc9e271f25f00145f20627f204f935b2ff61c594bef`
verified `494` of `512` participants for attested slot `1763463` and
signature slot `1763464` (`494 * 3 >= 512 * 2`). The attested slot and
state root differ from the installed snapshot, so the committee is not
taken only from the same beacon response as the proven header.
`trustedCommittee()` stays false. The `headerFinal()` view stays false.
`messageCovered()` stays false. `rootReady` is true. This acceptance
does not settle, mint, or release, and does not upgrade
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`.

### Obstacle 4 — consume once

**Deploy** a new destination consumer. Do not unpause the old canary. Do not
treat specification proxy `0xA13843C75f68F726e1DC4dbA75d07597EE18d999` as this
consumer: it records consume ids and does not mint or release.

**Accept** when a mainnet or Base transaction consumes one AAC id, a second
consume of that id reverts, and a failed effect does not leave the id
consumed. The consumer mints or releases only after obstacles 1 and 2, or
obstacle 3 for a CoNET-origin message, have succeeded for that id.

**Reject** selector presence, a PUSH4 scan, and an upgrade that reorders
storage so a consumed id is forgotten.

**Accepted** on 2026-10-14 on Base. Proxy
`0xC6CBcC0c629ac1A80DB95e8b80927e713E82Cf4F`, implementation
`0xcb197f3B8c277D3e507993C35F086Ab9Eb41a94F`, gateway
`0xcE30DdFFB7B2C75c6615D441c232ac9D60b6344B`, ok effect
`0x8Cdb0DB088c67A70a5db45dB8A4B2e1b9E4BCbAF`, revert effect
`0x6A4469c7337185c60f311f9B6f2958aB3dDb2480`. All five Sourcify matches are
`match` (verification ids `cc4e6b37-7609-4126-a843-568bf5d04555`,
`014d6c95-ad38-4c96-9c4c-4b2e65b32a6f`, `3f3fcef4-ce22-4212-8be3-373a27f26af3`,
`9eba4078-da05-426d-90c3-6ae234826037`, and
`5f8b3aee-87b1-4d12-a387-e31df93a9e60`). The consumer gates CoNET-origin
mint/release on `rootReady` of
`0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9` and Base-origin mint/release on
a same-transaction cover call to
`0x01506527a4Dab14141038Db15f5341dcF4729233`. Smoke used the CoNET-origin
path with `rootReady` already true. Consume transaction
`0xba05c5ed6e7903255fb97d9153fbc9d401c6320e5bfff6209dce90ceb1e3f0f6`
minted `1000000` for id
`0xdabc77240008d32f4c58b1fec6f526931b4f205de9adcdedb9fd501cc8ea213f`
and left `isConsumed` true. A second consume of that id reverted. A
consume through the revert effect for id
`0x9b50428038b88a635bf03a20eaf2a72d968951d1adaad2ec0ec42c4009e1a314`
reverted and left `isConsumed` false with minted amount `0`. This
acceptance does not settle, unpause the old canary, grant Treasury / GB /
Peer roles, or upgrade
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`.

### Obstacle 5 — stable proxy can settle

**Deploy** a new implementation and upgrade
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` to it. The upgrade does not grant
Treasury, GB, or Peer roles.

**Accept** when `settle` and `settleBridge` succeed only if the same call has
passed obstacle 1 and obstacle 2 for a Base-origin message, or obstacle 3
plus that message's inclusion proof for a CoNET-origin message. Either check
failing reverts. The upgrade does not itself consume the AAC; obstacle 4 does
that on the destination. Before this implementation is deployed, both
functions revert `CustodyClosed` (`0x61839255`).

**Reject** a quote-only implementation, a success path that skips the
checkpoint aggregate, and an upgrade of the paused canary.

**Accepted** on 2026-10-14 on Base. Proxy
`0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd` upgraded to implementation
`0x3085216E8329eF7d10c914cB1C43Cd8168f53442` (previous settler impl
`0x6c5b1E857Dc2807D5383Eb8001783258FFC3645F`). Sourcify match is `match`
(verification id `ac4868ae-7dd3-4f51-aecd-9ddaa40fcdef`; creation and
runtime both `match`). Upgrade transaction
`0x5bfc2c41e460a66cf63f1fbe8206ec6b664cee13a2d71df480c892a13b535f7b`
(block `52585579`) preserved `owner`
`0x87cAeD4e51C36a2C2ece3Aaf4ddaC9693d2405E1` and `proofLink`
`0x4b0465A26C79CC4BddB0f756FD40ad0B23596d1b`. `COVER()` is
`0x01506527a4Dab14141038Db15f5341dcF4729233`. `CONET_FINALITY()` is
`0xE4f6c834eb63f726cbE65b4F864620e4a6F7a6c9`. No-arg `settle()` still
reverts `CustodyClosed` (`0x61839255`). Cover-gated `settle` transaction
`0x12026474cb3774ffb841c870164e2ef27a1e1b9ce60117708ddc66b7e2c73ea9` and
`settleBridge` transaction
`0x0c944ff2ad3f414a9eb611138d093284e132ca31ddc692388a60fae3210461c0`
both status `1`, each reusing the same cover calldata body as cover smoke
`0xb08859189eb9e090a3db6a153c575375066af06788fdff1672b59405ebbe336d`
with selectors `0x50b1cadb` / `0x4e83f2d2` so obstacle 1 and 2 run in the
same call. CoNET-origin `settleFromConet` transaction
`0xf21b03cb49acbdbacda131224d3c61d544fe08f0bc360e9d7d0663bfe42696e3`
succeeded with `rootReady` true; a bad inclusion binding reverts.
`custodyOpen()` and `headerFinal()` remain false. This acceptance does not
consume AAC, mint, release, unpause the canary, or grant Treasury / GB /
Peer roles.

## Steps that are not deployments

| Step | When | Tracker |
|---|---|---|
| Independent audit of gates 1–5 | ~~Before any role grant~~ | [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md) §4 — **WAIVED BY OWNER 2026-10-14**; optional runbook [INDEPENDENT-AUDIT.md](INDEPENDENT-AUDIT.md) |
| Third-party / Shadow acceptance as cutover hard stop | ~~Before Phase B~~ | [THIRD-PARTY-ACCEPTANCE.md](THIRD-PARTY-ACCEPTANCE.md) — **WAIVED BY OWNER 2026-10-14** (Shadow remains read-only) |
| Engineering assurance (tests + fail-closed smoke) | After Obstacles 1–5 Accepted | [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md) — **PASS** (2026-10-14; reconfirmed 2026-10-15) |
| Cutover Phase A read-only preflight | After assurance smoke; before Phase B | [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase A evidence — **RECORDED** (2026-10-15) |
| Grant GB `admins` (and later Treasury if named) to the AAC proxy | Owner named B1/B2 | [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase B — GB **EXECUTED** 2026-10-15; Treasury still **NOT EXECUTED** |
| Bounded AAC canary (Phase C) | Owner named C1/C2 + amount 0.01 | [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase C — **EXECUTED** 2026-10-15 (0.01 paid GB) |
| Pause paid-GB `voteBridgeMint`; leave USDC `voteBridgeOperation` live | Phase D after canary | [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) Phase D — **EXECUTED** 2026-10-15 (`setBridgePaused(true)` CoNET + Base) |
| Unpause the old canary, or point it at these proofs | Not part of this plan | Explicitly excluded |

## Optional proof, not a threshold

A storage proof of `isGameClaimValid` for game
`0x0896E5a1469847D56089e1f073f3a100Bc041c44` can be one extra contract. An
eth_call that returns true is not that proof. Completing it does not reduce
the five deployments above.
