use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::package::Package;
use super::texture::extract_to_png;
use super::{decrypt_file, ExtractError};

#[derive(Default)]
pub struct ExtractorState {
    pub index: Mutex<Indexes>,
    pub parsed: Mutex<HashMap<String, Option<Arc<Package>>>>,
}

#[derive(Default)]
pub struct Indexes {
    pub root: Option<PathBuf>,
    pub map: HashMap<String, PathBuf>,
}

impl ExtractorState {
    pub fn invalidate(&self) {
        if let Ok(mut idx) = self.index.lock() {
            idx.root = None;
            idx.map.clear();
        }
        if let Ok(mut p) = self.parsed.lock() {
            p.clear();
        }
    }
}
pub fn get_region_terrain_texture(
    state: &ExtractorState,
    client_root: &Path,
    x: u32,
    y: u32,
) -> Result<Option<(u32, u32, Vec<u8>)>, ExtractError> {
    let unr_path = client_root.join("Maps").join(format!("{x}_{y}.unr"));
    if !unr_path.is_file() {
        return Ok(None);
    }
    let (_, bytes) = decrypt_file(&unr_path)?;
    let unr_pkg = Package::parse(bytes)?;
    let Some(td) = super::terrain::parse_terrain(&unr_pkg) else {
        return Ok(None);
    };
    let tex_refs: Vec<Option<(String, String)>> = td
        .layers
        .iter()
        .map(|l| super::terrain::resolve_texture_ref(&unr_pkg, l.texture_obj))
        .collect();
    let alpha_refs: Vec<Option<(String, String)>> = td
        .layers
        .iter()
        .map(|l| super::terrain::resolve_texture_ref(&unr_pkg, l.alphamap_obj))
        .collect();
    drop(unr_pkg);

    let decode = |r: &Option<(String, String)>| {
        r.as_ref()
            .and_then(|(pn, tn)| decode_named_texture(state, client_root, pn, tn).ok().flatten())
    };
    let layer_tex: Vec<Option<super::texture::DecodedTexture>> = tex_refs.iter().map(decode).collect();
    let alpha_tex: Vec<Option<super::texture::DecodedTexture>> = alpha_refs.iter().map(decode).collect();

    let (w, h, rgba) = super::terrain::composite(&td, &layer_tex, &alpha_tex);
    Ok(Some((w, h, rgba)))
}

fn decode_named_texture(
    state: &ExtractorState,
    client_root: &Path,
    package: &str,
    name: &str,
) -> Result<Option<super::texture::DecodedTexture>, ExtractError> {
    let Some(utx) = locate_package(state, client_root, package)? else {
        return Ok(None);
    };
    let Some(pkg) = parse_cached(state, package, &utx)? else {
        return Ok(None);
    };
    let Some(s) = pkg.texture_exports().into_iter().find(|t| t.name == name) else {
        return Ok(None);
    };
    let Some(export) = pkg.exports.get(s.export_index as usize) else {
        return Ok(None);
    };
    Ok(super::texture::decode_texture(&pkg, export).ok())
}

pub fn list_textures(state: &ExtractorState, client_root: &Path, package: &str) -> Result<Vec<String>, ExtractError> {
    let Some(utx) = locate_package(state, client_root, package)? else {
        return Ok(Vec::new());
    };
    let Some(pkg) = parse_cached(state, package, &utx)? else {
        return Ok(Vec::new());
    };
    Ok(pkg.texture_exports().into_iter().map(|t| t.name).collect())
}

