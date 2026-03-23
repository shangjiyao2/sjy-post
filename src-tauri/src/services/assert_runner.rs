use crate::models::assertion::{AssertResult, Assertion, AssertionOperator, AssertionType};
use crate::models::response::HttpResponse;
use serde_json::Value;

pub struct AssertRunner;

impl AssertRunner {
    pub fn new() -> Self {
        Self
    }

    pub fn run(&self, assertions: &[Assertion], response: &HttpResponse) -> Vec<AssertResult> {
        assertions
            .iter()
            .map(|assertion| self.run_single(assertion, response))
            .collect()
    }

    fn run_single(&self, assertion: &Assertion, response: &HttpResponse) -> AssertResult {
        match assertion.assert_type {
            AssertionType::Status => self.check_status(assertion, response),
            AssertionType::ResponseTime => self.check_response_time(assertion, response),
            AssertionType::JsonPath => self.check_json_path(assertion, response),
        }
    }

    fn check_status(&self, assertion: &Assertion, response: &HttpResponse) -> AssertResult {
        let actual = response.status as i64;
        let expected = assertion.value.as_i64().unwrap_or(0);

        let (passed, message) = self.compare_numbers(actual, expected, &assertion.operator);

        AssertResult {
            assertion: assertion.clone(),
            passed,
            actual_value: actual.to_string(),
            message,
        }
    }

    fn check_response_time(&self, assertion: &Assertion, response: &HttpResponse) -> AssertResult {
        let actual = response.time_ms as i64;
        let expected = assertion.value.as_i64().unwrap_or(0);

        let (passed, message) = self.compare_numbers(actual, expected, &assertion.operator);

        AssertResult {
            assertion: assertion.clone(),
            passed,
            actual_value: format!("{}ms", actual),
            message,
        }
    }

    fn check_json_path(&self, assertion: &Assertion, response: &HttpResponse) -> AssertResult {
        let json_result: Result<Value, _> = serde_json::from_str(&response.body);

        match json_result {
            Ok(json) => {
                let actual_value = self.extract_json_path(&json, &assertion.path);

                match actual_value {
                    Some(value) => {
                        let (passed, message) =
                            self.compare_values(&value, &assertion.value, &assertion.operator);

                        AssertResult {
                            assertion: assertion.clone(),
                            passed,
                            actual_value: value.to_string(),
                            message,
                        }
                    }
                    None => {
                        let passed = matches!(assertion.operator, AssertionOperator::Exists)
                            && assertion.value == Value::Bool(false);

                        AssertResult {
                            assertion: assertion.clone(),
                            passed,
                            actual_value: "undefined".to_string(),
                            message: if passed {
                                "Path does not exist as expected".to_string()
                            } else {
                                format!("Path '{}' not found in response", assertion.path)
                            },
                        }
                    }
                }
            }
            Err(e) => AssertResult {
                assertion: assertion.clone(),
                passed: false,
                actual_value: String::new(),
                message: format!("Failed to parse response as JSON: {}", e),
            },
        }
    }

    fn extract_json_path(&self, json: &Value, path: &str) -> Option<Value> {
        let path = path.trim_start_matches("$.");
        let path = path.trim_start_matches('$');

        let mut current = json.clone();

        for part in path.split('.') {
            if part.is_empty() {
                continue;
            }

            if let Some(bracket_pos) = part.find('[') {
                let key = &part[..bracket_pos];
                let index_str = &part[bracket_pos + 1..part.len() - 1];

                if !key.is_empty() {
                    current = current.get(key)?.clone();
                }

                if let Ok(index) = index_str.parse::<usize>() {
                    current = current.get(index)?.clone();
                } else {
                    return None;
                }
            } else {
                current = current.get(part)?.clone();
            }
        }

        Some(current)
    }

    fn compare_numbers(&self, actual: i64, expected: i64, operator: &AssertionOperator) -> (bool, String) {
        let passed = match operator {
            AssertionOperator::Eq => actual == expected,
            AssertionOperator::Neq => actual != expected,
            AssertionOperator::Gt => actual > expected,
            AssertionOperator::Lt => actual < expected,
            AssertionOperator::Gte => actual >= expected,
            AssertionOperator::Lte => actual <= expected,
            _ => false,
        };

        let op_str = match operator {
            AssertionOperator::Eq => "==",
            AssertionOperator::Neq => "!=",
            AssertionOperator::Gt => ">",
            AssertionOperator::Lt => "<",
            AssertionOperator::Gte => ">=",
            AssertionOperator::Lte => "<=",
            _ => "?",
        };

        let message = if passed {
            format!("{} {} {} - passed", actual, op_str, expected)
        } else {
            format!("Expected {} {} {}, got {}", actual, op_str, expected, actual)
        };

        (passed, message)
    }

    fn compare_values(
        &self,
        actual: &Value,
        expected: &Value,
        operator: &AssertionOperator,
    ) -> (bool, String) {
        match operator {
            AssertionOperator::Eq => {
                let passed = actual == expected;
                let message = if passed {
                    format!("{} == {} - passed", actual, expected)
                } else {
                    format!("Expected {}, got {}", expected, actual)
                };
                (passed, message)
            }
            AssertionOperator::Neq => {
                let passed = actual != expected;
                let message = if passed {
                    format!("{} != {} - passed", actual, expected)
                } else {
                    format!("Expected not {}, got {}", expected, actual)
                };
                (passed, message)
            }
            AssertionOperator::Contains => {
                let actual_string = actual.to_string();
                let expected_string = expected.to_string();
                let actual_str = actual.as_str().unwrap_or(&actual_string);
                let expected_str = expected.as_str().unwrap_or(&expected_string);
                let passed = actual_str.contains(expected_str);
                let message = if passed {
                    format!("'{}' contains '{}' - passed", actual_str, expected_str)
                } else {
                    format!("'{}' does not contain '{}'", actual_str, expected_str)
                };
                (passed, message)
            }
            AssertionOperator::Exists => {
                let should_exist = expected.as_bool().unwrap_or(true);
                let passed = should_exist;
                let message = if passed {
                    "Path exists - passed".to_string()
                } else {
                    "Path exists but expected not to exist".to_string()
                };
                (passed, message)
            }
            AssertionOperator::Gt | AssertionOperator::Lt | AssertionOperator::Gte | AssertionOperator::Lte => {
                let actual_num = value_to_f64(actual);
                let expected_num = value_to_f64(expected);

                match (actual_num, expected_num) {
                    (Some(a), Some(e)) => {
                        let passed = match operator {
                            AssertionOperator::Gt => a > e,
                            AssertionOperator::Lt => a < e,
                            AssertionOperator::Gte => a >= e,
                            AssertionOperator::Lte => a <= e,
                            _ => false,
                        };
                        let op_str = match operator {
                            AssertionOperator::Gt => ">",
                            AssertionOperator::Lt => "<",
                            AssertionOperator::Gte => ">=",
                            AssertionOperator::Lte => "<=",
                            _ => "?",
                        };
                        let message = if passed {
                            format!("{} {} {} - passed", a, op_str, e)
                        } else {
                            format!("Expected {} {} {}", a, op_str, e)
                        };
                        (passed, message)
                    }
                    _ => (false, "Cannot compare non-numeric values".to_string()),
                }
            }
        }
    }
}

fn value_to_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

impl Default for AssertRunner {
    fn default() -> Self {
        Self::new()
    }
}
