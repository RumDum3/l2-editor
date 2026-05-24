use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDatPaths {
    pub skillgrp: Option<String>,
    pub skill_name: Option<String>,
    pub tier2: std::collections::HashMap<String, String>,
}

const TIER2_PATTERNS: &[(&str, &str)] = &[
    ("skill_soundgrp", "skillsoundgrp"),
    ("skill_acquire", "skillacquire"),
    ("replace_skill_icon", "replaceskillicon"),
    ("alter_skill_data", "alterskilldata"),
    ("skill_enchant_setting", "skillenchantsetting"),
    ("skill_enchant_charge", "skillenchantcharge"),
    ("class_info", "classinfo"),
    ("class_tree_desc", "classtreedesc"),
    ("class_tree", "classtree"),
    ("class_initial_stat", "characterinitialstatexdata"),
    ("minimap_region", "minimapregion"),
    ("hunting_zone", "huntingzone"),
    ("npc_name", "npcname"),
    ("npc_grp", "npcgrp"),
    ("npc_string", "npcstring"),
    ("npc_teleporter", "npcteleporter"),
];

#[tauri::command]
pub fn read_server_protocols(data_root: String) -> Result<Vec<u32>, String> {
    let path = PathBuf::from(&data_root)
        .parent()
        .map(|p| p.join("config").join("Server.ini"))
        .ok_or_else(|| "data_root has no parent".to_string())?;
    if !path.is_file() {
        return Err(format!("Server.ini not found at {}", path.display()));
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        let Some((key, raw_value)) = trimmed.split_once('=') else {
            continue;
        };
        if !key.trim().eq_ignore_ascii_case("AllowedProtocolRevisions") {
            continue;
        }
        let value = raw_value
            .split('#')
            .next()
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        let mut out = Vec::new();
        for part in value.split(|c: char| c == ',' || c.is_whitespace()) {
            if part.is_empty() {
                continue;
            }
            if let Ok(n) = part.parse::<u32>() {
                out.push(n);
            }
        }
        return Ok(out);
    }
    Err("AllowedProtocolRevisions not present in Server.ini".to_string())
}

#[tauri::command]
pub fn discover_client_dats(client_root: String) -> Result<ClientDatPaths, String> {
    let root = PathBuf::from(&client_root);
    let scan_root = {
        let sys = root.join("system");
        if sys.is_dir() { sys } else { root.clone() }
    };
    if !scan_root.is_dir() {
        return Err(format!("not a folder: {}", scan_root.display()));
    }

    let mut skillgrp: Vec<PathBuf> = Vec::new();
    let mut skill_name: Vec<PathBuf> = Vec::new();
    let mut tier2_cands: std::collections::HashMap<&str, Vec<PathBuf>> = std::collections::HashMap::new();
    walk_files(&scan_root, &mut |path, name_lc| {
        if !name_lc.ends_with(".dat") {
            return;
        }
        if name_lc.starts_with("skillgrp") {
            skillgrp.push(path.to_path_buf());
        } else if name_lc.starts_with("skillname") {
            skill_name.push(path.to_path_buf());
        } else {
            for (key, prefix) in TIER2_PATTERNS {
                if name_lc.starts_with(prefix) {
                    tier2_cands.entry(key).or_default().push(path.to_path_buf());
                    break;
                }
            }
        }
    });

    fn best(mut cands: Vec<PathBuf>, prefer: &[&str]) -> Option<String> {
        if cands.is_empty() {
            return None;
        }
        cands.sort_by_key(|p| {
            let name_lc = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let rank = prefer.iter().position(|w| *w == name_lc).unwrap_or(prefer.len());
            let depth = p.components().count();
            (rank, depth, name_lc)
        });
        cands
            .into_iter()
            .next()
            .map(|p| p.to_string_lossy().into_owned())
    }

    let mut tier2 = std::collections::HashMap::new();
    for (key, _) in TIER2_PATTERNS {
        if let Some(p) = best(tier2_cands.remove(key).unwrap_or_default(), &[]) {
            tier2.insert((*key).to_string(), p);
        }
    }

    Ok(ClientDatPaths {
        skillgrp: best(skillgrp, &["skillgrp.dat", "skillgrp_classic.dat"]),
        skill_name: best(skill_name, &["skillname-eu.dat", "skillname.dat"]),
        tier2,
    })
}

fn walk_files(dir: &Path, f: &mut impl FnMut(&Path, &str)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if ft.is_dir() {
            walk_files(&path, f);
        } else if ft.is_file() {
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                f(&path, &name.to_ascii_lowercase());
            }
        }
    }
}
