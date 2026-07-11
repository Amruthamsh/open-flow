use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
        }
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write file {}: {}", path, e))
}

fn resolve_interpreter(interpreter: &str) -> String {
    match interpreter {
        "python3" | "python" => {
            // Try common paths since Tauri may not inherit shell PATH
            let candidates = [
                "/usr/local/bin/python3",
                "/opt/homebrew/bin/python3",
                "/usr/bin/python3",
            ];
            for path in candidates {
                if Path::new(path).exists() {
                    return path.to_string();
                }
            }
            interpreter.to_string()
        }
        _ => interpreter.to_string(),
    }
}

#[tauri::command]
pub async fn run_script(interpreter: String, script: String, working_dir: Option<String>) -> Result<ScriptResult, String> {
    let resolved = resolve_interpreter(&interpreter);
    let mut cmd = Command::new(&resolved);

    // Ensure PATH includes common locations
    let path_env = std::env::var("PATH").unwrap_or_default();
    let extended_path = format!("/usr/local/bin:/opt/homebrew/bin:/usr/bin:{}", path_env);
    cmd.env("PATH", &extended_path);

    match interpreter.as_str() {
        "python3" | "python" => { cmd.arg("-c").arg(&script); }
        "bash" | "sh" | "zsh" => { cmd.arg("-c").arg(&script); }
        "osascript" => { cmd.arg("-e").arg(&script); }
        _ => { cmd.arg("-c").arg(&script); }
    }

    if let Some(dir) = &working_dir {
        cmd.current_dir(dir);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run {} (resolved: {}): {}", interpreter, resolved, e))?;

    Ok(ScriptResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open {}: {}", path, e))?;
    Ok(())
}
