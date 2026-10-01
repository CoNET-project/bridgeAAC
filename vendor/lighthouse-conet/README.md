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

On 2026-10-01 the node sat at `peers: 0`. Ports, firewall, fork digest and
clock were all correct. Two separate causes were found in Lighthouse's debug
log (`data-conet-v5/beacon/logs/beacon.log`) and the Prysm hub flags:

1. **Colocation whitelist gaps.** Prysm hubs refuse peers that share an IP
   unless it is in `--p2p-colocation-whitelist`. `38.49.214.149` is whitelisted
   only on `:4200` of each hub, plus `:4210` on `.23/.30/.82/197.3`. Every
   instance on `38.102.126.58`, `38.102.126.50:4203/4204/4210`,
   `216.225.202.23:4201/4202` and `216.225.202.22:4210` answers
   `Goodbye(Fault)` as soon as we connect. discv5 kept redialling them.
   The script now dials only the whitelisted `:4200` instances
   (`--libp2p-addresses`, `--trusted-peers`) and gives discv5 no boot nodes.
   If a hub whitelists the IP later, add it to `WHITELISTED_PEERS`.
2. **Backfill burst.** Backfill after checkpoint sync runs even without
   `--genesis-backfill` and fired `blocks_by_range` at every hub at once.
   Prysm answered `rate limited`, counted strikes against our peer id and then
   replied `Goodbye` on every later connection. Lighthouse also scored each
   error -10 and dropped the peer. `--self-limiter-protocols
   beacon_blocks_by_range:64/8` caps each peer at 8 blocks/s
   (override with `LIGHTHOUSE_SELF_LIMIT`).

The peer id is stored in `data-conet-v5/beacon/network/key` and survives
restarts, so a plain restart never clears a hub's record. Rotate it once after
the fixes are in place and back up the old key first. Genesis backfill stays
off unless `LIGHTHOUSE_GENESIS_BACKFILL=1`.

## Runtime boundary

This build is a consensus client only. The production node uses it in
parallel with Prysm and the existing geth execution client. Do not replace
the active Prysm service or restart chain infrastructure as part of a build.
