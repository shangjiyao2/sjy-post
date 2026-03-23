use crate::utils::error::{AppError, AppResult};
use std::path::Path;

pub struct FileManager;

impl FileManager {
    pub fn new() -> Self {
        Self
    }

    pub async fn read_json<T: serde::de::DeserializeOwned>(&self, path: &Path) -> AppResult<T> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| AppError::Io(e))?;
        let data: T = serde_json::from_str(&content)?;
        Ok(data)
    }

    pub async fn write_json<T: serde::Serialize>(&self, path: &Path, data: &T) -> AppResult<()> {
        let content = serde_json::to_string_pretty(data)?;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(path, content).await?;
        Ok(())
    }

    pub async fn delete(&self, path: &Path) -> AppResult<()> {
        if path.is_dir() {
            tokio::fs::remove_dir_all(path).await?;
        } else {
            tokio::fs::remove_file(path).await?;
        }
        Ok(())
    }

    pub async fn rename(&self, from: &Path, to: &Path) -> AppResult<()> {
        tokio::fs::rename(from, to).await?;
        Ok(())
    }

    pub async fn exists(&self, path: &Path) -> bool {
        tokio::fs::metadata(path).await.is_ok()
    }

    pub async fn create_dir(&self, path: &Path) -> AppResult<()> {
        tokio::fs::create_dir_all(path).await?;
        Ok(())
    }
}

impl Default for FileManager {
    fn default() -> Self {
        Self::new()
    }
}
