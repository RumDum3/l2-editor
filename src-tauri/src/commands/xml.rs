use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::util::atomic_write;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XmlFileEntry {
    pub name: String,
    pub path: String,
    pub range_from: Option<u32>,
    pub range_to: Option<u32>,
}

#[tauri::command]
pub fn read_xml(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("invalid utf-8 in {path}: {e}"))
}

#[tauri::command]
pub fn write_xml(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), content.as_bytes())
}

#[tauri::command]
pub fn list_xml_files(folder: String, recursive: Option<bool>) -> Result<Vec<XmlFileEntry>, String> {
    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let mut out = Vec::new();
    walk(dir, dir, recursive.unwrap_or(false), &mut out)?;
    if out.is_empty() {
        return Err(format!("no .xml files found in {}.", dir.display()));
    }
    out.sort_by(|a, b| match (a.range_from, b.range_from) {
        (Some(ax), Some(bx)) => ax.cmp(&bx),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });
    Ok(out)
}

fn walk(root: &Path, dir: &Path, recursive: bool, out: &mut Vec<XmlFileEntry>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            if recursive {
                walk(root, &path, true, out)?;
            }
            continue;
        }

        if !file_name.to_ascii_lowercase().ends_with(".xml") {
            continue;
        }

        let (range_from, range_to) = match parse_range(&file_name) {
            Some((a, b)) => (Some(a), Some(b)),
            None => (None, None),
        };

        let display = path
            .strip_prefix(root)
            .ok()
            .and_then(|p| p.to_str().map(|s| s.to_string()))
            .unwrap_or(file_name);

        out.push(XmlFileEntry {
            name: display,
            path: path.to_string_lossy().to_string(),
            range_from,
            range_to,
        });
    }
    Ok(())
}

fn parse_range(name: &str) -> Option<(u32, u32)> {
    let stem = name.strip_suffix(".xml")?;
    let (a, b) = stem.split_once('-')?;
    Some((a.parse().ok()?, b.parse().ok()?))
}
