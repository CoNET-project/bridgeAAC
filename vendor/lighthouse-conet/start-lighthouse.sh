#!/usr/bin/env bash
# CoNET L1 Lighthouse beacon node (parallel to Prysm).
# Uses the CoNET-preset Lighthouse v5.3.0 build (EpochsPerEth1VotingPeriod = 4).
# Stock Lighthouse v8.x rejects this config ("Config does not match any known preset").
#
# Deployed to 38.49.214.149 as /home/peter/lighthouse-conet/start-lighthouse.sh
# (service: conet-lighthouse.service). Keep this file as the source of truth.
# Read RUNBOOK.md in this directory before you change a flag or restart.
#
# Discovery and peer count match the healthy reference node 70.35.205.77
# (16 Prysm peers, no Goodbye(Fault) in hours): a single boot ENR, default
# discv5, default --target-peers. Do not pin a short peer list or add
# --trusted-peers: that concentrated backfill on a few hubs and got the peer id
# rate-limited and banned (2026-10-01 incident, see README.md).
#
# Differences from 70.35.205.77, on purpose:
# - ports 5200/5300/5301 (this host already runs Prysm and geth);
# - a dedicated Lighthouse execution client is required. Prysm keeps 8551;
#   Lighthouse uses 8552 by default (see RUNBOOK.md);
# - no --genesis-backfill by default (LIGHTHOUSE_GENESIS_BACKFILL=1 enables it);
# - outbound blocks_by_range is capped per peer. The reference node's backfill
#   ran at about 16 blocks/s spread over 16 peers (one 32-block batch per ~30 s
#   per peer) and Prysm never rate-limited it. A faster per-peer pace does.
#
# The peer id lives in data-conet-v5/beacon/network/key and survives restarts.
# Rotate it only as an explicit recovery step; back up the old key first.
set -euo pipefail
BASE="${LIGHTHOUSE_BASE:-/home/peter/lighthouse-conet}"
cd "$BASE"

# Prysm and Lighthouse must never share an Engine API, JWT, or execution
# datadir. The endpoint defaults are intentionally different: Prysm owns 8551,
# while the Lighthouse companion execution client owns 8552.
EXECUTION_ENDPOINT="${LIGHTHOUSE_EXECUTION_ENDPOINT:-http://127.0.0.1:8552}"
EXECUTION_JWT="${LIGHTHOUSE_EXECUTION_JWT:-$BASE/jwtsecret}"
PRYSM_EXECUTION_ENDPOINT="${PRYSM_EXECUTION_ENDPOINT:-http://127.0.0.1:8551}"
PRYSM_EXECUTION_JWT="${PRYSM_EXECUTION_JWT:-/home/peter/conet-l1/jwtsecret}"
if [ "$EXECUTION_ENDPOINT" = "$PRYSM_EXECUTION_ENDPOINT" ]; then
  echo "Refusing to start: Lighthouse and Prysm share Engine API $EXECUTION_ENDPOINT" >&2
  exit 1
fi
if [ "$EXECUTION_JWT" = "$PRYSM_EXECUTION_JWT" ]; then
  echo "Refusing to start: Lighthouse and Prysm share JWT $EXECUTION_JWT" >&2
  exit 1
fi

# Same boot ENR as 70.35.205.77 (Prysm hub 216.225.202.22).
BOOT_ENR="enr:-Mq4QJ9iokTaQWac4KmyRLWCCW5aTqhZEOekgnk8krEZvnwQcSjPI5BD9GXr9dXltQF6wMUF5vNNxGreRjt-vU0j1gWGAaCc6Czeh2F0dG5ldHOIAwAAAAAAAACEZXRoMpBuufdeIAAAkwBMBgAAAAAAgmlkgnY0gmlwhNjhyhaEcXVpY4IyyIlzZWNwMjU2azGhAwNuofZfI-D_EPXyfXWaaPS3WfJ8HGa8DDHqqvU-l90_iHN5bmNuZXRzD4N0Y3CCEGiDdWRwghDM"

# One 32-block batch per 30 s per peer.
SELF_LIMIT="${LIGHTHOUSE_SELF_LIMIT:-beacon_blocks_by_range:32/30}"

EXTRA_ARGS=()
if [ "${LIGHTHOUSE_GENESIS_BACKFILL:-0}" = "1" ]; then
  EXTRA_ARGS+=(--genesis-backfill)
fi

exec "$BASE/bin/lighthouse-v5.3.0-conet" bn \
  --testnet-dir "$BASE/testnet-conet" \
  --datadir "$BASE/data-conet-v5" \
  --execution-endpoint "$EXECUTION_ENDPOINT" \
  --execution-jwt "$EXECUTION_JWT" \
  --checkpoint-sync-url http://216.225.202.22:4100 \
  --boot-nodes "$BOOT_ENR" \
  --self-limiter-protocols "$SELF_LIMIT" \
  --http --http-address 127.0.0.1 --http-port 5100 \
  --port 5200 --discovery-port 5300 --quic-port 5301 \
  --listen-address 0.0.0.0 \
  --enr-address 38.49.214.149 \
  --enr-tcp-port 5200 --enr-udp-port 5300 \
  --disable-upnp \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
