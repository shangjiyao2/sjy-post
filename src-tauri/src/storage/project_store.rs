use crate::models::environment::Environment;
use crate::models::project::{FolderMeta, Project, ProjectConfig, ProjectSettings, TreeNode, TreeNodeType};
use crate::models::request::RequestFile;
use crate::storage::file_manager::FileManager;
use crate::utils::error::{AppError, AppResult};
use std::io::ErrorKind;
use std::path::Path;

const PROJECT_CONFIG_FILE: &str = "sjypost.json";
const ENVIRONMENTS_DIR: &str = ".environments";
const REQUEST_EXT: &str = ".req.json";
const WEBSOCKET_EXT: &str = ".ws.json";
const FOLDER_META_FILE: &str = "_folder.json";

pub struct ProjectStore {
    file_manager: FileManager,
}

impl ProjectStore {
    pub fn new() -> Self {
        Self {
            file_manager: FileManager::new(),
        }
    }

    /// Create a new project at the specified path
    pub async fn create_project(&self, path: &Path, name: &str) -> AppResult<Project> {
        // Create project directory
        self.file_manager.create_dir(path).await?;

        // Create project config
        let config = ProjectConfig {
            version: "1.0.0".to_string(),
            name: name.to_string(),
            active_environment: Some("dev".to_string()),
            settings: ProjectSettings::default(),
        };

        // Write config file
        let config_path = path.join(PROJECT_CONFIG_FILE);
        self.file_manager.write_json(&config_path, &config).await?;

        // Create environments directory
        let env_dir = path.join(ENVIRONMENTS_DIR);
        self.file_manager.create_dir(&env_dir).await?;

        // Create default dev environment
        let dev_env = Environment {
            id: "dev".to_string(),
            name: "Development".to_string(),
            variables: std::collections::HashMap::new(),
        };
        let dev_env_path = env_dir.join("dev.env.json");
        self.file_manager.write_json(&dev_env_path, &dev_env).await?;

        Ok(Project {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            config,
        })
    }

    /// Open an existing project
    pub async fn open_project(&self, path: &Path) -> AppResult<Project> {
        let config_path = path.join(PROJECT_CONFIG_FILE);

        if !self.file_manager.exists(&config_path).await {
            return Err(AppError::ProjectNotFound(path.to_string_lossy().to_string()));
        }

        let config: ProjectConfig = self.file_manager.read_json(&config_path).await?;

        Ok(Project {
            path: path.to_string_lossy().to_string(),
            name: config.name.clone(),
            config,
        })
    }

    /// Read project tree structure recursively
    pub async fn read_tree(&self, project_path: &Path) -> AppResult<Vec<TreeNode>> {
        self.read_dir_tree(project_path, project_path).await
    }

