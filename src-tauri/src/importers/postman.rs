use crate::commands::import_cmd::{ImportNode, ImportPreview};
use crate::models::auth::{ApiKeyLocation, AuthConfig};
use crate::models::environment::Environment;
use crate::models::request::{HttpMethod, KeyValueItem, RequestBody, RequestFile, RequestMeta};
use crate::utils::error::AppResult;
use serde::de::Deserializer;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Postman Collection v2.1 structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanCollection {
    pub info: PostmanInfo,
    #[serde(default, deserialize_with = "deserialize_postman_items")]
    pub item: Vec<PostmanItem>,
    #[serde(default)]
    pub variable: Vec<PostmanVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanInfo {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "_postman_id", default)]
    pub postman_id: Option<String>,
    #[serde(default)]
    pub schema: String,
    #[serde(default)]
    pub description: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PostmanItem {
    #[serde(default)]
    pub name: String,
    #[serde(default, deserialize_with = "deserialize_postman_items")]
    pub item: Vec<PostmanItem>,
    #[serde(default)]
    pub request: Option<PostmanRequest>,
    #[serde(default)]
    pub response: Option<Value>,
    #[serde(default)]
    pub event: Option<Value>,
    #[serde(default)]
    pub description: Option<Value>,
    #[serde(rename = "protocolProfileBehavior", default)]
    pub protocol_profile_behavior: Option<Value>,
}

impl PostmanItem {
    fn children(&self) -> Option<&[PostmanItem]> {
        if self.item.is_empty() {
            None
        } else {
            Some(self.item.as_slice())
        }
    }

