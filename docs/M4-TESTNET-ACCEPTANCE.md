# M4 Testnet Acceptance Record

Status: **testnet pipeline passed; mainnet custody remains closed**.

## Base Sepolia

### Receipt MPT verifier

| Item | Value |
|---|---|
| Network | Base Sepolia `84532` |
| Address | `0x622A4A21678C7944a244006350F9f862C39de691` |
| Runtime code | 4059 bytes |
| Verification | Sourcify `exact_match` |

### L1 anchor relay

| Item | Value |
|---|---|
| Address | `0xbc7CddFdba33348357aFE5F290f242ecBbc1C090` |
| Registry | `0x909f6cf47ed12f010A796527f562bFc26C7F4E72` |
| Signer threshold | `1` test signer |
| Custody | closed |

### Base finality orchestration

| Item | Value |
|---|---|
| Header relay | `0x4E321225203276ee4a22e335f450d7ae221AbE88` |
| `AacBaseFinalityVerifier` | `0xcb85296A6Dc978c32b1d58a1C804d995cd6F7B09` |
| Test result | `verifyHeader` passed |
| Verification | Sourcify `exact_match` |

## CoNET testnet-only pipeline

The CoNET network has no separate testnet in this deployment, so the following
contracts were deployed on CoNET with an explicit testnet-only boundary and no
asset roles:

| Item | Value |
|---|---|
| Chain | CoNET `224422` |
| Sync committee relay | `0xC30371d520Ac0C93d21CF9b1Bd6cea45185Dd07d` |
| `AacConetFinalityVerifier` | `0xC72796C9478089816aC916AC5Fb7E5d5ffddd4Ad` |
| Genesis validators root | `0xacac7566fdf384a1ada45c01dcf9030d7eb0e1e5f5302659101d0b2a5bb59092` |
| Test attestation | `342 / 512`, threshold `1` |
| Test result | `verifyFinality` passed |
| Custody | closed |

Sourcify currently rejects chain `224422` with HTTP 400; these deployments
remain unverified by Sourcify and are not production-authorized.

## Base Sepolia payload-bound mock pipeline

This pipeline uses the V2 consumer with mock finality and receipt verifiers.
It proves consume-once wiring and payload binding. It does not prove a
trustless light client, and it does not move canonical assets.

| Item | Value |
|---|---|
| Consumer | `0xa7CB78dDC105AB8afC921d2693897a4D0cDCf309` |
| Mock finality | `0x3977f35c531895CeD50fAf5e02bd9e7EB890D2D1` |
| Mock receipt verifier | `0x6733591d6F480A3DEfB6C29E788DEfedff01a42B` |
| Treasury adapter / target | `0xC0eE75027BF11fb43b89eE27E36303e00715c421` / `0xEb95B6fbC747838BBF3D88758034E0F169190793` |
| GB adapter / target | `0x383F1B8ABABbA54016c8c87E3Da01F3Dd65984ac` / `0xb1FeF0c828Bc4895f92d17f56C2bed18d0FcE3a7` |
| Treasury consume | `0x31838ac92df85f8bac527989fa47113bd1caa901fd7adddc2b310f9f4471d17c` |
| GB consume | `0x3d8b1b89e63b7936118667c917125807f1b6ce8fd22ad6970abf475b69b34096` |
| Result | both consumed once; target counters are `1`; replay calls revert |
| Verification | Sourcify `match` on creation and runtime for all seven contracts |
| Custody | closed |

## Explicit limits

- All relay attestations above are dummy testnet evidence.
- No TreasuryBridgeV3, GBToken, Peer, mint, release, or settlement role was
  assigned.
- No mainnet consumer was deployed.
- Passing `verifyHeader` proves ABI wiring and fail-closed orchestration only;
  it does not prove a trustless Ethereum or CoNET light client.
