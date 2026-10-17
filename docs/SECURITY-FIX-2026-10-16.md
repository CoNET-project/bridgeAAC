# bridgeAAC settlement fixes (C1–C3), 2026-10-16

Status: **code and tests only. Nothing is deployed.** Custody stays closed.
The containment calls in the remediation plan (owner-signed) are a separate
step and must run first.

## What is fixed

| Finding | Fix | Contract | Test |
|---|---|---|---|
| C1 unauthenticated headers | Settlers reach the covers only through a gate that requires the header hash to be authenticated (keyed by chain id) | `AacHeaderAuthority`, `AacAuthenticatedHeaderGate` | `C1: header authority and gate`, `C1 + C2/C3` |
| C2 `completeFromAac` takes any asset and mode | CoNET effect completes only owner-allowed `(asset, mode)` routes, each with a per-operation cap. Only the settler can call it | `AacChainEffectV2` | `C2/C3: AacChainEffectV2` |
| C3 replay on the CoNET side | `consumed[operationId]` on the effect | `AacChainEffectV2` | `consumes each operationId once` |
| C3 pause bypass | GB mints check `bridgePaused()` before `mintPaid` (both effect and Base F8) | `AacChainEffectV2`, `AacProductionCustodyGateSettlerF8` | `refuses GB minting while … paused` |
| C3 Base replay | Already enforced by the consume-once contract; F8 keeps it | `AacProductionCustodyGateSettlerF8` | `refuses a replayed operationId` |
| H2 source-chain binding | Authentication is keyed by `(chainId, headerHash)`; a CoNET authentication cannot authorize a Base header | `AacHeaderAuthority`, gate | `binds the chain id` |

Storage layout of `AacProductionCustodyGateSettlerF8` is identical to F7
(checked from the compiler output), so the live proxy can upgrade to it
through the existing `scheduleUpgrade`/`upgradeTo` path.

## Fail-closed by design

`AacHeaderAuthority` starts empty. Until a verifier records headers, every
settlement that goes through the gate reverts. This removes the forgery path
but also halts Base↔CoNET settlement until the verifiers below exist.

## Not done

1. **C1 verifiers.** Nothing yet calls `AacHeaderAuthority.authenticate`.
   - Base headers on CoNET: authenticate through the anchored Base output root
     (reuse `AacBaseOutputRootProof` / `AacBaseHeaderProofRelayVerifier`). CoNET
     has no Ethereum L1 light client, so this needs one or a different trust
     model. This is an architecture decision.
   - CoNET headers on Base: bind `keccak(conetHeaderRlp)` to the finalized
     beacon's execution payload `block_hash` (reuse `AacEthereumBeaconPayloadProof`).
2. **H1 finality of the CoNET source.** Not reviewed in this change. The
   inclusion contract's finality check is unchanged.
3. **H3 governance.** `owner` is a plain address. Move it to a Safe multisig
   with a 48-hour timelock before any role change. Rotate the EOA
   `0x87cAe…05e1` after that.
4. **Treasury contract unchanged.** `completeFromAac` still trusts its
   `aacExecutor`, so the executor must be `AacChainEffectV2` only.
5. **No fork tests yet** on live Base/CoNET state. No bytecode comparison
   against the deployed contracts. No independent audit (waived by owner).

## Cover Base-header binding (2026-10-16, later)

Defect: `AacCheckpointMessageCover` (0x01506527…233) read `receiptsRoot` and
`parentBeaconBlockRoot` from the caller's `baseHeaderRlp` and never hashed it
against a Base block. A caller could build a header with a fabricated
receipts root, a receipt with a TREASURY log, and a real finalized beacon root.
The cover then returned `messageCovered = true` and `headerFinal = true`.
Reproduced by `cover-binding.test.ts` (the original cover accepts both the real
and the fabricated header).

Current control: `gateBase` (`AacAuthenticatedHeaderGate`) checks
`AUTHORITY.isAuthenticated(8453, keccak(baseHeaderRlp))` before it forwards to
the cover. So the live F8 path is blocked only by the header authority, which
is the C1 verifier that is not built yet. The defect is still in the cover. It
becomes exploitable when a gate uses the cover without that authority check,
for example a light-client gate, or when anything trusts the cover's return
value directly.

Fix: `AacCheckpointMessageCoverV2.sol` (new file, original left unchanged, same
pattern as F7→F8). `cover()` takes an `L1Anchor`. It calls
`AacBaseOutputRootProof`'s verify (`OUTPUT_ROOT_PROOF` 0x57A4…c34C4, the same
path as `AacBaseAnchorReceiptRoot`) and requires `keccak256(baseHeaderRlp)` to
equal the anchored `baseBlockHash`. Only then does it read `receiptsRoot`.
Beacon finality is unchanged.

Trust boundary: the binding is as strong as the output-root anchor. The
`trusts the L1 anchor` test documents that boundary.

Not done:
- V2 is not deployed. Nothing in `deployments/` points at it.
- The F8 gate still calls the original cover through `gateBase`. Do not wire
  a gate to the light client until F8 or the gate points at V2 and the new
  interface is reviewed.
- `CoverMocks.sol` mocks the store and the output-root proof. The real output-root
  proof has its own deployment record and is not rerun here.

## Deployment mapping (values read on 2026-10-16)

- `AacHeaderAuthority(owner = multisig)`
- `gateBase = AacAuthenticatedHeaderGate(authority, baseCover = 0x01506527…233, conetInclusion = 0x7064860E…0559)`, used by F8 as `GATE`
- `gateConet = AacAuthenticatedHeaderGate(authority, baseCover = 0xA5bB0636…12E06, conetInclusion = 0x7064860E…0559)`, used by settler v2 as `cover`
- `AacProductionCustodyGateSettlerF8(payee = 0xA4559e91…5C1E, gate = gateBase)` as the new Base implementation. The payee is the value on the live F7 implementation.
- `AacChainEffectV2(treasury = 0xa208982…129003, gb = 0xC3EF02…8D8, owner = multisig)`. Then `setRoute(GB, 1, …)`, `setRoute(conet-USDC, 1, …)`, `setRoute(WCNET, 2, …)` as the owner decides. `setSettler(settlerV2)`.
- `AacConetBaseSettlerV2(cover = gateConet, effectReader = 0x3EFD6b90…c27Df, probe = 0xed2E4B55…33713, effect = AacChainEffectV2)`. The reader and probe are the values on the live CoNET settler v1 (`0x7285…`).
- CoNET: `Treasury.setAacExecutor(AacChainEffectV2)`, `GB.addAdmin(AacChainEffectV2)`. Remove the v1 effect from both.
- Base: `Treasury.aacExecutor` stays off (containment step 2). The F8 proxy keeps GB admin.

Deploy only after the C1 verifiers exist, or accept that settlement stays halted.

## Tests

`solidity-tests/`: 36 tests (`fix.test.ts`: 25, `baseline.test.ts`: 4,
`cover-binding.test.ts`: 7). The cover-binding tests are in the next section.
Mutation check: removing the header-authority check fails 5 tests, removing the
replay check fails 2, removing the pause check fails 1.
The baseline tests reproduce the original C2 and C3 behavior: v1 replay, v1
pause bypass, v1 unrestricted asset and mode, and F7 pause bypass.
