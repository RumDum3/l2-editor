use std::fs;
use std::path::PathBuf;

use crate::commands::config::chronicle_dir;
use crate::extractor;
use crate::extractor::cache::ExtractorState;
use crate::extractor::encode;
use crate::extractor::write::replace_texture_same_size;

#[tauri::command]
pub fn read_texture(
    state: tauri::State<ExtractorState>,
    app: tauri::AppHandle,
    client_root: String,
    package: String,
    name: String,
) -> Result<Option<Vec<u8>>, String> {
    let cache_dir = chronicle_dir(&app)?.join("textures");
    let _ = fs::create_dir_all(&cache_dir);

    if client_root.is_empty() {
        let candidate = cache_dir.join(&package).join(format!("{}.png", name));
        if candidate.is_file() {
            return fs::read(&candidate).map(Some).map_err(|e| e.to_string());
        }
        return Ok(None);
    }

    let client = PathBuf::from(client_root);
    extractor::cache::get_texture(&state, &client, &cache_dir, &package, &name)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureInfo {
    pub package: String,
    pub name: String,
    pub resolved_name: String,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub mip_count: i32,
    pub mip0_size: u32,
}

#[tauri::command]
pub fn texture_info(
    state: tauri::State<ExtractorState>,
    client_root: String,
    package: String,
    name: String,
) -> Result<TextureInfo, String> {
    if client_root.is_empty() {
        return Err("client_root not set".to_string());
    }
    let client = PathBuf::from(client_root);
    let info = extractor::cache::get_texture_info(&state, &client, &package, &name)
        .map_err(|e| e.to_string())?;
    let info = info.map_err(|msg| msg)?;
    Ok(TextureInfo {
        package: package.clone(),
        name: name.clone(),
        resolved_name: info.resolved_name,
        format: format!("{:?}", info.format),
        width: info.width,
        height: info.height,
        mip_count: info.mip_count,
        mip0_size: info.mip0_size,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTextureResult {
    pub utx_path: String,
    pub bytes_written: u32,
    pub mips_replaced: u32,
    pub backup_path: Option<String>,
}

fn locate_utx_path(
    state: &ExtractorState,
    client: &std::path::Path,
    package: &str,
) -> Result<PathBuf, String> {
    // We only need locate_package's path output. Lock the same index by reusing get_texture_info.
    let info = extractor::cache::get_texture_info(state, client, package, "__probe__")
        .map_err(|e| e.to_string())?;
    if let Ok(_) = info {
        // unreachable for the probe name, but keeps the call cheap
    }
    extractor::cache::locate_package_for_write(state, client, package).ok_or_else(|| {
        format!(
            "no .utx found for package '{}' under Textures/SysTextures/Animations",
            package
        )
    })
}

#[tauri::command]
pub fn replace_texture_with_png(
    state: tauri::State<ExtractorState>,
    app: tauri::AppHandle,
    client_root: String,
    package: String,
    name: String,
    png_path: String,
) -> Result<ReplaceTextureResult, String> {
    if client_root.is_empty() {
        return Err("client_root not set".to_string());
    }
    let client = PathBuf::from(client_root);
    let utx_path = locate_utx_path(&state, &client, &package)?;

    let png_bytes = fs::read(&png_path).map_err(|e| format!("read {png_path}: {e}"))?;
    let (png_w, png_h, rgba) = encode::decode_png(&png_bytes).map_err(|e| e.to_string())?;

    // Resolve the L2 _ori / _sp fallback so the user can pass the base name (NpcGrp ref).
    let resolved = resolve_export_name(&state, &client, &package, &name)?;

    let result = replace_texture_same_size(&utx_path, &package, &resolved, &rgba, png_w, png_h)
        .map_err(|e| e.to_string())?;

    // Invalidate the cached PNG so the modal re-extracts on next view.
    invalidate_texture_cache_entry(&app, &package, &resolved);

    Ok(ReplaceTextureResult {
        utx_path: result.utx_path.to_string_lossy().into_owned(),
        bytes_written: result.bytes_written as u32,
        mips_replaced: result.mips_replaced as u32,
        backup_path: result.backup_path.map(|p| p.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub fn upscale_texture(
    state: tauri::State<ExtractorState>,
    app: tauri::AppHandle,
    client_root: String,
    package: String,
    name: String,
    factor: u32,
) -> Result<ReplaceTextureResult, String> {
    if client_root.is_empty() {
        return Err("client_root not set".to_string());
    }
    if factor == 0 {
        return Err("factor must be >= 1".to_string());
    }
    let client = PathBuf::from(client_root);
    let utx_path = locate_utx_path(&state, &client, &package)?;
    let resolved = resolve_export_name(&state, &client, &package, &name)?;

    // Pull the existing decoded RGBA, upscale by `factor` with Lanczos3, then downscale
    // back to the original dimensions so we stay in same-size replace territory.
    // For true higher-resolution writes we need the offset-shifting path (Phase C).
    let cache_dir = chronicle_dir(&app)?.join("textures");
    let png = extractor::cache::get_texture(&state, &client, &cache_dir, &package, &resolved)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("could not extract existing {}.{}", package, resolved))?;
    let (orig_w, orig_h, rgba) = encode::decode_png(&png).map_err(|e| e.to_string())?;

    let big_w = orig_w.saturating_mul(factor).max(1);
    let big_h = orig_h.saturating_mul(factor).max(1);
    let upscaled = encode::resize_rgba(&rgba, orig_w, orig_h, big_w, big_h);
    let back = encode::resize_rgba(&upscaled, big_w, big_h, orig_w, orig_h);

    let result = replace_texture_same_size(&utx_path, &package, &resolved, &back, orig_w, orig_h)
        .map_err(|e| e.to_string())?;
    invalidate_texture_cache_entry(&app, &package, &resolved);

    Ok(ReplaceTextureResult {
        utx_path: result.utx_path.to_string_lossy().into_owned(),
        bytes_written: result.bytes_written as u32,
        mips_replaced: result.mips_replaced as u32,
        backup_path: result.backup_path.map(|p| p.to_string_lossy().into_owned()),
    })
}

fn invalidate_texture_cache_entry(app: &tauri::AppHandle, package: &str, name: &str) {
    let Ok(base) = chronicle_dir(app) else { return };
    let cache_file = base.join("textures").join(package).join(format!("{name}.png"));
    let _ = fs::remove_file(cache_file);
}

fn resolve_export_name(
    state: &ExtractorState,
    client: &std::path::Path,
    package: &str,
    name: &str,
) -> Result<String, String> {
    let lower = name.to_ascii_lowercase();
    let mut candidates = vec![name.to_string()];
    if !lower.ends_with("_ori") && !lower.ends_with("_sp") {
        candidates.push(format!("{name}_ori"));
        candidates.push(format!("{name}_sp"));
    }
    for cand in &candidates {
        let probe = extractor::cache::get_texture_info(state, client, package, cand)
            .map_err(|e| e.to_string())?;
        if probe.is_ok() {
            return Ok(cand.clone());
        }
    }
    Err(format!("'{name}' not found in package {package} (also tried {:?})", &candidates[1..]))
}

#[tauri::command]
pub fn list_textures(
    state: tauri::State<ExtractorState>,
    client_root: String,
    package: String,
) -> Result<Vec<String>, String> {
    if client_root.is_empty() {
        return Ok(Vec::new());
    }
    let client = PathBuf::from(client_root);
    extractor::cache::list_textures(&state, &client, &package).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_map_regions(client_root: String) -> Result<Vec<[u32; 2]>, String> {
    if client_root.is_empty() {
        return Ok(Vec::new());
    }
    let maps = PathBuf::from(&client_root).join("Maps");
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&maps) else {
        return Ok(out);
    };
    for ent in entries.flatten() {
        let name = ent.file_name();
        let Some(name) = name.to_str() else { continue };
        let lower = name.to_ascii_lowercase();
        let Some(stem) = lower.strip_suffix(".unr") else { continue };
        let mut parts = stem.split('_');
        if let (Some(a), Some(b), None) = (parts.next(), parts.next(), parts.next()) {
            if let (Ok(x), Ok(y)) = (a.parse::<u32>(), b.parse::<u32>()) {
                out.push([x, y]);
            }
        }
    }
    out.sort_unstable();
    Ok(out)
}

#[tauri::command]
pub fn read_region_terrain_texture(
    state: tauri::State<ExtractorState>,
    app: tauri::AppHandle,
    client_root: String,
    x: u32,
    y: u32,
) -> Result<Option<Vec<u8>>, String> {
    if client_root.is_empty() {
        return Ok(None);
    }
    let cache_dir = chronicle_dir(&app)?.join("terrain");
    let cache_file = cache_dir.join(format!("{x}_{y}.png"));
    if cache_file.is_file() {
        return fs::read(&cache_file).map(Some).map_err(|e| e.to_string());
    }
    let client = PathBuf::from(client_root);
    match extractor::cache::get_region_terrain_texture(&state, &client, x, y).map_err(|e| e.to_string())? {
        Some((w, h, rgba)) => {
            let png = extractor::texture::rgba_to_png(w, h, rgba).map_err(|e| e.to_string())?;
            let _ = fs::create_dir_all(&cache_dir);
            let _ = fs::write(&cache_file, &png);
            Ok(Some(png))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn clear_texture_cache(state: tauri::State<ExtractorState>, app: tauri::AppHandle) -> Result<(), String> {
    state.invalidate();
    let base = chronicle_dir(&app)?;
    for sub in ["textures", "terrain"] {
        let dir = base.join(sub);
        if dir.is_dir() {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
