# CoNET Lighthouse RUNBOOK — current runtime and recovery

Applies to the parallel Lighthouse beacon node on `38.49.214.149`
(`conet-lighthouse.service`) and to any new CoNET Lighthouse node. Read this
before changing a flag or restarting Lighthouse. The launcher and health-check
scripts in this directory are the operational source of truth; `README.md`
records the pinned build.

The current design deliberately matches the healthy `70.35.205.77` node:
default discovery, one boot ENR, and the binary's default target peer count.
The only intentional differences are this host's ports and its dedicated
execution client.

Files in this directory:

| File | Purpose |
|---|---|
| `start-lighthouse.sh` | The only start script. Deployed to `/home/peter/lighthouse-conet/start-lighthouse.sh`. |
| `check-lighthouse.sh` | Read-only health check. Run it on the node. |
| `patches/0001-conet-eth1-voting-period.patch` | The CoNET consensus constants patch. |
| `README.md` | Pinned version, build, deployed checksum. |

## 1. What this node is

- A consensus client only. It uses a dedicated Lighthouse execution client
  and a checkpoint from a Prysm hub.
- It sits next to Prysm on the same IP. That matters for P2P colocation
  (section 4), but the two consensus clients must not share execution state.
- It is not a validator. Never attach it to another host's Engine API and
  never copy another operator's chain data, JWT, or beacon database.

## 2. Before you start

1. Prysm's execution client remains isolated at its own endpoint (normally
   `http://127.0.0.1:8551`).
2. Lighthouse's companion execution client is running and its Engine API
   answers at `LIGHTHOUSE_EXECUTION_ENDPOINT` (default
   `http://127.0.0.1:8552`) with `LIGHTHOUSE_EXECUTION_JWT` (default
   `/home/peter/lighthouse-conet/jwtsecret`).
3. Prysm and Lighthouse use different execution datadirs, Engine API ports,
   JWT files, and execution P2P/discovery ports. Do not point Lighthouse at
   Prysm's `8551`, JWT, or datadir.
4. UFW allows `5200/tcp`, `5300/udp`, `5301/udp` (and `5100/tcp` only if you
   need the API off-box; it binds to `127.0.0.1`).
5. The clock is synchronised (`timedatectl show -p NTPSynchronized`).
6. You know why you are starting it. A restart is not a diagnostic tool
   (section 3, rule 2).
7. Any flag you plan to change was checked against the installed binary:
   `bin/lighthouse-v5.3.0-conet bn --help | grep -- <flag>`. v5.3.0 has no
   `--disable-discovery`, and quota names must be protocol names such as
   `beacon_blocks_by_range`.

### 2a. Execution client / Engine API isolation

The required topology is:

```text
Prysm      -> Prysm Geth       -> 127.0.0.1:8551
Lighthouse -> Lighthouse Geth -> 127.0.0.1:8552
```

Each Geth instance must have its own:

- execution datadir and chain database;
- Engine API port and JWT file;
- execution P2P/discovery port (for example `8400` and `8401`).

The Lighthouse start script enforces this boundary. Its defaults are:

```bash
LIGHTHOUSE_EXECUTION_ENDPOINT=http://127.0.0.1:8552
LIGHTHOUSE_EXECUTION_JWT=/home/peter/lighthouse-conet/jwtsecret
PRYSM_EXECUTION_ENDPOINT=http://127.0.0.1:8551
PRYSM_EXECUTION_JWT=/home/peter/conet-l1/jwtsecret
```

It refuses to start when the Lighthouse and Prysm endpoint or JWT path are
identical. Changing only the Lighthouse URL without first starting the
matching Lighthouse Geth leaves `el_offline=true`; that is an incomplete
deployment, not a successful isolation.

The launcher refuses to start if the Lighthouse and Prysm Engine API endpoint
or JWT path is identical. This prevents accidentally reconnecting Lighthouse
to Prysm's execution client. A different URL alone is not sufficient: the
companion Lighthouse execution client, its datadir, JWT, systemd unit and
P2P ports must also be live. The 2026-10-03 acceptance reassessment recorded
Lighthouse on `127.0.0.1:8552`; because host credentials are not available for
continuous re-probing, every deployment must still verify the live command
lines with `check-lighthouse.sh`.

### 2b. Current launcher contract

Unless explicitly overridden by environment variables, `start-lighthouse.sh`
uses:

