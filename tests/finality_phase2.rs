use bridge_aac::{
    assess, bindings, BaseFinality, ConetFinality, Deposit, DepositId, Error, ExecBlock,
    ExecutionView, FinalityLevel, FinalityVerifier, AssetIntent,
};
use std::collections::HashMap;

struct FakeChain {
    id: u64,
    blocks: HashMap<u64, [u8; 32]>,
    finalized: u64,
}

impl ExecutionView for FakeChain {
    fn chain_id(&self) -> Result<u64, Error> {
        Ok(self.id)
    }
    fn block_by_hash(&self, hash: &[u8; 32]) -> Result<ExecBlock, Error> {
        self.blocks
            .iter()
            .find(|(_, h)| *h == hash)
            .map(|(number, hash)| ExecBlock {
                number: *number,
                hash: *hash,
                state_root: *hash,
                receipts_root: [*number as u8; 32],
            })
            .ok_or(Error::UnknownHeader)
    }
    fn block_by_number(&self, number: u64) -> Result<ExecBlock, Error> {
        self.blocks
            .get(&number)
            .copied()
            .map(|hash| ExecBlock {
                number,
                hash,
                state_root: hash,
                receipts_root: [number as u8; 32],
            })
            .ok_or(Error::UnknownHeader)
    }
    fn block_by_tag(&self, tag: &str) -> Result<ExecBlock, Error> {
        let number = match tag {
            "finalized" | "safe" => self.finalized,
            _ => return Err(Error::UnknownHeader),
        };
        self.block_by_number(number)
    }
}

fn chain() -> FakeChain {
    let mut blocks = HashMap::new();
    blocks.insert(10, [1u8; 32]);
    blocks.insert(11, [2u8; 32]);
    FakeChain { id: bindings::BASE_CHAIN_ID, blocks, finalized: 10 }
}

#[test]
fn canonical_header_at_finalized_height_is_accepted() {
    let api = chain();
    assert!(assess(bindings::BASE_CHAIN_ID, &[1u8; 32], FinalityLevel::Finalized, &api).is_ok());
}

#[test]
fn header_past_finalized_or_not_canonical_is_unknown() {
    let api = chain();
    assert_eq!(
        assess(bindings::BASE_CHAIN_ID, &[2u8; 32], FinalityLevel::Finalized, &api),
        Err(Error::UnknownHeader)
    );
    assert_eq!(
        assess(bindings::BASE_CHAIN_ID, &[9u8; 32], FinalityLevel::Finalized, &api),
        Err(Error::UnknownHeader)
    );
}

#[test]
fn base_and_conet_verifiers_reject_the_other_chain() {
    let base = BaseFinality { api: chain(), level: FinalityLevel::Finalized };
    assert_eq!(
        base.header_is_final(bindings::CONET_CHAIN_ID, &[1u8; 32]),
        Err(Error::ChainMismatch)
    );
    let mut conet_api = chain();
    conet_api.id = bindings::CONET_CHAIN_ID;
    let conet = ConetFinality { api: conet_api, level: FinalityLevel::Finalized };
    assert_eq!(
        conet.header_is_final(bindings::BASE_CHAIN_ID, &[1u8; 32]),
        Err(Error::ChainMismatch)
    );
    assert!(conet.header_is_final(bindings::CONET_CHAIN_ID, &[1u8; 32]).is_ok());
}

#[test]
fn swapping_the_verifier_does_not_change_the_aac_id() {
    let deposit = Deposit::try_new(
        AssetIntent::UsdcBurnRelease,
        bindings::CONET_CHAIN_ID,
        bindings::BASE_CHAIN_ID,
        bindings::treasury_v3(),
        bindings::conet_usdc(),
        bindings::circle_usdc(),
        bindings::peer_v5(),
        [3u8; 32],
        DepositId([4u8; 32]),
        [5u8; 32],
    )
    .unwrap();
    let id = deposit.aac_id();
    let mut api = chain();
    api.id = bindings::CONET_CHAIN_ID;
    let conet = ConetFinality { api, level: FinalityLevel::Finalized };
    assert!(conet.header_is_final(deposit.source_chain_id, &[1u8; 32]).is_ok());
    assert_eq!(deposit.aac_id(), id);
}
