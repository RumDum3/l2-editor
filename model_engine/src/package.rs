//! UE2 package parser (Lineage 2 variant).
//!
//! A UE2 package — extension `.u`, `.ukx`, `.utx`, `.usx`, `.unr`, `.uax` —
//! is a single file containing a header, a name table, an import table, an
//! export table, and a blob of object data the exports point into.
//!
//! Lineage 2 packages are encrypted with the same Lineage2Ver cipher
//! `dat_engine` already handles; we decrypt first and parse the plaintext.
//!
//! References (all consulted, none copied):
//!   - UE Viewer (Gildor) `Unreal/UnrealPackage/UnPackage2.cpp`
//!   - l2mapper `src/L2Lib/UPackage.cpp`
//!   - the long-standing community spec on the UE2 file format
//!
//! Scope of phase 1: just the header + the three tables. No object body
//! deserialization yet — that comes in phase 2 with USkeletalMesh.

use std::fs;
use std::path::{Path, PathBuf};

use dat_engine::cipher::{self, CipherError};
use serde::Serialize;

use crate::cursor::{Cursor, CursorError};

const PACKAGE_MAGIC: u32 = 0x9E2A83C1;

#[derive(Debug)]
pub enum PackageError {
    Io(std::io::Error),
    Cipher(CipherError),
    Cursor(CursorError),
    BadMagic(u32),
    UnsupportedVersion(u16),
    IndexOutOfRange { table: &'static str, index: i32, len: usize },
    /// Stage-tagged failure: which step + cursor position + remaining bytes.
    /// Replaces a bare CursorError so the dev probe can tell us where to look.
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
            PackageError::Stage { stage, cursor, total, detail, recent_hex } => {
                write!(
                    f,
                    "[{stage}] {detail} (cursor=0x{cursor:X}/{cursor}, total=0x{total:X}/{total}, recent={recent_hex})"
                )
            }
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

/// Parsed package header. Fields we don't use right now are kept around so
/// downstream phases (mesh decoder) can pick them up without re-parsing.
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
    /// Some L2 packages carry a "heritage" table after imports — we skip it.
    pub guid: [u8; 16],
}

/// A single entry in the export table. We collapse a few "stream offset"
/// fields into a single span (`serial_offset`, `serial_size`) which is what
/// the mesh decoder will need.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEntry {
    pub class_index: i32,
    pub super_index: i32,
    pub package_index: i32,
    pub object_name_index: i32,
    pub object_flags: u32,
    pub serial_size: u32,
    pub serial_offset: u32,
    /// Resolved object name, e.g. "Spider01".
    pub object_name: String,
    /// Resolved class name via class_index, e.g. "SkeletalMesh".
    /// "Class" itself when class_index == 0.
    pub class_name: String,
    /// Dotted path including parent groups, e.g. "Mob.Spider01".
    pub full_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub class_package_index: i32,
    pub class_name_index: i32,
    pub package_index: i32,
    pub object_name_index: i32,
    pub class_package: String,
    pub class_name: String,
    pub object_name: String,
    pub full_name: String,
}

/// A package after parse. Owns the decrypted bytes so callers can rewind into
/// the object body for individual exports later.
pub struct Package {
    pub path: PathBuf,
    pub bytes: Vec<u8>,
    pub cipher_code: u32,
    pub header: PackageHeader,
    pub names: Vec<String>,
    pub imports: Vec<ImportEntry>,
    pub exports: Vec<ExportEntry>,
}

