use serde::{Deserialize, Serialize};

// ── Subscription types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionPlan {
    Free,
    Go,
    Plus,
    Pro,
    #[serde(rename = "pro_lite")]
    ProLite,
    Team,
    Business,
    Enterprise,
    Edu,
    #[serde(rename = "api_key")]
    ApiKey,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum SubscriptionSource {
    AuthMode,
    IdToken,
    AgentIdentity,
    UsageApi,
    Manual,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionInfo {
    pub plan: SubscriptionPlan,
    pub display_name: String,
    pub raw_plan: Option<String>,
    pub source: SubscriptionSource,
    pub confidence: Confidence,
    pub is_workspace_account: Option<bool>,
    pub warning: Option<String>,
}

// ── Usage types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UsageWindowKind {
    #[serde(rename = "5h")]
    FiveHours,
    #[serde(rename = "7d")]
    SevenDays,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UsageUnit {
    Messages,
    Credits,
    Tokens,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum UsageRawSource {
    OfficialApi,
    CodexStatus,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub window: UsageWindowKind,
    pub used: Option<u32>,
    pub limit: Option<u32>,
    pub remaining: Option<u32>,
    pub reset_at: Option<String>,
    pub percentage: Option<f32>,
    pub unit: UsageUnit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUsageInfo {
    pub account_name: String,
    pub fetched_at: String,
    pub plan: Option<String>,
    pub windows: Vec<UsageWindow>,
    pub raw_source: UsageRawSource,
    pub warning: Option<String>,
    pub subscription: Option<SubscriptionInfo>,
}

// ── Local token usage from Codex rollout files ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageBreakdown {
    #[serde(alias = "input_tokens")]
    pub input_tokens: i64,
    #[serde(alias = "cached_input_tokens")]
    pub cached_input_tokens: i64,
    #[serde(alias = "output_tokens")]
    pub output_tokens: i64,
    #[serde(alias = "reasoning_output_tokens")]
    pub reasoning_output_tokens: i64,
    #[serde(alias = "total_tokens")]
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageDay {
    pub date: String,
    pub usage: TokenUsageBreakdown,
    pub turns: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageSummary {
    pub fetched_at: String,
    pub codex_home: String,
    pub sessions_scanned: u32,
    pub token_events: u32,
    pub total: TokenUsageBreakdown,
    pub today: TokenUsageBreakdown,
    pub max_session_total: TokenUsageBreakdown,
    pub days: Vec<TokenUsageDay>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAccountLoginPreparation {
    pub did_logout: bool,
    pub previous_account: Option<String>,
    pub auth_path: String,
}

// ── Account & Auth ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AccountHealth {
    Healthy,
    ExpiringSoon,
    Expired,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchHistoryEntry {
    pub id: String,
    pub switched_at: String,
    pub from_account: Option<String>,
    pub to_account: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMeta {
    pub name: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub source: Option<String>,
    pub sha256_prefix: Option<String>,
    pub size: Option<u64>,
    pub is_active: Option<bool>,
    pub last_usage_check_at: Option<String>,
    pub usage: Option<CodexUsageInfo>,
    pub subscription: Option<SubscriptionInfo>,
    pub manual_subscription_override: Option<SubscriptionPlan>,
    pub priority: Option<bool>,
    pub health: AccountHealth,
    pub health_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthStatus {
    pub codex_home: String,
    pub auth_path: String,
    pub exists: bool,
    pub matched_account: Option<String>,
    pub sha256_prefix: Option<String>,
    pub status: String,
    pub warning: Option<String>,
}

// ── App types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLog {
    pub id: String,
    pub time: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub codex_home: Option<String>,
    pub auto_detect_codex_home: bool,
    pub refresh_usage_on_startup: bool,
    pub refresh_usage_after_switch: bool,
    #[serde(default = "default_refresh_usage_interval_minutes")]
    pub refresh_usage_interval_minutes: u32,
    pub restore_previous_after_usage_check: bool,
    pub backup_retention: u32,
    pub enable_usage_query: bool,
    #[serde(default = "default_true")]
    pub enable_usage_notifications: bool,
    #[serde(default = "default_usage_notification_threshold")]
    pub usage_notification_threshold: u32,
    pub theme: String,
}

fn default_refresh_usage_interval_minutes() -> u32 {
    15
}
fn default_true() -> bool {
    true
}
fn default_usage_notification_threshold() -> u32 {
    80
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_home: None,
            auto_detect_codex_home: true,
            refresh_usage_on_startup: true,
            refresh_usage_after_switch: true,
            refresh_usage_interval_minutes: default_refresh_usage_interval_minutes(),
            restore_previous_after_usage_check: true,
            backup_retention: 10,
            enable_usage_query: true,
            enable_usage_notifications: true,
            usage_notification_threshold: default_usage_notification_threshold(),
            theme: "dark".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub active_account: Option<String>,
    pub auth_status: CodexAuthStatus,
    pub accounts: Vec<AccountMeta>,
    pub logs: Vec<AppLog>,
    pub settings: AppSettings,
    pub switch_history: Vec<SwitchHistoryEntry>,
}

// ── Account metadata file (stored alongside auth.json) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMetaFile {
    pub name: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub priority: Option<bool>,
    pub manual_subscription_override: Option<SubscriptionPlan>,
}

impl Default for AccountMetaFile {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            name: String::new(),
            note: None,
            created_at: now.clone(),
            updated_at: now,
            priority: None,
            manual_subscription_override: None,
        }
    }
}

// ── Usage API response (from official Codex backend /api/codex/usage) ──

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexUsageApiResponse {
    pub plan_type: Option<String>,
    pub rate_limit: Option<RateLimitStatusDetails>,
    pub additional_rate_limits: Option<Vec<AdditionalRateLimitDetails>>,
    pub credits: Option<serde_json::Value>,
    pub spend_control: Option<serde_json::Value>,
    pub rate_limit_reached_type: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitStatusDetails {
    pub allowed: Option<bool>,
    pub limit_reached: Option<bool>,
    pub primary_window: Option<RateLimitWindowSnapshot>,
    pub secondary_window: Option<RateLimitWindowSnapshot>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdditionalRateLimitDetails {
    pub limit_name: Option<String>,
    pub metered_feature: Option<String>,
    pub rate_limit: Option<RateLimitStatusDetails>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitWindowSnapshot {
    pub used_percent: Option<f32>,
    pub limit_window_seconds: Option<i64>,
    pub reset_after_seconds: Option<i64>,
    pub reset_at: Option<i64>,
}
