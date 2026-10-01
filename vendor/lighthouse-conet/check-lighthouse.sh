#!/usr/bin/env bash
# Read-only health check for the CoNET Lighthouse beacon node.
# Run it ON the node (it talks to 127.0.0.1 and reads the local debug log).
# It never restarts, edits, or deletes anything.
#
#   ./check-lighthouse.sh            # one report
#   WATCH_MIN=15 ./check-lighthouse.sh   # sample peers every 6 s for 15 min
#
# Exit code: 0 healthy, 1 warning, 2 failing. See RUNBOOK.md for what to do.
set -uo pipefail

BASE="${LIGHTHOUSE_BASE:-/home/peter/lighthouse-conet}"
API="${LIGHTHOUSE_API:-http://127.0.0.1:5100}"
LOG="$BASE/data-conet-v5/beacon/logs/beacon.log"
SERVICE="${LIGHTHOUSE_SERVICE:-conet-lighthouse.service}"
MIN_PEERS="${MIN_PEERS:-8}"      # reference node 70.35.205.77 holds ~16
WATCH_MIN="${WATCH_MIN:-0}"

rc=0
warn() { echo "WARN  $*"; [ "$rc" -lt 1 ] && rc=1; }
fail() { echo "FAIL  $*"; rc=2; }
ok()   { echo "ok    $*"; }

for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing $bin" >&2; exit 2; }
done

echo "== $(date -u +%FT%TZ) $(hostname)"

# 1. service state. "activating (auto-restart)" means a crash loop, usually a
#    flag the binary rejected. Read the journal for the real error.
state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
if [ "$state" = "active" ]; then
  ok "service $SERVICE active"
else
  fail "service $SERVICE is '$state' (crash loop? run: journalctl -u $SERVICE -n 30 --no-pager -o cat)"
fi

# 2. peers and sync
peers=$(curl -s --max-time 5 "$API/eth/v1/node/peer_count" | jq -r '.data.connected // empty')
sync=$(curl -s --max-time 5 "$API/eth/v1/node/syncing" | jq -c '.data // empty')
if [ -z "$peers" ] || [ -z "$sync" ]; then
  fail "beacon API $API not answering"
else
  dist=$(echo "$sync" | jq -r '.sync_distance')
  opt=$(echo "$sync" | jq -r '.is_optimistic')
  eloff=$(echo "$sync" | jq -r '.el_offline')
  if   [ "$peers" -eq 0 ];            then fail "peers=0"
  elif [ "$peers" -lt "$MIN_PEERS" ]; then warn "peers=$peers (< $MIN_PEERS)"
  else ok "peers=$peers"; fi
  if [ "$dist" -le 2 ] && [ "$opt" = "false" ] && [ "$eloff" = "false" ]; then
    ok "synced: sync_distance=$dist optimistic=$opt el_offline=$eloff"
  else
    warn "sync_distance=$dist optimistic=$opt el_offline=$eloff"
  fi
fi

# 3. backfill progress. oldest_block_slot must fall over time.
oldest=$(curl -s --max-time 5 "$API/lighthouse/database/info" | jq -r '.anchor.oldest_block_slot // empty')
if [ -n "$oldest" ]; then
  if [ "$oldest" = "0" ]; then ok "backfill complete (oldest_block_slot=0)"
  else ok "backfill in progress, oldest_block_slot=$oldest (compare with an earlier run; it must fall)"; fi
fi

# 4. debug log since the last start. The journal only has info level; the
#    reasons for a peer being dropped are only in this file.
if [ -r "$LOG" ]; then
  start=$(grep -an "Lighthouse started" "$LOG" | tail -1 | cut -d: -f1)
  start=${start:-1}
  since() { sed -n "${start},\$p" "$LOG"; }
  rl=$(since | grep -ac "reason: rate limited")
  if [ "$rl" -eq 0 ]; then ok "rate limited replies since start: 0"
  elif [ "$rl" -le 20 ]; then warn "rate limited replies since start: $rl (the reference node saw 16 in 3.5 h; burst at start is tolerable)"
  else fail "rate limited replies since start: $rl. Prysm is striking our peer id. Stop restarting; reduce per-peer request pace (RUNBOOK 'Peers fall to 0')"; fi
  echo "      goodbyes since start (Fault from hub instances that do not whitelist this IP is expected and harmless):"
  since | grep -a "Peer sent Goodbye" | grep -aoE "reason: [A-Za-z]+" | sort | uniq -c | sed 's/^/        /'
  echo "      who sent Fault/Banned (top 8):"
  since | grep -a "Peer sent Goodbye" | grep -aoE "reason: (Fault|Banned), peer_id: [A-Za-z0-9]+" | sed -E 's/reason: ([A-Za-z]+), peer_id: /\1 /' | sort | uniq -c | sort -rn | head -8 | sed 's/^/        /'
else
  warn "cannot read $LOG"
fi

# 5. recent restarts / key rotations. Repeated restarts caused the 2026-10-01 incident.
backups=$(ls -d "$BASE"/data-conet-v5/beacon/network-bak-* 2>/dev/null | wc -l)
[ "$backups" -gt 2 ] && warn "$backups network key backups exist: the peer key has been rotated $backups times. Do not rotate again without a measured reason."

# 6. optional sampling
if [ "$WATCH_MIN" -gt 0 ]; then
  echo "== sampling peers every 6 s for $WATCH_MIN min"
  end=$(( $(date +%s) + WATCH_MIN * 60 ))
  min=999999; max=0; n=0
  while [ "$(date +%s)" -lt "$end" ]; do
    p=$(curl -s --max-time 3 "$API/eth/v1/node/peer_count" | jq -r '.data.connected // empty')
    if [ -n "$p" ]; then
      n=$((n+1)); [ "$p" -lt "$min" ] && min=$p; [ "$p" -gt "$max" ] && max=$p
    fi
    sleep 6
  done
  echo "      samples=$n min=$min max=$max"
  [ "$n" -gt 0 ] && [ "$min" -eq 0 ] && fail "peers touched 0 during the window"
  [ "$n" -gt 0 ] && [ "$min" -gt 0 ] && [ "$min" -lt "$MIN_PEERS" ] && warn "peers dipped to $min during the window"
fi

exit "$rc"
