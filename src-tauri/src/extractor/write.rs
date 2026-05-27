use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use dat_engine::cipher;

use super::decrypt_file;
use super::encode::{self, EncodeError};
use super::package::Package;
use super::properties::TextureFormat;
use super::texture::{scan_texture_layout, MipLayout, TextureError};

#[derive(Debug)]
pub enum WriteError {
    Io(std::io::Error),
    Crypt(String),
    Texture(TextureError),
    Encode(EncodeError),
    NotFound(String),
    SizeMismatch { expected: usize, got: usize, mip: usize },
    DimensionMismatch { expected: (u32, u32), got: (u32, u32) },
    NotImplemented(&'static str),
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WriteError::Io(e) => write!(f, "io: {e}"),
            WriteError::Crypt(s) => write!(f, "cipher: {s}"),
            WriteError::Texture(e) => write!(f, "texture: {e}"),
            WriteError::Encode(e) => write!(f, "encode: {e}"),
            WriteError::NotFound(s) => write!(f, "not found: {s}"),
            WriteError::SizeMismatch { expected, got, mip } => {
                write!(f, "mip {mip}: encoded {got} bytes but original was {expected}")
            }
            WriteError::DimensionMismatch { expected, got } => write!(
                f,
                "dimension mismatch: expected {}x{}, got {}x{}",
                expected.0, expected.1, got.0, got.1
            ),
            WriteError::NotImplemented(s) => write!(f, "not yet implemented: {s}"),
        }
    }
}

impl std::error::Error for WriteError {}

impl From<std::io::Error> for WriteError {
    fn from(e: std::io::Error) -> Self {
        WriteError::Io(e)
    }
}

impl From<TextureError> for WriteError {
    fn from(e: TextureError) -> Self {
        WriteError::Texture(e)
    }
}

impl From<EncodeError> for WriteError {
    fn from(e: EncodeError) -> Self {
        WriteError::Encode(e)
    }
}

pub struct ReplaceResult {
    pub utx_path: PathBuf,
    pub bytes_written: usize,
    pub mips_replaced: usize,
    pub backup_path: Option<PathBuf>,
}

// Replace one texture's pixel data in the .utx, keeping format/dimensions/mip-count identical.
// Safe path: every export's byte size and offset stays unchanged.
pub fn replace_texture_same_size(
    utx_path: &Path,
    package_name: &str,
    export_name: &str,
    new_rgba: &[u8],
    new_w: u32,
    new_h: u32,
) -> Result<ReplaceResult, WriteError> {
    let (cipher_code, plaintext) = decrypt_file(utx_path).map_err(|e| WriteError::Crypt(e.to_string()))?;
    let pkg = Package::parse(plaintext.clone())
        .map_err(|e| WriteError::Crypt(format!("parse: {e:?}")))?;

    let summary = pkg
        .texture_exports()
        .into_iter()
        .find(|t| t.name == export_name)
        .ok_or_else(|| WriteError::NotFound(format!("'{export_name}' in package {package_name}")))?;
    let export = pkg
        .exports
        .get(summary.export_index as usize)
        .ok_or_else(|| WriteError::NotFound("export index out of range".into()))?;

    let layout = scan_texture_layout(&pkg, export)?;
    if (new_w, new_h) != (layout.width, layout.height) {
        return Err(WriteError::DimensionMismatch {
            expected: (layout.width, layout.height),
            got: (new_w, new_h),
        });
    }

    let mips = encode::build_mip_chain(new_rgba, new_w, new_h, layout.format, layout.mips.len())?;
    if mips.len() != layout.mips.len() {
        return Err(WriteError::SizeMismatch {
            expected: layout.mips.len(),
            got: mips.len(),
            mip: 0,
        });
    }
    for (i, (orig, new)) in layout.mips.iter().zip(mips.iter()).enumerate() {
        if orig.data_len != new.bytes.len() {
            return Err(WriteError::SizeMismatch {
                expected: orig.data_len,
                got: new.bytes.len(),
                mip: i,
            });
        }
    }

    let mut buf = plaintext;
    for (orig, new) in layout.mips.iter().zip(mips.iter()) {
        let start = orig.data_offset;
        let end = start + orig.data_len;
        buf[start..end].copy_from_slice(&new.bytes);
    }

    let file_name = utx_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let encrypted = cipher::encrypt(&buf, cipher_code, &file_name, |_, _| {})
        .map_err(|e| WriteError::Crypt(e.to_string()))?;

    let backup_path = make_backup(utx_path)?;
    atomic_write(utx_path, &encrypted)?;

    Ok(ReplaceResult {
        utx_path: utx_path.to_path_buf(),
        bytes_written: encrypted.len(),
        mips_replaced: layout.mips.len(),
        backup_path,
    })
}

fn make_backup(target: &Path) -> Result<Option<PathBuf>, WriteError> {
    let backup = target.with_extension(format!(
        "{}.bak",
        target.extension().and_then(|s| s.to_str()).unwrap_or("utx")
    ));
    if backup.exists() {
        return Ok(Some(backup));
    }
    fs::copy(target, &backup)?;
    Ok(Some(backup))
}

fn atomic_write(target: &Path, bytes: &[u8]) -> Result<(), WriteError> {
    let tmp = target.with_extension("utx.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, target)?;
    Ok(())
}

// Resize an arbitrary RGBA buffer to match the target dimensions, useful when the
// supplied PNG is the same aspect-ratio but slightly different size, or when the
// caller wants a controlled upscale/downscale before re-encoding at the original size.
pub fn resize_to_match(
    src_rgba: &[u8],
    src_w: u32,
    src_h: u32,
    target_w: u32,
    target_h: u32,
) -> Vec<u8> {
    encode::resize_rgba(src_rgba, src_w, src_h, target_w, target_h)
}
