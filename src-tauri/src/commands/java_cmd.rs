use crate::models::project::FolderMeta;
use crate::models::request::{HttpMethod, KeyValueItem, RequestBody, RequestFile, RequestMeta};
use crate::storage::java_project_store::{JavaProjectStore, JavaProjectsStorage, StoredJavaProject};
use crate::storage::project_store::ProjectStore;
use crate::utils::error::{AppError, AppResult};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use walkdir::WalkDir;

/// Parsed Java field information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub description: String,
    pub required: bool,
    #[serde(default)]
    pub children: Vec<JavaField>,
}

/// Request parameter from @RequestParam annotation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaRequestParam {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub description: String,
    pub required: bool,
    pub default_value: Option<String>,
}

/// Parsed Java endpoint information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaEndpoint {
    pub id: String,
    pub controller_name: String,
    pub method_name: String,
    pub http_method: String,
    pub path: String,
    pub full_path: String,
    pub summary: String,
    pub description: String,
    pub request_body_type: Option<String>,
    pub request_body_fields: Vec<JavaField>,
    pub request_params: Vec<JavaRequestParam>,
    pub response_type: Option<String>,
    #[serde(default)]
    pub response_body_fields: Vec<JavaField>,
}

/// Parsed Java controller information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaController {
    pub name: String,
    pub base_path: String,
    pub description: String,
    pub endpoints: Vec<JavaEndpoint>,
}

/// Parsed Java project information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedJavaProject {
    pub project_path: String,
    pub controllers: Vec<JavaController>,
}

/// Import options for Java endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaImportOptions {
    pub project_path: String,
    pub project_name: Option<String>,
    pub endpoints: Vec<String>,
    pub parsed_data: ParsedJavaProject,
    pub base_url: String,
    pub create_new_project: bool,
}

/// Import result for Java endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaImportResult {
    pub project_path: String,
    pub imported_files: Vec<String>,
}

/// Parse a Java project directory for Spring Controller annotations
#[tauri::command]
pub async fn parse_java_project(project_path: String) -> AppResult<ParsedJavaProject> {
    let path = Path::new(&project_path);

    if !path.exists() || !path.is_dir() {
        return Err(AppError::FileNotFound(
            "Project path does not exist or is not a directory".to_string(),
        ));
    }

    let mut controllers: Vec<JavaController> = Vec::new();

    // Walk through all Java files
    for entry in WalkDir::new(&project_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        // Only process .java files in controller directories
        if file_path.is_file()
            && file_path.extension().map_or(false, |ext| ext == "java")
            && is_controller_file(file_path)
        {
            if let Ok(content) = fs::read_to_string(file_path) {
                if let Some(controller) = parse_controller_file(&content, file_path, path) {
                    controllers.push(controller);
                }
            }
        }
    }

    Ok(ParsedJavaProject {
        project_path: project_path.clone(),
        controllers,
    })
}

/// Check if a file is likely a controller file
fn is_controller_file(path: &Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    path_str.contains("controller") || {
        // Check file content for @RestController or @Controller annotation
        if let Ok(content) = fs::read_to_string(path) {
            content.contains("@RestController") || content.contains("@Controller")
        } else {
            false
        }
    }
}

/// Parse a single controller file
fn parse_controller_file(content: &str, file_path: &Path, project_path: &Path) -> Option<JavaController> {
    // Check for @RestController or @Controller annotation
    if !content.contains("@RestController") && !content.contains("@Controller") {
        return None;
    }

    // Extract controller name from file name
    let controller_name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // Extract base path from @RequestMapping
    let base_path = extract_request_mapping(content).unwrap_or_default();

    // Extract description from @Tag or class comment
    let description = extract_controller_description(content);

    // Parse import statements to build a map of class names to file paths
    let import_map = build_import_map(content, project_path);

    // Parse all endpoints
    let endpoints = parse_endpoints(content, &controller_name, &base_path, &import_map, project_path);

    if endpoints.is_empty() {
        return None;
    }

    Some(JavaController {
        name: controller_name,
        base_path,
        description,
        endpoints,
    })
}

/// Extract @RequestMapping value from controller class level
fn extract_request_mapping(content: &str) -> Option<String> {
    // Match @RequestMapping with various formats
    let patterns = [
        r#"@RequestMapping\s*\(\s*"([^"]+)"\s*\)"#,
        r#"@RequestMapping\s*\(\s*value\s*=\s*"([^"]+)""#,
        r#"@RequestMapping\s*\(\s*path\s*=\s*"([^"]+)""#,
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(caps) = re.captures(content) {
                return caps.get(1).map(|m| m.as_str().to_string());
            }
        }
    }

    None
}

