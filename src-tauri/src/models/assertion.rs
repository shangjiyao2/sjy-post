use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assertion {
    #[serde(rename = "type")]
    pub assert_type: AssertionType,
    #[serde(default)]
    pub path: String,
    pub operator: AssertionOperator,
    #[serde(default)]
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssertionType {
    Status,
    ResponseTime,
    JsonPath,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssertionOperator {
    Eq,
    Neq,
    Gt,
    Lt,
    Gte,
    Lte,
    Contains,
    Exists,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertResult {
    pub assertion: Assertion,
    pub passed: bool,
    pub actual_value: String,
    pub message: String,
}
