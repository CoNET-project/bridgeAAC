use bridge_aac::{
    build_from_fixture, load_into, save_gateway, settle_reserved, AacState, Error, Gateway,
    HeaderCommitment, MockFinality, TestLedger,
};
use std::time::{SystemTime, UNIX_EPOCH};

const LOCK: &str = include_str!("../fixtures/base-lock-receipt.json");
const BURN: &str = include_str!("../fixtures/conet-burn-release.json");

fn reserved(fixture: &str, index: usize) -> (Gateway<MockFinality>, bridge_aac::AacId, [u8; 32]) {
    let built = build_from_fixture(fixture, index).unwrap();
    let mut finality = MockFinality::new();
    finality.accept(built.chain_id, built.header_hash, built.state_root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            built.deposit,
            &HeaderCommitment {
                chain_id: built.chain_id,
                header_hash: built.header_hash,
                state_root: built.state_root,
            },
            &built.proof,
        )
        .unwrap();
    gateway.reserve(&id).unwrap();
    (gateway, id, built.header_hash)
}

#[test]
fn a_reorg_before_consume_leaves_the_aac_reserved_and_unpaid() {
    let (mut gateway, id, header) = reserved(LOCK, 0);
    let chain = gateway.get(&id).unwrap().deposit.source_chain_id;
    gateway.verifier_mut().revoke(chain, header);
    let mut ledger = TestLedger::new(u128::MAX);
    assert_eq!(settle_reserved(&mut gateway, &id, &mut ledger), Err(Error::UnknownHeader));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
    let deposit = &gateway.get(&id).unwrap().deposit;
    assert_eq!(
        ledger.balance(deposit.destination_chain_id, deposit.destination_asset, deposit.recipient),
        0
    );
}

#[test]
fn a_reorg_before_reserve_does_not_reserve() {
    let built = build_from_fixture(LOCK, 0).unwrap();
    let mut finality = MockFinality::new();
    finality.accept(built.chain_id, built.header_hash, built.state_root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            built.deposit,
            &HeaderCommitment {
                chain_id: built.chain_id,
                header_hash: built.header_hash,
                state_root: built.state_root,
            },
            &built.proof,
        )
        .unwrap();
    gateway.verifier_mut().revoke(built.chain_id, built.header_hash);
    assert_eq!(gateway.reserve(&id), Err(Error::UnknownHeader));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Verified);
}

#[test]
fn a_replaced_root_is_not_the_accepted_header() {
    let (mut gateway, id, header) = reserved(BURN, 0);
    let chain = gateway.get(&id).unwrap().deposit.source_chain_id;
    gateway.verifier_mut().revoke(chain, header);
    gateway.verifier_mut().accept(chain, header, [9u8; 32]);
    let before = gateway.get(&id).unwrap().deposit.clone();
    let mut ledger = TestLedger::new(u128::MAX);
    assert_eq!(settle_reserved(&mut gateway, &id, &mut ledger), Err(Error::DigestMismatch));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
    assert_eq!(ledger.circle_on_base_treasury, u128::MAX);
    assert_eq!(
        ledger.balance(before.destination_chain_id, before.destination_asset, before.recipient),
        0
    );
}

#[test]
fn a_legacy_journal_without_a_header_cannot_be_consumed() {
    let (gateway, id, _) = reserved(LOCK, 0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("aac-adversarial-{nanos}.json"));
    save_gateway(&path, &gateway).unwrap();
    let text = std::fs::read_to_string(&path).unwrap().replace("source_header", "ignored_header");
    std::fs::write(&path, text).unwrap();
    let mut restored = Gateway::new(MockFinality::new());
    load_into(&path, &mut restored).unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(restored.get(&id).unwrap().source_header.is_none());
    assert_eq!(restored.consume(&id), Err(Error::UnknownHeader));
    assert_eq!(restored.get(&id).unwrap().state, AacState::Reserved);
}

#[test]
fn short_release_then_reorg_never_debits_circle() {
    let (mut gateway, id, header) = reserved(BURN, 0);
    let mut ledger = TestLedger::new(0);
    assert_eq!(settle_reserved(&mut gateway, &id, &mut ledger), Err(Error::ShortBalance));
    assert_eq!(ledger.circle_on_base_treasury, 0);
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
    ledger.circle_on_base_treasury = u128::MAX;
    let chain = gateway.get(&id).unwrap().deposit.source_chain_id;
    gateway.verifier_mut().revoke(chain, header);
    assert_eq!(settle_reserved(&mut gateway, &id, &mut ledger), Err(Error::UnknownHeader));
    assert_eq!(ledger.circle_on_base_treasury, u128::MAX);
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
}
