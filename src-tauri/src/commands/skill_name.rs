use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

use crate::commands::config::chronicle_dir;
use crate::commands::skillgrp::ClientFieldUpdate;
use crate::dat_db;
use crate::runtime::RuntimeSlot;
use crate::util::{now_unix_secs, remove_legacy_json_cache, source_fingerprint, source_fresh};

pub const SKILLNAME_DB_VERSION: u32 = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillNameSummary {
    pub version: u32,
    pub imported_at: String,
    pub source: String,
    pub row_count: u32,
    pub meta: dat_engine::DatMeta,
}

fn summary_from_db(m: &dat_db::DbMeta) -> Result<SkillNameSummary, String> {
    let meta: dat_engine::DatMeta =
        serde_json::from_str(&m.dat_meta_json).map_err(|e| format!("parse stored DatMeta: {e}"))?;
    Ok(SkillNameSummary {
        version: m.version,
        imported_at: m.imported_at.clone(),
        source: m.source.clone(),
        row_count: m.row_count,
        meta,
    })
}

pub type SkillNameRuntime = RuntimeSlot<SkillNameLoaded>;

pub struct SkillNameLoaded {
    pub summary: SkillNameSummary,
    pub dirty: std::collections::HashSet<u32>,
    pub orig: std::collections::HashMap<u32, Vec<serde_json::Value>>,
}

pub fn skillname_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(chronicle_dir(app)?.join("skill_names.sqlite"))
}

fn summary_from_disk(app: &tauri::AppHandle) -> Result<Option<SkillNameSummary>, String> {
    let db = skillname_db_path(app)?;
    let Some(m) = dat_db::read_meta(&db)? else { return Ok(None) };
    if m.version != SKILLNAME_DB_VERSION || !source_fresh(&m.source, m.source_mtime, m.source_size) {
        return Ok(None);
    }
    Ok(Some(summary_from_db(&m)?))
}

fn flatten_skillname_tree(mut data: serde_json::Value) -> (serde_json::Value, std::collections::HashMap<u32, Vec<usize>>) {
    use std::collections::HashMap;

    let mut pool: HashMap<u32, String> = HashMap::new();
    if let Some(arr) = data.get("skill_txt").and_then(|v| v.as_array()) {
        for entry in arr {
            let Some(obj) = entry.as_object() else { continue };
            let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let index = obj.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            pool.insert(index, text);
        }
    }

    let name_fields = [
        "name",
        "desc",
        "desc_param",
        "enchant_name",
        "enchant_name_param",
        "enchant_desc",
        "enchant_desc_param",
    ];
    let mut id_to_indices: HashMap<u32, Vec<usize>> = HashMap::new();
    if let Some(arr) = data.get_mut("skill").and_then(|v| v.as_array_mut()) {
        for (idx, row) in arr.iter_mut().enumerate() {
            let Some(obj) = row.as_object_mut() else { continue };
            if let Some(id) = obj.get("skill_id").and_then(|v| v.as_u64()) {
                id_to_indices.entry(id as u32).or_default().push(idx);
            }
            for f in name_fields {
                let resolved = obj
                    .get(f)
                    .and_then(|v| v.as_u64())
                    .and_then(|i| pool.get(&(i as u32)).cloned());
                if let Some(s) = resolved {
                    obj.insert(f.to_string(), serde_json::Value::String(s));
                }
            }
        }
    }

    if let Some(o) = data.as_object_mut() {
        o.remove("skill_txt");
        o.remove("data");
    }
    (data, id_to_indices)
}

#[tauri::command]
pub async fn import_skill_names(
    app: tauri::AppHandle,
    path: String,
) -> Result<SkillNameSummary, String> {
    let db = skillname_db_path(&app)?;
    let app_for_state = app.clone();
    let summary = tauri::async_runtime::spawn_blocking(move || -> Result<SkillNameSummary, String> {
        let dat = PathBuf::from(&path);
        if !dat.is_file() {
            return Err(format!("file not found: {}", dat.display()));
        }
        let parsed = dat_engine::load_dat(&dat).map_err(|e| e.to_string())?;
        let (source_mtime, source_size) = source_fingerprint(&dat);
        let (flat, _id_to_indices) = flatten_skillname_tree(parsed.data);
        let meta = dat_engine::DatMeta {
            file_name: parsed.file_name.clone(),
            cipher_code: parsed.cipher_code,
            schema_name: parsed.schema_name.clone(),
            schema_variant: parsed.schema_variant.clone(),
            format: Some("SkillNameFormat".to_string()),
        };
        let dat_meta_json = serde_json::to_string(&meta).map_err(|e| format!("serialize DatMeta: {e}"))?;
        let row_count = dat_db::create_from_tree(
            &db,
            flat,
            &dat_db::DbMeta {
                version: SKILLNAME_DB_VERSION,
                imported_at: now_unix_secs(),
                source: dat.to_string_lossy().to_string(),
                source_mtime,
                source_size,
                row_count: 0,
                section: "skill".to_string(),
                index_field: "skill_id".to_string(),
                dat_meta_json,
            },
        )?;
        Ok(SkillNameSummary {
            version: SKILLNAME_DB_VERSION,
            imported_at: now_unix_secs(),
            source: dat.to_string_lossy().to_string(),
            row_count,
            meta,
        })
    })
    .await
    .map_err(|e| format!("join error: {e}"))??;

    remove_legacy_json_cache(&app, "skill_names.json");
    app_for_state.state::<SkillNameRuntime>().replace(SkillNameLoaded {
        summary: summary.clone(),
        dirty: std::collections::HashSet::new(),
        orig: std::collections::HashMap::new(),
    });
    Ok(summary)
}

