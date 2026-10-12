# Committee Handoff Through Period 293

Status: **deployed on Base. The period-292 committee signed the period-293
committee. The 0.01 USDC bridge beacon slot is still outside this range, so
`messageCovered` and `headerFinal` stay false.**

| Item | Value |
|---|---|
| Contract | `0x34EF23A8F16F008097661bd7Ced70C20C6e03B6C` |
| Deployment | `0x62d7fc1e5c6206ca289594516bc27da21ddb03d21201c27f38781ed107147c3d` |
| Previous handoff | `0x80F29F94c75eE07DFA8Eca33DFbEA2A3edA34DC2` |
| Signing period | `292` |
| Next period | `293` |
| Attested slot | `2399850` |
| Participants | `509` of `512` |
| Bridge beacon slot | `15413404` |
| Bridge period | `1881` |
| `messageCovered` | false |
| `headerFinal` | false |

One call first checks the Altair period `290` to `291` handoff. It then checks
that the committee produced by that handoff signed the next committee. A
changed next committee reverts `InvalidLink`.

The bridge block's beacon slot is in period `1881`. Period `293` does not
cover it.

Acceptance: [M4-ETHEREUM-COMMITTEE-HANDOFF-292-ACCEPTANCE.md](M4-ETHEREUM-COMMITTEE-HANDOFF-292-ACCEPTANCE.md).
