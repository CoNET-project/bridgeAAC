#!/usr/bin/env bash
# CoNET L1 Lighthouse beacon node (parallel to Prysm).
# Uses the CoNET-preset Lighthouse v5.3.0 build (EpochsPerEth1VotingPeriod = 4).
# Stock Lighthouse v8.x rejects this config ("Config does not match any known preset").
#
# Deployed to 38.49.214.149 as /home/peter/lighthouse-conet/start-lighthouse.sh
# (service: conet-lighthouse.service). Keep this file as the source of truth.
#
# Peer-limit notes (2026-10-01 incident):
# - Starting with the default ~100 target peers and --genesis-backfill makes
#   Lighthouse fire blocks_by_range at every Prysm hub in the first second.
#   Prysm answers "rate limited", counts the strikes against our peer id, and
#   then replies Goodbye(Fault/Banned) to every later connection.
# - Backfill after checkpoint sync still runs without --genesis-backfill (the
#   anchor was at oldest_block_slot 1560352 and kept going on every start), and
#   rotating the peer key alone did not help: the new id was flagged within a
#   minute. The real fix is the outbound --self-limiter-protocols cap below.
# - Keep the peer count small. Set LIGHTHOUSE_GENESIS_BACKFILL=1 to also pull
#   history all the way to genesis.
# - The peer id lives in data-conet-v5/beacon/network/key. Restarting does not
#   change it; delete it only as an explicit, one-time recovery step.
set -euo pipefail
BASE="${LIGHTHOUSE_BASE:-/home/peter/lighthouse-conet}"
cd "$BASE"

TARGET_PEERS="${LIGHTHOUSE_TARGET_PEERS:-3}"
# Outbound limit per peer. Prysm (BlockBatchLimit=64 blocks/s, burst 128) answers
# "rate limited" and counts a strike against us when backfill asks faster.
# Backfill after checkpoint sync is not optional, so cap our own request rate.
SELF_LIMIT="${LIGHTHOUSE_SELF_LIMIT:-blocks_by_range:48/1}"

# Hub ENRs are best effort; a hub being down must not stop the node.
ENRS="enr:-Mq4QJ9iokTaQWac4KmyRLWCCW5aTqhZEOekgnk8krEZvnwQcSjPI5BD9GXr9dXltQF6wMUF5vNNxGreRjt-vU0j1gWGAaCc6Czeh2F0dG5ldHOIAwAAAAAAAACEZXRoMpBuufdeIAAAkwBMBgAAAAAAgmlkgnY0gmlwhNjhyhaEcXVpY4IyyIlzZWNwMjU2azGhAwNuofZfI-D_EPXyfXWaaPS3WfJ8HGa8DDHqqvU-l90_iHN5bmNuZXRzD4N0Y3CCEGiDdWRwghDM"
for HUB in 216.225.202.82 38.102.126.30 38.102.126.50; do
  ENR=$(curl -fsS --max-time 15 "http://$HUB:4100/eth/v1/node/identity" 2>/dev/null \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["enr"])' 2>/dev/null || true)
  if [ -n "$ENR" ]; then ENRS="$ENRS,$ENR"; fi
done

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
  --boot-nodes "$ENRS" \
  --target-peers "$TARGET_PEERS" \
  --self-limiter-protocols "$SELF_LIMIT" \
  --http --http-address 127.0.0.1 --http-port 5100 \
  --port 5200 --discovery-port 5300 --quic-port 5301 \
  --listen-address 0.0.0.0 \
  --enr-address 38.49.214.149 \
  --enr-tcp-port 5200 --enr-udp-port 5300 \
  --disable-upnp \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
