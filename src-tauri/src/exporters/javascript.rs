use crate::models::request::RequestFile;
use crate::utils::error::AppResult;
use std::collections::HashMap;

pub struct JavaScriptExporter;

impl JavaScriptExporter {
    pub fn new() -> Self {
        Self
    }

    pub fn export_fetch(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement JavaScript Fetch export
        todo!("JavaScriptExporter::export_fetch not implemented")
    }

    pub fn export_axios(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement JavaScript Axios export
        todo!("JavaScriptExporter::export_axios not implemented")
    }
}

impl Default for JavaScriptExporter {
    fn default() -> Self {
        Self::new()
    }
}
