# CoNET Lighthouse runbook (start guide and lessons)

Applies to the parallel Lighthouse beacon node on `38.49.214.149`
(`conet-lighthouse.service`) and to any new CoNET Lighthouse node. Read this
before you start, restart, or "fix" one. Build details are in `README.md`.

Files in this directory:

| File | Purpose |
|---|---|
| `start-lighthouse.sh` | The only start script. Deployed to `/home/peter/lighthouse-conet/start-lighthouse.sh`. |
| `check-lighthouse.sh` | Read-only health check. Run it on the node. |
| `patches/0001-conet-eth1-voting-period.patch` | The CoNET consensus constants patch. |
| `README.md` | Pinned version, build, deployed checksum. |

## 1. What this node is

- A consensus client only. It uses the local geth Engine API
  (`127.0.0.1:8551`) and a checkpoint from a Prysm hub.
- It sits next to Prysm and geth on the same IP. That matters (section 4).
- It is not a validator. Never attach it to another host's Engine API and
  never copy another operator's chain data, JWT, or beacon database.

## 2. Before you start

1. geth is running and its Engine API answers on `127.0.0.1:8551` with the
   JWT at `/home/peter/lighthouse-conet/jwtsecret`.
2. UFW allows `5200/tcp`, `5300/udp`, `5301/udp` (and `5100/tcp` only if you
   need the API off-box; it binds to `127.0.0.1`).
3. The clock is synchronised (`timedatectl show -p NTPSynchronized`).
4. You know why you are starting it. A restart is not a diagnostic tool
   (section 3, rule 2).
5. Any flag you plan to change was checked against the installed binary:
   `bin/lighthouse-v5.3.0-conet bn --help | grep -- <flag>`. v5.3.0 has no
   `--disable-discovery`, and quota names must be protocol names such as
   `beacon_blocks_by_range`.

## 3. Start and change procedure

Never edit the script on the host. The repository copy is the source of truth.

1. Edit `start-lighthouse.sh` in the repository, run `bash -n`, commit, push.
2. `scp` the pushed file to the node, keep a `start-lighthouse.sh.bak-<UTC>`.
3. `sudo systemctl restart conet-lighthouse.service` (this stops and starts
   only Lighthouse; geth, Prysm and validators are untouched).
4. Within 25 s run `systemctl is-active conet-lighthouse.service`. If it says
   `activating`, the service is crash-looping. Read
   `journalctl -u conet-lighthouse.service -n 30 --no-pager -o cat` and fix the
   flag. (A wrong quota protocol name once produced
   `Wrong protocol representation in quota` and a restart loop.)
5. Run `./check-lighthouse.sh`, then `WATCH_MIN=15 ./check-lighthouse.sh`.
   Do not call a change good from one snapshot. Peers rise at start and can
   fall minutes later.

### Healthy means

- `peers` stays at or above 8 for at least 15 minutes. The reference node
  `70.35.205.77` holds about 16.
- `sync_distance` is 0 to 2, not optimistic, execution client online.
- `rate limited` replies since start are 0 (a handful at start is tolerable).
- `oldest_block_slot` keeps falling until backfill completes.

## 4. Hard rules (each one was a mistake)

1. **Keep default discovery and default `--target-peers`.** Use one boot ENR,
   as the reference node does. Do not pin a short peer list, do not use
   `--libp2p-addresses` or `--trusted-peers` to "stay on good hubs", and do
   not lower `--target-peers`. We tried pinning 6 peers; it concentrated
   backfill on a few hubs, they rate-limited us and banned our peer id.
2. **Do not restart repeatedly and do not rotate the peer key as a fix.** Each
   restart repeats the start-up request burst. The peer id lives in
   `data-conet-v5/beacon/network/key`; deleting it gives a clean id but if the
   cause is load, the new id is banned again within minutes. We rotated it six
   times in an hour for nothing. Rotate only after the load cause is removed,
   and back up the old key first.
3. **Backfill runs after checkpoint sync even without `--genesis-backfill`.**
   Prysm refuses roughly more than one 32-block batch per 30 s per peer,
   answers `rate limited`, strikes the peer id, then replies
   `Goodbye(Fault/Banned)` on every later connection. Keep per-peer pace low
   (`--self-limiter-protocols beacon_blocks_by_range:32/30`) and spread it over
   many peers. The reference node backfilled 1,551,776 blocks in about 27 h
   over about 16 peers and was never limited.
