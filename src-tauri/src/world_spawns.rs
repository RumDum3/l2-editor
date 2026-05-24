use std::path::{Path, PathBuf};

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use rayon::prelude::*;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcInfo {
    pub id: u32,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub level: u32,
    pub file_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnPoint {
    pub npc_id: u32,
    pub x: i32,
    pub y: i32,
    pub count: u32,
    pub respawn: String,
    pub file_path: String,
    pub inline_coords: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldSpawns {
    pub npcs: Vec<NpcInfo>,
    pub spawns: Vec<SpawnPoint>,
}

fn attr(e: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    for a in e.attributes().with_checks(false).flatten() {
        if a.key.as_ref() == key {
            return a.unescape_value().ok().map(|c| c.into_owned());
        }
    }
    None
}

fn iattr(e: &BytesStart<'_>, key: &[u8]) -> Option<i32> {
    attr(e, key).and_then(|s| s.trim().parse::<f64>().ok()).map(|f| f.round() as i32)
}

fn xml_files(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() {
            if recursive {
                xml_files(&p, true, out);
            }
        } else if p.extension().and_then(|s| s.to_str()).map(|e| e.eq_ignore_ascii_case("xml")).unwrap_or(false) {
            out.push(p);
        }
    }
}

fn npc_info(e: &BytesStart<'_>, file_path: &str) -> Option<NpcInfo> {
    let id: u32 = attr(e, b"id")?.trim().parse().ok()?;
    Some(NpcInfo {
        id,
        name: attr(e, b"name").unwrap_or_default(),
        kind: attr(e, b"type").unwrap_or_default(),
        level: attr(e, b"level").and_then(|s| s.trim().parse().ok()).unwrap_or(0),
        file_path: file_path.to_string(),
    })
}

fn parse_npc_index(path: &Path) -> Vec<NpcInfo> {
    let Ok(text) = std::fs::read_to_string(path) else { return Vec::new() };
    let file_path = path.to_string_lossy().into_owned();
    let mut reader = Reader::from_str(&text);
    let mut out = Vec::new();
    let mut is_list_stack: Vec<bool> = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name();
                if name.as_ref() == b"npc" && is_list_stack.last() == Some(&true) {
                    if let Some(info) = npc_info(&e, &file_path) {
                        out.push(info);
                    }
                }
                is_list_stack.push(name.as_ref() == b"list");
            }
            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"npc" && is_list_stack.last() == Some(&true) {
                    if let Some(info) = npc_info(&e, &file_path) {
                        out.push(info);
                    }
                }
            }
            Ok(Event::End(_)) => {
                is_list_stack.pop();
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

fn parse_spawn_file(path: &Path) -> Vec<SpawnPoint> {
    let Ok(text) = std::fs::read_to_string(path) else { return Vec::new() };
    let mut reader = Reader::from_str(&text);
    let mut out = Vec::new();
    let mut buf = Vec::new();
    let (mut tsx, mut tsy, mut tn): (i64, i64, i64) = (0, 0, 0);
    loop {
        let ev = reader.read_event_into(&mut buf);
        match ev {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => match e.name().as_ref() {
                b"spawn" => {
                    tsx = 0;
                    tsy = 0;
                    tn = 0;
                }
                b"node" => {
                    if let (Some(x), Some(y)) = (iattr(e, b"x"), iattr(e, b"y")) {
                        tsx += x as i64;
                        tsy += y as i64;
                        tn += 1;
                    }
                }
                b"npc" => {
                    if let Some(id) = attr(e, b"id").and_then(|s| s.trim().parse::<u32>().ok()) {
                        let (pos, inline) = match (iattr(e, b"x"), iattr(e, b"y")) {
                            (Some(x), Some(y)) => (Some((x, y)), true),
                            _ if tn > 0 => (Some(((tsx / tn) as i32, (tsy / tn) as i32)), false),
                            _ => (None, false),
                        };
                        if let Some((x, y)) = pos {
                            out.push(SpawnPoint {
                                npc_id: id,
                                x,
                                y,
                                count: attr(e, b"count").and_then(|s| s.trim().parse().ok()).unwrap_or(1),
                                respawn: attr(e, b"respawnTime").unwrap_or_default(),
                                file_path: path.to_string_lossy().into_owned(),
                                inline_coords: inline,
                            });
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

#[tauri::command]
pub async fn load_world_spawns(data_root: String) -> Result<WorldSpawns, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&data_root);
        let mut npc_files = Vec::new();
        xml_files(&root.join("stats").join("npcs"), false, &mut npc_files);
        let mut spawn_files = Vec::new();
        xml_files(&root.join("spawns"), true, &mut spawn_files);

        let npcs: Vec<NpcInfo> = npc_files.par_iter().flat_map(|p| parse_npc_index(p)).collect();
        let spawns: Vec<SpawnPoint> =
            spawn_files.par_iter().flat_map(|p| parse_spawn_file(p)).collect();
        WorldSpawns { npcs, spawns }
    })
    .await
    .map_err(|e| format!("join error: {e}"))
}
