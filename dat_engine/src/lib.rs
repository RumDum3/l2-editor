pub mod bytes;
pub mod cipher;
pub mod dispatch;
pub mod format;
pub mod gamedataname;
pub mod reader;
pub mod schema;
pub mod writer;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct LoadedDat {
    pub file_name: String,
    pub cipher_code: u16,
    pub schema_name: String,
    pub schema_variant: String,
    pub data: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatMeta {
    pub file_name: String,
    pub cipher_code: u16,
    pub schema_name: String,
    pub schema_variant: String,
    pub format: Option<String>,
}

fn prepare(path: &Path) -> io::Result<(DatMeta, schema::FileSchema, Vec<u8>, reader::ReadContext)> {
    let raw = fs::read(path)?;
    let basename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    let (cipher_code, plaintext) =
        cipher::decrypt(&raw, &basename).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;

    let dispatch_path = data_dir().join("structure/46_superion.xml");
    let compiled = dispatch::load_compiled(&dispatch_path)?;
    let entry = dispatch::find_in_compiled(compiled, &basename).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("no dispatch entry matched filename {basename:?}"),
        )
    })?;

    let schema_path = data_dir().join("structure/dats").join(format!("{}.xml", entry.schema_name));
    let schema = schema::load_schema_cached(&schema_path).map_err(|e| {
        io::Error::new(
            e.kind(),
            format!("loading schema {:?} for {basename}: {e}", schema_path.display()),
        )
    })?;

    let matched_idx = schema
        .files
        .iter()
        .position(|f| f.pattern.eq_ignore_ascii_case(&entry.chronicle));
    let mut candidates: Vec<&schema::FileSchema> = Vec::new();
    if let Some(i) = matched_idx {
        candidates.push(&schema.files[i]);
    }
    for (i, f) in schema.files.iter().enumerate().rev() {
        if Some(i) != matched_idx {
            candidates.push(f);
        }
    }
    if candidates.is_empty() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "schema has no <file> blocks"));
    }

    let names = gamedataname::load_for(path);
    let names_loaded = names.as_ref().map(|n| n.len()).unwrap_or(0);

    let mut chosen: Option<(&schema::FileSchema, &str)> = None;
    let mut errors: Vec<String> = Vec::new();
    for cand in &candidates {
        let probe_ctx = reader::ReadContext { names: names.clone() };
        match reader::read_file(cand, &plaintext, &probe_ctx) {
            Ok(_) => {
                chosen = Some((cand, cand.pattern.as_str()));
                break;
            }
            Err(e) => errors.push(format!("variant {}: {e}", cand.pattern)),
        }
    }

    let (file, variant_used) = chosen.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "no schema variant of `{}` parsed `{}` cleanly. Tried:\n  - {}",
                schema.name,
                basename,
                errors.join("\n  - "),
            ),
        )
    })?;

    if !variant_used.eq_ignore_ascii_case(&entry.chronicle) {
        eprintln!(
            "[dat] {basename}: dispatched variant `{}` failed; using `{variant_used}` instead",
            entry.chronicle
        );
    }
    eprintln!(
        "[dat] {basename} prepared (cipher Lineage2Ver{cipher_code}, schema {}, variant {variant_used}, {names_loaded} MAP_INT names)",
        schema.name
    );

    let ctx = reader::ReadContext { names };
    let meta = DatMeta {
        file_name: basename,
        cipher_code: cipher_code as u16,
        schema_name: schema.name.clone(),
        schema_variant: variant_used.to_string(),
        format: file.format.clone(),
    };
    Ok((meta, file.clone(), plaintext, ctx))
}

pub fn prepare_and_stream<S, F>(path: &Path, make_sink: F) -> io::Result<()>
where
    S: reader::ReadSink,
    F: FnOnce(&DatMeta) -> S,
{
    let (meta, file, plaintext, ctx) = prepare(path)?;
    let mut sink = make_sink(&meta);
    reader::read_streaming(&file, &plaintext, &ctx, &mut sink)
}

pub fn data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data")
}

#[derive(Debug, Serialize)]
pub struct InspectResult {
    pub file_name: String,
    pub cipher_code: u16,
    pub file_size: u64,
    pub plaintext_size: u64,
    pub bytes: Vec<u8>,
}

pub fn inspect_dat(path: &Path) -> io::Result<InspectResult> {
    let raw = fs::read(path)?;
    let basename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    let (cipher_code, plaintext) = cipher::decrypt(&raw, &basename)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
    Ok(InspectResult {
        file_name: basename,
        cipher_code: cipher_code as u16,
        file_size: raw.len() as u64,
        plaintext_size: plaintext.len() as u64,
        bytes: plaintext,
    })
}

fn lookup_schema_variant(hint: &DatMeta) -> io::Result<(DatMeta, schema::FileSchema)> {
    let schema_path = data_dir()
        .join("structure/dats")
        .join(format!("{}.xml", hint.schema_name));
    let schema = schema::load_schema_cached(&schema_path).map_err(|e| {
        io::Error::new(
            e.kind(),
            format!("loading schema {:?}: {e}", schema_path.display()),
        )
    })?;
    let file = schema
        .files
        .iter()
        .find(|f| f.pattern.eq_ignore_ascii_case(&hint.schema_variant))
        .cloned()
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!(
                    "schema {} has no variant `{}`",
                    hint.schema_name, hint.schema_variant
                ),
            )
        })?;
    Ok((hint.clone(), file))
}

