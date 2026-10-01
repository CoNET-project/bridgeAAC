# Lighthouse Engine Isolation Acceptance Record

Date: 2026-10-01 (UTC)
Host: `38.49.214.149`
Scope: technical Lighthouse Engine API isolation only

## Current result

| Requirement | Result | Evidence |
|---|---|---|
| Lighthouse uses a dedicated local Engine API | **NOT PASS / pending isolation** | The recorded observation was Lighthouse using `http://127.0.0.1:8551`, which is also the Prysm Engine API. A successful authenticated call proves only that the endpoint works; it does not prove isolation. |
| Prysm no longer shares that Engine API | **NOT PASS** | The current migration state has Prysm active and using `127.0.0.1:8551`; Lighthouse must move to a second execution client on `127.0.0.1:8552`. |
| Execution chain identity | PASS | chain ID `224422`; genesis hash `0x97cde7aae67599cd6df35a551eb289ace211210a0d91c5456e55f0d3c9d63de1` |
| Lighthouse live health | PASS | `is_syncing=false`, `is_optimistic=false`, `el_offline=false`, `sync_distance=0`, 10 connected peers |
| Lighthouse peer identity | RECORDED | `16Uiu2HAmVEJPwkFzLsCYFcmmSc229ZLxpSWXPda6QojzeQiamhfM` |
| Slot `155646` local historical proof | PENDING | At the latest check, `oldest_block_slot=1511104`; `/eth/v1/beacon/headers/155646` returned HTTP 404 |
| Different-operator confirmation | NOT SATISFIED | This host is managed through the same party's `peter` SSH access; it must not count toward the independent-operator threshold |

## Target historical roots

The required values are:

```text
slot:       155646
block root: 0x442a5f8c64592b4e45820e0e27398f0532b15a2e22456bc02f8c74df8b591336
state root: 0x70001a2f373450a6057e506c89bb7a3b502c58bb7ae6ed97cfeea45f590a1410
```

These values are not accepted as a local confirmation until this Lighthouse
instance returns the slot locally and both roots match.

## Configuration evidence

```text
Lighthouse service: conet-lighthouse.service
Lighthouse API:    127.0.0.1:5100
Lighthouse P2P:    TCP 5200, UDP 5300, QUIC 5301
Lighthouse Engine API (target): 127.0.0.1:8552 (local-only)
Prysm Engine API:               127.0.0.1:8551 (local-only)
Lighthouse data:   /home/peter/lighthouse-conet/data-conet-v5
Lighthouse JWT:    /home/peter/lighthouse-conet/jwtsecret
Geth service:      conet-geth.service
Prysm service:     conet-beacon.service (active during this acceptance state)
```

The JWT contents are intentionally not recorded. The observed SHA-256 of the
matching JWT files was:

```text
99308eeffe2e6f50db407ff50545a72a8c8c4989d48341246d0c2fc45d4b9259
```

## Completion condition

Re-run the local check after `oldest_block_slot <= 155646`. The latest remote
estimate was approximately 1 day 10 hours at 12 slots/second; this is an
ongoing background backfill, not a completed proof. Acceptance requires
HTTP 200 from the local Lighthouse header endpoint and:

```text
data.root == 0x442a5f8c64592b4e45820e0e27398f0532b15a2e22456bc02f8c74df8b591336
data.header.message.state_root == 0x70001a2f373450a6057e506c89bb7a3b502c58bb7ae6ed97cfeea45f590a1410
```

Until then, neither the technical isolation nor the historical proof is
accepted. The historical Lighthouse health result remains useful only as a
consensus-client health observation; it is not evidence that the execution
clients are isolated.

## Submitted confirmation statement

An operator statement dated `2026-10-01T05:30:24Z` was supplied with the
following claims:

```text
peer_id: 16Uiu2HAmVEJPwkFzLsCYFcmmSc229ZLxpSWXPda6QojzeQiamhfM
slot 155646 local verification: NOT AVAILABLE
local block_root: n/a
local state_root: n/a
result: identity live and head-synced; historical roots pending
```

The statement was reported as signed with SSH ED25519 key fingerprint
`SHA256:3Ksw9iagfEv/6WhFwMaIIzMw3EDOLUyT5A1tnMIBEhw` and key label
`peternew`. The signature is not independently re-verified in this record
because the corresponding public key and an independently controlled operator
attestation were not supplied. In particular, this statement does not prove
that the signer is an external operator or that the host is outside the
signer's administrative control.

Accordingly, this submission is recorded as technical evidence only. It does
not satisfy the different-operator threshold, and it does not satisfy the
slot-root confirmation requirement.

## Rollback

If Lighthouse fails after a configuration change, stop the change and restore
the previous `/home/peter/lighthouse-conet/start-lighthouse.sh` from its
timestamped backup, then restore the previous systemd drop-in state and
restart only `conet-lighthouse.service`. Do not delete
`data-conet-v5`, rotate the network key, purge the database, or restart Geth,
Prysm hubs, or validators as a rollback shortcut.
