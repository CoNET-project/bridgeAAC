//! Phase-3 asset adapters.
//!
//! The destination call is applied on [`TestLedger`]. This module does not
//! broadcast a transaction, and it does not call `voteBridgeMint` or
//! `voteBridgeOperation`. The planned selectors are not deployed bytecode.

use crate::assets::{bindings, AssetIntent, GbPool, Settlement};
use crate::error::Error;
use crate::finality::FinalityVerifier;
use crate::gateway::Gateway;
use crate::hash::keccak256;
use crate::journal::{load_into, save_gateway};
use crate::receipt::build_from_fixture;
use crate::types::{AacId, AacState, Address, Deposit};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallPlan {
    pub source_fn: &'static str,
    pub dest_fn: &'static str,
    pub dest_to: Address,
    pub selector: [u8; 4],
    pub settlement: Settlement,
}

/// Local balances for the phase-3 test network.
///
/// `circle_on_base_treasury` is the Circle USDC the Base treasury can pay.
/// A short balance refuses release and leaves the AAC reserved.
#[derive(Clone, Debug)]
pub struct TestLedger {
    pub circle_on_base_treasury: u128,
    balances: HashMap<(u64, Address, Address), u128>,
}

impl TestLedger {
    pub fn new(circle_on_base_treasury: u128) -> Self {
        Self {
            circle_on_base_treasury,
            balances: HashMap::new(),
        }
    }

    pub fn balance(&self, chain_id: u64, asset: Address, holder: Address) -> u128 {
        self.balances.get(&(chain_id, asset, holder)).copied().unwrap_or(0)
    }

    fn credit(&mut self, chain_id: u64, asset: Address, holder: Address, amount: u128) -> Result<(), Error> {
        let entry = self.balances.entry((chain_id, asset, holder)).or_insert(0);
        *entry = entry.checked_add(amount).ok_or(Error::BadLength)?;
        Ok(())
    }
}

pub fn plan(deposit: &Deposit) -> Result<CallPlan, Error> {
    let base = bindings::BASE_CHAIN_ID;
    let conet = bindings::CONET_CHAIN_ID;
    let treasury = bindings::treasury_v3();
    let known_pair = (deposit.source_chain_id == base && deposit.destination_chain_id == conet)
        || (deposit.source_chain_id == conet && deposit.destination_chain_id == base);
    if !known_pair {
        return Err(Error::ChainMismatch);
    }
    match deposit.intent {
        AssetIntent::UsdcLockMint => {
            if deposit.source_chain_id != base
                || deposit.destination_chain_id != conet
                || deposit.source_gateway != treasury
                || deposit.source_asset != bindings::circle_usdc()
                || deposit.destination_asset != bindings::conet_usdc()
            {
                return Err(Error::NotBridgeable);
            }
            Ok(CallPlan {
                source_fn: "initiateLockMint",
                dest_fn: "aacConsumeMint",
                dest_to: treasury,
                selector: selector("aacConsumeMint(bytes32)"),
                settlement: Settlement::Mint,
            })
        }
        AssetIntent::UsdcBurnRelease => {
            if deposit.source_chain_id != conet
                || deposit.destination_chain_id != base
                || deposit.source_gateway != treasury
                || deposit.source_asset != bindings::conet_usdc()
                || deposit.destination_asset != bindings::circle_usdc()
            {
                return Err(Error::NotBridgeable);
            }
            Ok(CallPlan {
                source_fn: "initiateBurnRelease",
                dest_fn: "aacConsumeRelease",
                dest_to: treasury,
                selector: selector("aacConsumeRelease(bytes32)"),
                settlement: Settlement::Release,
            })
        }
        AssetIntent::Gb { pool: GbPool::Paid } => {
            let gb = bindings::gb_token();
            if deposit.source_gateway != gb
                || deposit.source_asset != gb
                || deposit.destination_asset != gb
            {
                return Err(Error::NotBridgeable);
            }
            Ok(CallPlan {
                source_fn: "bridgeOut",
                dest_fn: "executeBridgeMint",
                dest_to: gb,
                selector: selector("aacConsumeMintPaid(bytes32)"),
                settlement: Settlement::Mint,
            })
        }
        AssetIntent::Developer { gb_bound: false } => {
            let peer = bindings::peer_v5();
            if deposit.source_gateway != peer || deposit.source_asset != deposit.destination_asset {
                return Err(Error::NotBridgeable);
            }
            if deposit.source_asset == bindings::circle_usdc()
                || deposit.source_asset == bindings::conet_usdc()
                || deposit.source_asset == bindings::gb_token()
                || deposit.source_asset == treasury
            {
                return Err(Error::NotBridgeable);
            }
            Ok(CallPlan {
                source_fn: "bridgeDeveloper",
                dest_fn: "aacConsumeMintDeveloper",
                dest_to: peer,
                selector: selector("aacConsumeMintDeveloper(bytes32)"),
                settlement: Settlement::Mint,
            })
        }
        AssetIntent::Gb { pool: GbPool::Free } | AssetIntent::Developer { gb_bound: true } => {
            Err(Error::NotBridgeable)
        }
    }
}

