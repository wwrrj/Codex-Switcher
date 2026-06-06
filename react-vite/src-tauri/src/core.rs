use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Local, NaiveDate, Utc};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::models::*;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Path helpers ──

pub fn codex_home(custom: Option<&str>) -> Result<PathBuf> {
    if let Some(p) = custom {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
        return Err(anyhow::anyhow!("自定义路径不存在: {}", p));
    }
    let home = dirs::home_dir().context("无法检测用户主目录")?;
    Ok(home.join(".codex"))
}

fn auth_path(home: &Path) -> PathBuf {
    home.join("auth.json")
}
fn accounts_dir(home: &Path) -> PathBuf {
    home.join("accounts")
}
fn backup_dir(home: &Path) -> PathBuf {
    home.join("backups")
}
fn config_dir(home: &Path) -> PathBuf {
    home.join("config")
}
fn config_file(home: &Path) -> PathBuf {
    config_dir(home).join("settings.json")
}
fn priority_file(home: &Path) -> PathBuf {
    config_dir(home).join("priorities.json")
}
fn switch_history_file(home: &Path) -> PathBuf {
    config_dir(home).join("switch_history.json")
}
fn sessions_dir(home: &Path) -> PathBuf {
    home.join("sessions")
}
fn archived_sessions_dir(home: &Path) -> PathBuf {
    home.join("archived_sessions")
}

// ── File utilities ──

fn sha256_prefix(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path).context("读取文件失败")?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Ok(format!("{:x}", h.finalize())[..8].to_string())
}

fn file_size(path: &Path) -> Result<u64> {
    Ok(std::fs::metadata(path).context("获取文件大小失败")?.len())
}

fn read_json(path: &Path) -> Result<Value> {
    let s = std::fs::read_to_string(path).context("读取 JSON 失败")?;
    Ok(serde_json::from_str(&s).context("解析 JSON 失败")?)
}

fn write_json(path: &Path, val: &Value) -> Result<()> {
    let s = serde_json::to_string_pretty(val)?;
    std::fs::write(path, s).context("写入 JSON 失败")?;
    Ok(())
}

fn ensure_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

fn jwt_expires_at(token: &str) -> Option<i64> {
    decode_jwt_payload(token)?.get("exp")?.as_i64()
}

fn token_info(kind: &str, token: Option<&str>) -> AuthTokenInfo {
    let Some(token) = token else {
        return AuthTokenInfo {
            kind: kind.to_string(),
            present: false,
            expires_at: None,
            status: "missing".to_string(),
        };
    };
    let Some(exp) = jwt_expires_at(token) else {
        return AuthTokenInfo {
            kind: kind.to_string(),
            present: true,
            expires_at: None,
            status: "no_expiry_claim".to_string(),
        };
    };
    let remaining = exp - Utc::now().timestamp();
    let status = if remaining <= 0 {
        "expired"
    } else if remaining <= 24 * 60 * 60 {
        "expiring_soon"
    } else {
        "valid"
    };
    AuthTokenInfo {
        kind: kind.to_string(),
        present: true,
        expires_at: chrono::DateTime::<Utc>::from_timestamp(exp, 0).map(|dt| dt.to_rfc3339()),
        status: status.to_string(),
    }
}

fn auth_token_infos(auth_json: &Value) -> Vec<AuthTokenInfo> {
    let access_token = string_at_path(auth_json, &["tokens", "access_token"])
        .or_else(|| string_at_path(auth_json, &["access_token"]));
    let id_token = string_at_path(auth_json, &["tokens", "id_token"])
        .or_else(|| string_at_path(auth_json, &["id_token"]))
        .or_else(|| string_at_path(auth_json, &["idToken"]));
    let refresh_token = string_at_path(auth_json, &["tokens", "refresh_token"])
        .or_else(|| string_at_path(auth_json, &["refresh_token"]));

    vec![
        token_info("access_token", access_token),
        token_info("id_token", id_token),
        token_info("refresh_token", refresh_token),
    ]
}

fn account_health(auth_file: &Path) -> (AccountHealth, Option<String>, Vec<AuthTokenInfo>) {
    let auth_json = match read_json(auth_file) {
        Ok(value) => value,
        Err(error) => return (AccountHealth::Invalid, Some(error.to_string()), Vec::new()),
    };
    let tokens = auth_token_infos(&auth_json);
    let has_any_token = tokens.iter().any(|token| token.present);
    if !has_any_token {
        return (
            AccountHealth::Invalid,
            Some("认证文件中未找到 access_token、id_token 或 refresh_token".to_string()),
            tokens,
        );
    }

    let has_refresh_token = tokens
        .iter()
        .any(|token| token.kind == "refresh_token" && token.present);
    let access = tokens.iter().find(|token| token.kind == "access_token");
    let id = tokens.iter().find(|token| token.kind == "id_token");

    let health = match access.map(|token| token.status.as_str()) {
        Some("expired") if !has_refresh_token => AccountHealth::Expired,
        Some("expired") => AccountHealth::ExpiringSoon,
        Some("expiring_soon") => AccountHealth::ExpiringSoon,
        _ => AccountHealth::Healthy,
    };

    let message = match access.map(|token| token.status.as_str()) {
        Some("expired") if has_refresh_token => {
            Some("Access Token 已过期，但已保存 Refresh Token，可由 Codex 自动续期".to_string())
        }
        Some("expired") => Some("Access Token 已过期，且未找到 Refresh Token".to_string()),
        Some("expiring_soon") => Some("Access Token 将在 24 小时内过期".to_string()),
        _ if id.map(|token| token.status.as_str()) == Some("expired") && has_refresh_token => {
            Some("ID Token 是身份/订阅声明，过期不代表 Codex 不可用；当前请求以 Access Token 和 Refresh Token 为准".to_string())
        }
        _ => Some("Token 结构有效，过期时间见下方明细".to_string()),
    };

    (health, message, tokens)
}

