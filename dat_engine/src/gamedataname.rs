use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use super::bytes::{Cursor, Writer};
use super::cipher;

const SAFE_PACKAGE_TRAILER: &[u8] = b"\x0cSafePackage\0";

#[derive(Clone)]
pub struct Pool {
    pub names: Vec<String>,
    pub cipher_code: u32,
    pub path: PathBuf,
}

impl std::ops::Deref for Pool {
    type Target = Vec<String>;
    fn deref(&self) -> &Vec<String> {
        &self.names
    }
}

pub type Names = Arc<Pool>;

static CACHE: OnceLock<Mutex<HashMap<PathBuf, Names>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<PathBuf, Names>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn load_for(dat_path: &Path) -> Option<Names> {
    let folder = dat_path.parent()?.to_path_buf();
    {
        let lock = cache().lock().ok()?;
        if let Some(n) = lock.get(&folder) {
            return Some(n.clone());
        }
    }

    let names_path = folder.join("L2GameDataName.dat");
    if !names_path.exists() {
        eprintln!("[gamedataname] no L2GameDataName.dat in {}", folder.display());
        return None;
    }

    let pool = match load_file(&names_path) {
        Ok(pool) => Arc::new(pool),
        Err(e) => {
            eprintln!("[gamedataname] failed to load {}: {e}", names_path.display());
            return None;
        }
    };
    eprintln!(
        "[gamedataname] loaded {} names from {} (Lineage2Ver{})",
        pool.names.len(),
        pool.path.display(),
        pool.cipher_code,
    );
    if let Ok(mut lock) = cache().lock() {
        lock.insert(folder, pool.clone());
    }
    Some(pool)
}

fn load_file(path: &Path) -> io::Result<Pool> {
    let raw = fs::read(path)?;
    let basename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let (cipher_code, plaintext) = cipher::decrypt(&raw, basename)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
    let names = parse_names(&plaintext)?;
    Ok(Pool {
        names,
        cipher_code,
        path: path.to_path_buf(),
    })
}

fn parse_names(body: &[u8]) -> io::Result<Vec<String>> {
    let mut cur = Cursor::new(body);
    let count = cur.read_u32()? as usize;
    if count > 10_000_000 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "implausible names count"));
    }
    let mut out = Vec::with_capacity(count.min(1_000_000));
    for _ in 0..count {
        out.push(cur.read_utf_string()?);
    }
    Ok(out)
}

pub fn save_pool(folder: &Path, new_names: &[String]) -> io::Result<()> {
    if new_names.is_empty() {
        return Ok(());
    }

    let folder_buf = folder.to_path_buf();
    let current = {
        let lock = cache()
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "name pool cache lock poisoned"))?;
        lock.get(&folder_buf).cloned()
    };
    let mut pool: Pool = match current {
        Some(arc) => (*arc).clone(),
        None => {
            let dummy = folder_buf.join("any.dat");
            load_for(&dummy).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("no L2GameDataName.dat under {} to extend", folder.display()),
                )
            })?;
            (*cache()
                .lock()
                .map_err(|_| io::Error::new(io::ErrorKind::Other, "name pool cache lock poisoned"))?
                .get(&folder_buf)
                .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "pool vanished after load"))?
                .clone())
            .clone()
        }
    };

    let mut seen: HashMap<String, ()> = pool.names.iter().map(|s| (s.clone(), ())).collect();
    for n in new_names {
        if seen.insert(n.clone(), ()).is_none() {
            pool.names.push(n.clone());
        }
    }

    let mut w = Writer::new();
    w.write_u32(pool.names.len() as u32);
    for s in &pool.names {
        w.write_utf_string(s);
    }
    let mut plaintext = w.into_bytes();
    plaintext.extend_from_slice(SAFE_PACKAGE_TRAILER);

    let basename = pool
        .path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("L2GameDataName.dat");
    let encrypted = cipher::encrypt(&plaintext, pool.cipher_code, basename, |_, _| {}).map_err(|e| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("re-encrypting L2GameDataName.dat: {e}"),
        )
    })?;

    let tmp = pool.path.with_extension("dat.tmp");
    fs::write(&tmp, &encrypted)?;
    if pool.path.is_file() {
        let backup = pool.path.with_extension(format!(
            "{}.bak",
            pool.path.extension().and_then(|s| s.to_str()).unwrap_or("dat")
        ));
        if let Err(e) = fs::copy(&pool.path, &backup) {
            eprintln!("[gamedataname] backup to {} failed: {e} (continuing)", backup.display());
        }
    }
    fs::rename(&tmp, &pool.path)?;

    eprintln!(
        "[gamedataname] saved {} names to {} ({} bytes encrypted, {} bytes plaintext)",
        pool.names.len(),
        pool.path.display(),
        encrypted.len(),
        plaintext.len(),
    );

    if let Ok(mut lock) = cache().lock() {
        lock.insert(folder_buf, Arc::new(pool));
    }

    Ok(())
}

#[allow(dead_code)]
pub fn clear_cache() {
    if let Ok(mut lock) = cache().lock() {
        lock.clear();
    }
}
