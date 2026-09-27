use bridge_aac::{bindings, AacId, Address, AssetIntent, Deposit, DepositId};
use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("aac-id") => match parse_aac_id(args) {
            Ok(id) => {
                println!("{id}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        _ => {
            eprintln!(
                "bridge-aac {version}\nusage: bridge-aac aac-id <source-chain-id> <gateway> <deposit-id-hex> <target-domain-hex>",
                version = env!("CARGO_PKG_VERSION")
            );
            ExitCode::from(1)
        }
    }
}

fn parse_aac_id(mut args: impl Iterator<Item = String>) -> Result<AacId, bridge_aac::Error> {
    let source_chain: u64 = args
        .next()
        .ok_or(bridge_aac::Error::BadLength)?
        .parse()
        .map_err(|_| bridge_aac::Error::BadHex)?;
    let gateway = Address::parse(&args.next().ok_or(bridge_aac::Error::BadLength)?)?;
    let deposit_id = parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?;
    let target_domain = parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?;
    let deposit = Deposit::try_new(
        AssetIntent::UsdcLockMint,
        source_chain,
        bindings::CONET_CHAIN_ID,
        gateway,
        bindings::circle_usdc(),
        bindings::conet_usdc(),
        gateway,
        one_unit(),
        DepositId(deposit_id),
        target_domain,
    )?;
    Ok(deposit.aac_id())
}

fn parse_bytes32(text: &str) -> Result<[u8; 32], bridge_aac::Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    let bytes = hex::decode(raw).map_err(|_| bridge_aac::Error::BadHex)?;
    bytes.try_into().map_err(|_| bridge_aac::Error::BadLength)
}

fn one_unit() -> [u8; 32] {
    let mut amount = [0u8; 32];
    amount[31] = 1;
    amount
}
