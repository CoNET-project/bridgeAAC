use bridge_aac::{
    build_from_fixture, format_report, Gateway, HeaderCommitment, MockFinality,
};

const FIXTURE: &str = include_str!("../fixtures/base-lock-receipt.json");

#[test]
fn fixture_proof_is_accepted_by_the_phase0_gateway() {
    let built = build_from_fixture(FIXTURE, 0).unwrap();
    assert!(!built.proof.siblings.is_empty());
    let mut finality = MockFinality::new();
    finality.accept(built.chain_id, built.header_hash, built.state_root);
    let mut gateway = Gateway::new(finality);
    let header = HeaderCommitment {
        chain_id: built.chain_id,
        header_hash: built.header_hash,
        state_root: built.state_root,
    };
    let id = gateway.submit(built.deposit, &header, &built.proof).unwrap();
    gateway.reserve(&id).unwrap();
    assert!(gateway.is_reserved(&id));
}

#[test]
fn report_omits_final_until_the_allowlist_accepts_the_header() {
    let built = build_from_fixture(FIXTURE, 0).unwrap();
    let denied = format_report(&built, &MockFinality::new(), "mock-allowlist").unwrap();
    assert!(!denied.contains("final"));
    assert!(denied.contains("accepted no"));
    assert!(denied.contains("light-client no"));

    let mut allow = MockFinality::new();
    allow.accept(built.chain_id, built.header_hash, built.state_root);
    let granted = format_report(&built, &allow, "mock-allowlist").unwrap();
    assert!(granted.contains("final true"));
    assert!(granted.contains("header-check mock-allowlist"));
}

#[test]
fn cli_refuses_final_without_allow_header() {
    let bin = env!("CARGO_BIN_EXE_bridge-aac");
    let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/base-lock-receipt.json");
    let denied = std::process::Command::new(bin)
        .args(["prove", fixture, "0"])
        .output()
        .unwrap();
    assert!(denied.status.success());
    let text = String::from_utf8(denied.stdout).unwrap();
    assert!(!text.contains("final"));
    assert!(text.contains("header_hash 0x0000000000000000000000000000000000000000000000000000000000000044"));
    assert!(text.contains("sibling "));

    let granted = std::process::Command::new(bin)
        .args(["prove", fixture, "0", "--allow-header", "0x44"])
        .output()
        .unwrap();
    assert!(granted.status.success());
    let text = String::from_utf8(granted.stdout).unwrap();
    assert!(text.contains("final true"));
}
