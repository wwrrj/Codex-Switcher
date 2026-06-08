use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::models::*;
use crate::providers::is_chatgpt_oauth_account;

fn auth_path(home: &Path) -> PathBuf {
    home.join("auth.json")
}

fn accounts_dir(home: &Path) -> PathBuf {
    home.join("accounts")
}

fn account_auth(home: &Path, account_name: &str) -> PathBuf {
    accounts_dir(home).join(account_name).join("auth.json")
}

pub fn validate_mobile_residency_account(home: &Path, account_name: &str) -> Result<()> {
    let path = account_auth(home, account_name);
    if !path.exists() {
        return Err(anyhow::anyhow!("移动端驻留账号不存在"));
    }
    if !is_chatgpt_oauth_account(home, account_name) {
        return Err(anyhow::anyhow!(
            "该账号不能作为移动端驻留账号。仅支持 ChatGPT OAuth 账号。"
        ));
    }
    Ok(())
}

pub fn restore_mobile_residency_auth(home: &Path, account_name: &str) -> Result<()> {
    validate_mobile_residency_account(home, account_name)?;
    std::fs::copy(account_auth(home, account_name), auth_path(home))
        .with_context(|| "恢复移动端驻留 auth.json 失败")?;
    Ok(())
}

pub fn mobile_residency_state(
    home: &Path,
    config: &ProxyConfig,
    disk_account: Option<String>,
    request_provider: Option<String>,
) -> MobileResidencyState {
    let enabled = config.mobile_residency.enabled;
    let account_name = config.mobile_residency.account_name.clone();
    let mut warnings = Vec::new();
    let mut healthy = true;

    if enabled {
        match account_name.as_deref() {
            Some(name) => {
                if let Err(error) = validate_mobile_residency_account(home, name) {
                    healthy = false;
                    warnings.push(error.to_string());
                }
                if disk_account.as_deref() != Some(name) {
                    healthy = false;
                    warnings.push(format!("磁盘账号和移动端驻留账号不一致，应为 {name}"));
                }
            }
            None => {
                healthy = false;
                warnings.push("移动端驻留已启用，但未选择账号".to_string());
            }
        }
    }

    MobileResidencyState {
        enabled,
        account_name,
        disk_account,
        request_provider,
        healthy,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_reports_missing_account() {
        let home = std::env::temp_dir().join(format!(
            "codex-switcher-residency-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&home).unwrap();
        let config = ProxyConfig {
            mobile_residency: MobileResidencyConfig {
                enabled: true,
                account_name: Some("missing".to_string()),
                ..MobileResidencyConfig::default()
            },
            ..ProxyConfig::default()
        };
        let state = mobile_residency_state(&home, &config, None, None);
        assert!(!state.healthy);
        assert!(!state.warnings.is_empty());
        let _ = std::fs::remove_dir_all(home);
    }
}
