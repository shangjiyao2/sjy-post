use crate::utils::error::AppResult;

pub struct ImportService;

impl ImportService {
    pub fn new() -> Self {
        Self
    }

    pub async fn detect_format(&self, file_path: &str) -> AppResult<String> {
        // TODO: Implement format detection
        todo!("ImportService::detect_format not implemented")
    }
}

impl Default for ImportService {
    fn default() -> Self {
        Self::new()
    }
}
