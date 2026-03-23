use crate::models::history::{HistoryEntry, HistoryFile};
use crate::utils::error::{AppError, AppResult};
use std::path::PathBuf;
use tokio::fs;

const HISTORY_FILE: &str = ".sjypost/history.json";

pub struct HistoryService {
    max_entries: usize,
}

impl HistoryService {
    pub fn new(max_entries: usize) -> Self {
        Self { max_entries }
    }

    fn get_history_path(&self, project_path: &str) -> PathBuf {
        PathBuf::from(project_path).join(HISTORY_FILE)
    }

    async fn ensure_history_dir(&self, project_path: &str) -> AppResult<()> {
        let history_path = self.get_history_path(project_path);
        if let Some(parent) = history_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).await?;
            }
        }
        Ok(())
    }

    async fn read_history_file(&self, project_path: &str) -> AppResult<HistoryFile> {
        let path = self.get_history_path(project_path);
        if !path.exists() {
            return Ok(HistoryFile { entries: vec![] });
        }
        let content = fs::read_to_string(&path).await?;
        let history: HistoryFile = serde_json::from_str(&content)?;
        Ok(history)
    }

    async fn write_history_file(&self, project_path: &str, history: &HistoryFile) -> AppResult<()> {
        self.ensure_history_dir(project_path).await?;
        let path = self.get_history_path(project_path);
        let content = serde_json::to_string_pretty(history)?;
        fs::write(&path, content).await?;
        Ok(())
    }

    pub async fn add_entry(&self, project_path: &str, entry: HistoryEntry) -> AppResult<()> {
        let mut history = self.read_history_file(project_path).await?;

        // Insert at the beginning (newest first)
        history.entries.insert(0, entry);

        // Trim to max entries
        if history.entries.len() > self.max_entries {
            history.entries.truncate(self.max_entries);
        }

        self.write_history_file(project_path, &history).await?;
        Ok(())
    }

    pub async fn get_entries(&self, project_path: &str, limit: Option<usize>) -> AppResult<Vec<HistoryEntry>> {
        let history = self.read_history_file(project_path).await?;

        match limit {
            Some(n) => Ok(history.entries.into_iter().take(n).collect()),
            None => Ok(history.entries),
        }
    }

    pub async fn get_entry(&self, project_path: &str, entry_id: &str) -> AppResult<HistoryEntry> {
        let history = self.read_history_file(project_path).await?;

        history
            .entries
            .into_iter()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| AppError::Custom(format!("History entry not found: {}", entry_id)))
    }

    pub async fn delete_entry(&self, project_path: &str, entry_id: &str) -> AppResult<()> {
        let mut history = self.read_history_file(project_path).await?;

        let original_len = history.entries.len();
        history.entries.retain(|e| e.id != entry_id);

        if history.entries.len() == original_len {
            return Err(AppError::Custom(format!("History entry not found: {}", entry_id)));
        }

        self.write_history_file(project_path, &history).await?;
        Ok(())
    }

    pub async fn clear(&self, project_path: &str) -> AppResult<()> {
        let history = HistoryFile { entries: vec![] };
        self.write_history_file(project_path, &history).await?;
        Ok(())
    }
}

impl Default for HistoryService {
    fn default() -> Self {
        Self::new(100)
    }
}
