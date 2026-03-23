use crate::models::websocket::{WsConfig, WsDirection, WsMessage, WsStatus};
use crate::utils::error::{AppError, AppResult};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};

type WsSender = mpsc::Sender<String>;

pub struct WsConnection {
    pub status: WsStatus,
    pub config: WsConfig,
    sender: Option<WsSender>,
    messages: Vec<WsMessage>,
}

pub struct WsEngine {
    connections: Arc<RwLock<HashMap<String, Arc<Mutex<WsConnection>>>>>,
    event_sender: Option<mpsc::Sender<WsEvent>>,
}

#[derive(Debug, Clone)]
pub struct WsEvent {
    pub connection_id: String,
    pub event_type: WsEventType,
}

#[derive(Debug, Clone)]
pub enum WsEventType {
    StatusChanged(WsStatus),
    MessageReceived(WsMessage),
    Error(String),
}

impl WsEngine {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            event_sender: None,
        }
    }

    pub fn with_event_sender(mut self, sender: mpsc::Sender<WsEvent>) -> Self {
        self.event_sender = Some(sender);
        self
    }

    pub async fn connect(&self, config: WsConfig) -> AppResult<()> {
        let connection_id = config.id.clone();
        let url = config.url.clone();

        // Create connection entry
        let connection = Arc::new(Mutex::new(WsConnection {
            status: WsStatus::Connecting,
            config: config.clone(),
            sender: None,
            messages: Vec::new(),
        }));

        // Store connection
        {
            let mut connections = self.connections.write().await;
            connections.insert(connection_id.clone(), connection.clone());
        }

        // Notify status change
        self.emit_event(WsEvent {
            connection_id: connection_id.clone(),
            event_type: WsEventType::StatusChanged(WsStatus::Connecting),
        })
        .await;

        // Connect in background
        let connections = self.connections.clone();
        let event_sender = self.event_sender.clone();
        let conn_id = connection_id.clone();

        tokio::spawn(async move {
            match connect_async(&url).await {
                Ok((ws_stream, _)) => {
                    let (mut write, mut read) = ws_stream.split();

                    // Create channel for sending messages
                    let (tx, mut rx) = mpsc::channel::<String>(100);

                    // Update connection status
                    {
                        let connections = connections.read().await;
                        if let Some(conn) = connections.get(&conn_id) {
                            let mut conn = conn.lock().await;
                            conn.status = WsStatus::Connected;
                            conn.sender = Some(tx);

                            // Add system message
                            conn.messages.push(WsMessage {
                                direction: WsDirection::System,
                                data: format!("Connected to {}", url),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            });
                        }
                    }

                    // Emit connected event
                    if let Some(sender) = &event_sender {
                        let _ = sender
                            .send(WsEvent {
                                connection_id: conn_id.clone(),
                                event_type: WsEventType::StatusChanged(WsStatus::Connected),
                            })
                            .await;
                    }

                    // Spawn write task
                    let write_conn_id = conn_id.clone();
                    let write_connections = connections.clone();
                    let write_event_sender = event_sender.clone();
                    tokio::spawn(async move {
                        while let Some(msg) = rx.recv().await {
                            if write.send(Message::Text(msg.clone())).await.is_ok() {
                                // Record sent message
                                let connections = write_connections.read().await;
                                if let Some(conn) = connections.get(&write_conn_id) {
                                    let mut conn = conn.lock().await;
                                    let ws_msg = WsMessage {
                                        direction: WsDirection::Sent,
                                        data: msg,
                                        timestamp: chrono::Utc::now().timestamp_millis(),
                                    };
                                    conn.messages.push(ws_msg.clone());

                                    // Emit message event
                                    if let Some(sender) = &write_event_sender {
                                        let _ = sender
                                            .send(WsEvent {
                                                connection_id: write_conn_id.clone(),
                                                event_type: WsEventType::MessageReceived(ws_msg),
                                            })
                                            .await;
                                    }
                                }
                            }
                        }
                    });

                    // Read messages
                    while let Some(msg) = read.next().await {
                        match msg {
                            Ok(Message::Text(text)) => {
                                let ws_msg = WsMessage {
                                    direction: WsDirection::Received,
                                    data: text,
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                };

                                // Store message
                                {
                                    let connections = connections.read().await;
                                    if let Some(conn) = connections.get(&conn_id) {
                                        let mut conn = conn.lock().await;
                                        conn.messages.push(ws_msg.clone());
                                    }
                                }

                                // Emit event
                                if let Some(sender) = &event_sender {
                                    let _ = sender
                                        .send(WsEvent {
                                            connection_id: conn_id.clone(),
                                            event_type: WsEventType::MessageReceived(ws_msg),
                                        })
                                        .await;
                                }
                            }
                            Ok(Message::Binary(data)) => {
                                let ws_msg = WsMessage {
                                    direction: WsDirection::Received,
                                    data: format!("[Binary: {} bytes]", data.len()),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                };

                                {
                                    let connections = connections.read().await;
                                    if let Some(conn) = connections.get(&conn_id) {
                                        let mut conn = conn.lock().await;
                                        conn.messages.push(ws_msg.clone());
                                    }
                                }

                                if let Some(sender) = &event_sender {
                                    let _ = sender
                                        .send(WsEvent {
                                            connection_id: conn_id.clone(),
                                            event_type: WsEventType::MessageReceived(ws_msg),
                                        })
                                        .await;
                                }
                            }
                            Ok(Message::Close(_)) => {
                                break;
                            }
                            Err(e) => {
                                if let Some(sender) = &event_sender {
                                    let _ = sender
                                        .send(WsEvent {
                                            connection_id: conn_id.clone(),
                                            event_type: WsEventType::Error(e.to_string()),
                                        })
                                        .await;
                                }
                                break;
                            }
                            _ => {}
                        }
                    }

                    // Connection closed
                    {
                        let connections = connections.read().await;
                        if let Some(conn) = connections.get(&conn_id) {
                            let mut conn = conn.lock().await;
                            conn.status = WsStatus::Disconnected;
                            conn.sender = None;
                            conn.messages.push(WsMessage {
                                direction: WsDirection::System,
                                data: "Connection closed".to_string(),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            });
                        }
                    }

                    if let Some(sender) = &event_sender {
                        let _ = sender
                            .send(WsEvent {
                                connection_id: conn_id.clone(),
                                event_type: WsEventType::StatusChanged(WsStatus::Disconnected),
                            })
                            .await;
                    }
                }
                Err(e) => {
                    // Connection failed
                    {
                        let connections = connections.read().await;
                        if let Some(conn) = connections.get(&conn_id) {
                            let mut conn = conn.lock().await;
                            conn.status = WsStatus::Error;
                            conn.messages.push(WsMessage {
                                direction: WsDirection::System,
                                data: format!("Connection failed: {}", e),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            });
                        }
                    }

                    if let Some(sender) = &event_sender {
                        let _ = sender
                            .send(WsEvent {
                                connection_id: conn_id.clone(),
                                event_type: WsEventType::StatusChanged(WsStatus::Error),
                            })
                            .await;
                        let _ = sender
                            .send(WsEvent {
                                connection_id: conn_id,
                                event_type: WsEventType::Error(e.to_string()),
                            })
                            .await;
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn disconnect(&self, id: &str) -> AppResult<()> {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(id) {
            let mut conn = conn.lock().await;
            conn.status = WsStatus::Disconnected;
            conn.sender = None;
            conn.messages.push(WsMessage {
                direction: WsDirection::System,
                data: "Disconnected by user".to_string(),
                timestamp: chrono::Utc::now().timestamp_millis(),
            });
        }

        self.emit_event(WsEvent {
            connection_id: id.to_string(),
            event_type: WsEventType::StatusChanged(WsStatus::Disconnected),
        })
        .await;

        Ok(())
    }

    pub async fn send(&self, id: &str, message: &str) -> AppResult<()> {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(id) {
            let conn = conn.lock().await;
            if let Some(sender) = &conn.sender {
                sender
                    .send(message.to_string())
                    .await
                    .map_err(|e| AppError::Custom(format!("Failed to send message: {}", e)))?;
                return Ok(());
            }
        }
        Err(AppError::Custom("Connection not found or not connected".to_string()))
    }

    pub async fn get_status(&self, id: &str) -> Option<WsStatus> {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(id) {
            let conn = conn.lock().await;
            return Some(conn.status.clone());
        }
        None
    }

    pub async fn get_messages(&self, id: &str) -> Vec<WsMessage> {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(id) {
            let conn = conn.lock().await;
            return conn.messages.clone();
        }
        Vec::new()
    }

    pub async fn clear_messages(&self, id: &str) {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(id) {
            let mut conn = conn.lock().await;
            conn.messages.clear();
        }
    }

    async fn emit_event(&self, event: WsEvent) {
        if let Some(sender) = &self.event_sender {
            let _ = sender.send(event).await;
        }
    }
}

impl Default for WsEngine {
    fn default() -> Self {
        Self::new()
    }
}
