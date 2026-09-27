use bridge_aac::{
    format_observation, prove_receipts, same_header, single_leaf_proof, verify_receipt, AuthenticatedHeader, Error,
    Gateway, MockFinality, Observation,
};

fn header(root: [u8; 32]) -> AuthenticatedHeader {
    AuthenticatedHeader {
        chain_id: 8453,
        header_hash: [4u8; 32],
        number: 10,
        state_root: [5u8; 32],
        receipts_root: root,
    }
}

#[test]
fn receipt_trie_matches_a_single_leaf_and_rejects_a_tampered_sibling() {
    let first = b"receipt-body-for-phase5-binding-check-0123456789".to_vec();
    let second = b"second-receipt-body-for-the-phase5-trie-check".to_vec();
    let (solo, solo_proof) = single_leaf_proof(0, &first);
    let (built, built_proof) = prove_receipts(&[first.clone()], 0).unwrap();
    assert_eq!(solo, built);
    assert_eq!(solo_proof, built_proof);
    verify_receipt(&built, 0, &first, &built_proof).unwrap();

    let (root, proof) = prove_receipts(&[first.clone(), second.clone()], 1).unwrap();
    verify_receipt(&root, 1, &second, &proof).unwrap();
    let mut wrong = root;
    wrong[0] ^= 1;
    assert_eq!(verify_receipt(&wrong, 1, &second, &proof), Err(Error::MerkleMismatch));
}

#[test]
fn quorum_requires_the_same_receipts_root() {
    let agreed = header([1u8; 32]);
    same_header(&[agreed, agreed]).unwrap();
    let mut other = agreed;
    other.receipts_root = [2u8; 32];
    assert_eq!(same_header(&[agreed, other]), Err(Error::Quorum));
}

#[test]
fn shadow_report_stays_unsettled_and_hides_final_on_mismatch() {
    let receipt = b"phase5-shadow-receipt".to_vec();
    let (root, _) = prove_receipts(std::slice::from_ref(&receipt), 0).unwrap();
    let ok = format_observation(
        "base",
        &header(root),
        0,
        &Observation {
            included: true,
            status_ok: true,
            gateway_match: true,
            events: vec!["event BridgeOperation\nwould-fn aacConsumeMint\n".into()],
            duplicate: false,
        },
    );
    assert!(ok.contains("shadow yes"));
    assert!(ok.contains("broadcast no"));
    assert!(ok.contains("settled no"));
    assert!(ok.contains("custody closed"));
    assert!(ok.contains("registry paused"));
    assert!(ok.contains("consume denied"));
    assert!(ok.contains("execution-tag yes"));
    assert!(!ok.contains("final"));
    let failed = format_observation(
        "base",
        &header(root),
        0,
        &Observation {
            included: true,
            status_ok: false,
            gateway_match: true,
            events: vec![],
            duplicate: false,
        },
    );
    assert!(failed.contains("receipt-status failed"));
    assert!(failed.contains("accepted no"));
    assert!(!failed.contains("final"));
    assert!(!failed.contains("execution-tag yes"));
    let bad = format_observation(
        "base",
        &header([9u8; 32]),
        0,
        &Observation {
            included: false,
            status_ok: true,
            gateway_match: false,
            events: vec![],
            duplicate: false,
        },
    );
    assert!(bad.contains("accepted no"));
    assert!(!bad.contains("final"));
}

#[test]
fn paused_registry_checks_the_receipt_then_records_nothing() {
    let receipt = b"phase6-paused-receipt-body-0123456789abcdef".to_vec();
    let (root, proof) = prove_receipts(std::slice::from_ref(&receipt), 0).unwrap();
    let mut gateway = Gateway::deployed_paused(MockFinality::new());
    assert_eq!(
        gateway.submit_proven_receipt(&root, 0, &receipt, &proof),
        Err(Error::Paused)
    );
    assert!(gateway.records().is_empty());
    let mut tampered = proof.clone();
    tampered[0][0] ^= 1;
    assert_eq!(
        gateway.submit_proven_receipt(&root, 0, &receipt, &tampered),
        Err(Error::MerkleMismatch)
    );
}