fn append_switch_history(home: &Path, entry: SwitchHistoryEntry) -> Result<()> {
    ensure_dir(&config_dir(home))?;
    let mut entries = get_switch_history(home).unwrap_or_default();
    entries.insert(0, entry);
    entries.truncate(100);
    std::fs::write(
        switch_history_file(home),
        serde_json::to_string_pretty(&entries)?,
    )?;
    Ok(())
}

pub fn get_switch_history(home: &Path) -> Result<Vec<SwitchHistoryEntry>> {
    let path = switch_history_file(home);
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn display_name_for_plan(plan: &SubscriptionPlan) -> String {
    match plan {
        SubscriptionPlan::Free => "Free",
        SubscriptionPlan::Go => "Go",
        SubscriptionPlan::Plus => "Plus",
        SubscriptionPlan::Pro => "Pro",
        SubscriptionPlan::ProLite => "Pro Lite",
        SubscriptionPlan::Team => "Team",
        SubscriptionPlan::Business => "Business",
        SubscriptionPlan::Enterprise => "Enterprise",
        SubscriptionPlan::Edu => "Edu",
        SubscriptionPlan::ApiKey => "API Key",
        SubscriptionPlan::Unknown => "Unknown",
    }
    .to_string()
}

fn manual_subscription(plan: SubscriptionPlan) -> SubscriptionInfo {
    SubscriptionInfo {
        display_name: display_name_for_plan(&plan),
        plan,
        raw_plan: None,
        source: SubscriptionSource::Manual,
        confidence: Confidence::High,
        is_workspace_account: None,
        warning: None,
    }
}

fn plan_from_raw(raw: &str) -> Option<SubscriptionPlan> {
    let normalized = raw
        .trim()
        .to_lowercase()
        .replace('-', "_")
        .replace(' ', "_");
    match normalized.as_str() {
        "free" => Some(SubscriptionPlan::Free),
        "go" | "chatgpt_go" => Some(SubscriptionPlan::Go),
        "plus" | "chatgpt_plus" => Some(SubscriptionPlan::Plus),
        "pro" | "chatgpt_pro" => Some(SubscriptionPlan::Pro),
        "pro_lite" | "prolite" | "chatgpt_pro_lite" => Some(SubscriptionPlan::ProLite),
        "team" | "teams" | "chatgpt_team" => Some(SubscriptionPlan::Team),
        "business" | "chatgpt_business" => Some(SubscriptionPlan::Business),
        "enterprise" | "chatgpt_enterprise" => Some(SubscriptionPlan::Enterprise),
        "edu" | "education" | "chatgpt_edu" => Some(SubscriptionPlan::Edu),
        "api_key" | "apikey" | "api" => Some(SubscriptionPlan::ApiKey),
        "unknown" => Some(SubscriptionPlan::Unknown),
        _ => None,
    }
}

fn collect_string_fields(value: &Value, key_hint: Option<&str>, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                collect_string_fields(v, Some(k), out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_string_fields(item, key_hint, out);
            }
        }
        Value::String(s) => {
            out.push((key_hint.unwrap_or("").to_string(), s.clone()));
        }
        _ => {}
    }
}

fn find_token(value: &Value) -> Option<String> {
    let mut fields = Vec::new();
    collect_string_fields(value, None, &mut fields);
    fields.into_iter().find_map(|(key, val)| {
        let key = key.to_lowercase();
        let likely_id_token = key == "idtoken"
            || key == "id_token"
            || key.ends_with("idtoken")
            || key.ends_with("id_token");
        if likely_id_token && val.split('.').count() == 3 {
            Some(val)
        } else {
            None
        }
    })
}

