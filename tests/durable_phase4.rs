use bridge_aac::{
    bindings, build_tree, load_into, prove, save_gateway, settle_report, single_leaf_proof, verify_receipt,
    AssetIntent, Deposit, DepositId, Error, Gateway, HeaderCommitment, MockFinality,
};
use std::time::{SystemTime, UNIX_EPOCH};

fn amount(n: u8) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[31] = n;
    out
}

#[test]
fn attested_root_must_match_the_supplied_root() {
    let item = Deposit::try_new(
        AssetIntent::UsdcLockMint,
        bindings::BASE_CHAIN_ID,
        bindings::CONET_CHAIN_ID,
        bindings::treasury_v3(),
        bindings::circle_usdc(),
        bindings::conet_usdc(),
        bindings::peer_v5(),
        amount(1),
        DepositId(amount(1)),
        [1u8; 32],
    )
    .unwrap();
    let tree = build_tree(&[item.leaf()]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    let mut finality = MockFinality::new();
    finality.accept(item.source_chain_id, [4u8; 32], [9u8; 32]);
    let mut gateway = Gateway::new(finality);
    let err = gateway.submit(
        item,
        &HeaderCommitment {
            chain_id: bindings::BASE_CHAIN_ID,
            header_hash: [4u8; 32],
            state_root: tree.root,
        },
        &proof,
    );
    assert_eq!(err, Err(Error::DigestMismatch));
}

#[test]
fn journal_keeps_a_consumed_aac_across_restart() {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("bridge-aac-journal-{stamp}.json"));
    let item = Deposit::try_new(
        AssetIntent::UsdcLockMint,
        bindings::BASE_CHAIN_ID,
        bindings::CONET_CHAIN_ID,
        bindings::treasury_v3(),
        bindings::circle_usdc(),
        bindings::conet_usdc(),
        bindings::peer_v5(),
        amount(6),
        DepositId(amount(6)),
        [6u8; 32],
    )
    .unwrap();
    let tree = build_tree(&[item.leaf()]).unwrap();
    let proof = prove(&tree, 0).unwrap();
    let mut finality = MockFinality::new();
    finality.accept(item.source_chain_id, [7u8; 32], tree.root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            item,
            &HeaderCommitment {
                chain_id: bindings::BASE_CHAIN_ID,
                header_hash: [7u8; 32],
                state_root: tree.root,
            },
            &proof,
        )
        .unwrap();
    gateway.reserve(&id).unwrap();
    gateway.consume(&id).unwrap();
    save_gateway(&path, &gateway).unwrap();

    let mut restored = Gateway::new(MockFinality::new());
    load_into(&path, &mut restored).unwrap();
    assert_eq!(restored.consume(&id), Err(Error::BadState));
    let _ = std::fs::remove_file(&path);
}

#[test]
fn settle_journal_rejects_a_second_consume() {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("bridge-aac-settle-{stamp}.json"));
    let fixture = include_str!("../fixtures/base-lock-receipt.json");
    let first = settle_report(fixture, 0, Some(amount(0x44)), u128::MAX, Some(&path)).unwrap();
    assert!(first.contains("final true"));
    assert!(first.contains("state minted"));
    let second = settle_report(fixture, 0, Some(amount(0x44)), u128::MAX, Some(&path)).unwrap();
    assert!(second.contains("replay yes"));
    assert!(second.contains("settled no"));
    let _ = std::fs::remove_file(&path);
}

#[test]
fn receipt_proof_is_bound_to_its_root() {
    let receipt = b"receipt-body-for-phase4-binding-check-0123456789";
    let (root, proof) = single_leaf_proof(0, receipt);
    verify_receipt(&root, 0, receipt, &proof).unwrap();
    let mut wrong = root;
    wrong[0] ^= 1;
    assert_eq!(verify_receipt(&wrong, 0, receipt, &proof), Err(Error::MerkleMismatch));
    let mut tampered = proof.clone();
    let last = tampered.last_mut().unwrap();
    let byte = last.len() - 1;
    last[byte] ^= 1;
    assert_eq!(verify_receipt(&root, 0, receipt, &tampered), Err(Error::MerkleMismatch));
}
