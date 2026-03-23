use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::auth::AuthConfig;
use super::assertion::Assertion;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestFile {
    pub id: String,
    pub name: String,
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub query: Vec<KeyValueItem>,
    #[serde(default)]
    pub body: RequestBody,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub assertions: Vec<Assertion>,
    #[serde(default)]
    pub meta: RequestMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
}

impl Default for HttpMethod {
    fn default() -> Self {
        HttpMethod::Get
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum RequestBody {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "json")]
    Json(String),
    #[serde(rename = "form")]
    Form(Vec<KeyValueItem>),
    #[serde(rename = "raw")]
    Raw { content: String, content_type: String },
    #[serde(rename = "binary")]
    Binary(String), // file path
}

impl Default for RequestBody {
    fn default() -> Self {
        RequestBody::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValueItem {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Value type for form body items: "text" (default) or "file"
    #[serde(default = "default_text", skip_serializing_if = "is_text")]
    pub value_type: String,
}

fn default_true() -> bool {
    true
}

fn default_text() -> String {
    "text".to_string()
}

fn is_text(s: &String) -> bool {
    s == "text"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RequestMeta {
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}
