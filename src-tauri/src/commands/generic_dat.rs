use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::commands::config::chronicle_dir;
use crate::commands::skill_name::{skillname_db_path, SkillNameRuntime};
use crate::commands::skillgrp::{skillgrp_db_path, SkillgrpRuntime};
use crate::dat_db;
use crate::util::{now_unix_secs, remove_legacy_json_cache, sanitize_key, source_fingerprint, source_fresh};

pub const GENERIC_DAT_DB_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericDatSummary {
    pub key: String,
    pub imported_at: String,
    pub source: String,
    pub row_count: u32,
    pub schema_name: String,
    pub schema_variant: String,
    pub index_field: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetToLevelResult {
    pub skillgrp_delta: i32,
    pub skillname_delta: i32,
}

pub struct GenericDatLoaded {
    pub summary: GenericDatSummary,
    pub dirty: std::collections::HashSet<u32>,
}

#[derive(Default)]
pub struct GenericDatRuntime {
    pub inner: std::sync::Mutex<std::collections::HashMap<String, GenericDatLoaded>>,
}

fn generic_dat_db_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(chronicle_dir(app)?.join(format!("dat_{}.sqlite", sanitize_key(key))))
}

fn summary_from_db(m: &dat_db::DbMeta, key: &str) -> Result<GenericDatSummary, String> {
    let dat_meta: dat_engine::DatMeta =
        serde_json::from_str(&m.dat_meta_json).map_err(|e| format!("parse stored DatMeta: {e}"))?;
    Ok(GenericDatSummary {
        key: key.to_string(),
        imported_at: m.imported_at.clone(),
        source: m.source.clone(),
        row_count: m.row_count,
        schema_name: dat_meta.schema_name,
        schema_variant: dat_meta.schema_variant,
        index_field: m.index_field.clone(),
    })
}