fn decode_jwt_payload(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn find_email_in_value(value: &Value) -> Option<String> {
    string_at_path(value, &["email"])
        .or_else(|| string_at_path(value, &["profile", "email"]))
        .or_else(|| string_at_path(value, &["https://api.openai.com/profile", "email"]))
        .map(String::from)
        .or_else(|| {
            let mut fields = Vec::new();
            collect_string_fields(value, None, &mut fields);
            fields.into_iter().find_map(|(key, val)| {
                let key_l = key.to_lowercase();
                if key_l.contains("email") && val.contains('@') {
                    Some(val)
                } else {
                    None
                }
            })
        })
}

pub fn detect_email_from_auth_file(auth_file: &Path) -> Result<Option<String>> {
    let auth_json = read_json(auth_file)?;

    if let Some(email) = find_email_in_value(&auth_json) {
        return Ok(Some(email));
    }

    if let Some(token) = find_token(&auth_json) {
        if let Some(payload) = decode_jwt_payload(&token) {
            return Ok(find_email_in_value(&payload));
        }
    }

    Ok(None)
}

pub fn detect_email_for_current_auth(home: &Path) -> Result<Option<String>> {
    let ap = auth_path(home);
    if !ap.exists() {
        return Err(anyhow::anyhow!("auth.json 不存在"));
    }
    detect_email_from_auth_file(&ap)
}

fn infer_subscription_from_value(
    value: &Value,
    source: SubscriptionSource,
) -> Option<SubscriptionInfo> {
    let mut fields = Vec::new();
    collect_string_fields(value, None, &mut fields);

    for (key, raw) in &fields {
        let key_l = key.to_lowercase();
        if key_l.contains("authmode") || key_l.contains("auth_mode") {
            if let Some(plan) = plan_from_raw(raw) {
                return Some(SubscriptionInfo {
                    display_name: display_name_for_plan(&plan),
                    plan,
                    raw_plan: Some(raw.clone()),
                    source: SubscriptionSource::AuthMode,
                    confidence: Confidence::High,
                    is_workspace_account: None,
                    warning: None,
                });
            }
        }
    }

    let plan_keys = [
        "plan",
        "subscription",
        "tier",
        "sku",
        "license",
        "account_type",
    ];
    for (key, raw) in &fields {
        let key_l = key.to_lowercase();
        if plan_keys.iter().any(|needle| key_l.contains(needle)) {
            if let Some(plan) = plan_from_raw(raw) {
                let workspace = matches!(
                    plan,
                    SubscriptionPlan::Team
                        | SubscriptionPlan::Business
                        | SubscriptionPlan::Enterprise
                        | SubscriptionPlan::Edu
                );
                return Some(SubscriptionInfo {
                    display_name: display_name_for_plan(&plan),
                    plan,
                    raw_plan: Some(raw.clone()),
                    source: source.clone(),
                    confidence: Confidence::Medium,
                    is_workspace_account: Some(workspace),
                    warning: None,
                });
            }
        }
    }

    None
}

pub fn detect_subscription_from_auth_file(auth_file: &Path) -> Result<SubscriptionInfo> {
    let auth_json = read_json(auth_file)?;

    if let Some(info) = infer_subscription_from_value(&auth_json, SubscriptionSource::AgentIdentity)
    {
        return Ok(info);
    }

    if let Some(token) = find_token(&auth_json) {
        if let Some(payload) = decode_jwt_payload(&token) {
            if let Some(info) = infer_subscription_from_value(&payload, SubscriptionSource::IdToken)
            {
                return Ok(info);
            }
        }
    }

    Ok(SubscriptionInfo {
        plan: SubscriptionPlan::Unknown,
        display_name: "Unknown".to_string(),
        raw_plan: None,
        source: SubscriptionSource::Unknown,
        confidence: Confidence::Low,
        is_workspace_account: None,
        warning: Some("未在 auth.json 或 idToken claims 中找到可识别的订阅字段".to_string()),
    })
}

fn read_account_meta_file(path: &Path) -> AccountMetaFile {
    if !path.exists() {
        return AccountMetaFile::default();
    }
    read_json(path)
        .and_then(|v| serde_json::from_value(v).context("解析账号元数据失败"))
        .unwrap_or_default()
}

fn write_account_meta_file(path: &Path, meta: &AccountMetaFile) -> Result<()> {
    let val = serde_json::to_value(meta)?;
    write_json(path, &val)
}

#[derive(Debug, Clone)]
struct ChatGptAuthCredentials {
    access_token: String,
    account_id: Option<String>,
    fedramp: bool,
}

fn string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

fn chatgpt_auth_claims(auth_json: &Value) -> Option<Value> {
    let id_token = string_at_path(auth_json, &["tokens", "id_token"])
        .or_else(|| string_at_path(auth_json, &["id_token"]))
        .map(String::from)
        .or_else(|| find_token(auth_json))?;
    decode_jwt_payload(&id_token)
        .and_then(|payload| payload.get("https://api.openai.com/auth").cloned())
}

fn read_chatgpt_auth_credentials(auth_file: &Path) -> Result<ChatGptAuthCredentials> {
    let auth_json = read_json(auth_file)?;
    if string_at_path(&auth_json, &["OPENAI_API_KEY"]).is_some() {
        return Err(anyhow::anyhow!("API Key 登录不支持 Codex ChatGPT 用量查询"));
    }

    let access_token = string_at_path(&auth_json, &["tokens", "access_token"])
        .or_else(|| string_at_path(&auth_json, &["access_token"]))
        .ok_or_else(|| anyhow::anyhow!("auth.json 缺少 tokens.access_token"))?
        .to_string();

    let claims = chatgpt_auth_claims(&auth_json);
    let account_id = string_at_path(&auth_json, &["tokens", "account_id"])
        .map(String::from)
        .or_else(|| {
            claims
                .as_ref()
                .and_then(|v| v.get("chatgpt_account_id"))
                .and_then(|v| v.as_str())
                .map(String::from)
        });
    let fedramp = claims
        .as_ref()
        .and_then(|v| v.get("chatgpt_account_is_fedramp"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(ChatGptAuthCredentials {
        access_token,
        account_id,
        fedramp,
    })
}

fn read_chatgpt_base_url(home: &Path) -> String {
    let config_toml = home.join("config.toml");
    let Ok(contents) = std::fs::read_to_string(config_toml) else {
        return "https://chatgpt.com/backend-api".to_string();
    };

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("chatgpt_base_url") {
            if let Some((_, raw)) = trimmed.split_once('=') {
                let value = raw.trim().trim_matches('"').trim_matches('\'').trim();
                if !value.is_empty() {
                    return normalize_chatgpt_base_url(value);
                }
            }
        }
    }
    "https://chatgpt.com/backend-api".to_string()
}

fn normalize_chatgpt_base_url(raw: &str) -> String {
    let trimmed = raw.trim_end_matches('/').to_string();
    if (trimmed.starts_with("https://chatgpt.com")
        || trimmed.starts_with("https://chat.openai.com"))
        && !trimmed.contains("/backend-api")
    {
        format!("{trimmed}/backend-api")
    } else {
        trimmed
    }
}

fn usage_url_from_base(base_url: &str) -> String {
    if base_url.contains("/backend-api") {
        format!("{}/wham/usage", base_url.trim_end_matches('/'))
    } else {
        format!("{}/api/codex/usage", base_url.trim_end_matches('/'))
    }
}

fn plan_subscription_from_raw(raw: &str) -> SubscriptionInfo {
    let plan = plan_from_raw(raw).unwrap_or(SubscriptionPlan::Unknown);
    let is_workspace = matches!(
        plan,
        SubscriptionPlan::Team
            | SubscriptionPlan::Business
            | SubscriptionPlan::Enterprise
            | SubscriptionPlan::Edu
    );
    SubscriptionInfo {
        display_name: display_name_for_plan(&plan),
        plan,
        raw_plan: Some(raw.to_string()),
        source: SubscriptionSource::UsageApi,
        confidence: Confidence::High,
        is_workspace_account: Some(is_workspace),
        warning: None,
    }
}

fn epoch_seconds_to_rfc3339(seconds: i64) -> Option<String> {
    chrono::DateTime::<Utc>::from_timestamp(seconds, 0).map(|d| d.to_rfc3339())
}

fn usage_window_from_snapshot(
    kind: UsageWindowKind,
    snapshot: Option<RateLimitWindowSnapshot>,
) -> Option<UsageWindow> {
    let snapshot = snapshot?;
    let percentage = snapshot.used_percent;
    Some(UsageWindow {
        window: kind,
        used: None,
        limit: None,
        remaining: None,
        reset_at: snapshot.reset_at.and_then(epoch_seconds_to_rfc3339),
        percentage,
        unit: UsageUnit::Unknown,
    })
}

fn usage_info_from_payload(
    account_name: &str,
    payload: CodexUsageApiResponse,
    subscription: Option<SubscriptionInfo>,
) -> CodexUsageInfo {
    let mut windows = Vec::new();
    if let Some(rate_limit) = payload.rate_limit {
        if let Some(window) =
            usage_window_from_snapshot(UsageWindowKind::FiveHours, rate_limit.primary_window)
        {
            windows.push(window);
        }
        if let Some(window) =
            usage_window_from_snapshot(UsageWindowKind::SevenDays, rate_limit.secondary_window)
        {
            windows.push(window);
        }
    }

    let plan = payload.plan_type;
    let subscription = subscription.or_else(|| plan.as_deref().map(plan_subscription_from_raw));
    CodexUsageInfo {
        account_name: account_name.to_string(),
        fetched_at: Utc::now().to_rfc3339(),
        plan,
        windows,
        raw_source: UsageRawSource::OfficialApi,
        warning: None,
        subscription,
    }
}

pub async fn fetch_usage_from_auth_file(
    home: &Path,
    auth_file: &Path,
    account_name: &str,
) -> Result<CodexUsageInfo> {
    let credentials = read_chatgpt_auth_credentials(auth_file)?;
    let base_url = read_chatgpt_base_url(home);
    let url = usage_url_from_base(&base_url);

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("codex-cli"));
    let auth_header = HeaderValue::from_str(&format!("Bearer {}", credentials.access_token))
        .context("构造 Authorization header 失败")?;
    headers.insert(AUTHORIZATION, auth_header);
    if let Some(account_id) = credentials.account_id {
        headers.insert(
            "ChatGPT-Account-Id",
            HeaderValue::from_str(&account_id).context("构造 ChatGPT-Account-Id header 失败")?,
        );
    }
    if credentials.fedramp {
        headers.insert("X-OpenAI-Fedramp", HeaderValue::from_static("true"));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .with_context(|| format!("请求 Codex 用量接口失败: {url}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow::anyhow!("Codex 用量接口返回 {}: {}", status, body));
    }

    let payload: CodexUsageApiResponse =
        serde_json::from_str(&body).with_context(|| format!("解析 Codex 用量响应失败: {body}"))?;
    let subscription = detect_subscription_from_auth_file(auth_file).ok();
    Ok(usage_info_from_payload(account_name, payload, subscription))
}

// ── Local token usage ──

#[derive(Debug, Deserialize)]
struct RolloutLine {
    timestamp: Option<String>,
    payload: Option<RolloutPayload>,
}

#[derive(Debug, Deserialize)]
struct RolloutPayload {
    #[serde(rename = "type")]
    payload_type: Option<String>,
    info: Option<RolloutTokenUsageInfo>,
}

#[derive(Debug, Deserialize)]
struct RolloutTokenUsageInfo {
    total_token_usage: TokenUsageBreakdown,
    last_token_usage: TokenUsageBreakdown,
}

fn add_token_usage(target: &mut TokenUsageBreakdown, usage: &TokenUsageBreakdown) {
    target.input_tokens += usage.input_tokens.max(0);
    target.cached_input_tokens += usage.cached_input_tokens.max(0);
    target.output_tokens += usage.output_tokens.max(0);
    target.reasoning_output_tokens += usage.reasoning_output_tokens.max(0);
    target.total_tokens += usage.total_tokens.max(0);
}

fn max_token_usage(target: &mut TokenUsageBreakdown, usage: &TokenUsageBreakdown) {
    target.input_tokens = target.input_tokens.max(usage.input_tokens);
    target.cached_input_tokens = target.cached_input_tokens.max(usage.cached_input_tokens);
    target.output_tokens = target.output_tokens.max(usage.output_tokens);
    target.reasoning_output_tokens = target
        .reasoning_output_tokens
        .max(usage.reasoning_output_tokens);
    target.total_tokens = target.total_tokens.max(usage.total_tokens);
}

fn date_key_from_timestamp(timestamp: Option<&str>, path: &Path) -> Option<String> {
    if let Some(raw) = timestamp {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
            return Some(dt.with_timezone(&Local).date_naive().to_string());
        }
        for fmt in ["%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"] {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(raw, fmt) {
                return Some(dt.date().to_string());
            }
        }
        if let Some(prefix) = raw.get(0..10) {
            let normalized = prefix.replace('/', "-");
            if NaiveDate::parse_from_str(&normalized, "%Y-%m-%d").is_ok() {
                return Some(normalized);
            }
        }
    }

    let parts: Vec<String> = path
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect();
    for window in parts.windows(3) {
        if window[0].len() == 4 && window[1].len() == 2 && window[2].len() == 2 {
            let candidate = format!("{}-{}-{}", window[0], window[1], window[2]);
            if NaiveDate::parse_from_str(&candidate, "%Y-%m-%d").is_ok() {
                return Some(candidate);
            }
        }
    }
    None
}

fn collect_rollout_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in
        std::fs::read_dir(dir).with_context(|| format!("读取目录失败: {}", dir.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_rollout_files(&path, files)?;
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
    Ok(())
}

fn scan_token_usage_file(
    path: &Path,
    by_day: &mut BTreeMap<String, TokenUsageDay>,
    total: &mut TokenUsageBreakdown,
    today: &mut TokenUsageBreakdown,
    max_session_total: &mut TokenUsageBreakdown,
    today_key: &str,
) -> Result<u32> {
    let file = File::open(path).with_context(|| format!("打开会话文件失败: {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut events = 0;

    for line in reader.lines() {
        let line = line?;
        if !line.contains("\"token_count\"") || !line.contains("\"last_token_usage\"") {
            continue;
        }
        let Ok(parsed) = serde_json::from_str::<RolloutLine>(&line) else {
            continue;
        };
        let Some(payload) = parsed.payload else {
            continue;
        };
        if payload.payload_type.as_deref() != Some("token_count") {
            continue;
        }
        let Some(info) = payload.info else {
            continue;
        };
        if info.last_token_usage.total_tokens <= 0 && info.total_token_usage.total_tokens <= 0 {
            continue;
        }

        let increment = if info.last_token_usage.total_tokens > 0 {
            info.last_token_usage
        } else {
            info.total_token_usage.clone()
        };
        let date = date_key_from_timestamp(parsed.timestamp.as_deref(), path)
            .unwrap_or_else(|| today_key.to_string());

        add_token_usage(total, &increment);
        if date == today_key {
            add_token_usage(today, &increment);
        }
        max_token_usage(max_session_total, &info.total_token_usage);

        let entry = by_day.entry(date.clone()).or_insert_with(|| TokenUsageDay {
            date,
            usage: TokenUsageBreakdown::default(),
            turns: 0,
        });
        add_token_usage(&mut entry.usage, &increment);
        entry.turns += 1;
        events += 1;
    }

    Ok(events)
}

pub fn get_token_usage_summary(home: &Path) -> Result<TokenUsageSummary> {
    let mut files = Vec::new();
    collect_rollout_files(&sessions_dir(home), &mut files)?;
    collect_rollout_files(&archived_sessions_dir(home), &mut files)?;
    files.sort();

    let today_key = Local::now().date_naive().to_string();
    let mut by_day = BTreeMap::new();
    let mut total = TokenUsageBreakdown::default();
    let mut today = TokenUsageBreakdown::default();
    let mut max_session_total = TokenUsageBreakdown::default();
    let mut token_events = 0;
    let mut warnings = Vec::new();

    for file in &files {
        match scan_token_usage_file(
            file,
            &mut by_day,
            &mut total,
            &mut today,
            &mut max_session_total,
            &today_key,
        ) {
            Ok(events) => token_events += events,
            Err(err) => warnings.push(format!("{}: {}", file.display(), err)),
        }
    }

    Ok(TokenUsageSummary {
        fetched_at: Utc::now().to_rfc3339(),
        codex_home: home.display().to_string(),
        sessions_scanned: files.len() as u32,
        token_events,
        total,
        today,
        max_session_total,
        days: by_day.into_values().collect(),
        warning: if warnings.is_empty() {
            None
        } else {
            Some(format!("{} 个会话文件读取失败", warnings.len()))
        },
    })
}

// ── Backup ──

fn backup_auth(home: &Path, retention: u32) -> Result<PathBuf> {
    let src = auth_path(home);
    if !src.exists() {
        return Err(anyhow::anyhow!("auth.json 不存在"));
    }
    let bdir = backup_dir(home);
    ensure_dir(&bdir)?;
    let ts = Utc::now().format("%Y%m%d_%H%M%S");
    let dst = bdir.join(format!("auth_{}.json", ts));
    std::fs::copy(&src, &dst)?;
    // Clean old backups
    let mut backups: Vec<PathBuf> = std::fs::read_dir(&bdir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("auth_"))
        .map(|e| e.path())
        .collect();
    backups.sort();
    while backups.len() > retention as usize {
        let old = backups.remove(0);
        std::fs::remove_file(&old)?;
    }
    Ok(dst)
}

// ── Codex process lifecycle ──

fn close_codex_processes() {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/IM", "codex.exe", "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pkill")
            .args(["-x", "codex"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("pkill")
            .args(["-x", "Codex"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("pkill")
            .args(["-x", "codex"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(target_os = "windows")]
fn where_codex_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(output) = Command::new("where.exe")
        .arg("codex.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let path = PathBuf::from(line.trim());
                if path.exists() {
                    candidates.push(path);
                }
            }
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn windows_codex_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var("CODEX_EXECUTABLE") {
        candidates.push(PathBuf::from(path));
    }

    candidates.extend(where_codex_candidates());

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Microsoft")
                .join("WindowsApps")
                .join("codex.exe"),
        );
    }

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        let windows_apps = PathBuf::from(program_files).join("WindowsApps");
        if let Ok(entries) = std::fs::read_dir(windows_apps) {
            for entry in entries.filter_map(|entry| entry.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("OpenAI.Codex_") {
                    candidates.push(entry.path().join("app").join("resources").join("codex.exe"));
                }
            }
        }
    }

    candidates.sort();
    candidates.dedup();
    candidates
        .into_iter()
        .filter(|path| path.exists())
        .collect()
}

#[cfg(target_os = "windows")]
fn spawn_codex_executable(path: &Path) -> Result<()> {
    Command::new(path)
        .arg("app")
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("启动 Codex 失败: {}", path.display()))?;
    Ok(())
}

fn reopen_codex_app() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let candidates = windows_codex_candidates();
        let mut errors = Vec::new();
        for candidate in &candidates {
            match spawn_codex_executable(candidate) {
                Ok(()) => return Ok(()),
                Err(error) => errors.push(error.to_string()),
            }
        }

        if let Ok(()) = Command::new("codex")
            .arg("app")
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
        {
            return Ok(());
        }

        return Err(anyhow::anyhow!(
            "找不到可启动的 Codex。已尝试 where.exe、WindowsApps 和 CODEX_EXECUTABLE。{}",
            if errors.is_empty() {
                String::new()
            } else {
                format!("错误: {}", errors.join("; "))
            }
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("codex")
            .arg("app")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("启动 Codex 失败")?;
        Ok(())
    }
}

fn run_codex_logout() {
    let mut command = Command::new("codex");
    command
        .arg("logout")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let _ = command.status();
}

// ── Auth detection ──

pub fn detect_auth(home: &Path, names: &[String]) -> Result<CodexAuthStatus> {
    let ap = auth_path(home);
    let exists = ap.exists();
    let home_s = home.to_string_lossy().to_string();
    let ap_s = ap.to_string_lossy().to_string();

    if !exists {
        return Ok(CodexAuthStatus {
            codex_home: home_s,
            auth_path: ap_s,
            exists: false,
            matched_account: None,
            sha256_prefix: None,
            status: "missing".to_string(),
            warning: Some("auth.json 不存在".to_string()),
        });
    }

    let prefix = sha256_prefix(&ap)?;
    let adir = accounts_dir(home);
    let matched = names.iter().find(|n| {
        let acc_auth = adir.join(n).join("auth.json");
        acc_auth.exists() && sha256_prefix(&acc_auth).unwrap_or_default() == prefix
    });

    Ok(CodexAuthStatus {
        codex_home: home_s,
        auth_path: ap_s,
        exists: true,
        matched_account: matched.cloned(),
        sha256_prefix: Some(prefix),
        status: if matched.is_some() {
            "matched"
        } else {
            "unmatched"
        }
        .to_string(),
        warning: if matched.is_none() {
            Some("当前 auth.json 与已保存账号均不匹配".to_string())
        } else {
            None
        },
    })
}

// ── Account management ──

pub fn list_accounts(home: &Path) -> Result<Vec<AccountMeta>> {
    let adir = accounts_dir(home);
    ensure_dir(&adir)?;

    let ap = auth_path(home);
    let active_prefix = if ap.exists() {
        sha256_prefix(&ap).ok()
    } else {
        None
    };
    let priorities = load_priorities(home)?;

    let mut result = Vec::new();
    for entry in std::fs::read_dir(&adir)?.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        let acc_auth = entry.path().join("auth.json");
        if !acc_auth.exists() {
            continue;
        }

        let prefix = sha256_prefix(&acc_auth)?;
        let size = file_size(&acc_auth)?;
        let is_active = active_prefix.as_ref() == Some(&prefix);

        // Read meta.json
        let meta_path = entry.path().join("meta.json");
        let meta = read_account_meta_file(&meta_path);
        let note = meta.note;
        let created = meta.created_at;
        let updated = meta.updated_at;
        let manual_override = meta.manual_subscription_override;

        let priority = priorities.get(&name).copied();
        let subscription = manual_override
            .clone()
            .map(manual_subscription)
            .or_else(|| detect_subscription_from_auth_file(&acc_auth).ok());
        let (health, health_message, auth_tokens) = account_health(&acc_auth);

        result.push(AccountMeta {
            name,
            note,
            created_at: created,
            updated_at: updated,
            sha256_prefix: Some(prefix),
            size: Some(size),
            is_active: Some(is_active),
            priority,
            subscription,
            usage: None,
            last_usage_check_at: None,
            manual_subscription_override: manual_override,
            source: None,
            health,
            health_message,
            auth_tokens,
        });
    }

    result.sort_by(|a, b| {
        b.is_active
            .cmp(&a.is_active)
            .then_with(|| b.priority.cmp(&a.priority))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(result)
}

pub fn add_account(
    home: &Path,
    name: &str,
    note: Option<&str>,
    overwrite: bool,
) -> Result<AccountMeta> {
    let adir = accounts_dir(home);
    let acc_dir = adir.join(name);

    if acc_dir.exists() && !overwrite {
        return Err(anyhow::anyhow!("账号 '{}' 已存在", name));
    }
    if overwrite && acc_dir.exists() {
        backup_auth(home, 10)?;
    }

    ensure_dir(&acc_dir)?;
    let src = auth_path(home);
    let dst = acc_dir.join("auth.json");
    std::fs::copy(&src, &dst)?;

    let now = Utc::now().to_rfc3339();
    let meta = AccountMetaFile {
        name: name.to_string(),
        note: note.map(String::from),
        created_at: now.clone(),
        updated_at: now.clone(),
        priority: None,
        manual_subscription_override: None,
    };
    write_account_meta_file(&acc_dir.join("meta.json"), &meta)?;
    let subscription = detect_subscription_from_auth_file(&dst).ok();
    let (health, health_message, auth_tokens) = account_health(&dst);

    Ok(AccountMeta {
        name: name.to_string(),
        note: note.map(String::from),
        created_at: now.clone(),
        updated_at: now,
        sha256_prefix: Some(sha256_prefix(&dst)?),
        size: Some(file_size(&dst)?),
        is_active: Some(true),
        priority: None,
        subscription,
        usage: None,
        last_usage_check_at: None,
        manual_subscription_override: None,
        source: None,
        health,
        health_message,
        auth_tokens,
    })
}

pub fn prepare_new_account_login(home: &Path) -> Result<NewAccountLoginPreparation> {
    let accounts = list_accounts(home)?;
    let names: Vec<String> = accounts
        .iter()
        .map(|account| account.name.clone())
        .collect();
    let status = detect_auth(home, &names)?;
    let previous_account = status.matched_account.clone();

    if previous_account.is_some() {
        close_codex_processes();

        let ap = auth_path(home);
        if ap.exists() {
            let _ = backup_auth(home, 10);
        }

        run_codex_logout();

        if ap.exists() {
            std::fs::remove_file(&ap)
                .with_context(|| format!("删除旧 auth.json 失败: {}", ap.display()))?;
        }

        reopen_codex_app()?;
    } else if !status.exists {
        reopen_codex_app()?;
    }

    Ok(NewAccountLoginPreparation {
        did_logout: previous_account.is_some(),
        previous_account,
        auth_path: auth_path(home).display().to_string(),
    })
}

pub fn remove_account(home: &Path, name: &str, force: bool) -> Result<()> {
    let adir = accounts_dir(home);
    let acc_dir = adir.join(name);
    if !acc_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 不存在", name));
    }

    // Check if active
    let acc_auth = acc_dir.join("auth.json");
    let ap = auth_path(home);
    if ap.exists() && acc_auth.exists() {
        let active = sha256_prefix(&ap)?;
        let acc = sha256_prefix(&acc_auth)?;
        if active == acc && !force {
            return Err(anyhow::anyhow!("不能删除当前激活账号，请先切换"));
        }
    }

    std::fs::remove_dir_all(&acc_dir)?;
    Ok(())
}

pub fn rename_account(home: &Path, old: &str, new: &str) -> Result<()> {
    let adir = accounts_dir(home);
    let old_dir = adir.join(old);
    let new_dir = adir.join(new);
    if !old_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 不存在", old));
    }
    if new_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 已存在", new));
    }
    std::fs::rename(&old_dir, &new_dir)?;

    // Update meta.json
    let meta_path = new_dir.join("meta.json");
    if meta_path.exists() {
        let mut m = read_json(&meta_path)?;
        if let Some(map) = m.as_object_mut() {
            map.insert("name".to_string(), Value::String(new.to_string()));
            map.insert(
                "updatedAt".to_string(),
                Value::String(Utc::now().to_rfc3339()),
            );
        }
        write_json(&meta_path, &m)?;
    }
    Ok(())
}

pub fn switch_account(home: &Path, name: &str) -> Result<()> {
    let accounts = list_accounts(home)?;
    let from_account = accounts
        .iter()
        .find(|account| account.is_active == Some(true))
        .map(|account| account.name.clone());
    let result = switch_account_inner(home, name);
    let entry = SwitchHistoryEntry {
        id: format!("{}-{}", Utc::now().timestamp_millis(), name),
        switched_at: Utc::now().to_rfc3339(),
        from_account,
        to_account: name.to_string(),
        success: result.is_ok(),
        error: result.as_ref().err().map(ToString::to_string),
    };
    let _ = append_switch_history(home, entry);
    result
}

fn switch_account_inner(home: &Path, name: &str) -> Result<()> {
    let adir = accounts_dir(home);
    let acc_dir = adir.join(name);
    if !acc_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 不存在", name));
    }
    let acc_auth = acc_dir.join("auth.json");
    if !acc_auth.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 缺少 auth.json", name));
    }

    close_codex_processes();

    // Backup then swap while Codex is not holding auth.json.
    let ap = auth_path(home);
    if ap.exists() {
        backup_auth(home, 10)?;
    }
    std::fs::copy(&acc_auth, &ap)?;

    reopen_codex_app()?;
    Ok(())
}

// ── Priority ──

fn load_priorities(home: &Path) -> Result<std::collections::HashMap<String, bool>> {
    let pf = priority_file(home);
    if !pf.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let val = read_json(&pf)?;
    let empty_map = serde_json::Map::new();
    let map = val.as_object().unwrap_or(&empty_map);
    let mut result = std::collections::HashMap::new();
    for (k, v) in map {
        result.insert(k.clone(), v.as_bool().unwrap_or(false));
    }
    Ok(result)
}

pub fn toggle_priority(home: &Path, name: &str) -> Result<bool> {
    ensure_dir(&config_dir(home))?;
    let mut priorities = load_priorities(home)?;
    let current = priorities.get(name).copied().unwrap_or(false);
    let new_val = !current;
    priorities.insert(name.to_string(), new_val);
    let val = serde_json::to_value(&priorities)?;
    write_json(&priority_file(home), &val)?;
    Ok(new_val)
}

pub fn detect_subscription_for_current_auth(home: &Path) -> Result<SubscriptionInfo> {
    let ap = auth_path(home);
    if !ap.exists() {
        return Err(anyhow::anyhow!("auth.json 不存在"));
    }
    detect_subscription_from_auth_file(&ap)
}

pub fn detect_subscription_for_account(home: &Path, name: &str) -> Result<SubscriptionInfo> {
    let acc_auth = accounts_dir(home).join(name).join("auth.json");
    if !acc_auth.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 缺少 auth.json", name));
    }
    detect_subscription_from_auth_file(&acc_auth)
}

pub fn set_manual_subscription_override(
    home: &Path,
    name: &str,
    plan: SubscriptionPlan,
) -> Result<AccountMeta> {
    let acc_dir = accounts_dir(home).join(name);
    if !acc_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 不存在", name));
    }
    let meta_path = acc_dir.join("meta.json");
    let mut meta = read_account_meta_file(&meta_path);
    if meta.name.is_empty() {
        meta.name = name.to_string();
    }
    meta.manual_subscription_override = Some(plan.clone());
    meta.updated_at = Utc::now().to_rfc3339();
    write_account_meta_file(&meta_path, &meta)?;

    list_accounts(home)?
        .into_iter()
        .find(|a| a.name == name)
        .ok_or_else(|| anyhow::anyhow!("账号 '{}' 不存在", name))
}