#[tauri::command]
pub async fn read_skillname_summary(app: tauri::AppHandle) -> Result<Option<SkillNameSummary>, String> {
    if let Some(s) = app.state::<SkillNameRuntime>().with(|l| l.summary.clone()) {
        return Ok(Some(s));
    }
    let app_for_blocking = app.clone();
    let summary = tauri::async_runtime::spawn_blocking(move || summary_from_disk(&app_for_blocking))
        .await
        .map_err(|e| format!("join error: {e}"))??;
    match summary {
        Some(s) => {
            app.state::<SkillNameRuntime>().replace(SkillNameLoaded {
                summary: s.clone(),
                dirty: std::collections::HashSet::new(),
                orig: std::collections::HashMap::new(),
            });
            Ok(Some(s))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn lookup_skillname_rows(
    app: tauri::AppHandle,
    skill_ids: Vec<u32>,
) -> Result<std::collections::HashMap<u32, Vec<serde_json::Value>>, String> {
    let db = skillname_db_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || dat_db::rows_for_ids(&db, &skill_ids))
        .await
        .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub fn apply_skillname_edits(
    app: tauri::AppHandle,
    skill_id: u32,
    updates: Vec<ClientFieldUpdate>,
) -> Result<u32, String> {
    if !app.state::<SkillNameRuntime>().is_loaded() {
        return Err("skill names not loaded — import first".to_string());
    }
    let db = skillname_db_path(&app)?;
    let patches: Vec<dat_db::RowPatch<'_>> =
        updates.iter().map(|u| (u.level, u.sublevel, &u.fields)).collect();
    let res = dat_db::apply_edits(&db, skill_id, &patches)?;
    app.state::<SkillNameRuntime>().with_mut(|loaded| {
        loaded.orig.entry(skill_id).or_insert_with(|| res.before.clone());
        if loaded.orig.get(&skill_id) == Some(&res.after) {
            loaded.dirty.remove(&skill_id);
            loaded.orig.remove(&skill_id);
        } else {
            loaded.dirty.insert(skill_id);
        }
    });
    Ok(res.hits)
}

#[tauri::command]
pub fn present_skillname_ids(app: tauri::AppHandle) -> Result<Vec<u32>, String> {
    if !app.state::<SkillNameRuntime>().is_loaded() {
        return Ok(Vec::new());
    }
    dat_db::present_ids(&skillname_db_path(&app)?)
}

#[tauri::command]
pub fn add_skillname_row(
    app: tauri::AppHandle,
    skill_id: u32,
    level: i64,
    name: String,
) -> Result<Option<u32>, String> {
    if !app.state::<SkillNameRuntime>().is_loaded() {
        return Err("skill names not loaded — import first".to_string());
    }
    let db = skillname_db_path(&app)?;
    let mut overrides = serde_json::Map::new();
    overrides.insert("skill_id".to_string(), serde_json::Value::from(skill_id as i64));
    overrides.insert("skill_level".to_string(), serde_json::Value::from(level));
    overrides.insert("skill_sublevel".to_string(), serde_json::Value::from(0i64));
    overrides.insert("name".to_string(), serde_json::Value::from(name));
    let new_id = dat_db::add_row(&db, &serde_json::Map::new(), &overrides)?;
    if new_id.is_some() {
        app.state::<SkillNameRuntime>().with_mut(|loaded| {
            loaded.dirty.insert(skill_id);
            loaded.summary.row_count = loaded.summary.row_count.saturating_add(1);
        });
    }
    Ok(new_id)
}

#[tauri::command]
pub async fn save_skillname(
    app: tauri::AppHandle,
    target_path: String,
) -> Result<dat_engine::SaveResult, String> {
    if !app.state::<SkillNameRuntime>().is_loaded() {
        return Err("skill names not loaded".to_string());
    }
    let db = skillname_db_path(&app)?;
    let target = PathBuf::from(target_path);
    let imported_at = now_unix_secs();
    let imported_at_for_runtime = imported_at.clone();
    let app_for_state = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<dat_engine::SaveResult, String> {
        let (mut tree, dat_meta_json, _row_count) = dat_db::dump_tree(&db)?;
        let meta: Option<dat_engine::DatMeta> = serde_json::from_str(&dat_meta_json).ok();
        let cb = |_phase: dat_engine::SavePhase, _done: usize, _total: usize| {};
        let res = dat_engine::save_dat(&target, &mut tree, meta, cb).map_err(|e| e.to_string())?;
        let (m, s) = source_fingerprint(&target);
        dat_db::restamp_source(&db, m, s, &imported_at)?;
        Ok(res)
    })
    .await
    .map_err(|e| format!("join error: {e}"))??;

    app_for_state.state::<SkillNameRuntime>().with_mut(|loaded| {
        loaded.dirty.clear();
        loaded.orig.clear();
        loaded.summary.imported_at = imported_at_for_runtime;
    });
    Ok(result)
}

#[tauri::command]
pub fn pending_skillname_ids(
    runtime: tauri::State<'_, SkillNameRuntime>,
) -> Result<Vec<u32>, String> {
    Ok(runtime
        .with(|loaded| {
            let mut ids: Vec<u32> = loaded.dirty.iter().copied().collect();
            ids.sort();
            ids
        })
        .unwrap_or_default())
}
