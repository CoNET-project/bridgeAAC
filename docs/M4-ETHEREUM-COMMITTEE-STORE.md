# Ethereum Committee Store

Status: **deployed on Base. The store holds the period-630 committee. The
0.01 USDC bridge beacon slot is still outside this range, so `messageCovered`
and `headerFinal` stay false.**

| Item | Value |
|---|---|
| Proxy | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` |
| Implementation | `0x7c1345bEEFB2e4b081B5053B15536e50728aAD2c` |
| Latest update | `0xdb90e6bb65d843dfd1a7e507db625b5d4ec877d2c8eef1dc87ae65fc2da6cdf7` |
| Starting period | `294` |
| Stored period | `630` |
| Attested slot | `5152878` |
| Participants | `510` of `512` |
| Bridge beacon slot | `15413404` |
| Bridge period | `1881` |
| `messageCovered` | false |
| `headerFinal` | false |

The proxy is initialized with the period-294 committee digest already proven
by the previous handoff. `applyUpdate` checks that the supplied keys compress
to the stored committee, that at least two thirds signed, and that the
signature is the hash-to-curve image of the attested header. The stored
committee then advances by exactly one period.

A changed next committee reverts `InvalidProof`. The upgrade key can replace
the implementation. It cannot grant an asset role or mark the bridge message
covered.

Three hundred thirty-six supermajority updates advanced the store from period
`294` to period `630`. Ethereum head slot `15414746` is still inside period
`1881`, and it is already later than bridge slot `15413404`. Period `1882`
has not started. The committee that can sign a finalized header at that bridge
slot is the period-`1881` committee, which this store does not hold yet.
Signature periods `630` through `1880` are still required before that call.

Acceptance: [M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md](M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md).
