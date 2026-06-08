use serde_json::Value;

#[allow(dead_code)]
const SECRET_KEYS: &[&str] = &[
    "api_key",
    "apikey",
    "authorization",
    "access_token",
    "id_token",
    "refresh_token",
    "token",
    "secret",
    "password",
];

pub fn mask_secret(raw: &str) -> String {
    let len = raw.chars().count();
    if len <= 8 {
        return "***".to_string();
    }
    let prefix: String = raw.chars().take(4).collect();
    let suffix: String = raw
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}...{suffix}")
}

pub fn sanitize_message(raw: &str) -> String {
    let mut out = raw.to_string();
    for marker in ["Bearer ", "sk-", "eyJ"] {
        if let Some(idx) = out.find(marker) {
            let end = out[idx..]
                .find(char::is_whitespace)
                .map(|pos| idx + pos)
                .unwrap_or(out.len());
            out.replace_range(idx..end, "[REDACTED]");
        }
    }
    out
}

#[allow(dead_code)]
pub fn redact_json(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                let key_l = key.to_lowercase();
                if SECRET_KEYS.iter().any(|needle| key_l.contains(needle)) {
                    if let Some(raw) = child.as_str() {
                        *child = Value::String(mask_secret(raw));
                    } else {
                        *child = Value::String("[REDACTED]".to_string());
                    }
                } else {
                    redact_json(child);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_json(item);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_secret_without_revealing_full_value() {
        assert_eq!(mask_secret("sk-1234567890abcdef"), "sk-1...cdef");
        assert_eq!(mask_secret("short"), "***");
    }

    #[test]
    fn redacts_nested_secret_keys() {
        let mut value = serde_json::json!({
            "tokens": {
                "access_token": "eyJabcdef123456789"
            },
            "safe": "visible"
        });
        redact_json(&mut value);
        assert_eq!(value["safe"], "visible");
        assert_ne!(value["tokens"]["access_token"], "eyJabcdef123456789");
    }
}