    /// Recursively read directory tree
    async fn read_dir_tree(&self, base_path: &Path, dir_path: &Path) -> AppResult<Vec<TreeNode>> {
        let mut nodes = Vec::new();
        let mut entries = tokio::fs::read_dir(dir_path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and special directories
            if file_name.starts_with('.') || file_name == PROJECT_CONFIG_FILE || file_name == FOLDER_META_FILE {
                continue;
            }

            let relative_path = path.strip_prefix(base_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            if path.is_dir() {
                // Folder node - try to read _folder.json for display name
                let children = Box::pin(self.read_dir_tree(base_path, &path)).await?;
                let display_name = {
                    let meta_path = path.join(FOLDER_META_FILE);
                    if meta_path.exists() {
                        match self.file_manager.read_json::<FolderMeta>(&meta_path).await {
                            Ok(meta) if !meta.name.is_empty() && meta.name != file_name => meta.name,
                            _ => file_name.clone(),
                        }
                    } else {
                        file_name.clone()
                    }
                };
                nodes.push(TreeNode {
                    name: display_name,
                    path: relative_path,
                    node_type: TreeNodeType::Folder,
                    children,
                    method: None,
                });
            } else if file_name.ends_with(REQUEST_EXT) {
                // Request file
                let request: RequestFile = self.file_manager.read_json(&path).await?;
                let display_name = file_name.trim_end_matches(REQUEST_EXT).to_string();
                nodes.push(TreeNode {
                    name: display_name,
                    path: relative_path,
                    node_type: TreeNodeType::Request,
                    children: vec![],
                    method: Some(format!("{:?}", request.method).to_uppercase()),
                });
            } else if file_name.ends_with(WEBSOCKET_EXT) {
                // WebSocket file
                let display_name = file_name.trim_end_matches(WEBSOCKET_EXT).to_string();
                nodes.push(TreeNode {
                    name: display_name,
                    path: relative_path,
                    node_type: TreeNodeType::Websocket,
                    children: vec![],
                    method: Some("WS".to_string()),
                });
            }
        }

        // Sort: folders first, then by name
        nodes.sort_by(|a, b| {
            match (&a.node_type, &b.node_type) {
                (TreeNodeType::Folder, TreeNodeType::Folder) => a.name.cmp(&b.name),
                (TreeNodeType::Folder, _) => std::cmp::Ordering::Less,
                (_, TreeNodeType::Folder) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            }
        });

        Ok(nodes)
    }

    /// Create a folder
    pub async fn create_folder(&self, folder_path: &Path, name: &str) -> AppResult<TreeNode> {
        let new_folder_path = folder_path.join(name);
        self.file_manager.create_dir(&new_folder_path).await?;

        // Create folder metadata
        let meta = FolderMeta {
            name: name.to_string(),
            description: String::new(),
            sort_order: vec![],
        };
        let meta_path = new_folder_path.join(FOLDER_META_FILE);
        self.file_manager.write_json(&meta_path, &meta).await?;

        Ok(TreeNode {
            name: name.to_string(),
            path: new_folder_path.to_string_lossy().to_string(),
            node_type: TreeNodeType::Folder,
            children: vec![],
            method: None,
        })
    }

    /// Save a request file
    pub async fn save_request(&self, path: &Path, request: &RequestFile) -> AppResult<()> {
        self.file_manager.write_json(path, request).await
    }

    /// Read a request file
    pub async fn read_request(&self, path: &Path) -> AppResult<RequestFile> {
        self.file_manager.read_json(path).await
    }

    async fn sync_folder_meta_name(&self, folder_path: &Path, new_name: &str) -> AppResult<()> {
        let meta_path = folder_path.join(FOLDER_META_FILE);
        let mut meta: FolderMeta = match self.file_manager.read_json(&meta_path).await {
            Ok(meta) => meta,
            Err(AppError::Io(error)) if error.kind() == ErrorKind::NotFound => return Ok(()),
            Err(AppError::Json(_)) => return Ok(()),
            Err(error) => return Err(error),
        };

        meta.name = new_name.to_string();
        self.file_manager.write_json(&meta_path, &meta).await
    }

    /// Rename a node (file or folder)
    pub async fn rename_node(&self, old_path: &Path, new_name: &str) -> AppResult<()> {
        let parent = old_path.parent().ok_or_else(|| AppError::InvalidFormat("Invalid path".to_string()))?;

        if old_path.is_dir() {
            let new_path = parent.join(new_name);
            self.file_manager.rename(old_path, &new_path).await?;
            return self.sync_folder_meta_name(&new_path, new_name).await;
        }

        let new_path = {
            // Preserve file extension
            let ext = old_path.extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e))
                .unwrap_or_default();

            // For .req.json files, need special handling
            let old_name = old_path.file_name().unwrap().to_string_lossy();
            if old_name.ends_with(REQUEST_EXT) {
                parent.join(format!("{}{}", new_name, REQUEST_EXT))
            } else if old_name.ends_with(WEBSOCKET_EXT) {
                parent.join(format!("{}{}", new_name, WEBSOCKET_EXT))
            } else {
                parent.join(format!("{}{}", new_name, ext))
            }
        };

        self.file_manager.rename(old_path, &new_path).await
    }

    /// Delete a node (file or folder)
    pub async fn delete_node(&self, path: &Path) -> AppResult<()> {
        self.file_manager.delete(path).await
    }

    /// List all environments in the project
    pub async fn list_environments(&self, project_path: &Path) -> AppResult<Vec<Environment>> {
        let env_dir = project_path.join(ENVIRONMENTS_DIR);

        let mut environments = Vec::new();
        let mut entries = match tokio::fs::read_dir(&env_dir).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(vec![]),
            Err(error) => return Err(error.into()),
        };

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.ends_with(".env.json") {
                let env: Environment = self.file_manager.read_json(&path).await?;
                environments.push(env);
            }
        }

        Ok(environments)
    }

    /// Save an environment
    pub async fn save_environment(&self, project_path: &Path, env: &Environment) -> AppResult<()> {
        let env_path = project_path.join(ENVIRONMENTS_DIR).join(format!("{}.env.json", env.id));
        self.file_manager.write_json(&env_path, env).await
    }

    /// Persist the active environment for a project
    pub async fn set_active_environment(&self, project_path: &Path, env_id: Option<&str>) -> AppResult<()> {
        let config_path = project_path.join(PROJECT_CONFIG_FILE);
        let mut config: ProjectConfig = self.file_manager.read_json(&config_path).await?;
        config.active_environment = env_id.map(str::to_string);
        self.file_manager.write_json(&config_path, &config).await
    }

    /// Delete an environment
    pub async fn delete_environment(&self, project_path: &Path, env_id: &str) -> AppResult<()> {
        let config_path = project_path.join(PROJECT_CONFIG_FILE);
        let config: ProjectConfig = self.file_manager.read_json(&config_path).await?;
        let env_path = project_path.join(ENVIRONMENTS_DIR).join(format!("{}.env.json", env_id));
        self.file_manager.delete(&env_path).await?;

        if config.active_environment.as_deref() != Some(env_id) {
            return Ok(());
        }

        let environments = self.list_environments(project_path).await?;
        let next_active_environment = environments.first().map(|environment| environment.id.as_str());
        self.set_active_environment(project_path, next_active_environment).await
    }
}

impl Default for ProjectStore {
    fn default() -> Self {
        Self::new()
    }
}
