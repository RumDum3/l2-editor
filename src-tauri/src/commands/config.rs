use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::util::atomic_write;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub data_root: String,
    #[serde(default)]
    pub client_root: String,
    #[serde(default)]
    pub skill_names_dat_path: String,
    #[serde(default)]
    pub skillgrp_dat_path: String,
    #[serde(default)]
    pub tier2_dat_paths: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub client_protocol: Option<u32>,
    #[serde(default)]
    pub chronicle_id: Option<String>,
}

pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app config dir: {e}"))?;
    Ok(dir.join("config.json"))
}

pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let Ok(path) = config_path(app) else { return AppConfig::default() };
    if !path.is_file() {
        return AppConfig::default();
    }
    fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn chronicle_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| format!("app data dir: {e}"))?;
    let name = match load_config(app).client_protocol {
        Some(p) => format!("p{p}"),
        None => "_unknown".to_string(),
    };
    let dir = base.join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("create cache dir: {e}"))?;
    Ok(dir)
}

fn ui_prefs_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app config dir: {e}"))?;
    Ok(dir.join("ui_prefs.json"))
}

#[tauri::command]
pub fn read_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    if !path.is_file() {
        return Ok(AppConfig::default());
    }
    let bytes = fs::read(&path).map_err(|e| format!("read config: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("parse config: {e}"))
}

#[tauri::command]
pub fn write_config(app: tauri::AppHandle, cfg: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let bytes = serde_json::to_vec_pretty(&cfg).map_err(|e| format!("serialize config: {e}"))?;
    atomic_write(&path, &bytes)
}

#[tauri::command]
pub fn read_ui_prefs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = ui_prefs_path(&app)?;
    if !path.is_file() {
        return Ok(serde_json::Value::Object(serde_json::Map::new()));
    }
    let bytes = fs::read(&path).map_err(|e| format!("read ui prefs: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("parse ui prefs: {e}"))
}

#[tauri::command]
pub fn write_ui_prefs(app: tauri::AppHandle, prefs: serde_json::Value) -> Result<(), String> {
    let path = ui_prefs_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let bytes = serde_json::to_vec_pretty(&prefs).map_err(|e| format!("serialize ui prefs: {e}"))?;
    atomic_write(&path, &bytes)
}
