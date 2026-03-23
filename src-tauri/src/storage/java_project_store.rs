use crate::commands::java_cmd::ParsedJavaProject;
use crate::storage::file_manager::FileManager;
use crate::utils::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const JAVA_PROJECTS_FILE: &str = "java_projects.json";

/// Stored Java project reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredJavaProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_open: bool,
    pub last_parsed_at: String,
    /// Store endpoint IDs that user has seen (for detecting new ones)
    pub seen_endpoint_ids: Vec<String>,
}

/// Java projects storage
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JavaProjectsStorage {
    pub projects: Vec<StoredJavaProject>,
}

pub struct JavaProjectStore {
    file_manager: FileManager,
}

impl JavaProjectStore {
    pub fn new() -> Self {
        Self {
            file_manager: FileManager::new(),
        }
    }

    /// Get the storage file path
    fn get_storage_path(app_handle: &AppHandle) -> AppResult<PathBuf> {
        let app_data_dir = app_handle.path().app_data_dir()?;
        Ok(app_data_dir.join(JAVA_PROJECTS_FILE))
    }

    /// Load all stored Java projects
    pub async fn load_projects(&self, app_handle: &AppHandle) -> AppResult<JavaProjectsStorage> {
        let storage_path = Self::get_storage_path(app_handle)?;

        if !self.file_manager.exists(&storage_path).await {
            return Ok(JavaProjectsStorage::default());
        }

        self.file_manager.read_json(&storage_path).await
    }

    /// Save Java projects storage
    pub async fn save_projects(&self, app_handle: &AppHandle, storage: &JavaProjectsStorage) -> AppResult<()> {
        let storage_path = Self::get_storage_path(app_handle)?;

        // Ensure the directory exists
        if let Some(parent) = storage_path.parent() {
            self.file_manager.create_dir(parent).await?;
        }

        self.file_manager.write_json(&storage_path, storage).await
    }

    /// Add a new Java project
    pub async fn add_project(&self, app_handle: &AppHandle, project: StoredJavaProject) -> AppResult<()> {
        let mut storage = self.load_projects(app_handle).await?;

        // Check if project already exists (by path)
        if let Some(existing) = storage.projects.iter_mut().find(|p| p.path == project.path) {
            // Update existing project
            existing.name = project.name;
            existing.last_parsed_at = project.last_parsed_at;
            existing.seen_endpoint_ids = project.seen_endpoint_ids;
        } else {
            storage.projects.push(project);
        }

        self.save_projects(app_handle, &storage).await
    }

    /// Update a Java project
    pub async fn update_project(&self, app_handle: &AppHandle, project: StoredJavaProject) -> AppResult<()> {
        let mut storage = self.load_projects(app_handle).await?;

        if let Some(existing) = storage.projects.iter_mut().find(|p| p.id == project.id) {
            *existing = project;
        }

        self.save_projects(app_handle, &storage).await
    }

    /// Set project open state
    pub async fn set_project_open(&self, app_handle: &AppHandle, project_id: &str, is_open: bool) -> AppResult<()> {
        let mut storage = self.load_projects(app_handle).await?;

        if let Some(project) = storage.projects.iter_mut().find(|p| p.id == project_id) {
            project.is_open = is_open;
        }

        self.save_projects(app_handle, &storage).await
    }

    /// Delete a Java project reference
    pub async fn delete_project(&self, app_handle: &AppHandle, project_id: &str) -> AppResult<()> {
        let mut storage = self.load_projects(app_handle).await?;
        storage.projects.retain(|p| p.id != project_id);
        self.save_projects(app_handle, &storage).await
    }

    /// Mark endpoints as seen for a project
    pub async fn mark_endpoints_seen(&self, app_handle: &AppHandle, project_id: &str, endpoint_ids: Vec<String>) -> AppResult<()> {
        let mut storage = self.load_projects(app_handle).await?;

        if let Some(project) = storage.projects.iter_mut().find(|p| p.id == project_id) {
            // Merge new endpoint IDs with existing ones
            for id in endpoint_ids {
                if !project.seen_endpoint_ids.contains(&id) {
                    project.seen_endpoint_ids.push(id);
                }
            }
        }

        self.save_projects(app_handle, &storage).await
    }

    /// Get new (unseen) endpoints by comparing parsed data with seen IDs
    pub fn get_new_endpoints(&self, project: &StoredJavaProject, parsed_data: &ParsedJavaProject) -> Vec<String> {
        let mut new_endpoint_ids = Vec::new();

        for controller in &parsed_data.controllers {
            for endpoint in &controller.endpoints {
                // An endpoint is "new" if its ID is not in the seen list
                // We use a composite key: controller_name + method + path
                let composite_key = format!("{}:{}:{}", controller.name, endpoint.http_method, endpoint.full_path);
                if !project.seen_endpoint_ids.contains(&composite_key) {
                    new_endpoint_ids.push(endpoint.id.clone());
                }
            }
        }

        new_endpoint_ids
    }
}

impl Default for JavaProjectStore {
    fn default() -> Self {
        Self::new()
    }
}