/// Extract controller description from @Tag annotation or JavaDoc
fn extract_controller_description(content: &str) -> String {
    // Try @Tag annotation (OpenAPI 3)
    if let Ok(re) = Regex::new(r#"@Tag\s*\([^)]*name\s*=\s*"([^"]+)""#) {
        if let Some(caps) = re.captures(content) {
            return caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }

    // Try @Api annotation (Swagger 2)
    if let Ok(re) = Regex::new(r#"@Api\s*\([^)]*(?:value|tags)\s*=\s*"([^"]+)""#) {
        if let Some(caps) = re.captures(content) {
            return caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }

    String::new()
}

/// Build a map from class names to potential file paths based on import statements
fn build_import_map(content: &str, project_path: &Path) -> HashMap<String, String> {
    let mut import_map: HashMap<String, String> = HashMap::new();

    // Extract import statements
    if let Ok(re) = Regex::new(r"import\s+([\w.]+);") {
        for caps in re.captures_iter(content) {
            if let Some(import_path) = caps.get(1) {
                let full_import = import_path.as_str();
                // Get class name (last part after the last dot)
                if let Some(class_name) = full_import.rsplit('.').next() {
                    // Convert package path to file path
                    let relative_path = full_import.replace('.', "/") + ".java";

                    // Try to find the file in src/main/java
                    // Normalize separators for cross-platform compatibility
                    for entry in WalkDir::new(project_path)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        let path = entry.path();
                        if path.is_file() && path.to_string_lossy().replace('\\', "/").ends_with(&relative_path) {
                            import_map.insert(class_name.to_string(), path.to_string_lossy().to_string());
                            break;
                        }
                    }
                }
            }
        }
    }

    import_map
}

/// Parse fields from a Java entity class file, with inheritance support.
/// Recursively resolves `extends ParentClass` to include parent fields.
fn parse_entity_class_fields_with_imports(
    class_path: &str,
    import_map: &HashMap<String, String>,
    project_path: &Path,
    depth: u8,
    visited: &mut std::collections::HashSet<String>,
) -> Vec<JavaField> {
    // Prevent infinite recursion
    if depth > 5 {
        return Vec::new();
    }

    let class_key = class_path.replace('\\', "/");
    if !visited.insert(class_key) {
        return Vec::new();
    }

    let content = match fs::read_to_string(class_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let local_imports = build_local_import_map(&content, class_path);

    // Parse own fields
    let mut fields = parse_fields_from_content(&content);

    // Populate children for object and collection types
    let original_fields = fields.clone();
    for field in &mut fields {
        let child_type = extract_nested_type(&field.field_type);
        if child_type.is_none() {
            continue;
        }
        let child_type = child_type.unwrap();
        if is_simple_java_type(&child_type) {
            continue;
        }

        if let Some(child_path) = resolve_class_path(&child_type, import_map, &local_imports, class_path, project_path) {
            let child_fields = parse_entity_class_fields_with_imports(
                &child_path,
                import_map,
                project_path,
                depth + 1,
                visited,
            );
            field.children = child_fields;
        }
    }

    let mut fields = merge_fields_preserve_children(fields, original_fields);

    // Check for parent class: `class Foo extends Bar`
    if let Ok(re) = Regex::new(r"class\s+\w+\s+extends\s+(\w+)") {
        if let Some(caps) = re.captures(&content) {
            let parent_class = caps.get(1).map(|m| m.as_str()).unwrap_or("");

            // Skip common base classes that don't have useful fields
            let skip_parents = ["Object", "Serializable", "BaseEntity"];
            if !parent_class.is_empty() && !skip_parents.contains(&parent_class) {
                // Try to find parent class path
                let parent_path = import_map.get(parent_class).cloned().or_else(|| {
                    // Try same directory as current class
                    let current_dir = Path::new(class_path).parent()?;
                    let candidate = current_dir.join(format!("{}.java", parent_class));
                    if candidate.exists() {
                        Some(candidate.to_string_lossy().to_string())
                    } else {
                        // Also build import map from the current class content
                        let local_imports = build_local_import_map(&content, class_path);
                        local_imports.get(parent_class).cloned()
                    }
                });

                if let Some(ref parent_file) = parent_path {
                    let parent_fields = parse_entity_class_fields_with_imports(
                        parent_file,
                        import_map,
                        project_path,
                        depth + 1,
                        visited,
                    );
                    // Merge: parent fields first, child fields override
                    let child_names: Vec<String> = fields.iter().map(|f| f.name.clone()).collect();
                    for pf in parent_fields {
                        if !child_names.contains(&pf.name) {
                            fields.push(pf);
                        }
                    }
                }
            }
        }
    }

    fields
}

/// Extract field declarations from class content
fn parse_fields_from_content(content: &str) -> Vec<JavaField> {
    let mut fields = Vec::new();

    // Match fields with @Schema annotation
    // Allow other annotations (e.g. @SensitiveField, @TableField, @TableId) between @Schema and field declaration
    let schema_pattern = r#"@Schema\s*\([^)]*description\s*=\s*"([^"]+)"[^)]*\)\s*(?:@\w+(?:\s*\([^)]*\))?\s*)*(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;"#;
    if let Ok(re) = Regex::new(schema_pattern) {
        for caps in re.captures_iter(content) {
            let description = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
            let field_type = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let name = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

            if name == "serialVersionUID" {
                continue;
            }

            fields.push(JavaField {
                name,
                field_type,
                description,
                required: false,
                children: Vec::new(),
            });
        }
    }

    // Match fields with @ApiModelProperty annotation (Swagger 2)
    // Allow other annotations (e.g. @TableField, @TableId) between @ApiModelProperty and field declaration
    if fields.is_empty() {
        let api_model_pattern = r#"@ApiModelProperty\s*\([^)]*?(?:value\s*=\s*)?"([^"]+)"[^)]*?\)\s*(?:@\w+(?:\s*\([^)]*\))?\s*)*(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;"#;
        if let Ok(re) = Regex::new(api_model_pattern) {
            for caps in re.captures_iter(content) {
                let description = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                let field_type = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
                let name = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

                if name == "serialVersionUID" {
                    continue;
                }

                fields.push(JavaField {
                    name,
                    field_type,
                    description,
                    required: false,
                    children: Vec::new(),
                });
            }
        }
    }

    // Fallback for annotation parsing issues: line-based scan to avoid regex over-capture
    if fields.iter().any(|f| is_suspicious_field_description(&f.description)) {
        let fallback_fields = parse_fields_line_by_line(content);
        if !fallback_fields.is_empty() {
            fields = fallback_fields;
        }
    }

    // If no fields found with annotations, try simple field declarations
    if fields.is_empty() {
        let field_pattern = r"(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;";
        if let Ok(re) = Regex::new(field_pattern) {
            for caps in re.captures_iter(content) {
                let field_type = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                let name = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();

                // Skip serialVersionUID and static fields
                if name == "serialVersionUID" || field_type == "static" {
                    continue;
                }

                fields.push(JavaField {
                    name,
                    field_type,
                    description: String::new(),
                    required: false,
                    children: Vec::new(),
                });
            }
        }
    }

    fields
}

fn merge_fields_preserve_children(fields: Vec<JavaField>, original: Vec<JavaField>) -> Vec<JavaField> {
    if original.is_empty() {
        return fields;
    }
    let mut map: HashMap<String, JavaField> = fields.into_iter().map(|f| (f.name.clone(), f)).collect();
    for orig in original {
        if let Some(existing) = map.get(&orig.name) {
            let mut updated = existing.clone();
            if updated.description.is_empty() && !orig.description.is_empty() {
                updated.description = orig.description.clone();
            }
            if updated.field_type.is_empty() && !orig.field_type.is_empty() {
                updated.field_type = orig.field_type.clone();
            }
            if updated.children.is_empty() && !orig.children.is_empty() {
                updated.children = orig.children.clone();
            }
            map.insert(orig.name.clone(), updated);
        } else {
            map.insert(orig.name.clone(), orig);
        }
    }
    map.into_values().collect()
}

fn extract_nested_type(type_name: &str) -> Option<String> {
    let trimmed = type_name.trim();
    if let Some(start) = trimmed.find('<') {
        if let Some(end) = trimmed.rfind('>') {
            let inner = trimmed[start + 1..end].trim();
            if inner.is_empty() {
                return None;
            }
            // handle Map<K, V> => V
            if let Some(idx) = inner.rfind(',') {
                return Some(inner[idx + 1..].trim().to_string());
            }
            return Some(inner.to_string());
        }
    }
    if trimmed.chars().next().map_or(false, |c| c.is_uppercase()) {
        return Some(trimmed.to_string());
    }
    None
}

fn is_simple_java_type(type_name: &str) -> bool {
    let clean = type_name.split('<').next().unwrap_or(type_name).trim();
    let base = clean.split('.').last().unwrap_or(clean);
    let simple_types = [
        "String", "int", "Integer", "long", "Long", "short", "Short", "byte", "Byte", "char",
        "Character", "boolean", "Boolean", "double", "Double", "float", "Float", "BigDecimal",
        "BigInteger", "Date", "LocalDate", "LocalDateTime", "LocalTime", "Timestamp", "Instant",
        "UUID",
    ];
    simple_types.contains(&base)
}

fn resolve_class_path(
    class_name: &str,
    import_map: &HashMap<String, String>,
    local_imports: &HashMap<String, String>,
    class_path: &str,
    project_path: &Path,
) -> Option<String> {
    if let Some(path) = import_map.get(class_name) {
        return Some(path.clone());
    }
    if let Some(path) = local_imports.get(class_name) {
        return Some(path.clone());
    }

    // Try same directory as current class
    let current_dir = Path::new(class_path).parent()?;
    let candidate = current_dir.join(format!("{}.java", class_name));
    if candidate.exists() {
        return Some(candidate.to_string_lossy().to_string());
    }

    // Fallback: search the project
    if let Some(found) = find_entity_class_path(class_name, project_path) {
        return Some(found);
    }

    None
}

fn find_entity_class_path(class_name: &str, project_path: &Path) -> Option<String> {
    let target_file = format!("{}.java", class_name);
    for entry in WalkDir::new(project_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .map_or(false, |f| f.to_string_lossy() == target_file)
        {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}

fn is_suspicious_field_description(description: &str) -> bool {
    let trimmed = description.trim();
    trimmed.contains('@')
        || trimmed.contains('\n')
        || trimmed.contains('\r')
        || trimmed.contains('|')
        || trimmed == ")"
        || trimmed.starts_with(')')
}

fn parse_fields_line_by_line(content: &str) -> Vec<JavaField> {
    let schema_desc_re = Regex::new(r#"@Schema\s*\([^\n]*description\s*=\s*"([^"]+)"[^\n]*\)"#).ok();
    let api_desc_re = Regex::new(r#"@ApiModelProperty\s*\([^\n]*?(?:value\s*=\s*)?"([^"]+)"[^\n]*\)"#).ok();
    let field_re = Regex::new(r#"(?:private|public|protected)\s+(\w+(?:<[^>]*(?:<[^>]*>)*[^>]*>)?)\s+(\w+)\s*;"#).ok();

    let mut fields = Vec::new();
    let mut pending_description: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        if let Some(re) = &schema_desc_re {
            if let Some(caps) = re.captures(trimmed) {
                pending_description = caps.get(1).map(|m| m.as_str().to_string());
                continue;
            }
        }

        if let Some(re) = &api_desc_re {
            if let Some(caps) = re.captures(trimmed) {
                pending_description = caps.get(1).map(|m| m.as_str().to_string());
                continue;
            }
        }

        if trimmed.starts_with('@') {
            continue;
        }

        if let Some(re) = &field_re {
            if let Some(caps) = re.captures(trimmed) {
                let field_type = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                let name = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();

                if name == "serialVersionUID" || field_type == "static" {
                    pending_description = None;
                    continue;
                }

                fields.push(JavaField {
                    name,
                    field_type,
                    description: pending_description.take().unwrap_or_default(),
                    required: false,
                    children: Vec::new(),
                });
            }
        }
    }

    fields
}

/// Build import map from a single class file's import statements
fn build_local_import_map(content: &str, class_path: &str) -> HashMap<String, String> {
    let mut import_map: HashMap<String, String> = HashMap::new();
    let class_dir = match Path::new(class_path).parent() {
        Some(d) => d,
        None => return import_map,
    };

    // Find the project root (src/main/java parent)
    let project_root = find_source_root(class_path);

    if let Ok(re) = Regex::new(r"import\s+([\w.]+);") {
        for caps in re.captures_iter(content) {
            if let Some(import_path) = caps.get(1) {
                let full_import = import_path.as_str();
                if let Some(class_name) = full_import.rsplit('.').next() {
                    let relative_path = full_import.replace('.', "/") + ".java";

                    // Try from project root first
                    if let Some(ref root) = project_root {
                        let candidate = root.join(&relative_path);
                        if candidate.exists() {
                            import_map.insert(class_name.to_string(), candidate.to_string_lossy().to_string());
                            continue;
                        }
                    }

                    // Fallback: try same directory
                    let candidate = class_dir.join(format!("{}.java", class_name));
                    if candidate.exists() {
                        import_map.insert(class_name.to_string(), candidate.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    import_map
}

/// Find the source root directory (e.g., src/main/java) from a class file path
fn find_source_root(class_path: &str) -> Option<std::path::PathBuf> {
    let path = Path::new(class_path);
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir.ends_with("src/main/java") || dir.ends_with("src\\main\\java") {
            return Some(dir.to_path_buf());
        }
        current = dir.parent();
    }
    None
}

/// Fallback search: find an entity class by name in the project directory and parse its fields.
/// Used when the class is not found in the controller's import_map.
fn find_and_parse_entity_class(
    class_name: &str,
    project_path: &Path,
    import_map: &HashMap<String, String>,
    visited: &mut std::collections::HashSet<String>,
) -> Vec<JavaField> {
    let target_file = format!("{}.java", class_name);
    for entry in WalkDir::new(project_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .map_or(false, |f| f.to_string_lossy() == target_file)
        {
            return parse_entity_class_fields_with_imports(
                &path.to_string_lossy(),
                import_map,
                project_path,
                0,
                visited,
            );
        }
    }
    Vec::new()
}

/// Extract @RequestParam parameters from method signature
fn extract_request_params(content: &str) -> Vec<JavaRequestParam> {
    let mut params = Vec::new();

    // Match @RequestParam with various formats
    // @RequestParam("name") Type varName
    // @RequestParam(value = "name", required = false, defaultValue = "xxx") Type varName
    // @Parameter(description = "xxx") @RequestParam("name") Type varName

    // First, try to find @Parameter description followed by @RequestParam
    // Handles: @Parameter(description = "xxx") @RequestParam("name") Type varName
    // And:     @Parameter(description = "xxx") @RequestParam(value = "name") Type varName
    let param_with_desc_patterns = [
        r#"@Parameter\s*\([^)]*description\s*=\s*"([^"]+)"[^)]*\)\s*@RequestParam\s*\(\s*"(\w+)"\s*\)\s*(\w+(?:<[^>]+>)?)\s+(\w+)"#,
        r#"@Parameter\s*\([^)]*description\s*=\s*"([^"]+)"[^)]*\)\s*@RequestParam\s*\(\s*value\s*=\s*"(\w+)"[^)]*\)\s*(\w+(?:<[^>]+>)?)\s+(\w+)"#,
    ];
    for pattern in param_with_desc_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for caps in re.captures_iter(content) {
                let description = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                let name = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
                let param_type = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

                if !params.iter().any(|p: &JavaRequestParam| p.name == name) {
                    params.push(JavaRequestParam {
                        name,
                        param_type,
                        description,
                        required: true,
                        default_value: None,
                    });
                }
            }
        }
    }

    // Then match @RequestParam without @Parameter
    let simple_param_patterns = [
        r#"@RequestParam\s*\(\s*"(\w+)"\s*\)\s*(\w+(?:<[^>]+>)?)\s+(\w+)"#,
        r#"@RequestParam\s*\(\s*value\s*=\s*"(\w+)"[^)]*\)\s*(\w+(?:<[^>]+>)?)\s+(\w+)"#,
        r#"@RequestParam\s+(\w+(?:<[^>]+>)?)\s+(\w+)"#,
    ];

    for pattern in simple_param_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for caps in re.captures_iter(content) {
                let (name, param_type) = if caps.len() == 4 {
                    // Pattern with explicit name
                    (
                        caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                        caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    )
                } else {
                    // Pattern without explicit name (use variable name)
                    (
                        caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default(),
                        caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                    )
                };

                // Check if this param was already added from the first pattern
                if !params.iter().any(|p| p.name == name) {
                    params.push(JavaRequestParam {
                        name,
                        param_type,
                        description: String::new(),
                        required: true,
                        default_value: None,
                    });
                }
            }
        }
    }

    params
}

/// Extract the method parameter list from a Java method signature,
/// handling nested generics in the return type correctly.
/// e.g., `public CommRes<PageInfo<Foo>> getList(SomeParam param)` -> "SomeParam param"
fn extract_method_param_list(content: &str) -> Option<String> {
    let re = Regex::new(r"public\s+").ok()?;
    let mat = re.find(content)?;
    let after_public = &content[mat.end()..];

    // Skip return type by tracking angle bracket depth
    let mut angle_depth = 0i32;
    let chars: Vec<char> = after_public.chars().collect();
    let mut type_end = 0;

    for (i, &ch) in chars.iter().enumerate() {
        match ch {
            '<' => angle_depth += 1,
            '>' => angle_depth -= 1,
            ' ' | '\t' if angle_depth == 0 => {
                type_end = i;
                break;
            }
            _ => {}
        }
    }

    if type_end == 0 {
        return None;
    }

    // After the return type, find method name then '(' ... ')'
    let after_type = &after_public[type_end..].trim_start();
    // Find the opening '('
    let paren_start = after_type.find('(')?;
    let after_paren = &after_type[paren_start + 1..];

    // Find matching ')' respecting nested parentheses
    let mut depth = 1i32;
    let mut paren_end = 0;
    for (i, ch) in after_paren.chars().enumerate() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    paren_end = i;
                    break;
                }
            }
            _ => {}
        }
    }

    if depth != 0 {
        return None;
    }

    Some(after_paren[..paren_end].to_string())
}

/// Extract plain POJO parameter types from method signature.
/// These are parameters without @RequestBody, @RequestParam, @PathVariable, etc.
/// e.g., `public Result getDetail(DasDistBasicInformationMonParam param)`
/// Spring Boot auto-binds these POJO fields as individual query parameters.
fn extract_plain_pojo_params(content: &str) -> Vec<String> {
    let mut pojo_types = Vec::new();

    // Extract the method parameter list from method signature
    let param_list = match extract_method_param_list(content) {
        Some(p) => p,
        None => return pojo_types,
    };

    if param_list.trim().is_empty() {
        return pojo_types;
    }

    // Types that should NOT be treated as POJO params
    let skip_types: Vec<&str> = vec![
        "String", "int", "Integer", "long", "Long", "short", "Short",
        "boolean", "Boolean", "double", "Double", "float", "Float",
        "byte", "Byte", "char", "Character", "BigDecimal", "BigInteger",
        "Date", "LocalDate", "LocalDateTime", "LocalTime", "Timestamp",
        "MultipartFile", "HttpServletRequest", "HttpServletResponse",
        "BindingResult", "Model", "ModelMap", "RedirectAttributes",
        "Pageable", "PageRequest", "Sort",
        "Principal", "Authentication", "OAuth2User",
    ];

    // Annotations that indicate the param is already handled
    let handled_annotations = [
        "@RequestBody", "@RequestParam", "@PathVariable",
        "@RequestHeader", "@CookieValue", "@ModelAttribute",
        "@RequestPart", "@SessionAttribute",
    ];

    // Split parameter list by comma, being careful with generics
    let params = split_params(&param_list);

    for param in params {
        let trimmed = param.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Check if this param has any handled annotation
        let has_annotation = handled_annotations.iter().any(|ann| trimmed.contains(ann));
        if has_annotation {
            continue;
        }

        // Extract the type name: last "Type varName" pattern in the param
        // The param might have annotations like @Valid, @NotNull etc. before the type
        let type_re = Regex::new(r"(\w+(?:<[^>]+>)?)\s+\w+\s*$").ok();
        if let Some(caps) = type_re.and_then(|re| re.captures(trimmed)) {
            let type_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");

            // Strip generic type wrapper (e.g., List<Foo> -> skip, it's a collection)
            let clean_type = type_name
                .split('<')
                .next()
                .unwrap_or(type_name);

            // Skip primitives, wrappers, and framework types
            if skip_types.iter().any(|&t| t == clean_type) {
                continue;
            }

            // Must start with uppercase (class name convention)
            if clean_type.chars().next().map_or(false, |c| c.is_uppercase()) {
                pojo_types.push(clean_type.to_string());
            }
        }
    }

    pojo_types
}

/// Split a method parameter list by commas, respecting generics nesting
fn split_params(param_list: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut angle_depth = 0;

    for ch in param_list.chars() {
        match ch {
            '<' => { angle_depth += 1; current.push(ch); }
            '>' => { angle_depth -= 1; current.push(ch); }
            ',' if angle_depth == 0 => {
                parts.push(current.clone());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    if !current.trim().is_empty() {
        parts.push(current);
    }

    parts
}

/// Parse all endpoints in a controller
fn parse_endpoints(
    content: &str,
    controller_name: &str,
    base_path: &str,
    import_map: &HashMap<String, String>,
    project_path: &Path,
) -> Vec<JavaEndpoint> {
    let mut endpoints = Vec::new();

    // Method annotations to look for
    let method_patterns = [
        ("GET", r"@GetMapping"),
        ("POST", r"@PostMapping"),
        ("PUT", r"@PutMapping"),
        ("DELETE", r"@DeleteMapping"),
        ("PATCH", r"@PatchMapping"),
    ];

    // Split content by method annotations and process each
    for (http_method, annotation) in method_patterns {
        let parts: Vec<&str> = content.split(annotation).collect();
        for (i, part) in parts.iter().enumerate().skip(1) {
            if let Some(endpoint) = parse_single_endpoint(
                part,
                http_method,
                controller_name,
                base_path,
                &format!("{}-{}-{}", controller_name, http_method, i),
                import_map,
                project_path,
            ) {
                endpoints.push(endpoint);
            }
        }
    }

    // Also check for @RequestMapping with method specified
    if let Ok(re) = Regex::new(
        r#"@RequestMapping\s*\([^)]*method\s*=\s*RequestMethod\.(\w+)[^)]*value\s*=\s*"([^"]+)""#,
    ) {
        for caps in re.captures_iter(content) {
            let http_method = caps.get(1).map(|m| m.as_str()).unwrap_or("GET");
            let path = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let full_path = normalize_path(&format!("{}{}", base_path, path));

            endpoints.push(JavaEndpoint {
                id: uuid::Uuid::new_v4().to_string(),
                controller_name: controller_name.to_string(),
                method_name: "unknown".to_string(),
                http_method: http_method.to_string(),
                path: path.to_string(),
                full_path,
                summary: String::new(),
                description: String::new(),
                request_body_type: None,
                request_body_fields: Vec::new(),
                request_params: Vec::new(),
                response_type: None,
                response_body_fields: Vec::new(),
            });
        }
    }

    endpoints
}

/// Parse a single endpoint from the content after a method annotation
fn parse_single_endpoint(
    content: &str,
    http_method: &str,
    controller_name: &str,
    base_path: &str,
    _fallback_id: &str,
    import_map: &HashMap<String, String>,
    project_path: &Path,
) -> Option<JavaEndpoint> {
    // Extract path from annotation
    let path = extract_endpoint_path(content)?;

    // Extract method name
    let method_name = extract_method_name(content);

    // Extract summary from @Operation or @ApiOperation
    let (summary, description) = extract_operation_info(content);

    // Extract request body type
    let mut request_body_type = extract_request_body_type(content);

    // Extract request body fields if we have a body type
    let mut request_body_fields = if let Some(ref body_type) = request_body_type {
        // Strip generic type if present (e.g., List<Foo> -> Foo)
        let clean_type = body_type
            .strip_prefix("List<")
            .and_then(|s| s.strip_suffix('>'))
            .unwrap_or(body_type);

        // Try to find the class file and parse its fields (with inheritance)
        if let Some(class_path) = import_map.get(clean_type) {
            let mut visited = std::collections::HashSet::new();
            parse_entity_class_fields_with_imports(class_path, import_map, project_path, 0, &mut visited)
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Extract @RequestParam parameters
    let mut request_params = extract_request_params(content);

    // Extract plain POJO parameter types (no @RequestBody/@RequestParam annotation)
    let plain_pojo_types = extract_plain_pojo_params(content);
    let is_body_method = matches!(http_method.to_uppercase().as_str(), "POST" | "PUT" | "PATCH");

    for pojo_type in &plain_pojo_types {
        if let Some(class_path) = import_map.get(pojo_type) {
            let mut visited = std::collections::HashSet::new();
            let fields = parse_entity_class_fields_with_imports(class_path, import_map, project_path, 0, &mut visited);

            if is_body_method && request_body_type.is_none() {
                // For POST/PUT/PATCH, put POJO fields into request body as JSON
                request_body_type = Some(pojo_type.clone());
                for field in fields {
                    if !request_body_fields.iter().any(|f| f.name == field.name) {
                        request_body_fields.push(field);
                    }
                }
            } else {
                // For GET/DELETE/etc., put POJO fields as query parameters
                for field in fields {
                    if !request_params.iter().any(|p| p.name == field.name) {
                        request_params.push(JavaRequestParam {
                            name: field.name,
                            param_type: field.field_type,
                            description: field.description,
                            required: field.required,
                            default_value: None,
                        });
                    }
                }
            }
        }
    }

    // Generate full path
    let full_path = normalize_path(&format!("{}{}", base_path, path));

    // Extract response type and fields
    let response_type = extract_response_type(content);
    let response_body_fields = if let Some(ref rt) = response_type {
        if let Some(entity_name) = extract_inner_entity_type(rt) {
            let mut visited = std::collections::HashSet::new();
            if let Some(class_path) = import_map.get(&entity_name) {
                parse_entity_class_fields_with_imports(class_path, import_map, project_path, 0, &mut visited)
            } else {
                // Fallback: search the project for the entity class file
                find_and_parse_entity_class(&entity_name, project_path, import_map, &mut visited)
            }
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    Some(JavaEndpoint {
        id: uuid::Uuid::new_v4().to_string(),
        controller_name: controller_name.to_string(),
        method_name,
        http_method: http_method.to_string(),
        path,
        full_path,
        summary,
        description,
        request_body_type,
        request_body_fields,
        request_params,
        response_type,
        response_body_fields,
    })
}

/// Extract endpoint path from annotation content
fn extract_endpoint_path(content: &str) -> Option<String> {
    // Try various path extraction patterns
    let patterns = [
        r#"^\s*\(\s*"([^"]+)"\s*\)"#,            // ("path")
        r#"^\s*\(\s*value\s*=\s*"([^"]+)""#,     // (value = "path")
        r#"^\s*\(\s*path\s*=\s*"([^"]+)""#,      // (path = "path")
        r#"^\s*\(\s*\)"#,                        // () - empty means root
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(caps) = re.captures(content) {
                return Some(caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
            }
        }
    }

    // If no parentheses found, might be just @GetMapping without path
    if content.trim_start().starts_with("\n") || content.trim_start().starts_with("\r") {
        return Some(String::new());
    }

    None
}

/// Extract method name from the content
fn extract_method_name(content: &str) -> String {
    // Use character-level parsing to handle nested generics in return type
    let re = match Regex::new(r"public\s+") {
        Ok(r) => r,
        Err(_) => return "unknown".to_string(),
    };
    let mat = match re.find(content) {
        Some(m) => m,
        None => return "unknown".to_string(),
    };
    let after_public = &content[mat.end()..];

    // Skip return type by tracking angle bracket depth
    let mut angle_depth = 0i32;
    let chars: Vec<char> = after_public.chars().collect();
    let mut type_end = 0;

    for (i, &ch) in chars.iter().enumerate() {
        match ch {
            '<' => angle_depth += 1,
            '>' => angle_depth -= 1,
            ' ' | '\t' if angle_depth == 0 => {
                type_end = i;
                break;
            }
            _ => {}
        }
    }

    if type_end == 0 {
        return "unknown".to_string();
    }

    // After the return type, the next word is the method name
    let after_type = after_public[type_end..].trim_start();
    // Method name ends at '('
    if let Some(paren_pos) = after_type.find('(') {
        let name = after_type[..paren_pos].trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }

    "unknown".to_string()
}

/// Extract operation info from @Operation or @ApiOperation annotations
fn extract_operation_info(content: &str) -> (String, String) {
    let mut summary = String::new();
    let mut description = String::new();

    // Try @Operation (OpenAPI 3)
    if let Ok(re) = Regex::new(r#"@Operation\s*\([^)]*summary\s*=\s*"([^"]+)""#) {
        if let Some(caps) = re.captures(content) {
            summary = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }
    if let Ok(re) = Regex::new(r#"@Operation\s*\([^)]*description\s*=\s*"([^"]+)""#) {
        if let Some(caps) = re.captures(content) {
            description = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }

    // Try @ApiOperation (Swagger 2)
    if summary.is_empty() {
        if let Ok(re) = Regex::new(r#"@ApiOperation\s*\([^)]*value\s*=\s*"([^"]+)""#) {
            if let Some(caps) = re.captures(content) {
                summary = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
            }
        }
    }

    (summary, description)
}

/// Extract the return type from a Java method signature
/// Handles patterns like: public Result<PageInfo<Entity>> methodName(...)
fn extract_response_type(content: &str) -> Option<String> {
    // Use character-level parsing to handle nested generics correctly
    let re = Regex::new(r"public\s+").ok()?;
    let mat = re.find(content)?;
    let after_public = &content[mat.end()..];

    // Find the method name by tracking angle brackets for generics
    let mut angle_depth = 0i32;
    let mut type_end = 0;
    let chars: Vec<char> = after_public.chars().collect();

    for (i, &ch) in chars.iter().enumerate() {
        match ch {
            '<' => angle_depth += 1,
            '>' => angle_depth -= 1,
            ' ' | '\t' if angle_depth == 0 => {
                type_end = i;
                break;
            }
            _ => {}
        }
    }

    if type_end == 0 {
        return None;
    }

    let return_type = after_public[..type_end].trim().to_string();

    if return_type == "void" || return_type.is_empty() {
        return None;
    }

    Some(return_type)
}

/// Extract the innermost entity class name from a response type
/// e.g., "Result<PageInfo<YxjcSceneTouPriceException>>" -> "YxjcSceneTouPriceException"
/// e.g., "ResponseEntity<List<UserDto>>" -> "UserDto"
fn extract_inner_entity_type(response_type: &str) -> Option<String> {
    let wrapper_types = [
        "Result", "R", "ResponseEntity", "Response", "ApiResult",
        "CommonResult", "BaseResult", "JsonResult", "AjaxResult",
        "CommRes", "CommResult",
        "PageInfo", "PageResult", "IPage", "Page", "TableDataInfo",
        "List", "Set", "Collection",
    ];

    let mut current = response_type.trim().to_string();

    // Iteratively strip outer wrapper types
    loop {
        let outer = current.split('<').next().unwrap_or(&current).trim().to_string();
        if wrapper_types.iter().any(|&w| w == outer) {
            // Extract content inside < ... >
            if let Some(start) = current.find('<') {
                if let Some(end) = current.rfind('>') {
                    current = current[start + 1..end].trim().to_string();
                    continue;
                }
            }
            // Wrapper type without generic parameter (e.g. bare "Result") — no entity to extract
            return None;
        }
        break;
    }

    let clean = current.split('<').next().unwrap_or(&current).trim().to_string();
    let skip_types = [
        "String", "Integer", "Long", "Boolean", "Double", "Float",
        "Object", "Void", "void", "int", "long", "boolean",
        "Map", "HashMap",
    ];

    if clean.chars().next().map_or(false, |c| c.is_uppercase())
        && !skip_types.contains(&clean.as_str())
    {
        Some(clean)
    } else {
        None
    }
}

/// Extract request body type from @RequestBody annotation
fn extract_request_body_type(content: &str) -> Option<String> {
    // Find @RequestBody position
    let body_pos = content.find("@RequestBody")?;
    let after_annotation = &content[body_pos + "@RequestBody".len()..];

    // Skip optional parenthesized attributes like (required = false)
    let after_attrs = if after_annotation.trim_start().starts_with('(') {
        let paren_start = after_annotation.find('(')?;
        let mut depth = 1i32;
        let rest = &after_annotation[paren_start + 1..];
        let mut end = 0;
        for (i, ch) in rest.chars().enumerate() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        &rest[end + 1..]
    } else {
        after_annotation
    };

    // Skip whitespace and optional annotations like @Valid
    let trimmed = after_attrs.trim_start();
    let mut pos = 0;
    let chars: Vec<char> = trimmed.chars().collect();
    while pos < chars.len() && chars[pos] == '@' {
        // skip annotation
        while pos < chars.len() && !chars[pos].is_whitespace() {
            pos += 1;
        }
        while pos < chars.len() && chars[pos].is_whitespace() {
            pos += 1;
        }
    }

    let type_start = &trimmed[pos..];

    // Extract type name with nested generics using angle bracket tracking
    let mut angle_depth = 0i32;
    let mut type_end = 0;
    for (i, ch) in type_start.chars().enumerate() {
        match ch {
            '<' => angle_depth += 1,
            '>' => angle_depth -= 1,
            ' ' | '\t' | '\n' if angle_depth == 0 => {
                type_end = i;
                break;
            }
            _ => {}
        }
    }

    if type_end == 0 {
        return None;
    }

    let type_name = type_start[..type_end].trim().to_string();
    if type_name.is_empty() {
        return None;
    }

    Some(type_name)
}

/// Normalize a path string
fn normalize_path(path: &str) -> String {
    let path = path.replace("//", "/");
    if path.starts_with('/') {
        path
    } else {
        format!("/{}", path)
    }
}

/// Import selected Java endpoints into a project
#[tauri::command]
pub async fn import_java_endpoints(options: JavaImportOptions) -> AppResult<JavaImportResult> {
    let store = ProjectStore::new();
    let mut imported_paths = Vec::new();

    // Create new project if needed
    let project_path = if options.create_new_project {
        let project_name = options.project_name.as_deref().unwrap_or("Imported API");
        let new_path = Path::new(&options.project_path).join(project_name);

        // Create project directory
        fs::create_dir_all(&new_path)?;

        // Create config file
        let config = crate::models::project::ProjectConfig {
            version: "1.0.0".to_string(),
            name: project_name.to_string(),
            active_environment: None,
            settings: crate::models::project::ProjectSettings::default(),
        };

        let config_path = new_path.join("sjypost.json");
        let config_content = serde_json::to_string_pretty(&config)?;
        fs::write(&config_path, config_content)?;

        new_path.to_string_lossy().to_string()
    } else {
        options.project_path.clone()
    };

    let project_dir = Path::new(&project_path);

    // Group endpoints by controller (name, description)
    let mut endpoints_by_controller: HashMap<String, (String, Vec<&JavaEndpoint>)> = HashMap::new();
    for endpoint_id in &options.endpoints {
        for controller in &options.parsed_data.controllers {
            for endpoint in &controller.endpoints {
                if &endpoint.id == endpoint_id {
                    endpoints_by_controller
                        .entry(controller.name.clone())
                        .or_insert_with(|| (controller.description.clone(), Vec::new()))
                        .1
                        .push(endpoint);
                }
            }
        }
    }

    // Create folders and requests for each controller
    for (controller_name, (controller_desc, endpoints)) in endpoints_by_controller {
        // Create controller folder
        let folder_path = project_dir.join(&controller_name);
        if !folder_path.exists() {
            fs::create_dir_all(&folder_path)?;
        }

        // Write _folder.json with description as display name
        let display_name = if !controller_desc.is_empty() {
            controller_desc.clone()
        } else {
            controller_name.clone()
        };
        let meta = FolderMeta {
            name: display_name,
            description: controller_desc,
            sort_order: vec![],
        };
        let meta_path = folder_path.join("_folder.json");
        let meta_content = serde_json::to_string_pretty(&meta)?;
        fs::write(&meta_path, meta_content)?;

        // Create request files for each endpoint
        for endpoint in endpoints {
            let request = convert_endpoint_to_request(endpoint, &options.base_url);
            let file_name = format!("{}.req.json", sanitize_filename(&request.name));
            let file_path = folder_path.join(&file_name);

            store.save_request(&file_path, &request).await?;
            imported_paths.push(file_path.to_string_lossy().to_string());
        }
    }

    Ok(JavaImportResult {
        project_path,
        imported_files: imported_paths,
    })
}

/// Convert a Java endpoint to a RequestFile
fn convert_endpoint_to_request(endpoint: &JavaEndpoint, _base_url: &str) -> RequestFile {
    let method = match endpoint.http_method.to_uppercase().as_str() {
        "GET" => HttpMethod::Get,
        "POST" => HttpMethod::Post,
        "PUT" => HttpMethod::Put,
        "DELETE" => HttpMethod::Delete,
        "PATCH" => HttpMethod::Patch,
        "HEAD" => HttpMethod::Head,
        "OPTIONS" => HttpMethod::Options,
        _ => HttpMethod::Get,
    };

    // Generate request name from method name or path
    let name = if !endpoint.summary.is_empty() {
        endpoint.summary.clone()
    } else if !endpoint.method_name.is_empty() && endpoint.method_name != "unknown" {
        endpoint.method_name.clone()
    } else {
        format!("{} {}", endpoint.http_method, endpoint.path)
    };

    // Use environment variable for base URL
    let url = format!("{{{{baseUrl}}}}{}", endpoint.full_path);

    // Generate query params from @RequestParam
    let query: Vec<KeyValueItem> = endpoint.request_params.iter().map(|param| {
        KeyValueItem {
            key: param.name.clone(),
            value: generate_sample_value(&param.param_type, &param.name),
            description: param.description.clone(),
            enabled: true,
            value_type: "text".to_string(),
        }
    }).collect();

    // Generate sample body for POST/PUT/PATCH methods
    let body = if matches!(method, HttpMethod::Post | HttpMethod::Put | HttpMethod::Patch) {
        generate_sample_body(endpoint)
    } else {
        RequestBody::None
    };

    let now = chrono::Utc::now().to_rfc3339();

    RequestFile {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        method,
        url,
        headers: {
            let mut headers = HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            headers
        },
        query,
        body,
        auth: crate::models::auth::AuthConfig::None,
        assertions: Vec::new(),
        meta: RequestMeta {
            created_at: now.clone(),
            updated_at: now,
        },
    }
}

/// Generate a sample value based on Java type
pub(crate) fn generate_sample_value(java_type: &str, field_name: &str) -> String {
    match java_type.to_lowercase().as_str() {
        "string" => format!("{}_01", field_name),
        "int" | "integer" | "long" => "0".to_string(),
        "boolean" => "false".to_string(),
        "double" | "float" => "0.0".to_string(),
        "date" | "localdate" | "localdatetime" => "2024-01-01".to_string(),
        _ => format!("{}_01", field_name),
    }
}

/// Generate a sample request body based on request body fields
fn generate_sample_body(endpoint: &JavaEndpoint) -> RequestBody {
    let mut json_obj = serde_json::Map::new();

    if !endpoint.request_body_fields.is_empty() {
        // Use parsed fields to generate body
        for field in &endpoint.request_body_fields {
            let value = generate_json_value(&field.field_type, &field.name);
            json_obj.insert(field.name.clone(), value);
        }
    } else if endpoint.request_body_type.is_some() {
        // Fallback to common pagination fields
        json_obj.insert("pageNum".to_string(), serde_json::json!(1));
        json_obj.insert("pageSize".to_string(), serde_json::json!(10));
    }

    let sample_json = serde_json::Value::Object(json_obj);
    RequestBody::Json(serde_json::to_string_pretty(&sample_json).unwrap_or_default())
}

/// Generate a JSON value based on Java type
pub(crate) fn generate_json_value(java_type: &str, field_name: &str) -> serde_json::Value {
    // Check for common field names first
    let name_lower = field_name.to_lowercase();
    if name_lower.contains("pagenum") || name_lower.contains("page_num") {
        return serde_json::json!(1);
    }
    if name_lower.contains("pagesize") || name_lower.contains("page_size") {
        return serde_json::json!(10);
    }
    if name_lower.contains("id") {
        return serde_json::json!(format!("{}_01", field_name));
    }

    // Based on Java type
    let type_lower = java_type.to_lowercase();
    if type_lower.starts_with("list") || type_lower.starts_with("set") || type_lower.starts_with("collection") {
        return serde_json::json!([]);
    }
    if type_lower.starts_with("map") {
        return serde_json::json!({});
    }

    match type_lower.as_str() {
        "string" => serde_json::json!(format!("{}_01", field_name)),
        "int" | "integer" => serde_json::json!(0),
        "long" => serde_json::json!(0),
        "boolean" => serde_json::json!(false),
        "double" | "float" => serde_json::json!(0.0),
        "bigdecimal" => serde_json::json!(0.0),
        "date" | "localdate" | "localdatetime" | "timestamp" => serde_json::json!("2024-01-01"),
        _ => serde_json::json!(format!("{}_01", field_name)),
    }
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

// ==================== Java Project Persistence Commands ====================

/// Load all stored Java projects
#[tauri::command]
pub async fn get_java_projects(app_handle: AppHandle) -> AppResult<JavaProjectsStorage> {
    let store = JavaProjectStore::new();
    store.load_projects(&app_handle).await
}

/// Add or update a Java project
#[tauri::command]
pub async fn save_java_project(app_handle: AppHandle, project: StoredJavaProject) -> AppResult<()> {
    let store = JavaProjectStore::new();
    store.add_project(&app_handle, project).await
}

/// Set project open/close state
#[tauri::command]
pub async fn set_java_project_open(app_handle: AppHandle, project_id: String, is_open: bool) -> AppResult<()> {
    let store = JavaProjectStore::new();
    store.set_project_open(&app_handle, &project_id, is_open).await
}

/// Delete a Java project reference
#[tauri::command]
pub async fn delete_java_project(app_handle: AppHandle, project_id: String) -> AppResult<()> {
    let store = JavaProjectStore::new();
    store.delete_project(&app_handle, &project_id).await
}

/// Mark endpoints as seen for a project
#[tauri::command]
pub async fn mark_java_endpoints_seen(app_handle: AppHandle, project_id: String, endpoint_ids: Vec<String>) -> AppResult<()> {
    let store = JavaProjectStore::new();
    store.mark_endpoints_seen(&app_handle, &project_id, endpoint_ids).await
}

/// Response for check new endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckNewEndpointsResponse {
    pub parsed_data: ParsedJavaProject,
    pub new_endpoint_ids: Vec<String>,
}

/// Check for new endpoints in a Java project
#[tauri::command]
pub async fn check_java_project_updates(app_handle: AppHandle, project_id: String) -> AppResult<CheckNewEndpointsResponse> {
    let store = JavaProjectStore::new();
    let storage = store.load_projects(&app_handle).await?;

    let project = storage
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| AppError::FileNotFound(format!("Java project not found: {}", project_id)))?;

    // Re-parse the project
    let parsed_data = parse_java_project(project.path.clone()).await?;

    // Find new endpoints
    let new_endpoint_ids = store.get_new_endpoints(project, &parsed_data);

    Ok(CheckNewEndpointsResponse {
        parsed_data,
        new_endpoint_ids,
    })
}
