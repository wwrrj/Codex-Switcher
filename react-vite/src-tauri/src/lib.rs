mod codex_config;
mod commands;
mod core;
mod mobile_residency;
mod models;
mod providers;
mod proxy;
mod routing;
mod secrets;
mod transforms;
mod tray;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = tray::hide_tray_menu(app);
            let _ = tray::show_main_window(app);
        }))
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "tray-menu" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            detect_codex_auth,
            refresh_active_auth_tokens,
            list_accounts,
            add_account,
            import_accounts_from_json,
            prepare_new_account_login,
            remove_account,
            rename_account,
            switch_account,
            get_switch_history,
            get_scheduler_state,
            save_scheduler_config,
            run_smart_quota_scheduler_once,
            refresh_tray_menu,
            show_main_window,
            hide_tray_menu,
            quit_app,
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
            get_proxy_state,
            update_proxy_config,
            start_proxy,
            stop_proxy,
            set_request_provider,
            save_provider,
            remove_provider,
            update_provider_options,
            install_codex_proxy_config,
            restore_codex_proxy_config,
            set_mobile_residency_account,
            enable_mobile_residency,
            disable_mobile_residency,
            clear_mobile_residency,
            restore_mobile_residency,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
