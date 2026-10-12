# Committee Handoff Through Period 294

Status: **deployed on Base. The period-293 committee signed the period-294
committee. The 0.01 USDC bridge beacon slot is still outside this range, so
`messageCovered` and `headerFinal` stay false.**

| Item | Value |
|---|---|
| Contract | `0x61560D38FB6e27214c2530f212cA72d592da8628` |
| Deployment | `0x465c746dd3fb0eec21aa7e79873d61823d82f1323c222672f3bfac2bb04d17be` |
| Previous handoff | `0x34EF23A8F16F008097661bd7Ced70C20C6e03B6C` |
| Signing period | `293` |
| Next period | `294` |
| Attested slot | `2405587` |
| Participants | `511` of `512` |
| Bridge beacon slot | `15413404` |
| Bridge period | `1881` |
| `messageCovered` | false |
| `headerFinal` | false |

The signer digest is the next-committee digest already stored by the period-292
handoff. This call checks that those keys signed a different next committee
and that the next committee's Merkle proof lands in the attested beacon state.
A changed next committee reverts `InvalidProof`.

The bridge block's beacon slot is in period `1881`. Period `294` does not
cover it. Signature periods `294` through `1880` are still required.

Acceptance: [M4-ETHEREUM-COMMITTEE-HANDOFF-293-ACCEPTANCE.md](M4-ETHEREUM-COMMITTEE-HANDOFF-293-ACCEPTANCE.md).
