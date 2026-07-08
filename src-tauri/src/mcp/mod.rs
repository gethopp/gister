pub mod bridge;

use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{schemars, tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler};
use serde_json::Value;

pub use bridge::McpBridge;

/// Loopback address the streamable-HTTP MCP endpoint binds to. Agents connect
/// to `http://127.0.0.1:1996/mcp` while the Gister app is running.
const MCP_BIND: &str = "127.0.0.1:1996";

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListGistsParams {
    /// Maximum number of gists to return, most recently updated first.
    pub limit: Option<u32>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchGistsParams {
    /// Text to fuzzy-match against gist descriptions and filenames.
    pub query: String,
    /// Maximum number of matches to return.
    pub limit: Option<u32>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct IdParams {
    /// The gist id.
    pub id: String,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewFile {
    /// The file name, including extension (drives syntax highlighting).
    pub filename: String,
    /// The full text content of the file.
    pub content: String,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateGistParams {
    /// Optional description shown as the gist title.
    pub description: Option<String>,
    /// One or more files to include in the gist.
    pub files: Vec<NewFile>,
    /// Whether the gist is public. Defaults to false (secret). Cannot be changed later.
    pub is_public: Option<bool>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilePatch {
    /// The current file name on GitHub to target.
    pub filename: String,
    /// New content for the file. Omit to leave content unchanged.
    pub content: Option<String>,
    /// Rename the file to this name. Omit to keep the current name.
    pub new_filename: Option<String>,
    /// Set true to delete this file from the gist.
    pub deleted: Option<bool>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGistParams {
    /// The gist id to update.
    pub id: String,
    /// New description. Omit to keep the current description.
    pub description: Option<String>,
    /// File edits: content changes, renames, additions (new filename), or deletions.
    pub files: Option<Vec<FilePatch>>,
}

/// MCP server exposing the signed-in user's gists. Every tool forwards to the
/// running Gister WebView via [`McpBridge`]; this type holds no GitHub state.
#[derive(Clone)]
pub struct GisterServer {
    bridge: Arc<McpBridge>,
    tool_router: ToolRouter<GisterServer>,
}

impl GisterServer {
    pub fn new(bridge: Arc<McpBridge>) -> Self {
        Self {
            bridge,
            tool_router: Self::tool_router(),
        }
    }

    async fn forward(&self, tool: &str, args: Value) -> Result<CallToolResult, McpError> {
        match self.bridge.request(tool, args).await {
            Ok(value) => {
                let text =
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
                Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
            }
            Err(message) => Err(McpError::internal_error(message, None)),
        }
    }
}

#[tool_router]
impl GisterServer {
    #[tool(
        description = "List the signed-in user's gists (most recently updated first). Returns metadata only, no file contents."
    )]
    async fn list_gists(
        &self,
        Parameters(params): Parameters<ListGistsParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("list_gists", to_args(&params)).await
    }

    #[tool(
        description = "Fuzzy-search the user's gists by description and filenames. Returns matching gists as metadata."
    )]
    async fn search_gists(
        &self,
        Parameters(params): Parameters<SearchGistsParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("search_gists", to_args(&params)).await
    }

    #[tool(description = "Read a single gist by id, including every file's full text content.")]
    async fn read_gist(
        &self,
        Parameters(params): Parameters<IdParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("read_gist", to_args(&params)).await
    }

    #[tool(
        description = "Create a new gist with one or more files. `files` is an array of objects, \
                       each with a `filename` (include the extension, it drives syntax \
                       highlighting) and its full `content` as a string. `description` is \
                       optional. `isPublic` defaults to false (a secret gist) and is fixed at \
                       creation — it cannot be changed later. Example payload: \
                       {\"description\": \"Fibonacci helpers\", \"isPublic\": false, \
                       \"files\": [{\"filename\": \"fib.py\", \"content\": \"def fib(n): ...\"}, \
                       {\"filename\": \"README.md\", \"content\": \"# Notes\"}]}. \
                       Returns the created gist with its id, htmlUrl, and file contents."
    )]
    async fn create_gist(
        &self,
        Parameters(params): Parameters<CreateGistParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("create_gist", to_args(&params)).await
    }

    #[tool(
        description = "Update an existing gist: change its description, and edit, rename, add, or delete files."
    )]
    async fn update_gist(
        &self,
        Parameters(params): Parameters<UpdateGistParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("update_gist", to_args(&params)).await
    }

    #[tool(description = "Permanently delete a gist by id.")]
    async fn delete_gist(
        &self,
        Parameters(params): Parameters<IdParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("delete_gist", to_args(&params)).await
    }

    #[tool(description = "Get the public web URL (html_url) of a gist by id.")]
    async fn get_gist_url(
        &self,
        Parameters(params): Parameters<IdParams>,
    ) -> Result<CallToolResult, McpError> {
        self.forward("get_gist_url", to_args(&params)).await
    }

    #[tool(description = "Get the currently signed-in GitHub user's profile (login, name, email).")]
    async fn get_current_user(&self) -> Result<CallToolResult, McpError> {
        self.forward("get_current_user", Value::Null).await
    }

    #[tool(description = "Trigger a background sync with GitHub to refresh the local gist cache.")]
    async fn sync_gists(&self) -> Result<CallToolResult, McpError> {
        self.forward("sync_gists", Value::Null).await
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for GisterServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::from_build_env())
            .with_instructions(
                "Manage the signed-in user's GitHub gists through the running Gister app. \
                 Tools cover listing, searching, reading, creating, updating, deleting gists, \
                 fetching a gist's link, the current user, and triggering a sync."
                    .to_string(),
            )
    }
}

/// Serialize tool parameters into the JSON args forwarded to the WebView.
/// These types always serialize cleanly, so a failure falls back to null.
fn to_args<T: serde::Serialize>(params: &T) -> Value {
    serde_json::to_value(params).unwrap_or(Value::Null)
}

/// Start the streamable-HTTP MCP server on the loopback address. Runs until the
/// process exits; intended to be spawned on the Tauri async runtime.
pub async fn serve(bridge: Arc<McpBridge>) -> std::io::Result<()> {
    let service = StreamableHttpService::new(
        move || Ok(GisterServer::new(bridge.clone())),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig::default(),
    );
    let router = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind(MCP_BIND).await?;
    log::info!("Gister MCP server listening on http://{MCP_BIND}/mcp");
    axum::serve(listener, router).await
}
