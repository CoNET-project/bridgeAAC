#!/bin/sh
# Notify a webhook when the bridgeAAC Shadow page opens or clears.
# It posts only on a transition, so a page that stays open sends one message.
# If the post fails, the state is not updated and the next run retries.
set -eu
PAGE_FILE="${BRIDGE_AAC_PAGE_FILE:-/var/lib/bridge-aac-prod/page.txt}"
STATE_FILE="${BRIDGE_AAC_NOTIFY_STATE:-/var/lib/bridge-aac-prod/page-notify.state}"
URL="${BRIDGE_AAC_NOTIFY_URL:?BRIDGE_AAC_NOTIFY_URL is not set}"
HOST="$(hostname)"

if grep -q '^page open' "$PAGE_FILE"; then
  current=open
else
  current=clear
fi
previous=clear
if [ -f "$STATE_FILE" ]; then
  previous="$(cat "$STATE_FILE")"
fi
[ "$current" = "$previous" ] && exit 0

alerts="$(grep '^alert ' "$PAGE_FILE" | tr '\n' ' ' || true)"
if [ "$current" = open ]; then
  text="bridgeAAC shadow on ${HOST}: page open ${alerts}"
else
  text="bridgeAAC shadow on ${HOST}: page clear"
fi
body="$(printf '{"text": "%s"}' "$text")"
curl -fsS -m 20 -H 'content-type: application/json' --data "$body" "$URL" >/dev/null
printf '%s\n' "$current" > "$STATE_FILE"