pub fn clear_manual_subscription_override(home: &Path, name: &str) -> Result<AccountMeta> {
    let acc_dir = accounts_dir(home).join(name);
    if !acc_dir.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 不存在", name));
    }
    let meta_path = acc_dir.join("meta.json");
    let mut meta = read_account_meta_file(&meta_path);
    if meta.name.is_empty() {
        meta.name = name.to_string();
    }
    meta.manual_subscription_override = None;
    meta.updated_at = Utc::now().to_rfc3339();
    write_account_meta_file(&meta_path, &meta)?;

    list_accounts(home)?
        .into_iter()
        .find(|a| a.name == name)
        .ok_or_else(|| anyhow::anyhow!("账号 '{}' 不存在", name))
}

pub async fn fetch_usage_for_active_account(home: &Path) -> Result<CodexUsageInfo> {
    let accounts = list_accounts(home)?;
    let names: Vec<String> = accounts.iter().map(|a| a.name.clone()).collect();
    let status = detect_auth(home, &names)?;
    let account_name = status
        .matched_account
        .unwrap_or_else(|| "当前账号".to_string());
    fetch_usage_from_auth_file(home, &auth_path(home), &account_name).await
}

pub async fn fetch_usage_for_account(home: &Path, name: &str) -> Result<CodexUsageInfo> {
    let acc_auth = accounts_dir(home).join(name).join("auth.json");
    if !acc_auth.exists() {
        return Err(anyhow::anyhow!("账号 '{}' 缺少 auth.json", name));
    }
    fetch_usage_from_auth_file(home, &acc_auth, name).await
}

