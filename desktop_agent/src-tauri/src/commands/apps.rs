use std::process::Command;

#[tauri::command]
pub async fn open_application(app_name: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg(&app_name)
            .spawn()
            .map_err(|e| format!("Failed to open {}: {}", app_name, e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &app_name])
            .spawn()
            .map_err(|e| format!("Failed to open {}: {}", app_name, e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&app_name)
            .spawn()
            .map_err(|e| format!("Failed to open {}: {}", app_name, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL {}: {}", url, e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL {}: {}", url, e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL {}: {}", url, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
    Command::new("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code at {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
pub async fn open_terminal(path: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.arg("-a").arg("Terminal");
        if let Some(p) = &path {
            cmd.arg(p);
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err("Terminal launch not implemented for this OS".to_string());
    }

    Ok(())
}
