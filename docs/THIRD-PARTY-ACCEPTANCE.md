# bridgeAAC Third-Party Acceptance Guide

This guide defines the acceptance evidence for `bridge-aac-v0.33.5`.
It covers the current production stage only:

```text
Shadow read-only
Base L1 anchor verification
custody closed
```

It does not authorize minting, release, settlement broadcasting, or miner-vote
cutover.

## 1. Download and verify the release

Use a Linux `x86_64` host. Do not use a macOS Mach-O binary as an AAC node.

```bash
curl -fL -o bridge-aac-0.33.5-linux-x86_64 \
  https://github.com/CoNET-project/bridgeAAC/releases/download/bridge-aac-v0.33.5/bridge-aac-0.33.5-linux-x86_64

sha256sum bridge-aac-0.33.5-linux-x86_64
file bridge-aac-0.33.5-linux-x86_64
```

Required SHA-256:

```text
86c8b7f8719f04eef4a4581ee68b079206cac8f04fb6f5a41d45ae446a1bf4d5
```

The artifact must be a Linux `x86_64` ELF executable.

## 2. Verify the source release

```bash
git clone --branch bridge-aac-v0.33.5 \
  https://github.com/CoNET-project/bridgeAAC.git
cd bridgeAAC
./scripts/preflight-shadow.sh
```

The preflight result must be:

```text
preflight accepted bridge-aac-v0.33.5
```

## 3. Verify two independent Base readers

Each reader must return Base chain ID `8453`. The two URLs must represent
independent reader paths; do not repeat one URL through different schemes or
proxies to manufacture quorum.

```bash
./bridge-aac-0.33.5-linux-x86_64 base-quorum-reader \
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
./bridge-aac-0.33.5-linux-x86_64 base-l1-output \
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
./bridge-aac-0.33.5-linux-x86_64 check-header \
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

When a receipt and Merkle proof are available:

```bash
./bridge-aac-0.33.5-linux-x86_64 verify-receipt \
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
reader-lag 0
cursor-lag 0
stable yes
heartbeat yes
```

The page state must be:

```bash
cat /var/lib/bridge-aac-prod/page.txt
```

Expected:

```text
page clear
```

`page open` or `alert reader-lag` means the deployment is running but has not
passed acceptance.

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
