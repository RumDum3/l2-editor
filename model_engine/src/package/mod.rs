mod error;
mod header;
mod summary;
mod tables;

use std::fs;
use std::path::{Path, PathBuf};

use dat_engine::cipher::{self, CipherError};

pub use error::PackageError;
pub use header::PackageHeader;
pub use summary::PackageSummary;
pub use tables::{ExportEntry, ImportEntry};

pub struct Package {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
    pub cipher_code: u32,
    pub header: PackageHeader,
    pub names: Vec<String>,
    pub imports: Vec<ImportEntry>,
    pub exports: Vec<ExportEntry>,
}

impl Package {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, PackageError> {
        let path = path.as_ref().to_path_buf();
        let raw = fs::read(&path)?;
        Self::from_bytes(path, &raw)
    }

    pub fn from_bytes(path: PathBuf, raw: &[u8]) -> Result<Self, PackageError> {
        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let (cipher_code, plaintext) = match cipher::decrypt(raw, &file_name) {
            Ok(p) => p,
            Err(CipherError::NotL2File) => (0, raw.to_vec()),
            Err(e) => return Err(PackageError::Cipher(e)),
        };
        Self::parse(path, plaintext, cipher_code)
    }

    fn parse(path: PathBuf, bytes: Vec<u8>, cipher_code: u32) -> Result<Self, PackageError> {
        let header = header::parse_header(&bytes).map_err(|e| error::stage("header", &bytes, 0, e))?;
        let names = tables::read_name_table(&bytes, &header)
            .map_err(|e| error::stage("name_table", &bytes, header.name_offset as usize, e))?;
        let imports = tables::read_import_table(&bytes, &header, &names)
            .map_err(|e| error::stage("import_table", &bytes, header.import_offset as usize, e))?;
        let exports = tables::read_export_table(&bytes, &header, &names, &imports)
            .map_err(|e| error::stage("export_table", &bytes, header.export_offset as usize, e))?;
        Ok(Self {
            path,
            bytes,
            cipher_code,
            header,
            names,
            imports,
            exports,
        })
    }

    pub fn summarize(&self, sample_size: usize) -> PackageSummary {
        summary::summarize(self, sample_size)
    }

    pub fn find_export(&self, name: &str) -> Option<&ExportEntry> {
        self.exports
            .iter()
            .find(|e| e.full_name == name || e.object_name == name)
    }
}
