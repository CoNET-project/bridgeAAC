# CoNET Lighthouse build

This directory records the exact Lighthouse build used by the parallel
consensus node on `38.49.214.149`.

## Version

The complete v5.3.0 source snapshot is included in `src/`. Its pinned
upstream identity and archive checksum are recorded in `SOURCE_COMMIT`,
`SOURCE_ARCHIVE_SHA256`, and `src/CONET-SOURCE.md`.

- Upstream repository: `https://github.com/sigp/lighthouse.git`
- Upstream commit: `d6ba8c397557f5c977b70f0d822a9228e98ca214`
- Upstream release: `v5.3.0`
- CoNET patch: `patches/0001-conet-eth1-voting-period.patch`
- Reported binary version: `Lighthouse v5.3.0-d6ba8c3+`
- Deployed x86_64 SHA-256:
  `9e4b98c88b10dc5a6dd9f6070838c14b74f947ceba8eb2940a0e2291f17be243`

The patch is required because CoNET uses
`EPOCHS_PER_ETH1_VOTING_PERIOD = 4`. Stock Lighthouse v5.3.0 uses the
Ethereum mainnet value of 64. Both the epoch constant and its derived slot
constant must change together.

## Reproducible build

From the `bridgeAAC` repository root:

```bash
./scripts/buildConetLighthouse.sh
```

The script uses the pinned source snapshot in
`vendor/lighthouse-conet/src/`, copies it into a temporary directory, applies
the checked-in CoNET patch, and builds `lighthouse` in release mode. It does
not deploy, restart, or modify any remote host. This is the default path and
does not require access to `sigp/lighthouse`.

For recovery or source maintenance only, an operator may explicitly enable
the network fallback:

```bash
LIGHTHOUSE_ALLOW_NETWORK_FALLBACK=1 ./scripts/buildConetLighthouse.sh
```

The fallback still checks out the same pinned commit. It is not required for
independent deployment and must not silently replace the vendored source.

The source snapshot is upstream code and retains its upstream license files.
`CONET-SOURCE.md` records its commit and archive checksum. Runtime secrets,
JWT files, beacon databases, execution databases, and release binaries are
not part of this repository.

The resulting binary is intentionally not committed to this repository.
Copy it only through the approved deployment process, then verify its
SHA-256 against the value above.

## Start, operate, troubleshoot

Read `RUNBOOK.md` before you start, restart or change this node. It holds the
start procedure, the health criteria, the hard rules and the 2026-10-01
incident record.

| File | Purpose |
|---|---|
| `start-lighthouse.sh` | Source of truth for `/home/peter/lighthouse-conet/start-lighthouse.sh` on `38.49.214.149`. Edit here, push, then deploy. |
| `check-lighthouse.sh` | Read-only health check, run on the node. `WATCH_MIN=15` samples peers for 15 minutes. |
| `RUNBOOK.md` | Start guide, hard rules, decision tree, incident record. |

The rules in one place:

1. Keep default discovery and default `--target-peers`; one boot ENR, as the
   healthy reference node `70.35.205.77` does. Never pin a short peer list.
2. Do not restart repeatedly and do not rotate `network/key` as a fix.
3. Backfill runs after checkpoint sync even without `--genesis-backfill`.
   Keep per-peer pace gentle (`beacon_blocks_by_range:32/30`) over many peers.
4. `Goodbye(Fault)` from hub instances that do not whitelist `38.49.214.149`
   is expected; the fix is a hub-side whitelist entry, not a Lighthouse flag.
5. Read `data-conet-v5/beacon/logs/beacon.log`; the journal is info level only.
6. Verify with `check-lighthouse.sh` for 15 minutes, never from one snapshot.

## Runtime boundary

This build is a consensus client only. The production node uses it in
parallel with Prysm, but Lighthouse must connect to its own execution client.
The required separation is:

```text
Prysm      -> Prysm Geth       -> 127.0.0.1:8551
Lighthouse -> Lighthouse Geth -> 127.0.0.1:8552
```

The two execution clients must have separate datadirs, chain databases,
Engine API ports, JWT files, and execution P2P/discovery ports. The
Lighthouse launcher defaults to:

```bash
LIGHTHOUSE_EXECUTION_ENDPOINT=http://127.0.0.1:8552
LIGHTHOUSE_EXECUTION_JWT=/home/peter/lighthouse-conet/jwtsecret
PRYSM_EXECUTION_ENDPOINT=http://127.0.0.1:8551
PRYSM_EXECUTION_JWT=/home/peter/conet-l1/jwtsecret
```

The launcher refuses identical Lighthouse/Prysm Engine API endpoints or JWT
paths. Do not change only the Lighthouse endpoint: without the matching
Lighthouse Geth, `el_offline=true` is expected and the deployment is
incomplete. The 2026-10-03 acceptance reassessment recorded the live
Lighthouse endpoint as `127.0.0.1:8552`; treat that as recorded evidence, not
as a substitute for a fresh live command-line and health-check verification
after any deployment.

Do not replace the active Prysm service or restart chain infrastructure as
part of a build.
