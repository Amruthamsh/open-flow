use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanStep {
    pub action: String,
    pub params: serde_json::Value,
    pub destructive: bool,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plan {
    pub summary: String,
    pub steps: Vec<PlanStep>,
}

#[tauri::command]
pub async fn generate_plan(command: String, context_dir: Option<String>) -> Result<Plan, String> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY environment variable not set".to_string())?;

    let dir = context_dir.unwrap_or_else(|| {
        dirs::download_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Downloads"))
            .to_string_lossy()
            .to_string()
    });

    let system_prompt = format!(
        r#"You are Nova, an AI desktop assistant. Given a natural-language command, produce an execution plan as JSON.

The user's system is macOS. The current context directory is: {}

You MUST respond with ONLY valid JSON matching this schema:
{{
  "summary": "brief human-readable summary of what will happen",
  "steps": [
    {{
      "action": "one of: move_file, create_directory, open_application, open_url, open_in_vscode, open_terminal",
      "params": {{}},
      "destructive": true/false,
      "description": "human-readable description of this step"
    }}
  ]
}}

Action params:
- move_file: {{"source": "/path/from", "destination": "/path/to"}}
- create_directory: {{"path": "/path/to/dir"}}
- open_application: {{"app_name": "Application Name"}}
- open_url: {{"url": "https://..."}}
- open_in_vscode: {{"path": "/path/to/folder"}}
- open_terminal: {{"path": "/optional/path"}}

Rules:
- Mark any step that moves, renames, or deletes files as destructive: true
- Opening apps/URLs is destructive: false
- Keep plans focused and minimal
- For file organization, group by file extension into standard folders (Images, Documents, PDFs, Code, Videos, Audio, Archives, Other)
- Do NOT include any text outside the JSON object"#,
        dir
    );

    let request_body = serde_json::json!({
        "contents": [{
            "parts": [{"text": command}]
        }],
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
            api_key
        ))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to call Gemini API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error ({}): {}", status, body));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

    let text = response_json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("No text in Gemini response")?;

    let plan: Plan =
        serde_json::from_str(text).map_err(|e| format!("Failed to parse plan JSON: {}. Raw: {}", e, text))?;

    Ok(plan)
}
