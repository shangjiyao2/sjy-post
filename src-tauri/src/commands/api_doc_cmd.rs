use crate::commands::java_cmd::{
    generate_json_value, generate_sample_value, JavaController, JavaEndpoint, JavaField, ParsedJavaProject,
};
use crate::storage::file_manager::FileManager;
use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

const API_DOCS_DIR: &str = ".api-docs";

/// API Document metadata (stored as JSON sidecar)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocMeta {
    pub id: String,
    pub title: String,
    pub endpoint_path: String,
    pub http_method: String,
    pub controller_name: String,
    #[serde(default)]
    pub controller_description: String,
    pub generated_at: String,
    pub java_project_path: String,
}

/// List item for sidebar display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocListItem {
    pub id: String,
    pub title: String,
    pub endpoint_path: String,
    pub http_method: String,
    pub controller_name: String,
    pub controller_description: String,
    pub file_name: String,
    pub generated_at: String,
}

/// Generation options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateApiDocsOptions {
    pub project_path: String,
    pub endpoint_ids: Vec<String>,
    pub parsed_data: ParsedJavaProject,
    pub java_project_path: String,
}

/// Generation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateApiDocsResult {
    pub generated_count: usize,
    pub file_paths: Vec<String>,
}

/// Generate API documentation for selected endpoints
#[tauri::command]
pub async fn generate_api_docs(options: GenerateApiDocsOptions) -> AppResult<GenerateApiDocsResult> {
    let project_dir = Path::new(&options.project_path);
    let docs_dir = project_dir.join(API_DOCS_DIR);

    tokio::fs::create_dir_all(&docs_dir).await?;

    let mut file_paths = Vec::new();
    let selected_set: std::collections::HashSet<&String> = options.endpoint_ids.iter().collect();

    for controller in &options.parsed_data.controllers {
        for endpoint in &controller.endpoints {
            if !selected_set.contains(&endpoint.id) {
                continue;
            }

            let markdown = generate_endpoint_markdown(endpoint, controller);
            let base_name =
                sanitize_doc_filename(&format!("{}_{}", endpoint.http_method, endpoint.full_path));
            let md_file_name = format!("{}.doc.md", base_name);
            let json_file_name = format!("{}.doc.json", base_name);

            let md_path = docs_dir.join(&md_file_name);
            tokio::fs::write(&md_path, &markdown).await?;

            let meta = ApiDocMeta {
                id: endpoint.id.clone(),
                title: get_endpoint_title(endpoint),
                endpoint_path: endpoint.full_path.clone(),
                http_method: endpoint.http_method.clone(),
                controller_name: controller.name.clone(),
                controller_description: controller.description.clone(),
                generated_at: chrono::Utc::now().to_rfc3339(),
                java_project_path: options.java_project_path.clone(),
            };
            let json_path = docs_dir.join(&json_file_name);
            let fm = FileManager::new();
            fm.write_json(&json_path, &meta).await?;

            file_paths.push(md_path.to_string_lossy().to_string());
        }
    }

    Ok(GenerateApiDocsResult {
        generated_count: file_paths.len(),
        file_paths,
    })
}

/// List all API docs in a project
#[tauri::command]
pub async fn list_api_docs(project_path: String) -> AppResult<Vec<ApiDocListItem>> {
    let docs_dir = Path::new(&project_path).join(API_DOCS_DIR);

    if !docs_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    let fm = FileManager::new();
    let mut entries = tokio::fs::read_dir(&docs_dir).await?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.ends_with(".doc.json") {
            match fm.read_json::<ApiDocMeta>(&path).await {
                Ok(meta) => {
                    let md_file_name = file_name.replace(".doc.json", ".doc.md");
                    items.push(ApiDocListItem {
                        id: meta.id,
                        title: meta.title,
                        endpoint_path: meta.endpoint_path,
                        http_method: meta.http_method,
                        controller_name: meta.controller_name,
                        controller_description: meta.controller_description,
                        file_name: md_file_name,
                        generated_at: meta.generated_at,
                    });
                }
                Err(_) => continue,
            }
        }
    }

    items.sort_by(|a, b| {
        a.controller_name
            .cmp(&b.controller_name)
            .then(a.endpoint_path.cmp(&b.endpoint_path))
    });

    Ok(items)
}

