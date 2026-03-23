use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub method: String,
    pub url: String,
    pub status: u16,
    pub time_ms: u64,
    pub size_bytes: u64,
    pub request_name: Option<String>,
    pub request_headers: HashMap<String, String>,
    pub request_body: Option<String>,
    pub response_headers: HashMap<String, String>,
    pub response_body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryFile {
    pub entries: Vec<HistoryEntry>,
}