pub fn get_texture(
    state: &ExtractorState,
    client_root: &Path,
    cache_dir: &Path,
    package: &str,
    name: &str,
) -> Result<Option<Vec<u8>>, ExtractError> {
    let cache_file = cache_dir.join(package).join(format!("{}.png", sanitize(name)));
    if cache_file.is_file() {
        let bytes = fs::read(&cache_file).map_err(|e| ExtractError::Crypt(e.into()))?;
        eprintln!("[texture] cache hit {}.{} ({} bytes)", package, name, bytes.len());
        return Ok(Some(bytes));
    }

    let utx_path = locate_package(state, client_root, package)?;
    let Some(utx_path) = utx_path else {
        eprintln!("[texture] no .utx found for package '{}'", package);
        return Ok(None);
    };

    let Some(pkg) = parse_cached(state, package, &utx_path)? else {
        return Ok(None);
    };

    let Some(summary) = pkg.texture_exports().into_iter().find(|t| t.name == name) else {
        eprintln!("[texture] '{}' not in package {}", name, package);
        return Ok(None);
    };
    let Some(export) = pkg.exports.get(summary.export_index as usize) else {
        return Ok(None);
    };
    let png = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| extract_to_png(&pkg, export))) {
        Ok(Ok(b)) => b,
        Ok(Err(super::texture::TextureError::NoMips)) => {
            eprintln!("[texture] {}.{} has no pixels (cubemap/effect texture)", package, name);
            return Ok(None);
        }
        Ok(Err(e)) => {
            eprintln!("[texture] decode error for {}.{}: {}", package, name, e);
            return Err(ExtractError::Texture(e));
        }
        Err(panic) => {
            let msg = panic
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| panic.downcast_ref::<String>().map(|s| s.as_str()))
                .unwrap_or("(non-string panic)");
            eprintln!("[texture] PANIC decoding {}.{}: {}", package, name, msg);
            return Ok(None);
        }
    };

    if let Some(parent) = cache_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&cache_file, &png);
    eprintln!("[texture] extracted {}.{} ({} bytes)", package, name, png.len());

    Ok(Some(png))
}

fn locate_package(
    state: &ExtractorState,
    client_root: &Path,
    package: &str,
) -> Result<Option<PathBuf>, ExtractError> {
    let key = package.to_lowercase();

    {
        let mut idx = state.index.lock().unwrap();
        let needs_index = match &idx.root {
            Some(p) => p != client_root,
            None => true,
        };
        if needs_index {
            let candidates: &[&str] = &["Textures", "textures", "SysTextures", "systextures"];
            let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

            idx.map.clear();
            for name in candidates {
                let dir = client_root.join(name);
                if !dir.is_dir() {
                    continue;
                }
                let canon = dir.canonicalize().unwrap_or_else(|_| dir.clone());
                if !seen.insert(canon) {
                    continue;
                }
                let before = idx.map.len();
                eprintln!("[texture] indexing textures folder: {}", dir.display());
                walk_index(&dir, &mut idx.map);
                eprintln!("[texture]   added {} .utx files", idx.map.len() - before);
            }
            if idx.map.is_empty() {
                eprintln!(
                    "[texture] no Textures/ or SysTextures/ subfolder under {}",
                    client_root.display()
                );
            } else {
                eprintln!("[texture] indexed {} .utx files total", idx.map.len());
            }
            idx.root = Some(client_root.to_path_buf());
        }
        if let Some(p) = idx.map.get(&key) {
            return Ok(Some(p.clone()));
        }
    }
    Ok(None)
}

fn walk_index(dir: &Path, out: &mut HashMap<String, PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk_index(&p, out);
        } else if p.is_file() {
            if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
                if ext.eq_ignore_ascii_case("utx") {
                    if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                        out.insert(stem.to_lowercase(), p);
                    }
                }
            }
        }
    }
}

fn parse_cached(
    state: &ExtractorState,
    package: &str,
    utx_path: &Path,
) -> Result<Option<Arc<Package>>, ExtractError> {
    let key = package.to_lowercase();

    let mut cache = state.parsed.lock().unwrap();
    if let Some(slot) = cache.get(&key) {
        return Ok(slot.clone());
    }

    eprintln!("[texture] decrypting + parsing {}", utx_path.display());
    let parse_attempt: Result<Result<Arc<Package>, ExtractError>, _> =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let (_, plaintext) = decrypt_file(utx_path)?;
            Ok(Arc::new(Package::parse(plaintext)?))
        }));

    let result = match parse_attempt {
        Ok(Ok(pkg)) => {
            eprintln!(
                "[texture] parsed {} ({} exports, {} textures)",
                package,
                pkg.exports.len(),
                pkg.texture_exports().len()
            );
            Some(pkg)
        }
        Ok(Err(e)) => {
            eprintln!("[texture] parse FAILED for {}: {}", package, e);
            None
        }
        Err(panic) => {
            let msg = panic
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| panic.downcast_ref::<String>().map(|s| s.as_str()))
                .unwrap_or("(non-string panic)");
            eprintln!("[texture] PARSE PANIC for {}: {}", package, msg);
            None
        }
    };

    cache.insert(key, result.clone());
    Ok(result)
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}
