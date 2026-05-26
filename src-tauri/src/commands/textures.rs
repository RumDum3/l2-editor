use std::fs;
use std::path::PathBuf;

use crate::commands::config::chronicle_dir;
use crate::extractor;
use crate::extractor::cache::ExtractorState;

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