/// Compact summary for IPC / UI display — no raw bytes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSummary {
    pub path: String,
    pub cipher_code: u32,
    pub version: u16,
    pub licensee_version: u16,
    pub name_count: usize,
    pub import_count: usize,
    pub export_count: usize,
    /// First N export entries for quick verification.
    pub exports_sample: Vec<ExportEntry>,
    /// First N imports too — useful to see what packages this one depends on.
    pub imports_sample: Vec<ImportEntry>,
    /// Distinct class names that appear in the export table, with counts.
    /// Tells you at a glance "this package has 47 SkeletalMesh, 12 Material…"
    pub export_class_histogram: Vec<(String, usize)>,
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

        // L2 packages are encrypted; dat_engine returns plaintext for any
        // supported cipher. If the file isn't a Lineage2Ver* file (some test
        // packages and UEViewer extracts are stored decrypted) fall back to
        // treating the raw bytes as plaintext.
        let (cipher_code, plaintext) = match cipher::decrypt(raw, &file_name) {
            Ok(p) => p,
            Err(CipherError::NotL2File) => (0, raw.to_vec()),
            Err(e) => return Err(PackageError::Cipher(e)),
        };

        Self::parse(path, plaintext, cipher_code)
    }

    fn parse(path: PathBuf, bytes: Vec<u8>, cipher_code: u32) -> Result<Self, PackageError> {
        let header = parse_header(&bytes).map_err(|e| stage("header", &bytes, 0, e))?;
        let names = read_name_table(&bytes, &header)
            .map_err(|e| stage("name_table", &bytes, header.name_offset as usize, e))?;
        let imports = read_import_table(&bytes, &header, &names)
            .map_err(|e| stage("import_table", &bytes, header.import_offset as usize, e))?;
        let exports = read_export_table(&bytes, &header, &names, &imports)
            .map_err(|e| stage("export_table", &bytes, header.export_offset as usize, e))?;
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
        let mut hist: std::collections::BTreeMap<String, usize> = Default::default();
        for e in &self.exports {
            *hist.entry(e.class_name.clone()).or_insert(0) += 1;
        }
        let mut export_class_histogram: Vec<_> = hist.into_iter().collect();
        export_class_histogram.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        PackageSummary {
            path: self.path.to_string_lossy().into_owned(),
            cipher_code: self.cipher_code,
            version: self.header.version,
            licensee_version: self.header.licensee_version,
            name_count: self.names.len(),
            import_count: self.imports.len(),
            export_count: self.exports.len(),
            exports_sample: self.exports.iter().take(sample_size).cloned().collect(),
            imports_sample: self.imports.iter().take(sample_size).cloned().collect(),
            export_class_histogram,
        }
    }

    /// Look up an export by its dotted full name (e.g. "Mob.Spider01" or
    /// just "Spider01" if it lives at the package root).
    pub fn find_export(&self, name: &str) -> Option<&ExportEntry> {
        self.exports.iter().find(|e| e.full_name == name || e.object_name == name)
    }
}