pub fn load_dat(path: &Path) -> io::Result<LoadedDat> {
    let (meta, file, plaintext, ctx) = prepare(path)?;
    let data = reader::read_file(&file, &plaintext, &ctx)?;
    Ok(LoadedDat {
        file_name: meta.file_name,
        cipher_code: meta.cipher_code,
        schema_name: meta.schema_name,
        schema_variant: meta.schema_variant,
        data,
    })
}

#[derive(Debug, Serialize)]
pub struct SaveResult {
    pub bytes_written: u64,
    pub plaintext_size: u64,
    pub new_names_added: usize,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SavePhase {
    Lookup,
    FormatReverse,
    Normalize,
    Serialize,
    Encrypt,
    Write,
    Done,
}

pub fn save_dat(
    path: &Path,
    record: &mut serde_json::Value,
    meta_hint: Option<DatMeta>,
    on_progress: impl Fn(SavePhase, usize, usize) + Send + Sync + 'static,
) -> io::Result<SaveResult> {
    use std::time::Instant;
    let t_total = Instant::now();

    on_progress(SavePhase::Lookup, 0, 1);
    let (meta, file) = if let Some(hint) = meta_hint {
        let t = Instant::now();
        let res = lookup_schema_variant(&hint)?;
        eprintln!("[save] schema lookup: {:?}", t.elapsed());
        res
    } else {
        let t = Instant::now();
        let (meta, file, _plaintext, _read_ctx) = prepare(path)?;
        eprintln!("[save] prepare (slow path): {:?}", t.elapsed());
        (meta, file)
    };
    on_progress(SavePhase::Lookup, 1, 1);

    if !cipher::can_encrypt(meta.cipher_code as u32) {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            format!(
                "saving Lineage2Ver{} files isn't supported yet (we only have the public RSA exponent for that version, not the private one needed to re-encrypt).",
                meta.cipher_code
            ),
        ));
    }

    if !record.is_object() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "expected object as top-level value"));
    }

    if file.format.as_deref() == Some("SkillNameFormat") {
        on_progress(SavePhase::FormatReverse, 0, 1);
        let t = Instant::now();
        format::skillname_prepare_for_save(record.as_object_mut().expect("checked is_object"));
        eprintln!("[save] format reverse: {:?}", t.elapsed());
        on_progress(SavePhase::FormatReverse, 1, 1);
    }

    on_progress(SavePhase::Normalize, 0, 1);
    let t = Instant::now();
    writer::normalize_for_write(&file.nodes, record.as_object_mut().expect("checked is_object"));
    eprintln!("[save] normalize: {:?}", t.elapsed());
    on_progress(SavePhase::Normalize, 1, 1);

    let names = gamedataname::load_for(path);
    let mut wctx = writer::WriteContext::new(names);
    on_progress(SavePhase::Serialize, 0, 1);
    let t = Instant::now();
    let plaintext = writer::write_file(&file, record, &mut wctx)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("serializing: {e}")))?;
    eprintln!("[save] serialize: {:?} ({} bytes)", t.elapsed(), plaintext.len());
    on_progress(SavePhase::Serialize, 1, 1);

    let new_names_added = wctx.new_names.len();

    let t = Instant::now();
    let encrypt_progress = |done: usize, total: usize| {
        on_progress(SavePhase::Encrypt, done, total);
    };
    let encrypted = cipher::encrypt(&plaintext, meta.cipher_code as u32, &meta.file_name, encrypt_progress)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
    eprintln!("[save] encrypt: {:?} ({} bytes)", t.elapsed(), encrypted.len());

    if new_names_added > 0 {
        if let Some(folder) = path.parent() {
            gamedataname::save_pool(folder, &wctx.new_names)?;
        }
    }

    on_progress(SavePhase::Write, 0, 1);
    let tmp = path.with_extension(format!("{}.tmp", path.extension().and_then(|s| s.to_str()).unwrap_or("dat")));
    fs::write(&tmp, &encrypted)?;
    if path.is_file() {
        let backup = path.with_extension(format!("{}.bak", path.extension().and_then(|s| s.to_str()).unwrap_or("dat")));
        if let Err(e) = fs::copy(path, &backup) {
            eprintln!("[dat] backup to {} failed: {e} (continuing)", backup.display());
        }
    }

    fs::rename(&tmp, path)?;
    on_progress(SavePhase::Write, 1, 1);
    on_progress(SavePhase::Done, 1, 1);

    eprintln!(
        "[dat] {} saved ({} bytes plaintext, {} bytes encrypted) — total {:?}",
        meta.file_name,
        plaintext.len(),
        encrypted.len(),
        t_total.elapsed()
    );

    Ok(SaveResult {
        bytes_written: encrypted.len() as u64,
        plaintext_size: plaintext.len() as u64,
        new_names_added,
    })
}
