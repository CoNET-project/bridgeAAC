//! Export one Base receipt and its Merkle proof. No L1 anchor and no broadcast.
fn main() {
    let mut args = std::env::args().skip(1);
    let rpc = args.next().expect("rpc");
    let tx = args.next().expect("tx");
    let bundle = bridge_aac::export_receipt_proof(&rpc, &tx).unwrap_or_else(|err| {
        eprintln!("export failed: {err:?}");
        std::process::exit(2);
    });
    println!("{}", serde_json::to_string(&bundle).expect("json"));
}
