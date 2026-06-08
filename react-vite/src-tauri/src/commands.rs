use crate::core;
use crate::models::*;
use std::path::PathBuf;
use std::process::Command;

async fn blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}

fn actual_home() -> Result<PathBuf, String> {
    let home = core::codex_home(None).map_err(|e| e.to_string())?;
    let settings = core::load_settings(&home).map_err(|e| e.to_string())?;
    core::codex_home(settings.codex_home.as_deref()).map_err(|e| e.to_string())
}

// ── Commands ──

#[tauri::command]
pub async fn get_app_state(custom_home: Option<String>) -> Result<AppState, String> {
    blocking(move || core::get_app_state(custom_home.as_deref()).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn detect_codex_auth(custom_home: Option<String>) -> Result<CodexAuthStatus, String> {
    blocking(move || {
        let home = core::codex_home(custom_home.as_deref()).map_err(|e| e.to_string())?;
        let settings = core::load_settings(&home).map_err(|e| e.to_string())?;
        let actual_home =
            core::codex_home(settings.codex_home.as_deref()).map_err(|e| e.to_string())?;
        let accounts = core::list_accounts(&actual_home).map_err(|e| e.to_string())?;
        let names: Vec<String> = accounts.iter().map(|a| a.name.clone()).collect();
        core::detect_auth(&actual_home, &names).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn refresh_active_auth_tokens() -> Result<CodexAuthStatus, String> {
    let actual_home = blocking(actual_home).await?;
    core::refresh_active_auth_tokens(&actual_home, true)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_accounts(custom_home: Option<String>) -> Result<Vec<AccountMeta>, String> {
    blocking(move || {
        let home = core::codex_home(custom_home.as_deref()).map_err(|e| e.to_string())?;
        let settings = core::load_settings(&home).map_err(|e| e.to_string())?;
        let actual_home =
            core::codex_home(settings.codex_home.as_deref()).map_err(|e| e.to_string())?;
        core::list_accounts(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn add_account(
    name: String,
    note: Option<String>,
    overwrite: Option<bool>,
) -> Result<AccountMeta, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::add_account(
            &actual_home,
            &name,
            note.as_deref(),
            overwrite.unwrap_or(false),
        )
        .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn import_accounts_from_json(
    json_text: String,
    overwrite: Option<bool>,
) -> Result<ImportAccountsResult, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::import_accounts_from_json(&actual_home, &json_text, overwrite.unwrap_or(false))
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn prepare_new_account_login() -> Result<NewAccountLoginPreparation, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::prepare_new_account_login(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn remove_account(name: String, force: Option<bool>) -> Result<(), String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::remove_account(&actual_home, &name, force.unwrap_or(false)).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn rename_account(old_name: String, new_name: String) -> Result<(), String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::rename_account(&actual_home, &old_name, &new_name).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn switch_account(name: String) -> Result<(), String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::switch_account(&actual_home, &name).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_switch_history() -> Result<Vec<SwitchHistoryEntry>, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::get_switch_history(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_scheduler_state() -> Result<SchedulerState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::get_scheduler_state(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn save_scheduler_config(config: SchedulerConfig) -> Result<SchedulerState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::save_scheduler_config(&actual_home, &config).map_err(|e| e.to_string())?;
        core::get_scheduler_state(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn run_smart_quota_scheduler_once() -> Result<SchedulerHistoryEntry, String> {
    let actual_home = blocking(actual_home).await?;
    core::run_smart_quota_scheduler_once(&actual_home)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn refresh_tray_menu(app: tauri::AppHandle) -> Result<(), String> {
    blocking(move || crate::tray::refresh_menu(&app).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::show_main_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_tray_menu(app: tauri::AppHandle) -> Result<(), String> {
    crate::tray::hide_tray_menu(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn toggle_priority(name: String) -> Result<bool, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::toggle_priority(&actual_home, &name).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn update_settings(settings: AppSettings) -> Result<AppSettings, String> {
    blocking(move || {
        let actual_home =
            core::codex_home(settings.codex_home.as_deref()).map_err(|e| e.to_string())?;
        core::save_settings(&actual_home, &settings).map_err(|e| e.to_string())?;
        Ok(settings)
    })
    .await
}

#[tauri::command]
pub async fn detect_current_auth_email() -> Result<Option<String>, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::detect_email_for_current_auth(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn detect_subscription_for_current_auth() -> Result<SubscriptionInfo, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::detect_subscription_for_current_auth(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn detect_subscription_for_account(name: String) -> Result<SubscriptionInfo, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::detect_subscription_for_account(&actual_home, &name).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn set_manual_subscription_override(
    name: String,
    plan: SubscriptionPlan,
) -> Result<AccountMeta, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::set_manual_subscription_override(&actual_home, &name, plan).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn clear_manual_subscription_override(name: String) -> Result<AccountMeta, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::clear_manual_subscription_override(&actual_home, &name).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn fetch_usage_for_active_account() -> Result<CodexUsageInfo, String> {
    let actual_home = blocking(actual_home).await?;
    core::fetch_usage_for_active_account(&actual_home)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_usage_for_account(name: String) -> Result<CodexUsageInfo, String> {
    let actual_home = blocking(actual_home).await?;
    core::fetch_usage_for_account(&actual_home, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_token_usage_summary() -> Result<TokenUsageSummary, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        core::get_token_usage_summary(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn open_usage_page() -> Result<(), String> {
    blocking(move || {
        let url = "https://chatgpt.com/account/usage";

        #[cfg(target_os = "windows")]
        let status = Command::new("cmd").args(["/C", "start", "", url]).status();

        #[cfg(target_os = "macos")]
        let status = Command::new("open").arg(url).status();

        #[cfg(all(unix, not(target_os = "macos")))]
        let status = Command::new("xdg-open").arg(url).status();

        status.map_err(|e| e.to_string()).and_then(|s| {
            if s.success() {
                Ok(())
            } else {
                Err("打开 Usage 页面失败".to_string())
            }
        })
    })
    .await
}

#[tauri::command]
pub async fn save_active_account() -> Result<String, String> {
    // This is a convenience command that just confirms the current state is saved
    Ok("已保存当前账号状态".to_string())
}

#[tauri::command]
pub async fn get_proxy_state() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::get_proxy_state(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn update_proxy_config(config: ProxyConfig) -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::save_proxy_config(&actual_home, &config).map_err(|e| e.to_string())?;
        crate::proxy::get_proxy_state(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn start_proxy() -> Result<ProxyState, String> {
    let actual_home = blocking(actual_home).await?;
    crate::proxy::start_proxy(actual_home)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_proxy() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::stop_proxy(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn set_request_provider(provider_id: Option<String>) -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::set_request_provider(&actual_home, provider_id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn save_provider(provider: ProviderConfig) -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::save_provider(&actual_home, provider).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn remove_provider(provider_id: String) -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::remove_provider(&actual_home, &provider_id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn install_codex_proxy_config() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::install_codex_proxy_config(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn restore_codex_proxy_config() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::restore_codex_proxy_config(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn set_mobile_residency_account(account_name: String) -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::set_mobile_residency_account(&actual_home, account_name)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn enable_mobile_residency() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::enable_mobile_residency(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn disable_mobile_residency() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::disable_mobile_residency(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn clear_mobile_residency() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::clear_mobile_residency(&actual_home).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn restore_mobile_residency() -> Result<ProxyState, String> {
    blocking(move || {
        let actual_home = actual_home()?;
        crate::proxy::restore_mobile_residency(&actual_home).map_err(|e| e.to_string())
    })
    .await
}
