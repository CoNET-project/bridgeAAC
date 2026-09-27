use bridge_aac::{
    bindings, build_tree, prove, verify_merkle, AssetIntent, Deposit, DepositId, Error, FinalityVerifier,
    Gateway, GbPool, HeaderCommitment, MockFinality, Settlement,
};

fn amount(n: u8) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[31] = n;
    out
}

fn deposit(intent: AssetIntent, source: u64, dest: u64, id_byte: u8) -> Deposit {
    Deposit::try_new(
        intent,
        source,
        dest,
        bindings::treasury_v3(),
        bindings::circle_usdc(),
        bindings::conet_usdc(),
        bindings::peer_v5(),
        amount(id_byte),
        DepositId(amount(id_byte)),
        [9u8; 32],
    )
    .unwrap()
}

fn open(intent: AssetIntent) -> (Gateway<MockFinality>, bridge_aac::AacId) {
    let item = deposit(intent, bindings::BASE_CHAIN_ID, bindings::CONET_CHAIN_ID, 7);
    let leaf = item.leaf();
    let tree = build_tree(&[leaf]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    assert!(verify_merkle(&tree.root, &leaf, &proof));
    let header_hash = [4u8; 32];
    let mut finality = MockFinality::new();
    finality.accept(item.source_chain_id, header_hash);
    let mut gateway = Gateway::new(finality);
    let header = HeaderCommitment {
        chain_id: item.source_chain_id,
        header_hash,
        state_root: tree.root,
    };
    let id = gateway.submit(item, &header, &proof).unwrap();
    (gateway, id)
}

#[test]
fn usdc_lock_mint_reaches_minted_once() {
    let (mut gateway, id) = open(AssetIntent::UsdcLockMint);
    assert!(!gateway.is_reserved(&id));
    gateway.reserve(&id).unwrap();
    assert!(gateway.is_reserved(&id));
    assert_eq!(gateway.consume(&id).unwrap(), Settlement::Mint);
    assert!(!gateway.is_reserved(&id));
    assert_eq!(gateway.consume(&id), Err(Error::BadState));
}

#[test]
fn usdc_burn_release_pays_from_balance_state() {
    let (mut gateway, id) = open(AssetIntent::UsdcBurnRelease);
    gateway.reserve(&id).unwrap();
    assert_eq!(gateway.consume(&id).unwrap(), Settlement::Release);
}

#[test]
fn paid_gb_mints_and_free_gb_is_rejected() {
    let (mut gateway, id) = open(AssetIntent::Gb { pool: GbPool::Paid });
    gateway.reserve(&id).unwrap();
    assert_eq!(gateway.consume(&id).unwrap(), Settlement::Mint);
    let err = Deposit::try_new(
        AssetIntent::Gb { pool: GbPool::Free },
        bindings::CONET_CHAIN_ID,
        bindings::BASE_CHAIN_ID,
        bindings::gb_token(),
        bindings::gb_token(),
        bindings::gb_token(),
        bindings::peer_v5(),
        amount(1),
        DepositId(amount(1)),
        [1u8; 32],
    );
    assert_eq!(err, Err(Error::NotBridgeable));
}

#[test]
fn unbound_developer_token_mints_and_gb_bound_token_does_not() {
    let (mut gateway, id) = open(AssetIntent::Developer { gb_bound: false });
    gateway.reserve(&id).unwrap();
    assert_eq!(gateway.consume(&id).unwrap(), Settlement::Mint);
    let err = Deposit::try_new(
        AssetIntent::Developer { gb_bound: true },
        bindings::CONET_CHAIN_ID,
        bindings::BASE_CHAIN_ID,
        bindings::peer_v5(),
        bindings::peer_v5(),
        bindings::peer_v5(),
        bindings::treasury_v3(),
        amount(1),
        DepositId(amount(2)),
        [2u8; 32],
    );
    assert_eq!(err, Err(Error::NotBridgeable));
}

#[test]
fn replay_and_bad_proof_and_unfinal_header_fail() {
    let (mut gateway, id) = open(AssetIntent::UsdcLockMint);
    let item = gateway.get(&id).unwrap().deposit.clone();
    let leaf = item.leaf();
    let tree = build_tree(&[leaf]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    let header = HeaderCommitment {
        chain_id: item.source_chain_id,
        header_hash: [4u8; 32],
        state_root: tree.root,
    };
    assert_eq!(gateway.submit(item.clone(), &header, &proof), Err(Error::AlreadyExists));

    let bad = HeaderCommitment {
        state_root: [0u8; 32],
        ..header.clone()
    };
    let other = deposit(AssetIntent::UsdcLockMint, bindings::BASE_CHAIN_ID, bindings::CONET_CHAIN_ID, 8);
    assert_eq!(gateway.submit(other, &bad, &proof), Err(Error::MerkleMismatch));

    let unknown = HeaderCommitment {
        header_hash: [5u8; 32],
        ..header
    };
    let third = deposit(AssetIntent::Gb { pool: GbPool::Paid }, bindings::BASE_CHAIN_ID, bindings::CONET_CHAIN_ID, 8);
    let third_tree = build_tree(&[third.leaf()]).unwrap();
    let third_proof = prove(&third_tree, 0).unwrap();
    let unknown = HeaderCommitment {
        state_root: third_tree.root,
        ..unknown
    };
    assert_eq!(
        gateway.submit(third, &unknown, &third_proof),
        Err(Error::UnknownHeader)
    );
}

#[test]
fn consume_requires_reserved_and_pause_keeps_records() {
    let (mut gateway, id) = open(AssetIntent::UsdcLockMint);
    assert_eq!(gateway.consume(&id), Err(Error::BadState));
    gateway.pause();
    assert_eq!(gateway.reserve(&id), Err(Error::Paused));
    assert!(gateway.get(&id).is_some());
}

#[test]
fn mock_finality_rejects_unregistered_headers() {
    let finality = MockFinality::new();
    assert_eq!(finality.header_is_final(1, &[0u8; 32]), Err(Error::UnknownHeader));
}
