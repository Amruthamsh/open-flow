use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

#[tauri::command]
pub async fn get_cursor_position() -> Result<CursorPosition, String> {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::event::CGEvent;
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| "Failed to create event source".to_string())?;
        let event = CGEvent::new(source)
            .map_err(|_| "Failed to create CGEvent".to_string())?;
        let point = event.location();

        Ok(CursorPosition {
            x: point.x,
            y: point.y,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Cursor tracking not implemented for this OS".to_string())
    }
}

#[tauri::command]
pub async fn open_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("chat") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "chat", WebviewUrl::App("/chat".into()))
        .title("Nova")
        .inner_size(400.0, 500.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .build()
        .map_err(|e| format!("Failed to create chat window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn close_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("chat") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
