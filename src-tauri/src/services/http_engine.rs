use crate::models::auth::{ApiKeyLocation, AuthConfig};
use crate::models::request::{HttpMethod, RequestBody, RequestFile};
use crate::models::response::{HttpResponse, ResponseBodyType};
use crate::utils::error::AppResult;
use crate::utils::variable;
use reqwest::{Client, Method, header};
use std::collections::HashMap;
use std::time::Instant;

pub struct HttpEngine {
    client: Client,
}

impl HttpEngine {
    pub fn new() -> Self {
        let client = Client::builder()
            .danger_accept_invalid_certs(false)
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub fn new_insecure() -> Self {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub async fn send(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<HttpResponse> {
        let start = Instant::now();

        // Resolve URL with variables
        let url = variable::resolve(&request.url, variables);

        // Build query string
        let mut url_with_query = url.clone();
        let enabled_query: Vec<_> = request.query.iter()
            .filter(|q| q.enabled)
            .collect();

        if !enabled_query.is_empty() {
            let query_string: String = enabled_query.iter()
                .map(|q| {
                    let key = variable::resolve(&q.key, variables);
                    let value = variable::resolve(&q.value, variables);
                    format!("{}={}", urlencoding::encode(&key), urlencoding::encode(&value))
                })
                .collect::<Vec<_>>()
                .join("&");

            if url_with_query.contains('?') {
                url_with_query = format!("{}&{}", url_with_query, query_string);
            } else {
                url_with_query = format!("{}?{}", url_with_query, query_string);
            }
        }

        // Convert method
        let method = match request.method {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Put => Method::PUT,
            HttpMethod::Delete => Method::DELETE,
            HttpMethod::Patch => Method::PATCH,
            HttpMethod::Head => Method::HEAD,
            HttpMethod::Options => Method::OPTIONS,
        };

        // Build request
        let mut req_builder = self.client.request(method, &url_with_query);

        // Add headers
        for (key, value) in &request.headers {
            let resolved_key = variable::resolve(key, variables);
            let resolved_value = variable::resolve(value, variables);
            req_builder = req_builder.header(&resolved_key, &resolved_value);
        }

        // Apply authentication
        req_builder = self.apply_auth(req_builder, &request.auth, variables);

        // Add body
        req_builder = match &request.body {
            RequestBody::None => req_builder,
            RequestBody::Json(json) => {
                let resolved_json = variable::resolve(json, variables);
                req_builder
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(resolved_json)
            }
            RequestBody::Form(items) => {
                let has_file = items.iter().any(|item| item.enabled && item.value_type == "file");
                if has_file {
                    // Use multipart form for file uploads
                    let mut form = reqwest::multipart::Form::new();
                    for item in items.iter().filter(|item| item.enabled) {
                        let key = variable::resolve(&item.key, variables);
                        let value = variable::resolve(&item.value, variables);
                        if item.value_type == "file" && !value.is_empty() {
                            let file_bytes = tokio::fs::read(&value).await?;
                            let file_name = std::path::Path::new(&value)
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("file")
                                .to_string();
                            let part = reqwest::multipart::Part::bytes(file_bytes)
                                .file_name(file_name);
                            form = form.part(key, part);
                        } else {
                            form = form.text(key, value);
                        }
                    }
                    req_builder.multipart(form)
                } else {
                    // Use url-encoded form for text-only
                    let form_data: Vec<(String, String)> = items.iter()
                        .filter(|item| item.enabled)
                        .map(|item| {
                            let key = variable::resolve(&item.key, variables);
                            let value = variable::resolve(&item.value, variables);
                            (key, value)
                        })
                        .collect();
                    req_builder.form(&form_data)
                }
            }
            RequestBody::Raw { content, content_type } => {
                let resolved_content = variable::resolve(content, variables);
                let resolved_type = variable::resolve(content_type, variables);
                req_builder
                    .header(header::CONTENT_TYPE, resolved_type)
                    .body(resolved_content)
            }
            RequestBody::Binary(file_path) => {
                let resolved_path = variable::resolve(file_path, variables);
                let file_content = tokio::fs::read(&resolved_path).await?;
                req_builder
                    .header(header::CONTENT_TYPE, "application/octet-stream")
                    .body(file_content)
            }
        };

        // Send request
        let response = req_builder.send().await?;

        // Extract response info
        let status = response.status().as_u16();
        let status_text = response.status().canonical_reason().unwrap_or("Unknown").to_string();

        let mut resp_headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(v) = value.to_str() {
                resp_headers.insert(key.to_string(), v.to_string());
            }
        }

        // Determine body type from content-type header
        let content_type = resp_headers.get("content-type")
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        let body_type = if content_type.contains("application/json") {
            ResponseBodyType::Json
        } else if content_type.contains("text/html") {
            ResponseBodyType::Html
        } else if content_type.contains("application/xml") || content_type.contains("text/xml") {
            ResponseBodyType::Xml
        } else if content_type.contains("text/") {
            ResponseBodyType::Text
        } else {
            ResponseBodyType::Binary
        };

        // Read body
        let body_bytes = response.bytes().await?;
        let size_bytes = body_bytes.len() as u64;

        let body = if matches!(body_type, ResponseBodyType::Binary) {
            // For binary, encode as base64
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(&body_bytes)
        } else {
            String::from_utf8_lossy(&body_bytes).to_string()
        };

        let time_ms = start.elapsed().as_millis() as u64;

        Ok(HttpResponse {
            status,
            status_text,
            headers: resp_headers,
            body,
            body_type,
            time_ms,
            size_bytes,
        })
    }

    fn apply_auth(&self, mut builder: reqwest::RequestBuilder, auth: &AuthConfig, variables: &HashMap<String, String>) -> reqwest::RequestBuilder {
        match auth {
            AuthConfig::None => builder,
            AuthConfig::Bearer { token } => {
                let resolved_token = variable::resolve(token, variables);
                builder.header(header::AUTHORIZATION, format!("Bearer {}", resolved_token))
            }
            AuthConfig::Basic { username, password } => {
                let resolved_user = variable::resolve(username, variables);
                let resolved_pass = variable::resolve(password, variables);
                builder.basic_auth(resolved_user, Some(resolved_pass))
            }
            AuthConfig::ApiKey { key, value, add_to } => {
                let resolved_key = variable::resolve(key, variables);
                let resolved_value = variable::resolve(value, variables);
                match add_to {
                    ApiKeyLocation::Header => {
                        builder.header(&resolved_key, &resolved_value)
                    }
                    ApiKeyLocation::Query => {
                        // Query params are handled in URL building
                        // For now, add as header
                        builder.header(&resolved_key, &resolved_value)
                    }
                }
            }
            AuthConfig::OAuth2(_) => {
                // OAuth2 requires a separate token fetch flow
                // For now, skip
                builder
            }
        }
    }
}

impl Default for HttpEngine {
    fn default() -> Self {
        Self::new()
    }
}
