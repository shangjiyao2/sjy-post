mod commands;
mod models;
mod services;
mod storage;
mod importers;
mod exporters;
mod utils;

use commands::*;
use services::ws_engine::WsEngine;
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ws_engine: ws_cmd::WsEngineState = Arc::new(Mutex::new(WsEngine::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ws_engine)
        .invoke_handler(tauri::generate_handler![
            request_cmd::send_request,
            project_cmd::create_project,
            project_cmd::open_project,
            project_cmd::read_project_tree,
            project_cmd::create_folder,
            project_cmd::rename_node,
            project_cmd::delete_node,
            project_cmd::save_request,
            project_cmd::read_request,
            environment_cmd::list_environments,
            environment_cmd::save_environment,
            environment_cmd::delete_environment,
            environment_cmd::set_active_environment,
            environment_cmd::resolve_variables,
            import_cmd::preview_import,
            import_cmd::execute_import,
            import_cmd::import_request_file,
            history_cmd::add_history_entry,
            history_cmd::get_history_entries,
            history_cmd::get_history_entry,
            history_cmd::delete_history_entry,
            history_cmd::clear_history,
            ws_cmd::ws_connect,
            ws_cmd::ws_disconnect,
            ws_cmd::ws_send,
            ws_cmd::ws_get_status,
            ws_cmd::ws_get_messages,
            ws_cmd::ws_clear_messages,
            assert_cmd::run_assertions,
            java_cmd::parse_java_project,
            java_cmd::import_java_endpoints,
            java_cmd::get_java_projects,
            java_cmd::save_java_project,
            java_cmd::set_java_project_open,
            java_cmd::delete_java_project,
            java_cmd::mark_java_endpoints_seen,
            java_cmd::check_java_project_updates,
            api_doc_cmd::generate_api_docs,
            api_doc_cmd::list_api_docs,
            api_doc_cmd::read_api_doc,
            api_doc_cmd::delete_api_doc,
            api_doc_cmd::batch_delete_api_docs,
            global_env_cmd::list_global_environments,
            global_env_cmd::save_global_environment,
            global_env_cmd::delete_global_environment,
            global_env_cmd::set_active_global_environment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
