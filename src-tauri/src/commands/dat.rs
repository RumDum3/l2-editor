use std::path::PathBuf;

#[tauri::command]
pub async fn load_dat(path: String) -> Result<dat_engine::LoadedDat, String> {
    tauri::async_runtime::spawn_blocking(move || {
        dat_engine::load_dat(&PathBuf::from(path)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub async fn save_dat(
    path: String,
    record: serde_json::Value,
    meta: Option<dat_engine::DatMeta>,
) -> Result<dat_engine::SaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cb = |_phase: dat_engine::SavePhase, _done: usize, _total: usize| {};
        let mut record = record;
        dat_engine::save_dat(&PathBuf::from(path), &mut record, meta, cb).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}
