use crate::models::request::RequestFile;
use crate::utils::error::AppResult;
use std::collections::HashMap;

pub struct JavaExporter;

impl JavaExporter {
    pub fn new() -> Self {
        Self
    }

    pub fn export_okhttp(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement Java OkHttp export
        todo!("JavaExporter::export_okhttp not implemented")
    }

    pub fn export_httpclient(&self, request: &RequestFile, variables: &HashMap<String, String>) -> AppResult<String> {
        // TODO: Implement Java HttpClient export
        todo!("JavaExporter::export_httpclient not implemented")
    }
}

impl Default for JavaExporter {
    fn default() -> Self {
        Self::new()
    }
}