/// Read a single API doc content
#[tauri::command]
pub async fn read_api_doc(project_path: String, file_name: String) -> AppResult<String> {
    let file_path = Path::new(&project_path)
        .join(API_DOCS_DIR)
        .join(&file_name);

    if !file_path.exists() {
        return Err(AppError::FileNotFound(format!(
            "API doc not found: {}",
            file_name
        )));
    }

    let content = tokio::fs::read_to_string(&file_path).await?;
    Ok(content)
}

/// Delete an API doc
#[tauri::command]
pub async fn delete_api_doc(project_path: String, file_name: String) -> AppResult<()> {
    let docs_dir = Path::new(&project_path).join(API_DOCS_DIR);
    let md_path = docs_dir.join(&file_name);
    let json_name = file_name.replace(".doc.md", ".doc.json");
    let json_path = docs_dir.join(&json_name);

    let fm = FileManager::new();
    if fm.exists(&md_path).await {
        fm.delete(&md_path).await?;
    }
    if fm.exists(&json_path).await {
        fm.delete(&json_path).await?;
    }

    Ok(())
}

/// Batch delete API docs
#[tauri::command]
pub async fn batch_delete_api_docs(project_path: String, file_names: Vec<String>) -> AppResult<()> {
    let docs_dir = Path::new(&project_path).join(API_DOCS_DIR);
    let fm = FileManager::new();

    for file_name in &file_names {
        let md_path = docs_dir.join(file_name);
        let json_name = file_name.replace(".doc.md", ".doc.json");
        let json_path = docs_dir.join(&json_name);

        if fm.exists(&md_path).await {
            fm.delete(&md_path).await?;
        }
        if fm.exists(&json_path).await {
            fm.delete(&json_path).await?;
        }
    }

    Ok(())
}

// ==================== Markdown Generation ====================

fn get_endpoint_title(endpoint: &JavaEndpoint) -> String {
    if !endpoint.summary.is_empty() {
        endpoint.summary.clone()
    } else if !endpoint.method_name.is_empty() && endpoint.method_name != "unknown" {
        endpoint.method_name.clone()
    } else {
        format!("{} {}", endpoint.http_method, endpoint.full_path)
    }
}

fn generate_endpoint_markdown(endpoint: &JavaEndpoint, controller: &JavaController) -> String {
    let mut md = String::new();

    let title = get_endpoint_title(endpoint);
    md.push_str(&format!("## {}\n\n", title));

    // 1. 接口信息
    md.push_str("### 1. 接口信息\n\n");
    md.push_str(&format!("- **接口路径**: `{}`\n", endpoint.full_path));
    md.push_str(&format!("- **请求方式**: {}\n", endpoint.http_method));

    let content_type = if endpoint.request_body_type.is_some()
        || !endpoint.request_body_fields.is_empty()
    {
        "application/json"
    } else {
        "application/x-www-form-urlencoded"
    };
    md.push_str(&format!("- **Content-Type**: {}\n", content_type));

    if !endpoint.description.is_empty() {
        md.push_str(&format!("- **接口描述**: {}\n", endpoint.description));
    } else if !endpoint.summary.is_empty() {
        md.push_str(&format!("- **接口描述**: {}\n", endpoint.summary));
    }

    if !controller.description.is_empty() {
        md.push_str(&format!("- **所属模块**: {}\n", controller.description));
    }
    md.push('\n');

    // 2. 请求参数
    let has_params = !endpoint.request_params.is_empty();
    let has_body_fields = !endpoint.request_body_fields.is_empty();

    md.push_str("### 2. 请求参数\n\n");

    if has_params || has_body_fields {
        if has_body_fields {
            if has_params {
                md.push_str("**Body Parameters**\n\n");
            }
            md.push_str("| 序号 | 参数名 | 参数类型 | 参数说明 | 备注 |\n");
            md.push_str("|------|--------|----------|----------|------|\n");
            render_root_field_table(&mut md, &endpoint.request_body_fields, true, true);
            md.push('\n');
        }

        if has_params {
            if has_body_fields {
                md.push_str("**Query Parameters**\n\n");
            }
            md.push_str("| 序号 | 参数名 | 参数类型 | 参数说明 | 备注 |\n");
            md.push_str("|------|--------|----------|----------|------|\n");
            for (index, param) in endpoint.request_params.iter().enumerate() {
                let desc = build_param_description(&param.description, &param.default_value);
                md.push_str(&format!(
                    "| {} | {} | {} | {} | {} |\n",
                    index + 1,
                    param.name,
                    param.param_type,
                    desc,
                    if param.required { "必填" } else { "" }
                ));
            }
            md.push('\n');
        }
    } else {
        md.push_str("无\n\n");
    }

    // 3. 请求示例
    md.push_str("### 3. 请求示例\n\n");
    md.push_str(&generate_request_example(endpoint));
    md.push('\n');

    // 4. 响应参数
    md.push_str("### 4. 响应参数\n\n");

    if !endpoint.response_body_fields.is_empty() {
        let is_paged = endpoint
            .response_type
            .as_ref()
            .map(|t| t.contains("Page") || t.contains("List"))
            .unwrap_or(false);

        if is_paged {
            md.push_str("#### 列表项字段说明\n\n");
        }

        md.push_str("| 序号 | 数据项 | 数据项类型 | 数据项说明 | 备注 |\n");
        md.push_str("|------|--------|------------|------------|------|\n");
        render_root_field_table(&mut md, &endpoint.response_body_fields, false, false);
    }
    md.push('\n');

    // 5. 响应示例
    md.push_str("### 5. 响应示例\n\n");
    md.push_str(&generate_response_example(endpoint));
    md.push('\n');

    md
}

