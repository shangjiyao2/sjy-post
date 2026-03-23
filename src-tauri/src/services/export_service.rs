use crate::models::request::RequestFile;
use crate::utils::error::AppResult;
use std::collections::HashMap;

pub struct ExportService;

impl ExportService {
    pub fn new() -> Self {
        Self
    }

    pub fn export(&self, request: &RequestFile, format: &str, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement export based on format
        todo!("ExportService::export not implemented")
    }
}

impl Default for ExportService {
    fn default() -> Self {
        Self::new()
    }
}
