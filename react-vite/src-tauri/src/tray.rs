use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Position, Size,
};

const TRAY_ID: &str = "codex-switcher-tray";
const TRAY_MENU_WIDTH: i32 = 320;
const TRAY_MENU_HEIGHT: i32 = 420;

pub fn refresh_menu(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().expect("missing app icon").clone())
        .tooltip("Codex Account Switcher")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                position,
                button,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                match button {
                    MouseButton::Left => {
                        let _ = show_main_window(tray.app_handle());
                    }
                    MouseButton::Right => {
                        let _ = show_tray_menu_at(tray.app_handle(), position);
                    }
                    _ => {}
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

pub fn hide_tray_menu(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("tray-menu") {
        window.hide()?;
    }
    Ok(())
}

fn show_tray_menu_at(app: &AppHandle, position: PhysicalPosition<f64>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("tray-menu") {
        let x = (position.x as i32 - TRAY_MENU_WIDTH + 12).max(8);
        let y = (position.y as i32 - TRAY_MENU_HEIGHT - 8).max(8);
        window.set_size(Size::Physical((TRAY_MENU_WIDTH as u32, TRAY_MENU_HEIGHT as u32).into()))?;
        window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}