fn stage(stage: &'static str, bytes: &[u8], anchor: usize, e: PackageError) -> PackageError {
    // Anchor is where we *expected* to be in the buffer for this stage (e.g.
    // header.name_offset for the name-table stage). For Cursor errors we
    // don't know exactly how far the cursor got inside the table reader, so
    // we surface both the anchor and a hexdump of the bytes near it.
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

fn parse_header(bytes: &[u8]) -> Result<PackageHeader, PackageError> {
    let mut c = Cursor::new(bytes);
    let magic = c.read_u32()?;
    if magic != PACKAGE_MAGIC {
        return Err(PackageError::BadMagic(magic));
    }
    let version = c.read_u16()?;
    let licensee_version = c.read_u16()?;
    if !(60..=150).contains(&version) {
        // UE2-era L2 packages cluster between ~v76 (old chronicles) and v133+
        // (Salvation / Helios / Superion). Anything outside this window is
        // either a UE1 package or a UE3 package — neither of which this
        // crate handles. The guard exists to give a clear error rather than
        // wander off into garbage when handed the wrong file.
        return Err(PackageError::UnsupportedVersion(version));
    }

    let package_flags = c.read_u32()?;
    let name_count = c.read_u32()?;
    let name_offset = c.read_u32()?;
    let export_count = c.read_u32()?;
    let export_offset = c.read_u32()?;
    let import_count = c.read_u32()?;
    let import_offset = c.read_u32()?;

    // Sanity: counts must fit inside the file and offsets must point inside
    // it. If any of these explode we've drifted before the table reads even
    // start — much easier to diagnose here than from a downstream EOF.
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
        // Generations table. L2 (v100+) uses 12 bytes per gen (export, name,
        // netobject); stock UE2 uses 8.
        let gen_count = c.read_u32()?;
        let gen_size = if version >= 100 { 12 } else { 8 };
        c.skip(gen_count as usize * gen_size)?;
    }

    // Late L2 chronicles append a single extra i32 between the generations
    // table and the start of the name table. UEViewer guards this on
    // `LicenseeVer >= 0x1C` (== 28). Verify by sanity-checking the cursor
    // against the expected name_offset.
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

fn read_name_table(bytes: &[u8], h: &PackageHeader) -> Result<Vec<String>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.name_offset as usize)?;
    let mut names = Vec::with_capacity(h.name_count as usize);
    for _ in 0..h.name_count {
        let name = if h.version >= 64 {
            read_fname_string(&mut c)?
        } else {
            // Pre-v64 used NUL-terminated raw ASCII with no length prefix.
            read_cstring(&mut c)?
        };
        // After the name there's an `object_flags: u32`. Older packages used
        // a `u64` — versions ≤ 64 in particular. We're operating in the
        // post-v60 range so u32 is correct for L2.
        c.skip(4)?;
        names.push(name);
    }
    Ok(names)
}

/// Name-table FName string: FCompactIndex length, then `length` ASCII bytes
/// **including** the terminating NUL.
///
/// NOTE: this is NOT the same as `Cursor::read_fstring` — that one uses an
/// int32 length and handles UTF-16 strings, which is the encoding used for
/// property values inside object data (UE2 mid-versions onward). The name
/// table sticks with the compact-index form across UE2.
fn read_fname_string(c: &mut Cursor) -> Result<String, PackageError> {
    let len = c.read_compact_index()?;
    if len <= 0 {
        return Ok(String::new());
    }
    let bytes = c.read_bytes(len as usize)?;
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
}

fn read_cstring(c: &mut Cursor) -> Result<String, PackageError> {
    let mut bytes = Vec::new();
    loop {
        let b = c.read_u8()?;
        if b == 0 {
            break;
        }
        bytes.push(b);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn read_import_table(
    bytes: &[u8],
    h: &PackageHeader,
    names: &[String],
) -> Result<Vec<ImportEntry>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.import_offset as usize)?;
    let mut imports = Vec::with_capacity(h.import_count as usize);
    for _ in 0..h.import_count {
        let class_package_index = c.read_compact_index()?;
        let class_name_index = c.read_compact_index()?;
        let package_index = c.read_i32()?;
        let object_name_index = c.read_compact_index()?;
        let class_package = lookup_name(names, class_package_index, "import.class_package")?;
        let class_name = lookup_name(names, class_name_index, "import.class_name")?;
        let object_name = lookup_name(names, object_name_index, "import.object_name")?;
        imports.push(ImportEntry {
            class_package_index,
            class_name_index,
            package_index,
            object_name_index,
            class_package,
            class_name,
            object_name,
            full_name: String::new(), // filled in below
        });
    }
    // Two-pass: resolve full_name now that the table exists.
    let mut resolved = Vec::with_capacity(imports.len());
    for (i, e) in imports.iter().enumerate() {
        let full = resolve_full_name_import(&imports, i, names)?;
        resolved.push(ImportEntry {
            full_name: full,
            ..ImportEntry {
                class_package_index: e.class_package_index,
                class_name_index: e.class_name_index,
                package_index: e.package_index,
                object_name_index: e.object_name_index,
                class_package: e.class_package.clone(),
                class_name: e.class_name.clone(),
                object_name: e.object_name.clone(),
                full_name: String::new(),
            }
        });
    }
    Ok(resolved)
}

