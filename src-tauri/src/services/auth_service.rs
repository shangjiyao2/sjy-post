use crate::models::auth::{AuthConfig, OAuth2Token};
use crate::utils::error::AppResult;

pub struct AuthService;

impl AuthService {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_oauth2_token(&self, config: &AuthConfig) -> AppResult<OAuth2Token> {
        // TODO: Implement OAuth2 token fetching
        todo!("AuthService::get_oauth2_token not implemented")
    }

    pub fn apply_auth(&self, config: &AuthConfig, headers: &mut reqwest::header::HeaderMap) -> AppResult<()> {
        // TODO: Implement auth header application
        todo!("AuthService::apply_auth not implemented")
    }
}

impl Default for AuthService {
    fn default() -> Self {
        Self::new()
    }
}
