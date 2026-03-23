use regex::Regex;
use std::collections::HashMap;

/// Replace {{variable}} placeholders with values from the environment
pub fn resolve(template: &str, variables: &HashMap<String, String>) -> String {
    let re = Regex::new(r"\{\{(\w+)\}\}").unwrap();
    re.replace_all(template, |caps: &regex::Captures| {
        let key = &caps[1];
        variables.get(key).cloned().unwrap_or_else(|| format!("{{{{{}}}}}", key))
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_variables() {
        let mut vars = HashMap::new();
        vars.insert("base_url".to_string(), "http://localhost:8080".to_string());
        vars.insert("id".to_string(), "42".to_string());

        let result = resolve("{{base_url}}/api/user/{{id}}", &vars);
        assert_eq!(result, "http://localhost:8080/api/user/42");
    }

    #[test]
    fn test_unresolved_variables() {
        let vars = HashMap::new();
        let result = resolve("{{base_url}}/api", &vars);
        assert_eq!(result, "{{base_url}}/api");
    }
}