| Item | Current value |
|---|---|
| Binary | `bin/lighthouse-v5.3.0-conet` |
| Testnet config | `testnet-conet` |
| Data directory | `/home/peter/lighthouse-conet/data-conet-v5` |
| HTTP API | `127.0.0.1:5100` |
| P2P TCP | `0.0.0.0:5200` |
| Discovery UDP | `0.0.0.0:5300` |
| QUIC UDP | `0.0.0.0:5301` |
| Checkpoint sync | `http://216.225.202.22:4100` |
| Boot ENR | Prysm hub `216.225.202.22` |
| Per-peer limiter | `beacon_blocks_by_range:32/30` |
| Genesis backfill | Off by default; enable with `LIGHTHOUSE_GENESIS_BACKFILL=1` |

Do not add `--libp2p-addresses`, `--trusted-peers`, or a hand-written
`--target-peers` value to this launcher. Those options were the cause of the
peer-collapse incident, not a recovery mechanism.

## 3. Start and change procedure

Never edit the script on the host. The repository copy is the source of truth.

1. Edit the scripts in the repository, run `bash -n`, commit, and push.
2. Deploy only the published scripts to the host. Keep
   `start-lighthouse.sh.bak-<UTC>` and `check-lighthouse.sh.bak-<UTC>`.
3. A Lighthouse restart requires explicit operator approval for this host.
   When approved, restart only `conet-lighthouse.service`; do not stop or
   restart Geth, Prysm, validators, or hubs.
4. Within 25 s run `systemctl is-active conet-lighthouse.service`. If it says
   `activating`, the service is crash-looping. Read
   `journalctl -u conet-lighthouse.service -n 30 --no-pager -o cat` and fix the
   flag. (A wrong quota protocol name once produced
   `Wrong protocol representation in quota` and a restart loop.)
5. Run `./check-lighthouse.sh`, then `WATCH_MIN=15 ./check-lighthouse.sh`.
   Do not call a change good from one snapshot. Peers rise at start and can
   fall minutes later.

Never edit `start-lighthouse.sh`, `check-lighthouse.sh`, or `dist` directly on
the host. If a live file differs from the pushed repository version, preserve
the host copy as an evidence/backup file and correct it from the repository.

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
   explicit authorisation. The Prysm on this same host is covered in
   section 5a.
5. **Read the debug log, not the journal.** The journal is info level. Peer
   drop reasons (`Peer sent Goodbye`, `RPC Error ... rate limited`,
   `Peer Manager disconnecting peer`) are only in
   `data-conet-v5/beacon/logs/beacon.log`.
6. **Compare with a healthy node before inventing a cause.** Pull the peer
   list, flags and Goodbye reasons from `70.35.205.77` first. That comparison
   found in minutes what hours of config guessing missed.
7. **Do not touch hubs, Geth, Prysm or validators from a Lighthouse task.**
   Any chain-infrastructure restart needs explicit written approval in the same
   message. A Lighthouse-only restart is still an operational change and must
   be approved before execution.
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

## 5a. The Prysm on the same host (`conet-beacon.service`)

It shares the IP with Lighthouse, so it applied the same colocation rule and
answered Lighthouse with `Goodbye(Fault/Banned)`.

Change made on 2026-10-01 (explicitly authorised, only `conet-beacon.service`
restarted; no validator runs on this host):

- `/home/peter/conet-l1/start-beacon.sh` got one more flag,
  `--p2p-colocation-whitelist=38.49.214.149/32`.
- Backup: `/home/peter/conet-l1/start-beacon.sh.bak.whitelist.20261001T050621Z`.
- After the restart Prysm was `active`, `sync_distance=0`, 8 peers, and it
  accepted Lighthouse. Check the flag is live with
  `tr '\0' ' ' < /proc/$(pgrep -f prysm.sh | head -1)/cmdline | grep -o 'p2p-colocation-whitelist=[0-9./]*'`.
  (`pgrep -af beacon-chain` does not show the flag; the process is `prysm.sh`.)

Expected, not a fault: Lighthouse bans this local Prysm during backfill.
It was checkpoint-synced, so it has no blocks before its checkpoint and
answers backfill requests with `Resource unavailable`; Lighthouse scores that
-100 and bans the peer. Lighthouse keeps its other peers, so ignore it. Do not
lower Lighthouse's scoring or pin this peer to "fix" it.

If you add more nodes to this host, add the same whitelist flag to every Prysm
instance on it, and expect the same colocation refusal from any hub instance
that does not list this IP.

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
