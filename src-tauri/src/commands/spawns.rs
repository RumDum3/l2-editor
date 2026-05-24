use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::util::atomic_write;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnEdit {
    pub file_path: String,
    pub npc_id: u32,
    pub old_x: i32,
    pub old_y: i32,
    pub new_x: i32,
    pub new_y: i32,
}

#[tauri::command]
pub async fn save_spawn_edits(edits: Vec<SpawnEdit>) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let mut by_file: HashMap<String, Vec<SpawnEdit>> = HashMap::new();
        for e in edits {
            by_file.entry(e.file_path.clone()).or_default().push(e);
        }
        let mut updated = 0u32;
        for (path, file_edits) in by_file {
            updated += update_spawns_in_file(&path, &file_edits)?;
        }
        Ok(updated)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

fn update_spawns_in_file(path: &str, edits: &[SpawnEdit]) -> Result<u32, String> {
    let mut content = fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    let mut count = 0u32;
    for edit in edits {
        content = replace_npc_coords(&content, edit)?;
        count += 1;
    }
    atomic_write(Path::new(path), content.as_bytes())?;
    Ok(count)
}

fn replace_npc_coords(content: &str, edit: &SpawnEdit) -> Result<String, String> {
    let id_pat = format!("id=\"{}\"", edit.npc_id);
    let mut search_from = 0usize;
    while let Some(rel) = content[search_from..].find(&id_pat) {
        let id_abs = search_from + rel;
        let Some(tag_start) = content[..id_abs].rfind('<') else {
            search_from = id_abs + id_pat.len();
            continue;
        };
        if !content[tag_start..].starts_with("<npc") {
            search_from = id_abs + id_pat.len();
            continue;
        }
        let tag_end_rel = content[tag_start..]
            .find('>')
            .ok_or_else(|| format!("malformed <npc> tag near offset {tag_start}"))?;
        let tag_end = tag_start + tag_end_rel + 1;
        let tag_str = &content[tag_start..tag_end];

        let cur_x = parse_int_attr(tag_str, "x");
        let cur_y = parse_int_attr(tag_str, "y");
        if cur_x == Some(edit.old_x) && cur_y == Some(edit.old_y) {
            let new_tag = replace_attr_or_insert(tag_str, "x", &edit.new_x.to_string());
            let new_tag = replace_attr_or_insert(&new_tag, "y", &edit.new_y.to_string());
            let mut out = String::with_capacity(content.len() + new_tag.len());
            out.push_str(&content[..tag_start]);
            out.push_str(&new_tag);
            out.push_str(&content[tag_end..]);
            return Ok(out);
        }
        search_from = tag_end;
    }
    Err(format!(
        "no <npc id=\"{}\" x=\"{}\" y=\"{}\"> found in source",
        edit.npc_id, edit.old_x, edit.old_y
    ))
}

fn parse_int_attr(tag: &str, name: &str) -> Option<i32> {
    let pat = format!(" {}=\"", name);
    let start = tag.find(&pat)? + pat.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    rest[..end].trim().parse::<f64>().ok().map(|f| f.round() as i32)
}

fn replace_attr_or_insert(tag: &str, name: &str, value: &str) -> String {
    let pat = format!(" {}=\"", name);
    if let Some(start) = tag.find(&pat) {
        let val_start = start + pat.len();
        if let Some(end_rel) = tag[val_start..].find('"') {
            let val_end = val_start + end_rel;
            let mut out = String::with_capacity(tag.len());
            out.push_str(&tag[..val_start]);
            out.push_str(value);
            out.push_str(&tag[val_end..]);
            return out;
        }
    }
    let close_idx = if tag.ends_with("/>") {
        tag.len() - 2
    } else {
        tag.len() - 1
    };
    let mut out = String::with_capacity(tag.len() + name.len() + value.len() + 4);
    out.push_str(tag[..close_idx].trim_end());
    out.push(' ');
    out.push_str(name);
    out.push_str("=\"");
    out.push_str(value);
    out.push('"');
    out.push_str(&tag[close_idx..]);
    out
}
