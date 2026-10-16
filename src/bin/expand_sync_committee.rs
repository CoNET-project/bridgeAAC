//! Expand a sync-committee aggregate into the uncompressed points the
//! checkpoint contract passes to the EIP-2537 precompiles.
use serde::Deserialize;
use std::io::{self, Read};

#[derive(Deserialize)]
struct Input {
    pubkeys: Vec<String>,
    signature: String,
}

fn strip(hex_str: &str) -> Result<Vec<u8>, String> {
    let raw = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    hex::decode(raw).map_err(|err| err.to_string())
}

fn pad48(coord: &[u8]) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[16..].copy_from_slice(coord);
    out
}

fn main() {
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw).expect("stdin");
    let input: Input = serde_json::from_str(&raw).expect("json");
    if input.pubkeys.len() != 512 {
        eprintln!("expected 512 pubkeys");
        std::process::exit(2);
    }
    let mut keys = Vec::with_capacity(512 * 128);
    for pubkey in &input.pubkeys {
        let bytes = strip(pubkey).expect("pubkey");
        let point = blst::min_pk::PublicKey::uncompress(&bytes).unwrap_or_else(|err| {
            eprintln!("pubkey: {err:?}");
            std::process::exit(2);
        });
        let ser = point.serialize();
        keys.extend_from_slice(&pad48(&ser[..48]));
        keys.extend_from_slice(&pad48(&ser[48..]));
    }
    let signature = strip(&input.signature).expect("signature");
    let point = blst::min_pk::Signature::uncompress(&signature).unwrap_or_else(|err| {
        eprintln!("signature: {err:?}");
        std::process::exit(2);
    });
    let ser = point.serialize();
    let mut limbs: Vec<[u8; 48]> = ser.chunks(48).map(|limb| limb.try_into().expect("limb")).collect();
    // blst writes Fp2 as (c1, c0). EIP-2537 wants (c0, c1).
    limbs.swap(0, 1);
    limbs.swap(2, 3);
    let mut signature_point = Vec::with_capacity(256);
    for limb in &limbs {
        signature_point.extend_from_slice(&pad48(limb));
    }
    println!(
        "{}",
        serde_json::json!({
            "signerUncompressed": format!("0x{}", hex::encode(keys)),
            "signaturePoint": format!("0x{}", hex::encode(signature_point)),
        })
    );
}