4. **Goodbye(Fault) from some hub instances is expected.** This host shares an
   IP with Prysm; hub instances that do not list `38.49.214.149` in
   `--p2p-colocation-whitelist` reject a second peer from one IP. As of
   2026-10-01 these are `38.102.126.58` (all), `38.102.126.50:4203/4204/4210`,
   `216.225.202.23:4201/4202` and `216.225.202.22:4210`. It is harmless while
   peers stay at 8 or more. Do not chase it from Lighthouse. The fix is a
   hub-side whitelist entry, which needs a production Prysm restart and
   explicit authorisation.
5. **Read the debug log, not the journal.** The journal is info level. Peer
   drop reasons (`Peer sent Goodbye`, `RPC Error ... rate limited`,
   `Peer Manager disconnecting peer`) are only in
   `data-conet-v5/beacon/logs/beacon.log`.
6. **Compare with a healthy node before inventing a cause.** Pull the peer
   list, flags and Goodbye reasons from `70.35.205.77` first. That comparison
   found in minutes what hours of config guessing missed.
7. **Do not touch hubs, geth, Prysm or validators from a Lighthouse task.**
   Restarting chain infrastructure needs explicit written approval in the same
   message.
8. **Local first.** Change the repository, push, then deploy the published
   file. No editing scripts or `dist` on the server.

## 5. Peers fall to 0

Work down the list. Stop at the first match.

1. `systemctl is-active conet-lighthouse.service` is not `active`: crash loop.
   Read the journal and fix the flag.
2. `check-lighthouse.sh` reports many `rate limited` replies or Fault/Banned
   from hub instances that do whitelist this IP (`:4200`, `.23/.30/.82/197.3`
   `:4210`): our peer id is being struck.
   - Stop restarting. Confirm the script is the current repository version
     (default discovery, default peers, `beacon_blocks_by_range:32/30`).
   - Wait. Strikes decay; with the right pace they do not return.
   - Only if peers stay at 0 after the pace is correct, rotate the key once
     (back it up) and watch 15 minutes.
3. Fault only from non-whitelisted instances while peers stay at 8 or more:
   normal, see rule 4.
4. `Wrong peer id` or dial errors to one hub: that hub changed its identity.
   Refresh the boot ENR from `http://<hub>:4100/eth/v1/node/identity`.
5. `Too many peers` or `Irrelevant` from the other side: check the fork digest
   in the Status lines against a hub.

Useful read-only commands (on the node):

```bash
LOG=/home/peter/lighthouse-conet/data-conet-v5/beacon/logs/beacon.log
grep -a "Peer sent Goodbye" $LOG | grep -aoE "reason: [A-Za-z]+" | sort | uniq -c
grep -ac "reason: rate limited" $LOG
curl -s http://127.0.0.1:5100/eth/v1/node/peer_count | jq .data
curl -s http://127.0.0.1:5100/lighthouse/database/info | jq .anchor
```

## 6. Incident record: 2026-10-01, peers stuck at 0

Facts, in order:

1. Node showed `peers: 0`, `Sync state: Stalled`. Ports, UFW, fork digest and
   clock were fine.
2. The debug log showed Prysm hubs sending `Goodbye(Fault)` within about 10 ms
   of our Status, and `rate limited` on `beacon_blocks_by_range` right after
   start. Lighthouse scored each `rate limited` as -10 and dropped the peer.
3. Attempts, in order, with outcome:
   - Restart with a new key and `--target-peers 3`: peers rose, then fell to 0
     within minutes (backfill still ran).
   - Self limiter `blocks_by_range:48/1`: refused by the binary (wrong name).
   - Self limiter `beacon_blocks_by_range:48/1`, `64/8`, `32/10` with a new key
     each time: still rate limited.
   - Dial only six whitelisted hubs: worse, load concentrated.
4. The reference node `70.35.205.77` held 16 Prysm peers with no Fault in 3.5 h
   and 16 `rate limited` replies total. Its flags were almost identical to
   ours, but it had default discovery and default peers.
5. Fix: match the reference node (single boot ENR, default discovery and peer
   count), keep a gentle `beacon_blocks_by_range:32/30` cap, new key once. Result:
   `peers: 10` for 15 minutes straight, `rate limited` 0, sync_distance 0,
   backfill falling.

Cause: backfill load concentrated on too few peers (Prysm strikes above about
one 32-block batch per 30 s per peer), made worse by six restarts and key
rotations in one hour; plus same-IP colocation rejection by hub instances that
do not whitelist this host (harmless once enough other peers are connected).

What to do differently: use the reference node as the template, check flags
with `--help`, restart once per real change, observe 15 minutes with
`check-lighthouse.sh`, and read the debug log before guessing.