fn read_export_table(
    bytes: &[u8],
    h: &PackageHeader,
    names: &[String],
    imports: &[ImportEntry],
) -> Result<Vec<ExportEntry>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.export_offset as usize)?;
    let mut exports = Vec::with_capacity(h.export_count as usize);
    for _ in 0..h.export_count {
        let class_index = c.read_compact_index()?;
        let super_index = c.read_compact_index()?;
        let package_index = c.read_i32()?;
        let object_name_index = c.read_compact_index()?;
        let object_flags = c.read_u32()?;
        let serial_size = c.read_compact_index()? as u32;
        let serial_offset = if serial_size > 0 {
            c.read_compact_index()? as u32
        } else {
            0
        };
        let object_name = lookup_name(names, object_name_index, "export.object_name")?;
        let class_name = resolve_object_ref(class_index, imports, &[], names)
            .unwrap_or_else(|| if class_index == 0 { "Class".to_string() } else { format!("?{class_index}") });
        exports.push(ExportEntry {
            class_index,
            super_index,
            package_index,
            object_name_index,
            object_flags,
            serial_size,
            serial_offset,
            object_name,
            class_name,
            full_name: String::new(), // patched below
        });
    }
    // Patch full_name now that exports exist (so package_index can resolve).
    let snapshot = exports.clone();
    for e in &mut exports {
        e.full_name = resolve_full_name_export(&snapshot, e, imports, names);
    }
    Ok(exports)
}

fn lookup_name(names: &[String], index: i32, table: &'static str) -> Result<String, PackageError> {
    let i = index as usize;
    if index < 0 || i >= names.len() {
        return Err(PackageError::IndexOutOfRange {
            table,
            index,
            len: names.len(),
        });
    }
    Ok(names[i].clone())
}

/// UE2 object references are signed integers:
///   positive  → 1-based index into the export table
///   negative  → 1-based index into the import table (negated)
///   zero      → null
fn resolve_object_ref(
    obj_ref: i32,
    imports: &[ImportEntry],
    exports: &[ExportEntry],
    _names: &[String],
) -> Option<String> {
    if obj_ref == 0 {
        return None;
    }
    if obj_ref > 0 {
        exports.get((obj_ref - 1) as usize).map(|e| e.object_name.clone())
    } else {
        imports.get((-obj_ref - 1) as usize).map(|e| e.object_name.clone())
    }
}

fn resolve_full_name_export(
    exports: &[ExportEntry],
    e: &ExportEntry,
    imports: &[ImportEntry],
    names: &[String],
) -> String {
    let mut parts = vec![e.object_name.clone()];
    let mut parent = e.package_index;
    let mut hops = 0;
    while parent != 0 && hops < 16 {
        if parent > 0 {
            let idx = (parent - 1) as usize;
            let Some(p) = exports.get(idx) else { break };
            parts.push(p.object_name.clone());
            parent = p.package_index;
        } else {
            let idx = (-parent - 1) as usize;
            let Some(p) = imports.get(idx) else { break };
            parts.push(p.object_name.clone());
            parent = p.package_index;
        }
        hops += 1;
    }
    let _ = names;
    parts.reverse();
    parts.join(".")
}

fn resolve_full_name_import(
    imports: &[ImportEntry],
    self_idx: usize,
    names: &[String],
) -> Result<String, PackageError> {
    let mut parts = vec![imports[self_idx].object_name.clone()];
    let mut parent = imports[self_idx].package_index;
    let mut hops = 0;
    while parent != 0 && hops < 16 {
        if parent >= 0 {
            // Imports only chain through other imports (negative refs into
            // the import table). A non-negative parent means we've reached
            // the package root (or a malformed entry); stop.
            break;
        }
        let idx = (-parent - 1) as usize;
        let Some(p) = imports.get(idx) else { break };
        parts.push(p.object_name.clone());
        parent = p.package_index;
        hops += 1;
    }
    let _ = names;
    parts.reverse();
    Ok(parts.join("."))
}