    fn request_ref(&self) -> Option<&PostmanRequest> {
        self.request.as_ref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PostmanRequest {
    Detailed(PostmanRequestDetail),
    Simple(String),
}

impl PostmanRequest {
    fn method(&self) -> &str {
        match self {
            PostmanRequest::Detailed(request) => request.method.as_str(),
            PostmanRequest::Simple(_) => "GET",
        }
    }

    fn url_string(&self) -> String {
        match self {
            PostmanRequest::Detailed(request) => request
                .url
                .as_ref()
                .map(PostmanUrl::raw_url)
                .unwrap_or_default(),
            PostmanRequest::Simple(url) => url.clone(),
        }
    }

    fn headers(&self) -> &[PostmanHeader] {
        match self {
            PostmanRequest::Detailed(request) => request.header.as_slice(),
            PostmanRequest::Simple(_) => &[],
        }
    }

    fn query(&self) -> &[PostmanQuery] {
        match self {
            PostmanRequest::Detailed(request) => request
                .url
                .as_ref()
                .map(PostmanUrl::query_items)
                .unwrap_or(&[]),
            PostmanRequest::Simple(_) => &[],
        }
    }

    fn body(&self) -> Option<&PostmanBody> {
        match self {
            PostmanRequest::Detailed(request) => request.body.as_ref(),
            PostmanRequest::Simple(_) => None,
        }
    }

    fn auth(&self) -> Option<&PostmanAuth> {
        match self {
            PostmanRequest::Detailed(request) => request.auth.as_ref(),
            PostmanRequest::Simple(_) => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PostmanRequestDetail {
    #[serde(default = "default_get_method")]
    pub method: String,
    #[serde(default)]
    pub url: Option<PostmanUrl>,
    #[serde(default, deserialize_with = "deserialize_postman_headers")]
    pub header: Vec<PostmanHeader>,
    #[serde(default)]
    pub body: Option<PostmanBody>,
    #[serde(default)]
    pub auth: Option<PostmanAuth>,
    #[serde(default)]
    pub description: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PostmanUrl {
    Simple(String),
    Complex {
        #[serde(default)]
        raw: Option<String>,
        #[serde(default, deserialize_with = "deserialize_string_list")]
        host: Vec<String>,
        #[serde(default, deserialize_with = "deserialize_string_list")]
        path: Vec<String>,
        #[serde(default)]
        query: Vec<PostmanQuery>,
    },
}

impl PostmanUrl {
    fn raw_url(&self) -> String {
        match self {
            PostmanUrl::Simple(url) => url.clone(),
            PostmanUrl::Complex { raw, host, path, query } => raw
                .as_ref()
                .filter(|value| !value.is_empty())
                .cloned()
                .unwrap_or_else(|| build_url_from_parts(host, path, query)),
        }
    }

    fn query_items(&self) -> &[PostmanQuery] {
        match self {
            PostmanUrl::Complex { query, .. } => query.as_slice(),
            PostmanUrl::Simple(_) => &[],
        }
    }
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
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PostmanBody {
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub raw: Option<Value>,
    #[serde(default)]
    pub formdata: Option<Vec<PostmanFormData>>,
    #[serde(default)]
    pub urlencoded: Option<Vec<PostmanUrlEncoded>>,
    #[serde(default)]
    pub options: Option<Value>,
    #[serde(default)]
    pub graphql: Option<Value>,
    #[serde(default)]
    pub file: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanFormData {
    pub key: String,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(rename = "type")]
    #[serde(default)]
    pub field_type: Option<String>,
    #[serde(default)]
    pub src: Option<Value>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanUrlEncoded {
    pub key: String,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanVariable {
    pub key: String,
    #[serde(default)]
    pub value: Value,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PostmanAuth {
    #[serde(rename = "type")]
    #[serde(default)]
    pub auth_type: String,
    #[serde(default)]
    pub bearer: Option<Vec<PostmanAuthValue>>,
    #[serde(default)]
    pub basic: Option<Vec<PostmanAuthValue>>,
    #[serde(default)]
    pub apikey: Option<Vec<PostmanAuthValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanAuthValue {
    pub key: String,
    #[serde(default)]
    pub value: Value,
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
    #[serde(default)]
    pub value: Value,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_get_method() -> String {
    "GET".to_string()
}

fn default_enabled() -> bool {
    true
}

fn deserialize_postman_items<'de, D>(deserializer: D) -> Result<Vec<PostmanItem>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(match value {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| serde_json::from_value(item).ok())
            .collect(),
        _ => Vec::new(),
    })
}

fn deserialize_postman_headers<'de, D>(deserializer: D) -> Result<Vec<PostmanHeader>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(match value {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| serde_json::from_value(item).ok())
            .collect(),
        Some(Value::String(raw)) => parse_header_lines(&raw),
        Some(_) => Vec::new(),
    })
}

fn deserialize_string_list<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(match value {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::String(text)) => {
            if text.is_empty() {
                Vec::new()
            } else {
                vec![text]
            }
        }
        Some(Value::Array(items)) => items
            .iter()
            .map(json_value_to_string)
            .filter(|item| !item.is_empty())
            .collect(),
        Some(other) => {
            let text = json_value_to_string(&other);
            if text.is_empty() {
                Vec::new()
            } else {
                vec![text]
            }
        }
    })
}

fn parse_header_lines(raw: &str) -> Vec<PostmanHeader> {
    raw.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }

            let (key, value) = trimmed.split_once(':')?;
            Some(PostmanHeader {
                key: key.trim().to_string(),
                value: value.trim().to_string(),
                disabled: false,
            })
        })
        .collect()
}

fn json_value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn build_url_from_parts(host: &[String], path: &[String], query: &[PostmanQuery]) -> String {
    let mut url = host.join(".");

    if !path.is_empty() {
        if !url.is_empty() {
            url.push('/');
        }
        url.push_str(&path.join("/"));
    }

    let query_string = query
        .iter()
        .filter(|item| !item.disabled)
        .map(|item| {
            let value = item
                .value
                .as_ref()
                .map(json_value_to_string)
                .unwrap_or_default();
            if value.is_empty() {
                item.key.clone()
            } else {
                format!("{}={}", item.key, value)
            }
        })
        .collect::<Vec<_>>()
        .join("&");

    if !query_string.is_empty() {
        if !url.is_empty() {
            url.push('?');
            url.push_str(&query_string);
        } else {
            url = format!("?{query_string}");
        }
    }

    url
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
            if let Some(children) = item.children() {
                folders += 1;
                let (child_requests, child_folders, child_nodes) = self.count_items(children);
                requests += child_requests;
                folders += child_folders;
                nodes.push(ImportNode {
                    name: item.name.clone(),
                    node_type: "folder".to_string(),
                    children: child_nodes,
                });
            } else if item.request_ref().is_some() {
                requests += 1;
                nodes.push(ImportNode {
                    name: item.name.clone(),
                    node_type: "request".to_string(),
                    children: Vec::new(),
                });
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
                if !var.disabled {
                    vars.insert(var.key.clone(), json_value_to_string(&var.value));
                }
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
            if let Some(children) = item.children() {
                requests.extend(self.convert_items(children));
            } else if let Some(request) = item.request_ref() {
                if let Some(req) = self.convert_request(&item.name, request) {
                    requests.push(req);
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
        let method = match request.method().to_uppercase().as_str() {
            "GET" => HttpMethod::Get,
            "POST" => HttpMethod::Post,
            "PUT" => HttpMethod::Put,
            "DELETE" => HttpMethod::Delete,
            "PATCH" => HttpMethod::Patch,
            "HEAD" => HttpMethod::Head,
            "OPTIONS" => HttpMethod::Options,
            _ => HttpMethod::Get,
        };

        let url = request.url_string();

        // Convert headers
        let mut headers = HashMap::new();
        for header in request.headers() {
            if !header.disabled {
                headers.insert(header.key.clone(), header.value.clone());
            }
        }

        // Convert query params
        let query = request
            .query()
            .iter()
            .filter(|q| !q.disabled)
            .map(|q| KeyValueItem {
                key: q.key.clone(),
                value: q
                    .value
                    .as_ref()
                    .map(json_value_to_string)
                    .unwrap_or_default(),
                description: String::new(),
                enabled: true,
                value_type: "text".to_string(),
            })
            .collect();

        // Convert body
        let body = if let Some(postman_body) = request.body() {
            match postman_body.mode.as_str() {
                "raw" => {
                    RequestBody::Json(
                        postman_body
                            .raw
                            .as_ref()
                            .map(json_value_to_string)
                            .unwrap_or_default(),
                    )
                }
                "formdata" => {
                    let form_items: Vec<KeyValueItem> = postman_body.formdata
                        .as_ref()
                        .map(|items| {
                            items.iter().map(|item| {
                                let is_file = matches!(item.field_type.as_deref(), Some("file"));
                                let value = if is_file {
                                    item.src
                                        .as_ref()
                                        .map(json_value_to_string)
                                        .filter(|value| !value.is_empty())
                                        .or_else(|| item.value.as_ref().map(json_value_to_string))
                                        .unwrap_or_default()
                                } else {
                                    item.value
                                        .as_ref()
                                        .map(json_value_to_string)
                                        .unwrap_or_default()
                                };

                                KeyValueItem {
                                    key: item.key.clone(),
                                    value,
                                    description: String::new(),
                                    enabled: !item.disabled,
                                    value_type: if is_file { "file".to_string() } else { "text".to_string() },
                                }
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
                                value: item
                                    .value
                                    .as_ref()
                                    .map(json_value_to_string)
                                    .unwrap_or_default(),
                                description: String::new(),
                                enabled: !item.disabled,
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
        let auth = if let Some(postman_auth) = request.auth() {
            match postman_auth.auth_type.as_str() {
                "bearer" => {
                    let token = postman_auth.bearer
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "token"))
                        .map(|i| json_value_to_string(&i.value))
                        .unwrap_or_default();
                    AuthConfig::Bearer { token }
                }
                "basic" => {
                    let username = postman_auth.basic
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "username"))
                        .map(|i| json_value_to_string(&i.value))
                        .unwrap_or_default();
                    let password = postman_auth.basic
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "password"))
                        .map(|i| json_value_to_string(&i.value))
                        .unwrap_or_default();
                    AuthConfig::Basic { username, password }
                }
                "apikey" => {
                    let key = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "key"))
                        .map(|i| json_value_to_string(&i.value))
                        .unwrap_or_default();
                    let value = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "value"))
                        .map(|i| json_value_to_string(&i.value))
                        .unwrap_or_default();
                    let add_to = postman_auth.apikey
                        .as_ref()
                        .and_then(|items| items.iter().find(|i| i.key == "in"))
                        .map(|i| {
                            if json_value_to_string(&i.value) == "header" {
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
                variables.insert(value.key.clone(), json_value_to_string(&value.value));
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
            if let Some(children) = item.children() {
                let folder_path = if parent_path.is_empty() {
                    item.name.clone()
                } else {
                    format!("{}/{}", parent_path, item.name)
                };
                self.collect_folders(children, &folder_path, result);
            } else if let Some(request) = item.request_ref() {
                if let Some(req) = self.convert_request(&item.name, request) {
                    current_folder_requests.push(req);
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn supports_simple_request_and_non_string_variables() {
        let collection: PostmanCollection = serde_json::from_value(json!({
            "info": {
                "name": "Demo",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Health",
                    "request": "https://example.com/health"
                }
            ],
            "variable": [
                {
                    "key": "port",
                    "value": 8080
                }
            ]
        }))
        .expect("应能解析简单字符串 request");

        let importer = PostmanImporter::new();
        let request = importer
            .convert_request_public(
                &collection.item[0].name,
                collection.item[0].request_ref().expect("请求应存在"),
            )
            .expect("请求应成功转换");

        assert!(matches!(request.method, HttpMethod::Get));
        assert_eq!(request.url, "https://example.com/health");
        assert_eq!(json_value_to_string(&collection.variable[0].value), "8080");
    }

    #[test]
    fn supports_string_headers_and_file_formdata() {
        let collection: PostmanCollection = serde_json::from_value(json!({
            "info": {
                "name": "Upload",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Upload File",
                    "request": {
                        "method": "POST",
                        "header": "Authorization: Bearer {{token}}",
                        "url": {
                            "host": ["https://example.com"],
                            "path": ["upload"]
                        },
                        "body": {
                            "mode": "formdata",
                            "formdata": [
                                {
                                    "key": "file",
                                    "type": "file",
                                    "src": ["C:/tmp/demo.txt"]
                                },
                                {
                                    "key": "meta",
                                    "value": {
                                        "source": "qa"
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        }))
        .expect("应能解析带字符串 header 的请求");

        let importer = PostmanImporter::new();
        let request = importer
            .convert_request_public(
                &collection.item[0].name,
                collection.item[0].request_ref().expect("请求应存在"),
            )
            .expect("请求应成功转换");

        assert_eq!(
            request.headers.get("Authorization").map(String::as_str),
            Some("Bearer {{token}}")
        );

        let RequestBody::Form(form_items) = request.body else {
            panic!("应转换为表单请求体");
        };

        assert_eq!(form_items[0].value_type, "file");
        assert_eq!(form_items[0].value, "[\"C:/tmp/demo.txt\"]");
        assert_eq!(form_items[1].value, "{\"source\":\"qa\"}");
    }
}
