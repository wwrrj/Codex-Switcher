use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::core;
use crate::models::AccountMeta;

const TRAY_ID: &str = "codex-switcher-tray";
const SWITCH_PREFIX: &str = "switch::";

fn actual_home() -> anyhow::Result<std::path::PathBuf> {
    let home = core::codex_home(None)?;
    let settings = core::load_settings(&home)?;
    core::codex_home(settings.codex_home.as_deref())
}

fn load_accounts() -> Vec<AccountMeta> {
    actual_home()
        .ok()
        .and_then(|home| core::list_accounts(&home).ok())
        .unwrap_or_default()
}

fn build_menu(
    app: &AppHandle,
    accounts: &[AccountMeta],
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut builder = MenuBuilder::new(app)
        .text("show", "打开 Codex Account Switcher")
        .text("refresh", "刷新所有账号用量")
        .separator();

    for account in accounts {
        let active = account.is_active == Some(true);
        let marker = if active { "● " } else { "   " };
        builder = builder.text(
            if active {
                format!("active::{}", account.name)
            } else {
                format!("{SWITCH_PREFIX}{}", account.name)
            },
            format!("{marker}{}", account.name),
        );
    }

    builder.separator().text("quit", "退出").build()
}

pub fn refresh_menu(app: &AppHandle) -> tauri::Result<()> {
    let accounts = load_accounts();
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_menu(app, &accounts)?))?;
    }
    Ok(())
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let menu = build_menu(app.handle(), &[])?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().expect("missing app icon").clone())
        .tooltip("Codex Account Switcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            if id == "show" {
                show_window(app);
            } else if id == "refresh" {
                show_window(app);
                let _ = app.emit("tray-refresh-usage", ());
            } else if id == "quit" {
                app.exit(0);
            } else if let Some(name) = id.strip_prefix(SWITCH_PREFIX) {
                let app = app.clone();
                let name = name.to_string();
                tauri::async_runtime::spawn_blocking(move || {
                    let result = actual_home()
                        .map_err(|error| error.to_string())
                        .and_then(|home| {
                            core::switch_account(&home, &name).map_err(|error| error.to_string())
                        });
                    let _ = refresh_menu(&app);
                    let _ = app.emit(
                        "tray-account-switched",
                        serde_json::json!({
                            "name": name,
                            "success": result.is_ok(),
                            "error": result.err(),
                        }),
                    );
                });
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = refresh_menu(&app_handle);
    });

    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
