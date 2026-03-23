use crate::models::assertion::{AssertResult, Assertion};
use crate::models::response::HttpResponse;
use crate::services::assert_runner::AssertRunner;
use crate::utils::error::AppResult;

#[tauri::command]
pub fn run_assertions(assertions: Vec<Assertion>, response: HttpResponse) -> AppResult<Vec<AssertResult>> {
    let runner = AssertRunner::new();
    Ok(runner.run(&assertions, &response))
}
