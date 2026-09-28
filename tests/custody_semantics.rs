use bridge_aac::{
    assess_destination, assess_gb_mint, bindings, build_from_fixture, consume_gate_passed,
    mint_gate_passed, settle_reserved, AacState, ConsumeEvidence, Deposit, DestinationFacts,
    Error, Gateway, GbMintFacts, HeaderCommitment, MintClosureEvidence, MockFinality, TestLedger,
};

const LOCK: &str = include_str!("../fixtures/base-lock-receipt.json");

fn reserved_lock() -> (Gateway<MockFinality>, bridge_aac::AacId, Deposit) {
    let built = build_from_fixture(LOCK, 0).unwrap();
    let mut finality = MockFinality::new();
    finality.accept(built.chain_id, built.header_hash, built.state_root);
    let mut gateway = Gateway::new(finality);
    let id = gateway
        .submit(
            built.deposit.clone(),
            &HeaderCommitment {
                chain_id: built.chain_id,
                header_hash: built.header_hash,
                state_root: built.state_root,
            },
            &built.proof,
        )
        .unwrap();
    gateway.reserve(&id).unwrap();
    (gateway, id, built.deposit)
}

#[test]
fn bytecode_selectors_do_not_open_either_custody_gate() {
    assert!(!consume_gate_passed(true, &ConsumeEvidence::unproven()));
    assert!(!mint_gate_passed(&MintClosureEvidence::unproven()));
    let mut almost = ConsumeEvidence::complete_for_test();
    almost.upgrade_layout = false;
    assert!(!consume_gate_passed(true, &almost));
}

#[test]
fn a_second_consume_stays_minted_and_does_not_credit_again() {
    let (mut gateway, id, deposit) = reserved_lock();
    let mut ledger = TestLedger::new(0);
    settle_reserved(&mut gateway, &id, &mut ledger).unwrap();
    let balance = ledger.balance(deposit.destination_chain_id, deposit.destination_asset, deposit.recipient);
    let again = settle_reserved(&mut gateway, &id, &mut ledger);
    assert_eq!(again, Err(Error::BadState));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Minted);
    assert_eq!(
        ledger.balance(deposit.destination_chain_id, deposit.destination_asset, deposit.recipient),
        balance
    );
}

#[test]
fn pause_blocks_consume_and_leaves_the_reservation() {
    let (mut gateway, id, _) = reserved_lock();
    gateway.pause();
    let err = settle_reserved(&mut gateway, &id, &mut TestLedger::new(0));
    assert_eq!(err, Err(Error::Paused));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
}

#[test]
fn credit_overflow_is_refused_before_consume() {
    let (mut gateway, id, deposit) = reserved_lock();
    let mut ledger = TestLedger::new(0);
    ledger.seed_balance(
        deposit.destination_chain_id,
        deposit.destination_asset,
        deposit.recipient,
        u128::MAX,
    );
    let err = settle_reserved(&mut gateway, &id, &mut ledger);
    assert_eq!(err, Err(Error::BadLength));
    assert_eq!(gateway.get(&id).unwrap().state, AacState::Reserved);
    assert_eq!(
        ledger.balance(deposit.destination_chain_id, deposit.destination_asset, deposit.recipient),
        u128::MAX
    );
}

#[test]
fn live_observer_types_cannot_print_a_passed_gate() {
    let report = assess_destination(&DestinationFacts {
        conet_chain_id: bindings::CONET_CHAIN_ID,
        base_chain_id: bindings::BASE_CHAIN_ID,
        conet_treasury_proxy: vec![0x36],
        conet_treasury_impl: [0x11; 20],
        conet_treasury_code: push4("aacConsumeMint(bytes32)"),
        base_treasury_proxy: vec![0x36],
        base_treasury_impl: [0x22; 20],
        base_treasury_code: push4("aacConsumeRelease(bytes32)"),
        gb_proxy: vec![0x36],
        gb_impl: [0x33; 20],
        gb_code: push4("aacConsumeMintPaid(bytes32)"),
        peer_code: push4("aacConsumeMintDeveloper(bytes32)"),
    });
    assert!(!report.consume_once);
    assert!(report.text.contains("consume-once no\n"));
    assert!(!report.text.contains("consume-once yes"));

    let mint = assess_gb_mint(&GbMintFacts {
        chain_id: bindings::CONET_CHAIN_ID,
        proxy_code: vec![0x36],
        implementation: [0x44; 20],
        impl_code: vec![0x60, 0x00],
        validator_count: 0,
        required_votes: 0,
        bridge_paused: true,
    });
    assert!(!mint.mint_closed);
    assert!(mint.text.contains("selectors-absent yes\n"));
    assert!(mint.text.contains("mint-closed no\n"));
    assert!(!mint.text.contains("mint-closed yes"));
}

fn push4(signature: &str) -> Vec<u8> {
    let hash = bridge_aac::keccak256(signature.as_bytes());
    let mut code = vec![0x63];
    code.extend_from_slice(&hash[..4]);
    code
}
