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
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for Error {}