#[tauri::command]
pub fn prune_legacy_dat_caches(app: tauri::AppHandle, present_keys: Vec<String>) -> Result<u32, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("app data dir: {e}"))?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(0) };
    let present: std::collections::HashSet<String> =
        present_keys.iter().map(|k| sanitize_key(k)).collect();
    let mut removed = 0u32;
    for ent in entries.flatten() {
        let name = ent.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(key) = name.strip_prefix("dat_").and_then(|s| s.strip_suffix(".json")) else { continue };
        let sqlite_exists = dir.join(format!("dat_{key}.sqlite")).is_file();
        if (sqlite_exists || !present.contains(key)) && fs::remove_file(ent.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn import_generic_dat(
    app: tauri::AppHandle,
    key: String,
    path: String,
    index_field: Option<String>,
) -> Result<GenericDatSummary, String> {
    let db = generic_dat_db_path(&app, &key)?;
    let app_for_state = app.clone();
    let key_clone = key.clone();
    let summary = tauri::async_runtime::spawn_blocking(move || -> Result<GenericDatSummary, String> {
        let dat = PathBuf::from(&path);
        if !dat.is_file() {
            return Err(format!("file not found: {}", dat.display()));
        }
        let parsed = dat_engine::load_dat(&dat).map_err(|e| e.to_string())?;
        let (source_mtime, source_size) = source_fingerprint(&dat);
        let idx_field = index_field.unwrap_or_else(|| "skill_id".to_string());
        let section = if parsed.data.get("skill").is_some() {
            "skill".to_string()
        } else {
            parsed
                .data
                .as_object()
                .and_then(|o| o.iter().find(|(_, v)| v.is_array()).map(|(k, _)| k.clone()))
                .unwrap_or_else(|| "skill".to_string())
        };
        let meta = dat_engine::DatMeta {
            file_name: parsed.file_name.clone(),
            cipher_code: parsed.cipher_code,
            schema_name: parsed.schema_name.clone(),
            schema_variant: parsed.schema_variant.clone(),
            format: None,
        };
        let dat_meta_json = serde_json::to_string(&meta).map_err(|e| format!("serialize DatMeta: {e}"))?;
        let row_count = dat_db::create_from_tree(
            &db,
            parsed.data,
            &dat_db::DbMeta {
                version: GENERIC_DAT_DB_VERSION,
                imported_at: now_unix_secs(),
                source: dat.to_string_lossy().to_string(),
                source_mtime,
                source_size,
                row_count: 0,
                section: section.clone(),
                index_field: idx_field.clone(),
                dat_meta_json,
            },
        )?;
        Ok(GenericDatSummary {
            key: key_clone.clone(),
            imported_at: now_unix_secs(),
            source: dat.to_string_lossy().to_string(),
            row_count,
            schema_name: parsed.schema_name,
            schema_variant: parsed.schema_variant,
            index_field: idx_field,
        })
    })
    .await
    .map_err(|e| format!("join error: {e}"))??;

    remove_legacy_json_cache(&app, &format!("dat_{}.json", sanitize_key(&key)));
    {
        let runtime = app_for_state.state::<GenericDatRuntime>();
        runtime.inner.lock().unwrap().insert(
            key,
            GenericDatLoaded {
                summary: summary.clone(),
                dirty: std::collections::HashSet::new(),
            },
        );
    }
    Ok(summary)
}

#[tauri::command]
pub async fn read_generic_dat_summary(
    app: tauri::AppHandle,
    key: String,
) -> Result<Option<GenericDatSummary>, String> {
    {
        let runtime = app.state::<GenericDatRuntime>();
        let g = runtime.inner.lock().unwrap();
        if let Some(l) = g.get(&key) {
            return Ok(Some(l.summary.clone()));
        }
    }
    let db = generic_dat_db_path(&app, &key)?;
    let key_for_blocking = key.clone();
    let app_for_blocking = app.clone();
    let summary = tauri::async_runtime::spawn_blocking(move || -> Result<Option<GenericDatSummary>, String> {
        let Some(m) = dat_db::read_meta(&db)? else { return Ok(None) };
        if m.version != GENERIC_DAT_DB_VERSION || !source_fresh(&m.source, m.source_mtime, m.source_size) {
            return Ok(None);
        }
        Ok(Some(summary_from_db(&m, &key_for_blocking)?))
    })
    .await
    .map_err(|e| format!("join error: {e}"))??;
    match summary {
        Some(s) => {
            let runtime = app_for_blocking.state::<GenericDatRuntime>();
            runtime.inner.lock().unwrap().insert(
                key,
                GenericDatLoaded {
                    summary: s.clone(),
                    dirty: std::collections::HashSet::new(),
                },
            );
            Ok(Some(s))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn lookup_generic_rows(
    app: tauri::AppHandle,
    key: String,
    skill_ids: Vec<u32>,
) -> Result<std::collections::HashMap<u32, Vec<serde_json::Value>>, String> {
    let db = generic_dat_db_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || dat_db::rows_for_ids(&db, &skill_ids))
        .await
        .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub async fn dump_generic_dat_rows(
    app: tauri::AppHandle,
    key: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = generic_dat_db_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<serde_json::Value>, String> {
        let (tree, _meta, _n) = dat_db::dump_tree(&db)?;
        let Some(obj) = tree.as_object() else {
            return Ok(Vec::new());
        };
        for (_k, v) in obj {
            if let Some(arr) = v.as_array() {
                return Ok(arr.clone());
            }
        }
        Ok(Vec::new())
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub async fn distinct_generic_dat_values(
    app: tauri::AppHandle,
    key: String,
    field: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = generic_dat_db_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || dat_db::distinct_values(&db, &field))
        .await
        .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub fn apply_generic_dat_edits(
    app: tauri::AppHandle,
    key: String,
    locator: serde_json::Map<String, serde_json::Value>,
    fields: serde_json::Map<String, serde_json::Value>,
) -> Result<u32, String> {
    if !app.state::<GenericDatRuntime>().inner.lock().unwrap().contains_key(&key) {
        return Err(format!("dat '{key}' not loaded — import first"));
    }
    let db = generic_dat_db_path(&app, &key)?;
    let touched = dat_db::apply_locator_edits(&db, &locator, &fields)?;
    let hits = touched.len() as u32;
    let runtime = app.state::<GenericDatRuntime>();
    let mut g = runtime.inner.lock().unwrap();
    if let Some(loaded) = g.get_mut(&key) {
        for id in touched {
            loaded.dirty.insert(id);
        }
    }
    Ok(hits)
}

#[tauri::command]
pub fn delete_generic_dat_row(
    app: tauri::AppHandle,
    key: String,
    locator: serde_json::Map<String, serde_json::Value>,
) -> Result<u32, String> {
    if !app.state::<GenericDatRuntime>().inner.lock().unwrap().contains_key(&key) {
        return Err(format!("dat '{key}' not loaded — import first"));
    }
    let db = generic_dat_db_path(&app, &key)?;
    let removed = dat_db::delete_rows(&db, &locator)?;
    let n = removed.len() as u32;
    let runtime = app.state::<GenericDatRuntime>();
    let mut g = runtime.inner.lock().unwrap();
    if let Some(loaded) = g.get_mut(&key) {
        for id in removed {
            loaded.dirty.insert(id);
        }
        loaded.summary.row_count = loaded.summary.row_count.saturating_sub(n);
    }
    Ok(n)
}

#[tauri::command]
pub fn add_generic_dat_row(
    app: tauri::AppHandle,
    key: String,
    template_locator: serde_json::Map<String, serde_json::Value>,
    overrides: serde_json::Map<String, serde_json::Value>,
) -> Result<Option<u32>, String> {
    if !app.state::<GenericDatRuntime>().inner.lock().unwrap().contains_key(&key) {
        return Err(format!("dat '{key}' not loaded — import first"));
    }
    let db = generic_dat_db_path(&app, &key)?;
    let new_id = dat_db::add_row(&db, &template_locator, &overrides)?;
    let runtime = app.state::<GenericDatRuntime>();
    let mut g = runtime.inner.lock().unwrap();
    if let Some(loaded) = g.get_mut(&key) {
        if let Some(id) = new_id {
            loaded.dirty.insert(id);
        }
        loaded.summary.row_count = loaded.summary.row_count.saturating_add(1);
    }
    Ok(new_id)
}

#[tauri::command]
pub fn pending_generic_dat_ids(
    runtime: tauri::State<'_, GenericDatRuntime>,
    key: String,
) -> Result<Vec<u32>, String> {
    let g = runtime.inner.lock().unwrap();
    let Some(loaded) = g.get(&key) else { return Ok(Vec::new()) };
    let mut ids: Vec<u32> = loaded.dirty.iter().copied().collect();
    ids.sort();
    Ok(ids)
}

#[tauri::command]
pub async fn save_generic_dat(
    app: tauri::AppHandle,
    key: String,
    target_path: String,
) -> Result<dat_engine::SaveResult, String> {
    if !app.state::<GenericDatRuntime>().inner.lock().unwrap().contains_key(&key) {
        return Err(format!("dat '{key}' not loaded"));
    }
    let db = generic_dat_db_path(&app, &key)?;
    let target_str = target_path.clone();
    let target = PathBuf::from(target_path);
    let imported_at = now_unix_secs();
    let imported_at_for_runtime = imported_at.clone();
    let app_for_state = app.clone();
    let key_for_state = key.clone();

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

    let runtime = app_for_state.state::<GenericDatRuntime>();
    let mut g = runtime.inner.lock().unwrap();
    if let Some(loaded) = g.get_mut(&key_for_state) {
        loaded.summary.source = target_str;
        loaded.summary.imported_at = imported_at_for_runtime;
        loaded.dirty.clear();
    }
    Ok(result)
}

#[tauri::command]
pub fn set_skill_to_level(
    app: tauri::AppHandle,
    skill_id: u32,
    to_level: i64,
) -> Result<SetToLevelResult, String> {
    let skillgrp_delta = dat_db::resize_for_id(&skillgrp_db_path(&app)?, skill_id, to_level)?;
    if skillgrp_delta != 0 {
        app.state::<SkillgrpRuntime>().with_mut(|loaded| {
            loaded.dirty.insert(skill_id);
            loaded.summary.row_count =
                (loaded.summary.row_count as i64 + skillgrp_delta as i64).max(0) as u32;
        });
    }
    let skillname_delta = dat_db::resize_for_id(&skillname_db_path(&app)?, skill_id, to_level)?;
    if skillname_delta != 0 {
        app.state::<SkillNameRuntime>().with_mut(|loaded| {
            loaded.dirty.insert(skill_id);
            loaded.summary.row_count =
                (loaded.summary.row_count as i64 + skillname_delta as i64).max(0) as u32;
        });
    }
    Ok(SetToLevelResult { skillgrp_delta, skillname_delta })
}
