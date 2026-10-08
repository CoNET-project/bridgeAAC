# bridgeAAC Third-Party Acceptance Guide

This guide defines the acceptance evidence for `bridge-aac-v0.33.7`.
Use the [v0.33.7 GitHub Release](https://github.com/CoNET-project/bridgeAAC/releases/tag/bridge-aac-v0.33.7)
as the artifact source.
It covers the current production stage only:

```text
Shadow read-only
Base L1 anchor verification
custody closed
```

It does not authorize minting, release, settlement broadcasting, or miner-vote
cutover.

## L1 claim-validation fix (v0.33.5+)

Use v0.33.5 or newer. v0.33.4 must not be used for acceptance because it sent
`isGameClaimValid(game)` to the dispute-game contract. The correct call sends
the selector to the pinned `AnchorStateRegistry` and passes the current anchor
game as its argument:

```text
AnchorStateRegistry.isGameClaimValid(anchorGame)
```

The dispute-game contract and OptimismPortal are not valid targets for this
selector. A valid acceptance should therefore show the registry call
returning true rather than a game/portal revert.

## CoNET custody gate status

The current CoNET observer is intentionally fail-closed. A sync aggregate from
one operator's beacon is not an independent consensus root. The CoNET custody
gate requires all of the following before it can ever pass:

```text
beacon-agreed
genesis-pin
state-root-binding
committee-handoff
aggregate-verify
sync-quorum
trusted-committee
forced-updates = 0
independent-confirmations >= 3
```

Current reports may still show `trusted-committee no` and `custody closed`;
that is an expected non-acceptance result, not a reason to bypass the gate.

## M3. Deploy an independent CoNET finality confirmer

M3 is a separate deployment milestone. It lets a third party produce a local
CoNET weak-subjectivity confirmation; it does not open custody.

The confirmer must run on a Linux host controlled by the third party. Do not
reuse the operator's beacon database, peer identity, Engine API, JWT, or
validator process. Follow the Lighthouse configuration in
[`vendor/lighthouse-conet/RUNBOOK.md`](../vendor/lighthouse-conet/RUNBOOK.md).

The beacon node must include both historical options:

```text
--genesis-backfill
--reconstruct-historic-states
```

Use a dedicated local Engine API and JWT. No validator is required for this
read-only confirmer. Do not restart Geth or Validator as part of this step.

### M3.1 Historical state availability

The block header alone is not enough. The local beacon must serve the
historical state needed by period 18:

```bash
curl -sS -o /tmp/period18-state \
  -w 'HTTP %{http_code} bytes %{size_download}\n' \
  http://127.0.0.1:5052/eth/v2/debug/beacon/states/155645
```

HTTP 404 means the confirmer is not ready. Do not submit an external SSZ file
as if it were locally verified. Wait until historical state reconstruction
serves the state successfully.

### M3.2 Produce the local confirmation

```bash
./bridge-aac-0.33.7-linux-x86_64 confirm-checkpoint \
  --beacon http://127.0.0.1:5052 \
  --period 18 \
  --out /tmp/aac-confirmation-<operator>.json
```

The output must include:

```text
weak-subjectivity-confirmation
proofs yes
trusted-committee no
custody-gate no
custody closed
```

`trusted-committee no` is expected for the current M3 confirmation artifact.
It means the artifact is evidence for the multi-party gate, not a custody
authorization.

### M3.3 Combine independent confirmations

One operator creates the period-18 candidate checkpoint. Other operators run
the command above against their own local beacon and return their confirmation
JSON. The candidate owner combines them:

```bash
./bridge-aac-0.33.7-linux-x86_64 accept-confirmations \
  --checkpoint /path/to/aac-weak-subjectivity-period18.json \
  --confirmation /path/to/confirmation-operator-a.json \
  --confirmation /path/to/confirmation-operator-b.json \
  --confirmation /path/to/confirmation-operator-c.json
```

M3 requires:

```text
confirmations >= 3
rejected 0
safety weak-subjectivity-trusted
```

The signers must be distinct and controlled by independent operators. Multiple
hosts belonging to one operator do not satisfy the independence requirement.
At least one confirmer should use a non-Prysm client, such as Lighthouse.

M3 remains failed if any of these are true:

```text
historical state HTTP 404
forced-updates > 0
trusted-committee no for a custody decision
confirmations < 3
duplicate signer
```

## 1. Download and verify the release

Use a Linux `x86_64` host. Do not use a macOS Mach-O binary as an AAC node.

```bash
curl -fL -o bridge-aac-0.33.7-linux-x86_64 \
  https://github.com/CoNET-project/bridgeAAC/releases/download/bridge-aac-v0.33.7/bridge-aac-0.33.7-linux-x86_64

sha256sum bridge-aac-0.33.7-linux-x86_64
file bridge-aac-0.33.7-linux-x86_64
```

Required SHA-256:

```text
b33a7b7cf38ea704baa2e2730b60987d4f09c104fed10f1abca041269e6819ec
```

The artifact must be a Linux `x86_64` ELF executable.

## 2. Verify the source release

```bash
git clone --branch bridge-aac-v0.33.7 \
  https://github.com/CoNET-project/bridgeAAC.git
cd bridgeAAC
./scripts/preflight-shadow.sh
```

The preflight result must be:

```text
preflight accepted bridge-aac-v0.33.7
```

## 3. Verify two independent Base readers

Each reader must return Base chain ID `8453`. The two URLs must represent
independent reader paths; do not repeat one URL through different schemes or
proxies to manufacture quorum.

```bash
./bridge-aac-0.33.7-linux-x86_64 base-quorum-reader \
  --rpc <base-reader-1> \
  --rpc <base-reader-2> \
  --from <deployment-floor> \
  --blocks 128
```

The evidence must not contain:

```text
quorum no
reader-lag
rpc no
```

## 4. Verify the Ethereum L1 output anchor

```bash
./bridge-aac-0.33.7-linux-x86_64 base-l1-output \
  --l1-rpc <ethereum-l1-rpc> \
  --base-rpc <base-rpc>
```

For the selected Base block, the report must show:

```text
l1-anchor yes
covered yes
execution-ahead no
```

Then verify the block through the L1-bound finality path:

```bash
./bridge-aac-0.33.7-linux-x86_64 check-header \
  --chain base \
  --rpc <base-rpc> \
  --l1-rpc <ethereum-l1-rpc> \
  --level finalized \
  --header <covered-block-hash>
```

Required fields:

```text
header-check l1-anchor
final true
light-client no
```

`light-client no` is expected for this stage. It means the check uses the
current L1 output-anchor adapter, not a complete fault-proof light client.

## 5. Verify a receipt proof

Use a real Base transaction in a block at or below `anchor-l2`. The release
includes an exporter that obtains all block receipts, builds the Ethereum
receipt-trie proof, and binds the selected header to the Ethereum L1 anchor:

First obtain the current anchor height and choose a successful transaction from
that covered block. Do not choose a transaction from the current Base head when
the head is ahead of the L1 anchor:

```bash
ANCHOR_REPORT="$(./bridge-aac-0.33.7-linux-x86_64 base-l1-output \
  --l1-rpc <ethereum-l1-rpc> --base-rpc <base-rpc>)"
ANCHOR_L2="$(printf '%s\n' "$ANCHOR_REPORT" | awk '$1=="anchor-l2" {print $2; exit}')"
BLOCK_HEX="$(printf '0x%x' "$ANCHOR_L2")"
TX_HASH="$(curl -fsS -H 'content-type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockReceipts\",\"params\":[\"$BLOCK_HEX\"]}" \
  <base-rpc> | jq -r '.result | map(select(.status=="0x1")) | .[0].transactionHash')"
```

For an AAC-specific acceptance, select a transaction whose receipt contains a
TreasuryBridgeV3 or GB bridge event, rather than an unrelated successful
transaction.

```bash
./bridge-aac-0.33.7-linux-x86_64 export-receipt-proof \
  --rpc <base-rpc> \
  --l1-rpc <ethereum-l1-rpc> \
  --tx "$TX_HASH" \
  --out receipt-proof.json
```

The command must print:

```text
header-check l1-anchor
inclusion yes
final true
custody closed
```

The generated JSON contains the header hash, receipt index, encoded receipt,
receipts root, and proof nodes. It can also be checked with the lower-level
command:

```bash
./bridge-aac-0.33.7-linux-x86_64 verify-receipt \
  --chain base \
  --rpc <base-rpc> \
  --l1-rpc <ethereum-l1-rpc> \
  --header <covered-block-hash> \
  --index <receipt-index> \
  --receipt <receipt-rlp> \
  --proof <proof-node-1>,<proof-node-2>
```

Required fields:

```text
header-check l1-anchor
inclusion yes
final true
```

## 6. Run the Shadow acceptance service

Configure `/etc/default/bridge-aac-shadow-prod` with two independent Base
readers and two CoNET readers. Verify Base chain ID `8453` and CoNET chain ID
`224422` before starting the service.

```bash
sudo systemctl enable --now bridge-aac-shadow-prod.service
systemctl is-active bridge-aac-shadow-prod.service
```

The final stable report must contain:

```text
shadow yes
broadcast no
settled no
custody closed
cursor-lag 0
stable yes
heartbeat yes
```

`reader-lag-warning yes` may appear during a finalized-tip transition; it is
advisory only when the lower finalized range continues to pass quorum and root
checks. It must not be confused with `quorum no`, `root-match no`, or a
blocking `cursor-lag`.

The page state must be:

```bash
cat /var/lib/bridge-aac-prod/page.txt
```

Expected:

```text
page clear
```

`page open`, `alert quorum`, `alert inclusion`, `alert rpc`, `alert cursor`, or
blocking `alert cursor-lag` means the deployment has not passed acceptance.

## 7. Submit the evidence

Submit the following in a GitHub issue or an acceptance document:

```text
operator:
host:
public_ip:
release_tag:
commit:
peer_id:
artifact_sha256:
base_reader_1:
base_reader_2:
conet_reader_1:
conet_reader_2:
l1_anchor:
covered:
header_check:
receipt_inclusion:
reader_lag:
cursor_lag:
stable:
page:
custody:
```

Attach the `base-l1-output`, `check-header`, `verify-receipt` (if available),
final Shadow log, and `page.txt`.

Do not submit private keys, JWT secrets, mnemonics, RPC credentials, or other
secret material.

## 8. Independence requirement

The third party must run the checks from a host and reader path it controls.
Multiple nodes operated by the same organization provide consistency and
availability evidence, but do not alone constitute an independent security
confirmation.
