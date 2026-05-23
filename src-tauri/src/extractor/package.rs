use std::io::{self, Cursor, Read};

use byteorder::{LittleEndian, ReadBytesExt};

const PACKAGE_TAG: u32 = 0x9E2A83C1;

#[derive(Debug)]
pub enum PackageError {
    Io(io::Error),
    NotAPackage,
    BadCompactInt,
    BadUtf8,
}

impl From<io::Error> for PackageError {
    fn from(e: io::Error) -> Self {
        PackageError::Io(e)
    }
}

impl std::fmt::Display for PackageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageError::Io(e) => write!(f, "io: {}", e),
            PackageError::NotAPackage => write!(f, "not a UE2 package (bad magic)"),
            PackageError::BadCompactInt => write!(f, "bad compact int"),
            PackageError::BadUtf8 => write!(f, "name table contains non-UTF8 bytes"),
        }
    }
}

impl std::error::Error for PackageError {}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Header {
    pub file_version: u16,
    pub licensee_version: u16,
    pub package_flags: u32,
    pub name_count: u32,
    pub name_offset: u32,
    pub export_count: u32,
    pub export_offset: u32,
    pub import_count: u32,
    pub import_offset: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct NameEntry {
    pub name: String,
    pub flags: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ExportEntry {
    pub class_index: i32,
    pub super_index: i32,
    pub outer_index: i32,
    pub name_index: i32,
    pub flags: u32,
    pub serial_size: i32,
    pub serial_offset: i32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportEntry {
    pub class_package: i32,
    pub class_name: i32,
    pub outer_index: i32,
    pub name_index: i32,
}

pub struct Package {
    #[allow(dead_code)]
    pub bytes: Vec<u8>,
    pub header: Header,
    pub names: Vec<NameEntry>,
    pub exports: Vec<ExportEntry>,
    pub imports: Vec<ImportEntry>,
}

impl Package {
    pub fn parse(bytes: Vec<u8>) -> Result<Self, PackageError> {
        let header = Self::read_header(&bytes)?;
        let names = Self::read_names(&bytes, &header)?;
        let imports = Self::read_imports(&bytes, &header)?;
        let exports = Self::read_exports(&bytes, &header)?;
        Ok(Self { bytes, header, names, exports, imports })
    }

    fn read_header(bytes: &[u8]) -> Result<Header, PackageError> {
        let mut r = Cursor::new(bytes);
        let tag = r.read_u32::<LittleEndian>()?;
        if tag != PACKAGE_TAG {
            return Err(PackageError::NotAPackage);
        }
        let file_version = r.read_u16::<LittleEndian>()?;
        let licensee_version = r.read_u16::<LittleEndian>()?;
        let package_flags = r.read_u32::<LittleEndian>()?;
        let name_count = r.read_u32::<LittleEndian>()?;
        let name_offset = r.read_u32::<LittleEndian>()?;
        let export_count = r.read_u32::<LittleEndian>()?;
        let export_offset = r.read_u32::<LittleEndian>()?;
        let import_count = r.read_u32::<LittleEndian>()?;
        let import_offset = r.read_u32::<LittleEndian>()?;
        Ok(Header {
            file_version,
            licensee_version,
            package_flags,
            name_count,
            name_offset,
            export_count,
            export_offset,
            import_count,
            import_offset,
        })
    }

    fn read_names(bytes: &[u8], h: &Header) -> Result<Vec<NameEntry>, PackageError> {
        let mut r = Cursor::new(bytes);
        r.set_position(h.name_offset as u64);
        let mut out: Vec<NameEntry> = Vec::with_capacity(h.name_count as usize);
        for i in 0..h.name_count {
            let pos_before = r.position();
            let raw_len = read_compact_int(&mut r)?;

            let name = if raw_len > 0 {
                let len = raw_len as usize;
                if len > 1024 {
                    return diagnose_bad_len(bytes, pos_before, raw_len, &out);
                }
                let mut buf = vec![0u8; len];
                r.read_exact(&mut buf)?;
                if buf.last() == Some(&0) {
                    buf.pop();
                }
                String::from_utf8(buf).map_err(|_| PackageError::BadUtf8)?
            } else if raw_len < 0 {
                let chars = (-raw_len) as usize;
                if chars > 1024 {
                    return diagnose_bad_len(bytes, pos_before, raw_len, &out);
                }
                let byte_len = chars * 2;
                let mut buf = vec![0u8; byte_len];
                r.read_exact(&mut buf)?;
                let mut units: Vec<u16> = (0..chars)
                    .map(|j| u16::from_le_bytes([buf[j * 2], buf[j * 2 + 1]]))
                    .collect();
                if units.last() == Some(&0) {
                    units.pop();
                }
                String::from_utf16_lossy(&units)
            } else {
                String::new()
            };
            let flags = r.read_u32::<LittleEndian>()?;
            let _ = (pos_before, i);
            out.push(NameEntry { name, flags });
        }
        Ok(out)
    }

    fn read_imports(bytes: &[u8], h: &Header) -> Result<Vec<ImportEntry>, PackageError> {
        let mut r = Cursor::new(bytes);
        r.set_position(h.import_offset as u64);
        let mut out = Vec::with_capacity(h.import_count as usize);
        for _ in 0..h.import_count {
            let class_package = read_compact_int(&mut r)?;
            let class_name = read_compact_int(&mut r)?;
            let outer_index = r.read_i32::<LittleEndian>()?;
            let name_index = read_compact_int(&mut r)?;
            out.push(ImportEntry { class_package, class_name, outer_index, name_index });
        }
        Ok(out)
    }

    fn read_exports(bytes: &[u8], h: &Header) -> Result<Vec<ExportEntry>, PackageError> {
        let mut r = Cursor::new(bytes);
        r.set_position(h.export_offset as u64);
        let mut out = Vec::with_capacity(h.export_count as usize);
        for _ in 0..h.export_count {
            let class_index = read_compact_int(&mut r)?;
            let super_index = read_compact_int(&mut r)?;
            let outer_index = r.read_i32::<LittleEndian>()?;
            let name_index = read_compact_int(&mut r)?;
            let flags = r.read_u32::<LittleEndian>()?;
            let serial_size = read_compact_int(&mut r)?;
            let serial_offset = if serial_size > 0 { read_compact_int(&mut r)? } else { 0 };
            out.push(ExportEntry {
                class_index,
                super_index,
                outer_index,
                name_index,
                flags,
                serial_size,
                serial_offset,
            });
        }
        Ok(out)
    }

    pub fn class_name_of(&self, export: &ExportEntry) -> Option<&str> {
        let idx = export.class_index;
        if idx == 0 {
            return Some("Class");
        }
        if idx < 0 {
            let i = (-idx - 1) as usize;
            let imp = self.imports.get(i)?;
            return self.name(imp.name_index);
        }
        let i = (idx - 1) as usize;
        let exp = self.exports.get(i)?;
        self.name(exp.name_index)
    }

    pub fn name(&self, idx: i32) -> Option<&str> {
        if idx < 0 {
            return None;
        }
        self.names.get(idx as usize).map(|n| n.name.as_str())
    }

    pub fn texture_exports(&self) -> Vec<TextureSummary> {
        let mut out = Vec::new();
        for (i, exp) in self.exports.iter().enumerate() {
            if let Some(class) = self.class_name_of(exp) {
                if class == "Texture" {
                    if let Some(name) = self.name(exp.name_index) {
                        out.push(TextureSummary {
                            export_index: i as u32,
                            name: name.to_string(),
                            serial_offset: exp.serial_offset as u32,
                            serial_size: exp.serial_size as u32,
                        });
                    }
                }
            }
        }
        out
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TextureSummary {
    pub export_index: u32,
    pub name: String,
    pub serial_offset: u32,
    pub serial_size: u32,
}

fn diagnose_bad_len(
    bytes: &[u8],
    pos_before: u64,
    raw_len: i32,
    out: &[NameEntry],
) -> Result<Vec<NameEntry>, PackageError> {
    let start = pos_before.saturating_sub(32) as usize;
    let end = (pos_before as usize + 256).min(bytes.len());
    let hex: String = bytes[start..end]
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join(" ");
    let ascii: String = bytes[start..end]
        .iter()
        .map(|&b| if (0x20..=0x7e).contains(&b) { b as char } else { '.' })
        .collect();
    eprintln!(
        "[texture] BAD NAME LEN at pos={} len={} (succeeded={})",
        pos_before, raw_len, out.len()
    );
    eprintln!("[texture]   hex   [{}..{}]: {}", start, end, hex);
    eprintln!("[texture]   ascii [{}..{}]: {}", start, end, ascii);
    if let Some(prev) = out.last() {
        eprintln!("[texture]   prev name: {:?}", prev.name);
    }
    Err(PackageError::BadCompactInt)
}

pub fn read_compact_int<R: Read>(r: &mut R) -> Result<i32, PackageError> {
    let mut buf = [0u8; 1];
    r.read_exact(&mut buf)?;
    let b0 = buf[0];
    let negative = (b0 & 0x80) != 0;
    let mut value: i32 = (b0 & 0x3F) as i32;
    if (b0 & 0x40) != 0 {
        for i in 0..4 {
            r.read_exact(&mut buf)?;
            let b = buf[0];
            value |= ((b & 0x7F) as i32) << (6 + i * 7);
            if (b & 0x80) == 0 {
                break;
            }
        }
    }
    if negative {
        value = -value;
    }
    Ok(value)
}
