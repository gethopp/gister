mod mcp;

use std::sync::Arc;

use mcp::McpBridge;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![mcp::bridge::mcp_respond])
    .setup(|app| {
      #[cfg(desktop)]
      {
        app
          .handle()
          .plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let bridge = Arc::new(McpBridge::new(app.handle().clone()));
      app.manage(bridge.clone());
      tauri::async_runtime::spawn(async move {
        if let Err(err) = mcp::serve(bridge).await {
          log::error!("Gister MCP server failed to start: {err}");
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
