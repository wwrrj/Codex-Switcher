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

    for key in ["temperature", "top_p", "max_output_tokens", "tool_choice"] {
        if let Some(value) = input.get(key).cloned() {
            let out_key = match key {
                "max_output_tokens" => "max_tokens",
                other => other,
            };
            output[out_key] = value;
        }
    }
    if let Some(tools) = input.get("tools").cloned() {
        output["tools"] = normalize_tools(tools);
    }

    if let Some(reasoning) = input.get("reasoning").cloned() {
        output["reasoning"] = reasoning;
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
                        let mut message = item;
                        if let Some(content) = message.get("content").cloned() {
                            message["content"] = normalize_content(content);
                        }
                        return message;
                    }
                    if item.get("type").and_then(Value::as_str) == Some("message") {
                        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                        let content = item
                            .get("content")
                            .cloned()
                            .unwrap_or(Value::String(String::new()));
                        return json!({ "role": role, "content": normalize_content(content) });
                    }
                    if item.get("type").and_then(Value::as_str) == Some("function_call_output") {
                        let call_id = item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(Value::as_str)
                            .unwrap_or("tool_call");
                        let output = item
                            .get("output")
                            .or_else(|| item.get("content"))
                            .cloned()
                            .unwrap_or(Value::String(String::new()));
                        return json!({
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": normalize_content(output)
                        });
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
            let converted = parts
                .into_iter()
                .filter_map(normalize_content_part)
                .collect::<Vec<_>>();
            let has_non_text = converted
                .iter()
                .any(|part| part.get("type").and_then(Value::as_str) != Some("text"));
            if has_non_text {
                Value::Array(converted)
            } else {
                Value::String(
                    converted
                        .iter()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n"),
                )
            }
        }
        other => Value::String(other.to_string()),
    }
}

fn normalize_content_part(part: Value) -> Option<Value> {
    let part_type = part.get("type").and_then(Value::as_str);
    if matches!(part_type, Some("input_image" | "image_url")) {
        let url = part
            .get("image_url")
            .and_then(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| value.get("url").and_then(Value::as_str).map(str::to_string))
            })
            .or_else(|| part.get("url").and_then(Value::as_str).map(str::to_string))?;
        return Some(json!({
            "type": "image_url",
            "image_url": { "url": url }
        }));
    }
    let text = part
        .get("text")
        .or_else(|| part.get("content"))
        .and_then(Value::as_str)?;
    Some(json!({ "type": "text", "text": text }))
}

fn normalize_tools(tools: Value) -> Value {
    let Value::Array(items) = tools else {
        return tools;
    };
    Value::Array(
        items
            .into_iter()
            .map(|tool| {
                if tool.get("type").and_then(Value::as_str) == Some("function")
                    && tool.get("function").is_none()
                {
                    return json!({
                        "type": "function",
                        "function": {
                            "name": tool.get("name").cloned().unwrap_or(Value::String("tool".to_string())),
                            "description": tool.get("description").cloned().unwrap_or(Value::String(String::new())),
                            "parameters": tool.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} }))
                        }
                    });
                }
                tool
            })
            .collect(),
    )
}

fn chat_tool_calls_to_responses_events(tool_calls: &Value) -> Vec<String> {
    let Some(items) = tool_calls.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|tool| {
            let id = tool
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("tool_call");
            let function = tool.get("function").cloned().unwrap_or(Value::Null);
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let arguments = function
                .get("arguments")
                .and_then(Value::as_str)
                .unwrap_or("");
            let event = json!({
                "type": "response.output_item.added",
                "item": {
                    "type": "function_call",
                    "id": id,
                    "call_id": id,
                    "name": name,
                    "arguments": arguments
                }
            });
            Some(format!(
                "event: response.output_item.added\ndata: {}\n\n",
                event
            ))
        })
        .collect()
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
    if let Some(reasoning) = choice
        .get("delta")
        .and_then(|v| v.get("reasoning_content").or_else(|| v.get("reasoning")))
        .and_then(Value::as_str)
    {
        let event = json!({
            "type": "response.reasoning_text.delta",
            "delta": reasoning
        });
        return Some(format!(
            "event: response.reasoning_text.delta\ndata: {}\n\n",
            event
        ));
    }
    if let Some(tool_calls) = choice.get("delta").and_then(|v| v.get("tool_calls")) {
        let events = chat_tool_calls_to_responses_events(tool_calls).join("");
        if !events.is_empty() {
            return Some(events);
        }
    }
    if choice.get("finish_reason").is_some() {
        return Some(
            "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n".to_string(),
        );
    }
    None
}

