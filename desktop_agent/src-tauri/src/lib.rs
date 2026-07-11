mod commands;
mod db;
mod planner;

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_sql::Builder as SqlBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::from_filename("../.env").ok();
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:nova.db", db::get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _event, shortcut_event| {
                    if shortcut_event.state == ShortcutState::Pressed {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::window::open_chat_window(handle).await;
                        });
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::list_files,
            commands::filesystem::create_directory,
            commands::filesystem::move_file,
            commands::filesystem::move_files_batch,
            commands::apps::open_application,
            commands::apps::open_url,
            commands::apps::open_in_vscode,
            commands::apps::open_terminal,
            commands::window::get_cursor_position,
            commands::window::open_chat_window,
            commands::window::close_chat_window,
            planner::generate_plan,
        ])
        .setup(|app| {
            let shortcut: Shortcut = "CommandOrControl+Shift+Space".parse().unwrap();
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
