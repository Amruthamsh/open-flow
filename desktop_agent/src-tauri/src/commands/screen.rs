use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenContent {
    pub text: String,
    pub screenshot_path: Option<String>,
}

#[tauri::command]
pub async fn read_screen(region: Option<String>) -> Result<ScreenContent, String> {
    // Use macOS accessibility to read focused window content
    let script = if region.as_deref() == Some("focused") {
        r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            tell process frontApp
                set windowTitle to name of front window
                set uiElements to entire contents of front window
                set textContent to ""
                repeat with elem in uiElements
                    try
                        set elemValue to value of elem
                        if elemValue is not missing value and elemValue is not "" then
                            set textContent to textContent & elemValue & linefeed
                        end if
                    end try
                end repeat
                return windowTitle & linefeed & "---" & linefeed & textContent
            end tell
        end tell
        "#
    } else {
        r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            tell process frontApp
                set windowTitle to name of front window
                set uiElements to entire contents of front window
                set textContent to ""
                repeat with elem in uiElements
                    try
                        set elemValue to value of elem
                        if elemValue is not missing value and elemValue is not "" then
                            set textContent to textContent & elemValue & linefeed
                        end if
                    end try
                end repeat
                return windowTitle & linefeed & "---" & linefeed & textContent
            end tell
        end tell
        "#
    };

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to read screen: {}", e))?;

    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(ScreenContent {
            text,
            screenshot_path: None,
        })
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Screen read failed: {}", err))
    }
}

#[tauri::command]
pub async fn take_screenshot(save_to: Option<String>) -> Result<String, String> {
    let path = save_to.unwrap_or_else(|| {
        let tmp = std::env::temp_dir();
        tmp.join("openflow_screenshot.png")
            .to_string_lossy()
            .to_string()
    });

    Command::new("screencapture")
        .args(["-x", &path])
        .output()
        .map_err(|e| format!("Failed to take screenshot: {}", e))?;

    Ok(path)
}

#[tauri::command]
pub async fn type_text(text: String) -> Result<(), String> {
    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"tell application "System Events" to keystroke "{}""#,
        escaped
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to type text: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn click_element(target: String) -> Result<(), String> {
    let script = format!(
        r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            tell process frontApp
                try
                    click (first UI element of front window whose description contains "{}" or name contains "{}")
                on error
                    click (first button of front window whose name contains "{}")
                end try
            end tell
        end tell
        "#,
        target, target, target
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to click element: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Click failed: {}", err));
    }

    Ok(())
}

#[tauri::command]
pub async fn scroll_screen(direction: String, amount: Option<i32>) -> Result<(), String> {
    let clicks = amount.unwrap_or(3);
    let scroll_amount = if direction == "up" { clicks } else { -clicks };

    let script = format!(
        r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            tell process frontApp
                scroll front window by {}
            end tell
        end tell
        "#,
        scroll_amount
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to scroll: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn read_aloud(text: String, language: Option<String>) -> Result<(), String> {
    let voice = match language.as_deref() {
        Some("hi") => "Lekha",
        Some("ta") => "Veena",
        Some("te") => "Veena",
        _ => "Samantha",
    };

    Command::new("say")
        .args(["-v", voice, &text])
        .spawn()
        .map_err(|e| format!("Failed to read aloud: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn notify_user(message: String, notification_type: Option<String>) -> Result<(), String> {
    let title = match notification_type.as_deref() {
        Some("success") => "OpenFlow ✓",
        Some("warning") => "OpenFlow ⚠",
        _ => "OpenFlow",
    };

    let script = format!(
        r#"display notification "{}" with title "{}""#,
        message.replace('"', "\\\""),
        title
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to notify: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn search_web(query: String) -> Result<(), String> {
    let url = format!(
        "https://www.google.com/search?q={}",
        urlencoding::encode(&query)
    );

    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to search: {}", e))?;

    Ok(())
}
