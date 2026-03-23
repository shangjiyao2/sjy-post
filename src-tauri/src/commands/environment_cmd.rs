use crate::models::environment::Environment;
use crate::storage::project_store::ProjectStore;
use crate::utils::error::AppResult;
use std::collections::HashMap;
use std::path::Path;

#[tauri::command]
pub async fn list_environments(project_path: String) -> AppResult<Vec<Environment>> {
    let store = ProjectStore::new();
    store.list_environments(Path::new(&project_path)).await
}

#[tauri::command]
pub async fn save_environment(project_path: String, environment: Environment) -> AppResult<()> {
    let store = ProjectStore::new();
    store.save_environment(Path::new(&project_path), &environment).await
}

#[tauri::command]
pub async fn delete_environment(project_path: String, env_id: String) -> AppResult<()> {
    let store = ProjectStore::new();
    store.delete_environment(Path::new(&project_path), &env_id).await
}

#[tauri::command]
pub async fn set_active_environment(project_path: String, env_id: Option<String>) -> AppResult<()> {
    let store = ProjectStore::new();
    store.set_active_environment(Path::new(&project_path), env_id.as_deref()).await
}

#[tauri::command]
pub async fn resolve_variables(template: String, variables: HashMap<String, String>) -> AppResult<String> {
    use crate::utils::variable;
    Ok(variable::resolve(&template, &variables))
}
