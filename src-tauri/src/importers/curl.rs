use crate::models::request::RequestFile;
use crate::utils::error::AppResult;

pub struct CurlImporter;

impl CurlImporter {
    pub fn new() -> Self {
        Self
    }

    pub fn parse(&self, curl_command: &str) -> AppResult<RequestFile> {
        // TODO: Implement cURL parsing
        todo!("CurlImporter::parse not implemented")
    }
}

impl Default for CurlImporter {
    fn default() -> Self {
        Self::new()
    }
}
