use crate::models::websocket::{WsConfig, WsMessage, WsStatus};
use crate::services::ws_engine::WsEngine;
use crate::utils::error::AppError;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub type WsEngineState = Arc<Mutex<WsEngine>>;

#[tauri::command]
pub async fn ws_connect(
    engine: State<'_, WsEngineState>,
    config: WsConfig,
) -> Result<(), AppError> {
    let engine = engine.lock().await;
    engine.connect(config).await
}

#[tauri::command]
pub async fn ws_disconnect(
    engine: State<'_, WsEngineState>,
    id: String,
) -> Result<(), AppError> {
    let engine = engine.lock().await;
    engine.disconnect(&id).await
}

#[tauri::command]
pub async fn ws_send(
    engine: State<'_, WsEngineState>,
    id: String,
    message: String,
) -> Result<(), AppError> {
    let engine = engine.lock().await;
    engine.send(&id, &message).await
}

#[tauri::command]
pub async fn ws_get_status(
    engine: State<'_, WsEngineState>,
    id: String,
) -> Result<Option<WsStatus>, AppError> {
    let engine = engine.lock().await;
    Ok(engine.get_status(&id).await)
}

#[tauri::command]
pub async fn ws_get_messages(
    engine: State<'_, WsEngineState>,
    id: String,
) -> Result<Vec<WsMessage>, AppError> {
    let engine = engine.lock().await;
    Ok(engine.get_messages(&id).await)
}

#[tauri::command]
pub async fn ws_clear_messages(
    engine: State<'_, WsEngineState>,
    id: String,
) -> Result<(), AppError> {
    let engine = engine.lock().await;
    engine.clear_messages(&id).await;
    Ok(())
}
