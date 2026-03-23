use crate::commands::import_cmd::ImportPreview;
use crate::models::request::RequestFile;
use crate::utils::error::AppResult;
use std::path::Path;

pub struct BrunoImporter;

impl BrunoImporter {
    pub fn new() -> Self {
        Self
    }

    pub async fn preview(&self, folder_path: &Path) -> AppResult<ImportPreview> {
        // TODO: Implement Bruno preview
        todo!("BrunoImporter::preview not implemented")
    }

    pub async fn import(&self, folder_path: &Path) -> AppResult<Vec<RequestFile>> {
        // TODO: Implement Bruno import
        todo!("BrunoImporter::import not implemented")
    }
}

impl Default for BrunoImporter {
    fn default() -> Self {
        Self::new()
    }
}
