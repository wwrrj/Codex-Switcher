use anyhow::{Context, Result};
use chrono::Utc;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::models::*;
use crate::secrets::mask_secret;

fn config_dir(home: &Path) -> PathBuf {
    home.join("config")
}

pub fn providers_file(home: &Path) -> PathBuf {
    config_dir(home).join("providers.json")
}

fn accounts_dir(home: &Path) -> PathBuf {
    home.join("accounts")
}

fn read_json(path: &Path) -> Result<Value> {
    let s = std::fs::read_to_string(path).context("读取 JSON 失败")?;
    Ok(serde_json::from_str(&s).context("解析 JSON 失败")?)
}

fn write_json(path: &Path, val: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(val)?)?;
    Ok(())
}

fn string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

fn provider_auth_file(home: &Path, account_name: &str) -> PathBuf {
    accounts_dir(home).join(account_name).join("auth.json")
}

pub fn read_access_token_for_account(home: &Path, account_name: &str) -> Result<String> {
    let auth = read_json(&provider_auth_file(home, account_name))?;
    string_at_path(&auth, &["tokens", "access_token"])
        .or_else(|| string_at_path(&auth, &["access_token"]))
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("账号 '{}' 缺少 access token", account_name))
}

pub fn is_chatgpt_oauth_account(home: &Path, account_name: &str) -> bool {
    let Ok(auth) = read_json(&provider_auth_file(home, account_name)) else {
        return false;
    };
    let has_access = string_at_path(&auth, &["tokens", "access_token"])
        .or_else(|| string_at_path(&auth, &["access_token"]))
        .is_some();
    let has_refresh = string_at_path(&auth, &["tokens", "refresh_token"])
        .or_else(|| string_at_path(&auth, &["refresh_token"]))
        .is_some();
    let is_api_key = string_at_path(&auth, &["OPENAI_API_KEY"]).is_some()
        && string_at_path(&auth, &["auth_mode"]) == Some("api_key");
    has_access && has_refresh && !is_api_key
}

