use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const NOTION_VERSION: &str = "2022-06-28";

static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static TOKENS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static SYNC_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
static AUTH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
static SYNC_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn store_mutex() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

fn tokens_mutex() -> &'static Mutex<()> {
    TOKENS_LOCK.get_or_init(|| Mutex::new(()))
}

fn sync_async_mutex() -> &'static tokio::sync::Mutex<()> {
    SYNC_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn generate_local_id(prefix: &str) -> String {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}_{}_{}", prefix, now_ms(), seq)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Zenith/1.3")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub completed: bool,
    /// "local" | "google" | "notion"
    pub source: String,
    #[serde(default)]
    pub remote_id: Option<String>,
    #[serde(default)]
    pub remote_list_id: Option<String>,
    #[serde(default)]
    pub due: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub content: String,
    /// "local" | "notion"
    pub source: String,
    #[serde(default)]
    pub remote_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TasksStoreData {
    #[serde(default)]
    pub tasks: Vec<TaskItem>,
    #[serde(default)]
    pub notes: Vec<NoteItem>,
    #[serde(default)]
    pub last_synced_at: Option<i64>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TasksSyncStatus {
    pub syncing: bool,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    pub google_connected: bool,
    pub notion_tasks_configured: bool,
    pub notion_notes_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TasksSnapshot {
    pub tasks: Vec<TaskItem>,
    pub notes: Vec<NoteItem>,
    pub sync_status: TasksSyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTaskList {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct GoogleTokensFile {
    #[serde(default)]
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    expires_at_ms: i64,
    #[serde(default)]
    lists: Vec<GoogleTaskList>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAuthStatus {
    pub connected: bool,
    pub has_refresh_token: bool,
    pub lists: Vec<GoogleTaskList>,
    pub selected_list_id: String,
    pub auth_in_progress: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionTestResult {
    pub workspace_name: Option<String>,
    pub tasks_db_title: Option<String>,
    pub notes_title: Option<String>,
    pub detected_title_prop: Option<String>,
    pub detected_done_prop: Option<String>,
    pub detected_notes_prop: Option<String>,
}

#[derive(Debug, Clone)]
struct TasksConfig {
    notion_token: String,
    notion_tasks_db: String,
    notion_notes_id: String,
    google_client_id: String,
    google_client_secret: String,
    google_list_id: String,
}

fn read_config(app: &AppHandle) -> TasksConfig {
    let get = |key: &str| -> String {
        crate::utils::get_setting_str(app, key)
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let list_id = get("zenith-tasks-google-list-id");
    TasksConfig {
        notion_token: get("zenith-tasks-notion-token"),
        notion_tasks_db: get("zenith-tasks-notion-tasks-db"),
        notion_notes_id: get("zenith-tasks-notion-notes-db"),
        google_client_id: get("zenith-tasks-google-client-id"),
        google_client_secret: get("zenith-tasks-google-client-secret"),
        google_list_id: if list_id.is_empty() {
            "@default".to_string()
        } else {
            list_id
        },
    }
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("tasks_store.json"))
}

fn tokens_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("tasks_tokens.json"))
}

fn write_json_atomic<T: Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn load_store(app: &AppHandle) -> TasksStoreData {
    let _guard = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(path) = store_path(app) else {
        return TasksStoreData::default();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return TasksStoreData::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn mutate_store<F, R>(app: &AppHandle, f: F) -> Result<(R, TasksStoreData), String>
where
    F: FnOnce(&mut TasksStoreData) -> R,
{
    let _guard = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let path = store_path(app)?;
    let mut store: TasksStoreData = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let res = f(&mut store);
    write_json_atomic(&path, &store)?;
    Ok((res, store))
}

fn load_tokens(app: &AppHandle) -> GoogleTokensFile {
    let _guard = tokens_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(path) = tokens_path(app) else {
        return GoogleTokensFile::default();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_tokens(app: &AppHandle, tokens: &GoogleTokensFile) -> Result<(), String> {
    let _guard = tokens_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let path = tokens_path(app)?;
    write_json_atomic(&path, tokens)
}

fn build_snapshot(app: &AppHandle, store: &TasksStoreData) -> TasksSnapshot {
    let cfg = read_config(app);
    let tokens = load_tokens(app);
    let google_connected =
        !tokens.access_token.is_empty() || !tokens.refresh_token.is_empty();
    let notion_tasks_configured =
        !cfg.notion_token.is_empty() && !notion_normalize_id(&cfg.notion_tasks_db).is_empty();
    let notion_notes_configured =
        !cfg.notion_token.is_empty() && !notion_normalize_id(&cfg.notion_notes_id).is_empty();

    let mut tasks: Vec<TaskItem> = store
        .tasks
        .iter()
        .filter(|t| !t.deleted)
        .cloned()
        .collect();
    tasks.sort_by(|a, b| {
        a.completed
            .cmp(&b.completed)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
    });

    let mut notes: Vec<NoteItem> = store
        .notes
        .iter()
        .filter(|n| !n.deleted)
        .cloned()
        .collect();
    notes.sort_by_key(|a| std::cmp::Reverse(a.updated_at));

    TasksSnapshot {
        tasks,
        notes,
        sync_status: TasksSyncStatus {
            syncing: SYNC_IN_FLIGHT.load(Ordering::Relaxed),
            last_synced_at: store.last_synced_at,
            last_error: store.last_error.clone(),
            google_connected,
            notion_tasks_configured,
            notion_notes_configured,
        },
    }
}

fn emit_snapshot(app: &AppHandle) {
    let store = load_store(app);
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap);
}

pub fn get_snapshot(app: &AppHandle) -> TasksSnapshot {
    let store = load_store(app);
    build_snapshot(app, &store)
}

fn resolve_target_source(app: &AppHandle, requested: Option<String>) -> String {
    let req = requested.unwrap_or_default().trim().to_lowercase();
    if req == "local" || req == "google" || req == "notion" {
        return req;
    }
    let cfg = read_config(app);
    let tokens = load_tokens(app);
    let google_ok = !tokens.access_token.is_empty() || !tokens.refresh_token.is_empty();
    let notion_ok =
        !cfg.notion_token.is_empty() && !notion_normalize_id(&cfg.notion_tasks_db).is_empty();
    let default_src = crate::utils::get_setting_str(app, "zenith-tasks-default-source")
        .unwrap_or_else(|| "auto".to_string());
    match default_src.as_str() {
        "google" if google_ok => "google".to_string(),
        "notion" if notion_ok => "notion".to_string(),
        "local" => "local".to_string(),
        _ => {
            if google_ok {
                "google".to_string()
            } else if notion_ok {
                "notion".to_string()
            } else {
                "local".to_string()
            }
        }
    }
}

pub fn add_task(
    app: &AppHandle,
    title: String,
    notes: String,
    source: Option<String>,
) -> Result<TasksSnapshot, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Task title cannot be empty".to_string());
    }
    let target_source = resolve_target_source(app, source);
    let ts = now_ms();
    let item = TaskItem {
        id: generate_local_id("task"),
        title: trimmed,
        notes: notes.trim().to_string(),
        completed: false,
        source: target_source.clone(),
        remote_id: None,
        remote_list_id: None,
        due: None,
        created_at: ts,
        updated_at: ts,
        dirty: target_source != "local",
        deleted: false,
        sync_error: None,
    };

    let (_, store) = mutate_store(app, |s| {
        s.tasks.insert(0, item);
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());

    if target_source != "local" {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn toggle_task(app: &AppHandle, id: String) -> Result<TasksSnapshot, String> {
    let mut needs_sync = false;
    let (_, store) = mutate_store(app, |s| {
        if let Some(task) = s.tasks.iter_mut().find(|t| t.id == id && !t.deleted) {
            task.completed = !task.completed;
            task.updated_at = now_ms();
            task.sync_error = None;
            if task.source != "local" {
                task.dirty = true;
                needs_sync = true;
            }
        }
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if needs_sync {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn update_task(
    app: &AppHandle,
    id: String,
    title: String,
    notes: String,
) -> Result<TasksSnapshot, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Task title cannot be empty".to_string());
    }
    let mut needs_sync = false;
    let (_, store) = mutate_store(app, |s| {
        if let Some(task) = s.tasks.iter_mut().find(|t| t.id == id && !t.deleted) {
            task.title = trimmed;
            task.notes = notes.trim().to_string();
            task.updated_at = now_ms();
            task.sync_error = None;
            if task.source != "local" {
                task.dirty = true;
                needs_sync = true;
            }
        }
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if needs_sync {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn delete_task(app: &AppHandle, id: String) -> Result<TasksSnapshot, String> {
    let mut needs_sync = false;
    let (_, store) = mutate_store(app, |s| {
        if let Some(pos) = s.tasks.iter().position(|t| t.id == id) {
            let has_remote = s.tasks[pos].remote_id.is_some() && s.tasks[pos].source != "local";
            if has_remote {
                s.tasks[pos].deleted = true;
                s.tasks[pos].dirty = true;
                s.tasks[pos].updated_at = now_ms();
                needs_sync = true;
            } else {
                s.tasks.remove(pos);
            }
        }
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if needs_sync {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn add_note(
    app: &AppHandle,
    title: String,
    content: String,
    sync_to_notion: bool,
) -> Result<TasksSnapshot, String> {
    let cfg = read_config(app);
    let notion_notes_ready =
        !cfg.notion_token.is_empty() && !notion_normalize_id(&cfg.notion_notes_id).is_empty();
    let source = if sync_to_notion && notion_notes_ready {
        "notion".to_string()
    } else {
        "local".to_string()
    };
    let ts = now_ms();
    let note = NoteItem {
        id: generate_local_id("note"),
        title: title.trim().to_string(),
        content,
        source: source.clone(),
        remote_id: None,
        created_at: ts,
        updated_at: ts,
        dirty: source == "notion",
        deleted: false,
        sync_error: None,
    };

    let (_, store) = mutate_store(app, |s| {
        s.notes.insert(0, note);
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if source == "notion" {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn update_note(
    app: &AppHandle,
    id: String,
    title: String,
    content: String,
    trigger_sync: bool,
) -> Result<TasksSnapshot, String> {
    let mut needs_sync = false;
    let (_, store) = mutate_store(app, |s| {
        if let Some(note) = s.notes.iter_mut().find(|n| n.id == id && !n.deleted) {
            note.title = title.trim().to_string();
            note.content = content;
            note.updated_at = now_ms();
            note.sync_error = None;
            if note.source == "notion" {
                note.dirty = true;
                needs_sync = true;
            }
        }
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if needs_sync && trigger_sync {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

pub fn delete_note(app: &AppHandle, id: String) -> Result<TasksSnapshot, String> {
    let mut needs_sync = false;
    let (_, store) = mutate_store(app, |s| {
        if let Some(pos) = s.notes.iter().position(|n| n.id == id) {
            let has_remote = s.notes[pos].remote_id.is_some() && s.notes[pos].source == "notion";
            if has_remote {
                s.notes[pos].deleted = true;
                s.notes[pos].dirty = true;
                s.notes[pos].updated_at = now_ms();
                needs_sync = true;
            } else {
                s.notes.remove(pos);
            }
        }
    })?;
    let snap = build_snapshot(app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    if needs_sync {
        spawn_background_sync(app.clone());
    }
    Ok(snap)
}

fn spawn_background_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = sync_now(app).await;
    });
}

// ============================================================================
// Notion ID & Schema Helpers
// ============================================================================

/// Extracts a 32-hex Notion ID (formatted as 8-4-4-4-12 UUID) from either a
/// raw ID, dashed UUID, or a full Notion URL. Returns an empty string if none.
pub fn notion_normalize_id(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // Strip query string / fragment if URL
    let before_query = trimmed.split(&['?', '#'][..]).next().unwrap_or(trimmed);
    // Look for the last 32-hex sequence (ignoring hyphens) across path segments
    for seg in before_query.rsplit('/') {
        let hex: String = seg.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        if hex.len() >= 32 {
            let id = &hex[hex.len() - 32..];
            return format!(
                "{}-{}-{}-{}-{}",
                &id[0..8],
                &id[8..12],
                &id[12..16],
                &id[16..20],
                &id[20..32]
            )
            .to_lowercase();
        }
    }
    String::new()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotionDoneKind {
    Checkbox,
    Status { done_name: String, todo_name: String },
}

#[derive(Debug, Clone)]
pub struct NotionDbSchema {
    pub title_prop: String,
    pub done_prop: Option<(String, NotionDoneKind)>,
    pub notes_prop: Option<String>,
    pub db_title: Option<String>,
}

pub fn parse_notion_db_schema(db_json: &serde_json::Value) -> NotionDbSchema {
    let db_title = db_json
        .get("title")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.get("plain_text").and_then(|p| p.as_str()))
                .collect::<String>()
        })
        .filter(|s| !s.is_empty());

    let mut title_prop = "Name".to_string();
    let mut done_prop: Option<(String, NotionDoneKind)> = None;
    let mut notes_prop: Option<String> = None;

    if let Some(props) = db_json.get("properties").and_then(|v| v.as_object()) {
        for (name, prop) in props {
            let ptype = prop.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if ptype == "title" {
                title_prop = name.clone();
            } else if ptype == "checkbox" && done_prop.is_none() {
                done_prop = Some((name.clone(), NotionDoneKind::Checkbox));
            } else if ptype == "status" && done_prop.is_none() {
                let mut done_name = "Done".to_string();
                let mut todo_name = "Not started".to_string();
                if let Some(opts) = prop
                    .get("status")
                    .and_then(|s| s.get("options"))
                    .and_then(|o| o.as_array())
                {
                    for opt in opts {
                        let oname = opt.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let lower = oname.to_lowercase();
                        if lower.contains("done")
                            || lower.contains("complete")
                            || lower == "تم"
                            || lower == "مكتمل"
                        {
                            done_name = oname.to_string();
                        } else if lower.contains("not started")
                            || lower.contains("to do")
                            || lower.contains("todo")
                            || lower == "قيد الانتظار"
                        {
                            todo_name = oname.to_string();
                        }
                    }
                }
                done_prop = Some((
                    name.clone(),
                    NotionDoneKind::Status {
                        done_name,
                        todo_name,
                    },
                ));
            } else if ptype == "rich_text" {
                let lower = name.to_lowercase();
                let preferred = lower.contains("note")
                    || lower.contains("detail")
                    || lower.contains("desc")
                    || lower.contains("content")
                    || lower.contains("body")
                    || name.contains("ملاحظ");
                if preferred || notes_prop.is_none() {
                    notes_prop = Some(name.clone());
                }
            }
        }
    }

    NotionDbSchema {
        title_prop,
        done_prop,
        notes_prop,
        db_title,
    }
}

fn extract_notion_rich_text(val: &serde_json::Value) -> String {
    val.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("plain_text").and_then(|t| t.as_str()))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn build_notion_rich_text(text: &str) -> serde_json::Value {
    if text.is_empty() {
        serde_json::json!([])
    } else {
        // Notion rich_text items cap at 2000 chars each; chunk safely.
        let mut chunks = Vec::new();
        let mut current = String::new();
        for ch in text.chars() {
            current.push(ch);
            if current.chars().count() >= 1900 {
                chunks.push(serde_json::json!({ "text": { "content": current } }));
                current.clear();
            }
        }
        if !current.is_empty() {
            chunks.push(serde_json::json!({ "text": { "content": current } }));
        }
        serde_json::Value::Array(chunks)
    }
}

async fn fetch_notion_db_schema(
    client: &Client,
    token: &str,
    db_id: &str,
) -> Result<NotionDbSchema, String> {
    let url = format!("https://api.notion.com/v1/databases/{}", db_id);
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| format!("Notion request failed: {}", e))?;

    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid Notion response: {}", e))?;
    if !status.is_success() {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Notion API error");
        return Err(format!("Notion ({}): {}", status.as_u16(), msg));
    }
    Ok(parse_notion_db_schema(&body))
}

async fn fetch_notion_page_blocks_text(
    client: &Client,
    token: &str,
    page_id: &str,
) -> Result<String, String> {
    let url = format!(
        "https://api.notion.com/v1/blocks/{}/children?page_size=100",
        page_id
    );
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| format!("Notion blocks request failed: {}", e))?;
    if !resp.status().is_success() {
        return Ok(String::new());
    }
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    let mut lines = Vec::new();
    if let Some(results) = body.get("results").and_then(|r| r.as_array()) {
        for block in results {
            let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if let Some(rich) = block.get(btype).and_then(|b| b.get("rich_text")) {
                let text = extract_notion_rich_text(rich);
                if !text.is_empty() {
                    lines.push(text);
                }
            }
        }
    }
    Ok(lines.join("\n"))
}

async fn replace_notion_page_paragraph_blocks(
    client: &Client,
    token: &str,
    page_id: &str,
    content: &str,
) -> Result<(), String> {
    // Archive existing blocks first
    let list_url = format!(
        "https://api.notion.com/v1/blocks/{}/children?page_size=100",
        page_id
    );
    if let Ok(resp) = client
        .get(&list_url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
    {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            if let Some(results) = body.get("results").and_then(|r| r.as_array()) {
                for block in results {
                    if let Some(bid) = block.get("id").and_then(|v| v.as_str()) {
                        let del_url = format!("https://api.notion.com/v1/blocks/{}", bid);
                        let _ = client
                            .delete(&del_url)
                            .bearer_auth(token)
                            .header("Notion-Version", NOTION_VERSION)
                            .send()
                            .await;
                    }
                }
            }
        }
    }

    let lines: Vec<&str> = if content.trim().is_empty() {
        vec![]
    } else {
        content.lines().collect()
    };
    if lines.is_empty() {
        return Ok(());
    }

    let children: Vec<serde_json::Value> = lines
        .into_iter()
        .take(90)
        .map(|line| {
            serde_json::json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": build_notion_rich_text(line)
                }
            })
        })
        .collect();

    let append_url = format!("https://api.notion.com/v1/blocks/{}/children", page_id);
    let resp = client
        .patch(&append_url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .json(&serde_json::json!({ "children": children }))
        .send()
        .await
        .map_err(|e| format!("Failed updating Notion note blocks: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Notion blocks ({}): {}", status.as_u16(), text));
    }
    Ok(())
}

pub async fn test_notion(
    token: String,
    tasks_db_raw: String,
    notes_raw: String,
) -> Result<NotionTestResult, String> {
    let tok = token.trim();
    if tok.is_empty() {
        return Err("Enter your Notion integration token first.".to_string());
    }
    let client = http_client()?;
    let me_resp = client
        .get("https://api.notion.com/v1/users/me")
        .bearer_auth(tok)
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let me_status = me_resp.status();
    let me_body: serde_json::Value = me_resp.json().await.unwrap_or(serde_json::Value::Null);
    if !me_status.is_success() {
        let msg = me_body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Invalid Notion token");
        return Err(format!("Notion auth failed: {}", msg));
    }

    let workspace_name = me_body
        .get("bot")
        .and_then(|b| b.get("workspace_name"))
        .and_then(|w| w.as_str())
        .map(|s| s.to_string());

    let mut tasks_db_title = None;
    let mut detected_title_prop = None;
    let mut detected_done_prop = None;
    let mut detected_notes_prop = None;

    let tasks_db_id = notion_normalize_id(&tasks_db_raw);
    if !tasks_db_id.is_empty() {
        let schema = fetch_notion_db_schema(&client, tok, &tasks_db_id).await?;
        tasks_db_title = schema.db_title.or_else(|| Some("Tasks Database".to_string()));
        detected_title_prop = Some(schema.title_prop);
        detected_done_prop = schema.done_prop.map(|(n, _)| n);
        detected_notes_prop = schema.notes_prop;
    }

    let mut notes_title = None;
    let notes_id = notion_normalize_id(&notes_raw);
    if !notes_id.is_empty() {
        match fetch_notion_db_schema(&client, tok, &notes_id).await {
            Ok(schema) => {
                notes_title = schema.db_title.or_else(|| Some("Notes Database".to_string()));
            }
            Err(_) => {
                // Fallback: try as a standalone Notion Page
                let page_url = format!("https://api.notion.com/v1/pages/{}", notes_id);
                let presp = client
                    .get(&page_url)
                    .bearer_auth(tok)
                    .header("Notion-Version", NOTION_VERSION)
                    .send()
                    .await
                    .map_err(|e| format!("Notion notes check failed: {}", e))?;
                if presp.status().is_success() {
                    notes_title = Some("Synced Notion Page".to_string());
                } else {
                    return Err("Notion Notes ID was not found as a database or page (check integration access).".to_string());
                }
            }
        }
    }

    Ok(NotionTestResult {
        workspace_name,
        tasks_db_title,
        notes_title,
        detected_title_prop,
        detected_done_prop,
        detected_notes_prop,
    })
}

// ============================================================================
// Google OAuth 2.0 Loopback Flow & Token Refresh
// ============================================================================

pub fn parse_oauth_callback_query(request_line: &str) -> (Option<String>, Option<String>, Option<String>) {
    // e.g. "GET /callback?code=abc&state=xyz HTTP/1.1"
    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split_once('?').map(|x| x.1).unwrap_or("");
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        let decoded = url_decode(v);
        match k {
            "code" if !decoded.is_empty() => code = Some(decoded),
            "state" if !decoded.is_empty() => state = Some(decoded),
            "error" if !decoded.is_empty() => error = Some(decoded),
            _ => {}
        }
    }
    (code, state, error)
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push_str("%20"),
            _ => {
                out.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    out
}

fn encode_form_body(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", url_encode(k), url_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
            out.push(bytes[i]);
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn get_google_auth_status(app: &AppHandle) -> GoogleAuthStatus {
    let cfg = read_config(app);
    let tokens = load_tokens(app);
    GoogleAuthStatus {
        connected: !tokens.access_token.is_empty() || !tokens.refresh_token.is_empty(),
        has_refresh_token: !tokens.refresh_token.is_empty(),
        lists: tokens.lists,
        selected_list_id: cfg.google_list_id,
        auth_in_progress: AUTH_IN_FLIGHT.load(Ordering::Relaxed),
        error: None,
    }
}

pub fn google_disconnect(app: &AppHandle) -> Result<GoogleAuthStatus, String> {
    if let Ok(path) = tokens_path(app) {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
    let status = get_google_auth_status(app);
    let _ = app.emit("tasks-auth-updated", status.clone());
    emit_snapshot(app);
    Ok(status)
}

async fn fetch_google_lists(client: &Client, access_token: &str) -> Vec<GoogleTaskList> {
    let Ok(resp) = client
        .get("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=50")
        .bearer_auth(access_token)
        .send()
        .await
    else {
        return vec![];
    };
    if !resp.status().is_success() {
        return vec![];
    }
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    body.get("items")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let title = item.get("title")?.as_str()?.to_string();
                    Some(GoogleTaskList { id, title })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub async fn google_start_auth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<GoogleAuthStatus, String> {
    let cid = client_id.trim().to_string();
    let csec = client_secret.trim().to_string();
    if cid.is_empty() || csec.is_empty() {
        return Err("Enter both Google Client ID and Client Secret in Settings first.".to_string());
    }
    if AUTH_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return Err("Google sign-in is already waiting in your browser.".to_string());
    }

    struct AuthGuard;
    impl Drop for AuthGuard {
        fn drop(&mut self) {
            AUTH_IN_FLIGHT.store(false, Ordering::SeqCst);
        }
    }
    let _guard = AuthGuard;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to open local OAuth callback port: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read callback port: {}", e))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let state_nonce = format!("zenith_{}", now_ms());

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
        url_encode(&cid),
        url_encode(&redirect_uri),
        url_encode("https://www.googleapis.com/auth/tasks"),
        url_encode(&state_nonce),
    );

    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Could not open browser for Google sign-in: {}", e))?;

    let expected_state = state_nonce.clone();
    let code = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Listener error: {}", e))?;
        let deadline = std::time::Instant::now() + Duration::from_secs(180);
        loop {
            if std::time::Instant::now() > deadline {
                return Err("Timed out waiting for Google sign-in in the browser.".to_string());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let first_line = req.lines().next().unwrap_or("");
                    if !first_line.contains("/callback") {
                        let _ = stream.write_all(
                            b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        );
                        continue;
                    }
                    let (maybe_code, maybe_state, maybe_err) =
                        parse_oauth_callback_query(first_line);

                    let ok = maybe_code.is_some()
                        && maybe_err.is_none()
                        && maybe_state.as_deref() == Some(expected_state.as_str());

                    let html = if ok {
                        "<!doctype html><html><body style='font-family:system-ui;background:#0e0e11;color:#f5f5f7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:32px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)'><h2 style='margin:0 0 8px'>Connected to Zenith</h2><p style='margin:0;opacity:0.75'>Google Tasks is linked. You can close this tab and return to Zenith.</p></div></body></html>"
                    } else {
                        "<!doctype html><html><body style='font-family:system-ui;background:#0e0e11;color:#f5f5f7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:32px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)'><h2 style='margin:0 0 8px'>Sign-in cancelled</h2><p style='margin:0;opacity:0.75'>You can close this tab and try again in Zenith Settings.</p></div></body></html>"
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if let Some(err) = maybe_err {
                        return Err(format!("Google sign-in denied: {}", err));
                    }
                    if maybe_state.as_deref() != Some(expected_state.as_str()) {
                        return Err("OAuth state mismatch.".to_string());
                    }
                    return maybe_code.ok_or_else(|| "Missing authorization code.".to_string());
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(e) => return Err(format!("OAuth listener error: {}", e)),
            }
        }
    })
    .await
    .map_err(|e| format!("OAuth task failed: {}", e))??;

    let client = http_client()?;
    let body_str = encode_form_body(&[
        ("code", code.as_str()),
        ("client_id", cid.as_str()),
        ("client_secret", csec.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ]);
    let token_resp = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let status = token_resp.status();
    let body: serde_json::Value = token_resp
        .json()
        .await
        .map_err(|e| format!("Invalid Google token response: {}", e))?;
    if !status.is_success() {
        let msg = body
            .get("error_description")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("Token exchange failed");
        return Err(format!("Google OAuth error: {}", msg));
    }

    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let refresh_token = body
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600);

    if access_token.is_empty() {
        return Err("Google returned an empty access token.".to_string());
    }

    let lists = fetch_google_lists(&client, &access_token).await;
    let existing = load_tokens(&app);
    let tokens_file = GoogleTokensFile {
        access_token,
        refresh_token: if refresh_token.is_empty() {
            existing.refresh_token
        } else {
            refresh_token
        },
        expires_at_ms: now_ms() + expires_in * 1000,
        lists,
    };
    save_tokens(&app, &tokens_file)?;

    let auth_status = get_google_auth_status(&app);
    let _ = app.emit("tasks-auth-updated", auth_status.clone());
    spawn_background_sync(app);
    Ok(auth_status)
}

async fn ensure_google_access_token(
    app: &AppHandle,
    client: &Client,
    cfg: &TasksConfig,
) -> Result<Option<String>, String> {
    let mut tokens = load_tokens(app);
    if tokens.access_token.is_empty() && tokens.refresh_token.is_empty() {
        return Ok(None);
    }

    let needs_refresh =
        tokens.access_token.is_empty() || now_ms() >= tokens.expires_at_ms - 60_000;
    if !needs_refresh {
        return Ok(Some(tokens.access_token));
    }

    if tokens.refresh_token.is_empty() {
        return Err("Google token expired. Please reconnect in Settings.".to_string());
    }
    if cfg.google_client_id.is_empty() || cfg.google_client_secret.is_empty() {
        return Err("Google Client ID / Secret missing in Settings.".to_string());
    }

    let body_str = encode_form_body(&[
        ("client_id", cfg.google_client_id.as_str()),
        ("client_secret", cfg.google_client_secret.as_str()),
        ("refresh_token", tokens.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ]);
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("Failed refreshing Google token: {}", e))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        let msg = body
            .get("error_description")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("Refresh failed");
        return Err(format!("Google token refresh failed: {}", msg));
    }

    let new_access = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600);
    if new_access.is_empty() {
        return Err("Google refresh returned empty token.".to_string());
    }

    tokens.access_token = new_access.clone();
    tokens.expires_at_ms = now_ms() + expires_in * 1000;
    let lists = fetch_google_lists(client, &new_access).await;
    if !lists.is_empty() {
        tokens.lists = lists;
    }
    let _ = save_tokens(app, &tokens);
    Ok(Some(new_access))
}

// ============================================================================
// Two-Way Sync Engine (Google Tasks + Notion Tasks & Notes)
// ============================================================================

#[derive(Debug, Clone)]
pub struct RemoteTaskRecord {
    pub remote_id: String,
    pub remote_list_id: Option<String>,
    pub title: String,
    pub notes: String,
    pub completed: bool,
    pub due: Option<String>,
}

/// Pure merge step for remote task pull: preserves dirty local edits and
/// pending deletes, updates clean items, adds new remote items, and prunes
/// clean items that were deleted remotely.
pub fn merge_remote_tasks(
    local_tasks: &mut Vec<TaskItem>,
    source: &str,
    remote_items: Vec<RemoteTaskRecord>,
    now: i64,
) {
    let remote_ids: HashSet<String> = remote_items.iter().map(|r| r.remote_id.clone()).collect();
    let mut existing_by_remote: HashMap<String, usize> = HashMap::new();
    for (idx, t) in local_tasks.iter().enumerate() {
        if t.source == source {
            if let Some(rid) = &t.remote_id {
                existing_by_remote.insert(rid.clone(), idx);
            }
        }
    }

    let mut to_insert = Vec::new();
    for r in remote_items {
        if let Some(&idx) = existing_by_remote.get(&r.remote_id) {
            let item = &mut local_tasks[idx];
            if !item.dirty && !item.deleted {
                item.title = r.title;
                item.notes = r.notes;
                item.completed = r.completed;
                item.due = r.due;
                item.remote_list_id = r.remote_list_id;
                item.sync_error = None;
            }
        } else {
            to_insert.push(TaskItem {
                id: format!("{}_{}", source, r.remote_id),
                title: r.title,
                notes: r.notes,
                completed: r.completed,
                source: source.to_string(),
                remote_id: Some(r.remote_id),
                remote_list_id: r.remote_list_id,
                due: r.due,
                created_at: now,
                updated_at: now,
                dirty: false,
                deleted: false,
                sync_error: None,
            });
        }
    }

    local_tasks.retain(|t| {
        if t.source != source {
            return true;
        }
        if t.dirty {
            return true;
        }
        match &t.remote_id {
            Some(rid) => remote_ids.contains(rid),
            None => true,
        }
    });

    local_tasks.extend(to_insert);
}

#[derive(Debug, Clone)]
pub struct RemoteNoteRecord {
    pub remote_id: String,
    pub title: String,
    pub content: String,
}

pub fn merge_remote_notes(
    local_notes: &mut Vec<NoteItem>,
    remote_items: Vec<RemoteNoteRecord>,
    now: i64,
) {
    let remote_ids: HashSet<String> = remote_items.iter().map(|r| r.remote_id.clone()).collect();
    let mut existing_by_remote: HashMap<String, usize> = HashMap::new();
    for (idx, n) in local_notes.iter().enumerate() {
        if n.source == "notion" {
            if let Some(rid) = &n.remote_id {
                existing_by_remote.insert(rid.clone(), idx);
            }
        }
    }

    let mut to_insert = Vec::new();
    for r in remote_items {
        if let Some(&idx) = existing_by_remote.get(&r.remote_id) {
            let item = &mut local_notes[idx];
            if !item.dirty && !item.deleted {
                item.title = r.title;
                item.content = r.content;
                item.sync_error = None;
            }
        } else {
            to_insert.push(NoteItem {
                id: format!("notion_{}", r.remote_id),
                title: r.title,
                content: r.content,
                source: "notion".to_string(),
                remote_id: Some(r.remote_id),
                created_at: now,
                updated_at: now,
                dirty: false,
                deleted: false,
                sync_error: None,
            });
        }
    }

    local_notes.retain(|n| {
        if n.source != "notion" || n.dirty {
            return true;
        }
        match &n.remote_id {
            Some(rid) => remote_ids.contains(rid),
            None => true,
        }
    });

    local_notes.extend(to_insert);
}

async fn sync_google_tasks(
    app: &AppHandle,
    client: &Client,
    cfg: &TasksConfig,
) -> Result<(), String> {
    let Some(token) = ensure_google_access_token(app, client, cfg).await? else {
        return Ok(());
    };
    let list_id = url_encode(&cfg.google_list_id);

    // 1. Push dirty Google tasks
    let dirty_items: Vec<TaskItem> = load_store(app)
        .tasks
        .into_iter()
        .filter(|t| t.source == "google" && t.dirty)
        .collect();

    for item in dirty_items {
        let target_list = item
            .remote_list_id
            .as_deref()
            .map(url_encode)
            .unwrap_or_else(|| list_id.clone());

        if item.deleted {
            if let Some(rid) = &item.remote_id {
                let del_url = format!(
                    "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks/{}",
                    target_list,
                    url_encode(rid)
                );
                let resp = client
                    .delete(&del_url)
                    .bearer_auth(&token)
                    .send()
                    .await
                    .map_err(|e| format!("Google delete failed: {}", e))?;
                if resp.status().is_success() || resp.status().as_u16() == 404 {
                    let _ = mutate_store(app, |s| {
                        s.tasks.retain(|t| t.id != item.id);
                    });
                }
            } else {
                let _ = mutate_store(app, |s| {
                    s.tasks.retain(|t| t.id != item.id);
                });
            }
            continue;
        }

        let payload = serde_json::json!({
            "title": item.title,
            "notes": item.notes,
            "status": if item.completed { "completed" } else { "needsAction" }
        });

        if let Some(rid) = &item.remote_id {
            let patch_url = format!(
                "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks/{}",
                target_list,
                url_encode(rid)
            );
            let resp = client
                .patch(&patch_url)
                .bearer_auth(&token)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Google update failed: {}", e))?;
            if resp.status().is_success() {
                let _ = mutate_store(app, |s| {
                    if let Some(t) = s.tasks.iter_mut().find(|t| t.id == item.id) {
                        t.dirty = false;
                        t.sync_error = None;
                    }
                });
            }
        } else {
            let create_url = format!(
                "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks",
                list_id
            );
            let resp = client
                .post(&create_url)
                .bearer_auth(&token)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Google create failed: {}", e))?;
            if resp.status().is_success() {
                let created: serde_json::Value =
                    resp.json().await.unwrap_or(serde_json::Value::Null);
                let new_rid = created
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let _ = mutate_store(app, |s| {
                    if let Some(t) = s.tasks.iter_mut().find(|t| t.id == item.id) {
                        t.remote_id = new_rid;
                        t.remote_list_id = Some(cfg.google_list_id.clone());
                        t.dirty = false;
                        t.sync_error = None;
                    }
                });
            }
        }
    }

    // 2. Pull remote Google tasks
    let pull_url = format!(
        "https://tasks.googleapis.com/tasks/v1/lists/{}/tasks?showCompleted=true&showHidden=true&maxResults=100",
        list_id
    );
    let resp = client
        .get(&pull_url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Google pull failed: {}", e))?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        let msg = body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("Google Tasks API error");
        return Err(format!("Google Tasks: {}", msg));
    }

    let remote_items: Vec<RemoteTaskRecord> = body
        .get("items")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let rid = item.get("id")?.as_str()?.to_string();
                    let title = item
                        .get("title")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if title.is_empty() {
                        return None;
                    }
                    let notes = item
                        .get("notes")
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string();
                    let completed =
                        item.get("status").and_then(|s| s.as_str()) == Some("completed");
                    let due = item
                        .get("due")
                        .and_then(|d| d.as_str())
                        .map(|s| s.to_string());
                    Some(RemoteTaskRecord {
                        remote_id: rid,
                        remote_list_id: Some(cfg.google_list_id.clone()),
                        title,
                        notes,
                        completed,
                        due,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let ts = now_ms();
    let _ = mutate_store(app, |s| {
        merge_remote_tasks(&mut s.tasks, "google", remote_items, ts);
    });
    Ok(())
}

fn build_notion_task_properties(
    schema: &NotionDbSchema,
    title: &str,
    notes: &str,
    completed: bool,
) -> serde_json::Value {
    let mut props = serde_json::Map::new();
    props.insert(
        schema.title_prop.clone(),
        serde_json::json!({ "title": build_notion_rich_text(title) }),
    );
    if let Some((done_name, kind)) = &schema.done_prop {
        match kind {
            NotionDoneKind::Checkbox => {
                props.insert(done_name.clone(), serde_json::json!({ "checkbox": completed }));
            }
            NotionDoneKind::Status {
                done_name: d,
                todo_name: t,
            } => {
                let target = if completed { d } else { t };
                props.insert(
                    done_name.clone(),
                    serde_json::json!({ "status": { "name": target } }),
                );
            }
        }
    }
    if let Some(notes_name) = &schema.notes_prop {
        props.insert(
            notes_name.clone(),
            serde_json::json!({ "rich_text": build_notion_rich_text(notes) }),
        );
    }
    serde_json::Value::Object(props)
}

async fn sync_notion_tasks(
    app: &AppHandle,
    client: &Client,
    token: &str,
    db_id: &str,
) -> Result<(), String> {
    let schema = fetch_notion_db_schema(client, token, db_id).await?;

    // 1. Push dirty Notion tasks
    let dirty_items: Vec<TaskItem> = load_store(app)
        .tasks
        .into_iter()
        .filter(|t| t.source == "notion" && t.dirty)
        .collect();

    for item in dirty_items {
        if item.deleted {
            if let Some(rid) = &item.remote_id {
                let url = format!("https://api.notion.com/v1/pages/{}", rid);
                let resp = client
                    .patch(&url)
                    .bearer_auth(token)
                    .header("Notion-Version", NOTION_VERSION)
                    .json(&serde_json::json!({ "archived": true }))
                    .send()
                    .await
                    .map_err(|e| format!("Notion archive failed: {}", e))?;
                if resp.status().is_success() || resp.status().as_u16() == 404 {
                    let _ = mutate_store(app, |s| {
                        s.tasks.retain(|t| t.id != item.id);
                    });
                }
            } else {
                let _ = mutate_store(app, |s| {
                    s.tasks.retain(|t| t.id != item.id);
                });
            }
            continue;
        }

        let props = build_notion_task_properties(&schema, &item.title, &item.notes, item.completed);
        if let Some(rid) = &item.remote_id {
            let url = format!("https://api.notion.com/v1/pages/{}", rid);
            let resp = client
                .patch(&url)
                .bearer_auth(token)
                .header("Notion-Version", NOTION_VERSION)
                .json(&serde_json::json!({ "properties": props }))
                .send()
                .await
                .map_err(|e| format!("Notion update failed: {}", e))?;
            if resp.status().is_success() {
                let _ = mutate_store(app, |s| {
                    if let Some(t) = s.tasks.iter_mut().find(|t| t.id == item.id) {
                        t.dirty = false;
                        t.sync_error = None;
                    }
                });
            }
        } else {
            let resp = client
                .post("https://api.notion.com/v1/pages")
                .bearer_auth(token)
                .header("Notion-Version", NOTION_VERSION)
                .json(&serde_json::json!({
                    "parent": { "database_id": db_id },
                    "properties": props
                }))
                .send()
                .await
                .map_err(|e| format!("Notion create failed: {}", e))?;
            if resp.status().is_success() {
                let created: serde_json::Value =
                    resp.json().await.unwrap_or(serde_json::Value::Null);
                let new_rid = created
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let _ = mutate_store(app, |s| {
                    if let Some(t) = s.tasks.iter_mut().find(|t| t.id == item.id) {
                        t.remote_id = new_rid;
                        t.remote_list_id = Some(db_id.to_string());
                        t.dirty = false;
                        t.sync_error = None;
                    }
                });
            }
        }
    }

    // 2. Pull Notion tasks
    let query_url = format!("https://api.notion.com/v1/databases/{}/query", db_id);
    let resp = client
        .post(&query_url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
        .json(&serde_json::json!({ "page_size": 100 }))
        .send()
        .await
        .map_err(|e| format!("Notion query failed: {}", e))?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Notion query error");
        return Err(format!("Notion Tasks: {}", msg));
    }

    let remote_items: Vec<RemoteTaskRecord> = body
        .get("results")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|page| {
                    let rid = page.get("id")?.as_str()?.to_string();
                    let props = page.get("properties")?.as_object()?;
                    let title = props
                        .get(&schema.title_prop)
                        .and_then(|p| p.get("title"))
                        .map(extract_notion_rich_text)
                        .unwrap_or_default()
                        .trim()
                        .to_string();
                    if title.is_empty() {
                        return None;
                    }
                    let completed = match &schema.done_prop {
                        Some((dname, NotionDoneKind::Checkbox)) => props
                            .get(dname)
                            .and_then(|p| p.get("checkbox"))
                            .and_then(|c| c.as_bool())
                            .unwrap_or(false),
                        Some((dname, NotionDoneKind::Status { done_name, .. })) => props
                            .get(dname)
                            .and_then(|p| p.get("status"))
                            .and_then(|s| s.get("name"))
                            .and_then(|n| n.as_str())
                            .map(|n| n.eq_ignore_ascii_case(done_name) || n.to_lowercase().contains("done"))
                            .unwrap_or(false),
                        None => false,
                    };
                    let notes = schema
                        .notes_prop
                        .as_ref()
                        .and_then(|n| props.get(n))
                        .and_then(|p| p.get("rich_text"))
                        .map(extract_notion_rich_text)
                        .unwrap_or_default();

                    Some(RemoteTaskRecord {
                        remote_id: rid,
                        remote_list_id: Some(db_id.to_string()),
                        title,
                        notes,
                        completed,
                        due: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let ts = now_ms();
    let _ = mutate_store(app, |s| {
        merge_remote_tasks(&mut s.tasks, "notion", remote_items, ts);
    });
    Ok(())
}

async fn sync_notion_notes(
    app: &AppHandle,
    client: &Client,
    token: &str,
    target_id: &str,
) -> Result<(), String> {
    // Try as Database first; if not a database, treat as a single synced Notion Page.
    match fetch_notion_db_schema(client, token, target_id).await {
        Ok(schema) => {
            // 1. Push dirty Notion notes
            let dirty_notes: Vec<NoteItem> = load_store(app)
                .notes
                .into_iter()
                .filter(|n| n.source == "notion" && n.dirty)
                .collect();

            for note in dirty_notes {
                if note.deleted {
                    if let Some(rid) = &note.remote_id {
                        let url = format!("https://api.notion.com/v1/pages/{}", rid);
                        let resp = client
                            .patch(&url)
                            .bearer_auth(token)
                            .header("Notion-Version", NOTION_VERSION)
                            .json(&serde_json::json!({ "archived": true }))
                            .send()
                            .await
                            .map_err(|e| format!("Notion note archive failed: {}", e))?;
                        if resp.status().is_success() || resp.status().as_u16() == 404 {
                            let _ = mutate_store(app, |s| {
                                s.notes.retain(|n| n.id != note.id);
                            });
                        }
                    } else {
                        let _ = mutate_store(app, |s| {
                            s.notes.retain(|n| n.id != note.id);
                        });
                    }
                    continue;
                }

                let mut props = serde_json::Map::new();
                let effective_title = if note.title.trim().is_empty() {
                    "Untitled Note"
                } else {
                    note.title.trim()
                };
                props.insert(
                    schema.title_prop.clone(),
                    serde_json::json!({ "title": build_notion_rich_text(effective_title) }),
                );
                if let Some(content_prop) = &schema.notes_prop {
                    props.insert(
                        content_prop.clone(),
                        serde_json::json!({ "rich_text": build_notion_rich_text(&note.content) }),
                    );
                }

                if let Some(rid) = &note.remote_id {
                    let url = format!("https://api.notion.com/v1/pages/{}", rid);
                    let resp = client
                        .patch(&url)
                        .bearer_auth(token)
                        .header("Notion-Version", NOTION_VERSION)
                        .json(&serde_json::json!({ "properties": props }))
                        .send()
                        .await
                        .map_err(|e| format!("Notion note update failed: {}", e))?;
                    if schema.notes_prop.is_none() {
                        let _ = replace_notion_page_paragraph_blocks(
                            client,
                            token,
                            rid,
                            &note.content,
                        )
                        .await;
                    }
                    if resp.status().is_success() {
                        let _ = mutate_store(app, |s| {
                            if let Some(n) = s.notes.iter_mut().find(|n| n.id == note.id) {
                                n.dirty = false;
                                n.sync_error = None;
                            }
                        });
                    }
                } else {
                    let children: Vec<serde_json::Value> = if schema.notes_prop.is_none() {
                        note.content
                            .lines()
                            .take(90)
                            .map(|line| {
                                serde_json::json!({
                                    "object": "block",
                                    "type": "paragraph",
                                    "paragraph": { "rich_text": build_notion_rich_text(line) }
                                })
                            })
                            .collect()
                    } else {
                        vec![]
                    };

                    let mut body = serde_json::json!({
                        "parent": { "database_id": target_id },
                        "properties": props
                    });
                    if !children.is_empty() {
                        body["children"] = serde_json::Value::Array(children);
                    }

                    let resp = client
                        .post("https://api.notion.com/v1/pages")
                        .bearer_auth(token)
                        .header("Notion-Version", NOTION_VERSION)
                        .json(&body)
                        .send()
                        .await
                        .map_err(|e| format!("Notion note create failed: {}", e))?;
                    if resp.status().is_success() {
                        let created: serde_json::Value =
                            resp.json().await.unwrap_or(serde_json::Value::Null);
                        let new_rid = created
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let _ = mutate_store(app, |s| {
                            if let Some(n) = s.notes.iter_mut().find(|n| n.id == note.id) {
                                n.remote_id = new_rid;
                                n.dirty = false;
                                n.sync_error = None;
                            }
                        });
                    }
                }
            }

            // 2. Pull Notion notes DB
            let query_url = format!("https://api.notion.com/v1/databases/{}/query", target_id);
            let resp = client
                .post(&query_url)
                .bearer_auth(token)
                .header("Notion-Version", NOTION_VERSION)
                .json(&serde_json::json!({ "page_size": 50 }))
                .send()
                .await
                .map_err(|e| format!("Notion notes query failed: {}", e))?;
            let status = resp.status();
            let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
            if !status.is_success() {
                let msg = body
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Notion notes query error");
                return Err(format!("Notion Notes: {}", msg));
            }

            let mut remote_notes = Vec::new();
            if let Some(arr) = body.get("results").and_then(|r| r.as_array()) {
                for page in arr {
                    let Some(rid) = page.get("id").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let Some(props) = page.get("properties").and_then(|v| v.as_object()) else {
                        continue;
                    };
                    let title = props
                        .get(&schema.title_prop)
                        .and_then(|p| p.get("title"))
                        .map(extract_notion_rich_text)
                        .unwrap_or_default();
                    let content = if let Some(cprop) = &schema.notes_prop {
                        props
                            .get(cprop)
                            .and_then(|p| p.get("rich_text"))
                            .map(extract_notion_rich_text)
                            .unwrap_or_default()
                    } else {
                        fetch_notion_page_blocks_text(client, token, rid)
                            .await
                            .unwrap_or_default()
                    };
                    remote_notes.push(RemoteNoteRecord {
                        remote_id: rid.to_string(),
                        title,
                        content,
                    });
                }
            }

            let ts = now_ms();
            let _ = mutate_store(app, |s| {
                merge_remote_notes(&mut s.notes, remote_notes, ts);
            });
            Ok(())
        }
        Err(_) => {
            // Standalone Notion Page fallback
            let page_url = format!("https://api.notion.com/v1/pages/{}", target_id);
            let presp = client
                .get(&page_url)
                .bearer_auth(token)
                .header("Notion-Version", NOTION_VERSION)
                .send()
                .await
                .map_err(|e| format!("Notion page request failed: {}", e))?;
            if !presp.status().is_success() {
                return Err("Notion Notes target is neither an accessible database nor page.".to_string());
            }
            let pbody: serde_json::Value = presp.json().await.unwrap_or(serde_json::Value::Null);
            let mut title = "Notion Note".to_string();
            if let Some(props) = pbody.get("properties").and_then(|v| v.as_object()) {
                for (_, prop) in props {
                    if prop.get("type").and_then(|t| t.as_str()) == Some("title") {
                        let t = prop
                            .get("title")
                            .map(extract_notion_rich_text)
                            .unwrap_or_default();
                        if !t.is_empty() {
                            title = t;
                        }
                    }
                }
            }

            let dirty_match = load_store(app)
                .notes
                .into_iter()
                .find(|n| n.source == "notion" && n.remote_id.as_deref() == Some(target_id) && n.dirty);

            if let Some(dirty_note) = dirty_match {
                if !dirty_note.deleted {
                    replace_notion_page_paragraph_blocks(
                        client,
                        token,
                        target_id,
                        &dirty_note.content,
                    )
                    .await?;
                }
                let _ = mutate_store(app, |s| {
                    if let Some(n) = s.notes.iter_mut().find(|n| n.id == dirty_note.id) {
                        n.dirty = false;
                        n.sync_error = None;
                    }
                });
            }

            let content = fetch_notion_page_blocks_text(client, token, target_id).await?;
            let ts = now_ms();
            let _ = mutate_store(app, |s| {
                merge_remote_notes(
                    &mut s.notes,
                    vec![RemoteNoteRecord {
                        remote_id: target_id.to_string(),
                        title,
                        content,
                    }],
                    ts,
                );
            });
            Ok(())
        }
    }
}

pub async fn sync_now(app: AppHandle) -> Result<TasksSnapshot, String> {
    let _sync_guard = sync_async_mutex().lock().await;
    SYNC_IN_FLIGHT.store(true, Ordering::Relaxed);
    emit_snapshot(&app);

    struct SyncFlagGuard;
    impl Drop for SyncFlagGuard {
        fn drop(&mut self) {
            SYNC_IN_FLIGHT.store(false, Ordering::Relaxed);
        }
    }
    let _flag_guard = SyncFlagGuard;

    let cfg = read_config(&app);
    let client = http_client()?;
    let mut errors: Vec<String> = Vec::new();

    if let Err(e) = sync_google_tasks(&app, &client, &cfg).await {
        errors.push(e);
    }

    if !cfg.notion_token.is_empty() {
        let tasks_db = notion_normalize_id(&cfg.notion_tasks_db);
        if !tasks_db.is_empty() {
            if let Err(e) = sync_notion_tasks(&app, &client, &cfg.notion_token, &tasks_db).await {
                errors.push(e);
            }
        }
        let notes_id = notion_normalize_id(&cfg.notion_notes_id);
        if !notes_id.is_empty() {
            if let Err(e) = sync_notion_notes(&app, &client, &cfg.notion_token, &notes_id).await {
                errors.push(e);
            }
        }
    }

    let err_msg = if errors.is_empty() {
        None
    } else {
        Some(errors.join(" · "))
    };
    let ts = now_ms();
    let (_, store) = mutate_store(&app, |s| {
        s.last_synced_at = Some(ts);
        s.last_error = err_msg.clone();
    })?;

    drop(_flag_guard);
    let snap = build_snapshot(&app, &store);
    let _ = app.emit("tasks-store-updated", snap.clone());
    Ok(snap)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_notion_urls_and_ids() {
        assert_eq!(
            notion_normalize_id("0123456789abcdef0123456789abcdef"),
            "01234567-89ab-cdef-0123-456789abcdef"
        );
        assert_eq!(
            notion_normalize_id("https://www.notion.so/myteam/Tasks-0123456789abcdef0123456789abcdef?v=999"),
            "01234567-89ab-cdef-0123-456789abcdef"
        );
        assert_eq!(
            notion_normalize_id("01234567-89AB-CDEF-0123-456789ABCDEF"),
            "01234567-89ab-cdef-0123-456789abcdef"
        );
        assert_eq!(notion_normalize_id("not-an-id"), "");
    }

    #[test]
    fn parses_notion_schema_checkbox_and_status() {
        let db = serde_json::json!({
            "title": [{ "plain_text": "My Tasks" }],
            "properties": {
                "Task": { "type": "title" },
                "Done": { "type": "checkbox" },
                "Notes": { "type": "rich_text" }
            }
        });
        let schema = parse_notion_db_schema(&db);
        assert_eq!(schema.title_prop, "Task");
        assert_eq!(schema.db_title.as_deref(), Some("My Tasks"));
        assert_eq!(
            schema.done_prop,
            Some(("Done".to_string(), NotionDoneKind::Checkbox))
        );
        assert_eq!(schema.notes_prop.as_deref(), Some("Notes"));

        let status_db = serde_json::json!({
            "properties": {
                "Name": { "type": "title" },
                "State": {
                    "type": "status",
                    "status": {
                        "options": [
                            { "name": "Backlog" },
                            { "name": "To Do" },
                            { "name": "Complete" }
                        ]
                    }
                }
            }
        });
        let status_schema = parse_notion_db_schema(&status_db);
        assert_eq!(
            status_schema.done_prop,
            Some((
                "State".to_string(),
                NotionDoneKind::Status {
                    done_name: "Complete".to_string(),
                    todo_name: "To Do".to_string()
                }
            ))
        );
    }

    #[test]
    fn parses_oauth_callback_query() {
        let (code, state, err) =
            parse_oauth_callback_query("GET /callback?code=4%2Fabc&state=zenith_123 HTTP/1.1");
        assert_eq!(code.as_deref(), Some("4/abc"));
        assert_eq!(state.as_deref(), Some("zenith_123"));
        assert_eq!(err, None);

        let (code2, _, err2) =
            parse_oauth_callback_query("GET /callback?error=access_denied&state=s HTTP/1.1");
        assert_eq!(code2, None);
        assert_eq!(err2.as_deref(), Some("access_denied"));
    }

    #[test]
    fn merge_preserves_dirty_local_edits_and_prunes_clean_deletes() {
        let mut local = vec![
            TaskItem {
                id: "google_r1".into(),
                title: "Edited locally".into(),
                notes: "Local note".into(),
                completed: true,
                source: "google".into(),
                remote_id: Some("r1".into()),
                remote_list_id: None,
                due: None,
                created_at: 10,
                updated_at: 20,
                dirty: true,
                deleted: false,
                sync_error: None,
            },
            TaskItem {
                id: "google_r2".into(),
                title: "Old title".into(),
                notes: "".into(),
                completed: false,
                source: "google".into(),
                remote_id: Some("r2".into()),
                remote_list_id: None,
                due: None,
                created_at: 10,
                updated_at: 10,
                dirty: false,
                deleted: false,
                sync_error: None,
            },
            TaskItem {
                id: "google_r3".into(),
                title: "Deleted remotely".into(),
                notes: "".into(),
                completed: false,
                source: "google".into(),
                remote_id: Some("r3".into()),
                remote_list_id: None,
                due: None,
                created_at: 10,
                updated_at: 10,
                dirty: false,
                deleted: false,
                sync_error: None,
            },
        ];

        let remote = vec![
            RemoteTaskRecord {
                remote_id: "r1".into(),
                remote_list_id: None,
                title: "Stale remote".into(),
                notes: "".into(),
                completed: false,
                due: None,
            },
            RemoteTaskRecord {
                remote_id: "r2".into(),
                remote_list_id: None,
                title: "Updated remote".into(),
                notes: "Fresh detail".into(),
                completed: true,
                due: None,
            },
            RemoteTaskRecord {
                remote_id: "r4".into(),
                remote_list_id: None,
                title: "Brand new".into(),
                notes: "".into(),
                completed: false,
                due: None,
            },
        ];

        merge_remote_tasks(&mut local, "google", remote, 50);

        assert_eq!(local.len(), 3);
        let r1 = local.iter().find(|t| t.remote_id.as_deref() == Some("r1")).unwrap();
        assert_eq!(r1.title, "Edited locally");
        assert!(r1.dirty);

        let r2 = local.iter().find(|t| t.remote_id.as_deref() == Some("r2")).unwrap();
        assert_eq!(r2.title, "Updated remote");
        assert_eq!(r2.notes, "Fresh detail");
        assert!(r2.completed);

        assert!(local.iter().any(|t| t.remote_id.as_deref() == Some("r4")));
        assert!(!local.iter().any(|t| t.remote_id.as_deref() == Some("r3")));
    }
}
