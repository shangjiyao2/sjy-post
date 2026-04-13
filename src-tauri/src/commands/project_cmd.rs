use crate::models::project::{Project, TreeNode};
use crate::models::request::RequestFile;
use crate::storage::project_store::ProjectStore;
use crate::utils::error::AppResult;
use std::path::Path;

#[tauri::command]
pub async fn create_project(path: String, name: String) -> AppResult<Project> {
    let store = ProjectStore::new();
    store.create_project(Path::new(&path), &name).await
}

#[tauri::command]
pub async fn open_project(path: String) -> AppResult<Project> {
    let store = ProjectStore::new();
    store.open_project(Path::new(&path)).await
}

#[tauri::command]
pub async fn rename_project(path: String, name: String) -> AppResult<Project> {
    let store = ProjectStore::new();
    store.rename_project(Path::new(&path), &name).await
}

#[tauri::command]
pub async fn read_project_tree(project_path: String) -> AppResult<Vec<TreeNode>> {
    let store = ProjectStore::new();
    store.read_tree(Path::new(&project_path)).await
}

#[tauri::command]
pub async fn create_folder(project_path: String, parent_path: String, name: String) -> AppResult<TreeNode> {
    let store = ProjectStore::new();
    let full_path = Path::new(&project_path).join(&parent_path);
    store.create_folder(&full_path, &name).await
}

#[tauri::command]
pub async fn rename_node(project_path: String, node_path: String, new_name: String) -> AppResult<()> {
    let store = ProjectStore::new();
    let full_path = Path::new(&project_path).join(&node_path);
    store.rename_node(&full_path, &new_name).await
}

#[tauri::command]
pub async fn delete_node(project_path: String, node_path: String) -> AppResult<()> {
    let store = ProjectStore::new();
    let full_path = Path::new(&project_path).join(&node_path);
    store.delete_node(&full_path).await
}

#[tauri::command]
pub async fn save_request(project_path: String, request_path: String, request: RequestFile) -> AppResult<()> {
    let store = ProjectStore::new();
    let full_path = Path::new(&project_path).join(&request_path);
    store.save_request(&full_path, &request).await
}

#[tauri::command]
pub async fn read_request(project_path: String, request_path: String) -> AppResult<RequestFile> {
    let store = ProjectStore::new();
    let full_path = Path::new(&project_path).join(&request_path);
    store.read_request(&full_path).await
}
