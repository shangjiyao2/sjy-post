use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub path: String,
    pub name: String,
    pub config: ProjectConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub active_environment: Option<String>,
    #[serde(default)]
    pub settings: ProjectSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    #[serde(default = "default_timeout")]
    pub request_timeout: u64,
    #[serde(default = "default_true")]
    pub verify_ssl: bool,
    #[serde(default = "default_history_days")]
    pub max_history_days: u32,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            request_timeout: 30000,
            verify_ssl: true,
            max_history_days: 30,
        }
    }
}

fn default_timeout() -> u64 {
    30000
}

fn default_true() -> bool {
    true
}

fn default_history_days() -> u32 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub node_type: TreeNodeType,
    #[serde(default)]
    pub children: Vec<TreeNode>,
    /// HTTP method, only for request nodes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TreeNodeType {
    Folder,
    Request,
    Websocket,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub sort_order: Vec<String>,
}
