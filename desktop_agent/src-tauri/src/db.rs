use serde::{Deserialize, Serialize};
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityLog {
    pub id: Option<i64>,
    pub command: String,
    pub plan_json: String,
    pub status: String, // "success" | "partial" | "failed"
    pub steps_total: i32,
    pub steps_succeeded: i32,
    pub steps_failed: i32,
    pub duration_ms: i64,
    pub created_at: String,
}

pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create activity_log table",
        sql: "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            plan_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            steps_total INTEGER NOT NULL DEFAULT 0,
            steps_succeeded INTEGER NOT NULL DEFAULT 0,
            steps_failed INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
        kind: MigrationKind::Up,
    }]
}