/// Apply one reserved AAC to the test ledger.
///
/// A short Circle balance returns [`Error::ShortBalance`] and does not consume.
pub fn settle_reserved<V: FinalityVerifier>(
    gateway: &mut Gateway<V>,
    id: &AacId,
    ledger: &mut TestLedger,
) -> Result<CallPlan, Error> {
    let record = gateway.get(id).ok_or(Error::UnknownAac)?.clone();
    if record.state != AacState::Reserved {
        return Err(Error::BadState);
    }
    let planned = plan(&record.deposit)?;
    let amount = amount_u128(&record.deposit.amount)?;
    if planned.settlement == Settlement::Release && ledger.circle_on_base_treasury < amount {
        return Err(Error::ShortBalance);
    }
    let settled = gateway.consume(id)?;
    if settled != planned.settlement {
        return Err(Error::BadState);
    }
    if planned.settlement == Settlement::Release {
        ledger.circle_on_base_treasury -= amount;
    }
    ledger.credit(
        record.deposit.destination_chain_id,
        record.deposit.destination_asset,
        record.deposit.recipient,
        amount,
    )?;
    Ok(planned)
}

/// `executeBridgeMint` consumes a reserved paid-GB AAC.
///
/// A vote is not an input. Any other asset is rejected and left unchanged.
pub fn execute_bridge_mint<V: FinalityVerifier>(
    gateway: &mut Gateway<V>,
    id: &AacId,
    from_vote: bool,
    ledger: &mut TestLedger,
) -> Result<CallPlan, Error> {
    if from_vote {
        reject_vote("voteBridgeMint")?;
        unreachable!("a vote is never an AAC consume");
    }
    let intent = gateway.get(id).ok_or(Error::UnknownAac)?.deposit.intent;
    if !matches!(intent, AssetIntent::Gb { pool: GbPool::Paid }) {
        return Err(Error::RejectedInput);
    }
    let planned = settle_reserved(gateway, id, ledger)?;
    if planned.dest_fn != "executeBridgeMint" {
        return Err(Error::BadState);
    }
    Ok(planned)
}

