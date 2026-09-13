use std::fmt;

/// Errors from the native calc core. Both variants surface as HTTP 422
/// with a `{"detail": "<message>"}` body, mirroring `backend/main.py`'s
/// `ValueError -> 422` mapping (math) and request-validation rejects.
#[derive(Debug, Clone, PartialEq)]
pub enum CalcError {
    /// Bad math input (mirrors `logic.py` `ValueError` messages verbatim).
    Math(String),
    /// Request-shape rejection (mirrors FastAPI/pydantic 422 semantics).
    Validation(String),
}

impl CalcError {
    pub fn math(message: impl Into<String>) -> Self {
        Self::Math(message.into())
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    /// HTTP status for the gateway route layer (always 422 today).
    pub fn status(&self) -> u16 {
        422
    }

    pub fn detail(&self) -> &str {
        match self {
            Self::Math(message) | Self::Validation(message) => message,
        }
    }
}

impl fmt::Display for CalcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.detail())
    }
}

impl std::error::Error for CalcError {}
