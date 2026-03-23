use crate::models::request::RequestFile;
use crate::utils::error::AppResult;
use std::collections::HashMap;

pub struct CurlExporter;

impl CurlExporter {
    pub fn new() -> Self {
        Self
    }

    pub fn export(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement cURL export
        todo!("CurlExporter::export not implemented")
    }
}

impl Default for CurlExporter {
    fn default() -> Self {
        Self::new()
    }
}