/// Miner vote names are refused. They are not an AAC proof.
pub fn reject_vote(name: &str) -> Result<(), Error> {
    match name {
        "voteBridgeMint" | "voteBridgeOperation" | "voteMintDeveloper" => Err(Error::RejectedInput),
        _ => Err(Error::BadFixture),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerCall {
    CreateErc20 {
        name: String,
        symbol: String,
        decimals: u8,
        gb_bound: bool,
    },
    /// Another `CREATE`. It consumes a nonce and is not a developer token.
    CreateOther,
    /// A call that does not create a contract.
    Call,
}

/// Both chains must `createERC20` once, at the same nonce, with the same parameters.
///
/// Only a `CREATE` advances the nonce. The returned address is the Ethereum
/// `CREATE` address of Peer v5 at that nonce. It is computed locally.
pub fn aligned_create_address(left: &[PeerCall], right: &[PeerCall]) -> Result<Address, Error> {
    let a = create_records(left);
    let b = create_records(right);
    if a.len() != 1 || b.len() != 1 || a[0] != b[0] {
        return Err(Error::NonceMismatch);
    }
    Ok(a[0].address)
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CreateRecord {
    nonce: u64,
    name: String,
    symbol: String,
    decimals: u8,
    gb_bound: bool,
    address: Address,
}

fn create_records(calls: &[PeerCall]) -> Vec<CreateRecord> {
    let mut nonce = 1u64;
    let mut out = Vec::new();
    for call in calls {
        match call {
            PeerCall::Call => {}
            PeerCall::CreateOther => nonce += 1,
            PeerCall::CreateErc20 {
                name,
                symbol,
                decimals,
                gb_bound,
            } => {
                out.push(CreateRecord {
                    nonce,
                    address: create_address(bindings::peer_v5(), nonce),
                    name: name.clone(),
                    symbol: symbol.clone(),
                    decimals: *decimals,
                    gb_bound: *gb_bound,
                });
                nonce += 1;
            }
        }
    }
    out
}

/// Ethereum `CREATE` address: `keccak256(rlp([sender, nonce]))[12:]`.
pub fn create_address(sender: Address, nonce: u64) -> Address {
    let nonce_bytes = trim_be(nonce);
    let payload = [rlp_item(&sender.0), rlp_item(&nonce_bytes)].concat();
    let encoded = rlp_list(&payload);
    let hash = keccak256(&encoded);
    let mut out = [0u8; 20];
    out.copy_from_slice(&hash[12..]);
    Address(out)
}

pub fn settle_report(
    fixture: &str,
    index: usize,
    allow_header: Option<[u8; 32]>,
    circle_on_base_treasury: u128,
    journal: Option<&std::path::Path>,
) -> Result<String, Error> {
    use crate::finality::MockFinality;
    use crate::gateway::Gateway;
    use crate::receipt::BuiltProof;
    use crate::finality::HeaderCommitment;

    let built: BuiltProof = build_from_fixture(fixture, index)?;
    let allowed = allow_header.is_some_and(|hash| hash == built.header_hash);
    let mut header = format!(
        "aac_id {}\nbroadcast no\ndeployed no\nheader-check mock-allowlist\nlight-client no\n",
        built.deposit.aac_id()
    );
    if !allowed {
        header.push_str("accepted no\nstate none\n");
        return Ok(header);
    }
    let mut verifier = MockFinality::new();
    verifier.accept(built.chain_id, built.header_hash, built.state_root);
    let mut gateway = Gateway::new(verifier);
    if let Some(path) = journal {
        load_into(path, &mut gateway)?;
    }
    let commitment = HeaderCommitment {
        chain_id: built.chain_id,
        header_hash: built.header_hash,
        state_root: built.state_root,
    };
    let id = match gateway.submit(built.deposit.clone(), &commitment, &built.proof) {
        Ok(id) => id,
        Err(Error::AlreadyExists) => {
            header.push_str("final true\nreplay yes\nsettled no\n");
            return Ok(header);
        }
        Err(other) => return Err(other),
    };
    gateway.reserve(&id)?;
    if let Some(path) = journal {
        save_gateway(path, &gateway)?;
    }
    let mut ledger = TestLedger::new(circle_on_base_treasury);
    match settle_reserved(&mut gateway, &id, &mut ledger) {
        Err(Error::ShortBalance) => {
            header.push_str("final true\nstate reserved\nsettled no\nshort-balance yes\n");
            Ok(header)
        }
        Err(other) => Err(other),
        Ok(planned) => {
            if let Some(path) = journal {
                save_gateway(path, &gateway)?;
            }
            let balance = ledger.balance(
                built.deposit.destination_chain_id,
                built.deposit.destination_asset,
                built.deposit.recipient,
            );
            header.push_str(&format!(
                "source-fn {}\ndest-fn {}\ndest-to {}\nselector {}\nvoteBridgeMint no\nvoteBridgeOperation no\nfinal true\nstate {}\nrecipient-balance {balance}\n",
                planned.source_fn,
                planned.dest_fn,
                planned.dest_to,
                hex_selector(planned.selector),
                state_word(gateway.get(&id).map(|r| r.state).unwrap_or(AacState::Reserved)),
            ));
            Ok(header)
        }
    }
}

fn state_word(state: AacState) -> &'static str {
    match state {
        AacState::Verified => "verified",
        AacState::Reserved => "reserved",
        AacState::Minted => "minted",
        AacState::Released => "released",
    }
}

fn selector(signature: &str) -> [u8; 4] {
    let hash = keccak256(signature.as_bytes());
    let mut out = [0u8; 4];
    out.copy_from_slice(&hash[..4]);
    out
}

fn hex_selector(bytes: [u8; 4]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn amount_u128(amount: &[u8; 32]) -> Result<u128, Error> {
    if amount[..16].iter().any(|byte| *byte != 0) {
        return Err(Error::BadLength);
    }
    let mut buf = [0u8; 16];
    buf.copy_from_slice(&amount[16..]);
    Ok(u128::from_be_bytes(buf))
}

fn trim_be(value: u64) -> Vec<u8> {
    if value == 0 {
        return Vec::new();
    }
    let bytes = value.to_be_bytes();
    let start = bytes.iter().position(|byte| *byte != 0).unwrap_or(0);
    bytes[start..].to_vec()
}

fn rlp_item(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return bytes.to_vec();
    }
    let mut out = Vec::with_capacity(1 + bytes.len());
    out.push(0x80 + bytes.len() as u8);
    out.extend_from_slice(bytes);
    out
}

fn rlp_list(payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + payload.len());
    out.push(0xc0 + payload.len() as u8);
    out.extend_from_slice(payload);
    out
}
