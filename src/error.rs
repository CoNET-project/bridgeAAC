use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Error {
    BadHex,
    BadLength,
    NotBridgeable,
    UnknownHeader,
    MerkleMismatch,
    ChainMismatch,
    AlreadyExists,
    UnknownAac,
    BadState,
    Paused,
    DigestMismatch,
    BadFixture,
    BadIndex,
    Rpc,
    /// Destination release balance is below the AAC amount. The record stays `Reserved`.
    ShortBalance,
    /// A miner vote was offered as a proof or as `executeBridgeMint` input.
    RejectedInput,
    /// The two Peer v5 `createERC20` sequences do not share one nonce and one parameter set.
    NonceMismatch,
    Journal,
    /// Two execution clients disagreed on the canonical header.
    Quorum,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for Error {}