pub fn chat_completion_response_to_responses(value: Value) -> Value {
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("resp_proxy");
    let model = value
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let created_at = value
        .get("created")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    let mut output = Vec::new();

    if let Some(choice) = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|v| v.first())
    {
        if let Some(message) = choice.get("message") {
            if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
                for tool in tool_calls {
                    let call_id = tool
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("tool_call");
                    let function = tool.get("function").cloned().unwrap_or(Value::Null);
                    output.push(json!({
                        "type": "function_call",
                        "id": call_id,
                        "call_id": call_id,
                        "name": function.get("name").and_then(Value::as_str).unwrap_or("tool"),
                        "arguments": function.get("arguments").and_then(Value::as_str).unwrap_or("")
                    }));
                }
            }
            let content = message
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !content.is_empty() {
                output.push(json!({
                    "type": "message",
                    "id": format!("msg_{id}"),
                    "role": "assistant",
                    "content": [{
                        "type": "output_text",
                        "text": content,
                        "annotations": []
                    }]
                }));
            }
        }
    }

    let mut response = json!({
        "id": id,
        "object": "response",
        "created_at": created_at,
        "status": "completed",
        "model": model,
        "output": output
    });

    if let Some(usage) = value.get("usage") {
        response["usage"] = json!({
            "input_tokens": usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or_default(),
            "output_tokens": usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or_default(),
            "total_tokens": usage.get("total_tokens").and_then(Value::as_u64).unwrap_or_default()
        });
    }

    response
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

    #[test]
    fn preserves_reasoning_config_in_chat_request() {
        let input = json!({
            "model": "gpt-4.1",
            "input": "think",
            "reasoning": { "effort": "high" }
        });
        let out = responses_to_chat_completions(input, None);
        assert_eq!(out["reasoning"]["effort"], "high");
    }

    #[test]
    fn converts_response_tools_to_chat_function_tools() {
        let input = json!({
            "model": "gpt-4.1",
            "input": "hello",
            "tools": [{
                "type": "function",
                "name": "lookup",
                "description": "Lookup data",
                "parameters": { "type": "object", "properties": { "q": { "type": "string" } } }
            }]
        });
        let out = responses_to_chat_completions(input, None);
        assert_eq!(out["tools"][0]["type"], "function");
        assert_eq!(out["tools"][0]["function"]["name"], "lookup");
        assert_eq!(out["tools"][0]["function"]["parameters"]["type"], "object");
    }

    #[test]
    fn preserves_image_content_parts_for_chat_providers() {
        let input = json!({
            "model": "gpt-4.1",
            "input": [{
                "type": "message",
                "role": "user",
                "content": [
                    { "type": "input_text", "text": "describe" },
                    { "type": "input_image", "image_url": "data:image/png;base64,abc" }
                ]
            }]
        });
        let out = responses_to_chat_completions(input, None);
        assert_eq!(out["messages"][0]["content"][0]["type"], "text");
        assert_eq!(out["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            out["messages"][0]["content"][1]["image_url"]["url"],
            "data:image/png;base64,abc"
        );
    }

    #[test]
    fn converts_function_call_output_to_tool_message() {
        let input = json!({
            "model": "gpt-4.1",
            "input": [{
                "type": "function_call_output",
                "call_id": "call_1",
                "output": "done"
            }]
        });
        let out = responses_to_chat_completions(input, None);
        assert_eq!(out["messages"][0]["role"], "tool");
        assert_eq!(out["messages"][0]["tool_call_id"], "call_1");
        assert_eq!(out["messages"][0]["content"], "done");
    }

    #[test]
    fn converts_reasoning_stream_delta_to_responses_event() {
        let event = chat_completion_chunk_to_responses_sse(
            r#"data: {"choices":[{"delta":{"reasoning_content":"chain"}}]}"#,
        )
        .unwrap();
        assert!(event.contains("response.reasoning_text.delta"));
        assert!(event.contains("chain"));
    }

    #[test]
    fn converts_tool_call_stream_delta_to_responses_event() {
        let event = chat_completion_chunk_to_responses_sse(
            r#"data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"run","arguments":"{}"}}]}}]}"#,
        )
        .unwrap();
        assert!(event.contains("response.output_item.added"));
        assert!(event.contains("function_call"));
        assert!(event.contains("run"));
    }

    #[test]
    fn converts_chat_completion_response_to_responses_json() {
        let out = chat_completion_response_to_responses(json!({
            "id": "chatcmpl_1",
            "created": 1710000000,
            "model": "deepseek-chat",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "hello",
                    "tool_calls": [{
                        "id": "call_1",
                        "function": { "name": "run", "arguments": "{}" }
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {
                "prompt_tokens": 2,
                "completion_tokens": 3,
                "total_tokens": 5
            }
        }));
        assert_eq!(out["object"], "response");
        assert_eq!(out["model"], "deepseek-chat");
        assert_eq!(out["output"][0]["type"], "function_call");
        assert_eq!(out["output"][1]["content"][0]["text"], "hello");
        assert_eq!(out["usage"]["total_tokens"], 5);
    }

    #[test]
    fn maps_model_when_provider_has_override() {
        let mut map = std::collections::BTreeMap::new();
        map.insert("gpt-4.1".to_string(), "deepseek-chat".to_string());
        assert_eq!(mapped_model("gpt-4.1", &Some(map)), "deepseek-chat");
        assert_eq!(mapped_model("gpt-4.1-mini", &None), "gpt-4.1-mini");
    }
}
