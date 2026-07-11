use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveResult {
    pub source: String,
    pub destination: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn list_files(dir: String) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", dir));
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let path_buf = entry.path();

        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path_buf.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            extension: path_buf.extension().map(|e| e.to_string_lossy().to_string()),
            size_bytes: metadata.len(),
        });
    }

    Ok(files)
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
pub async fn move_file(source: String, destination: String) -> Result<MoveResult, String> {
    let src = Path::new(&source);
    if !src.exists() {
        return Ok(MoveResult {
            source: source.clone(),
            destination,
            success: false,
            error: Some(format!("Source does not exist: {}", source)),
        });
    }

    let dest = Path::new(&destination);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    match fs::rename(&source, &destination) {
        Ok(_) => Ok(MoveResult {
            source,
            destination,
            success: true,
            error: None,
        }),
        Err(e) => {
            // rename fails across filesystems, fall back to copy+delete
            if src.is_file() {
                match fs::copy(&source, &destination) {
                    Ok(_) => {
                        fs::remove_file(&source).map_err(|e| e.to_string())?;
                        Ok(MoveResult {
                            source,
                            destination,
                            success: true,
                            error: None,
                        })
                    }
                    Err(copy_err) => Ok(MoveResult {
                        source,
                        destination,
                        success: false,
                        error: Some(copy_err.to_string()),
                    }),
                }
            } else {
                Ok(MoveResult {
                    source,
                    destination,
                    success: false,
                    error: Some(e.to_string()),
                })
            }
        }
    }
}

#[tauri::command]
pub async fn move_files_batch(moves: Vec<(String, String)>) -> Result<Vec<MoveResult>, String> {
    let mut results = Vec::new();
    for (source, destination) in moves {
        let result = move_file(source, destination).await?;
        results.push(result);
    }
    Ok(results)
}
