use crate::models::environment::Environment;
use crate::storage::file_manager::FileManager;
use crate::utils::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const GLOBAL_ENVIRONMENTS_FILE: &str = "global_environments.json";

/// Global environments storage
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GlobalEnvironmentsStorage {
    pub environments: Vec<Environment>,
    pub active_environment_id: Option<String>,
}

fn get_storage_path(app_handle: &AppHandle) -> AppResult<PathBuf> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    Ok(app_data_dir.join(GLOBAL_ENVIRONMENTS_FILE))
}

async fn load_storage(app_handle: &AppHandle) -> AppResult<GlobalEnvironmentsStorage> {
    let fm = FileManager::new();
    let path = get_storage_path(app_handle)?;

    if !fm.exists(&path).await {
        return Ok(GlobalEnvironmentsStorage::default());
    }

    fm.read_json(&path).await
}

async fn save_storage(app_handle: &AppHandle, storage: &GlobalEnvironmentsStorage) -> AppResult<()> {
    let fm = FileManager::new();
    let path = get_storage_path(app_handle)?;

    if let Some(parent) = path.parent() {
        fm.create_dir(parent).await?;
    }

    fm.write_json(&path, storage).await
}

/// List all global environments
#[tauri::command]
pub async fn list_global_environments(app_handle: AppHandle) -> AppResult<GlobalEnvironmentsStorage> {
    load_storage(&app_handle).await
}

/// Save a global environment (create or update)
#[tauri::command]
pub async fn save_global_environment(app_handle: AppHandle, environment: Environment) -> AppResult<()> {
    let mut storage = load_storage(&app_handle).await?;

    if let Some(existing) = storage.environments.iter_mut().find(|e| e.id == environment.id) {
        *existing = environment;
    } else {
        storage.environments.push(environment);
    }

    save_storage(&app_handle, &storage).await
}

/// Delete a global environment
#[tauri::command]
pub async fn delete_global_environment(app_handle: AppHandle, env_id: String) -> AppResult<()> {
    let mut storage = load_storage(&app_handle).await?;
    storage.environments.retain(|e| e.id != env_id);

    // Clear active if deleted
    if storage.active_environment_id.as_deref() == Some(&env_id) {
        storage.active_environment_id = storage.environments.first().map(|e| e.id.clone());
    }

    save_storage(&app_handle, &storage).await
}

/// Set active global environment
#[tauri::command]
pub async fn set_active_global_environment(app_handle: AppHandle, env_id: String) -> AppResult<()> {
    let mut storage = load_storage(&app_handle).await?;
    storage.active_environment_id = Some(env_id);
    save_storage(&app_handle, &storage).await
}
