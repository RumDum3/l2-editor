pub mod cache;
pub mod encode;
pub mod package;
pub mod properties;
pub mod terrain;
pub mod texture;
pub mod write;

use std::fs;
use std::path::Path;

use dat_engine::cipher::CipherError;
use package::PackageError;
use texture::TextureError;

pub fn decrypt_file(path: &Path) -> Result<(u32, Vec<u8>), CipherError> {
    let bytes = fs::read(path)?;
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    dat_engine::cipher::decrypt(&bytes, &file_name)
}

#[derive(Debug)]
pub enum ExtractError {
    Crypt(CipherError),
    Package(PackageError),
    Texture(TextureError),
}

impl From<CipherError> for ExtractError {
    fn from(e: CipherError) -> Self {
        ExtractError::Crypt(e)
    }
}
impl From<PackageError> for ExtractError {
    fn from(e: PackageError) -> Self {
        ExtractError::Package(e)
    }
}
impl From<TextureError> for ExtractError {
    fn from(e: TextureError) -> Self {
        ExtractError::Texture(e)
    }
}

impl std::fmt::Display for ExtractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExtractError::Crypt(e) => write!(f, "decrypt: {}", e),
            ExtractError::Package(e) => write!(f, "package: {}", e),
            ExtractError::Texture(e) => write!(f, "texture: {}", e),
        }
    }
}
