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
        use std::process::Command;
        // Use a small AppleScript to get cursor position
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get {position of the mouse}"])
            .output()
            .map_err(|e| format!("Failed to get cursor position: {}", e))?;

        // Fallback: use CoreGraphics via command
        if !output.status.success() {
            // Try python approach
            let py_output = Command::new("python3")
                .args(["-c", "from Quartz.CoreGraphics import CGEventGetLocation, CGEventCreate; e = CGEventCreate(None); pos = CGEventGetLocation(e); print(f'{pos.x},{pos.y}')"])
                .output()
                .map_err(|e| format!("Failed to get cursor: {}", e))?;

            let stdout = String::from_utf8_lossy(&py_output.stdout);
            let parts: Vec<&str> = stdout.trim().split(',').collect();
            if parts.len() == 2 {
                let x: f64 = parts[0].parse().unwrap_or(0.0);
                let y: f64 = parts[1].parse().unwrap_or(0.0);
                return Ok(CursorPosition { x, y });
            }
            return Err("Could not parse cursor position".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // Parse "x, y" format
        let cleaned = stdout.trim().replace('{', "").replace('}', "");
        let parts: Vec<&str> = cleaned.split(',').collect();
        if parts.len() >= 2 {
            let x: f64 = parts[0].trim().parse().unwrap_or(0.0);
            let y: f64 = parts[1].trim().parse().unwrap_or(0.0);
            Ok(CursorPosition { x, y })
        } else {
            Err("Could not parse cursor position".to_string())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Cursor tracking not implemented for this OS".to_string())
    }
}

#[tauri::command]
pub async fn open_chat_window(app: AppHandle) -> Result<(), String> {
    // Check if chat window already exists
    if let Some(window) = app.get_webview_window("chat") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create the chat popup window
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
