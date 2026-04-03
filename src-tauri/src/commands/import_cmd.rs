use crate::importers::postman::{PostmanCollection, PostmanImporter, PostmanItem};
use crate::models::request::RequestFile;
use crate::storage::project_store::ProjectStore;
use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub source_type: String,
    pub total_requests: usize,
    pub total_folders: usize,
    pub environments: usize,
    pub tree_preview: Vec<ImportNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportNode {
    pub name: String,
    pub node_type: String,
    pub children: Vec<ImportNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportOptions {
    pub source_path: String,
    pub target_project_path: String,
    pub target_folder_path: Option<String>,
    pub include_environments: bool,
}

#[tauri::command]
pub async fn preview_import(file_path: String) -> AppResult<ImportPreview> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(AppError::FileNotFound(format!(
            "File not found: {}",
            file_path
        )));
    }

    // Try to detect file type and use appropriate importer
    let importer = PostmanImporter::new();
    importer.preview(path).await
}

#[tauri::command]
pub async fn execute_import(options: ImportOptions) -> AppResult<()> {
    let source_path = Path::new(&options.source_path);
    let target_path = Path::new(&options.target_project_path);

    if !source_path.exists() {
        return Err(AppError::FileNotFound(format!(
            "Source file not found: {}",
            options.source_path
        )));
    }

    if !target_path.exists() {
        return Err(AppError::FileNotFound(format!(
            "Target project not found: {}",
            options.target_project_path
        )));
    }

    let store = ProjectStore::new();

    // Read the Postman collection
    let content = fs::read_to_string(source_path)?;
    let collection: PostmanCollection = serde_json::from_str(&content)?;

    let importer = PostmanImporter::new();

    // Get folder structure and import
    import_items_to_project(
        &collection.item,
        target_path,
        &store,
        &importer,
    )
    .await?;

    // Import environments if requested
    if options.include_environments && !collection.variable.is_empty() {
        let (_, environments) = importer.import_collection(source_path).await?;
        let env_dir = target_path.join(".environments");
        if !env_dir.exists() {
            fs::create_dir_all(&env_dir)?;
        }

        for env in environments {
            let env_path = env_dir.join(format!("{}.env.json", sanitize_filename(&env.name)));
            let env_content = serde_json::to_string_pretty(&env)?;
            fs::write(&env_path, env_content)?;
        }
    }

    Ok(())
}

/// Recursively import Postman items to project
async fn import_items_to_project(
    items: &[PostmanItem],
    target_dir: &Path,
    store: &ProjectStore,
    importer: &PostmanImporter,
) -> AppResult<()> {
    for item in items {
        if !item.item.is_empty() {
            // Create folder
            let folder_path = target_dir.join(sanitize_filename(&item.name));
            if !folder_path.exists() {
                fs::create_dir_all(&folder_path)?;
            }

            // Recursively import children
            Box::pin(import_items_to_project(
                &item.item,
                &folder_path,
                store,
                importer,
            ))
            .await?;
        } else if let Some(request) = &item.request {
            // Convert and save request
            if let Some(req) = importer.convert_request_public(&item.name, request) {
                let file_name = format!("{}.req.json", sanitize_filename(&req.name));
                let file_path = target_dir.join(&file_name);
                store.save_request(&file_path, &req).await?;
            }
        }
    }

    Ok(())
}

/// Sanitize a string to be used as a filename
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Import a single .req.json file into a project folder
#[tauri::command]
pub async fn import_request_file(
    source_path: String,
    project_path: String,
    target_folder: String,
) -> AppResult<RequestFile> {
    let store = ProjectStore::new();
    let src = Path::new(&source_path);

    // Validate source file exists and is a .req.json file
    if !src.exists() {
        return Err(AppError::InvalidFormat(
            "Source file does not exist".to_string(),
        ));
    }

    // Read the request file
    let mut request: RequestFile = store.read_request(src).await?;

    // Assign a new ID to avoid conflicts
    request.id = uuid::Uuid::new_v4().to_string();
    // Update timestamps
    let now = chrono::Utc::now().to_rfc3339();
    request.meta.created_at = now.clone();
    request.meta.updated_at = now;

    // Build target path: project_path / target_folder / name.req.json
    let file_name = format!("{}.req.json", request.name);
    let target_dir = Path::new(&project_path).join(&target_folder);
    let target_path = target_dir.join(&file_name);

    // Ensure target directory exists
    if !target_dir.exists() {
        return Err(AppError::InvalidFormat(
            "Target folder does not exist".to_string(),
        ));
    }

    // Save the request
    store.save_request(&target_path, &request).await?;

    Ok(request)
}
