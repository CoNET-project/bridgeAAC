#!/usr/bin/env bash
# CoNET L1 Lighthouse beacon node (parallel to Prysm).
# Uses the CoNET-preset Lighthouse v5.3.0 build (EpochsPerEth1VotingPeriod = 4).
# Stock Lighthouse v8.x rejects this config ("Config does not match any known preset").
#
# Deployed to 38.49.214.149 as /home/peter/lighthouse-conet/start-lighthouse.sh
# (service: conet-lighthouse.service). Keep this file as the source of truth.
#
# Why this node only dials a fixed set of Prysm peers (2026-10-01 incident):
#
# 1. Prysm hubs reject peers that share an IP unless that IP is listed in their
#    --p2p-colocation-whitelist. 38.49.214.149 is whitelisted only on the
#    instances below. Every other hub instance (all of 38.102.126.58,
#    38.102.126.50:4203/4204/4210, 216.225.202.23:4201/4202,
#    216.225.202.22:4210) answers Goodbye(Fault) the moment we connect. With
#    discv5 seeded with hub ENRs, Lighthouse keeps redialling them and sits at
#    peers: 0. Fix: give discv5 no --boot-nodes (v5.3 has no
#    --disable-discovery flag and the testnet dir has no boot_enr.yaml), and
#    pass an explicit whitelisted peer list via --libp2p-addresses, kept alive
#    through --trusted-peers.
#    When a hub adds or removes the whitelist entry, update WHITELISTED_PEERS.
#
# 2. Backfill after checkpoint sync runs even without --genesis-backfill and
#    Prysm answers "rate limited" to a burst of blocks_by_range, counting
#    strikes against our peer id. Cap our own outbound rate per peer.
#
# 3. The peer id lives in data-conet-v5/beacon/network/key and survives
#    restarts. Rotate it only as an explicit recovery step, after the fixes
#    above are in place.
set -euo pipefail
BASE="${LIGHTHOUSE_BASE:-/home/peter/lighthouse-conet}"
cd "$BASE"

# ip:tcp-port:peer-id of Prysm instances that whitelist 38.49.214.149.
WHITELISTED_PEERS=(
  "216.225.202.22:4200:16Uiu2HAmKUmANGevFSxVmb2F6M8fATvE1JVDPoYyQ5hQQgnTXo5q"
  "216.225.202.23:4200:16Uiu2HAkzreGGDBfRDZ4YNpBaxXcA7eA6hGtLcfTG4W9ZGESQQxk"
  "38.102.126.50:4200:16Uiu2HAmEsYyTVeFeDjjgFnWK3coziBG7WkzVouhLWzR7UcCajKP"
  "38.102.126.30:4200:16Uiu2HAkunrHj1TR7Wt3xuYiftKACntAxRaZdbY7BY8ey65Cz9oy"
  "216.225.202.82:4200:16Uiu2HAmDJCHuVkXtkPrrL8YykQ9gFZnQkR9Q6WjZZUrmueohPfd"
  "216.225.197.3:4200:16Uiu2HAkvNRH2otsVTrZ6bq8AAKau3WYFGRc62JS5PTUjhGqLdJQ"
)
LIBP2P_ADDRS=""
TRUSTED_IDS=""
for ENTRY in "${WHITELISTED_PEERS[@]}"; do
  IP="${ENTRY%%:*}"; REST="${ENTRY#*:}"; PORT="${REST%%:*}"; PID="${REST#*:}"
  LIBP2P_ADDRS="${LIBP2P_ADDRS:+$LIBP2P_ADDRS,}/ip4/$IP/tcp/$PORT/p2p/$PID"
  TRUSTED_IDS="${TRUSTED_IDS:+$TRUSTED_IDS,}$PID"
done

TARGET_PEERS="${LIGHTHOUSE_TARGET_PEERS:-6}"
# Outbound limit per peer: one 32-block batch per 10 s. Prysm answered rate limited to any second request inside ~6-10 s on the same peer (measured 2026-10-01).
SELF_LIMIT="${LIGHTHOUSE_SELF_LIMIT:-beacon_blocks_by_range:32/10}"

EXTRA_ARGS=()
if [ "${LIGHTHOUSE_GENESIS_BACKFILL:-0}" = "1" ]; then
  EXTRA_ARGS+=(--genesis-backfill)
fi

exec "$BASE/bin/lighthouse-v5.3.0-conet" bn \
  --testnet-dir "$BASE/testnet-conet" \
  --datadir "$BASE/data-conet-v5" \
  --execution-endpoint http://127.0.0.1:8551 \
  --execution-jwt "$BASE/jwtsecret" \
  --checkpoint-sync-url http://216.225.202.22:4100 \
  --libp2p-addresses "$LIBP2P_ADDRS" \
  --trusted-peers "$TRUSTED_IDS" \
  --target-peers "$TARGET_PEERS" \
  --self-limiter-protocols "$SELF_LIMIT" \
  --http --http-address 127.0.0.1 --http-port 5100 \
  --port 5200 --discovery-port 5300 --quic-port 5301 \
  --listen-address 0.0.0.0 \
  --enr-address 38.49.214.149 \
  --enr-tcp-port 5200 --enr-udp-port 5300 \
  --disable-upnp \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