pub fn load_provider_configs(home: &Path) -> Result<Vec<ProviderConfig>> {
    let path = providers_file(home);
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

pub fn save_provider_configs(home: &Path, providers: &[ProviderConfig]) -> Result<()> {
    write_json(&providers_file(home), &serde_json::to_value(providers)?)
}

pub fn public_provider(provider: &ProviderConfig) -> PublicProviderConfig {
    let has_secret = provider.api_key.as_deref().is_some_and(|v| !v.is_empty());
    PublicProviderConfig {
        id: provider.id.clone(),
        name: provider.name.clone(),
        kind: provider.kind.clone(),
        enabled: provider.enabled,
        base_url: provider.base_url.clone(),
        account_name: provider.account_name.clone(),
        has_secret,
        include_in_failover: provider.include_in_failover,
        health: provider.health.clone(),
    }
}

pub fn oauth_provider_for_account(account: &AccountMeta) -> ProviderConfig {
    ProviderConfig {
        id: format!("account:{}", account.name),
        name: account.name.clone(),
        kind: ProviderKind::ChatGptOauth,
        enabled: account.health != AccountHealth::Invalid
            && account.health != AccountHealth::Expired,
        base_url: "https://chatgpt.com/backend-api".to_string(),
        account_name: Some(account.name.clone()),
        api_key: None,
        model_map: None,
        include_in_failover: true,
        health: ProviderHealth {
            status: if account.health == AccountHealth::Healthy {
                ProviderHealthStatus::Healthy
            } else {
                ProviderHealthStatus::Unknown
            },
            last_error: account.health_message.clone(),
            last_used_at: None,
            cooldown_until: None,
        },
    }
}

pub fn merged_providers(home: &Path, accounts: &[AccountMeta]) -> Result<Vec<ProviderConfig>> {
    let mut providers: BTreeMap<String, ProviderConfig> = BTreeMap::new();
    for account in accounts {
        let provider = oauth_provider_for_account(account);
        providers.insert(provider.id.clone(), provider);
    }
    for provider in load_provider_configs(home)? {
        providers.insert(provider.id.clone(), provider);
    }
    Ok(providers.into_values().collect())
}

pub fn save_provider(provider_home: &Path, mut provider: ProviderConfig) -> Result<ProviderConfig> {
    if provider.id.trim().is_empty() {
        provider.id = format!("provider:{}", uuid::Uuid::new_v4());
    }
    provider.health.last_error = provider.health.last_error.map(|msg| mask_secret(&msg));
    let mut providers = load_provider_configs(provider_home)?;
    providers.retain(|item| item.id != provider.id);
    providers.push(provider.clone());
    save_provider_configs(provider_home, &providers)?;
    Ok(provider)
}

pub fn remove_provider(home: &Path, provider_id: &str) -> Result<()> {
    let mut providers = load_provider_configs(home)?;
    providers.retain(|item| item.id != provider_id);
    save_provider_configs(home, &providers)
}

pub fn update_provider_options(
    home: &Path,
    provider_id: &str,
    enabled: Option<bool>,
    include_in_failover: Option<bool>,
) -> Result<()> {
    let mut providers = load_provider_configs(home)?;
    let mut found = false;
    for provider in &mut providers {
        if provider.id == provider_id {
            found = true;
            if let Some(enabled) = enabled {
                provider.enabled = enabled;
                if !enabled {
                    provider.health.status = ProviderHealthStatus::Disabled;
                } else if provider.health.status == ProviderHealthStatus::Disabled {
                    provider.health.status = ProviderHealthStatus::Unknown;
                }
            }
            if let Some(include_in_failover) = include_in_failover {
                provider.include_in_failover = include_in_failover;
            }
            provider.health.last_error = provider
                .health
                .last_error
                .take()
                .map(|msg| mask_secret(&msg));
            break;
        }
    }
    if !found {
        return Err(anyhow::anyhow!("请求出口不存在：{}", provider_id));
    }
    save_provider_configs(home, &providers)
}

pub fn mark_provider_failure(
    home: &Path,
    provider_id: &str,
    reason: &str,
    cooldown_seconds: u64,
) -> Result<()> {
    let mut providers = load_provider_configs(home)?;
    let until = Utc::now() + chrono::Duration::seconds(cooldown_seconds as i64);
    for provider in &mut providers {
        if provider.id == provider_id {
            provider.health.status = ProviderHealthStatus::CoolingDown;
            provider.health.last_error = Some(mask_secret(reason));
            provider.health.cooldown_until = Some(until.to_rfc3339());
        }
    }
    save_provider_configs(home, &providers)
}

pub fn mark_provider_used(home: &Path, provider_id: &str) -> Result<()> {
    let mut providers = load_provider_configs(home)?;
    for provider in &mut providers {
        if provider.id == provider_id {
            provider.health.status = ProviderHealthStatus::Healthy;
            provider.health.last_used_at = Some(Utc::now().to_rfc3339());
            provider.health.cooldown_until = None;
        }
    }
    save_provider_configs(home, &providers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_provider_hides_api_key() {
        let provider = ProviderConfig {
            id: "p1".to_string(),
            name: "Relay".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            enabled: true,
            base_url: "https://relay.example/v1".to_string(),
            account_name: None,
            api_key: Some("sk-secret".to_string()),
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth::default(),
        };
        let public = public_provider(&provider);
        assert!(public.has_secret);
    }

    #[test]
    fn update_provider_options_preserves_secret() {
        let home =
            std::env::temp_dir().join(format!("codex-provider-options-{}", uuid::Uuid::new_v4()));
        let provider = ProviderConfig {
            id: "provider:test".to_string(),
            name: "Relay".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            enabled: true,
            base_url: "https://relay.example/v1".to_string(),
            account_name: None,
            api_key: Some("sk-secret".to_string()),
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth::default(),
        };
        save_provider(&home, provider).unwrap();
        update_provider_options(&home, "provider:test", Some(false), Some(false)).unwrap();
        let providers = load_provider_configs(&home).unwrap();
        assert_eq!(providers[0].api_key.as_deref(), Some("sk-secret"));
        assert!(!providers[0].enabled);
        assert!(!providers[0].include_in_failover);
        let _ = std::fs::remove_dir_all(home);
    }
}
