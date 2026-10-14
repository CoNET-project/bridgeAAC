# Ethereum Committee Store

Status: **historical deployment on Base. The store holds the period-630
committee. It is not the forward sync-committee root.** New proofs use the
[checkpoint root](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md), which is not
installed. This store keeps `messageCovered` and `headerFinal` false and is
not extended by replaying later periods.

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
`294` to period `630`. Those updates stay as history. New Base finality proofs
do not continue this replay. They use the
[checkpoint root](M4-SYNC-COMMITTEE-CHECKPOINT-ROOT.md).

Acceptance: [M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md](M4-ETHEREUM-COMMITTEE-STORE-ACCEPTANCE.md).
