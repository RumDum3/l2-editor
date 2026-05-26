use serde::Serialize;

use crate::cursor::{Cursor, CursorError};
use crate::package::error::PackageError;

const PACKAGE_MAGIC: u32 = 0x9E2A83C1;

#[derive(Debug, Clone, Serialize)]
pub struct PackageHeader {
    pub version: u16,
    pub licensee_version: u16,
    pub package_flags: u32,
    pub name_count: u32,
    pub name_offset: u32,
    pub export_count: u32,
    pub export_offset: u32,
    pub import_count: u32,
    pub import_offset: u32,
    pub guid: [u8; 16],
}

pub(super) fn parse_header(bytes: &[u8]) -> Result<PackageHeader, PackageError> {
    let mut c = Cursor::new(bytes);
    let magic = c.read_u32()?;
    if magic != PACKAGE_MAGIC {
        return Err(PackageError::BadMagic(magic));
    }
    let version = c.read_u16()?;
    let licensee_version = c.read_u16()?;
    if !(60..=150).contains(&version) {
        return Err(PackageError::UnsupportedVersion(version));
    }

    let package_flags = c.read_u32()?;
    let name_count = c.read_u32()?;
    let name_offset = c.read_u32()?;
    let export_count = c.read_u32()?;
    let export_offset = c.read_u32()?;
    let import_count = c.read_u32()?;
    let import_offset = c.read_u32()?;

    let total = bytes.len();
    for (label, off) in [
        ("name_offset", name_offset),
        ("export_offset", export_offset),
        ("import_offset", import_offset),
    ] {
        if off as usize >= total {
            return Err(PackageError::Cursor(CursorError::BadString(label)));
        }
    }
    if name_count as usize > total / 4
        || export_count as usize > total / 4
        || import_count as usize > total / 4
    {
        return Err(PackageError::Cursor(CursorError::BadString("table count exceeds buffer")));
    }

    let mut guid = [0u8; 16];
    if version >= 68 {
        let g = c.read_bytes(16)?;
        guid.copy_from_slice(g);
        let gen_count = c.read_u32()?;
        // L2 v100+ uses 12 bytes per generation; stock UE2 uses 8.
        let gen_size = if version >= 100 { 12 } else { 8 };
        c.skip(gen_count as usize * gen_size)?;
    }

    // Late L2 chronicles append an extra i32 before the name table.
    if licensee_version >= 0x1C && (c.position() as u32) + 4 == name_offset {
        c.skip(4)?;
    }

    Ok(PackageHeader {
        version,
        licensee_version,
        package_flags,
        name_count,
        name_offset,
        export_count,
        export_offset,
        import_count,
        import_offset,
        guid,
    })
}
