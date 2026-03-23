use crate::models::history::HistoryEntry;
use crate::services::history_service::HistoryService;
use crate::utils::error::AppError;

#[tauri::command]
pub async fn add_history_entry(
    project_path: String,
    entry: HistoryEntry,
) -> Result<(), AppError> {
    let service = HistoryService::default();
    service.add_entry(&project_path, entry).await
}

#[tauri::command]
pub async fn get_history_entries(
    project_path: String,
    limit: Option<usize>,
) -> Result<Vec<HistoryEntry>, AppError> {
    let service = HistoryService::default();
    service.get_entries(&project_path, limit).await
}

#[tauri::command]
pub async fn get_history_entry(
    project_path: String,
    entry_id: String,
) -> Result<HistoryEntry, AppError> {
    let service = HistoryService::default();
    service.get_entry(&project_path, &entry_id).await
}

#[tauri::command]
pub async fn delete_history_entry(
    project_path: String,
    entry_id: String,
) -> Result<(), AppError> {
    let service = HistoryService::default();
    service.delete_entry(&project_path, &entry_id).await
}

#[tauri::command]
pub async fn clear_history(project_path: String) -> Result<(), AppError> {
    let service = HistoryService::default();
    service.clear(&project_path).await
}
