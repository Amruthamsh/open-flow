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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectivityStatus {
    pub level: String, // "cloud", "edge", "local"
    pub latency_ms: Option<u64>,
}

#[tauri::command]
pub async fn check_connectivity() -> Result<ConnectivityStatus, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    match client.get("https://generativelanguage.googleapis.com").send().await {
        Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 404 => {
            let latency = start.elapsed().as_millis() as u64;
            if latency < 500 {
                Ok(ConnectivityStatus { level: "cloud".into(), latency_ms: Some(latency) })
            } else {
                Ok(ConnectivityStatus { level: "edge".into(), latency_ms: Some(latency) })
            }
        }
        _ => {
            Ok(ConnectivityStatus { level: "local".into(), latency_ms: None })
        }
    }
}

#[tauri::command]
pub async fn generate_plan(command: String, context_dir: Option<String>) -> Result<Plan, String> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY not set. Running in offline mode is not yet supported.".to_string())?;

    let dir = context_dir.unwrap_or_else(|| {
        dirs::download_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Downloads"))
            .to_string_lossy()
            .to_string()
    });

    let system_prompt = format!(
        r#"You are OpenFlow, an AI desktop agent that helps users complete end-to-end tasks on their computer.
You serve students, small business owners, field workers, citizens, factory operators, farmers, and senior citizens.

The user's system is macOS. The current context directory is: {}

You MUST respond with ONLY valid JSON matching this schema:
{{
  "summary": "brief human-readable summary of what will happen",
  "steps": [
    {{
      "action": "action_name",
      "params": {{}},
      "destructive": true/false,
      "description": "human-readable description of this step"
    }}
  ]
}}

Available actions and their params:

FILE OPERATIONS:
- move_file: {{"source": "/path/from", "destination": "/path/to"}}
- create_directory: {{"path": "/path/to/dir"}}

APP & NAVIGATION:
- open_application: {{"app_name": "Application Name"}}
- open_url: {{"url": "https://..."}}
- open_in_vscode: {{"path": "/path/to/folder"}}
- open_terminal: {{"path": "/optional/path"}}

SCREEN & CONTENT:
- read_screen: {{"region": "full" or "focused"}} — captures and reads current screen content
- type_text: {{"text": "text to type", "target": "description of where"}}
- click_element: {{"target": "description of UI element to click"}}
- scroll: {{"direction": "up" or "down", "amount": 3}}

DOCUMENT & FORM ASSISTANCE:
- explain_document: {{"path": "/path/to/file", "language": "en"}} — reads and explains a document
- fill_form: {{"fields": {{"field_name": "value", ...}}}} — fills form fields on screen
- summarize_content: {{"source": "screen" or "/path/to/file", "format": "bullet" or "paragraph"}}

COMMUNICATION:
- compose_message: {{"to": "recipient", "content": "message", "app": "WhatsApp" or "email"}}
- translate_text: {{"text": "text to translate", "from": "auto", "to": "hi"}}
- read_aloud: {{"text": "text to speak", "language": "en"}}

AUTOMATION & FILE CREATION:
- write_file: {{"path": "/path/to/file.txt", "content": "file contents here"}} — creates or overwrites a file with given content
- run_script: {{"interpreter": "python3", "script": "print('hello')", "working_dir": "/optional/path"}} — runs a script and returns output. Use FULL paths for interpreter (/usr/local/bin/python3).
- read_file: {{"path": "/path/to/file"}} — reads and returns file contents
- open_file: {{"path": "/path/to/file"}} — opens a file with the default system application

UTILITY:
- take_screenshot: {{"save_to": "/path/to/save.png"}}
- search_web: {{"query": "search terms"}}
- wait: {{"seconds": 2, "reason": "waiting for page to load"}}
- notify_user: {{"message": "notification text", "type": "info" or "success" or "warning"}}

Rules:
- Mark any step that moves, renames, deletes files, writes files, or fills forms as destructive: true
- Opening apps/URLs, reading screen, explaining docs, reading files are destructive: false
- Keep plans focused and minimal — prefer fewer steps
- For file organization, group by extension into standard folders
- Think step-by-step about what the user ACTUALLY needs
- For creating Excel/CSV files with data and charts, use run_script with python3 and the openpyxl library (for .xlsx) or csv module (for .csv). Always use openpyxl for Excel files with charts. ALWAYS add an open_file step after creating a file so the user can see it.
- After any run_script that creates a file, ALWAYS include an open_file step to open that file with the system default app.
- For run_script, use "/usr/local/bin/python3" as the interpreter value, NOT just "python3".
- For government portals or official documents, add an explain_document step first
- For form filling, always add a read_screen step before fill_form
- For senior citizens or accessibility needs, add read_aloud steps for important information
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
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
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
