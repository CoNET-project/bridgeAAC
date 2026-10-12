# Ethereum Committee Store

Status: **deployed on Base. The store holds the period-296 committee. The
0.01 USDC bridge beacon slot is still outside this range, so `messageCovered`
and `headerFinal` stay false.**

| Item | Value |
|---|---|
| Proxy | `0x9D3e1111CBBC8658Bff54620f4FE8d95783De09a` |
| Implementation | `0x7c1345bEEFB2e4b081B5053B15536e50728aAD2c` |
| Latest update | `0x956333d661cf6849b41757fa921e2fb8b308bc89bcb98b28f2c25950c6c7bca8` |
| Starting period | `294` |
| Stored period | `296` |
| Attested slot | `2422192` |
| Participants | `509` of `512` |
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

The store has accepted two updates: period `294` to `295`, then period `295`
to `296`. Signature periods `296` through `1880` are still required before the
bridge beacon slot can be covered.

Acceptance: [M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md](M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md).
