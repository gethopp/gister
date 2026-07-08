use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

/// How long an MCP tool call waits for the WebView to respond before giving up.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Payload emitted to the WebView for every MCP tool call.
#[derive(Clone, serde::Serialize)]
struct McpRequest {
    id: String,
    tool: String,
    args: Value,
}

pub struct McpBridge {
    app: AppHandle,
    pending: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
    counter: AtomicU64,
}

impl McpBridge {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
        }
    }

    fn next_id(&self) -> String {
        format!("mcp-{}", self.counter.fetch_add(1, Ordering::Relaxed))
    }

    /// Forward a tool call into the WebView and await its JSON result. Returns
    /// `Err` with a human-readable message on timeout, transport failure, or a
    /// tool error reported by the frontend.
    pub async fn request(&self, tool: &str, args: Value) -> Result<Value, String> {
        let id = self.next_id();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);

        let payload = McpRequest {
            id: id.clone(),
            tool: tool.to_string(),
            args,
        };
        if let Err(err) = self.app.emit("mcp:request", payload) {
            self.pending.lock().unwrap().remove(&id);
            return Err(format!("failed to reach the Gister app: {err}"));
        }

        match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("the Gister app dropped the request".to_string()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("timed out waiting for the Gister app (is it open and signed in?)".to_string())
            }
        }
    }

    fn resolve(&self, id: &str, result: Result<Value, String>) {
        if let Some(tx) = self.pending.lock().unwrap().remove(id) {
            let _ = tx.send(result);
        }
    }
}

/// Frontend callback that delivers a tool result back to the waiting MCP request.
#[tauri::command]
pub fn mcp_respond(
    bridge: State<'_, Arc<McpBridge>>,
    id: String,
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
) {
    let result = if ok {
        Ok(data.unwrap_or(Value::Null))
    } else {
        Err(error.unwrap_or_else(|| "unknown error".to_string()))
    };
    bridge.resolve(&id, result);
}
