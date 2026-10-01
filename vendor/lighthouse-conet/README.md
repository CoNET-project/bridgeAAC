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

On 2026-10-01 this node sat at `peers: 0` while the reference node
`70.35.205.77` (same binary, same hubs) held 16 Prysm peers. Measured
differences:

| | `70.35.205.77` | `38.49.214.149` (before) |
|---|---|---|
| Goodbye(Fault/Banned) from hubs | none in 3.5 h | 106 + 18 in 5 min |
| `rate limited` replies | 16 in 3.5 h | hundreds in minutes |
| Backfill | 1,551,776 blocks in ~27 h (~16 blocks/s over ~16 peers) | burst on 3-6 peers |

Two causes, both on our side:

1. **Same-IP colocation.** Prysm hubs penalise a second peer from one IP unless
   it is in `--p2p-colocation-whitelist`. `.149` also runs Prysm and geth, so
   non-whitelisted hub instances (`38.102.126.58`, `38.102.126.50:4203/4204/4210`,
   `216.225.202.23:4201/4202`, `216.225.202.22:4210`) answer `Goodbye(Fault)`.
   The reference node owns its IP and is accepted everywhere. This part needs
   a hub-side whitelist entry for `38.49.214.149` to fully clear.
2. **Backfill pace per peer.** Backfill after checkpoint sync runs even without
   `--genesis-backfill`. Prysm answers `rate limited` and strikes the peer id
   when one peer is asked faster than roughly one 32-block batch per 30 s.
   Spread over ~16 peers the reference node stays below that; pinning the list
   to 3-6 peers, and rotating the key six times in an hour (each restart is a
   fresh burst), put us above it.

A first attempt dialled only whitelisted peers (`--libp2p-addresses`,
`--trusted-peers`). That concentrated load and made things worse; it was
removed. The script now matches the reference node: one boot ENR, default
discv5, default `--target-peers`. Deliberate differences: ports
5200/5300/5301, no `--genesis-backfill` by default
(`LIGHTHOUSE_GENESIS_BACKFILL=1` enables it), and
`--self-limiter-protocols beacon_blocks_by_range:32/30` (override with
`LIGHTHOUSE_SELF_LIMIT`) to match the reference pace.

The peer id is stored in `data-conet-v5/beacon/network/key` and survives
restarts, so a plain restart never clears a hub's record. Rotate it only as an
explicit recovery step and back up the old key first. Avoid repeated restarts.

## Runtime boundary

This build is a consensus client only. The production node uses it in
parallel with Prysm and the existing geth execution client. Do not replace
the active Prysm service or restart chain infrastructure as part of a build.
