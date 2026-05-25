use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

// Returns the first subdirectory of `parent` whose name matches `name`
// case-insensitively. Useful for the L2 client where "Textures" / "textures"
// / "TEXTURES" all coexist across installs.
pub fn find_subdir_ci(parent: &Path, name: &str) -> Option<PathBuf> {
    let exact = parent.join(name);
    if exact.is_dir() {
        return Some(exact);
    }
    let entries = fs::read_dir(parent).ok()?;
    let lc = name.to_ascii_lowercase();
    for ent in entries.flatten() {
        let Ok(ft) = ent.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }
        if ent.file_name().to_string_lossy().eq_ignore_ascii_case(&lc) {
            return Some(ent.path());
        }
    }
    None
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("create dir {}: {e}", parent.display()))?;
    let tmp = parent.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|s| s.to_str()).unwrap_or("write")
    ));
    fs::write(&tmp, bytes).map_err(|e| format!("write tmp {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename to {}: {e}", path.display()))
}

pub fn source_fingerprint(path: &Path) -> (u64, u64) {
    let Ok(meta) = fs::metadata(path) else {
        return (0, 0);
    };
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    (mtime, meta.len())
}

pub fn source_fresh(source: &str, cached_mtime: u64, cached_size: u64) -> bool {
    if cached_mtime == 0 && cached_size == 0 {
        return false;
    }
    let p = Path::new(source);
    if !p.is_file() {
        return true;
    }
    let (m, s) = source_fingerprint(p);
    m == cached_mtime && s == cached_size
}

pub fn now_unix_secs() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

pub fn sanitize_key(k: &str) -> String {
    k.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect()
}

pub fn remove_legacy_json_cache(app: &tauri::AppHandle, file_name: &str) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::remove_file(dir.join(file_name));
    }
}
