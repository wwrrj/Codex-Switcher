use serde_json::{json, Value};

pub fn responses_to_chat_completions(mut input: Value, model_override: Option<&str>) -> Value {
    let model = model_override
        .map(str::to_string)
        .or_else(|| {
            input
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "gpt-4.1".to_string());
    let stream = input.get("stream").and_then(Value::as_bool).unwrap_or(true);
    let messages = normalize_messages(input.get_mut("input").cloned().unwrap_or(Value::Null));

    let mut output = json!({
        "model": model,
        "messages": messages,
        "stream": stream
    });

    for key in [
        "temperature",
        "top_p",
        "max_output_tokens",
        "tools",
        "tool_choice",
    ] {
        if let Some(value) = input.get(key).cloned() {
            let out_key = match key {
                "max_output_tokens" => "max_tokens",
                other => other,
            };
            output[out_key] = value;
        }
    }

    output
}

fn normalize_messages(input: Value) -> Value {
    match input {
        Value::String(text) => json!([{ "role": "user", "content": text }]),
        Value::Array(items) => {
            let messages: Vec<Value> = items
                .into_iter()
                .map(|item| {
                    if item.get("role").is_some() && item.get("content").is_some() {
                        return item;
                    }
                    if item.get("type").and_then(Value::as_str) == Some("message") {
                        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                        let content = item
                            .get("content")
                            .cloned()
                            .unwrap_or(Value::String(String::new()));
                        return json!({ "role": role, "content": normalize_content(content) });
                    }
                    json!({ "role": "user", "content": item.to_string() })
                })
                .collect();
            Value::Array(messages)
        }
        Value::Null => json!([]),
        other => json!([{ "role": "user", "content": other.to_string() }]),
    }
}

fn normalize_content(content: Value) -> Value {
    match content {
        Value::String(_) => content,
        Value::Array(parts) => {
            let text = parts
                .into_iter()
                .filter_map(|part| {
                    part.get("text")
                        .or_else(|| part.get("content"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n");
            Value::String(text)
        }
        other => Value::String(other.to_string()),
    }
}

pub fn chat_completion_chunk_to_responses_sse(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "data: [DONE]" || trimmed == "[DONE]" {
        return Some(
            "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n".to_string(),
        );
    }
    let payload = trimmed.strip_prefix("data: ").unwrap_or(trimmed);
    let value: Value = serde_json::from_str(payload).ok()?;
    let choice = value.get("choices")?.as_array()?.first()?;
    if let Some(delta) = choice
        .get("delta")
        .and_then(|v| v.get("content"))
        .and_then(Value::as_str)
    {
        let event = json!({
            "type": "response.output_text.delta",
            "delta": delta
        });
        return Some(format!(
            "event: response.output_text.delta\ndata: {}\n\n",
            event
        ));
    }
    if choice.get("finish_reason").is_some() {
        return Some(
            "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n".to_string(),
        );
    }
    None
}

pub fn synthetic_models_response(provider_name: &str, models: &[String]) -> Value {
    let data = models
        .iter()
        .map(|model| {
            json!({
                "id": model,
                "object": "model",
                "created": 0,
                "owned_by": provider_name
            })
        })
        .collect::<Vec<_>>();
    json!({
        "object": "list",
        "data": data
    })
}

pub fn mapped_model(raw: &str, map: &Option<std::collections::BTreeMap<String, String>>) -> String {
    map.as_ref()
        .and_then(|items| items.get(raw).cloned())
        .unwrap_or_else(|| raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_responses_input_to_chat_messages() {
        let input = json!({
            "model": "gpt-4.1",
            "input": "hello",
            "stream": true,
            "max_output_tokens": 100
        });
        let out = responses_to_chat_completions(input, Some("deepseek-chat"));
        assert_eq!(out["model"], "deepseek-chat");
        assert_eq!(out["messages"][0]["role"], "user");
        assert_eq!(out["max_tokens"], 100);
    }

    #[test]
    fn converts_chat_stream_delta_to_responses_event() {
        let event = chat_completion_chunk_to_responses_sse(
            r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#,
        )
        .unwrap();
        assert!(event.contains("response.output_text.delta"));
        assert!(event.contains("hello"));
    }
}
