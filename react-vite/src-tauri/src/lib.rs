mod commands;
mod core;
mod models;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            detect_codex_auth,
            list_accounts,
            add_account,
            remove_account,
            rename_account,
            switch_account,
            toggle_priority,
            update_settings,
            detect_current_auth_email,
            detect_subscription_for_current_auth,
            detect_subscription_for_account,
            set_manual_subscription_override,
            clear_manual_subscription_override,
            fetch_usage_for_active_account,
            fetch_usage_for_account,
            get_token_usage_summary,
            open_usage_page,
            save_active_account,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
