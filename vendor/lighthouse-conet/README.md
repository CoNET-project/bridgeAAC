# CoNET Lighthouse build

This directory records the exact Lighthouse build used by the parallel
consensus node on `38.49.214.149`.

## Version

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

The script clones the pinned upstream commit into a temporary directory,
applies the checked-in patch, and builds `lighthouse` in release mode. It
does not deploy, restart, or modify any remote host.

The resulting binary is intentionally not committed to this repository.
Copy it only through the approved deployment process, then verify its
SHA-256 against the value above.

## Start script and peer limits

`start-lighthouse.sh` is the source of truth for
`/home/peter/lighthouse-conet/start-lighthouse.sh` on `38.49.214.149`.

On 2026-10-01 the node sat at `peers: 0`. At startup Lighthouse sent
`blocks_by_range` to about 20 Prysm hubs at once (head sync plus
`--genesis-backfill`). Prysm answered `rate limited` 46 times, counted the
strikes against our peer id, and then replied `Goodbye(Fault/Banned)` within
milliseconds of every new connection. Ports, firewall, fork digest and clock
were all correct.

The peer id is stored in `data-conet-v5/beacon/network/key` and survives
restarts, so a plain restart does not clear Prysm's record. Rotating the key
alone was not enough: backfill after checkpoint sync still runs without
`--genesis-backfill`, and the fresh id was flagged again within a minute.
Prysm's per-peer limit is 64 blocks/s with a 128-block burst; Lighthouse's
default outbound quota is far above that. The fix has three parts:

- `--self-limiter-protocols blocks_by_range:48/1` caps each peer at 48 blocks/s
  (override with `LIGHTHOUSE_SELF_LIMIT`)
- `--target-peers 3` (override with `LIGHTHOUSE_TARGET_PEERS`)
- no `--genesis-backfill` by default
  (`LIGHTHOUSE_GENESIS_BACKFILL=1` turns it back on)

Rotate `data-conet-v5/beacon/network/key` once, after the limiter is in place,
so the new id never collects a strike. Back up the old key first.

## Runtime boundary

This build is a consensus client only. The production node uses it in
parallel with Prysm and the existing geth execution client. Do not replace
the active Prysm service or restart chain infrastructure as part of a build.
