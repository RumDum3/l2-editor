mod commands;
mod dat_db;
mod extractor;
mod runtime;
mod util;
mod world_spawns;

use commands::config::{read_config, read_ui_prefs, write_config, write_ui_prefs};
use commands::dat::{load_dat, save_dat};
use commands::discovery::{discover_client_dats, has_radar_map, read_server_protocols};
use commands::generic_dat::{
    add_generic_dat_row, apply_generic_dat_edits, delete_generic_dat_row,
    distinct_generic_dat_values, dump_generic_dat_rows, import_generic_dat, lookup_generic_rows,
    pending_generic_dat_ids, prune_legacy_dat_caches, read_generic_dat_summary,
    save_generic_dat, set_skill_to_level, GenericDatRuntime,
};
use commands::l2_probe::probe_l2_protocol;
use commands::skill_name::{
    apply_skillname_edits, import_skill_names, lookup_skillname_rows, pending_skillname_ids,
    read_skillname_summary, save_skillname, SkillNameRuntime,
};
use commands::skillgrp::{
    apply_skill_edits, import_skillgrp, lookup_skill_rows, pending_skill_ids,
    read_skillgrp_summary, save_skillgrp, SkillgrpRuntime,
};
use commands::textures::{
    clear_texture_cache, list_map_regions, list_textures, read_region_terrain_texture,
    read_texture,
};
use commands::chronicle::{chronicle_dats, infer_chronicle, list_chronicles};
use commands::model::{
    build_package_index, dump_mesh_payload, dump_package, list_package_exports, load_skeletal_mesh,
    resolve_npc_model,
};
use commands::npc::{load_npc_xml, save_npc_xml};
use commands::spawns::save_spawn_edits;
use commands::xml::{list_xml_files, read_xml, write_xml};
use commands::zones::save_zone_edits;
use extractor::cache::ExtractorState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ExtractorState::default())
        .manage(SkillgrpRuntime::default())
        .manage(SkillNameRuntime::default())
        .manage(GenericDatRuntime::default())
        .invoke_handler(tauri::generate_handler![
            read_config,
            write_config,
            read_ui_prefs,
            write_ui_prefs,
            read_xml,
            write_xml,
            list_xml_files,
            read_texture,
            list_textures,
            list_map_regions,
            read_region_terrain_texture,
            clear_texture_cache,
            probe_l2_protocol,
            read_server_protocols,
            discover_client_dats,
            has_radar_map,
            import_skill_names,
            read_skillname_summary,
            lookup_skillname_rows,
            apply_skillname_edits,
            save_skillname,
            pending_skillname_ids,
            set_skill_to_level,
            import_generic_dat,
            read_generic_dat_summary,
            lookup_generic_rows,
            distinct_generic_dat_values,
            dump_generic_dat_rows,
            apply_generic_dat_edits,
            delete_generic_dat_row,
            add_generic_dat_row,
            pending_generic_dat_ids,
            save_generic_dat,
            prune_legacy_dat_caches,
            import_skillgrp,
            read_skillgrp_summary,
            lookup_skill_rows,
            apply_skill_edits,
            pending_skill_ids,
            save_skillgrp,
            load_dat,
            save_dat,
            world_spawns::load_world_spawns,
            save_zone_edits,
            save_spawn_edits,
            load_npc_xml,
            save_npc_xml,
            dump_package,
            list_package_exports,
            build_package_index,
            resolve_npc_model,
            load_skeletal_mesh,
            dump_mesh_payload,
            list_chronicles,
            infer_chronicle,
            chronicle_dats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
