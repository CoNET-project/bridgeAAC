# Lighthouse Engine Isolation Acceptance Record

Date: 2026-10-01 (UTC)
Host: `38.49.214.149`
Scope: technical Lighthouse Engine API isolation only

## Reassessment — 2026-10-03

The following supersedes the pending statuses below where the newer evidence
is explicit:

| Requirement | Current status | Basis and limitation |
|---|---|---|
| Lighthouse dedicated Engine API | **PASS (previously observed)** | Lighthouse was observed on local `127.0.0.1:8552`; Prysm was inactive and no longer shared that endpoint. This was not re-probed after SSH access was revoked. |
| Slot `155646` roots | **PASS by host attestation** | The supplied statement reports local block/state roots exactly matching the expected values. Independent reproduction from this workstation is unavailable after access revocation. |
| Peter SSH access | **REVOKED by host attestation; current local key denied** | A fresh login with this workstation's currently loaded RSA key (`SHA256:VmuQ…`) returned `Permission denied (publickey)` for both `peter` and `root`. The supplied host statement separately reports that the former `peternew` ED25519 key (`SHA256:3Ksw…`) was removed and then denied. That exact ED25519 key is not present in this workspace, so its denial was not independently repeated. |
| Peter local sudo access | **REVOKED by supplied host audit** | The supplied statement reports removal from `sudo`, removal of Peter-specific sudoers grants, and `sudo -n -l -U peter` denial. |
| Provider/cloud management access | **NOT VERIFIED / not revoked** | The supplied statement explicitly says provider-console IAM, API keys, and out-of-band access were not revoked. |
| Different-operator threshold | **PENDING CONTROL-PROOF COMPLETION** | `peternew` is a key identity and is not the Linux account `peter` or proof of the natural person's identity. The supplied facts support a distinct signer plus revoked host-local Peter access, but provider IAM/out-of-band control remains unverified. |

### New signed evidence

```text
peer_id: 16Uiu2HAmVEJPwkFzLsCYFcmmSc229ZLxpSWXPda6QojzeQiamhfM
version: Lighthouse/v5.3.0-d6ba8c3+/x86_64-linux
slot: 155646
block_root: 0x442a5f8c64592b4e45820e0e27398f0532b15a2e22456bc02f8c74df8b591336
state_root: 0x70001a2f373450a6057e506c89bb7a3b502c58bb7ae6ed97cfeea45f590a1410
parent_root: 0x89ff718fd2d8ff79701afa3a0577e29ff46294bab591a9f4d694a16a48bd2c7d
head_slot: 1606733
```

The supplied signature fingerprint is
`SHA256:3Ksw9iagfEv/6WhFwMaIIzMw3EDOLUyT5A1tnMIBEhw`, labelled `peternew`.
The label `peternew`, the Linux login name `peter`, and a natural-person
operator identity are three separate concepts. This record must not infer
that the key is controlled by Peter merely because it was once authorized for
the Unix account `peter`.
The signed files and public key were not supplied to this workspace, so the
cryptographic verification is recorded as user-reported rather than
independently reproduced here.

The host statement also reports that Geth and Lighthouse were left running,
while Peter and root SSH logins using the tested key were refused. It states
that cloud/provider IAM was intentionally not changed; therefore host-local
revocation must not be represented as full administrative-control transfer.

### Independent public observations — 2026-10-03

The following checks were performed without host credentials:

1. `216.225.202.82:4100` reported the declared peer ID as **connected**,
   inbound, with the same ENR and QUIC address
   `/ip4/38.49.214.149/udp/5301/quic-v1`.
2. The same active reference beacon returned slot `155646` as canonical and
   finalized, with the declared block root, state root and parent root.
3. Public TCP reachability matched the intended boundary: SSH `22` and
   Lighthouse P2P `5200` were reachable; Lighthouse HTTP API `5100` and Engine
   API `8552` timed out from this workstation. This supports, but by itself
   cannot prove, localhost-only binding because a firewall drop produces the
   same external symptom.
4. Batch-mode SSH as both `peter` and `root` was denied for the workstation's
   currently loaded RSA identity. The former `peternew` ED25519 private/public
   key files were not available locally, so the reported revocation of that
   exact key remains host-attested.

These observations independently establish live peer identity, network
connectivity and canonical slot roots. They do not establish who controls the
provider account, rescue console, rebuild controls or other out-of-band
administration.

## Milestone assessment

### Completed in this stage

1. Lighthouse uses a dedicated, local Engine API and no longer shares Prysm's
   execution endpoint.
2. The Lighthouse identity is stable and its head is synchronized.
3. The local slot `155646` block root and state root were reported as matching
   the required values in the signed operator statement.
4. Peter's tested SSH access was denied, and the host audit reports removal of
   Peter's local sudo grants.
5. The signer key identity `peternew` is recorded separately from the Unix
   account `peter`.

### Next-stage acceptance target

Complete the administrative-control handover evidence without granting Peter
temporary access again:

1. The external operator publishes the `peternew` public key and the exact
   signed statement file so a verifier can reproduce `ssh-keygen -Y verify`.
2. The provider owner supplies a redacted IAM/console report showing that the
   external operator controls console, rescue, rebuild, serial-console and API
   access, while Peter and Peter-controlled groups, tokens and recovery paths
   have none.
3. The external operator runs a fresh local read-only health check and signs
   the resulting peer identity, head status and one newly selected historical
   slot root.
4. A verifier checks the signature and compares the roots without receiving
   shell, sudo or cloud-console access to the host.

When all four items are complete, the different-operator milestone can be
marked **SATISFIED**. Until then, the technical node milestone is complete,
while the administrative-independence milestone remains pending evidence.

## Historical baseline — superseded where reassessed above

The following table records the state before Engine isolation, history
backfill and Peter access revocation. It is retained as an audit trail and is
not the current acceptance status.

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