fn build_param_description(description: &str, default_value: &Option<String>) -> String {
    let mut desc = description.to_string();
    if let Some(ref dv) = default_value {
        if !dv.is_empty() {
            if !desc.is_empty() {
                desc.push_str("，");
            }
            desc.push_str(&format!("默认值：{}", dv));
        }
    }
    desc
}

fn render_root_field_table(
    md: &mut String,
    fields: &Vec<JavaField>,
    include_required: bool,
    is_request: bool,
) {
    for (index, field) in fields.iter().enumerate() {
        let display_name = field.name.clone();
        let type_label = field.field_type.clone();
        let description = if field.description.is_empty() {
            String::new()
        } else {
            field.description.clone()
        };
        if include_required {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                index + 1,
                display_name,
                type_label,
                description,
                if field.required { "必填" } else { "" }
            ));
        } else {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                index + 1,
                display_name,
                type_label,
                description,
                ""
            ));
        }
    }

    for field in fields {
        if !field.children.is_empty() {
            render_child_field_sections(md, field, include_required, is_request);
        }
    }
}

fn render_child_field_sections(
    md: &mut String,
    field: &JavaField,
    include_required: bool,
    is_request: bool,
) {
    let display_name = field.name.clone();
    md.push('\n');
    md.push_str(&format!("{}:\n\n", display_name));
    if is_request {
        md.push_str("| 序号 | 参数名 | 参数类型 | 参数说明 | 备注 |\n");
        md.push_str("|------|--------|----------|----------|------|\n");
    } else {
        md.push_str("| 序号 | 数据项 | 数据项类型 | 数据项说明 | 备注 |\n");
        md.push_str("|------|--------|------------|------------|------|\n");
    }
    for (index, child) in field.children.iter().enumerate() {
        let child_name = child.name.clone();
        let type_label = child.field_type.clone();
        let description = if child.description.is_empty() {
            String::new()
        } else {
            child.description.clone()
        };
        if include_required {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                index + 1,
                child_name,
                type_label,
                description,
                if child.required { "必填" } else { "" }
            ));
        } else {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                index + 1,
                child_name,
                type_label,
                description,
                ""
            ));
        }
    }

    for child in &field.children {
        if !child.children.is_empty() {
            render_child_field_sections(md, child, include_required, is_request);
        }
    }
}

fn generate_request_example(endpoint: &JavaEndpoint) -> String {
    let mut md = String::new();

    let has_body = !endpoint.request_body_fields.is_empty();
    let has_params = !endpoint.request_params.is_empty();

    if !has_body && !has_params {
        md.push_str("无请求参数\n");
        return md;
    }

    // Show URL with query string when there are @RequestParam parameters
    if has_params {
        if has_body {
            md.push_str("**URL**\n\n");
        }
        let params: Vec<String> = endpoint
            .request_params
            .iter()
            .map(|p| {
                format!(
                    "{}={}",
                    p.name,
                    generate_sample_value(&p.param_type, &p.name)
                )
            })
            .collect();
        md.push_str("```\n");
        md.push_str(&format!(
            "{} {}?{}\n",
            endpoint.http_method,
            endpoint.full_path,
            params.join("&")
        ));
        md.push_str("```\n\n");
    }

    // Show JSON body when there are @RequestBody fields
    if has_body {
        if has_params {
            md.push_str("**Request Body**\n\n");
        }
        md.push_str("```json\n");
        let mut obj = serde_json::Map::new();
        for field in &endpoint.request_body_fields {
            insert_field_value(&mut obj, field, None);
        }
        md.push_str(
            &serde_json::to_string_pretty(&serde_json::Value::Object(obj)).unwrap_or_default(),
        );
        md.push_str("\n```\n");
    }

    md
}

