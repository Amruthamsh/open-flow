use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceResult {
    pub transcript: Option<String>,
    pub error: Option<String>,
    pub confidence: Option<f64>,
}

#[tauri::command]
pub async fn start_voice_recognition(app: AppHandle) -> Result<VoiceResult, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // Try bundled script first, then fallback to relative path for dev mode
    let script_path = resource_path.join("scripts/voice_recognize.swift");
    let script_path = if script_path.exists() {
        script_path
    } else {
        let dev_path = std::env::current_dir()
            .unwrap_or_default()
            .join("../scripts/voice_recognize.swift");
        if dev_path.exists() {
            dev_path
        } else {
            // Try from the manifest dir
            let manifest_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../scripts/voice_recognize.swift");
            if manifest_path.exists() {
                manifest_path
            } else {
                return Err("Voice recognition script not found".to_string());
            }
        }
    };

    let output = Command::new("swift")
        .arg(&script_path)
        .output()
        .map_err(|e| format!("Failed to start voice recognition: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if stdout.trim().is_empty() {
        return Ok(VoiceResult {
            transcript: None,
            error: Some("No speech detected".to_string()),
            confidence: None,
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Failed to parse voice result: {}. Raw: {}", e, stdout))?;

    if let Some(error) = parsed.get("error").and_then(|v| v.as_str()) {
        Ok(VoiceResult {
            transcript: None,
            error: Some(error.to_string()),
            confidence: None,
        })
    } else {
        Ok(VoiceResult {
            transcript: parsed.get("transcript").and_then(|v| v.as_str()).map(|s| s.to_string()),
            error: None,
            confidence: parsed.get("confidence").and_then(|v| v.as_f64()),
        })
    }
}
