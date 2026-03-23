use crate::models::request::RequestFile;
use crate::models::response::HttpResponse;
use crate::services::http_engine::HttpEngine;
use crate::utils::error::AppResult;
use std::collections::HashMap;

#[tauri::command]
pub async fn send_request(request: RequestFile, variables: Option<HashMap<String, String>>) -> AppResult<HttpResponse> {
    let engine = HttpEngine::new();
    let vars = variables.unwrap_or_default();
    engine.send(&request, &vars).await
}
