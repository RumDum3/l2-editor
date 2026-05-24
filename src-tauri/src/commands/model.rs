use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use model_engine::{ExportEntry, Package, PackageSummary};
use once_cell::sync::Lazy;
use serde::Serialize;

#[tauri::command]
pub async fn dump_package(path: String, sample_size: Option<usize>) -> Result<PackageSummary, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<PackageSummary, String> {
        let pkg = Package::open(&path).map_err(|e| e.to_string())?;
        Ok(pkg.summarize(sample_size.unwrap_or(20)))
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub async fn list_package_exports(
    path: String,
    class_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ExportEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<ExportEntry>, String> {
        let pkg = Package::open(&path).map_err(|e| e.to_string())?;
        let cap = limit.unwrap_or(500);
        let out: Vec<ExportEntry> = pkg
            .exports
            .iter()
            .filter(|e| match &class_filter {
                Some(c) => e.class_name.eq_ignore_ascii_case(c),
                None => true,
            })
            .take(cap)
            .cloned()
            .collect();
        Ok(out)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

// ─── package file index ───────────────────────────────────────────────────────
//
// One client root has roughly a few hundred package files spread across
// Animations/, StaticMeshes/, Textures/, SysTextures/, and system/. We walk
// those folders once, cache the result keyed by lower-cased file stem
// (e.g. "lineagenpcs" → "E:/L2/Animations/LineageNpcs.ukx"), and reuse the
// map for every NPC the user opens.
//
// Invalidation: keyed by client root path. If the user changes client root
// (or hits "rebuild caches" in Settings) we drop the entry and rebuild on
// next call.

#[derive(Default)]
struct PackageIndex {
    by_stem: HashMap<String, PathBuf>,
}

static INDEX_CACHE: Lazy<Mutex<HashMap<String, std::sync::Arc<PackageIndex>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Most-recently-used parsed-package cache. Keyed by absolute path. Bounded so
// big sessions don't pin half the client into memory — 8 packages × ~100 MB
// is the worst case, fine on any modern dev box.
const PARSED_CACHE_CAP: usize = 8;
static PARSED_CACHE: Lazy<Mutex<Vec<(String, std::sync::Arc<Package>)>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

fn parsed_package(path: &Path) -> Result<std::sync::Arc<Package>, model_engine::PackageError> {
    let key = path.to_string_lossy().to_lowercase();
    {
        let mut cache = PARSED_CACHE.lock().unwrap();
        if let Some(pos) = cache.iter().position(|(k, _)| *k == key) {
            // Touch — move to back so we evict the oldest, not the newest.
            let entry = cache.remove(pos);
            cache.push(entry);
            return Ok(cache.last().unwrap().1.clone());
        }
    }
    let parsed = std::sync::Arc::new(Package::open(path)?);
    let mut cache = PARSED_CACHE.lock().unwrap();
    cache.push((key, parsed.clone()));
    if cache.len() > PARSED_CACHE_CAP {
        cache.remove(0);
    }
    Ok(parsed)
}

const SCAN_SUBDIRS: &[&str] = &["Animations", "StaticMeshes", "Textures", "SysTextures", "system"];
const PACKAGE_EXTS: &[&str] = &["ukx", "utx", "usx", "unr", "u", "uax"];

fn build_index(client_root: &Path) -> std::sync::Arc<PackageIndex> {
    let mut by_stem: HashMap<String, PathBuf> = HashMap::new();
    for sub in SCAN_SUBDIRS {
        let dir = client_root.join(sub);
        if !dir.is_dir() {
            continue;
        }
        walk(&dir, &mut |path: &Path| {
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else { return };
            let name_lc = name.to_ascii_lowercase();
            let Some(dot) = name_lc.rfind('.') else { return };
            let ext = &name_lc[dot + 1..];
            if !PACKAGE_EXTS.contains(&ext) {
                return;
            }
            let stem = name_lc[..dot].to_string();
            by_stem.entry(stem).or_insert_with(|| path.to_path_buf());
        });
    }
    std::sync::Arc::new(PackageIndex { by_stem })
}

fn walk(dir: &Path, f: &mut impl FnMut(&Path)) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for ent in rd.flatten() {
        let Ok(ft) = ent.file_type() else { continue };
        let path = ent.path();
        if ft.is_dir() {
            walk(&path, f);
        } else if ft.is_file() {
            f(&path);
        }
    }
}

fn get_index(client_root: &Path) -> std::sync::Arc<PackageIndex> {
    let key = client_root.to_string_lossy().to_lowercase();
    let mut cache = INDEX_CACHE.lock().unwrap();
    if let Some(i) = cache.get(&key) {
        return i.clone();
    }
    let idx = build_index(client_root);
    cache.insert(key, idx.clone());
    idx
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageIndexSummary {
    pub root: String,
    pub package_count: usize,
    /// First 50 package stems for sanity-checking the index.
    pub sample: Vec<String>,
}

#[tauri::command]
pub async fn build_package_index(client_root: String) -> Result<PackageIndexSummary, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<PackageIndexSummary, String> {
        let root = PathBuf::from(&client_root);
        if !root.is_dir() {
            return Err(format!("not a folder: {}", root.display()));
        }
        {
            let mut cache = INDEX_CACHE.lock().unwrap();
            cache.remove(&client_root.to_lowercase());
        }
        let idx = get_index(&root);
        let mut sample: Vec<String> = idx.by_stem.keys().cloned().collect();
        sample.sort();
        sample.truncate(50);
        Ok(PackageIndexSummary {
            root: client_root,
            package_count: idx.by_stem.len(),
            sample,
        })
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

// ─── npc-grp model resolver ───────────────────────────────────────────────────
//
// `mesh_name` from NpcGrp.dat looks like "LineageNpcs.Mob.Spider01":
//   first segment  → package name (case-insensitive, becomes file stem)
//   remaining      → export's full dotted name within that package
//
// We resolve in three steps:
//   1) look the package stem up in the file index
//   2) open + parse the package (cipher-aware, via dat_engine)
//   3) find the export by full dotted name (or fall back to just the leaf)
// then return everything the UI needs to display + the bytes the next phase
// will decode.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedNpcModel {
    pub mesh_name: String,
    pub package_stem: String,
    pub package_path: Option<String>,
    pub export_path: String,
    pub export: Option<ExportEntry>,
    pub package_version: Option<u16>,
    pub package_licensee_version: Option<u16>,
    pub status: ResolveStatus,
    pub detail: String,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResolveStatus {
    Ok,
    PackageNotFound,
    PackageOpenFailed,
    ExportNotFound,
    BadMeshName,
}

#[tauri::command]
pub async fn resolve_npc_model(
    client_root: String,
    mesh_name: String,
) -> Result<ResolvedNpcModel, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ResolvedNpcModel, String> {
        let trimmed = mesh_name.trim();
        let mut parts = trimmed.splitn(2, '.');
        let pkg = parts.next().unwrap_or("").to_string();
        let export_path = parts.next().unwrap_or("").to_string();
        if pkg.is_empty() || export_path.is_empty() {
            return Ok(ResolvedNpcModel {
                mesh_name: trimmed.to_string(),
                package_stem: pkg.clone(),
                package_path: None,
                export_path,
                export: None,
                package_version: None,
                package_licensee_version: None,
                status: ResolveStatus::BadMeshName,
                detail: format!("mesh_name doesn't look like 'Package.Object': {trimmed:?}"),
            });
        }

        let root = PathBuf::from(&client_root);
        let idx = get_index(&root);
        let stem_lc = pkg.to_ascii_lowercase();
        let Some(pkg_path) = idx.by_stem.get(&stem_lc).cloned() else {
            return Ok(ResolvedNpcModel {
                mesh_name: trimmed.to_string(),
                package_stem: pkg,
                package_path: None,
                export_path,
                export: None,
                package_version: None,
                package_licensee_version: None,
                status: ResolveStatus::PackageNotFound,
                detail: format!(
                    "no {stem_lc}.* under any of: {}",
                    SCAN_SUBDIRS.join(", ")
                ),
            });
        };

        let parsed = match parsed_package(&pkg_path) {
            Ok(p) => p,
            Err(e) => {
                return Ok(ResolvedNpcModel {
                    mesh_name: trimmed.to_string(),
                    package_stem: pkg,
                    package_path: Some(pkg_path.to_string_lossy().into_owned()),
                    export_path,
                    export: None,
                    package_version: None,
                    package_licensee_version: None,
                    status: ResolveStatus::PackageOpenFailed,
                    detail: format!("opening {}: {e}", pkg_path.display()),
                });
            }
        };

        // Try full dotted path first ("Mob.Spider01"), fall back to just the
        // leaf ("Spider01") for packages that don't nest exports under groups.
        let leaf = export_path.rsplit('.').next().unwrap_or(&export_path);
        let found = parsed.find_export(&export_path).cloned().or_else(|| {
            if leaf != export_path {
                parsed.find_export(leaf).cloned()
            } else {
                None
            }
        });

        let (status, detail) = match &found {
            Some(e) => (
                ResolveStatus::Ok,
                format!(
                    "{} {} — {} bytes @ offset {}",
                    e.class_name, e.full_name, e.serial_size, e.serial_offset
                ),
            ),
            None => (
                ResolveStatus::ExportNotFound,
                format!("no export '{export_path}' (or leaf '{leaf}') in {}", pkg_path.display()),
            ),
        };

        Ok(ResolvedNpcModel {
            mesh_name: trimmed.to_string(),
            package_stem: pkg,
            package_path: Some(pkg_path.to_string_lossy().into_owned()),
            export_path,
            export: found,
            package_version: Some(parsed.header.version),
            package_licensee_version: Some(parsed.header.licensee_version),
            status,
            detail,
        })
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}
