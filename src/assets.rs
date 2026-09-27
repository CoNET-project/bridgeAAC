use crate::types::Address;

/// How the destination gateway settles a reserved AAC.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Settlement {
    /// Mint the destination representation. Used by USDC lock-mint, paid GB, and unbound developer tokens.
    Mint,
    /// Pay the destination asset from the gateway balance. Used by USDC burn-release.
    Release,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GbPool {
    Paid,
    Free,
}

/// Cross-chain asset the AAC is allowed to represent.
///
/// GB-priced developer tokens and free GB are rejected. They have no AAC.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssetIntent {
    UsdcLockMint,
    UsdcBurnRelease,
    Gb { pool: GbPool },
    Developer { gb_bound: bool },
}

impl AssetIntent {
    pub fn is_bridgeable(self) -> bool {
        match self {
            AssetIntent::UsdcLockMint | AssetIntent::UsdcBurnRelease => true,
            AssetIntent::Gb { pool } => matches!(pool, GbPool::Paid),
            AssetIntent::Developer { gb_bound } => !gb_bound,
        }
    }

    pub fn settlement(self) -> Settlement {
        match self {
            AssetIntent::UsdcBurnRelease => Settlement::Release,
            _ => Settlement::Mint,
        }
    }

    pub fn kind_byte(self) -> u8 {
        match self {
            AssetIntent::UsdcLockMint => 1,
            AssetIntent::UsdcBurnRelease => 2,
            AssetIntent::Gb { pool: GbPool::Paid } => 3,
            AssetIntent::Developer { gb_bound: false } => 4,
            AssetIntent::Gb { pool: GbPool::Free } | AssetIntent::Developer { gb_bound: true } => 0,
        }
    }
}

/// Intended production gateways. Storage on each chain is independent.
/// This crate does not send transactions to them.
pub mod bindings {
    use super::Address;

    pub const CONET_CHAIN_ID: u64 = 224_422;
    pub const BASE_CHAIN_ID: u64 = 8453;

    pub fn treasury_v3() -> Address {
        Address::parse("0xa208982212978550594A7FEEB70a61665d129003").expect("treasury v3")
    }

    pub fn conet_usdc() -> Address {
        Address::parse("0x5209865D404aA5646eDe5B91CD4218909eA72eDA").expect("conet usdc")
    }

    pub fn circle_usdc() -> Address {
        Address::parse("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").expect("circle usdc")
    }

    pub fn gb_token() -> Address {
        Address::parse("0xC3EF02DaE632b4C10abB66e07d92a387c10838D8").expect("gb")
    }

    pub fn peer_v5() -> Address {
        Address::parse("0x1DF0F1826e9085caDB2bDc927A117140FAb39066").expect("peer v5")
    }
}
