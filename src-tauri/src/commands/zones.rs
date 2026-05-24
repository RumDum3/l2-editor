use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::util::atomic_write;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneEdit {
    pub file_path: String,
    pub zone_name: String,
    pub points: Vec<(i32, i32)>,
}

#[tauri::command]
pub async fn save_zone_edits(edits: Vec<ZoneEdit>) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let mut by_file: HashMap<String, Vec<ZoneEdit>> = HashMap::new();
        for e in edits {
            by_file.entry(e.file_path.clone()).or_default().push(e);
        }
        let mut updated = 0u32;
        for (path, file_edits) in by_file {
            updated += update_zones_in_file(&path, &file_edits)?;
        }
        Ok(updated)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

fn update_zones_in_file(path: &str, edits: &[ZoneEdit]) -> Result<u32, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    let mut updated = content;
    let mut count = 0u32;
    for edit in edits {
        updated = replace_zone_nodes(&updated, &edit.zone_name, &edit.points)?;
        count += 1;
    }
    atomic_write(Path::new(path), updated.as_bytes())?;
    Ok(count)
}

fn replace_zone_nodes(content: &str, zone_name: &str, points: &[(i32, i32)]) -> Result<String, String> {
    let name_pattern = format!("name=\"{}\"", zone_name);
    let name_idx = content
        .find(&name_pattern)
        .ok_or_else(|| format!("zone {zone_name} not found"))?;
    let zone_open = content[..name_idx]
        .rfind("<zone")
        .ok_or_else(|| format!("malformed XML around zone {zone_name}"))?;
    let close_rel = content[zone_open..]
        .find("</zone>")
        .ok_or_else(|| format!("unclosed zone {zone_name}"))?;
    let close_abs = zone_open + close_rel;
    let zone_block = &content[zone_open..close_abs];
    let first_node_rel = zone_block
        .find("<node")
        .ok_or_else(|| format!("zone {zone_name} has no <node> children to replace"))?;
    let absolute_first = zone_open + first_node_rel;

    let mut search_pos = first_node_rel;
    let mut end_of_nodes_rel = first_node_rel;
    loop {
        let remaining = &zone_block[search_pos..];
        let trimmed_start = remaining
            .bytes()
            .position(|b| !b.is_ascii_whitespace())
            .unwrap_or(remaining.len());
        let real = &remaining[trimmed_start..];
        if real.starts_with("<node") {
            let node_end_rel = real
                .find("/>")
                .map(|i| i + 2)
                .or_else(|| real.find("</node>").map(|i| i + "</node>".len()))
                .ok_or_else(|| format!("malformed <node> in zone {zone_name}"))?;
            end_of_nodes_rel = search_pos + trimmed_start + node_end_rel;
            search_pos = end_of_nodes_rel;
        } else {
            break;
        }
    }
    let absolute_end = zone_open + end_of_nodes_rel;

    let line_start = content[..absolute_first].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let indent = &content[line_start..absolute_first];

    let mut new_nodes = String::with_capacity(points.len() * 40);
    for (i, (x, y)) in points.iter().enumerate() {
        if i > 0 {
            new_nodes.push('\n');
            new_nodes.push_str(indent);
        }
        new_nodes.push_str(&format!("<node X=\"{}\" Y=\"{}\" />", x, y));
    }

    let mut out = String::with_capacity(content.len() + new_nodes.len());
    out.push_str(&content[..absolute_first]);
    out.push_str(&new_nodes);
    out.push_str(&content[absolute_end..]);
    Ok(out)
}
