use dat_engine::cipher::CipherError;

use crate::cursor::CursorError;

#[derive(Debug)]
pub enum PackageError {
    Io(std::io::Error),
    Cipher(CipherError),
    Cursor(CursorError),
    BadMagic(u32),
    UnsupportedVersion(u16),
    IndexOutOfRange { table: &'static str, index: i32, len: usize },
    Stage {
        stage: &'static str,
        cursor: usize,
        total: usize,
        detail: String,
        recent_hex: String,
    },
}

impl std::fmt::Display for PackageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageError::Io(e) => write!(f, "io: {e}"),
            PackageError::Cipher(e) => write!(f, "cipher: {e}"),
            PackageError::Cursor(e) => write!(f, "{e}"),
            PackageError::BadMagic(m) => write!(f, "not a UE package (magic = {m:#010x})"),
            PackageError::UnsupportedVersion(v) => write!(f, "unsupported package version {v}"),
            PackageError::IndexOutOfRange { table, index, len } => {
                write!(f, "{table} index {index} out of range (0..{len})")
            }
            PackageError::Stage { stage, cursor, total, detail, recent_hex } => write!(
                f,
                "[{stage}] {detail} (cursor=0x{cursor:X}/{cursor}, total=0x{total:X}/{total}, recent={recent_hex})"
            ),
        }
    }
}

impl std::error::Error for PackageError {}

impl From<std::io::Error> for PackageError {
    fn from(e: std::io::Error) -> Self {
        PackageError::Io(e)
    }
}

impl From<CipherError> for PackageError {
    fn from(e: CipherError) -> Self {
        PackageError::Cipher(e)
    }
}

impl From<CursorError> for PackageError {
    fn from(e: CursorError) -> Self {
        PackageError::Cursor(e)
    }
}

pub(super) fn stage(stage: &'static str, bytes: &[u8], anchor: usize, e: PackageError) -> PackageError {
    let detail = match &e {
        PackageError::Cursor(c) => c.to_string(),
        PackageError::IndexOutOfRange { table, index, len } => {
            format!("{table} index {index} out of range (0..{len})")
        }
        other => other.to_string(),
    };
    let start = anchor.saturating_sub(16);
    let end = (anchor + 32).min(bytes.len());
    let recent_hex = bytes[start..end]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(" ");
    PackageError::Stage {
        stage,
        cursor: anchor,
        total: bytes.len(),
        detail,
        recent_hex,
    }
}