// ── Settings ──

pub fn load_settings(home: &Path) -> Result<AppSettings> {
    let sf = config_file(home);
    if !sf.exists() {
        return Ok(AppSettings::default());
    }
    let s = std::fs::read_to_string(&sf)?;
    let settings: AppSettings = serde_json::from_str(&s)?;
    Ok(settings)
}

pub fn save_settings(home: &Path, settings: &AppSettings) -> Result<()> {
    ensure_dir(&config_dir(home))?;
    let s = serde_json::to_string_pretty(settings)?;
    std::fs::write(config_file(home), s)?;
    Ok(())
}

// ── Get full app state ──

pub fn get_app_state(custom_home: Option<&str>) -> Result<AppState> {
    let home = codex_home(custom_home)?;
    let settings = load_settings(&home)?;
    let actual_home = codex_home(settings.codex_home.as_deref())?;
    let accounts = list_accounts(&actual_home)?;
    let names: Vec<String> = accounts.iter().map(|a| a.name.clone()).collect();
    let auth_status = detect_auth(&actual_home, &names)?;
    let active_account = auth_status.matched_account.clone();

    Ok(AppState {
        active_account,
        auth_status,
        accounts,
        logs: Vec::new(), // Logs are ephemeral, populated at runtime
        settings,
        switch_history: get_switch_history(&actual_home).unwrap_or_default(),
    })
}