fn insert_field_value(
    target: &mut serde_json::Map<String, serde_json::Value>,
    field: &JavaField,
    prefix: Option<String>,
) {
    let base_name = field.name.clone();
    let name = if let Some(p) = prefix { format!("{}{}", p, base_name) } else { base_name };

    if field.children.is_empty() {
        target.insert(
            name,
            generate_json_value(&field.field_type, &field.name),
        );
        return;
    }

    let is_list = field.field_type.contains("List<")
        || field.field_type.contains("Set<")
        || field.field_type.contains("Collection<");

    if is_list {
        let mut item = serde_json::Map::new();
        for child in &field.children {
            insert_field_value(&mut item, child, None);
        }
        target.insert(name, serde_json::json!([serde_json::Value::Object(item)]));
    } else {
        let mut obj = serde_json::Map::new();
        for child in &field.children {
            insert_field_value(&mut obj, child, None);
        }
        target.insert(name, serde_json::Value::Object(obj));
    }
}

fn generate_response_example(endpoint: &JavaEndpoint) -> String {
    let mut md = String::new();
    md.push_str("```json\n");

    let mut response = serde_json::Map::new();
    response.insert("code".to_string(), serde_json::json!(200));
    response.insert("msg".to_string(), serde_json::json!("success"));

    if endpoint.response_body_fields.is_empty() {
        // Check if response type contains a simple type (Boolean, String, Long, etc.)
        let simple_value = endpoint.response_type.as_ref().and_then(|rt| {
            extract_simple_response_value(rt)
        });
        response.insert("data".to_string(), simple_value.unwrap_or(serde_json::json!(null)));
    } else {
        let mut data_obj = serde_json::Map::new();
        for field in &endpoint.response_body_fields {
            insert_field_value(&mut data_obj, field, None);
        }

        // Check if return type contains Page/List → wrap in pagination
        let is_paged = endpoint
            .response_type
            .as_ref()
            .map(|t| t.contains("Page") || t.contains("List"))
            .unwrap_or(false);

        if is_paged {
            let mut page_obj = serde_json::Map::new();
            page_obj.insert("total".to_string(), serde_json::json!(0));
            page_obj.insert(
                "list".to_string(),
                serde_json::json!([serde_json::Value::Object(data_obj)]),
            );
            page_obj.insert("pageNum".to_string(), serde_json::json!(1));
            page_obj.insert("pageSize".to_string(), serde_json::json!(10));
            page_obj.insert("pages".to_string(), serde_json::json!(1));
            response.insert("data".to_string(), serde_json::Value::Object(page_obj));
        } else {
            response.insert("data".to_string(), serde_json::Value::Object(data_obj));
        }
    }

    md.push_str(
        &serde_json::to_string_pretty(&serde_json::Value::Object(response)).unwrap_or_default(),
    );
    md.push_str("\n```\n");

    md
}

/// Extract a simple JSON value from a wrapped response type like CommRes<Boolean>
fn extract_simple_response_value(response_type: &str) -> Option<serde_json::Value> {
    let wrapper_types = [
        "Result", "R", "ResponseEntity", "Response", "ApiResult",
        "CommonResult", "BaseResult", "JsonResult", "AjaxResult",
        "CommRes", "CommResult",
    ];

    let mut current = response_type.trim().to_string();

    // Strip outer wrapper types to find the inner type
    loop {
        let outer = current.split('<').next().unwrap_or(&current).trim().to_string();
        if wrapper_types.iter().any(|&w| w == outer) {
            if let Some(start) = current.find('<') {
                if let Some(end) = current.rfind('>') {
                    current = current[start + 1..end].trim().to_string();
                    continue;
                }
            }
            return None;
        }
        break;
    }

    let clean = current.split('<').next().unwrap_or(&current).trim().to_string();
    match clean.as_str() {
        "Boolean" | "boolean" => Some(serde_json::json!(true)),
        "String" => Some(serde_json::json!("")),
        "Integer" | "int" => Some(serde_json::json!(0)),
        "Long" | "long" => Some(serde_json::json!(0)),
        "Double" | "double" | "Float" | "float" | "BigDecimal" => Some(serde_json::json!(0.0)),
        _ => None,
    }
}

fn sanitize_doc_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | ' ' => '_',
            _ => c,
        })
        .collect()
}
