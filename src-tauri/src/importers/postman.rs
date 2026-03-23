use crate::commands::import_cmd::{ImportNode, ImportPreview};
use crate::models::auth::{ApiKeyLocation, AuthConfig};
use crate::models::environment::Environment;
use crate::models::request::{HttpMethod, KeyValueItem, RequestBody, RequestFile, RequestMeta};
use crate::utils::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Postman Collection v2.1 structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanCollection {
    pub info: PostmanInfo,
    pub item: Vec<PostmanItem>,
    #[serde(default)]
    pub variable: Vec<PostmanVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanInfo {
    pub name: String,
    #[serde(rename = "_postman_id")]
    pub postman_id: Option<String>,
    pub schema: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PostmanItem {
    Folder {
        name: String,
        item: Vec<PostmanItem>,
    },
    Request {
        name: String,
        request: PostmanRequest,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanRequest {
    pub method: String,
    pub url: PostmanUrl,
    #[serde(default)]
    pub header: Vec<PostmanHeader>,
    pub body: Option<PostmanBody>,
    pub auth: Option<PostmanAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PostmanUrl {
    Simple(String),
    Complex {
        raw: String,
        #[serde(default)]
        host: Vec<String>,
        #[serde(default)]
        path: Vec<String>,
        #[serde(default)]
        query: Vec<PostmanQuery>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanHeader {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanQuery {
    pub key: String,
    pub value: Option<String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanBody {
    pub mode: String,
    pub raw: Option<String>,
    pub formdata: Option<Vec<PostmanFormData>>,
    pub urlencoded: Option<Vec<PostmanUrlEncoded>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanFormData {
    pub key: String,
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub field_type: Option<String>,
    pub src: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanUrlEncoded {
    pub key: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanVariable {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanAuth {
    #[serde(rename = "type")]
    pub auth_type: String,
    pub bearer: Option<Vec<PostmanAuthValue>>,
    pub basic: Option<Vec<PostmanAuthValue>>,
    pub apikey: Option<Vec<PostmanAuthValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanAuthValue {
    pub key: String,
    pub value: String,
}

/// Postman Environment structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanEnvironment {
    pub name: String,
    pub values: Vec<PostmanEnvValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanEnvValue {
    pub key: String,
    pub value: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

pub struct PostmanImporter;

impl PostmanImporter {
    pub fn new() -> Self {
        Self
    }

    /// Preview a Postman collection file
    pub async fn preview(&self, file_path: &Path) -> AppResult<ImportPreview> {
        let content = fs::read_to_string(file_path)?;
        let collection: PostmanCollection = serde_json::from_str(&content)?;

        let (total_requests, total_folders, tree_preview) = self.count_items(&collection.item);

        Ok(ImportPreview {
            source_type: "Postman Collection v2.1".to_string(),
            total_requests,
            total_folders,
            environments: if collection.variable.is_empty() { 0 } else { 1 },
            tree_preview,
        })
    }

    /// Count requests and folders recursively
    fn count_items(&self, items: &[PostmanItem]) -> (usize, usize, Vec<ImportNode>) {
        let mut requests = 0;
        let mut folders = 0;
        let mut nodes = Vec::new();

        for item in items {
            match item {
                PostmanItem::Folder { name, item: children } => {
                    folders += 1;
                    let (child_requests, child_folders, child_nodes) = self.count_items(children);
                    requests += child_requests;
                    folders += child_folders;
                    nodes.push(ImportNode {
                        name: name.clone(),
                        node_type: "folder".to_string(),
                        children: child_nodes,
                    });
                }
                PostmanItem::Request { name, .. } => {
                    requests += 1;
                    nodes.push(ImportNode {
                        name: name.clone(),
                        node_type: "request".to_string(),
                        children: Vec::new(),
                    });
                }
            }
        }

        (requests, folders, nodes)
    }

    /// Import a Postman collection file
    pub async fn import_collection(&self, file_path: &Path) -> AppResult<(Vec<RequestFile>, Vec<Environment>)> {
        let content = fs::read_to_string(file_path)?;
        let collection: PostmanCollection = serde_json::from_str(&content)?;

        let requests = self.convert_items(&collection.item);

        // Convert collection variables to an environment
        let environments = if !collection.variable.is_empty() {
            let mut vars = HashMap::new();
            for var in &collection.variable {
                vars.insert(var.key.clone(), var.value.clone());
            }
            vec![Environment {
                id: uuid::Uuid::new_v4().to_string(),
                name: format!("{} Variables", collection.info.name),
                variables: vars,
            }]
        } else {
            Vec::new()
        };

        Ok((requests, environments))
    }

    /// Convert Postman items to RequestFile list
    fn convert_items(&self, items: &[PostmanItem]) -> Vec<RequestFile> {
        let mut requests = Vec::new();

        for item in items {
            match item {
                PostmanItem::Folder { item: children, .. } => {
                    requests.extend(self.convert_items(children));
                }
                PostmanItem::Request { name, request } => {
                    if let Some(req) = self.convert_request(name, request) {
                        requests.push(req);
                    }
                }
            }
        }

        requests
    }

    /// Convert a single Postman request to RequestFile (public wrapper)
    pub fn convert_request_public(&self, name: &str, request: &PostmanRequest) -> Option<RequestFile> {
        self.convert_request(name, request)
    }

    /// Convert a single Postman request to RequestFile
    fn convert_request(&self, name: &str, request: &PostmanRequest) -> Option<RequestFile> {
        let method = match request.method.to_uppercase().as_str() {
            "GET" => HttpMethod::Get,
            "POST" => HttpMethod::Post,
            "PUT" => HttpMethod::Put,
            "DELETE" => HttpMethod::Delete,
            "PATCH" => HttpMethod::Patch,
            "HEAD" => HttpMethod::Head,
            "OPTIONS" => HttpMethod::Options,
            _ => HttpMethod::Get,
        };

        let url = match &request.url {
            PostmanUrl::Simple(s) => s.clone(),
            PostmanUrl::Complex { raw, .. } => raw.clone(),
        };

        // Convert headers
        let mut headers = HashMap::new();
        for header in &request.header {
            if !header.disabled {
                headers.insert(header.key.clone(), header.value.clone());
            }
        }

        // Convert query params
        let query = match &request.url {
            PostmanUrl::Complex { query, .. } => {
                query.iter()
                    .filter(|q| !q.disabled)
                    .map(|q| KeyValueItem {
                        key: q.key.clone(),
                        value: q.value.clone().unwrap_or_default(),
                        description: String::new(),
                        enabled: true,
                        value_type: "text".to_string(),
                    })
                    .collect()
            }
            _ => Vec::new(),
        };

        // Convert body
        let body = if let Some(postman_body) = &request.body {
            match postman_body.mode.as_str() {
                "raw" => {
                    RequestBody::Json(postman_body.raw.clone().unwrap_or_default())
                }
                "formdata" => {
                    let form_items: Vec<KeyValueItem> = postman_body.formdata
                        .as_ref()
                        .map(|items| {
                            items.iter().map(|item| KeyValueItem {
                                key: item.key.clone(),
                                value: item.value.clone().unwrap_or_default(),
                                description: String::new(),
                                enabled: true,
                                value_type: "text".to_string(),
                            }).collect()
                        })
                        .unwrap_or_default();
                    RequestBody::Form(form_items)
                }
                "urlencoded" => {
                    let form_items: Vec<KeyValueItem> = postman_body.urlencoded
                        .as_ref()
                        .map(|items| {
                            items.iter().map(|item| KeyValueItem {
                                key: item.key.clone(),
                                value: item.value.clone().unwrap_or_default(),
                                description: String::new(),
                                enabled: true,
                                value_type: "text".to_string(),
                            }).collect()
                        })
                        .unwrap_or_default();
                    RequestBody::Form(form_items)
                }
                _ => RequestBody::None,
            }
        } else {
            RequestBody::None
        };

        // Convert auth
        let auth = if let Some(postman_auth) = &request.auth {
            match postman_auth.auth_type.as_str() {
                "bearer" => {
                    let token = postman_auth.bearer
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "token"))
                        .map(|i| i.value.clone())
                        .unwrap_or_default();
                    AuthConfig::Bearer { token }
                }
                "basic" => {
                    let username = postman_auth.basic
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "username"))
                        .map(|i| i.value.clone())
                        .unwrap_or_default();
                    let password = postman_auth.basic
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "password"))
                        .map(|i| i.value.clone())
                        .unwrap_or_default();
                    AuthConfig::Basic { username, password }
                }
                "apikey" => {
                    let key = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "key"))
                        .map(|i| i.value.clone())
                        .unwrap_or_default();
                    let value = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "value"))
                        .map(|i| i.value.clone())
                        .unwrap_or_default();
                    let add_to = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "in"))
                        .map(|i| {
                            if i.value == "header" {
                                ApiKeyLocation::Header
                            } else {
                                ApiKeyLocation::Query
                            }
                        })
                        .unwrap_or(ApiKeyLocation::Header);
                    AuthConfig::ApiKey { key, value, add_to }
                }
                _ => AuthConfig::None,
            }
        } else {
            AuthConfig::None
        };

        let now = chrono::Utc::now().to_rfc3339();

        Some(RequestFile {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            method,
            url,
            headers,
            query,
            body,
            auth,
            assertions: Vec::new(),
            meta: RequestMeta {
                created_at: now.clone(),
                updated_at: now,
            },
        })
    }

    /// Import a Postman environment file
    pub async fn import_environment(&self, file_path: &Path) -> AppResult<Environment> {
        let content = fs::read_to_string(file_path)?;
        let postman_env: PostmanEnvironment = serde_json::from_str(&content)?;

        let mut variables = HashMap::new();
        for value in &postman_env.values {
            if value.enabled {
                variables.insert(value.key.clone(), value.value.clone());
            }
        }

        Ok(Environment {
            id: uuid::Uuid::new_v4().to_string(),
            name: postman_env.name,
            variables,
        })
    }

    /// Get folder structure from Postman items
    pub fn get_folder_structure(&self, items: &[PostmanItem]) -> Vec<(String, Vec<RequestFile>)> {
        let mut result = Vec::new();
        self.collect_folders(items, "", &mut result);
        result
    }

    fn collect_folders(&self, items: &[PostmanItem], parent_path: &str, result: &mut Vec<(String, Vec<RequestFile>)>) {
        let mut current_folder_requests = Vec::new();

        for item in items {
            match item {
                PostmanItem::Folder { name, item: children } => {
                    let folder_path = if parent_path.is_empty() {
                        name.clone()
                    } else {
                        format!("{}/{}", parent_path, name)
                    };
                    self.collect_folders(children, &folder_path, result);
                }
                PostmanItem::Request { name, request } => {
                    if let Some(req) = self.convert_request(name, request) {
                        current_folder_requests.push(req);
                    }
                }
            }
        }

        if !current_folder_requests.is_empty() {
            let folder_name = if parent_path.is_empty() {
                "root".to_string()
            } else {
                parent_path.to_string()
            };
            result.push((folder_name, current_folder_requests));
        }
    }
}

impl Default for PostmanImporter {
    fn default() -> Self {
        Self::new()
    }
}
