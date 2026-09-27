use bridge_aac::{
    aligned_create_address, bindings, build_tree, create_address, execute_bridge_mint, plan, prove,
    reject_vote, settle_report, settle_reserved, AssetIntent, Deposit, DepositId, Error, Gateway,
    GbPool, HeaderCommitment, MockFinality, PeerCall, TestLedger,
};

const LOCK: &str = include_str!("../fixtures/base-lock-receipt.json");
const BURN: &str = include_str!("../fixtures/conet-burn-release.json");

fn amount(n: u8) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[31] = n;
    out
}

fn open_paid_gb() -> (Gateway<MockFinality>, bridge_aac::AacId) {
    let item = Deposit::try_new(
        AssetIntent::Gb { pool: GbPool::Paid },
        bindings::BASE_CHAIN_ID,
        bindings::CONET_CHAIN_ID,
        bindings::gb_token(),
        bindings::gb_token(),
        bindings::gb_token(),
        bindings::peer_v5(),
        amount(4),
        DepositId(amount(4)),
        [4u8; 32],
    )
    .unwrap();
    let tree = build_tree(&[item.leaf()]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    let header_hash = [8u8; 32];
    let mut finality = MockFinality::new();
    finality.accept(item.source_chain_id, header_hash, tree.root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            item,
            &HeaderCommitment {
                chain_id: bindings::BASE_CHAIN_ID,
                header_hash,
                state_root: tree.root,
            },
            &proof,
        )
        .unwrap();
    gateway.reserve(&id).unwrap();
    (gateway, id)
}

#[test]
fn lock_mint_credits_the_recipient_on_the_test_ledger() {
    let report = settle_report(LOCK, 0, Some(amount(0x44)), u128::MAX, None).unwrap();
    assert!(report.contains("source-fn initiateLockMint"));
    assert!(report.contains("dest-fn aacConsumeMint"));
    assert!(report.contains("voteBridgeMint no"));
    assert!(report.contains("voteBridgeOperation no"));
    assert!(report.contains("broadcast no"));
    assert!(report.contains("deployed no"));
    assert!(report.contains("final true"));
    assert!(report.contains("state minted"));
    assert!(report.contains("recipient-balance 1000000"));
}

#[test]
fn settle_report_omits_final_until_the_header_is_allowed() {
    let denied = settle_report(LOCK, 0, None, u128::MAX, None).unwrap();
    assert!(!denied.contains("final"));
    assert!(denied.contains("accepted no"));
    assert!(denied.contains("broadcast no"));
    assert!(denied.contains("state none"));
}

#[test]
fn short_circle_balance_leaves_the_aac_reserved() {
    let report = settle_report(BURN, 0, Some(amount(0x55)), 0, None).unwrap();
    assert!(report.contains("final true"));
    assert!(report.contains("state reserved"));
    assert!(report.contains("settled no"));
    assert!(report.contains("short-balance yes"));
    assert!(report.contains("broadcast no"));

    let paid = settle_report(BURN, 0, Some(amount(0x55)), 1_000_000, None).unwrap();
    assert!(paid.contains("dest-fn aacConsumeRelease"));
    assert!(paid.contains("state released"));
    assert!(paid.contains("recipient-balance 1000000"));
}

#[test]
fn execute_bridge_mint_consumes_only_a_reserved_paid_gb_aac() {
    let (mut gateway, id) = open_paid_gb();
    let mut ledger = TestLedger::new(0);
    assert_eq!(
        execute_bridge_mint(&mut gateway, &id, true, &mut ledger),
        Err(Error::RejectedInput)
    );
    assert!(gateway.is_reserved(&id));
    assert_eq!(ledger.balance(bindings::CONET_CHAIN_ID, bindings::gb_token(), bindings::peer_v5()), 0);

    execute_bridge_mint(&mut gateway, &id, false, &mut ledger).unwrap();
    assert!(!gateway.is_reserved(&id));
    assert_eq!(ledger.balance(bindings::CONET_CHAIN_ID, bindings::gb_token(), bindings::peer_v5()), 4);
    assert_eq!(execute_bridge_mint(&mut gateway, &id, false, &mut ledger), Err(Error::BadState));
}

#[test]
fn vote_names_and_non_gb_execute_are_rejected() {
    assert_eq!(reject_vote("voteBridgeMint"), Err(Error::RejectedInput));
    assert_eq!(reject_vote("voteBridgeOperation"), Err(Error::RejectedInput));
    assert_eq!(reject_vote("voteMintDeveloper"), Err(Error::RejectedInput));

    let item = Deposit::try_new(
        AssetIntent::UsdcLockMint,
        bindings::BASE_CHAIN_ID,
        bindings::CONET_CHAIN_ID,
        bindings::treasury_v3(),
        bindings::circle_usdc(),
        bindings::conet_usdc(),
        bindings::peer_v5(),
        amount(3),
        DepositId(amount(3)),
        [3u8; 32],
    )
    .unwrap();
    let tree = build_tree(&[item.leaf()]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    let header_hash = [2u8; 32];
    let mut finality = MockFinality::new();
    finality.accept(item.source_chain_id, header_hash, tree.root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            item,
            &HeaderCommitment {
                chain_id: bindings::BASE_CHAIN_ID,
                header_hash,
                state_root: tree.root,
            },
            &proof,
        )
        .unwrap();
    gateway.reserve(&id).unwrap();
    assert_eq!(
        execute_bridge_mint(&mut gateway, &id, false, &mut TestLedger::new(0)),
        Err(Error::RejectedInput)
    );
    assert!(gateway.is_reserved(&id));
    let planned = plan(&gateway.get(&id).unwrap().deposit).unwrap();
    assert_eq!(planned.dest_fn, "aacConsumeMint");
    settle_reserved(&mut gateway, &id, &mut TestLedger::new(0)).unwrap();
    assert!(!gateway.is_reserved(&id));
}

#[test]
fn create_erc20_addresses_match_only_at_the_same_nonce() {
    let token = PeerCall::CreateErc20 {
        name: "Lab".into(),
        symbol: "LAB".into(),
        decimals: 18,
        gb_bound: false,
    };
    let matched = aligned_create_address(
        &[PeerCall::Call, token.clone()],
        &[token.clone(), PeerCall::Call],
    )
    .unwrap();
    assert_eq!(matched, create_address(bindings::peer_v5(), 1));
    assert_eq!(
        matched,
        bridge_aac::Address::parse("0xd9b50802cd79292a2b231d50e820f0a201cfa9ae").unwrap()
    );
    let drifted = aligned_create_address(&[token.clone()], &[PeerCall::CreateOther, token]);
    assert_eq!(drifted, Err(Error::NonceMismatch));
}

#[test]
fn cli_settle_refuses_an_rpc_flag_and_a_missing_header() {
    let bin = env!("CARGO_BIN_EXE_bridge-aac");
    let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/base-lock-receipt.json");
    let denied = std::process::Command::new(bin)
        .args(["settle", fixture, "0"])
        .output()
        .unwrap();
    assert!(denied.status.success());
    let text = String::from_utf8(denied.stdout).unwrap();
    assert!(!text.contains("final"));
    assert!(text.contains("broadcast no"));

    let rpc = std::process::Command::new(bin)
        .args(["settle", fixture, "0", "--rpc", "http://127.0.0.1:1"])
        .output()
        .unwrap();
    assert!(!rpc.status.success());

    let granted = std::process::Command::new(bin)
        .args(["settle", fixture, "1", "--allow-header", "0x44"])
        .output()
        .unwrap();
    assert!(granted.status.success());
    let text = String::from_utf8(granted.stdout).unwrap();
    assert!(text.contains("source-fn bridgeOut"));
    assert!(text.contains("dest-fn executeBridgeMint"));
    assert!(text.contains("state minted"));
    assert!(text.contains("broadcast no"));
    assert!(text.contains("deployed no"));
}
