use bridge_aac::{bindings, AacId, Address, AssetIntent, Deposit, DepositId};
use std::env;
use std::fs;
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
        Some("prove") => match prove(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("check-header") => match check_header(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("settle") => match settle(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("shadow") => match shadow(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("shadow-service") => match shadow_service(args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("destination-consumer") => match destination_consumer(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("gb-mint-authority") => match gb_mint_authority(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("confirm-checkpoint") => match confirm_checkpoint_cmd(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("accept-confirmations") => match accept_confirmations_cmd(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("weak-subjectivity") => match weak_subjectivity(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("forward-committee") => match forward_committee(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("conet-consensus") => match conet_consensus(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("base-l1-output") => match base_l1_output(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("base-quorum-reader") => match base_quorum_reader(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("drill") => match drill(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        Some("version") => {
            println!("bridge-aac {}", env!("CARGO_PKG_VERSION"));
            println!("shadow read-only");
            println!("custody closed");
            ExitCode::SUCCESS
        },
        Some("verify-receipt") => match verify_receipt_cmd(args) {
            Ok(report) => {
                print!("{report}");
                ExitCode::SUCCESS
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::from(2)
            }
        },
        _ => {
            eprintln!(
                "bridge-aac {version}\n\
                 usage:\n  \
                 bridge-aac aac-id <source-chain-id> <gateway> <deposit-id-hex> <target-domain-hex>\n  \
                 bridge-aac prove <fixture.json> <log-index> [--allow-header <hex>]\n  \
                 bridge-aac check-header --chain base|conet --rpc <url> [--l1-rpc <url>] [--level safe|finalized] [--header <hex>]\n  \
                 bridge-aac settle <fixture.json> <log-index> [--allow-header <hex>] [--circle-balance <dec>] [--journal <file>]\n  \
                 bridge-aac verify-receipt --chain base|conet --rpc <url> [--l1-rpc <url>] --header <hex> --index <n> --receipt <hex> --proof <hex>[,<hex>...]\n  \
                 bridge-aac shadow --chain base|conet --rpc <url> --rpc <url> [--tx <hash>] [--journal <file>]\n  \
                 bridge-aac shadow-service --journal <file> --cursor <file> --page <file> --log <file> --alert <file> [--base-rpc <url>] [--conet-rpc <url>] [--interval <seconds>] [--once]\n  \
                 bridge-aac base-l1-output --l1-rpc <url> --base-rpc <url> [--base-block <height>]\n  \
                 bridge-aac conet-consensus --beacon <url> --execution-rpc <url>\n  \
                 bridge-aac forward-committee --beacon <url> --checkpoint <file> [--witness-beacon <url>] [--execution-rpc <url>] [--periods <n>]\n  \
                 bridge-aac weak-subjectivity --beacon <url> --period <n> --out <file> [--witness-beacon <url>]\n  \
                 bridge-aac confirm-checkpoint --beacon <url> --period <n> --out <file>\n  \
                 bridge-aac accept-confirmations --checkpoint <file> --confirmation <file> [--confirmation <file>...]\n  \
                 bridge-aac destination-consumer --conet-rpc <url> --base-rpc <url>\n  \
                 bridge-aac gb-mint-authority --rpc <url>\n  \
                 bridge-aac base-quorum-reader --rpc <url> --rpc <url> [--from <height>] [--blocks <count>]\n  \
                 bridge-aac drill <directory>\n  \
                 bridge-aac version",
                version = env!("CARGO_PKG_VERSION")
            );
            ExitCode::from(1)
        }
    }
}

fn prove(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let path = args.next().ok_or(bridge_aac::Error::BadLength)?;
    let index: usize = args
        .next()
        .ok_or(bridge_aac::Error::BadLength)?
        .parse()
        .map_err(|_| bridge_aac::Error::BadIndex)?;
    let text = fs::read_to_string(&path).map_err(|_| bridge_aac::Error::BadFixture)?;
    let built = bridge_aac::build_from_fixture(&text, index)?;
    let mut verifier = bridge_aac::MockFinality::new();
    if let Some(flag) = args.next() {
        if flag != "--allow-header" {
            return Err(bridge_aac::Error::BadFixture);
        }
        let header = parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?;
        if header == built.header_hash {
            verifier.accept(built.chain_id, header, built.state_root);
        }
    }
    Ok(bridge_aac::format_report(&built, &verifier, "mock-allowlist")?)
}

fn check_header(args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    use bridge_aac::{
        BaseFinality, BaseL1Finality, ConetFinality, ExecutionView, FinalityLevel,
        FinalityVerifier, JsonRpcExecution,
    };
    let mut chain = None;
    let mut rpc = None;
    let mut l1_rpc = None;
    let mut level = FinalityLevel::Finalized;
    let mut header = None;
    let mut args = args;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--chain" => chain = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--rpc" => rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--l1-rpc" => l1_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--level" => level = FinalityLevel::parse(&args.next().ok_or(bridge_aac::Error::BadLength)?)?,
            "--header" => header = Some(parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    let chain = chain.ok_or(bridge_aac::Error::BadLength)?;
    let rpc = rpc.ok_or(bridge_aac::Error::BadLength)?;
    let api = JsonRpcExecution::new(rpc.clone());
    let mut last_header = header.unwrap_or([0u8; 32]);
    let mut attested = None;
    let attempts = if header.is_some() { 1 } else { 3 };
    for _ in 0..attempts {
        let candidate = match header {
            Some(hash) => hash,
            None => api.block_by_tag(level.tag())?.hash,
        };
        last_header = candidate;
        attested = None;
        let accepted = match chain.as_str() {
            "base" => {
                let accepted = if let Some(l1_rpc) = l1_rpc.clone() {
                    BaseL1Finality::new(l1_rpc, rpc.clone())
                        .authenticate(bridge_aac::bindings::BASE_CHAIN_ID, &candidate)
                } else {
                    BaseFinality { api: api.clone(), level }
                        .authenticate(bridge_aac::bindings::BASE_CHAIN_ID, &candidate)
                };
                match accepted {
                    Ok(header) => {
                        attested = Some(header);
                        true
                    }
                    Err(bridge_aac::Error::UnknownHeader) => false,
                    Err(other) => return Err(other),
                }
            }
            "conet" => {
                let verifier = ConetFinality { api: api.clone(), level };
                match verifier.authenticate(bridge_aac::bindings::CONET_CHAIN_ID, &candidate) {
                    Ok(header) => {
                        attested = Some(header);
                        true
                    }
                    Err(bridge_aac::Error::UnknownHeader) => false,
                    Err(other) => return Err(other),
                }
            }
            _ => return Err(bridge_aac::Error::BadFixture),
        };
        if accepted || header.is_some() {
            break;
        }
    }
    let tag = match level {
        FinalityLevel::Safe => "S",
        FinalityLevel::Finalized => "F",
    };
    let header_check = if chain == "base" && l1_rpc.is_some() {
        "l1-anchor"
    } else {
        "execution-tag"
    };
    let mut out = format!(
        "header_hash 0x{}\nchain {chain}\ntag {tag}\nheader-check {header_check}\nlight-client no\n",
        hex::encode(last_header)
    );
    if let Some(header) = attested {
        out.push_str(&format!("receipts-root 0x{}\n", hex::encode(header.receipts_root)));
        out.push_str(&format!("state-root 0x{}\n", hex::encode(header.state_root)));
        out.push_str("final true\n");
    } else {
        out.push_str("accepted no\n");
    }
    Ok(out)
}

fn shadow_service(args: impl Iterator<Item = String>) -> Result<(), bridge_aac::Error> {
    let mut journal = None;
    let mut cursor = None;
    let mut page = None;
    let mut log = None;
    let mut alert = None;
    let mut base_rpcs = Vec::new();
    let mut conet_rpcs = Vec::new();
    let mut interval = 60u64;
    let mut once = false;
    let mut args = args;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--journal" => journal = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--cursor" => cursor = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--page" => page = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--log" => log = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--alert" => alert = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--base-rpc" => base_rpcs.push(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--conet-rpc" => conet_rpcs.push(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--interval" => {
                interval = args
                    .next()
                    .ok_or(bridge_aac::Error::BadLength)?
                    .parse()
                    .map_err(|_| bridge_aac::Error::BadFixture)?;
            }
            "--once" => once = true,
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    let journal = journal.ok_or(bridge_aac::Error::BadLength)?;
    let cursor = cursor.unwrap_or_else(|| {
        std::path::Path::new(&journal)
            .with_file_name("cursor.json")
            .display()
            .to_string()
    });
    let page = page.unwrap_or_else(|| {
        std::path::Path::new(&cursor)
            .with_file_name("page.txt")
            .display()
            .to_string()
    });
    let log = log.ok_or(bridge_aac::Error::BadLength)?;
    let alert = alert.ok_or(bridge_aac::Error::BadLength)?;
    if (!base_rpcs.is_empty() && !bridge_aac::valid_reader_set(&base_rpcs))
        || (!conet_rpcs.is_empty() && !bridge_aac::valid_reader_set(&conet_rpcs))
    {
        return Err(bridge_aac::Error::BadFixture);
    }
    loop {
        let prepared = bridge_aac::prepare_cycle_with_targets(
            std::path::Path::new(&journal),
            std::path::Path::new(&cursor),
            &base_rpcs,
            &conet_rpcs,
        );
        print!("{}", prepared.report);
        for name in bridge_aac::alerts_for(&prepared.report) {
            println!("BRIDGE_AAC_ALERT {name}");
        }
        bridge_aac::write_page(std::path::Path::new(&page), &prepared.report)?;
        let logged = bridge_aac::write_cycle(std::path::Path::new(&log), std::path::Path::new(&alert), &prepared.report).is_ok();
        bridge_aac::finish_cycle(std::path::Path::new(&cursor), &prepared, logged)?;
        if once || !bridge_aac::should_pause(&prepared.report) {
            if once {
                return Ok(());
            }
            continue;
        }
        std::thread::sleep(std::time::Duration::from_secs(interval));
    }
}

fn drill(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let dir = args.next().ok_or(bridge_aac::Error::BadLength)?;
    bridge_aac::drill_report(std::path::Path::new(&dir))
}

fn destination_consumer(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut conet_rpc = None;
    let mut base_rpc = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--conet-rpc" => conet_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--base-rpc" => base_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe_destination(
        &conet_rpc.ok_or(bridge_aac::Error::BadLength)?,
        &base_rpc.ok_or(bridge_aac::Error::BadLength)?,
    )
}

fn gb_mint_authority(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut rpc = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--rpc" => rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe_gb_mint(&rpc.ok_or(bridge_aac::Error::BadLength)?)
}

fn confirm_checkpoint_cmd(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut beacon = None;
    let mut period = None;
    let mut out = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--beacon" => beacon = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--period" => {
                period = Some(
                    args.next()
                        .ok_or(bridge_aac::Error::BadLength)?
                        .parse()
                        .map_err(|_| bridge_aac::Error::BadFixture)?,
                );
            }
            "--out" => out = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::confirm_checkpoint(
        &beacon.ok_or(bridge_aac::Error::BadLength)?,
        period.ok_or(bridge_aac::Error::BadLength)?,
        std::path::Path::new(&out.ok_or(bridge_aac::Error::BadLength)?),
    )
}

fn accept_confirmations_cmd(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut checkpoint = None;
    let mut confirmations = Vec::new();
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--checkpoint" => checkpoint = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--confirmation" => confirmations.push(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    if confirmations.is_empty() {
        return Err(bridge_aac::Error::BadLength);
    }
    bridge_aac::accept_confirmations(
        std::path::Path::new(&checkpoint.ok_or(bridge_aac::Error::BadLength)?),
        &confirmations.iter().map(std::path::PathBuf::from).collect::<Vec<_>>(),
    )
}

fn weak_subjectivity(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut beacon = None;
    let mut period = None;
    let mut out = None;
    let mut witness = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--beacon" => beacon = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--period" => {
                period = Some(
                    args.next()
                        .ok_or(bridge_aac::Error::BadLength)?
                        .parse()
                        .map_err(|_| bridge_aac::Error::BadFixture)?,
                );
            }
            "--out" => out = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--witness-beacon" => witness = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe_weak_subjectivity(
        &beacon.ok_or(bridge_aac::Error::BadLength)?,
        witness.as_deref(),
        period.ok_or(bridge_aac::Error::BadLength)?,
        std::path::Path::new(&out.ok_or(bridge_aac::Error::BadLength)?),
    )
}

fn forward_committee(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut beacon = None;
    let mut checkpoint = None;
    let mut witness = None;
    let mut periods = 1u64;
    let mut execution_rpc = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--beacon" => beacon = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--checkpoint" => checkpoint = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--witness-beacon" => witness = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--execution-rpc" => execution_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--periods" => {
                periods = args
                    .next()
                    .ok_or(bridge_aac::Error::BadLength)?
                    .parse()
                    .map_err(|_| bridge_aac::Error::BadFixture)?;
            }
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    if periods == 0 || periods > 256 {
        return Err(bridge_aac::Error::BadFixture);
    }
    bridge_aac::observe_forward_committee(
        &beacon.ok_or(bridge_aac::Error::BadLength)?,
        std::path::Path::new(&checkpoint.ok_or(bridge_aac::Error::BadLength)?),
        witness.as_deref(),
        periods,
        execution_rpc.as_deref(),
    )
}

fn conet_consensus(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut beacon = None;
    let mut execution_rpc = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--beacon" => beacon = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--execution-rpc" => execution_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe_conet_consensus(
        &beacon.ok_or(bridge_aac::Error::BadLength)?,
        &execution_rpc.ok_or(bridge_aac::Error::BadLength)?,
    )
}

fn base_l1_output(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut l1_rpc = None;
    let mut base_rpc = None;
    let mut base_block = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--l1-rpc" => l1_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--base-rpc" => base_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--base-block" => {
                base_block = Some(
                    args.next()
                        .ok_or(bridge_aac::Error::BadLength)?
                        .parse()
                        .map_err(|_| bridge_aac::Error::BadFixture)?,
                );
            }
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe_base_l1_output(
        &l1_rpc.ok_or(bridge_aac::Error::BadLength)?,
        &base_rpc.ok_or(bridge_aac::Error::BadLength)?,
        base_block,
    )
}

fn base_quorum_reader(mut args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut rpcs = Vec::new();
    let mut from = None;
    let mut blocks = 1u64;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--rpc" => rpcs.push(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--from" => {
                from = Some(
                    args.next()
                        .ok_or(bridge_aac::Error::BadLength)?
                        .parse()
                        .map_err(|_| bridge_aac::Error::BadFixture)?,
                );
            }
            "--blocks" => {
                blocks = args
                    .next()
                    .ok_or(bridge_aac::Error::BadLength)?
                    .parse()
                    .map_err(|_| bridge_aac::Error::BadFixture)?;
            }
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::base_quorum_report(&rpcs, from, blocks)
}

fn shadow(args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut chain = None;
    let mut rpcs = Vec::new();
    let mut tx = None;
    let mut journal = None;
    let mut args = args;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--chain" => chain = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--rpc" => rpcs.push(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--tx" => tx = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--journal" => journal = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    bridge_aac::observe(
        &chain.ok_or(bridge_aac::Error::BadLength)?,
        &rpcs,
        tx.as_deref(),
        journal.as_deref().map(std::path::Path::new),
    )
}

fn verify_receipt_cmd(args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    use bridge_aac::{
        BaseFinality, BaseL1Finality, ConetFinality, FinalityLevel, FinalityVerifier,
        JsonRpcExecution,
    };
    let mut chain = None;
    let mut rpc = None;
    let mut l1_rpc = None;
    let mut level = FinalityLevel::Finalized;
    let mut header = None;
    let mut index = None;
    let mut receipt = None;
    let mut proof = None;
    let mut args = args;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--chain" => chain = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--rpc" => rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--l1-rpc" => l1_rpc = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--level" => level = FinalityLevel::parse(&args.next().ok_or(bridge_aac::Error::BadLength)?)?,
            "--header" => header = Some(parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?),
            "--index" => {
                index = Some(args.next().ok_or(bridge_aac::Error::BadLength)?.parse().map_err(|_| bridge_aac::Error::BadIndex)?);
            }
            "--receipt" => receipt = Some(parse_raw(&args.next().ok_or(bridge_aac::Error::BadLength)?)?),
            "--proof" => proof = Some(parse_proof(&args.next().ok_or(bridge_aac::Error::BadLength)?)?),
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    let chain = chain.ok_or(bridge_aac::Error::BadLength)?;
    let header = header.ok_or(bridge_aac::Error::BadLength)?;
    let index = index.ok_or(bridge_aac::Error::BadLength)?;
    let receipt = receipt.ok_or(bridge_aac::Error::BadLength)?;
    let proof = proof.ok_or(bridge_aac::Error::BadLength)?;
    let rpc = rpc.ok_or(bridge_aac::Error::BadLength)?;
    let api = JsonRpcExecution::new(rpc.clone());
    let use_l1_anchor = chain == "base" && l1_rpc.is_some();
    let authenticated = match chain.as_str() {
        "base" => {
            if let Some(l1_rpc) = l1_rpc {
                BaseL1Finality::new(l1_rpc, rpc)
                    .authenticate(bridge_aac::bindings::BASE_CHAIN_ID, &header)?
            } else {
                BaseFinality { api, level }
                    .authenticate(bridge_aac::bindings::BASE_CHAIN_ID, &header)?
            }
        }
        "conet" => ConetFinality { api, level }.authenticate(bridge_aac::bindings::CONET_CHAIN_ID, &header)?,
        _ => return Err(bridge_aac::Error::BadFixture),
    };
    let included = bridge_aac::verify_receipt(&authenticated.receipts_root, index, &receipt, &proof).is_ok();
    let mut out = format!(
        "header_hash 0x{}\nreceipts-root 0x{}\nheader-check {}\nlight-client no\ninclusion {}\n",
        hex::encode(header),
        hex::encode(authenticated.receipts_root),
        if use_l1_anchor { "l1-anchor" } else { "execution-tag" },
        if included { "yes" } else { "no" }
    );
    if included {
        out.push_str("final true\n");
    } else {
        out.push_str("accepted no\n");
    }
    Ok(out)
}

fn parse_proof(text: &str) -> Result<Vec<Vec<u8>>, bridge_aac::Error> {
    text.split(',').map(parse_raw).collect()
}

fn parse_raw(text: &str) -> Result<Vec<u8>, bridge_aac::Error> {
    let raw = text.strip_prefix("0x").unwrap_or(text);
    hex::decode(raw).map_err(|_| bridge_aac::Error::BadHex)
}

fn settle(args: impl Iterator<Item = String>) -> Result<String, bridge_aac::Error> {
    let mut path = None;
    let mut index = None;
    let mut allow_header = None;
    let mut circle = u128::MAX;
    let mut journal = None;
    let mut positional = 0u8;
    let mut args = args;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--allow-header" => {
                allow_header = Some(parse_bytes32(&args.next().ok_or(bridge_aac::Error::BadLength)?)?);
            }
            "--circle-balance" => {
                circle = args
                    .next()
                    .ok_or(bridge_aac::Error::BadLength)?
                    .parse()
                    .map_err(|_| bridge_aac::Error::BadFixture)?;
            }
            "--journal" => journal = Some(args.next().ok_or(bridge_aac::Error::BadLength)?),
            "--rpc" | "--chain" => return Err(bridge_aac::Error::BadFixture),
            _ if arg.starts_with("--") => return Err(bridge_aac::Error::BadFixture),
            _ if positional == 0 => {
                path = Some(arg);
                positional = 1;
            }
            _ if positional == 1 => {
                index = Some(arg.parse().map_err(|_| bridge_aac::Error::BadIndex)?);
                positional = 2;
            }
            _ => return Err(bridge_aac::Error::BadFixture),
        }
    }
    let path = path.ok_or(bridge_aac::Error::BadLength)?;
    let index = index.ok_or(bridge_aac::Error::BadLength)?;
    let text = fs::read_to_string(&path).map_err(|_| bridge_aac::Error::BadFixture)?;
    bridge_aac::settle_report(
        &text,
        index,
        allow_header,
        circle,
        journal.as_deref().map(std::path::Path::new),
    )
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
    if bytes.len() > 32 {
        return Err(bridge_aac::Error::BadLength);
    }
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    Ok(out)
}

fn one_unit() -> [u8; 32] {
    let mut amount = [0u8; 32];
    amount[31] = 1;
    amount
}
