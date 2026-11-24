use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cell::UnsafeCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::ThreadId;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::watch;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_STDERR_TAIL_LINES: usize = 20;
const MAX_STDERR_LINE_BYTES: usize = 64 * 1024;
const MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024;
const FILEE_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/KnifeLemon/Filee/releases/latest";
const GITHUB_USER_AGENT: &str = "Zenith-Converter/1.0";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConverterPaths {
    pub root: PathBuf,
    pub bin_dir: PathBuf,
    pub cli_exe: PathBuf,
    pub engines_dir: PathBuf,
    pub state_file: PathBuf,
    pub downloads_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CropBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub ref_width: Option<u32>,
    #[serde(default)]
    pub ref_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImagePreviewPayload {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConvertRequest {
    pub job_id: String,
    pub inputs: Vec<String>,
    pub to: String,
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub output_dir: Option<String>,
    #[serde(default)]
    pub quality: Option<u8>,
    #[serde(default)]
    pub pages: Option<String>,
    #[serde(default)]
    pub split_every: Option<u32>,
    #[serde(default)]
    pub split_parts: Option<u32>,
    #[serde(default)]
    pub conflict: Option<String>,
    #[serde(default)]
    pub overwrite: Option<bool>,
    #[serde(default)]
    pub keep_dates: Option<bool>,
    #[serde(default)]
    pub zip: Option<bool>,
    #[serde(default)]
    pub iso_filesystem: Option<String>,
    #[serde(default)]
    pub iso_label: Option<String>,
    #[serde(default)]
    pub crop: Option<CropBox>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolbarProfileState {
    pub id: String,
    pub category: String,
    pub label: String,
    #[serde(default)]
    pub primary_ids: Vec<String>,
    #[serde(default)]
    pub secondary_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConverterPresetConfig {
    pub id: String,
    pub name: String,
    pub target_format: String,
    #[serde(default)]
    pub quality: Option<u8>,
    #[serde(default)]
    pub pages: Option<String>,
    #[serde(default)]
    pub split_every: Option<u32>,
    #[serde(default)]
    pub split_parts: Option<u32>,
    #[serde(default)]
    pub conflict: Option<String>,
    #[serde(default)]
    pub keep_dates: Option<bool>,
    #[serde(default)]
    pub zip: Option<bool>,
    #[serde(default)]
    pub iso_filesystem: Option<String>,
    #[serde(default)]
    pub iso_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecentConversion {
    pub id: String,
    pub source_path: String,
    pub source_name: String,
    pub source_ext: String,
    pub output_path: String,
    pub output_format: String,
    pub timestamp_ms: u64,
    #[serde(default)]
    pub thumbnail_data_url: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WatchRule {
    pub id: String,
    pub folder: String,
    pub target_format: String,
    #[serde(default)]
    pub preset_id: Option<String>,
    pub output_folder: String,
    pub recursive: bool,
    pub move_originals: bool,
    pub keep_dates: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WatchRuleStatus {
    pub id: String,
    pub running: bool,
    pub converted_count: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WatchStdoutEvent {
    Started {
        folder: String,
        target: String,
        output_folder: String,
    },
    FileDone(ConvertedFileItem),
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ConverterState {
    #[serde(default)]
    pub profiles: Vec<ToolbarProfileState>,
    #[serde(default)]
    pub presets: Vec<ConverterPresetConfig>,
    #[serde(default)]
    pub recent: Vec<RecentConversion>,
    #[serde(default)]
    pub watch_rules: Vec<WatchRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConvertedFileItem {
    pub source: String,
    pub state: String,
    #[serde(default)]
    pub outputs: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub error_key: Option<String>,
    #[serde(default)]
    pub missing_engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CliEvent {
    Progress {
        source: String,
        fraction: f64,
    },
    FileDone {
        source: String,
        outputs: Vec<String>,
        state: String,
        error: Option<String>,
        error_key: Option<String>,
        missing_engine: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CliOutcome {
    Completed,
    #[allow(dead_code)]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertJobResult {
    pub job_id: String,
    pub files: Vec<ConvertedFileItem>,
    pub missing_engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConverterProgressEvent {
    pub job_id: String,
    pub kind: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fraction: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub outputs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing_engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConverterRuntimeStatus {
    pub core_installed: bool,
    pub version: Option<String>,
    pub cli_path: String,
    pub installing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CoreInstallProgressEvent {
    pub stage: String,
    pub fraction: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnginePackInfo {
    pub id: String,
    pub status: String,
    pub version: Option<String>,
    pub downloadable: bool,
    pub download_size: u64,
    pub installed_size: u64,
    pub converters: Vec<String>,
    pub outdated: bool,
    pub from_system: bool,
    pub folder: Option<String>,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EngineInstallProgressEvent {
    pub id: String,
    pub stage: String,
    pub component: String,
    pub fraction: f64,
    pub bytes_done: u64,
    pub bytes_total: u64,
}

struct ActiveJobState {
    pid: Option<u32>,
    cancelled: bool,
    cancel_tx: watch::Sender<bool>,
}

static ACTIVE_CONVERTER_JOBS: OnceLock<Mutex<HashMap<String, ActiveJobState>>> = OnceLock::new();
static CORE_INSTALLING: AtomicBool = AtomicBool::new(false);
static ACTIVE_ENGINE_OPS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
type CliVersionCacheEntry = (PathBuf, u64, Option<std::time::SystemTime>, String);
static CACHED_CLI_VERSION: OnceLock<Mutex<Option<CliVersionCacheEntry>>> = OnceLock::new();
static CONVERTER_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static WATCH_GENERATION_SEQ: AtomicU64 = AtomicU64::new(1);
static WATCH_HISTORY_SEQ: AtomicU64 = AtomicU64::new(1);
static WATCH_RECONCILE_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

struct ActiveWatchEntry {
    generation: u64,
    effective_args: Vec<String>,
    pid: Option<u32>,
    cancel_tx: watch::Sender<bool>,
    running: bool,
    converted_count: u64,
    last_error: Option<String>,
}

#[derive(Default)]
struct WatchManagerState {
    ordered_ids: Vec<String>,
    entries: HashMap<String, ActiveWatchEntry>,
}

static WATCH_MANAGER: OnceLock<Mutex<WatchManagerState>> = OnceLock::new();

fn watch_manager() -> &'static Mutex<WatchManagerState> {
    WATCH_MANAGER.get_or_init(|| Mutex::new(WatchManagerState::default()))
}

fn watch_reconcile_lock() -> &'static tokio::sync::Mutex<()> {
    WATCH_RECONCILE_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn active_jobs_map() -> &'static Mutex<HashMap<String, ActiveJobState>> {
    ACTIVE_CONVERTER_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_engine_ops_set() -> &'static Mutex<HashSet<String>> {
    ACTIVE_ENGINE_OPS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn cli_version_cache() -> &'static Mutex<Option<CliVersionCacheEntry>> {
    CACHED_CLI_VERSION.get_or_init(|| Mutex::new(None))
}

struct CoreInstallingGuard;

impl Drop for CoreInstallingGuard {
    fn drop(&mut self) {
        CORE_INSTALLING.store(false, Ordering::SeqCst);
    }
}

struct ActiveEngineOpGuard {
    id: String,
}

impl Drop for ActiveEngineOpGuard {
    fn drop(&mut self) {
        if let Ok(mut ops) = active_engine_ops_set().lock() {
            ops.remove(&self.id);
        }
    }
}

struct ActiveJobGuard {
    job_id: String,
}

impl Drop for ActiveJobGuard {
    fn drop(&mut self) {
        if let Ok(mut jobs) = active_jobs_map().lock() {
            jobs.remove(&self.job_id);
        }
    }
}

pub(crate) fn converter_paths_from_root(root: PathBuf) -> ConverterPaths {
    let bin_dir = root.join("bin");
    ConverterPaths {
        cli_exe: bin_dir.join("filee-cli.exe"),
        bin_dir,
        engines_dir: root.join("engines"),
        state_file: root.join("state.json"),
        downloads_dir: root.join("downloads"),
        root,
    }
}

pub fn resolve_converter_paths(app: &AppHandle) -> Result<ConverterPaths, String> {
    let base = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(converter_paths_from_root(base.join("converter")))
}

pub fn compute_sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCliStderrLine {
    event: String,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    fraction: Option<f64>,
    #[serde(default)]
    outputs: Vec<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default, alias = "error_key")]
    error_key: Option<String>,
    #[serde(default, alias = "missing_engine")]
    missing_engine: Option<String>,
    #[serde(default, alias = "needs_engines")]
    needs_engines: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCliFileJson {
    source: String,
    state: String,
    #[serde(default)]
    outputs: Vec<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default, alias = "error_key")]
    error_key: Option<String>,
    #[serde(default, alias = "missing_engine")]
    missing_engine: Option<String>,
    #[serde(default, alias = "needs_engines")]
    needs_engines: Vec<String>,
}

#[derive(Deserialize)]
struct RawCliStdoutDoc {
    #[serde(default)]
    files: Vec<RawCliFileJson>,
}

fn extract_missing_engine(
    explicit: Option<&str>,
    error_key: Option<&str>,
    needs_engines: &[String],
) -> Option<String> {
    if let Some(id) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(id.to_string());
    }
    if let Some(key) = error_key.map(str::trim) {
        if let Some(id) = key
            .strip_prefix("MissingEngine:")
            .or_else(|| key.strip_prefix("MISSING_ENGINE:"))
            .or_else(|| key.strip_prefix("missing_engine:"))
        {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    needs_engines
        .iter()
        .map(|s| s.trim())
        .find(|s| !s.is_empty())
        .map(str::to_string)
}

pub fn parse_cli_stderr_line(line: &str) -> Option<CliEvent> {
    let trimmed = line.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return None;
    }

    let raw: RawCliStderrLine = serde_json::from_str(trimmed).ok()?;
    match raw.event.as_str() {
        "progress" => {
            let source = raw.source?;
            let fraction = raw.fraction?.clamp(0.0, 1.0);
            if !fraction.is_finite() {
                return None;
            }
            Some(CliEvent::Progress { source, fraction })
        }
        "file" => {
            let source = raw.source?;
            let state = raw.state?;
            let missing_engine = extract_missing_engine(
                raw.missing_engine.as_deref(),
                raw.error_key.as_deref(),
                &raw.needs_engines,
            );
            Some(CliEvent::FileDone {
                source,
                outputs: raw.outputs,
                state,
                error: raw.error,
                error_key: raw.error_key,
                missing_engine,
            })
        }
        _ => None,
    }
}

fn parse_cli_stdout_json(stdout_bytes: &[u8]) -> Option<Vec<ConvertedFileItem>> {
    let text = String::from_utf8_lossy(stdout_bytes);
    let trimmed = text.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return None;
    }
    let doc: RawCliStdoutDoc = serde_json::from_str(trimmed).ok()?;
    Some(
        doc.files
            .into_iter()
            .map(|f| {
                let missing_engine = extract_missing_engine(
                    f.missing_engine.as_deref(),
                    f.error_key.as_deref(),
                    &f.needs_engines,
                );
                ConvertedFileItem {
                    source: f.source,
                    state: f.state,
                    outputs: f.outputs,
                    error: f.error,
                    error_key: f.error_key,
                    missing_engine,
                }
            })
            .collect(),
    )
}

fn format_cli_error(code_label: &str, default_detail: &str, stderr_tail: &str) -> String {
    let tail = stderr_tail.trim();
    if tail.is_empty() {
        format!("{code_label}: {default_detail}")
    } else {
        format!("{code_label}: {tail}")
    }
}

pub fn map_cli_exit_code(
    code: Option<i32>,
    missing_engine: Option<&str>,
    stderr_tail: &str,
) -> Result<CliOutcome, String> {
    let missing = missing_engine.map(str::trim).filter(|s| !s.is_empty());
    match code {
        Some(0) => Ok(CliOutcome::Completed),
        Some(1) => {
            if let Some(engine) = missing {
                Err(format!("MISSING_ENGINE:{engine}"))
            } else {
                Err(format_cli_error(
                    "CONVERSION_FAILED",
                    "One or more files failed to convert",
                    stderr_tail,
                ))
            }
        }
        Some(2) => Err(format_cli_error(
            "USAGE_ERROR",
            "Invalid arguments or missing input file",
            stderr_tail,
        )),
        Some(3) => Err(format_cli_error(
            "NOTHING_TO_CONVERT",
            "No convertible files found",
            stderr_tail,
        )),
        None => Err("CANCELLED".to_string()),
        Some(other) => {
            if let Some(engine) = missing {
                Err(format!("MISSING_ENGINE:{engine}"))
            } else {
                Err(format_cli_error(
                    &format!("CLI_EXIT_{other}"),
                    "Converter exited with an unexpected error",
                    stderr_tail,
                ))
            }
        }
    }
}

pub fn build_convert_args(req: &ConvertRequest, _paths: &ConverterPaths) -> Vec<String> {
    let mut args = Vec::with_capacity(req.inputs.len() + 14);
    args.push("convert".to_string());
    args.extend(req.inputs.iter().cloned());

    // `filee convert` rejects specifying both `--to` and `--preset`.
    if let Some(preset) = req.preset.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.push("--preset".to_string());
        args.push(preset.to_string());
    } else if !req.to.trim().is_empty() {
        args.push("--to".to_string());
        args.push(req.to.trim().to_string());
    }

    if let Some(out_dir) = req
        .output_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("-o".to_string());
        args.push(out_dir.to_string());
    }

    if let Some(quality) = req.quality {
        args.push("-q".to_string());
        args.push(quality.clamp(1, 100).to_string());
    }

    if let Some(pages) = req.pages.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.push("--pages".to_string());
        args.push(pages.to_string());
    }

    if let Some(every) = req.split_every.filter(|&n| n > 0) {
        args.push("--split-every".to_string());
        args.push(every.to_string());
    } else if let Some(parts) = req.split_parts.filter(|&n| n >= 2) {
        args.push("--split-parts".to_string());
        args.push(parts.to_string());
    }

    match req
        .conflict
        .as_deref()
        .map(|s| s.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("overwrite") => args.push("--overwrite".to_string()),
        Some("skip") => args.push("--skip".to_string()),
        Some("rename") | Some("") => {}
        Some(_) => {}
        None => {
            if req.overwrite == Some(true) {
                args.push("--overwrite".to_string());
            }
        }
    }

    if req.keep_dates == Some(true) {
        args.push("--keep-dates".to_string());
    }

    if req.zip == Some(true) {
        args.push("--zip".to_string());
    }

    if let Some(fs) = req
        .iso_filesystem
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--iso-filesystem".to_string());
        args.push(fs.to_string());
    }

    if let Some(label) = req
        .iso_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--iso-label".to_string());
        args.push(label.to_string());
    }

    args.push("--json".to_string());
    args
}

fn build_cli_command(exe: &Path, args: &[String], paths: &ConverterPaths) -> std::process::Command {
    use std::os::windows::process::CommandExt;

    let mut cmd = std::process::Command::new(exe);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        // Isolate all Filee state, caches, and optional engines strictly inside Zenith's converter root.
        .env("FILEE_DATA_DIR", &paths.root)
        .env("FILEE_APPDATA", &paths.root)
        .env("FILEE_HOME", &paths.root)
        .env("APPDATA", &paths.root)
        .env("LOCALAPPDATA", &paths.root);
    cmd
}

fn register_active_job(job_id: &str) -> Result<(ActiveJobGuard, watch::Receiver<bool>), String> {
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let mut jobs = active_jobs_map()
        .lock()
        .map_err(|_| "Converter jobs lock poisoned".to_string())?;
    if jobs.contains_key(job_id) {
        return Err(format!("JOB_ALREADY_ACTIVE: {job_id}"));
    }
    jobs.insert(
        job_id.to_string(),
        ActiveJobState {
            pid: None,
            cancelled: false,
            cancel_tx,
        },
    );
    Ok((
        ActiveJobGuard {
            job_id: job_id.to_string(),
        },
        cancel_rx,
    ))
}

fn attach_job_pid(job_id: &str, pid: Option<u32>) -> bool {
    if let Ok(mut jobs) = active_jobs_map().lock() {
        if let Some(state) = jobs.get_mut(job_id) {
            if state.cancelled {
                return false;
            }
            state.pid = pid;
            return true;
        }
    }
    false
}

fn mark_job_cancelled(job_id: &str) -> Option<u32> {
    let mut jobs = active_jobs_map().lock().ok()?;
    let state = jobs.get_mut(job_id)?;
    state.cancelled = true;
    let _ = state.cancel_tx.send(true);
    state.pid.take()
}

fn collect_descendant_pids(root_pid: u32) -> Vec<u32> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return vec![root_pid];
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        while more {
            children_by_parent
                .entry(entry.th32ParentProcessID)
                .or_default()
                .push(entry.th32ProcessID);
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
    }

    let mut order = Vec::new();
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    visited.insert(root_pid);
    queue.push_back(root_pid);

    while let Some(pid) = queue.pop_front() {
        order.push(pid);
        if let Some(kids) = children_by_parent.get(&pid) {
            for &kid in kids {
                if visited.insert(kid) {
                    queue.push_back(kid);
                }
            }
        }
    }
    // Terminate children before parent so subprocess handles close cleanly.
    order.reverse();
    order
}

fn terminate_process_tree(root_pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    for pid in collect_descendant_pids(root_pid) {
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                let _ = TerminateProcess(handle, 1);
                let _ = CloseHandle(handle);
            }
        }
    }
}

async fn wait_for_cancel(rx: &mut watch::Receiver<bool>) {
    if rx.wait_for(|&c| c).await.is_err() {
        std::future::pending::<()>().await;
    }
}

async fn terminate_child_and_tree(child: &mut tokio::process::Child, pid: Option<u32>) {
    if let Some(p) = pid {
        terminate_process_tree(p);
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

fn push_stderr_tail(tail: &mut VecDeque<String>, line: &str) {
    let clean = line.trim();
    if clean.is_empty() {
        return;
    }
    if tail.len() >= MAX_STDERR_TAIL_LINES {
        tail.pop_front();
    }
    let truncated: String = clean.chars().take(500).collect();
    tail.push_back(truncated);
}

fn emit_converter_event(app: &AppHandle, job_id: &str, event: &CliEvent) {
    let payload = match event {
        CliEvent::Progress { source, fraction } => ConverterProgressEvent {
            job_id: job_id.to_string(),
            kind: "progress".to_string(),
            source: source.clone(),
            fraction: Some(*fraction),
            state: None,
            outputs: Vec::new(),
            error: None,
            error_key: None,
            missing_engine: None,
        },
        CliEvent::FileDone {
            source,
            outputs,
            state,
            error,
            error_key,
            missing_engine,
        } => ConverterProgressEvent {
            job_id: job_id.to_string(),
            kind: "file".to_string(),
            source: source.clone(),
            fraction: None,
            state: Some(state.clone()),
            outputs: outputs.clone(),
            error: error.clone(),
            error_key: error_key.clone(),
            missing_engine: missing_engine.clone(),
        },
    };
    let _ = app.emit("converter-progress", payload);
}

const MAX_IMAGE_PREVIEW_EDGE: u32 = 1280;
const MAX_CROP_SOURCE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_CROP_IMAGE_DIM: u32 = 16384;
const MAX_CROP_DECODE_ALLOC_BYTES: u64 = 512 * 1024 * 1024;

fn decode_image_with_limits(
    path: &Path,
    max_file_bytes: u64,
    max_dim: u32,
    max_alloc: u64,
) -> Result<image::DynamicImage, String> {
    let meta = std::fs::metadata(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("IMAGE_NOT_FOUND: Image file does not exist: {}", path.display())
        } else {
            format!("IMAGE_IO_ERROR: Failed to inspect {}: {e}", path.display())
        }
    })?;
    if !meta.is_file() {
        return Err(format!(
            "IMAGE_NOT_FOUND: Image path is not a file: {}",
            path.display()
        ));
    }
    if meta.len() > max_file_bytes {
        return Err(format!(
            "IMAGE_TOO_LARGE: Image {} exceeds the {} MB limit",
            path.display(),
            max_file_bytes / (1024 * 1024)
        ));
    }

    let mut reader = image::ImageReader::open(path)
        .map_err(|e| format!("IMAGE_DECODE_FAILED: Failed to open {}: {e}", path.display()))?
        .with_guessed_format()
        .map_err(|e| {
            format!(
                "IMAGE_DECODE_FAILED: Failed to detect format for {}: {e}",
                path.display()
            )
        })?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(max_dim);
    limits.max_image_height = Some(max_dim);
    limits.max_alloc = Some(max_alloc);
    reader.limits(limits);

    reader
        .decode()
        .map_err(|e| format!("IMAGE_DECODE_FAILED: Failed to decode {}: {e}", path.display()))
}

pub fn clamp_crop_box(
    crop: &CropBox,
    img_width: u32,
    img_height: u32,
) -> Result<(u32, u32, u32, u32), String> {
    if img_width == 0 || img_height == 0 {
        return Err("INVALID_IMAGE: Source image has zero dimensions".to_string());
    }
    if crop.width == 0 || crop.height == 0 {
        return Err("INVALID_CROP: Crop width and height must be at least 1 pixel".to_string());
    }

    let (raw_x, raw_y, raw_w, raw_h) = match (crop.ref_width, crop.ref_height) {
        (Some(rw), Some(rh)) if rw > 0 && rh > 0 && (rw != img_width || rh != img_height) => {
            let sx = img_width as f64 / rw as f64;
            let sy = img_height as f64 / rh as f64;
            (
                ((crop.x as f64) * sx).round().max(0.0) as u32,
                ((crop.y as f64) * sy).round().max(0.0) as u32,
                ((crop.width as f64) * sx).round().max(1.0) as u32,
                ((crop.height as f64) * sy).round().max(1.0) as u32,
            )
        }
        _ => (crop.x, crop.y, crop.width, crop.height),
    };

    let x = raw_x.min(img_width - 1);
    let y = raw_y.min(img_height - 1);
    let max_w = img_width - x;
    let max_h = img_height - y;
    let w = raw_w.clamp(1, max_w);
    let h = raw_h.clamp(1, max_h);
    Ok((x, y, w, h))
}

fn sanitize_path_stem(src_path: &Path) -> String {
    let raw_stem = src_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("image");
    let safe: String = raw_stem
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = safe.trim();
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn crop_image_to_temp_png(
    src_path: &Path,
    crop: &CropBox,
    temp_dir: &Path,
) -> Result<PathBuf, String> {
    let img = decode_image_with_limits(
        src_path,
        MAX_CROP_SOURCE_BYTES,
        MAX_CROP_IMAGE_DIM,
        MAX_CROP_DECODE_ALLOC_BYTES,
    )?;
    let (x, y, w, h) = clamp_crop_box(crop, img.width(), img.height())?;
    let cropped = img.crop_imm(x, y, w, h);

    std::fs::create_dir_all(temp_dir).map_err(|e| {
        format!(
            "TEMP_DIR_ERROR: Failed to create crop temp dir {}: {e}",
            temp_dir.display()
        )
    })?;

    let stem = sanitize_path_stem(src_path);
    let mut out_path = temp_dir.join(format!("{stem}.png"));
    if out_path.exists() {
        let mut idx = 1u32;
        loop {
            let sub_dir = temp_dir.join(format!("item_{idx}"));
            let candidate = sub_dir.join(format!("{stem}.png"));
            if !candidate.exists() {
                std::fs::create_dir_all(&sub_dir).map_err(|e| {
                    format!(
                        "TEMP_DIR_ERROR: Failed to create crop temp dir {}: {e}",
                        sub_dir.display()
                    )
                })?;
                out_path = candidate;
                break;
            }
            idx += 1;
        }
    }

    cropped
        .save_with_format(&out_path, image::ImageFormat::Png)
        .map_err(|e| {
            format!(
                "IMAGE_ENCODE_FAILED: Failed to save cropped PNG {}: {e}",
                out_path.display()
            )
        })?;
    Ok(out_path)
}

pub fn load_image_preview_sync(src_path: &Path) -> Result<ImagePreviewPayload, String> {
    use base64::Engine;

    let img = decode_image_with_limits(
        src_path,
        MAX_CROP_SOURCE_BYTES,
        MAX_CROP_IMAGE_DIM,
        MAX_CROP_DECODE_ALLOC_BYTES,
    )?;
    let width = img.width();
    let height = img.height();
    if width == 0 || height == 0 {
        return Err("INVALID_IMAGE: Source image has zero dimensions".to_string());
    }

    let preview = if width > MAX_IMAGE_PREVIEW_EDGE || height > MAX_IMAGE_PREVIEW_EDGE {
        img.resize(
            MAX_IMAGE_PREVIEW_EDGE,
            MAX_IMAGE_PREVIEW_EDGE,
            image::imageops::FilterType::Triangle,
        )
    } else {
        img
    };

    let mut png_bytes = Vec::new();
    preview
        .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| format!("IMAGE_ENCODE_FAILED: Failed to encode preview PNG: {e}"))?;

    Ok(ImagePreviewPayload {
        data_url: format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&png_bytes)
        ),
        width,
        height,
    })
}

#[tauri::command]
pub async fn converter_load_image_preview(path: String) -> Result<ImagePreviewPayload, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("INVALID_PATH: Image path is required".to_string());
    }
    tokio::task::spawn_blocking(move || load_image_preview_sync(Path::new(&trimmed)))
        .await
        .map_err(|e| format!("PREVIEW_TASK_FAILED: {e}"))?
}

struct CropTempCleanup(PathBuf);

impl Drop for CropTempCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn remap_cropped_source(source: &str, temp_to_orig: &HashMap<String, String>) -> String {
    if temp_to_orig.is_empty() {
        return source.to_string();
    }
    if let Some(orig) = temp_to_orig.get(source) {
        return orig.clone();
    }
    let normalized = source.replace('/', "\\").to_ascii_lowercase();
    temp_to_orig
        .get(&normalized)
        .cloned()
        .unwrap_or_else(|| source.to_string())
}

fn remap_cli_event(event: CliEvent, temp_to_orig: &HashMap<String, String>) -> CliEvent {
    if temp_to_orig.is_empty() {
        return event;
    }
    match event {
        CliEvent::Progress { source, fraction } => CliEvent::Progress {
            source: remap_cropped_source(&source, temp_to_orig),
            fraction,
        },
        CliEvent::FileDone {
            source,
            outputs,
            state,
            error,
            error_key,
            missing_engine,
        } => CliEvent::FileDone {
            source: remap_cropped_source(&source, temp_to_orig),
            outputs,
            state,
            error,
            error_key,
            missing_engine,
        },
    }
}

async fn run_single_cli_convert(
    app: &AppHandle,
    paths: &ConverterPaths,
    cli_req: &ConvertRequest,
    cancel_rx: &mut watch::Receiver<bool>,
    temp_to_orig: &HashMap<String, String>,
) -> Result<(Vec<ConvertedFileItem>, Option<String>, Option<String>), String> {
    if CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire) {
        return Err("CANCELLED".to_string());
    }

    let args = build_convert_args(cli_req, paths);
    let std_cmd = build_cli_command(&paths.cli_exe, &args, paths);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("CLI_SPAWN_FAILED: {e}"))?;
    let pid = child.id();

    if CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire) || !attach_job_pid(&cli_req.job_id, pid) {
        terminate_child_and_tree(&mut child, pid).await;
        return Err("CANCELLED".to_string());
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let read_stdout = async move {
        let mut bytes = Vec::new();
        if let Some(out) = stdout {
            let mut limited = out.take(MAX_STDOUT_BYTES as u64);
            let _ = limited.read_to_end(&mut bytes).await;
        }
        bytes
    };

    let app_for_stderr = app.clone();
    let job_id_for_stderr = cli_req.job_id.clone();
    let temp_map_for_stderr = temp_to_orig.clone();
    let read_stderr = async move {
        let mut stderr_files = Vec::new();
        let mut missing_engine: Option<String> = None;
        let mut tail = VecDeque::with_capacity(MAX_STDERR_TAIL_LINES);

        if let Some(err) = stderr {
            let mut reader = BufReader::new(err);
            let mut buf = Vec::with_capacity(512);
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf).await {
                    Ok(0) => break,
                    Ok(_) => {
                        if buf.len() > MAX_STDERR_LINE_BYTES {
                            buf.truncate(MAX_STDERR_LINE_BYTES);
                        }
                        let line = String::from_utf8_lossy(&buf);
                        if let Some(event) = parse_cli_stderr_line(&line) {
                            let remapped = remap_cli_event(event, &temp_map_for_stderr);
                            emit_converter_event(&app_for_stderr, &job_id_for_stderr, &remapped);
                            if let CliEvent::FileDone {
                                source,
                                outputs,
                                state,
                                error,
                                error_key,
                                missing_engine: file_missing,
                            } = remapped
                            {
                                if missing_engine.is_none() {
                                    missing_engine = file_missing.clone();
                                }
                                stderr_files.push(ConvertedFileItem {
                                    source,
                                    state,
                                    outputs,
                                    error,
                                    error_key,
                                    missing_engine: file_missing,
                                });
                            }
                        } else {
                            push_stderr_tail(&mut tail, &line);
                        }
                    }
                    Err(_) => break,
                }
            }
        }

        let tail_joined = tail.into_iter().collect::<Vec<_>>().join(" | ");
        (stderr_files, missing_engine, tail_joined)
    };

    let io_result = {
        let io_fut = std::pin::pin!(futures_util::future::join(read_stdout, read_stderr));
        let cancel_fut = std::pin::pin!(wait_for_cancel(cancel_rx));
        match futures_util::future::select(io_fut, cancel_fut).await {
            futures_util::future::Either::Left((res, _)) => Some(res),
            futures_util::future::Either::Right((_, _)) => None,
        }
    };
    let Some((stdout_bytes, (stderr_files, mut missing_engine, stderr_tail))) = io_result else {
        terminate_child_and_tree(&mut child, pid).await;
        return Err("CANCELLED".to_string());
    };

    let wait_result = {
        let wait_fut = std::pin::pin!(child.wait());
        let cancel_fut = std::pin::pin!(wait_for_cancel(cancel_rx));
        match futures_util::future::select(wait_fut, cancel_fut).await {
            futures_util::future::Either::Left((res, _)) => Some(res),
            futures_util::future::Either::Right((_, _)) => None,
        }
    };
    let Some(wait_status_res) = wait_result else {
        terminate_child_and_tree(&mut child, pid).await;
        return Err("CANCELLED".to_string());
    };
    let status = wait_status_res.map_err(|e| format!("CLI_WAIT_FAILED: {e}"))?;

    if *cancel_rx.borrow() {
        return Err("CANCELLED".to_string());
    }

    let mut files = match parse_cli_stdout_json(&stdout_bytes) {
        Some(parsed) if !parsed.is_empty() => parsed,
        _ => stderr_files,
    };
    if !temp_to_orig.is_empty() {
        for item in &mut files {
            item.source = remap_cropped_source(&item.source, temp_to_orig);
        }
    }

    if missing_engine.is_none() {
        missing_engine = files.iter().find_map(|f| f.missing_engine.clone());
    }

    let detail_tail = if !stderr_tail.is_empty() {
        stderr_tail
    } else {
        files
            .iter()
            .find_map(|f| f.error.clone())
            .unwrap_or_default()
    };

    let outcome = map_cli_exit_code(status.code(), missing_engine.as_deref(), &detail_tail);
    match outcome {
        Ok(_) => Ok((files, missing_engine, None)),
        Err(err) => {
            if err.starts_with("CONVERSION_FAILED:")
                && missing_engine.is_none()
                && !files.is_empty()
            {
                Ok((files, missing_engine, Some(err)))
            } else {
                Err(err)
            }
        }
    }
}

#[tauri::command]
pub async fn converter_convert(
    app: AppHandle,
    req: ConvertRequest,
) -> Result<ConvertJobResult, String> {
    if req.job_id.trim().is_empty() {
        return Err("INVALID_REQUEST: job_id is required".to_string());
    }
    if req.inputs.is_empty() {
        return Err("NOTHING_TO_CONVERT: No input files provided".to_string());
    }
    let has_target = !req.to.trim().is_empty()
        || req
            .preset
            .as_deref()
            .is_some_and(|p| !p.trim().is_empty());
    if !has_target {
        return Err("INVALID_REQUEST: Target format or preset is required".to_string());
    }

    let paths = resolve_converter_paths(&app)?;
    for dir in [&paths.root, &paths.bin_dir, &paths.engines_dir, &paths.downloads_dir] {
        std::fs::create_dir_all(dir).map_err(|e| format!("Failed to prepare converter folder: {e}"))?;
    }
    if !paths.cli_exe.is_file() {
        return Err(format!(
            "CORE_NOT_INSTALLED: Converter runtime missing at {}",
            paths.cli_exe.display()
        ));
    }

    let (_guard, mut cancel_rx) = register_active_job(&req.job_id)?;

    let mut _crop_cleanup: Option<CropTempCleanup> = None;
    let mut temp_to_orig: HashMap<String, String> = HashMap::new();

    let runs: Vec<ConvertRequest> = if let Some(ref crop) = req.crop {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let safe_job: String = req
            .job_id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        let temp_root = paths
            .downloads_dir
            .join(format!("crop_{safe_job}_{nanos}"));
        _crop_cleanup = Some(CropTempCleanup(temp_root.clone()));

        let inputs_clone = req.inputs.clone();
        let crop_clone = crop.clone();
        let cropped_pairs = tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>, String> {
            let mut pairs = Vec::with_capacity(inputs_clone.len());
            for (idx, orig) in inputs_clone.into_iter().enumerate() {
                let slot_dir = temp_root.join(format!("item_{idx}"));
                let cropped_path = crop_image_to_temp_png(Path::new(&orig), &crop_clone, &slot_dir)?;
                pairs.push((orig, cropped_path.to_string_lossy().to_string()));
            }
            Ok(pairs)
        })
        .await
        .map_err(|e| format!("CROP_TASK_FAILED: {e}"))??;

        if *cancel_rx.borrow() {
            return Err("CANCELLED".to_string());
        }

        for (orig, temp) in &cropped_pairs {
            temp_to_orig.insert(temp.clone(), orig.clone());
            temp_to_orig.insert(temp.replace('/', "\\").to_ascii_lowercase(), orig.clone());
        }

        let explicit_out_dir = req
            .output_dir
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        if explicit_out_dir.is_some() {
            let mut r = req.clone();
            r.inputs = cropped_pairs.into_iter().map(|(_, t)| t).collect();
            r.crop = None;
            vec![r]
        } else {
            let mut grouped: Vec<(Option<String>, Vec<String>)> = Vec::new();
            for (orig, temp) in cropped_pairs {
                let parent = Path::new(&orig)
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .filter(|s| !s.is_empty());
                if let Some(existing) = grouped.iter_mut().find(|(dir, _)| *dir == parent) {
                    existing.1.push(temp);
                } else {
                    grouped.push((parent, vec![temp]));
                }
            }
            grouped
                .into_iter()
                .map(|(dir, group_inputs)| {
                    let mut r = req.clone();
                    r.inputs = group_inputs;
                    r.output_dir = dir;
                    r.crop = None;
                    r
                })
                .collect()
        }
    } else {
        vec![req.clone()]
    };

    let mut all_files = Vec::new();
    let mut missing_engine: Option<String> = None;
    let mut conversion_err: Option<String> = None;

    for cli_req in &runs {
        let (mut run_files, run_missing, run_err) =
            run_single_cli_convert(&app, &paths, cli_req, &mut cancel_rx, &temp_to_orig).await?;
        if missing_engine.is_none() {
            missing_engine = run_missing;
        }
        if conversion_err.is_none() {
            conversion_err = run_err;
        }
        all_files.append(&mut run_files);
    }

    if let Some(err) = conversion_err {
        if missing_engine.is_none() && !all_files.is_empty() {
            record_conversion_history(&app, &paths, &req, &all_files).await;
        }
        return Err(err);
    }

    record_conversion_history(&app, &paths, &req, &all_files).await;
    Ok(ConvertJobResult {
        job_id: req.job_id,
        files: all_files,
        missing_engine,
    })
}

#[tauri::command]
pub async fn converter_cancel(job_id: String) -> Result<(), String> {
    if let Some(pid) = mark_job_cancelled(&job_id) {
        terminate_process_tree(pid);
    }
    Ok(())
}

// ─── State Persistence (`state.json`), Thumbnails & Recent Conversions ────────

const MAX_RECENT_CONVERSIONS: usize = 50;
const MAX_THUMBNAIL_SOURCE_BYTES: u64 = 32 * 1024 * 1024;
static STATE_FILE_LOCK: Mutex<()> = Mutex::new(());

fn load_converter_state_unlocked(state_file: &Path) -> Result<ConverterState, String> {
    let raw = match std::fs::read_to_string(state_file) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ConverterState::default());
        }
        Err(err) => {
            return Err(format!(
                "STATE_IO_ERROR: Failed to read {}: {err}",
                state_file.display()
            ));
        }
    };

    let trimmed = raw.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return Err(format!(
            "STATE_CORRUPT: Converter state file {} is empty",
            state_file.display()
        ));
    }

    serde_json::from_str::<ConverterState>(trimmed).map_err(|err| {
        format!(
            "STATE_CORRUPT: Failed to parse converter state at {}: {err}",
            state_file.display()
        )
    })
}

fn normalize_state_recent(state: &mut ConverterState) {
    state
        .recent
        .sort_by_key(|entry| std::cmp::Reverse(entry.timestamp_ms));
    if state.recent.len() > MAX_RECENT_CONVERSIONS {
        state.recent.truncate(MAX_RECENT_CONVERSIONS);
    }
}

fn save_converter_state_atomic_unlocked(
    state_file: &Path,
    state: &mut ConverterState,
) -> Result<(), String> {
    normalize_state_recent(state);

    let Some(parent) = state_file.parent() else {
        return Err("STATE_IO_ERROR: Invalid converter state path".to_string());
    };
    std::fs::create_dir_all(parent).map_err(|err| {
        format!(
            "STATE_IO_ERROR: Failed to create converter state folder {}: {err}",
            parent.display()
        )
    })?;

    let json = serde_json::to_string_pretty(state)
        .map_err(|err| format!("STATE_SERIALIZE_ERROR: {err}"))?;

    let tmp_name = format!(
        "{}.tmp.{}.{}",
        state_file
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("state.json"),
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let tmp_path = parent.join(tmp_name);

    let write_res = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
        Ok(())
    })();

    if let Err(err) = write_res {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!(
            "STATE_IO_ERROR: Failed to write temp state {}: {err}",
            tmp_path.display()
        ));
    }

    if let Err(err) = std::fs::rename(&tmp_path, state_file) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!(
            "STATE_IO_ERROR: Failed to finalize converter state {}: {err}",
            state_file.display()
        ));
    }

    Ok(())
}

pub fn load_converter_state(paths: &ConverterPaths) -> Result<ConverterState, String> {
    let _guard = STATE_FILE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_converter_state_unlocked(&paths.state_file)
}

#[allow(dead_code)]
pub fn save_converter_state_atomic(
    paths: &ConverterPaths,
    state: &mut ConverterState,
) -> Result<(), String> {
    let _guard = STATE_FILE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    save_converter_state_atomic_unlocked(&paths.state_file, state)
}

pub fn update_converter_state<F>(
    paths: &ConverterPaths,
    mutate: F,
) -> Result<ConverterState, String>
where
    F: FnOnce(&mut ConverterState),
{
    let _guard = STATE_FILE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut state = load_converter_state_unlocked(&paths.state_file)?;
    mutate(&mut state);
    save_converter_state_atomic_unlocked(&paths.state_file, &mut state)?;
    Ok(state)
}

pub fn generate_thumbnail_data_url(path: &Path) -> Option<String> {
    use base64::Engine;

    let thumb =
        decode_image_with_limits(path, MAX_THUMBNAIL_SOURCE_BYTES, 8192, 256 * 1024 * 1024)
            .ok()?
            .thumbnail(64, 64);
    let mut png = Vec::new();
    thumb
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .ok()?;

    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    ))
}

fn infer_output_format(output_path: &str, req: &ConvertRequest) -> String {
    let trimmed_out = output_path.trim();
    if !trimmed_out.is_empty() {
        let p = Path::new(trimmed_out);
        if p.is_dir() {
            return "folder".to_string();
        }
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            let lower = name.to_ascii_lowercase();
            for compound in ["tar.gz", "tar.bz2", "tar.xz", "tar.zst", "kepub.epub"] {
                if lower.ends_with(&format!(".{compound}")) {
                    return compound.to_string();
                }
            }
        }
        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            let clean = ext.trim().to_ascii_lowercase();
            if !clean.is_empty() {
                return clean;
            }
        }
    }

    let req_to = req.to.trim().trim_start_matches('.').to_ascii_lowercase();
    if !req_to.is_empty() && req_to != "*" && req_to != "*audio" {
        return req_to;
    }
    if req_to == "*audio" {
        return "audio".to_string();
    }
    req.preset
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("file")
        .to_ascii_lowercase()
}

fn build_recent_entries(req: &ConvertRequest, files: &[ConvertedFileItem]) -> Vec<RecentConversion> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    files
        .iter()
        .enumerate()
        .filter_map(|(idx, item)| {
            let status = item.state.trim().to_ascii_lowercase();
            if status == "cancelled" {
                return None;
            }
            let src_path = Path::new(&item.source);
            let source_name = src_path
                .file_name()
                .and_then(|n| n.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(&item.source)
                .to_string();
            let source_ext = src_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            let output_path = item.outputs.first().cloned().unwrap_or_default();
            let output_format = infer_output_format(&output_path, req);
            let thumbnail_data_url = if !output_path.is_empty() && status == "done" {
                generate_thumbnail_data_url(Path::new(&output_path))
            } else {
                None
            };

            Some(RecentConversion {
                id: format!("{}-{}-{}", req.job_id, idx, now_ms),
                source_path: item.source.clone(),
                source_name,
                source_ext,
                output_path,
                output_format,
                timestamp_ms: now_ms,
                thumbnail_data_url,
                status: if status.is_empty() {
                    "done".to_string()
                } else {
                    status
                },
            })
        })
        .collect()
}

async fn record_conversion_history(
    app: &AppHandle,
    paths: &ConverterPaths,
    req: &ConvertRequest,
    files: &[ConvertedFileItem],
) {
    if files.is_empty() {
        return;
    }
    let paths_clone = paths.clone();
    let req_clone = req.clone();
    let files_clone = files.to_vec();

    let res = tokio::task::spawn_blocking(move || -> Result<Option<ConverterState>, String> {
        let entries = build_recent_entries(&req_clone, &files_clone);
        if entries.is_empty() {
            return Ok(None);
        }
        let updated = update_converter_state(&paths_clone, |state| {
            for entry in entries.into_iter().rev() {
                state.recent.insert(0, entry);
            }
        })?;
        Ok(Some(updated))
    })
    .await;

    match res {
        Ok(Ok(Some(updated))) => {
            let _ = app.emit("converter-state-changed", &updated);
        }
        Ok(Ok(None)) => {}
        Ok(Err(err)) => {
            eprintln!("Failed to record converter history: {err}");
        }
        Err(err) => {
            eprintln!("Converter history task failed: {err}");
        }
    }
}

fn sanitize_profile(mut profile: ToolbarProfileState) -> ToolbarProfileState {
    profile.id = profile.id.trim().to_string();
    profile.category = profile.category.trim().to_string();
    profile.label = profile.label.trim().to_string();
    profile.primary_ids = profile
        .primary_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    profile.secondary_ids = profile
        .secondary_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    profile
}

fn sanitize_preset(mut preset: ConverterPresetConfig) -> ConverterPresetConfig {
    preset.id = preset.id.trim().to_string();
    preset.name = preset.name.trim().to_string();
    preset.target_format = preset.target_format.trim().trim_start_matches('.').to_ascii_lowercase();
    preset.quality = preset.quality.map(|q| q.clamp(1, 100));
    preset.pages = preset
        .pages
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    preset.split_every = preset.split_every.filter(|&n| n > 0);
    preset.split_parts = if preset.split_every.is_some() {
        None
    } else {
        preset.split_parts.filter(|&n| n >= 2)
    };
    preset.conflict = preset
        .conflict
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| matches!(s.as_str(), "rename" | "overwrite" | "skip"));
    preset.iso_filesystem = preset
        .iso_filesystem
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| matches!(s.as_str(), "joliet" | "udf201"));
    preset.iso_label = preset
        .iso_label
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    preset
}

#[tauri::command]
pub async fn converter_get_state(app: AppHandle) -> Result<ConverterState, String> {
    let paths = resolve_converter_paths(&app)?;
    tokio::task::spawn_blocking(move || load_converter_state(&paths))
        .await
        .map_err(|e| format!("Failed to load converter state: {e}"))?
}

#[tauri::command]
pub async fn converter_save_profiles(
    app: AppHandle,
    profiles: Vec<ToolbarProfileState>,
) -> Result<ConverterState, String> {
    let paths = resolve_converter_paths(&app)?;
    let sanitized: Vec<ToolbarProfileState> = profiles
        .into_iter()
        .map(sanitize_profile)
        .filter(|p| !p.id.is_empty() && !p.category.is_empty())
        .collect();

    let updated = tokio::task::spawn_blocking(move || {
        update_converter_state(&paths, |state| {
            state.profiles = sanitized;
        })
    })
    .await
    .map_err(|e| format!("Failed to save converter profiles: {e}"))??;

    let _ = app.emit("converter-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
pub async fn converter_save_presets(
    app: AppHandle,
    presets: Vec<ConverterPresetConfig>,
) -> Result<ConverterState, String> {
    let paths = resolve_converter_paths(&app)?;
    let paths_for_reconcile = paths.clone();
    let sanitized: Vec<ConverterPresetConfig> = presets
        .into_iter()
        .map(sanitize_preset)
        .filter(|p| !p.id.is_empty() && !p.target_format.is_empty())
        .collect();

    let updated = tokio::task::spawn_blocking(move || {
        update_converter_state(&paths, |state| {
            state.presets = sanitized;
        })
    })
    .await
    .map_err(|e| format!("Failed to save converter presets: {e}"))??;

    let _ = app.emit("converter-state-changed", &updated);
    if updated.watch_rules.iter().any(|r| r.enabled) {
        let statuses = reconcile_watches(app.clone(), paths_for_reconcile, updated.clone()).await;
        let _ = app.emit("converter-watch-status", &statuses);
    }
    Ok(updated)
}

#[tauri::command]
pub async fn converter_clear_history(app: AppHandle) -> Result<ConverterState, String> {
    let paths = resolve_converter_paths(&app)?;
    let updated = tokio::task::spawn_blocking(move || {
        update_converter_state(&paths, |state| {
            state.recent.clear();
        })
    })
    .await
    .map_err(|e| format!("Failed to clear converter history: {e}"))??;

    let _ = app.emit("converter-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
pub async fn converter_open_output(path: String, reveal_in_folder: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return Err("INVALID_PATH: Output path is empty".to_string());
        }

        let normalized = trimmed.replace('/', "\\");
        let clean = if normalized.len() > 3 {
            normalized.trim_end_matches('\\').to_string()
        } else {
            normalized
        };

        let target = Path::new(&clean);
        if !target.exists() {
            return Err(format!(
                "FILE_NOT_FOUND: '{}' no longer exists on disk",
                target.display()
            ));
        }

        if reveal_in_folder {
            use std::os::windows::process::CommandExt;
            let escaped = clean.replace('"', "");
            std::process::Command::new("explorer.exe")
                .raw_arg(format!("/select,\"{escaped}\""))
                .spawn()
                .map_err(|e| format!("OPEN_FAILED: Failed to open Explorer: {e}"))?;
            Ok(())
        } else {
            tauri_plugin_opener::open_path(&clean, None::<&str>)
                .map_err(|e| format!("OPEN_FAILED: {e}"))
        }
    })
    .await
    .map_err(|e| format!("OPEN_FAILED: {e}"))?
}

// ─── Watch Folders Supervisor, Clean Shutdown, Explorer Menu & CLI Handoff ──

const EXPLORER_FILE_SHELL_KEY: &str = r"Software\Classes\*\shell\ZenithConvert";
const EXPLORER_DIR_SHELL_KEY: &str = r"Software\Classes\Directory\shell\ZenithConvert";
const EXPLORER_MENU_LABEL: &str = "Convert with Zenith";
const CLI_HANDOFF_MUTEX_NAME: &str = "ZenithConverterHandoffLock";
const CURRENT_APP_IDENTIFIER: &str = "io.github.abdulllrahmandev.zenith";

fn normalize_watch_target_token(raw: &str) -> String {
    let trimmed = raw.trim().trim_start_matches('.');
    if trimmed.eq_ignore_ascii_case("*audio") {
        "same-audio".to_string()
    } else {
        trimmed.to_ascii_lowercase()
    }
}

pub fn build_watch_args(rule: &WatchRule) -> Vec<String> {
    let mut args = Vec::with_capacity(12);
    args.push("watch".to_string());
    args.push(rule.folder.trim().to_string());

    if let Some(preset) = rule
        .preset_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--preset".to_string());
        args.push(preset.to_string());
    } else {
        let target = normalize_watch_target_token(&rule.target_format);
        if !target.is_empty() {
            args.push("--to".to_string());
            args.push(target);
        }
    }

    let out = rule.output_folder.trim();
    if !out.is_empty() {
        args.push("-o".to_string());
        args.push(out.to_string());
    }
    if rule.recursive {
        args.push("-r".to_string());
    }
    if rule.move_originals {
        args.push("--move-originals".to_string());
    }
    if rule.keep_dates {
        args.push("--keep-dates".to_string());
    }
    args.push("--json".to_string());
    args
}

fn append_preset_override_flags(
    args: &mut Vec<String>,
    preset: &ConverterPresetConfig,
    rule_keep_dates: bool,
) {
    if let Some(quality) = preset.quality {
        args.push("-q".to_string());
        args.push(quality.clamp(1, 100).to_string());
    }
    if let Some(pages) = preset
        .pages
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--pages".to_string());
        args.push(pages.to_string());
    }
    if let Some(every) = preset.split_every.filter(|&n| n > 0) {
        args.push("--split-every".to_string());
        args.push(every.to_string());
    } else if let Some(parts) = preset.split_parts.filter(|&n| n >= 2) {
        args.push("--split-parts".to_string());
        args.push(parts.to_string());
    }
    match preset
        .conflict
        .as_deref()
        .map(|s| s.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("overwrite") => args.push("--overwrite".to_string()),
        Some("skip") => args.push("--skip".to_string()),
        _ => {}
    }
    if preset.zip == Some(true) {
        args.push("--zip".to_string());
    }
    if let Some(fs) = preset
        .iso_filesystem
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--iso-filesystem".to_string());
        args.push(fs.to_string());
    }
    if let Some(label) = preset
        .iso_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--iso-label".to_string());
        args.push(label.to_string());
    }
    if !rule_keep_dates && preset.keep_dates == Some(true) {
        args.push("--keep-dates".to_string());
    }
}

fn build_watch_args_for_spawn(
    rule: &WatchRule,
    presets: &[ConverterPresetConfig],
) -> Vec<String> {
    let Some(pid) = rule
        .preset_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return build_watch_args(rule);
    };

    let preset_cfg = presets.iter().find(|p| p.id == pid);
    let is_custom_preset = pid.starts_with("custom-");

    if !is_custom_preset && preset_cfg.is_none() {
        return build_watch_args(rule);
    }

    let mut args = Vec::with_capacity(16);
    args.push("watch".to_string());
    args.push(rule.folder.trim().to_string());

    if is_custom_preset {
        let target_raw = preset_cfg
            .map(|p| p.target_format.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&rule.target_format);
        let target = normalize_watch_target_token(target_raw);
        if !target.is_empty() && target != "*" {
            args.push("--to".to_string());
            args.push(target);
        } else {
            args.push("--preset".to_string());
            args.push(pid.to_string());
        }
    } else {
        args.push("--preset".to_string());
        args.push(pid.to_string());
    }

    let out = rule.output_folder.trim();
    if !out.is_empty() {
        args.push("-o".to_string());
        args.push(out.to_string());
    }
    if rule.recursive {
        args.push("-r".to_string());
    }
    if rule.move_originals {
        args.push("--move-originals".to_string());
    }
    if rule.keep_dates {
        args.push("--keep-dates".to_string());
    }
    if let Some(cfg) = preset_cfg {
        append_preset_override_flags(&mut args, cfg, rule.keep_dates);
    }
    args.push("--json".to_string());
    args
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawWatchStdoutLine {
    event: String,
    #[serde(default)]
    folder: Option<String>,
    #[serde(default)]
    preset: Option<String>,
    #[serde(default)]
    target: Option<String>,
    #[serde(default, alias = "output_folder")]
    output_folder: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    outputs: Vec<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default, alias = "error_key")]
    error_key: Option<String>,
    #[serde(default, alias = "missing_engine")]
    missing_engine: Option<String>,
    #[serde(default, alias = "needs_engines")]
    needs_engines: Vec<String>,
}

pub fn parse_watch_stdout_line(line: &str) -> Option<WatchStdoutEvent> {
    let trimmed = line.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return None;
    }

    let raw: RawWatchStdoutLine = serde_json::from_str(trimmed).ok()?;
    match raw.event.as_str() {
        "started" => Some(WatchStdoutEvent::Started {
            folder: raw.folder.unwrap_or_default(),
            target: raw.target.or(raw.preset).unwrap_or_default(),
            output_folder: raw.output_folder.unwrap_or_default(),
        }),
        "file" => {
            let source = raw.source?;
            let state = raw.state?;
            let missing_engine = extract_missing_engine(
                raw.missing_engine.as_deref(),
                raw.error_key.as_deref(),
                &raw.needs_engines,
            );
            Some(WatchStdoutEvent::FileDone(ConvertedFileItem {
                source,
                state,
                outputs: raw.outputs,
                error: raw.error,
                error_key: raw.error_key,
                missing_engine,
            }))
        }
        "stopped" => Some(WatchStdoutEvent::Stopped),
        _ => None,
    }
}

pub fn parse_convert_cli_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    let mut found_flag = false;
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for raw in args {
        let trimmed = raw.trim();
        if !found_flag {
            if trimmed.eq_ignore_ascii_case("--convert") {
                found_flag = true;
            }
            continue;
        }
        if trimmed.is_empty()
            || trimmed.starts_with("--")
            || matches!(trimmed, "-h" | "-v" | "-?")
        {
            continue;
        }
        let owned = trimmed.to_string();
        if seen.insert(owned.clone()) {
            out.push(owned);
        }
    }
    out
}

fn sanitize_watch_rule(mut rule: WatchRule) -> WatchRule {
    rule.id = rule.id.trim().to_string();
    rule.folder = rule.folder.trim().to_string();
    rule.target_format = rule
        .target_format
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    rule.preset_id = rule
        .preset_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    rule.output_folder = rule.output_folder.trim().to_string();
    rule
}

fn build_watch_statuses_unlocked(mgr: &WatchManagerState) -> Vec<WatchRuleStatus> {
    mgr.ordered_ids
        .iter()
        .filter_map(|id| {
            mgr.entries.get(id).map(|entry| WatchRuleStatus {
                id: id.clone(),
                running: entry.running,
                converted_count: entry.converted_count,
                last_error: entry.last_error.clone(),
            })
        })
        .collect()
}

fn snapshot_watch_statuses() -> Vec<WatchRuleStatus> {
    let Ok(mgr) = watch_manager().lock() else {
        return Vec::new();
    };
    build_watch_statuses_unlocked(&mgr)
}

fn emit_watch_statuses(app: &AppHandle) {
    let statuses = snapshot_watch_statuses();
    let _ = app.emit("converter-watch-status", &statuses);
}

fn update_watch_entry_if_current<F>(rule_id: &str, gen: u64, update: F) -> bool
where
    F: FnOnce(&mut ActiveWatchEntry),
{
    let Ok(mut mgr) = watch_manager().lock() else {
        return false;
    };
    let Some(entry) = mgr.entries.get_mut(rule_id) else {
        return false;
    };
    if entry.generation != gen {
        return false;
    }
    update(entry);
    true
}

fn spawn_watch_worker(
    app: AppHandle,
    paths: ConverterPaths,
    rule: WatchRule,
    mut child: tokio::process::Child,
    pid: Option<u32>,
    gen: u64,
    mut cancel_rx: watch::Receiver<bool>,
) {
    tauri::async_runtime::spawn(async move {
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let rule_id = rule.id.clone();

        let app_for_stdout = app.clone();
        let paths_for_stdout = paths.clone();
        let rule_for_stdout = rule.clone();
        let rule_id_stdout = rule_id.clone();
        let read_stdout = async move {
            if let Some(out) = stdout {
                let mut reader = BufReader::new(out);
                let mut buf = Vec::with_capacity(512);
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf).await {
                        Ok(0) => break,
                        Ok(_) => {
                            if buf.len() > MAX_STDERR_LINE_BYTES {
                                buf.truncate(MAX_STDERR_LINE_BYTES);
                            }
                            let line = String::from_utf8_lossy(&buf);
                            let Some(ev) = parse_watch_stdout_line(&line) else {
                                continue;
                            };
                            match ev {
                                WatchStdoutEvent::Started { .. } => {
                                    if update_watch_entry_if_current(&rule_id_stdout, gen, |e| {
                                        e.running = true;
                                        e.last_error = None;
                                    }) {
                                        emit_watch_statuses(&app_for_stdout);
                                    }
                                }
                                WatchStdoutEvent::FileDone(item) => {
                                    let is_done = item.state.eq_ignore_ascii_case("done");
                                    let is_failed = item.state.eq_ignore_ascii_case("failed");
                                    let item_err = item.error.clone().or_else(|| {
                                        item.missing_engine
                                            .as_ref()
                                            .map(|eng| format!("Missing optional pack: {eng}"))
                                    });
                                    let changed = update_watch_entry_if_current(
                                        &rule_id_stdout,
                                        gen,
                                        |e| {
                                            if is_done {
                                                e.converted_count =
                                                    e.converted_count.saturating_add(1);
                                                e.last_error = None;
                                            } else if is_failed {
                                                e.last_error = item_err.clone();
                                            }
                                        },
                                    );
                                    if changed {
                                        emit_watch_statuses(&app_for_stdout);
                                    }
                                    let seq = WATCH_HISTORY_SEQ.fetch_add(1, Ordering::Relaxed);
                                    let synthetic_req = ConvertRequest {
                                        job_id: format!("watch-{}-{seq}", rule_for_stdout.id),
                                        inputs: vec![item.source.clone()],
                                        to: rule_for_stdout.target_format.clone(),
                                        preset: rule_for_stdout.preset_id.clone(),
                                        output_dir: (!rule_for_stdout
                                            .output_folder
                                            .trim()
                                            .is_empty())
                                        .then(|| rule_for_stdout.output_folder.clone()),
                                        quality: None,
                                        pages: None,
                                        split_every: None,
                                        split_parts: None,
                                        conflict: None,
                                        overwrite: None,
                                        keep_dates: Some(rule_for_stdout.keep_dates),
                                        zip: None,
                                        iso_filesystem: None,
                                        iso_label: None,
                                        crop: None,
                                    };
                                    record_conversion_history(
                                        &app_for_stdout,
                                        &paths_for_stdout,
                                        &synthetic_req,
                                        &[item],
                                    )
                                    .await;
                                }
                                WatchStdoutEvent::Stopped => {
                                    if update_watch_entry_if_current(&rule_id_stdout, gen, |e| {
                                        e.running = false;
                                    }) {
                                        emit_watch_statuses(&app_for_stdout);
                                    }
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        };

        let read_stderr = async move {
            let mut tail = VecDeque::with_capacity(MAX_STDERR_TAIL_LINES);
            if let Some(err) = stderr {
                let mut reader = BufReader::new(err);
                let mut buf = Vec::with_capacity(512);
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf).await {
                        Ok(0) => break,
                        Ok(_) => {
                            if buf.len() > MAX_STDERR_LINE_BYTES {
                                buf.truncate(MAX_STDERR_LINE_BYTES);
                            }
                            let line = String::from_utf8_lossy(&buf);
                            push_stderr_tail(&mut tail, &line);
                        }
                        Err(_) => break,
                    }
                }
            }
            tail.into_iter().collect::<Vec<_>>().join(" | ")
        };

        let io_result = {
            let io_fut = std::pin::pin!(futures_util::future::join(read_stdout, read_stderr));
            let cancel_fut = std::pin::pin!(wait_for_cancel(&mut cancel_rx));
            match futures_util::future::select(io_fut, cancel_fut).await {
                futures_util::future::Either::Left((res, _)) => Some(res),
                futures_util::future::Either::Right((_, _)) => None,
            }
        };

        let Some((_, stderr_tail)) = io_result else {
            terminate_child_and_tree(&mut child, pid).await;
            return;
        };

        let wait_result = {
            let wait_fut = std::pin::pin!(child.wait());
            let cancel_fut = std::pin::pin!(wait_for_cancel(&mut cancel_rx));
            match futures_util::future::select(wait_fut, cancel_fut).await {
                futures_util::future::Either::Left((res, _)) => Some(res),
                futures_util::future::Either::Right((_, _)) => None,
            }
        };

        let Some(status_res) = wait_result else {
            terminate_child_and_tree(&mut child, pid).await;
            return;
        };

        if *cancel_rx.borrow() || CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire) {
            return;
        }

        let err_msg = match status_res {
            Ok(status) if status.success() => None,
            Ok(status) => Some(if !stderr_tail.trim().is_empty() {
                stderr_tail
            } else if let Some(code) = status.code() {
                format!("Watch process exited with code {code}")
            } else {
                "Watch process terminated unexpectedly".to_string()
            }),
            Err(e) => Some(format!("Watch wait failed: {e}")),
        };

        if update_watch_entry_if_current(&rule_id, gen, |e| {
            e.running = false;
            e.pid = None;
            if err_msg.is_some() {
                e.last_error = err_msg.clone();
            }
        }) {
            emit_watch_statuses(&app);
        }
    });
}

async fn reconcile_watches(
    app: AppHandle,
    paths: ConverterPaths,
    state: ConverterState,
) -> Vec<WatchRuleStatus> {
    let _reconcile_guard = watch_reconcile_lock().lock().await;
    let shutting_down = CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire);
    let core_installed = paths.cli_exe.is_file();

    struct PendingSpawn {
        rule: WatchRule,
        args: Vec<String>,
        gen: u64,
        cancel_tx: watch::Sender<bool>,
        cancel_rx: watch::Receiver<bool>,
    }

    let mut pids_to_kill: Vec<u32> = Vec::new();
    let mut pending_spawns: Vec<PendingSpawn> = Vec::new();

    {
        let Ok(mut mgr) = watch_manager().lock() else {
            return Vec::new();
        };

        let next_rules_by_id: HashMap<String, (WatchRule, Vec<String>)> = state
            .watch_rules
            .iter()
            .map(|r| {
                let args = build_watch_args_for_spawn(r, &state.presets);
                (r.id.clone(), (r.clone(), args))
            })
            .collect();

        // Cancel & remove rules that disappeared, became disabled, lost core/folder, or changed config.
        let existing_ids: Vec<String> = mgr.entries.keys().cloned().collect();
        for id in existing_ids {
            let keep = next_rules_by_id
                .get(&id)
                .is_some_and(|(next_rule, next_args)| {
                    let entry = &mgr.entries[&id];
                    !shutting_down
                        && next_rule.enabled
                        && core_installed
                        && Path::new(next_rule.folder.trim()).is_dir()
                        && entry.running
                        && entry.pid.is_some()
                        && entry.effective_args == *next_args
                });

            if !keep {
                if let Some(mut old) = mgr.entries.remove(&id) {
                    let _ = old.cancel_tx.send(true);
                    if let Some(pid) = old.pid.take() {
                        pids_to_kill.push(pid);
                    }
                }
            }
        }

        mgr.ordered_ids = state.watch_rules.iter().map(|r| r.id.clone()).collect();

        for rule in &state.watch_rules {
            if mgr.entries.contains_key(&rule.id) {
                continue;
            }
            let effective_args = next_rules_by_id
                .get(&rule.id)
                .map(|(_, a)| a.clone())
                .unwrap_or_else(|| build_watch_args(rule));
            let (cancel_tx, cancel_rx) = watch::channel(false);

            if shutting_down || !rule.enabled {
                mgr.entries.insert(
                    rule.id.clone(),
                    ActiveWatchEntry {
                        generation: 0,
                        effective_args,
                        pid: None,
                        cancel_tx,
                        running: false,
                        converted_count: 0,
                        last_error: None,
                    },
                );
                continue;
            }

            if !core_installed {
                mgr.entries.insert(
                    rule.id.clone(),
                    ActiveWatchEntry {
                        generation: 0,
                        effective_args,
                        pid: None,
                        cancel_tx,
                        running: false,
                        converted_count: 0,
                        last_error: Some(
                            "Core converter runtime is not installed yet.".to_string(),
                        ),
                    },
                );
                continue;
            }

            if !Path::new(rule.folder.trim()).is_dir() {
                mgr.entries.insert(
                    rule.id.clone(),
                    ActiveWatchEntry {
                        generation: 0,
                        effective_args,
                        pid: None,
                        cancel_tx,
                        running: false,
                        converted_count: 0,
                        last_error: Some(format!(
                            "Watch folder does not exist: {}",
                            rule.folder.trim()
                        )),
                    },
                );
                continue;
            }

            let gen = WATCH_GENERATION_SEQ.fetch_add(1, Ordering::SeqCst);
            mgr.entries.insert(
                rule.id.clone(),
                ActiveWatchEntry {
                    generation: gen,
                    effective_args: effective_args.clone(),
                    pid: None,
                    cancel_tx: cancel_tx.clone(),
                    running: false,
                    converted_count: 0,
                    last_error: None,
                },
            );
            pending_spawns.push(PendingSpawn {
                rule: rule.clone(),
                args: effective_args,
                gen,
                cancel_tx,
                cancel_rx,
            });
        }
    }

    for pid in pids_to_kill {
        terminate_process_tree(pid);
    }

    for item in pending_spawns {
        if CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire) {
            let _ = item.cancel_tx.send(true);
            continue;
        }
        let std_cmd = build_cli_command(&paths.cli_exe, &item.args, &paths);
        let mut cmd = tokio::process::Command::from(std_cmd);
        cmd.kill_on_drop(true);

        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                if CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire) {
                    terminate_child_and_tree(&mut child, pid).await;
                    continue;
                }
                let attached = update_watch_entry_if_current(&item.rule.id, item.gen, |e| {
                    e.pid = pid;
                    e.running = true;
                    e.last_error = None;
                });
                if !attached {
                    terminate_child_and_tree(&mut child, pid).await;
                    continue;
                }
                spawn_watch_worker(
                    app.clone(),
                    paths.clone(),
                    item.rule,
                    child,
                    pid,
                    item.gen,
                    item.cancel_rx,
                );
            }
            Err(e) => {
                let _ = update_watch_entry_if_current(&item.rule.id, item.gen, |entry| {
                    entry.running = false;
                    entry.pid = None;
                    entry.last_error = Some(format!("Failed to start watch process: {e}"));
                });
            }
        }
    }

    snapshot_watch_statuses()
}

pub fn start_enabled_watches(app: &AppHandle) {
    let Ok(paths) = resolve_converter_paths(app) else {
        return;
    };
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = tokio::task::spawn_blocking({
            let p = paths.clone();
            move || load_converter_state(&p)
        })
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();

        if state.watch_rules.is_empty() {
            return;
        }
        let statuses = reconcile_watches(app_clone.clone(), paths, state).await;
        let _ = app_clone.emit("converter-watch-status", &statuses);
    });
}

pub fn shutdown_converter() {
    CONVERTER_SHUTTING_DOWN.store(true, Ordering::SeqCst);
    let mut pids_to_kill: Vec<u32> = Vec::new();

    if let Ok(mut mgr) = watch_manager().lock() {
        for entry in mgr.entries.values_mut() {
            entry.running = false;
            let _ = entry.cancel_tx.send(true);
            if let Some(pid) = entry.pid.take() {
                pids_to_kill.push(pid);
            }
        }
    }

    if let Ok(mut jobs) = active_jobs_map().lock() {
        for state in jobs.values_mut() {
            state.cancelled = true;
            let _ = state.cancel_tx.send(true);
            if let Some(pid) = state.pid.take() {
                pids_to_kill.push(pid);
            }
        }
    }

    for pid in pids_to_kill {
        terminate_process_tree(pid);
    }
}

#[tauri::command]
pub async fn converter_save_watch_rules(
    app: AppHandle,
    rules: Vec<WatchRule>,
) -> Result<Vec<WatchRuleStatus>, String> {
    let paths = resolve_converter_paths(&app)?;
    let mut seen_ids = HashSet::new();
    let sanitized: Vec<WatchRule> = rules
        .into_iter()
        .map(sanitize_watch_rule)
        .filter(|r| {
            !r.id.is_empty()
                && !r.folder.is_empty()
                && (!r.target_format.is_empty() || r.preset_id.is_some())
                && seen_ids.insert(r.id.clone())
        })
        .collect();

    let paths_clone = paths.clone();
    let updated = tokio::task::spawn_blocking(move || {
        update_converter_state(&paths_clone, |state| {
            state.watch_rules = sanitized;
        })
    })
    .await
    .map_err(|e| format!("Failed to save watch rules: {e}"))??;

    let _ = app.emit("converter-state-changed", &updated);
    let statuses = reconcile_watches(app.clone(), paths, updated).await;
    let _ = app.emit("converter-watch-status", &statuses);
    Ok(statuses)
}

#[tauri::command]
pub async fn converter_get_watch_statuses() -> Result<Vec<WatchRuleStatus>, String> {
    Ok(snapshot_watch_statuses())
}

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn reg_set_sz(
    hkey: windows::Win32::System::Registry::HKEY,
    value_name: Option<&str>,
    data: &str,
) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegSetValueExW, REG_SZ};

    let name_wide = value_name.map(to_wide_null);
    let data_wide = to_wide_null(data);
    let byte_slice = unsafe {
        std::slice::from_raw_parts(
            data_wide.as_ptr() as *const u8,
            data_wide.len() * std::mem::size_of::<u16>(),
        )
    };
    let name_ptr = name_wide
        .as_ref()
        .map(|w| PCWSTR(w.as_ptr()))
        .unwrap_or_else(PCWSTR::null);
    let err = unsafe { RegSetValueExW(hkey, name_ptr, None, REG_SZ, Some(byte_slice)) };
    if err.0 != 0 {
        return Err(format!(
            "REGISTRY_ERROR: RegSetValueExW failed with code {}",
            err.0
        ));
    }
    Ok(())
}

fn write_hkcu_shell_entry(
    subkey: &str,
    label: &str,
    icon: &str,
    command: &str,
) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_OPTION_NON_VOLATILE,
    };

    let subkey_wide = to_wide_null(subkey);
    let mut hkey = HKEY::default();
    let err = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_wide.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut hkey,
            None,
        )
    };
    if err.0 != 0 {
        return Err(format!(
            "REGISTRY_ERROR: Failed to create HKCU\\{subkey} (code {})",
            err.0
        ));
    }
    let write_parent = (|| -> Result<(), String> {
        reg_set_sz(hkey, None, label)?;
        reg_set_sz(hkey, Some("Icon"), icon)?;
        Ok(())
    })();
    unsafe {
        let _ = RegCloseKey(hkey);
    }
    write_parent?;

    let cmd_subkey = format!("{subkey}\\command");
    let cmd_wide = to_wide_null(&cmd_subkey);
    let mut cmd_hkey = HKEY::default();
    let err = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(cmd_wide.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut cmd_hkey,
            None,
        )
    };
    if err.0 != 0 {
        return Err(format!(
            "REGISTRY_ERROR: Failed to create HKCU\\{cmd_subkey} (code {})",
            err.0
        ));
    }
    let write_cmd = reg_set_sz(cmd_hkey, None, command);
    unsafe {
        let _ = RegCloseKey(cmd_hkey);
    }
    write_cmd
}

fn delete_hkcu_shell_entry(subkey: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND};
    use windows::Win32::System::Registry::{RegDeleteTreeW, HKEY_CURRENT_USER};

    let subkey_wide = to_wide_null(subkey);
    let err = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(subkey_wide.as_ptr())) };
    if err.0 != 0 && err != ERROR_FILE_NOT_FOUND && err != ERROR_PATH_NOT_FOUND {
        return Err(format!(
            "REGISTRY_ERROR: Failed to remove HKCU\\{subkey} (code {})",
            err.0
        ));
    }
    Ok(())
}

fn hkcu_shell_entry_exists(subkey: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };

    let subkey_wide = to_wide_null(subkey);
    let mut hkey = HKEY::default();
    let err = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_wide.as_ptr()),
            None,
            KEY_READ,
            &mut hkey,
        )
    };
    if err.0 == 0 {
        unsafe {
            let _ = RegCloseKey(hkey);
        }
        true
    } else {
        false
    }
}

pub fn apply_explorer_menu_registry(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("REGISTRY_ERROR: Failed to resolve executable path: {e}"))?;
        let exe_raw = exe_path.to_string_lossy();
        let exe_clean = exe_raw.strip_prefix(r"\\?\").unwrap_or(&exe_raw);
        let icon = format!("{exe_clean},0");
        let cmd = format!("\"{exe_clean}\" --convert \"%1\"");
        write_hkcu_shell_entry(EXPLORER_FILE_SHELL_KEY, EXPLORER_MENU_LABEL, &icon, &cmd)?;
        write_hkcu_shell_entry(EXPLORER_DIR_SHELL_KEY, EXPLORER_MENU_LABEL, &icon, &cmd)?;
    } else {
        delete_hkcu_shell_entry(EXPLORER_FILE_SHELL_KEY)?;
        delete_hkcu_shell_entry(EXPLORER_DIR_SHELL_KEY)?;
    }
    Ok(())
}

pub fn sync_explorer_menu_from_settings(app: &AppHandle) {
    let enabled = crate::utils::get_setting_str(app, "zenith-converter-explorer-menu")
        .or_else(|| crate::utils::get_setting_str(app, "bloom-converter-explorer-menu"))
        .is_some_and(|v| v == "true");

    if enabled
        || hkcu_shell_entry_exists(EXPLORER_FILE_SHELL_KEY)
        || hkcu_shell_entry_exists(EXPLORER_DIR_SHELL_KEY)
    {
        if let Err(err) = apply_explorer_menu_registry(enabled) {
            eprintln!("Failed to sync Windows Explorer context menu: {err}");
        }
    }
}

#[tauri::command]
pub async fn converter_toggle_explorer_menu(
    app: AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || apply_explorer_menu_registry(enabled))
        .await
        .map_err(|e| format!("REGISTRY_ERROR: {e}"))??;

    crate::commands::persist_setting_and_emit(
        &app,
        "zenith-converter-explorer-menu".to_string(),
        serde_json::Value::String(if enabled { "true" } else { "false" }.to_string()),
    )?;
    Ok(enabled)
}

fn cli_handoff_file_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(
        PathBuf::from(appdata)
            .join(CURRENT_APP_IDENTIFIER)
            .join("converter")
            .join("cli-handoff.json"),
    )
}

struct NamedMutexGuard(windows::Win32::Foundation::HANDLE);

impl Drop for NamedMutexGuard {
    fn drop(&mut self) {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::ReleaseMutex;
        unsafe {
            let _ = ReleaseMutex(self.0);
            let _ = CloseHandle(self.0);
        }
    }
}

fn acquire_cli_handoff_mutex() -> Option<NamedMutexGuard> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{CreateMutexW, WaitForSingleObject};

    let name_wide = to_wide_null(CLI_HANDOFF_MUTEX_NAME);
    unsafe {
        let handle = CreateMutexW(None, false, PCWSTR(name_wide.as_ptr())).ok()?;
        let wait = WaitForSingleObject(handle, 2000);
        // WAIT_OBJECT_0 (0) or WAIT_ABANDONED (0x80) both grant ownership.
        if wait.0 == 0 || wait.0 == 0x80 {
            Some(NamedMutexGuard(handle))
        } else {
            let _ = CloseHandle(handle);
            None
        }
    }
}

pub fn write_cli_handoff_paths(paths: &[String]) -> Result<(), String> {
    let Some(file_path) = cli_handoff_file_path() else {
        return Err("APPDATA environment variable is missing".to_string());
    };
    let _guard = acquire_cli_handoff_mutex();

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut merged: Vec<String> = match std::fs::read_to_string(&file_path) {
        Ok(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    for p in paths {
        let trimmed = p.trim();
        if !trimmed.is_empty() && !merged.iter().any(|existing| existing == trimmed) {
            merged.push(trimmed.to_string());
        }
    }

    let json = serde_json::to_string(&merged).map_err(|e| e.to_string())?;
    let tmp_path = file_path.with_extension(format!("tmp.{}", std::process::id()));
    std::fs::write(&tmp_path, json.as_bytes()).map_err(|e| e.to_string())?;
    if let Err(err) = std::fs::rename(&tmp_path, &file_path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(err.to_string());
    }
    Ok(())
}

pub fn take_cli_handoff_paths() -> Vec<String> {
    let Some(file_path) = cli_handoff_file_path() else {
        return Vec::new();
    };
    let _guard = acquire_cli_handoff_mutex();

    let paths = match std::fs::read_to_string(&file_path) {
        Ok(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let _ = std::fs::remove_file(&file_path);
    paths
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn open_converter_donut_from_cli(app: &AppHandle, paths: Vec<String>) {
    if crate::state::SHUTTING_DOWN.load(Ordering::Acquire)
        || CONVERTER_SHUTTING_DOWN.load(Ordering::Acquire)
    {
        return;
    }
    let clean_paths: Vec<String> = paths
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if clean_paths.is_empty() {
        return;
    }

    let mut pt = windows::Win32::Foundation::POINT::default();
    unsafe {
        let _ = windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt);
    }

    CONVERTER_DRAG_IS_BROWSER.store(false, Ordering::Relaxed);
    let session_id = prepare_converter_overlay_open();
    crate::commands::show_overlay_for_converter(app, pt.x, pt.y, session_id);

    if !is_converter_session_current(session_id) || !CONVERTER_OVERLAY_OPEN.load(Ordering::Acquire) {
        return;
    }

    let (x, y) = crate::services::screen_to_radial_css(pt.x, pt.y);
    let _ = app.emit_to(
        "overlay",
        "converter-donut-open",
        serde_json::json!({
            "x": x,
            "y": y,
            "paths": clean_paths,
            "urls": Vec::<String>::new(),
            "isBrowserDrag": false,
            "fromCli": true,
        }),
    );
}

#[derive(Deserialize)]
struct RawEnginesListDoc {
    engines: Vec<RawEngineEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEngineEntry {
    id: String,
    status: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    downloadable: bool,
    #[serde(default, alias = "download_size")]
    download_size: u64,
    #[serde(default, alias = "installed_size")]
    installed_size: u64,
    #[serde(default)]
    converters: Vec<String>,
    #[serde(default)]
    outdated: bool,
    #[serde(default, alias = "from_system")]
    from_system: bool,
    #[serde(default)]
    folder: Option<String>,
    #[serde(default, alias = "unavailable_reason")]
    unavailable_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEngineProgressLine {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    component: Option<String>,
    #[serde(default)]
    fraction: Option<f64>,
    #[serde(default, alias = "bytes_done")]
    bytes_done: u64,
    #[serde(default, alias = "bytes_total")]
    bytes_total: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEngineCommandResult {
    #[allow(dead_code)]
    id: String,
    state: String,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default, alias = "error_key")]
    error_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    #[allow(dead_code)]
    tag_name: String,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

pub fn parse_engines_list_json(raw_json: &str) -> Result<Vec<EnginePackInfo>, String> {
    let trimmed = raw_json.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return Err("Empty engines JSON response".to_string());
    }

    let doc: RawEnginesListDoc =
        serde_json::from_str(trimmed).map_err(|e| format!("Invalid engines JSON: {e}"))?;

    Ok(doc
        .engines
        .into_iter()
        .map(|entry| {
            let normalized_status = match entry.status.trim().to_ascii_lowercase().as_str() {
                "not_installed" => "notinstalled".to_string(),
                other => other.to_string(),
            };
            EnginePackInfo {
                id: entry.id.trim().to_string(),
                status: normalized_status,
                version: entry.version.filter(|v| !v.trim().is_empty()),
                downloadable: entry.downloadable,
                download_size: entry.download_size,
                installed_size: entry.installed_size,
                converters: entry.converters,
                outdated: entry.outdated,
                from_system: entry.from_system,
                folder: entry.folder.filter(|f| !f.trim().is_empty()),
                unavailable_reason: entry.unavailable_reason.filter(|r| !r.trim().is_empty()),
            }
        })
        .collect())
}

pub fn parse_engine_progress_line(line: &str) -> Option<EngineInstallProgressEvent> {
    let trimmed = line.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return None;
    }

    let raw: RawEngineProgressLine = serde_json::from_str(trimmed).ok()?;
    let id = raw.id?.trim().to_string();
    let stage = raw.stage?.trim().to_string();
    if id.is_empty() || stage.is_empty() {
        return None;
    }
    let fraction_raw = raw.fraction?;
    if !fraction_raw.is_finite() {
        return None;
    }
    let component = raw
        .component
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| id.clone());

    Some(EngineInstallProgressEvent {
        id,
        stage,
        component,
        fraction: fraction_raw.clamp(0.0, 1.0),
        bytes_done: raw.bytes_done,
        bytes_total: raw.bytes_total,
    })
}

pub fn validate_engine_id(id: &str) -> Result<&str, String> {
    if id.is_empty()
        || id.len() > 64
        || id.starts_with('-')
        || id.ends_with('-')
        || id.contains("--")
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(format!("INVALID_ENGINE_ID: Invalid engine pack id '{id}'"));
    }
    Ok(id)
}

pub fn fallback_engine_catalog() -> Vec<EnginePackInfo> {
    struct Spec {
        id: &'static str,
        version: &'static str,
        download_size: u64,
        installed_size: u64,
        converter: &'static str,
    }

    const SPECS: &[Spec] = &[
        Spec {
            id: "libreoffice",
            version: "26.2.6",
            download_size: 422_969_790,
            installed_size: 1_265_000_000,
            converter: "libreoffice",
        },
        Spec {
            id: "pandoc",
            version: "3.13",
            download_size: 42_983_200,
            installed_size: 236_000_000,
            converter: "pandoc",
        },
        Spec {
            id: "ghostscript",
            version: "10.08.0",
            download_size: 19_978_812,
            installed_size: 31_000_000,
            converter: "ghostscript",
        },
        Spec {
            id: "ffmpeg",
            version: "9.1",
            download_size: 104_990_867,
            installed_size: 272_000_000,
            converter: "ffmpeg",
        },
        Spec {
            id: "calibre",
            version: "9.17.0",
            download_size: 240_201_728,
            installed_size: 663_000_000,
            converter: "calibre",
        },
        Spec {
            id: "weasyprint",
            version: "70.0",
            download_size: 32_271_073,
            installed_size: 65_000_000,
            converter: "weasyprint",
        },
        Spec {
            id: "tesseract",
            version: "5.4.0.20240606",
            download_size: 50_175_248,
            installed_size: 168_000_000,
            converter: "tesseract",
        },
        Spec {
            id: "upscayl-bin",
            version: "20251207",
            download_size: 3_218_696,
            installed_size: 8_600_000,
            converter: "upscaler",
        },
        Spec {
            id: "whisper",
            version: "b5454",
            download_size: 156_880_105,
            installed_size: 156_880_105,
            converter: "whisper",
        },
        Spec {
            id: "exiftool",
            version: "13.60",
            download_size: 11_198_064,
            installed_size: 30_000_000,
            converter: "exiftool",
        },
    ];

    SPECS
        .iter()
        .map(|s| EnginePackInfo {
            id: s.id.to_string(),
            status: "notinstalled".to_string(),
            version: Some(s.version.to_string()),
            downloadable: true,
            download_size: s.download_size,
            installed_size: s.installed_size,
            converters: vec![s.converter.to_string()],
            outdated: false,
            from_system: false,
            folder: None,
            unavailable_reason: None,
        })
        .collect()
}

fn is_valid_sha256_hex(val: &str) -> bool {
    val.len() == 64 && val.bytes().all(|b| b.is_ascii_hexdigit())
}

fn parse_sha256_sums_entry(sums_text: &str, target_filename: &str) -> Option<String> {
    for line in sums_text.lines() {
        let trimmed = line.trim().trim_start_matches('\u{feff}');
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((hash_part, rest)) = trimmed.split_once(char::is_whitespace) else {
            continue;
        };
        let hash = hash_part.trim();
        if !is_valid_sha256_hex(hash) {
            continue;
        }
        let file_part = rest.trim().trim_start_matches('*');
        if file_part.eq_ignore_ascii_case(target_filename) {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

fn parse_github_digest(digest: Option<&str>) -> Option<String> {
    let raw = digest?.trim();
    let hex = raw
        .strip_prefix("sha256:")
        .or_else(|| raw.strip_prefix("SHA256:"))?;
    if is_valid_sha256_hex(hex) {
        Some(hex.to_ascii_lowercase())
    } else {
        None
    }
}

fn select_windows_portable_asset(assets: &[GitHubAsset], is_arm64: bool) -> Option<&GitHubAsset> {
    if is_arm64 {
        if let Some(arm) = assets
            .iter()
            .find(|a| a.name.to_ascii_lowercase().ends_with("-win-arm64-portable.zip"))
        {
            return Some(arm);
        }
    }
    assets.iter().find(|a| {
        let lower = a.name.to_ascii_lowercase();
        lower.ends_with("-win-portable.zip") && !lower.contains("-arm64-")
    })
}

fn find_windows_checksum_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    assets.iter().find(|a| {
        let lower = a.name.to_ascii_lowercase();
        !lower.ends_with(".sig")
            && !lower.contains("-linux-")
            && !lower.contains("-osx-")
            && !lower.contains("-arm64-")
            && (lower.ends_with("-sha256sums.txt") || lower == "sha256sums.txt")
    })
}

fn emit_core_progress(app: &AppHandle, stage: &str, fraction: f64, message: impl Into<String>) {
    let _ = app.emit(
        "converter-core-progress",
        CoreInstallProgressEvent {
            stage: stage.to_string(),
            fraction: fraction.clamp(0.0, 1.0),
            message: message.into(),
        },
    );
}

fn ensure_converter_dirs(paths: &ConverterPaths) -> Result<(), String> {
    for dir in [
        &paths.root,
        &paths.bin_dir,
        &paths.engines_dir,
        &paths.downloads_dir,
    ] {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to prepare converter folder {}: {e}", dir.display()))?;
    }
    Ok(())
}

async fn query_cli_version(paths: &ConverterPaths) -> Option<String> {
    if !paths.cli_exe.is_file() {
        return None;
    }
    let meta = std::fs::metadata(&paths.cli_exe).ok()?;
    let file_len = meta.len();
    let modified = meta.modified().ok();
    if let Ok(cache) = cli_version_cache().lock() {
        if let Some((cached_path, cached_len, cached_mod, cached_ver)) = cache.as_ref() {
            if cached_path == &paths.cli_exe && *cached_len == file_len && *cached_mod == modified
            {
                return Some(cached_ver.clone());
            }
        }
    }

    let args = vec!["version".to_string()];
    let std_cmd = build_cli_command(&paths.cli_exe, &args, paths);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);
    let output = cmd.output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().map(str::trim).find(|l| !l.is_empty())?;
    let version = line
        .strip_prefix("filee ")
        .unwrap_or(line)
        .trim()
        .to_string();
    if version.is_empty() {
        return None;
    }
    if let Ok(mut cache) = cli_version_cache().lock() {
        *cache = Some((paths.cli_exe.clone(), file_len, modified, version.clone()));
    }
    Some(version)
}

fn find_bundled_converter_dir(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("resources").join("converter"));
        candidates.push(res_dir.join("converter"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("converter"));
            candidates.push(dir.join("converter"));
            if let Some(target_parent) = dir.parent().and_then(|p| p.parent()) {
                candidates.push(target_parent.join("resources").join("converter"));
            }
        }
    }

    candidates
        .into_iter()
        .find(|dir| dir.join("filee-cli.exe").is_file())
}

fn copy_dir_skipping_portable(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {e}", dst.display()))?;
    let entries = std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {e}", src.display()))?;

    for entry_res in entries {
        let entry = entry_res.map_err(|e| format!("Failed to inspect directory entry: {e}"))?;
        let file_name = entry.file_name();
        let lower = file_name.to_string_lossy().to_ascii_lowercase();
        if lower == "filee.portable" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&file_name);
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to check entry type: {e}"))?;
        if file_type.is_dir() {
            copy_dir_skipping_portable(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {}: {e}", src_path.display()))?;
        }
    }
    Ok(())
}

fn promote_staging_to_bin_dir(staging_dir: &Path, bin_dir: &Path) -> Result<(), String> {
    if !staging_dir.join("filee-cli.exe").is_file() {
        let mut nested_root: Option<PathBuf> = None;
        if let Ok(entries) = std::fs::read_dir(staging_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                if candidate.is_dir() && candidate.join("filee-cli.exe").is_file() {
                    nested_root = Some(candidate);
                    break;
                }
            }
        }
        if let Some(inner) = nested_root {
            let flattened = staging_dir.with_file_name("bin.flattened");
            if flattened.exists() {
                let _ = std::fs::remove_dir_all(&flattened);
            }
            copy_dir_skipping_portable(&inner, &flattened)?;
            let _ = std::fs::remove_dir_all(staging_dir);
            std::fs::rename(&flattened, staging_dir)
                .map_err(|e| format!("Failed to normalize staged runtime folder: {e}"))?;
        }
    }

    if !staging_dir.join("filee-cli.exe").is_file() {
        return Err("INVALID_ARCHIVE: filee-cli.exe was not found inside archive".to_string());
    }

    let backup_dir = bin_dir.with_file_name("bin.backup");
    if backup_dir.exists() {
        let _ = std::fs::remove_dir_all(&backup_dir);
    }

    let had_existing = bin_dir.exists();
    if had_existing {
        std::fs::rename(bin_dir, &backup_dir).map_err(|e| {
            format!(
                "Failed to replace existing converter runtime (close running conversions and retry): {e}"
            )
        })?;
    }

    if let Err(e) = std::fs::rename(staging_dir, bin_dir) {
        if had_existing && backup_dir.exists() {
            let _ = std::fs::rename(&backup_dir, bin_dir);
        }
        return Err(format!("Failed to finalize converter runtime folder: {e}"));
    }

    if backup_dir.exists() {
        let _ = std::fs::remove_dir_all(&backup_dir);
    }
    if let Ok(mut cache) = cli_version_cache().lock() {
        *cache = None;
    }
    Ok(())
}

fn extract_portable_zip_verified_with_hook<F: FnOnce()>(
    zip_path: &Path,
    staging_dir: &Path,
    bin_dir: &Path,
    expected_sha256: &str,
    expected_size: u64,
    on_verified: F,
) -> Result<(), String> {
    if !is_valid_sha256_hex(expected_sha256) {
        return Err(
            "INTEGRITY_ERROR: Missing or malformed expected SHA-256 checksum for converter runtime archive."
                .to_string(),
        );
    }

    let zip_bytes = std::fs::read(zip_path)
        .map_err(|e| format!("Failed to read downloaded runtime archive: {e}"))?;
    if expected_size > 0 && zip_bytes.len() as u64 != expected_size {
        return Err(format!(
            "INTEGRITY_ERROR: Downloaded archive size mismatch (got {} bytes, expected {expected_size})",
            zip_bytes.len()
        ));
    }

    let actual_hex = compute_sha256_hex(&zip_bytes);
    if !actual_hex.eq_ignore_ascii_case(expected_sha256) {
        return Err(format!(
            "INTEGRITY_ERROR: Converter runtime archive SHA-256 mismatch (expected {expected_sha256}, got {actual_hex})"
        ));
    }

    on_verified();

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("INVALID_ARCHIVE: Downloaded file is not a valid zip: {e}"))?;

    if staging_dir.exists() {
        std::fs::remove_dir_all(staging_dir)
            .map_err(|e| format!("Failed to clear staging directory: {e}"))?;
    }
    std::fs::create_dir_all(staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {e}"))?;

    for idx in 0..archive.len() {
        let mut entry = archive
            .by_index(idx)
            .map_err(|e| format!("Failed to read zip entry: {e}"))?;
        let Some(enclosed) = entry.enclosed_name() else {
            return Err("INTEGRITY_ERROR: Zip archive contains unsafe path traversal".to_string());
        };
        if enclosed
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err("INTEGRITY_ERROR: Zip archive contains invalid path component".to_string());
        }
        let file_name_lower = enclosed
            .file_name()
            .map(|n| n.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if file_name_lower == "filee.portable" {
            continue;
        }

        let target_path = staging_dir.join(&enclosed);
        if entry.is_dir() {
            std::fs::create_dir_all(&target_path)
                .map_err(|e| format!("Failed to create folder {}: {e}", target_path.display()))?;
        } else {
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent folder: {e}"))?;
            }
            let mut out_file = std::fs::File::create(&target_path)
                .map_err(|e| format!("Failed to write {}: {e}", target_path.display()))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("Failed to extract {}: {e}", target_path.display()))?;
        }
    }

    promote_staging_to_bin_dir(staging_dir, bin_dir)
}

#[cfg(test)]
fn extract_portable_zip_verified(
    zip_path: &Path,
    staging_dir: &Path,
    bin_dir: &Path,
    expected_sha256: &str,
    expected_size: u64,
) -> Result<(), String> {
    extract_portable_zip_verified_with_hook(
        zip_path,
        staging_dir,
        bin_dir,
        expected_sha256,
        expected_size,
        || {},
    )
}

fn resolve_expected_sha256(
    sums_sha: Option<String>,
    digest_sha: Option<String>,
    asset_name: &str,
) -> Result<String, String> {
    match (sums_sha, digest_sha) {
        (Some(s), Some(d)) if !s.eq_ignore_ascii_case(&d) => Err(
            "INTEGRITY_ERROR: Release SHA256SUMS and GitHub asset digest disagree.".to_string(),
        ),
        (Some(s), _) => Ok(s.to_ascii_lowercase()),
        (None, Some(d)) => Ok(d.to_ascii_lowercase()),
        (None, None) => Err(format!(
            "INTEGRITY_ERROR: No SHA-256 checksum published for {asset_name}. Refusing unverified download."
        )),
    }
}

fn map_github_reqwest_error(context: &str, err: reqwest::Error) -> String {
    if err.is_connect() || err.is_timeout() {
        format!(
            "NETWORK_ERROR: Offline or network timeout while {context}. Check your internet connection ({err})."
        )
    } else {
        format!("NETWORK_ERROR: Request failed while {context}: {err}")
    }
}

fn check_github_response_status(resp: &reqwest::Response, context: &str) -> Result<(), String> {
    let status = resp.status();
    if status.is_success() {
        return Ok(());
    }
    let remaining = resp
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok());
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || (status == reqwest::StatusCode::FORBIDDEN && remaining == Some("0"))
        || status == reqwest::StatusCode::FORBIDDEN
    {
        return Err(format!(
            "RATE_LIMITED: GitHub API rate limit or access restriction ({status}) while {context}. Please wait a bit and try again."
        ));
    }
    Err(format!(
        "RELEASE_FETCH_ERROR: GitHub returned HTTP {status} while {context}."
    ))
}

async fn ensure_core_inner(
    app: &AppHandle,
    paths: &ConverterPaths,
) -> Result<ConverterRuntimeStatus, String> {
    ensure_converter_dirs(paths)?;

    if paths.cli_exe.is_file() {
        let version = query_cli_version(paths).await;
        emit_core_progress(app, "ready", 1.0, "Converter runtime is ready");
        return Ok(ConverterRuntimeStatus {
            core_installed: true,
            version,
            cli_path: paths.cli_exe.to_string_lossy().to_string(),
            installing: false,
        });
    }

    let staging_dir = paths.root.join("bin.staging");
    if let Some(bundled_dir) = find_bundled_converter_dir(app) {
        emit_core_progress(app, "copying", 0.35, "Installing bundled converter runtime...");
        let bin_dir = paths.bin_dir.clone();
        let staging_clone = staging_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            if staging_clone.exists() {
                let _ = std::fs::remove_dir_all(&staging_clone);
            }
            copy_dir_skipping_portable(&bundled_dir, &staging_clone)?;
            promote_staging_to_bin_dir(&staging_clone, &bin_dir)
        })
        .await
        .map_err(|e| format!("Bundled runtime setup task failed: {e}"))??;

        let version = query_cli_version(paths).await;
        emit_core_progress(app, "ready", 1.0, "Converter runtime is ready");
        return Ok(ConverterRuntimeStatus {
            core_installed: true,
            version,
            cli_path: paths.cli_exe.to_string_lossy().to_string(),
            installing: false,
        });
    }

    emit_core_progress(app, "checking", 0.05, "Checking latest Filee release...");
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .user_agent(GITHUB_USER_AGENT)
        .build()
        .map_err(|e| format!("HTTP client initialization failed: {e}"))?;

    let release_resp = client
        .get(FILEE_LATEST_RELEASE_URL)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .timeout(Duration::from_secs(25))
        .send()
        .await
        .map_err(|e| map_github_reqwest_error("checking Filee releases", e))?;
    check_github_response_status(&release_resp, "checking Filee releases")?;

    let release: GitHubRelease = release_resp
        .json()
        .await
        .map_err(|e| format!("RELEASE_FETCH_ERROR: Invalid GitHub release payload: {e}"))?;

    let is_arm64 = cfg!(target_arch = "aarch64");
    let portable_asset = select_windows_portable_asset(&release.assets, is_arm64)
        .ok_or_else(|| {
            "RELEASE_ASSET_MISSING: No Windows Portable archive found in the latest Filee release."
                .to_string()
        })?
        .clone();

    let digest_sha = parse_github_digest(portable_asset.digest.as_deref());
    let sums_sha = if let Some(sums_asset) = find_windows_checksum_asset(&release.assets) {
        let sums_resp = client
            .get(&sums_asset.browser_download_url)
            .timeout(Duration::from_secs(25))
            .send()
            .await
            .map_err(|e| map_github_reqwest_error("downloading release checksums", e))?;
        check_github_response_status(&sums_resp, "downloading release checksums")?;
        let sums_text = sums_resp
            .text()
            .await
            .map_err(|e| format!("Failed to read SHA256SUMS text: {e}"))?;
        Some(
            parse_sha256_sums_entry(&sums_text, &portable_asset.name).ok_or_else(|| {
                format!(
                    "INTEGRITY_ERROR: Checksum entry for {} missing from {}",
                    portable_asset.name, sums_asset.name
                )
            })?,
        )
    } else {
        None
    };

    let expected_sha256 = resolve_expected_sha256(sums_sha, digest_sha, &portable_asset.name)?;

    let zip_part = paths.downloads_dir.join("filee-portable.zip.part");
    if zip_part.exists() {
        let _ = std::fs::remove_file(&zip_part);
    }

    emit_core_progress(
        app,
        "downloading",
        0.10,
        format!("Downloading {}...", portable_asset.name),
    );

    let dl_resp = client
        .get(&portable_asset.browser_download_url)
        .send()
        .await
        .map_err(|e| map_github_reqwest_error("downloading Filee runtime", e))?;
    check_github_response_status(&dl_resp, "downloading Filee runtime")?;

    let content_len = dl_resp
        .content_length()
        .or((portable_asset.size > 0).then_some(portable_asset.size));

    {
        let mut out_file = std::fs::File::create(&zip_part)
            .map_err(|e| format!("Failed to create download file {}: {e}", zip_part.display()))?;
        let mut stream = dl_resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_emit = Instant::now();

        while let Some(chunk_res) = stream.next().await {
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    drop(out_file);
                    let _ = std::fs::remove_file(&zip_part);
                    return Err(map_github_reqwest_error("streaming Filee runtime", e));
                }
            };
            if let Err(e) = out_file.write_all(&chunk) {
                drop(out_file);
                let _ = std::fs::remove_file(&zip_part);
                return Err(format!("Disk write failed while saving Filee runtime: {e}"));
            }
            downloaded += chunk.len() as u64;

            if last_emit.elapsed() >= Duration::from_millis(120) {
                let dl_ratio = content_len
                    .filter(|&total| total > 0)
                    .map(|total| (downloaded as f64 / total as f64).clamp(0.0, 1.0))
                    .unwrap_or(0.5);
                let mb_done = downloaded as f64 / (1024.0 * 1024.0);
                let msg = if let Some(total) = content_len.filter(|&t| t > 0) {
                    let mb_total = total as f64 / (1024.0 * 1024.0);
                    format!("Downloading runtime ({mb_done:.1} / {mb_total:.1} MB)...")
                } else {
                    format!("Downloading runtime ({mb_done:.1} MB)...")
                };
                emit_core_progress(app, "downloading", 0.10 + dl_ratio * 0.68, msg);
                last_emit = Instant::now();
            }
        }
        out_file
            .flush()
            .map_err(|e| format!("Disk flush failed for runtime archive: {e}"))?;
    }

    emit_core_progress(app, "verifying", 0.82, "Verifying archive integrity...");
    let zip_part_clone = zip_part.clone();
    let staging_clone = staging_dir.clone();
    let bin_dir_clone = paths.bin_dir.clone();
    let expected_size = portable_asset.size;
    let app_clone = app.clone();

    let extract_res = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let res = extract_portable_zip_verified_with_hook(
            &zip_part_clone,
            &staging_clone,
            &bin_dir_clone,
            &expected_sha256,
            expected_size,
            || {
                emit_core_progress(&app_clone, "extracting", 0.88, "Extracting converter runtime...");
            },
        );
        let _ = std::fs::remove_file(&zip_part_clone);
        if staging_clone.exists() {
            let _ = std::fs::remove_dir_all(&staging_clone);
        }
        res
    })
    .await
    .map_err(|e| format!("Archive extraction task failed: {e}"))?;

    extract_res?;

    let version = query_cli_version(paths).await;
    emit_core_progress(app, "ready", 1.0, "Converter runtime is ready");
    Ok(ConverterRuntimeStatus {
        core_installed: paths.cli_exe.is_file(),
        version,
        cli_path: paths.cli_exe.to_string_lossy().to_string(),
        installing: false,
    })
}

async fn list_engines_via_cli(paths: &ConverterPaths) -> Result<Vec<EnginePackInfo>, String> {
    let args = vec!["engines".to_string(), "--json".to_string()];
    let std_cmd = build_cli_command(&paths.cli_exe, &args, paths);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("CLI_SPAWN_FAILED: Failed to query converter engines: {e}"))?;

    if !output.status.success() {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(format_cli_error(
            "ENGINES_LIST_FAILED",
            "Failed to query optional converter packs",
            &stderr_str,
        ));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    parse_engines_list_json(&stdout_str)
}

#[derive(Copy, Clone)]
enum EngineAction {
    Install,
    Remove,
}

impl EngineAction {
    fn verb(self) -> &'static str {
        match self {
            EngineAction::Install => "install",
            EngineAction::Remove => "remove",
        }
    }
}

fn parse_engine_command_result(stdout_bytes: &[u8]) -> Option<RawEngineCommandResult> {
    let text = String::from_utf8_lossy(stdout_bytes);
    let trimmed = text.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

async fn run_engine_subcommand(
    app: AppHandle,
    id: &str,
    action: EngineAction,
) -> Result<EnginePackInfo, String> {
    let valid_id = validate_engine_id(id)?;
    let paths = resolve_converter_paths(&app)?;
    ensure_converter_dirs(&paths)?;

    if !paths.cli_exe.is_file() {
        return Err(format!(
            "CORE_NOT_INSTALLED: Converter runtime missing at {}",
            paths.cli_exe.display()
        ));
    }

    {
        let mut ops = active_engine_ops_set()
            .lock()
            .map_err(|_| "Engine operations lock poisoned".to_string())?;
        if !ops.insert(valid_id.to_string()) {
            return Err(format!(
                "ENGINE_OP_IN_PROGRESS: An operation for '{valid_id}' is already running."
            ));
        }
    }
    let _op_guard = ActiveEngineOpGuard {
        id: valid_id.to_string(),
    };

    let args = vec![
        "engines".to_string(),
        action.verb().to_string(),
        valid_id.to_string(),
        "--json".to_string(),
    ];
    let std_cmd = build_cli_command(&paths.cli_exe, &args, &paths);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("CLI_SPAWN_FAILED: Failed to run engine command: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let read_stdout = async move {
        let mut bytes = Vec::new();
        if let Some(out) = stdout {
            let mut limited = out.take(MAX_STDOUT_BYTES as u64);
            let _ = limited.read_to_end(&mut bytes).await;
        }
        bytes
    };

    let app_for_stderr = app.clone();
    let read_stderr = async move {
        let mut tail = VecDeque::with_capacity(MAX_STDERR_TAIL_LINES);
        if let Some(err) = stderr {
            let mut reader = BufReader::new(err);
            let mut buf = Vec::with_capacity(512);
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf).await {
                    Ok(0) => break,
                    Ok(_) => {
                        if buf.len() > MAX_STDERR_LINE_BYTES {
                            buf.truncate(MAX_STDERR_LINE_BYTES);
                        }
                        let line = String::from_utf8_lossy(&buf);
                        if let Some(ev) = parse_engine_progress_line(&line) {
                            let _ = app_for_stderr.emit("converter-engine-progress", ev);
                        } else {
                            push_stderr_tail(&mut tail, &line);
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        tail.into_iter().collect::<Vec<_>>().join(" | ")
    };

    let (stdout_bytes, stderr_tail) = futures_util::future::join(read_stdout, read_stderr).await;
    let status = child
        .wait()
        .await
        .map_err(|e| format!("CLI_WAIT_FAILED: {e}"))?;

    let cmd_res = parse_engine_command_result(&stdout_bytes);
    if !status.success() {
        let err_detail = cmd_res
            .as_ref()
            .and_then(|r| r.error.as_deref().or(r.reason.as_deref()))
            .filter(|s| !s.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| stderr_tail.clone());
        let code_label = cmd_res
            .as_ref()
            .and_then(|r| r.error_key.as_deref())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(match action {
                EngineAction::Install => "ENGINE_INSTALL_FAILED",
                EngineAction::Remove => "ENGINE_REMOVE_FAILED",
            });
        return Err(format_cli_error(
            code_label,
            &format!("Engine {} failed for {valid_id}", action.verb()),
            &err_detail,
        ));
    }

    if let Some(ref r) = cmd_res {
        if r.state == "failed" || r.state == "cancelled" {
            let detail = r
                .error
                .as_deref()
                .or(r.reason.as_deref())
                .unwrap_or(&stderr_tail);
            return Err(format_cli_error(
                "ENGINE_OP_FAILED",
                &format!("Engine {} failed for {valid_id}", action.verb()),
                detail,
            ));
        }
    }

    let updated = list_engines_via_cli(&paths).await?;
    updated
        .into_iter()
        .find(|e| e.id.eq_ignore_ascii_case(valid_id))
        .ok_or_else(|| format!("ENGINE_NOT_FOUND: Pack '{valid_id}' missing from engines list"))
}

#[tauri::command]
pub async fn converter_status(app: AppHandle) -> Result<ConverterRuntimeStatus, String> {
    let paths = resolve_converter_paths(&app)?;
    let core_installed = paths.cli_exe.is_file();
    let version = if core_installed {
        query_cli_version(&paths).await
    } else {
        None
    };
    Ok(ConverterRuntimeStatus {
        core_installed,
        version,
        cli_path: paths.cli_exe.to_string_lossy().to_string(),
        installing: CORE_INSTALLING.load(Ordering::SeqCst),
    })
}

#[tauri::command]
pub async fn converter_ensure_core(app: AppHandle) -> Result<ConverterRuntimeStatus, String> {
    if CORE_INSTALLING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(
            "CORE_INSTALL_IN_PROGRESS: Core converter runtime setup is already in progress."
                .to_string(),
        );
    }
    let _guard = CoreInstallingGuard;

    let paths = resolve_converter_paths(&app)?;
    match ensure_core_inner(&app, &paths).await {
        Ok(status) => {
            if status.core_installed {
                let app_clone = app.clone();
                let paths_clone = paths.clone();
                tauri::async_runtime::spawn(async move {
                    let st = tokio::task::spawn_blocking({
                        let p = paths_clone.clone();
                        move || load_converter_state(&p)
                    })
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .unwrap_or_default();
                    let statuses = reconcile_watches(app_clone.clone(), paths_clone, st).await;
                    let _ = app_clone.emit("converter-watch-status", &statuses);
                });
            }
            Ok(status)
        }
        Err(err) => {
            emit_core_progress(&app, "error", 0.0, err.clone());
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn converter_list_engines(app: AppHandle) -> Result<Vec<EnginePackInfo>, String> {
    let paths = resolve_converter_paths(&app)?;
    if !paths.cli_exe.is_file() {
        return Ok(fallback_engine_catalog());
    }
    list_engines_via_cli(&paths).await
}

#[tauri::command]
pub async fn converter_install_engine(
    app: AppHandle,
    id: String,
) -> Result<EnginePackInfo, String> {
    run_engine_subcommand(app, &id, EngineAction::Install).await
}

#[tauri::command]
pub async fn converter_remove_engine(
    app: AppHandle,
    id: String,
) -> Result<EnginePackInfo, String> {
    run_engine_subcommand(app, &id, EngineAction::Remove).await
}

// ─── Drag Trigger Config, Arbitration & Overlay IDropTarget Bridge ───────────

const REJECTED_SHELL_CLASSES: &[&str] = &[
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "NotifyIconOverflowWindow",
    "MSTaskSwWClass",
    "TaskListThumbnailWnd",
    "TrayNotifyWnd",
    "TopLevelWindowForOverflowXamlIsland",
    "Windows.UI.Core.CoreWindow",
];

const EXPLORER_AND_DESKTOP_CLASSES: &[&str] = &[
    "CabinetWClass",
    "ExploreWClass",
    "Progman",
    "WorkerW",
];

const DESKTOP_OWNED_LAYER_CLASSES: &[&str] = &[
    "SHELLDLL_DefView",
    "SysListView32",
    "DirectUIHWND",
];

const FILE_MANAGER_PROCESSES: &[&str] = &[
    "files",
    "dopus",
    "totalcmd64",
    "totalcmd",
    "xyplorer",
    "onecommander",
    "q-dir",
    "freecommander",
    "fpilot",
    "xplorer2_64",
    "rustyfiles",
];

const BROWSER_PROCESSES: &[&str] = &[
    "chrome",
    "msedge",
    "firefox",
    "brave",
    "opera",
    "vivaldi",
    "arc",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConverterTriggerKey {
    Ctrl,
    Alt,
    Shift,
    RightDrag,
}

impl ConverterTriggerKey {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "alt" => Self::Alt,
            "shift" => Self::Shift,
            "right-drag" | "right_drag" | "rightdrag" => Self::RightDrag,
            _ => Self::Ctrl,
        }
    }

    fn to_u8(self) -> u8 {
        match self {
            Self::Ctrl => 0,
            Self::Alt => 1,
            Self::Shift => 2,
            Self::RightDrag => 3,
        }
    }

    fn from_u8(val: u8) -> Self {
        match val {
            1 => Self::Alt,
            2 => Self::Shift,
            3 => Self::RightDrag,
            _ => Self::Ctrl,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConverterDragConfig {
    pub enabled: bool,
    pub trigger_key: ConverterTriggerKey,
    pub browser_drag: bool,
}

impl Default for ConverterDragConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            trigger_key: ConverterTriggerKey::Ctrl,
            browser_drag: true,
        }
    }
}

static CONVERTER_CFG_ENABLED: AtomicBool = AtomicBool::new(true);
static CONVERTER_CFG_TRIGGER_KEY: AtomicU8 = AtomicU8::new(0);
static CONVERTER_CFG_BROWSER_DRAG: AtomicBool = AtomicBool::new(true);

pub static CONVERTER_OVERLAY_OPEN: AtomicBool = AtomicBool::new(false);
pub static CONVERTER_OLE_DRAG_ENTERED: AtomicBool = AtomicBool::new(false);
pub static CONVERTER_OLE_DROP_DONE: AtomicBool = AtomicBool::new(false);
pub static CONVERTER_DRAG_IS_BROWSER: AtomicBool = AtomicBool::new(false);
pub static CONVERTER_DRAG_SESSION_ID: AtomicU64 = AtomicU64::new(0);
static CONVERTER_CLOSE_DISPATCHED_SESSION: AtomicU64 = AtomicU64::new(0);
static CONVERTER_SESSION_LOCK: Mutex<()> = Mutex::new(());
static MAIN_THREAD_ID: OnceLock<ThreadId> = OnceLock::new();

pub fn set_main_thread_id(id: ThreadId) {
    let _ = MAIN_THREAD_ID.set(id);
}

pub fn get_converter_drag_config() -> ConverterDragConfig {
    ConverterDragConfig {
        enabled: CONVERTER_CFG_ENABLED.load(Ordering::Relaxed),
        trigger_key: ConverterTriggerKey::from_u8(
            CONVERTER_CFG_TRIGGER_KEY.load(Ordering::Relaxed),
        ),
        browser_drag: CONVERTER_CFG_BROWSER_DRAG.load(Ordering::Relaxed),
    }
}

pub fn set_converter_drag_config(cfg: ConverterDragConfig) {
    CONVERTER_CFG_ENABLED.store(cfg.enabled, Ordering::Relaxed);
    CONVERTER_CFG_TRIGGER_KEY.store(cfg.trigger_key.to_u8(), Ordering::Relaxed);
    CONVERTER_CFG_BROWSER_DRAG.store(cfg.browser_drag, Ordering::Relaxed);
}

pub fn sync_trigger_config_from_settings(app: &AppHandle) {
    let enabled = crate::utils::get_setting_str(app, "zenith-converter-enabled")
        .as_deref()
        != Some("false");
    let trigger_raw = crate::utils::get_setting_str(app, "zenith-converter-trigger-key")
        .unwrap_or_else(|| "ctrl".to_string());
    let browser_drag = crate::utils::get_setting_str(app, "zenith-converter-browser-drag")
        .as_deref()
        != Some("false");

    set_converter_drag_config(ConverterDragConfig {
        enabled,
        trigger_key: ConverterTriggerKey::parse(&trigger_raw),
        browser_drag,
    });
}

#[tauri::command]
pub fn converter_update_trigger_config(enabled: bool, trigger_key: String, browser_drag: bool) {
    set_converter_drag_config(ConverterDragConfig {
        enabled,
        trigger_key: ConverterTriggerKey::parse(&trigger_key),
        browser_drag,
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConverterShowAction {
    Proceed,
    BailAlreadyInactive,
    CancelAndBail,
}

/// Pure session-guard decision for `show_overlay_for_converter`.
/// Never resurrects a cancelled or superseded `expected_session_id`, and signals
/// `CancelAndBail` when Compass or Splash owns the overlay.
pub fn evaluate_converter_show_session(
    expected_session_id: u64,
    current_session_id: u64,
    overlay_open: bool,
    radial_open: bool,
    in_splash: bool,
) -> ConverterShowAction {
    if expected_session_id == 0 || current_session_id != expected_session_id || !overlay_open {
        return ConverterShowAction::BailAlreadyInactive;
    }
    if radial_open || in_splash {
        return ConverterShowAction::CancelAndBail;
    }
    ConverterShowAction::Proceed
}

#[cfg(test)]
pub fn set_converter_overlay_open(open: bool) {
    let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    CONVERTER_OVERLAY_OPEN.store(open, Ordering::SeqCst);
}

pub fn prepare_converter_overlay_open() -> u64 {
    let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let session_id = CONVERTER_DRAG_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
    CONVERTER_OLE_DROP_DONE.store(false, Ordering::SeqCst);
    CONVERTER_CLOSE_DISPATCHED_SESSION.store(0, Ordering::SeqCst);
    CONVERTER_OVERLAY_OPEN.store(true, Ordering::SeqCst);
    session_id
}

pub fn check_converter_show_session(
    expected_session_id: u64,
    radial_open: bool,
    in_splash: bool,
) -> ConverterShowAction {
    let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let action = evaluate_converter_show_session(
        expected_session_id,
        CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst),
        CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst),
        radial_open,
        in_splash,
    );
    if action == ConverterShowAction::CancelAndBail {
        CONVERTER_OVERLAY_OPEN.store(false, Ordering::SeqCst);
        CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
    }
    action
}

pub fn is_converter_session_current(expected_session_id: u64) -> bool {
    expected_session_id != 0 && CONVERTER_DRAG_SESSION_ID.load(Ordering::Acquire) == expected_session_id
}

pub fn reset_converter_state_for_radial(app: &AppHandle) {
    {
        let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        CONVERTER_DRAG_SESSION_ID.fetch_add(1, Ordering::SeqCst);
        CONVERTER_OVERLAY_OPEN.store(false, Ordering::SeqCst);
        CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
        CONVERTER_OLE_DROP_DONE.store(false, Ordering::SeqCst);
    }
    let _ = app.emit_to("overlay", "converter-donut-close", serde_json::json!({}));
}

pub fn close_converter_overlay(app: &AppHandle) {
    let was_open = {
        let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
        CONVERTER_OVERLAY_OPEN.swap(false, Ordering::SeqCst)
    };
    if was_open {
        let _ = app.emit_to("overlay", "converter-donut-close", serde_json::json!({}));
    }
    if !crate::services::MOUSE_RADIAL_MENU_OPEN.load(Ordering::Relaxed)
        && !crate::state::OVERLAY_IN_SPLASH.load(Ordering::Relaxed)
    {
        crate::commands::restore_overlay_click_through(app);
    }
}

pub fn close_converter_overlay_for_session(app: &AppHandle, session_id: u64) {
    let should_close = {
        let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst) == session_id
            && CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst)
            && !CONVERTER_OLE_DROP_DONE.load(Ordering::SeqCst)
        {
            CONVERTER_OVERLAY_OPEN.store(false, Ordering::SeqCst);
            CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
            true
        } else {
            false
        }
    };
    if should_close {
        let _ = app.emit_to("overlay", "converter-donut-close", serde_json::json!({}));
        if !crate::services::MOUSE_RADIAL_MENU_OPEN.load(Ordering::Relaxed)
            && !crate::state::OVERLAY_IN_SPLASH.load(Ordering::Relaxed)
        {
            crate::commands::restore_overlay_click_through(app);
        }
    }
}

pub fn request_close_converter_overlay_once(app: &AppHandle) {
    if !CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst) {
        return;
    }
    let session = CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst);
    if CONVERTER_CLOSE_DISPATCHED_SESSION.swap(session, Ordering::SeqCst) != session {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            close_converter_overlay(&app_clone);
        });
    }
}

static CONVERTER_PROGRESS_RECT: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);

pub fn has_converter_progress_rect() -> bool {
    CONVERTER_PROGRESS_RECT
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .is_some_and(|(x, y, width, height)| {
            x.is_finite()
                && y.is_finite()
                && width.is_finite()
                && height.is_finite()
                && width > 0.0
                && height > 0.0
        })
}

pub fn rect_contains_point(rect: Option<(f64, f64, f64, f64)>, rel_x: f64, rel_y: f64) -> bool {
    if !rel_x.is_finite() || !rel_y.is_finite() {
        return false;
    }
    let Some((x, y, width, height)) = rect else {
        return false;
    };
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
    {
        return false;
    }
    rel_x >= x && rel_x <= x + width && rel_y >= y && rel_y <= y + height
}

pub fn is_point_in_converter_progress_rect(rel_x: f64, rel_y: f64) -> bool {
    let Ok(guard) = CONVERTER_PROGRESS_RECT.lock() else {
        return false;
    };
    rect_contains_point(*guard, rel_x, rel_y)
}

#[tauri::command]
pub fn converter_set_progress_rect(x: f64, y: f64, width: f64, height: f64) {
    if let Ok(mut guard) = CONVERTER_PROGRESS_RECT.lock() {
        if x.is_finite()
            && y.is_finite()
            && width.is_finite()
            && height.is_finite()
            && width > 0.0
            && height > 0.0
        {
            *guard = Some((x, y, width, height));
        } else {
            *guard = None;
        }
    }
}

#[tauri::command]
pub fn converter_clear_progress_rect() {
    if let Ok(mut guard) = CONVERTER_PROGRESS_RECT.lock() {
        *guard = None;
    }
}

#[tauri::command]
pub fn converter_set_overlay_open(app: AppHandle, open: bool) {
    {
        let _guard = CONVERTER_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        CONVERTER_OVERLAY_OPEN.store(open, Ordering::SeqCst);
        if !open {
            CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
        }
    }
    if !open
        && !crate::services::MOUSE_RADIAL_MENU_OPEN.load(Ordering::Relaxed)
        && !crate::state::OVERLAY_IN_SPLASH.load(Ordering::Relaxed)
    {
        crate::commands::restore_overlay_click_through(&app);
    }
}

/// Pure arbitration guard determining whether a drag should activate the converter overlay.
pub fn should_open_converter_drag(
    converter_enabled: bool,
    radial_open: bool,
    over_notch_window: bool,
    trigger_held: bool,
    drag_distance_sq: i32,
    threshold_px: i32,
) -> bool {
    if !converter_enabled || radial_open || over_notch_window || !trigger_held {
        return false;
    }
    if drag_distance_sq < 0 {
        return false;
    }
    let min_dist = threshold_px.max(0) as i64;
    (drag_distance_sq as i64) >= min_dist * min_dist
}

/// Disarms an armed modifier-key drag once cursor travel reaches `threshold_px`
/// without the modifier held, preventing mid-drag Ctrl/Alt/Shift presses in normal
/// Explorer Move/Copy operations from activating Converter mid-flight.
/// `RightDrag` uses the mouse button itself rather than a keyboard modifier.
pub fn should_disarm_normal_drag(
    trigger_key: ConverterTriggerKey,
    trigger_held: bool,
    drag_distance_sq: i32,
    threshold_px: i32,
) -> bool {
    if matches!(trigger_key, ConverterTriggerKey::RightDrag) || trigger_held {
        return false;
    }
    if drag_distance_sq < 0 {
        return false;
    }
    let min_dist = threshold_px.max(0) as i64;
    (drag_distance_sq as i64) >= min_dist * min_dist
}

fn normalize_process_stem(process_name: Option<&str>) -> Option<String> {
    let raw = process_name?.trim();
    if raw.is_empty() {
        return None;
    }
    let base = raw.rsplit(['\\', '/']).next().unwrap_or(raw).trim();
    if base.is_empty() {
        return None;
    }
    let lower = base.to_ascii_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower).trim();
    if stem.is_empty() {
        None
    } else {
        Some(stem.to_string())
    }
}

pub fn is_converter_browser_process(process_name: Option<&str>) -> bool {
    let Some(stem) = normalize_process_stem(process_name) else {
        return false;
    };
    BROWSER_PROCESSES.contains(&stem.as_str())
}

pub fn is_converter_explorer_or_desktop_class(window_class: Option<&str>) -> bool {
    let Some(cls) = window_class.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    EXPLORER_AND_DESKTOP_CLASSES
        .iter()
        .any(|known| known.eq_ignore_ascii_case(cls))
}

fn is_rejected_shell_class(window_class: Option<&str>) -> bool {
    let Some(cls) = window_class.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    REJECTED_SHELL_CLASSES
        .iter()
        .any(|rejected| rejected.eq_ignore_ascii_case(cls))
}

fn is_desktop_owned_layer_class(window_class: Option<&str>) -> bool {
    let Some(cls) = window_class.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    DESKTOP_OWNED_LAYER_CLASSES
        .iter()
        .any(|known| known.eq_ignore_ascii_case(cls))
}

/// Returns true if the drag originated from Explorer, Desktop, a supported file manager,
/// or a supported browser (only when `browser_drag_enabled` is true).
/// Rejects taskbar/shell chrome classes and restricts `explorer.exe` to Explorer/Desktop classes.
pub fn is_converter_drag_source(
    window_class: Option<&str>,
    process_name: Option<&str>,
    browser_drag_enabled: bool,
) -> bool {
    if is_rejected_shell_class(window_class) {
        return false;
    }

    let proc_stem = normalize_process_stem(process_name);
    let is_explorer_proc = proc_stem.as_deref() == Some("explorer");

    if is_converter_explorer_or_desktop_class(window_class)
        && (process_name.is_none() || is_explorer_proc)
    {
        return true;
    }
    if is_explorer_proc && is_desktop_owned_layer_class(window_class) {
        return true;
    }

    if let Some(stem) = proc_stem {
        if FILE_MANAGER_PROCESSES.contains(&stem.as_str()) {
            return true;
        }
        if browser_drag_enabled && BROWSER_PROCESSES.contains(&stem.as_str()) {
            return true;
        }
    }
    false
}

fn is_supported_drag_url(candidate: &str) -> bool {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    (lower.starts_with("http://") && trimmed.len() > "http://".len())
        || (lower.starts_with("https://") && trimmed.len() > "https://".len())
        || (lower.starts_with("file://") && trimmed.len() > "file://".len())
        || (lower.starts_with("ftp://") && trimmed.len() > "ftp://".len())
}

fn parse_url_lines(raw: &str) -> Vec<String> {
    let mut urls = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if is_supported_drag_url(trimmed) && !urls.iter().any(|u| u == trimmed) {
            urls.push(trimmed.to_string());
        }
    }
    urls
}

const MAX_URL_UNITS: usize = 1 << 15;
const MAX_CF_HTML_BYTES: usize = 44 * 1024 * 1024;
const MAX_DATA_URI_UNITS: usize = 22 * 1024 * 1024;
const MAX_BROWSER_DATA_URI_BYTES: usize = 32 * 1024 * 1024;
const MAX_BROWSER_DOWNLOAD_BYTES: u64 = 256 * 1024 * 1024;
const MAX_BROWSER_REDIRECTS: usize = 5;
const MAX_SAFE_DOWNLOAD_STEM_CHARS: usize = 120;
const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Zenith-Converter/1.0";

const BLOCKED_BROWSER_EXTENSIONS: &[&str] = &[
    "exe", "dll", "bat", "cmd", "msi", "scr", "vbs", "ps1", "hta", "lnk",
];

const BROWSER_IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jpe", "jfif", "webp", "gif", "bmp", "dib", "ico", "cur", "tif",
    "tiff", "avif", "heic", "heif", "hif", "jxl", "svg", "svgz", "apng", "tga", "psd", "raw",
    "dng", "exr", "hdr", "dds", "qoi", "xcf", "jp2", "j2k",
];

const BROWSER_EXPLICIT_FILE_EXTENSIONS: &[&str] = &[
    // Images
    "png", "jpg", "jpeg", "jpe", "jfif", "webp", "gif", "bmp", "dib", "ico", "cur", "tif",
    "tiff", "avif", "heic", "heif", "hif", "jxl", "svg", "svgz", "apng", "tga", "psd", "raw",
    "dng", "exr", "hdr", "dds", "qoi", "xcf", "jp2", "j2k", // Documents & PDF
    "pdf", "doc", "docx", "docm", "dotx", "dot", "odt", "fodt", "rtf", "xls", "xlsx", "xlsm",
    "ods", "csv", "tsv", "ppt", "pptx", "pptm", "ppsx", "odp", "key", "hwp", "hwpx", "eml",
    "msg", // Text & Data (explicitly excludes html/htm/xhtml/php/asp/jsp)
    "txt", "log", "md", "markdown", "rst", "tex", "latex", "json", "jsonl", "ndjson", "yaml",
    "yml", "toml", "xml", "ini", "sql", // Ebooks
    "epub", "mobi", "azw3", "fb2", "djvu", "cbz", "cbr", // Video
    "mp4", "m4v", "mov", "mkv", "webm", "avi", "wmv", "flv", "ts", "m2ts", "3gp", "ogv",
    // Audio & Subtitles
    "mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "wma", "aiff", "aif", "alac",
    "amr", "mid", "midi", "srt", "vtt", "ass", "ssa", "sub", // Archives
    "zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "tbz2", "xz", "txz", "zst", "iso",
    // Vector / CAD / Fonts / 3D / Geo
    "eps", "ps", "ai", "emf", "wmf", "dxf", "dwg", "ttf", "otf", "woff", "woff2", "eot", "stl",
    "obj", "glb", "gltf", "fbx", "ply", "dae", "3ds", "geojson", "gpx", "kml", "kmz",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BrowserDragSource {
    ImageDataUri {
        mime: String,
        raw_uri: String,
        suggested_name: String,
    },
    RemoteImageUrl {
        url: String,
        suggested_name: String,
    },
    RemoteFileUrl {
        url: String,
        suggested_name: String,
    },
}

fn is_blocked_executable_ext(ext: &str) -> bool {
    let clean = ext
        .trim()
        .trim_start_matches('.')
        .trim_end_matches(['.', ' '])
        .to_ascii_lowercase();
    BLOCKED_BROWSER_EXTENSIONS.contains(&clean.as_str())
}

fn is_windows_reserved_device_name(name: &str) -> bool {
    let trimmed = name.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        return false;
    }
    let upper = trimmed.to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

pub fn sanitize_download_filename(raw_name: &str, fallback_ext: &str) -> String {
    let clean_fallback_ext: String = fallback_ext
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(16)
        .collect::<String>()
        .to_ascii_lowercase();

    let last_segment = raw_name
        .trim()
        .rsplit(['/', '\\'])
        .find(|s| !s.is_empty())
        .unwrap_or("");

    let mut sanitized: String = last_segment
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();

    while sanitized.contains("..") {
        sanitized = sanitized.replace("..", "_");
    }

    let trimmed = sanitized.trim_matches(|c: char| c.is_whitespace() || c == '.');

    let (raw_stem, chosen_ext) = if let Some(dot_idx) = trimmed.rfind('.') {
        let candidate_stem = &trimmed[..dot_idx];
        let candidate_ext = &trimmed[dot_idx + 1..];
        if !candidate_ext.is_empty()
            && candidate_ext.len() <= 16
            && candidate_ext.chars().all(|c| c.is_ascii_alphanumeric())
        {
            (candidate_stem, candidate_ext.to_ascii_lowercase())
        } else {
            (trimmed, clean_fallback_ext)
        }
    } else {
        (trimmed, clean_fallback_ext)
    };

    let mut stem = raw_stem
        .trim_matches(|c: char| c.is_whitespace() || c == '.')
        .to_string();
    if stem.is_empty() {
        stem = "download".to_string();
    }

    if stem.chars().count() > MAX_SAFE_DOWNLOAD_STEM_CHARS {
        stem = stem
            .chars()
            .take(MAX_SAFE_DOWNLOAD_STEM_CHARS)
            .collect::<String>()
            .trim_matches(|c: char| c.is_whitespace() || c == '.')
            .to_string();
        if stem.is_empty() {
            stem = "download".to_string();
        }
    }

    let first_dot_prefix = stem.split('.').next().unwrap_or(&stem);
    if is_windows_reserved_device_name(&stem) || is_windows_reserved_device_name(first_dot_prefix) {
        stem = format!("_{stem}");
        if stem.chars().count() > MAX_SAFE_DOWNLOAD_STEM_CHARS {
            stem = stem.chars().take(MAX_SAFE_DOWNLOAD_STEM_CHARS).collect();
        }
    }

    if chosen_ext.is_empty() {
        stem
    } else {
        format!("{stem}.{chosen_ext}")
    }
}

pub fn is_local_network_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            let [a, b, c, _d] = v4.octets();
            a == 0 // 0.0.0.0/8 ("this" network)
                || a == 10 // 10.0.0.0/8 (RFC 1918)
                || (a == 100 && (b & 0b1100_0000) == 64) // 100.64.0.0/10 (CGNAT)
                || a == 127 // 127.0.0.0/8 (loopback)
                || (a == 169 && b == 254) // 169.254.0.0/16 (link-local / cloud metadata)
                || (a == 172 && (16..=31).contains(&b)) // 172.16.0.0/12 (RFC 1918)
                || (a == 192 && b == 0 && c == 0) // 192.0.0.0/24 (IETF protocol assignments)
                || (a == 192 && b == 168) // 192.168.0.0/16 (RFC 1918)
                || (a == 198 && (b == 18 || b == 19)) // 198.18.0.0/15 (benchmarking)
                || a >= 224 // >= 224.0.0.0 (multicast, reserved, broadcast)
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_unspecified() || v6.is_loopback() || v6.is_multicast() {
                return true;
            }
            if let Some(mapped_v4) = v6.to_ipv4_mapped() {
                return is_local_network_ip(std::net::IpAddr::V4(mapped_v4));
            }
            let seg = v6.segments();
            // ULA fc00::/7
            if (seg[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            // Link-local fe80::/10
            if (seg[0] & 0xffc0) == 0xfe80 {
                return true;
            }
            // Deprecated site-local fec0::/10
            if (seg[0] & 0xffc0) == 0xfec0 {
                return true;
            }
            // IPv4-compatible ::/96
            if seg[0..6] == [0; 6] {
                let v4 = std::net::Ipv4Addr::new(
                    (seg[6] >> 8) as u8,
                    (seg[6] & 0xff) as u8,
                    (seg[7] >> 8) as u8,
                    (seg[7] & 0xff) as u8,
                );
                return is_local_network_ip(std::net::IpAddr::V4(v4));
            }
            // IPv4-translated ::ffff:0:0:0/96
            if seg[0..4] == [0; 4] && seg[4] == 0xffff && seg[5] == 0 {
                let v4 = std::net::Ipv4Addr::new(
                    (seg[6] >> 8) as u8,
                    (seg[6] & 0xff) as u8,
                    (seg[7] >> 8) as u8,
                    (seg[7] & 0xff) as u8,
                );
                return is_local_network_ip(std::net::IpAddr::V4(v4));
            }
            // NAT64 well-known prefix 64:ff9b::/96 -> inspect embedded IPv4
            if seg[0] == 0x0064 && seg[1] == 0xff9b && seg[2..6] == [0; 4] {
                let v4 = std::net::Ipv4Addr::new(
                    (seg[6] >> 8) as u8,
                    (seg[6] & 0xff) as u8,
                    (seg[7] >> 8) as u8,
                    (seg[7] & 0xff) as u8,
                );
                return is_local_network_ip(std::net::IpAddr::V4(v4));
            }
            // NAT64 local-use prefix 64:ff9b:1::/48
            if seg[0] == 0x0064 && seg[1] == 0xff9b && seg[2] == 0x0001 {
                return true;
            }
            // 6to4 2002::/16 -> inspect embedded IPv4
            if seg[0] == 0x2002 {
                let v4 = std::net::Ipv4Addr::new(
                    (seg[1] >> 8) as u8,
                    (seg[1] & 0xff) as u8,
                    (seg[2] >> 8) as u8,
                    (seg[2] & 0xff) as u8,
                );
                return is_local_network_ip(std::net::IpAddr::V4(v4));
            }
            // Teredo 2001:0000::/32 -> inspect server and inverted client IPv4
            if seg[0] == 0x2001 && seg[1] == 0 {
                let server_v4 = std::net::Ipv4Addr::new(
                    (seg[2] >> 8) as u8,
                    (seg[2] & 0xff) as u8,
                    (seg[3] >> 8) as u8,
                    (seg[3] & 0xff) as u8,
                );
                let client_v4 = std::net::Ipv4Addr::new(
                    (!seg[6] >> 8) as u8,
                    (!seg[6] & 0xff) as u8,
                    (!seg[7] >> 8) as u8,
                    (!seg[7] & 0xff) as u8,
                );
                return is_local_network_ip(std::net::IpAddr::V4(server_v4))
                    || is_local_network_ip(std::net::IpAddr::V4(client_v4));
            }
            false
        }
    }
}

pub fn is_local_hostname(host: &str) -> bool {
    let trimmed = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if trimmed.is_empty() || trimmed.contains('%') {
        return true;
    }
    if let Ok(ip) = trimmed.parse::<std::net::IpAddr>() {
        return is_local_network_ip(ip);
    }
    if matches!(
        trimmed.as_str(),
        "localhost" | "local" | "home.arpa" | "internal" | "localdomain" | "lan" | "intranet"
    ) || trimmed.ends_with(".localhost")
        || trimmed.ends_with(".local")
        || trimmed.ends_with(".home.arpa")
        || trimmed.ends_with(".internal")
        || trimmed.ends_with(".localdomain")
        || trimmed.ends_with(".lan")
        || trimmed.ends_with(".intranet")
    {
        return true;
    }
    if !trimmed.contains('.') {
        return true;
    }
    if let Some(last_label) = trimmed.rsplit('.').next() {
        if last_label.chars().all(|c| c.is_ascii_digit()) || last_label.starts_with("0x") {
            return true;
        }
    }
    false
}

fn percent_decode_lossy(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h1 = (bytes[i + 1] as char).to_digit(16);
            let h2 = (bytes[i + 2] as char).to_digit(16);
            if let (Some(a), Some(b)) = (h1, h2) {
                out.push(((a << 4) | b) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn extract_extension_from_name(name: &str) -> Option<String> {
    let cleaned = name.trim().trim_end_matches(['.', ' ']);
    let dot = cleaned.rfind('.')?;
    let ext = &cleaned[dot + 1..];
    if !ext.is_empty() && ext.len() <= 16 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        Some(ext.to_ascii_lowercase())
    } else {
        None
    }
}

fn extract_url_filename_and_ext(url: &tauri::Url) -> (Option<String>, Option<String>) {
    let raw_seg = url
        .path_segments()
        .and_then(|mut segs| segs.rfind(|s| !s.is_empty()))
        .map(percent_decode_lossy)
        .filter(|s| !s.trim().is_empty());
    let ext = raw_seg
        .as_deref()
        .and_then(extract_extension_from_name);
    (raw_seg, ext)
}

fn has_blocked_executable_in_url(url: &tauri::Url) -> bool {
    let (_, ext) = extract_url_filename_and_ext(url);
    if ext.as_deref().is_some_and(is_blocked_executable_ext) {
        return true;
    }
    for (k, v) in url.query_pairs() {
        let key_lower = k.to_ascii_lowercase();
        if matches!(
            key_lower.as_str(),
            "filename" | "file" | "download" | "name" | "attachment"
        ) && extract_extension_from_name(&v)
            .as_deref()
            .is_some_and(is_blocked_executable_ext)
        {
            return true;
        }
    }
    false
}

fn mime_to_extension(mime: &str) -> Option<&'static str> {
    let essence = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match essence.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" | "image/pjpeg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/bmp" | "image/x-ms-bmp" => Some("bmp"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        "image/tiff" => Some("tiff"),
        "image/avif" => Some("avif"),
        "image/heic" => Some("heic"),
        "image/heif" => Some("heif"),
        "image/jxl" => Some("jxl"),
        "image/svg+xml" => Some("svg"),
        "application/pdf" => Some("pdf"),
        "application/msword" => Some("doc"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
        "application/vnd.ms-excel" => Some("xls"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
        "application/vnd.ms-powerpoint" => Some("ppt"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
        "text/plain" => Some("txt"),
        "text/markdown" => Some("md"),
        "text/csv" => Some("csv"),
        "application/json" => Some("json"),
        "application/xml" | "text/xml" => Some("xml"),
        "application/epub+zip" => Some("epub"),
        "video/mp4" => Some("mp4"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        "video/x-matroska" => Some("mkv"),
        "video/x-msvideo" => Some("avi"),
        "audio/mpeg" | "audio/mp3" => Some("mp3"),
        "audio/wav" | "audio/x-wav" | "audio/wave" => Some("wav"),
        "audio/flac" => Some("flac"),
        "audio/ogg" => Some("ogg"),
        "audio/mp4" => Some("m4a"),
        "application/zip" | "application/x-zip-compressed" => Some("zip"),
        "application/x-7z-compressed" => Some("7z"),
        "application/x-tar" => Some("tar"),
        "application/gzip" | "application/x-gzip" => Some("gz"),
        _ => None,
    }
}

fn is_blocked_executable_mime(mime: &str) -> bool {
    let essence = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    matches!(
        essence.as_str(),
        "application/x-msdownload"
            | "application/x-msdos-program"
            | "application/x-dosexec"
            | "application/x-msi"
            | "application/vnd.microsoft.portable-executable"
            | "application/x-bat"
            | "application/x-powershell"
            | "application/x-ms-shortcut"
            | "text/vbscript"
    )
}

fn is_html_mime(mime: &str) -> bool {
    let essence = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    matches!(essence.as_str(), "text/html" | "application/xhtml+xml")
}

fn is_executable_magic_bytes(bytes: &[u8]) -> bool {
    bytes.starts_with(b"MZ") || bytes.starts_with(b"\x7fELF")
}

fn infer_extension_from_magic_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some("ico");
    }
    if bytes.starts_with(b"II*\x00") || bytes.starts_with(b"MM\x00*") {
        return Some("tiff");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        let brand = &bytes[8..12];
        if brand == b"avif" || brand == b"avis" {
            return Some("avif");
        }
        if matches!(brand, b"heic" | b"heix" | b"hevc" | b"mif1" | b"msf1") {
            return Some("heic");
        }
        if matches!(brand, b"M4A " | b"M4B ") {
            return Some("m4a");
        }
        if brand == b"qt  " {
            return Some("mov");
        }
        if matches!(brand, b"isom" | b"iso2" | b"mp41" | b"mp42" | b"M4V ") {
            return Some("mp4");
        }
    }
    if bytes.starts_with(b"%PDF-") {
        return Some("pdf");
    }
    if bytes.starts_with(b"PK\x03\x04") {
        return Some("zip");
    }
    if bytes.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        return Some("7z");
    }
    if bytes.starts_with(&[0x52, 0x61, 0x72, 0x21, 0x1A, 0x07]) {
        return Some("rar");
    }
    if bytes.starts_with(&[0x1F, 0x8B, 0x08]) {
        return Some("gz");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return Some("wav");
    }
    if bytes.starts_with(b"fLaC") {
        return Some("flac");
    }
    if bytes.starts_with(b"OggS") {
        return Some("ogg");
    }
    if bytes.starts_with(b"ID3")
        || (bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0)
    {
        return Some("mp3");
    }
    if bytes.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        return Some("mkv");
    }
    let trimmed_text = String::from_utf8_lossy(bytes);
    let trimmed_start = trimmed_text.trim_start();
    if trimmed_start.starts_with("<svg") || trimmed_start.starts_with("<?xml") && trimmed_start.contains("<svg") {
        return Some("svg");
    }
    None
}

fn parse_data_image_uri(raw: &str) -> Option<(String, Vec<u8>, &'static str)> {
    use base64::Engine;

    let trimmed = raw.trim();
    if trimmed.len() < "data:image/".len()
        || !trimmed[..5].eq_ignore_ascii_case("data:")
    {
        return None;
    }
    let rest = &trimmed[5..];
    let comma = rest.find(',')?;
    let meta = &rest[..comma];
    let payload = &rest[comma + 1..];

    let mut parts = meta.split(';');
    let mime = parts.next()?.trim().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return None;
    }
    let ext = mime_to_extension(&mime)?;
    let is_base64 = parts.any(|p| p.trim().eq_ignore_ascii_case("base64"));
    if !is_base64 {
        return None;
    }

    // Cap raw base64 characters generously to cover 32 MiB binary before decoding.
    let max_b64_len = (MAX_BROWSER_DATA_URI_BYTES / 3 + 2) * 4 + 4096;
    if payload.len() > max_b64_len {
        return None;
    }
    let compact: String = payload.chars().filter(|c| !c.is_ascii_whitespace()).collect();
    if compact.is_empty() {
        return None;
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(compact.as_bytes())
        .ok()
        .or_else(|| base64::engine::general_purpose::URL_SAFE.decode(compact.as_bytes()).ok())?;

    if decoded.is_empty() || decoded.len() > MAX_BROWSER_DATA_URI_BYTES {
        return None;
    }
    if is_executable_magic_bytes(&decoded) {
        return None;
    }
    Some((mime, decoded, ext))
}

fn parse_data_image_header(raw: &str) -> Option<(String, &'static str)> {
    let trimmed = raw.trim();
    if trimmed.len() < "data:image/".len() || !trimmed[..5].eq_ignore_ascii_case("data:") {
        return None;
    }
    let rest = &trimmed[5..];
    let comma = rest.find(',')?;
    let meta = &rest[..comma];
    let payload = &rest[comma + 1..];
    if payload.trim().is_empty() {
        return None;
    }
    let mut parts = meta.split(';');
    let mime = parts.next()?.trim().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return None;
    }
    let ext = mime_to_extension(&mime)?;
    let is_base64 = parts.any(|p| p.trim().eq_ignore_ascii_case("base64"));
    if !is_base64 {
        return None;
    }
    Some((mime, ext))
}

fn html_unescape(raw: &str) -> String {
    if !raw.contains('&') {
        return raw.to_string();
    }
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp..];
        if let Some(semi) = after[..after.len().min(12)].find(';') {
            let entity = &after[1..semi];
            let replacement = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                    u32::from_str_radix(&entity[2..], 16)
                        .ok()
                        .and_then(char::from_u32)
                }
                _ if entity.starts_with('#') => entity[1..]
                    .parse::<u32>()
                    .ok()
                    .and_then(char::from_u32),
                _ => None,
            };
            if let Some(ch) = replacement {
                out.push(ch);
                rest = &after[semi + 1..];
                continue;
            }
        }
        out.push('&');
        rest = &rest[amp + 1..];
    }
    out.push_str(rest);
    out
}

fn extract_cf_html_fragment_and_source(raw: &str) -> (&str, Option<String>) {
    let mut start_frag: Option<usize> = None;
    let mut end_frag: Option<usize> = None;
    let mut source_url: Option<String> = None;
    let mut header_end_offset: usize = 0;

    let mut pos = 0usize;
    for line in raw.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            pos += line.len();
            header_end_offset = pos;
            break;
        }
        if trimmed.starts_with('<') {
            break;
        }
        if let Some((key, val)) = trimmed.split_once(':') {
            let k = key.trim();
            let v = val.trim();
            if k.eq_ignore_ascii_case("StartFragment") {
                start_frag = v.parse::<usize>().ok();
            } else if k.eq_ignore_ascii_case("EndFragment") {
                end_frag = v.parse::<usize>().ok();
            } else if k.eq_ignore_ascii_case("SourceURL") && !v.is_empty() {
                source_url = Some(v.to_string());
            } else if !k.eq_ignore_ascii_case("Version")
                && !k.eq_ignore_ascii_case("StartHTML")
                && !k.eq_ignore_ascii_case("EndHTML")
                && !k.eq_ignore_ascii_case("StartSelection")
                && !k.eq_ignore_ascii_case("EndSelection")
            {
                break;
            }
            pos += line.len();
            header_end_offset = pos;
        } else {
            break;
        }
    }

    let body = &raw[header_end_offset..];
    if let Some(s_marker) = body.find("<!--StartFragment-->") {
        let after_start = s_marker + "<!--StartFragment-->".len();
        if let Some(e_rel) = body[after_start..].find("<!--EndFragment-->") {
            return (&body[after_start..after_start + e_rel], source_url);
        }
    }

    if let (Some(s), Some(e)) = (start_frag, end_frag) {
        if s < e && e <= raw.len() && raw.is_char_boundary(s) && raw.is_char_boundary(e) {
            return (&raw[s..e], source_url);
        }
    }

    (body, source_url)
}

fn is_multi_paragraph_prose(fragment: &str) -> bool {
    let lower = fragment.to_ascii_lowercase();
    let p_count = lower
        .match_indices("<p")
        .filter(|(idx, _)| {
            lower.as_bytes()
                .get(idx + 2)
                .is_some_and(|b| matches!(b, b'>' | b' ' | b'\t' | b'\r' | b'\n'))
        })
        .count();
    if p_count >= 2 {
        return true;
    }

    let mut visible_chars = 0usize;
    let mut non_empty_lines = 0usize;
    let mut current_line_has_text = false;
    let mut i = 0usize;
    let bytes = fragment.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let tag_start = i + 1;
            let Some(rel_end) = fragment[tag_start..].find('>') else {
                break;
            };
            let tag_inner = fragment[tag_start..tag_start + rel_end].trim().to_ascii_lowercase();
            let tag_name = tag_inner
                .trim_start_matches('/')
                .split(|c: char| c.is_whitespace() || c == '/')
                .next()
                .unwrap_or("");
            if matches!(
                tag_name,
                "p" | "div" | "li" | "br" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote" | "tr"
            ) && current_line_has_text
            {
                non_empty_lines += 1;
                current_line_has_text = false;
            }
            i = tag_start + rel_end + 1;
        } else {
            let ch = fragment[i..].chars().next().unwrap_or(' ');
            if ch == '\n' {
                if current_line_has_text {
                    non_empty_lines += 1;
                    current_line_has_text = false;
                }
            } else if !ch.is_whitespace() {
                current_line_has_text = true;
                visible_chars += 1;
            }
            i += ch.len_utf8();
        }
    }
    if current_line_has_text {
        non_empty_lines += 1;
    }

    non_empty_lines >= 2 || visible_chars > 120
}

fn parse_html_img_src(tag_body: &str) -> Option<String> {
    let bytes = tag_body.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let name_start = i;
        while i < bytes.len()
            && !bytes[i].is_ascii_whitespace()
            && bytes[i] != b'='
            && bytes[i] != b'>'
            && bytes[i] != b'/'
        {
            i += 1;
        }
        let attr_name = tag_body[name_start..i].trim();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let attr_val = if i < bytes.len() && bytes[i] == b'=' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i >= bytes.len() {
                ""
            } else if bytes[i] == b'"' || bytes[i] == b'\'' {
                let quote = bytes[i];
                i += 1;
                let val_start = i;
                while i < bytes.len() && bytes[i] != quote {
                    i += 1;
                }
                let v = &tag_body[val_start..i];
                if i < bytes.len() && bytes[i] == quote {
                    i += 1;
                }
                v
            } else {
                let val_start = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                    i += 1;
                }
                &tag_body[val_start..i]
            }
        } else {
            ""
        };
        if attr_name.eq_ignore_ascii_case("src") {
            let unescaped = html_unescape(attr_val).trim().to_string();
            if !unescaped.is_empty() {
                return Some(unescaped);
            }
        }
    }
    None
}

fn extract_single_img_src_from_html(fragment: &str) -> Option<String> {
    let lower = fragment.to_ascii_lowercase();
    let mut img_tags = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find("<img") {
        let idx = search_from + rel;
        let next_byte = lower.as_bytes().get(idx + 4).copied();
        if next_byte.is_some_and(|b| b.is_ascii_whitespace() || b == b'>' || b == b'/') {
            if let Some(end_rel) = fragment[idx + 4..].find('>') {
                img_tags.push(&fragment[idx + 4..idx + 4 + end_rel]);
                search_from = idx + 4 + end_rel + 1;
                continue;
            }
        }
        search_from = idx + 4;
    }

    if img_tags.len() != 1 {
        return None;
    }
    parse_html_img_src(img_tags[0])
}

fn resolve_img_src_url(raw_src: &str, source_url: Option<&str>) -> Option<String> {
    let trimmed = raw_src.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("data:") {
        return lower.starts_with("data:image/").then(|| trimmed.to_string());
    }
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    if lower.starts_with("javascript:")
        || lower.starts_with("vbscript:")
        || lower.starts_with("file:")
        || lower.starts_with("blob:")
        || lower.starts_with("ftp:")
        || lower.starts_with("about:")
        || lower.starts_with("chrome:")
        || lower.starts_with("edge:")
    {
        return None;
    }
    if let Some(base_raw) = source_url {
        if let Ok(base) = tauri::Url::parse(base_raw) {
            if matches!(base.scheme(), "http" | "https") {
                if let Ok(joined) = base.join(trimmed) {
                    if matches!(joined.scheme(), "http" | "https") {
                        return Some(joined.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_first_url_candidate(raw: &str) -> Option<&str> {
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        return Some(trimmed);
    }
    None
}

fn is_unsafe_browser_scheme(candidate: &str) -> bool {
    let lower = candidate.trim().to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return false;
    }
    if lower.starts_with("data:") {
        return !lower.starts_with("data:image/");
    }
    lower.starts_with("javascript:")
        || lower.starts_with("vbscript:")
        || lower.starts_with("file:")
        || lower.starts_with("blob:")
        || lower.starts_with("ftp:")
        || lower.starts_with("about:")
        || lower.starts_with("chrome:")
        || lower.starts_with("edge:")
        || lower.starts_with("ms-")
}

fn suggest_name_for_http_url(url: &tauri::Url, fallback_ext: &str) -> String {
    let (raw_seg, _) = extract_url_filename_and_ext(url);
    sanitize_download_filename(raw_seg.as_deref().unwrap_or("download"), fallback_ext)
}

pub fn parse_browser_drop_payload(
    cf_html: Option<&str>,
    url_text: Option<&str>,
) -> Option<BrowserDragSource> {
    if let Some(candidate) = url_text.and_then(extract_first_url_candidate) {
        if is_unsafe_browser_scheme(candidate) {
            return None;
        }

        if candidate.len() >= 11
            && candidate[..5].eq_ignore_ascii_case("data:")
            && !candidate.chars().any(char::is_whitespace)
        {
            if let Some((mime, ext)) = parse_data_image_header(candidate) {
                return Some(BrowserDragSource::ImageDataUri {
                    mime,
                    raw_uri: candidate.to_string(),
                    suggested_name: sanitize_download_filename("image", ext),
                });
            }
            return None;
        }

        if !candidate.chars().any(char::is_whitespace) {
            if let Ok(parsed) = tauri::Url::parse(candidate) {
                if matches!(parsed.scheme(), "http" | "https") && parsed.host_str().is_some() {
                    if has_blocked_executable_in_url(&parsed) {
                        return None;
                    }
                    let (_, ext_opt) = extract_url_filename_and_ext(&parsed);
                    if let Some(ext) = ext_opt {
                        if BROWSER_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                            return Some(BrowserDragSource::RemoteImageUrl {
                                suggested_name: suggest_name_for_http_url(&parsed, &ext),
                                url: candidate.to_string(),
                            });
                        }
                        if BROWSER_EXPLICIT_FILE_EXTENSIONS.contains(&ext.as_str()) {
                            return Some(BrowserDragSource::RemoteFileUrl {
                                suggested_name: suggest_name_for_http_url(&parsed, &ext),
                                url: candidate.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    let html_raw = cf_html?;
    let (fragment, source_url) = extract_cf_html_fragment_and_source(html_raw);
    if is_multi_paragraph_prose(fragment) {
        return None;
    }
    let raw_src = extract_single_img_src_from_html(fragment)?;
    let resolved_src = resolve_img_src_url(&raw_src, source_url.as_deref())?;

    if resolved_src.len() >= 11 && resolved_src[..5].eq_ignore_ascii_case("data:") {
        let (mime, ext) = parse_data_image_header(&resolved_src)?;
        return Some(BrowserDragSource::ImageDataUri {
            mime,
            raw_uri: resolved_src,
            suggested_name: sanitize_download_filename("image", ext),
        });
    }

    let parsed = tauri::Url::parse(&resolved_src).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return None;
    }
    if has_blocked_executable_in_url(&parsed) {
        return None;
    }
    let (_, ext_opt) = extract_url_filename_and_ext(&parsed);
    let fallback_ext = ext_opt.as_deref().unwrap_or("png");
    Some(BrowserDragSource::RemoteImageUrl {
        suggested_name: suggest_name_for_http_url(&parsed, fallback_ext),
        url: resolved_src,
    })
}

fn parse_content_disposition_filename(header_val: &str) -> Option<String> {
    let mut fallback_filename: Option<String> = None;
    for part in header_val.split(';') {
        let trimmed = part.trim();
        if let Some((k, v)) = trimmed.split_once('=') {
            let key = k.trim();
            if key.eq_ignore_ascii_case("filename*") {
                let raw_val = v.trim().trim_matches('"');
                let encoded = raw_val
                    .split_once("''")
                    .map(|(_, right)| right)
                    .unwrap_or(raw_val);
                let decoded = percent_decode_lossy(encoded);
                let clean = decoded.trim();
                if !clean.is_empty() {
                    return Some(clean.to_string());
                }
            } else if key.eq_ignore_ascii_case("filename") {
                let raw_val = v.trim().trim_matches('"');
                let decoded = percent_decode_lossy(raw_val);
                let clean = decoded.trim();
                if !clean.is_empty() {
                    fallback_filename = Some(clean.to_string());
                }
            }
        }
    }
    fallback_filename
}

fn unique_download_path(downloads_dir: &Path, filename: &str) -> PathBuf {
    let candidate = downloads_dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let path_ref = Path::new(filename);
    let stem = path_ref
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("download");
    let ext = path_ref.extension().and_then(|s| s.to_str()).unwrap_or("");
    for idx in 1..=9999u32 {
        let next_name = if ext.is_empty() {
            format!("{stem}_{idx}")
        } else {
            format!("{stem}_{idx}.{ext}")
        };
        let p = downloads_dir.join(next_name);
        if !p.exists() {
            return p;
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    if ext.is_empty() {
        downloads_dir.join(format!("{stem}_{nanos}"))
    } else {
        downloads_dir.join(format!("{stem}_{nanos}.{ext}"))
    }
}

async fn validate_and_resolve_remote_url(
    raw_url: &str,
) -> Result<(tauri::Url, String, Vec<std::net::SocketAddr>), String> {
    let url = tauri::Url::parse(raw_url)
        .map_err(|e| format!("INVALID_URL: Invalid remote URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("INVALID_URL: Only HTTP and HTTPS URLs are allowed".to_string());
    }
    let host = url
        .host_str()
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "INVALID_URL: Remote URL has no hostname".to_string())?
        .to_string();

    if is_local_hostname(&host) {
        return Err("UNSAFE_URL: Local or private network hostnames are blocked".to_string());
    }
    if has_blocked_executable_in_url(&url) {
        return Err(
            "BLOCKED_FILE_TYPE: Executable files from browsers cannot be converted".to_string(),
        );
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| "INVALID_URL: Remote URL has no valid port".to_string())?;

    let bare_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare_host.parse::<std::net::IpAddr>() {
        if is_local_network_ip(ip) {
            return Err("UNSAFE_URL: Local or private network IPs are blocked".to_string());
        }
        return Ok((url, host, vec![std::net::SocketAddr::new(ip, port)]));
    }

    let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((bare_host, port))
        .await
        .map_err(|e| format!("NETWORK_ERROR: Failed to resolve host {bare_host}: {e}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("NETWORK_ERROR: Host {bare_host} resolved to no addresses"));
    }
    for addr in &addrs {
        if is_local_network_ip(addr.ip()) {
            return Err(
                "UNSAFE_URL: Remote host resolves to a blocked local or private IP".to_string(),
            );
        }
    }
    Ok((url, host, addrs))
}

#[tauri::command]
pub async fn converter_fetch_browser_asset(
    app: AppHandle,
    url: String,
) -> Result<String, String> {
    if !get_converter_drag_config().browser_drag {
        return Err(
            "BROWSER_DRAG_DISABLED: Browser drag-to-convert is disabled in settings".to_string(),
        );
    }

    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("INVALID_URL: Empty browser asset URL".to_string());
    }

    let paths = resolve_converter_paths(&app)?;
    std::fs::create_dir_all(&paths.downloads_dir)
        .map_err(|e| format!("Failed to prepare converter downloads folder: {e}"))?;

    if trimmed.len() >= 5 && trimmed[..5].eq_ignore_ascii_case("data:") {
        let (_mime, bytes, ext) = parse_data_image_uri(trimmed).ok_or_else(|| {
            "INVALID_URL: Only valid base64 data:image/* URIs up to 32 MiB are supported"
                .to_string()
        })?;
        let final_ext = infer_extension_from_magic_bytes(&bytes).unwrap_or(ext);
        if is_blocked_executable_ext(final_ext) {
            return Err("BLOCKED_FILE_TYPE: Blocked executable payload".to_string());
        }
        let filename = sanitize_download_filename("browser_image", final_ext);
        let dest_path = unique_download_path(&paths.downloads_dir, &filename);
        let dest_clone = dest_path.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut f = std::fs::File::create(&dest_clone)
                .map_err(|e| format!("Disk write error creating {}: {e}", dest_clone.display()))?;
            f.write_all(&bytes)
                .map_err(|e| format!("Disk write error saving {}: {e}", dest_clone.display()))?;
            f.flush()
                .map_err(|e| format!("Disk flush error saving {}: {e}", dest_clone.display()))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Failed to save data URI image: {e}"))??;
        return Ok(dest_path.to_string_lossy().to_string());
    }

    let mut current_url = trimmed.to_string();
    let mut final_url: Option<tauri::Url> = None;
    let mut final_resp: Option<reqwest::Response> = None;

    for hop in 0..=MAX_BROWSER_REDIRECTS {
        let (parsed_url, host, resolved_addrs) = validate_and_resolve_remote_url(&current_url).await?;
        let mut builder = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(30))
            .user_agent(BROWSER_USER_AGENT);
        let bare_host = host.trim_start_matches('[').trim_end_matches(']');
        if bare_host.parse::<std::net::IpAddr>().is_err() {
            builder = builder.resolve_to_addrs(bare_host, &resolved_addrs);
        }
        let client = builder
            .build()
            .map_err(|e| format!("NETWORK_ERROR: HTTP client initialization failed: {e}"))?;

        let resp = client
            .get(parsed_url.as_str())
            .send()
            .await
            .map_err(|e| format!("NETWORK_ERROR: Failed to fetch remote asset: {e}"))?;

        if resp.status().is_redirection() {
            if hop >= MAX_BROWSER_REDIRECTS {
                return Err("TOO_MANY_REDIRECTS: Remote URL exceeded maximum redirects".to_string());
            }
            let location = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| "DOWNLOAD_FAILED: Redirect response missing Location header".to_string())?;
            let next_url = parsed_url
                .join(location.trim())
                .map_err(|e| format!("INVALID_URL: Invalid redirect location: {e}"))?;
            current_url = next_url.to_string();
            continue;
        }

        if !resp.status().is_success() {
            return Err(format!(
                "DOWNLOAD_FAILED: Remote server returned HTTP {}",
                resp.status()
            ));
        }

        final_url = Some(parsed_url);
        final_resp = Some(resp);
        break;
    }

    let parsed_url = final_url
        .ok_or_else(|| "DOWNLOAD_FAILED: Failed to resolve remote asset".to_string())?;
    let resp = final_resp
        .ok_or_else(|| "DOWNLOAD_FAILED: Failed to fetch remote asset".to_string())?;

    if let Some(len) = resp.content_length() {
        if len > MAX_BROWSER_DOWNLOAD_BYTES {
            return Err("FILE_TOO_LARGE: Remote browser asset exceeds the 256 MB limit".to_string());
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    if let Some(ref ct) = content_type {
        if is_blocked_executable_mime(ct) {
            return Err(
                "BLOCKED_FILE_TYPE: Executable files from browsers cannot be converted"
                    .to_string(),
            );
        }
        if is_html_mime(ct) {
            return Err(
                "UNEXPECTED_HTML_RESPONSE: Link returned an HTML web page instead of a downloadable asset"
                    .to_string(),
            );
        }
    }

    let disposition_name = resp
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .and_then(parse_content_disposition_filename);
    if let Some(ref cd_name) = disposition_name {
        if extract_extension_from_name(cd_name)
            .as_deref()
            .is_some_and(is_blocked_executable_ext)
        {
            return Err(
                "BLOCKED_FILE_TYPE: Executable files from browsers cannot be converted"
                    .to_string(),
            );
        }
    }

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let part_path = paths
        .downloads_dir
        .join(format!("browser_dl_{}_{}.part", std::process::id(), nanos));

    let mut magic_head: Vec<u8> = Vec::with_capacity(64);
    let mut total_bytes: u64 = 0;

    {
        let mut out_file = std::fs::File::create(&part_path)
            .map_err(|e| format!("Failed to create temporary download file: {e}"))?;
        let mut stream = resp.bytes_stream();

        while let Some(chunk_res) = stream.next().await {
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    drop(out_file);
                    let _ = std::fs::remove_file(&part_path);
                    return Err(format!("NETWORK_ERROR: Stream interrupted: {e}"));
                }
            };
            total_bytes = total_bytes.saturating_add(chunk.len() as u64);
            if total_bytes > MAX_BROWSER_DOWNLOAD_BYTES {
                drop(out_file);
                let _ = std::fs::remove_file(&part_path);
                return Err(
                    "FILE_TOO_LARGE: Remote browser asset exceeds the 256 MB limit".to_string(),
                );
            }
            if magic_head.len() < 64 {
                let take = (64 - magic_head.len()).min(chunk.len());
                magic_head.extend_from_slice(&chunk[..take]);
            }
            if total_bytes == chunk.len() as u64 && is_executable_magic_bytes(&magic_head) {
                drop(out_file);
                let _ = std::fs::remove_file(&part_path);
                return Err(
                    "BLOCKED_FILE_TYPE: Executable binary payload cannot be converted".to_string(),
                );
            }
            if let Err(e) = out_file.write_all(&chunk) {
                drop(out_file);
                let _ = std::fs::remove_file(&part_path);
                return Err(format!("Disk write error saving browser asset: {e}"));
            }
        }
        if let Err(e) = out_file.flush() {
            drop(out_file);
            let _ = std::fs::remove_file(&part_path);
            return Err(format!("Disk flush error saving browser asset: {e}"));
        }
    }

    if total_bytes == 0 {
        let _ = std::fs::remove_file(&part_path);
        return Err("DOWNLOAD_FAILED: Remote browser asset was empty".to_string());
    }
    if is_executable_magic_bytes(&magic_head) {
        let _ = std::fs::remove_file(&part_path);
        return Err(
            "BLOCKED_FILE_TYPE: Executable binary payload cannot be converted".to_string(),
        );
    }

    let (url_name, url_ext) = extract_url_filename_and_ext(&parsed_url);
    let cd_ext = disposition_name
        .as_deref()
        .and_then(extract_extension_from_name);
    let inferred_ext = cd_ext
        .clone()
        .or(url_ext.clone())
        .or_else(|| content_type.as_deref().and_then(mime_to_extension).map(str::to_string))
        .or_else(|| infer_extension_from_magic_bytes(&magic_head).map(str::to_string))
        .unwrap_or_else(|| "bin".to_string());

    if is_blocked_executable_ext(&inferred_ext) {
        let _ = std::fs::remove_file(&part_path);
        return Err(
            "BLOCKED_FILE_TYPE: Executable files from browsers cannot be converted".to_string(),
        );
    }

    let raw_name = disposition_name
        .as_deref()
        .or(url_name.as_deref())
        .unwrap_or("browser_asset");
    let final_filename = sanitize_download_filename(raw_name, &inferred_ext);
    if extract_extension_from_name(&final_filename)
        .as_deref()
        .is_some_and(is_blocked_executable_ext)
    {
        let _ = std::fs::remove_file(&part_path);
        return Err(
            "BLOCKED_FILE_TYPE: Executable files from browsers cannot be converted".to_string(),
        );
    }

    let dest_path = unique_download_path(&paths.downloads_dir, &final_filename);
    if let Err(e) = std::fs::rename(&part_path, &dest_path) {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!("Failed to finalize downloaded browser asset: {e}"));
    }

    Ok(dest_path.to_string_lossy().to_string())
}

struct ConverterTargetStore(
    #[allow(dead_code)] Vec<isize>,
    #[allow(dead_code)] Vec<windows::Win32::System::Ole::IDropTarget>,
);
unsafe impl Send for ConverterTargetStore {}

static CONVERTER_DROP_TARGETS: Mutex<Option<ConverterTargetStore>> = Mutex::new(None);
static CF_INETURL_W: OnceLock<u16> = OnceLock::new();
static CF_INETURL_A: OnceLock<u16> = OnceLock::new();
static CF_HTML_FORMAT: OnceLock<u16> = OnceLock::new();
static CF_FILEDESCRIPTOR_W: OnceLock<u16> = OnceLock::new();
static CF_FILECONTENTS_FORMAT: OnceLock<u16> = OnceLock::new();
static CF_TEXT_URI_LIST: OnceLock<u16> = OnceLock::new();

fn cf_ineturl_w() -> u16 {
    *CF_INETURL_W.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "UniformResourceLocatorW"
        )) as u16
    })
}

fn cf_ineturl_a() -> u16 {
    *CF_INETURL_A.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "UniformResourceLocator"
        )) as u16
    })
}

fn cf_html_format() -> u16 {
    *CF_HTML_FORMAT.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "HTML Format"
        )) as u16
    })
}

fn cf_filedescriptor_w() -> u16 {
    *CF_FILEDESCRIPTOR_W.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "FileGroupDescriptorW"
        )) as u16
    })
}

fn cf_filecontents_format() -> u16 {
    *CF_FILECONTENTS_FORMAT.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "FileContents"
        )) as u16
    })
}

fn cf_text_uri_list() -> u16 {
    *CF_TEXT_URI_LIST.get_or_init(|| unsafe {
        windows::Win32::System::DataExchange::RegisterClipboardFormatW(windows::core::w!(
            "text/uri-list"
        )) as u16
    })
}

struct VirtualFileDescriptor {
    index: usize,
    raw_name: String,
    expected_size: Option<u64>,
}

struct ConverterDragPayload {
    paths: Vec<String>,
    virtual_names: Vec<String>,
    urls: Vec<String>,
    is_browser_drag: bool,
}

#[windows::core::implement(windows::Win32::System::Ole::IDropTarget)]
struct ConverterDropTarget {
    app: AppHandle,
    enter_valid: UnsafeCell<bool>,
    cursor_effect: UnsafeCell<windows::Win32::System::Ole::DROPEFFECT>,
    last_css_pos: UnsafeCell<Option<(i32, i32)>>,
    cached_payload: UnsafeCell<Option<ConverterDragPayload>>,
}

impl ConverterDropTarget {
    unsafe fn extract_files(data: &windows::Win32::System::Com::IDataObject) -> Vec<String> {
        use windows::Win32::System::Com::{DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
        use windows::Win32::System::Ole::{ReleaseStgMedium, CF_HDROP};
        use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let Ok(mut medium) = data.GetData(&format) else {
            return Vec::new();
        };
        if medium.tymed != TYMED_HGLOBAL.0 as u32 {
            ReleaseStgMedium(&mut medium);
            return Vec::new();
        }
        let hdrop = HDROP(medium.u.hGlobal.0 as _);
        if hdrop.0.is_null() {
            ReleaseStgMedium(&mut medium);
            return Vec::new();
        }
        let count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
        if count == 0 || count == u32::MAX {
            ReleaseStgMedium(&mut medium);
            return Vec::new();
        }
        const MAX_DROP_FILES: usize = 4096;
        const MAX_PATH_UNITS: usize = 32768;
        let capped_count = (count as usize).min(MAX_DROP_FILES);
        let mut paths = Vec::with_capacity(capped_count);
        for i in 0..capped_count as u32 {
            let expected = DragQueryFileW(hdrop, i, None);
            if expected == 0 || expected == u32::MAX {
                continue;
            }
            let buf_chars = (expected as usize).min(MAX_PATH_UNITS);
            let mut buf = vec![0u16; buf_chars + 1];
            let copied = (DragQueryFileW(hdrop, i, Some(&mut buf)) as usize).min(buf.len());
            if copied > 0 {
                let path = String::from_utf16_lossy(&buf[..copied]);
                if !path.trim().is_empty() {
                    paths.push(path);
                }
            }
        }
        ReleaseStgMedium(&mut medium);
        paths
    }

    unsafe fn read_hglobal_bytes(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
        max_bytes: usize,
    ) -> Option<Vec<u8>> {
        use windows::Win32::System::Com::{DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
        use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
        use windows::Win32::System::Ole::ReleaseStgMedium;

        let format = FORMATETC {
            cfFormat: cf,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let mut medium = data.GetData(&format).ok()?;
        if medium.tymed != TYMED_HGLOBAL.0 as u32 || medium.u.hGlobal.0.is_null() {
            ReleaseStgMedium(&mut medium);
            return None;
        }
        let ptr = GlobalLock(medium.u.hGlobal) as *const u8;
        if ptr.is_null() {
            ReleaseStgMedium(&mut medium);
            return None;
        }
        let alloc_bytes = GlobalSize(medium.u.hGlobal);
        let capped = alloc_bytes.min(max_bytes);
        let bytes = if capped == 0 {
            None
        } else {
            Some(std::slice::from_raw_parts(ptr, capped).to_vec())
        };
        let _ = GlobalUnlock(medium.u.hGlobal);
        ReleaseStgMedium(&mut medium);
        bytes
    }

    unsafe fn extract_hglobal_utf16_capped(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
        max_units: usize,
    ) -> Option<String> {
        let bytes = Self::read_hglobal_bytes(data, cf, max_units.saturating_mul(2))?;
        let mut units = Vec::with_capacity(bytes.len() / 2);
        for &pair in bytes.as_chunks::<2>().0 {
            let unit = u16::from_le_bytes(pair);
            if unit == 0 {
                break;
            }
            units.push(unit);
        }
        (!units.is_empty()).then(|| String::from_utf16_lossy(&units))
    }

    unsafe fn extract_hglobal_utf16(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
    ) -> Option<String> {
        Self::extract_hglobal_utf16_capped(data, cf, MAX_URL_UNITS)
    }

    unsafe fn extract_hglobal_utf8(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
        max_bytes: usize,
    ) -> Option<String> {
        let bytes = Self::read_hglobal_bytes(data, cf, max_bytes)?;
        let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
        (end > 0).then(|| String::from_utf8_lossy(&bytes[..end]).into_owned())
    }

    unsafe fn extract_hglobal_ansi(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
    ) -> Option<String> {
        Self::extract_hglobal_utf8(data, cf, MAX_URL_UNITS)
    }

    unsafe fn extract_cf_html(data: &windows::Win32::System::Com::IDataObject) -> Option<String> {
        let cf = cf_html_format();
        if cf == 0 {
            return None;
        }
        Self::extract_hglobal_utf8(data, cf, MAX_CF_HTML_BYTES)
    }

    unsafe fn extract_raw_url_candidate(
        data: &windows::Win32::System::Com::IDataObject,
    ) -> Option<String> {
        use windows::Win32::System::Ole::CF_UNICODETEXT;

        let cf_w = cf_ineturl_w();
        if cf_w != 0 {
            if let Some(raw) = Self::extract_hglobal_utf16_capped(data, cf_w, MAX_DATA_URI_UNITS) {
                if !raw.trim().is_empty() {
                    return Some(raw);
                }
            }
        }
        let cf_a = cf_ineturl_a();
        if cf_a != 0 {
            if let Some(raw) = Self::extract_hglobal_utf8(data, cf_a, MAX_CF_HTML_BYTES) {
                if !raw.trim().is_empty() {
                    return Some(raw);
                }
            }
        }
        let cf_uri = cf_text_uri_list();
        if cf_uri != 0 {
            if let Some(raw) = Self::extract_hglobal_utf8(data, cf_uri, MAX_URL_UNITS) {
                if !raw.trim().is_empty() {
                    return Some(raw);
                }
            }
        }
        if let Some(raw) =
            Self::extract_hglobal_utf16_capped(data, CF_UNICODETEXT.0, MAX_DATA_URI_UNITS)
        {
            if !raw.trim().is_empty() {
                return Some(raw);
            }
        }
        None
    }

    unsafe fn extract_virtual_descriptors(
        data: &windows::Win32::System::Com::IDataObject,
    ) -> Vec<VirtualFileDescriptor> {
        use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_DIRECTORY;
        use windows::Win32::UI::Shell::{FILEDESCRIPTORW, FILEGROUPDESCRIPTORW, FD_ATTRIBUTES, FD_FILESIZE};

        let cf = cf_filedescriptor_w();
        if cf == 0 {
            return Vec::new();
        }
        const MAX_VIRTUAL_ITEMS: usize = 64;
        let max_bytes =
            std::mem::size_of::<u32>() + MAX_VIRTUAL_ITEMS * std::mem::size_of::<FILEDESCRIPTORW>();
        let Some(bytes) = Self::read_hglobal_bytes(data, cf, max_bytes) else {
            return Vec::new();
        };
        if bytes.len() < std::mem::size_of::<u32>() {
            return Vec::new();
        }
        let c_items = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        if c_items == 0 {
            return Vec::new();
        }
        let fgd_offset = std::mem::offset_of!(FILEGROUPDESCRIPTORW, fgd);
        let entry_size = std::mem::size_of::<FILEDESCRIPTORW>();
        let capped = c_items.min(MAX_VIRTUAL_ITEMS);
        let mut out = Vec::new();
        for idx in 0..capped {
            let start = fgd_offset + idx * entry_size;
            let end = start + entry_size;
            if end > bytes.len() {
                break;
            }
            let desc = std::ptr::read_unaligned(bytes[start..end].as_ptr() as *const FILEDESCRIPTORW);
            if (desc.dwFlags & FD_ATTRIBUTES.0 as u32) != 0
                && (desc.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY.0) != 0
            {
                continue;
            }
            let c_file_name = desc.cFileName;
            let name_len = c_file_name
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(c_file_name.len());
            let raw_name = String::from_utf16_lossy(&c_file_name[..name_len])
                .trim()
                .to_string();
            if raw_name.is_empty() {
                continue;
            }
            if extract_extension_from_name(&raw_name)
                .as_deref()
                .is_some_and(is_blocked_executable_ext)
            {
                continue;
            }
            let expected_size = if (desc.dwFlags & FD_FILESIZE.0 as u32) != 0 {
                Some(((desc.nFileSizeHigh as u64) << 32) | (desc.nFileSizeLow as u64))
            } else {
                None
            };
            if expected_size.is_some_and(|sz| sz > MAX_BROWSER_DOWNLOAD_BYTES) {
                continue;
            }
            out.push(VirtualFileDescriptor {
                index: idx,
                raw_name,
                expected_size,
            });
        }
        out
    }

    unsafe fn materialize_single_virtual_file(
        data: &windows::Win32::System::Com::IDataObject,
        desc: &VirtualFileDescriptor,
        total_items: usize,
        downloads_dir: &Path,
        fallback_ext: &str,
    ) -> Option<String> {
        use windows::Win32::System::Com::{
            DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL, TYMED_ISTREAM,
        };
        use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
        use windows::Win32::System::Ole::ReleaseStgMedium;

        let cf = cf_filecontents_format();
        if cf == 0 {
            return None;
        }
        let mut format = FORMATETC {
            cfFormat: cf,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: desc.index as i32,
            tymed: (TYMED_ISTREAM.0 | TYMED_HGLOBAL.0) as u32,
        };
        let mut medium = match data.GetData(&format) {
            Ok(m) => m,
            Err(_) if total_items == 1 && desc.index == 0 => {
                format.lindex = -1;
                data.GetData(&format).ok()?
            }
            Err(_) => return None,
        };

        std::fs::create_dir_all(downloads_dir).ok()?;
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let part_path = downloads_dir.join(format!("virtual_{}_{}_{}.part", std::process::id(), desc.index, nanos));

        let mut magic_head: Vec<u8> = Vec::with_capacity(64);
        let mut total_written: u64 = 0;
        let max_allowed = desc
            .expected_size
            .map(|sz| sz.min(MAX_BROWSER_DOWNLOAD_BYTES))
            .unwrap_or(MAX_BROWSER_DOWNLOAD_BYTES);

        let write_ok = if medium.tymed == TYMED_HGLOBAL.0 as u32 && !medium.u.hGlobal.0.is_null() {
            let ptr = GlobalLock(medium.u.hGlobal) as *const u8;
            let ok = if !ptr.is_null() {
                let sz = GlobalSize(medium.u.hGlobal) as u64;
                if sz > 0 && sz <= max_allowed {
                    let slice = std::slice::from_raw_parts(ptr, sz as usize);
                    let take = slice.len().min(64);
                    magic_head.extend_from_slice(&slice[..take]);
                    if is_executable_magic_bytes(&magic_head) {
                        false
                    } else if let Ok(mut f) = std::fs::File::create(&part_path) {
                        total_written = sz;
                        f.write_all(slice).is_ok() && f.flush().is_ok()
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            };
            let _ = GlobalUnlock(medium.u.hGlobal);
            ok
        } else if medium.tymed == TYMED_ISTREAM.0 as u32 {
            if let Some(stream) = medium.u.pstm.as_ref() {
                if let Ok(mut f) = std::fs::File::create(&part_path) {
                    let mut buf = [0u8; 65536];
                    let mut ok = true;
                    loop {
                        let mut read_bytes = 0u32;
                        let hr = stream.Read(
                            buf.as_mut_ptr() as *mut _,
                            buf.len() as u32,
                            Some(&mut read_bytes),
                        );
                        if hr.is_err() {
                            ok = false;
                            break;
                        }
                        if read_bytes == 0 {
                            break;
                        }
                        let chunk = &buf[..read_bytes as usize];
                        total_written = total_written.saturating_add(chunk.len() as u64);
                        if total_written > max_allowed {
                            ok = false;
                            break;
                        }
                        if magic_head.len() < 64 {
                            let take = (64 - magic_head.len()).min(chunk.len());
                            magic_head.extend_from_slice(&chunk[..take]);
                        }
                        if is_executable_magic_bytes(&magic_head) {
                            ok = false;
                            break;
                        }
                        if f.write_all(chunk).is_err() {
                            ok = false;
                            break;
                        }
                    }
                    ok && total_written > 0 && f.flush().is_ok()
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };

        ReleaseStgMedium(&mut medium);

        if !write_ok || total_written == 0 {
            let _ = std::fs::remove_file(&part_path);
            return None;
        }

        let name_ext = extract_extension_from_name(&desc.raw_name);
        let magic_ext = infer_extension_from_magic_bytes(&magic_head).map(str::to_string);
        let chosen_ext = name_ext
            .or(magic_ext)
            .unwrap_or_else(|| fallback_ext.to_string());
        if is_blocked_executable_ext(&chosen_ext) {
            let _ = std::fs::remove_file(&part_path);
            return None;
        }

        let clean_name = sanitize_download_filename(&desc.raw_name, &chosen_ext);
        if extract_extension_from_name(&clean_name)
            .as_deref()
            .is_some_and(is_blocked_executable_ext)
        {
            let _ = std::fs::remove_file(&part_path);
            return None;
        }
        let dest = unique_download_path(downloads_dir, &clean_name);
        if std::fs::rename(&part_path, &dest).is_err() {
            let _ = std::fs::remove_file(&part_path);
            return None;
        }
        Some(dest.to_string_lossy().to_string())
    }

    unsafe fn extract_urls(data: &windows::Win32::System::Com::IDataObject) -> Vec<String> {
        use windows::Win32::System::Ole::CF_UNICODETEXT;

        let mut urls = Vec::new();
        let cf_w = cf_ineturl_w();
        if cf_w != 0 {
            if let Some(raw) = Self::extract_hglobal_utf16(data, cf_w) {
                for url in parse_url_lines(&raw) {
                    if !urls.contains(&url) {
                        urls.push(url);
                    }
                }
            }
        }
        if urls.is_empty() {
            let cf_a = cf_ineturl_a();
            if cf_a != 0 {
                if let Some(raw) = Self::extract_hglobal_ansi(data, cf_a) {
                    for url in parse_url_lines(&raw) {
                        if !urls.contains(&url) {
                            urls.push(url);
                        }
                    }
                }
            }
        }
        if urls.is_empty() {
            if let Some(raw) = Self::extract_hglobal_utf16(data, CF_UNICODETEXT.0) {
                let all_lines_urls = raw
                    .lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .all(is_supported_drag_url);
                if all_lines_urls {
                    urls = parse_url_lines(&raw);
                }
            }
        }
        urls
    }

    unsafe fn extract_payload(
        &self,
        data: &windows::Win32::System::Com::IDataObject,
        materialize_virtual: bool,
    ) -> ConverterDragPayload {
        let mut paths = Self::extract_files(data);
        let cf_html = Self::extract_cf_html(data);
        let raw_url_text = Self::extract_raw_url_candidate(data);
        let descriptors = if paths.is_empty() {
            Self::extract_virtual_descriptors(data)
        } else {
            Vec::new()
        };

        let is_browser_source = CONVERTER_DRAG_IS_BROWSER.load(Ordering::Relaxed)
            || cf_html.is_some()
            || !descriptors.is_empty();

        let parsed_browser = if paths.is_empty() {
            parse_browser_drop_payload(cf_html.as_deref(), raw_url_text.as_deref())
        } else {
            None
        };

        let mut urls = Vec::new();
        let fallback_ext = match &parsed_browser {
            Some(BrowserDragSource::ImageDataUri { raw_uri, suggested_name, .. }) => {
                urls.push(raw_uri.clone());
                extract_extension_from_name(suggested_name).unwrap_or_else(|| "png".to_string())
            }
            Some(BrowserDragSource::RemoteImageUrl { url, suggested_name }) => {
                urls.push(url.clone());
                extract_extension_from_name(suggested_name).unwrap_or_else(|| "png".to_string())
            }
            Some(BrowserDragSource::RemoteFileUrl { url, suggested_name }) => {
                urls.push(url.clone());
                extract_extension_from_name(suggested_name).unwrap_or_else(|| "bin".to_string())
            }
            None => {
                if paths.is_empty() && !is_browser_source {
                    urls = Self::extract_urls(data);
                }
                "png".to_string()
            }
        };

        let mut virtual_names = Vec::new();
        if paths.is_empty() && !descriptors.is_empty() {
            if materialize_virtual {
                if let Ok(conv_paths) = resolve_converter_paths(&self.app) {
                    for desc in &descriptors {
                        if let Some(saved) = Self::materialize_single_virtual_file(
                            data,
                            desc,
                            descriptors.len(),
                            &conv_paths.downloads_dir,
                            &fallback_ext,
                        ) {
                            paths.push(saved);
                        }
                    }
                    if !paths.is_empty() {
                        urls.clear();
                    }
                }
            } else {
                for desc in &descriptors {
                    let item_ext = extract_extension_from_name(&desc.raw_name)
                        .unwrap_or_else(|| fallback_ext.clone());
                    virtual_names.push(sanitize_download_filename(&desc.raw_name, &item_ext));
                }
            }
        }

        let is_browser_drag = is_browser_source || (paths.is_empty() && !urls.is_empty());
        ConverterDragPayload {
            paths,
            virtual_names,
            urls,
            is_browser_drag,
        }
    }
}

#[allow(non_snake_case)]
impl windows::Win32::System::Ole::IDropTarget_Impl for ConverterDropTarget_Impl {
    fn DragEnter(
        &self,
        pdata: windows::core::Ref<'_, windows::Win32::System::Com::IDataObject>,
        _keys: windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS,
        pt: &windows::Win32::Foundation::POINTL,
        effect: *mut windows::Win32::System::Ole::DROPEFFECT,
    ) -> windows::core::Result<()> {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::System::Ole::{DROPEFFECT_COPY, DROPEFFECT_NONE};

        if crate::services::is_point_over_notch_window(POINT { x: pt.x, y: pt.y }) {
            unsafe {
                *self.enter_valid.get() = false;
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                *self.last_css_pos.get() = None;
                *self.cached_payload.get() = None;
                if !effect.is_null() {
                    *effect = DROPEFFECT_NONE;
                }
            }
            close_converter_overlay(&self.app);
            return Ok(());
        }

        let payload = pdata
            .as_ref()
            .map(|data| unsafe { self.extract_payload(data, false) })
            .unwrap_or(ConverterDragPayload {
                paths: Vec::new(),
                virtual_names: Vec::new(),
                urls: Vec::new(),
                is_browser_drag: false,
            });

        let browser_allowed = get_converter_drag_config().browser_drag;
        let has_any = !payload.paths.is_empty()
            || !payload.virtual_names.is_empty()
            || !payload.urls.is_empty();
        if !has_any || (payload.is_browser_drag && payload.paths.is_empty() && !browser_allowed) {
            unsafe {
                *self.enter_valid.get() = false;
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                *self.last_css_pos.get() = None;
                *self.cached_payload.get() = None;
                if !effect.is_null() {
                    *effect = DROPEFFECT_NONE;
                }
            }
            close_converter_overlay(&self.app);
            return Ok(());
        }

        let (x, y) = crate::services::screen_to_radial_css(pt.x, pt.y);
        let display_paths = if !payload.paths.is_empty() {
            payload.paths.clone()
        } else {
            payload.virtual_names.clone()
        };
        let open_urls = payload.urls.clone();
        let is_browser_drag = payload.is_browser_drag;

        unsafe {
            *self.enter_valid.get() = true;
            *self.cursor_effect.get() = DROPEFFECT_COPY;
            *self.last_css_pos.get() = Some((x, y));
            *self.cached_payload.get() = Some(payload);
            if !effect.is_null() {
                *effect = DROPEFFECT_COPY;
            }
        }
        CONVERTER_OLE_DRAG_ENTERED.store(true, Ordering::SeqCst);

        let _ = self.app.emit_to(
            "overlay",
            "converter-donut-open",
            serde_json::json!({
                "x": x,
                "y": y,
                "paths": display_paths,
                "urls": open_urls,
                "isBrowserDrag": is_browser_drag,
            }),
        );
        Ok(())
    }

    fn DragOver(
        &self,
        _keys: windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS,
        pt: &windows::Win32::Foundation::POINTL,
        effect: *mut windows::Win32::System::Ole::DROPEFFECT,
    ) -> windows::core::Result<()> {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::System::Ole::DROPEFFECT_NONE;

        unsafe {
            if crate::services::is_point_over_notch_window(POINT { x: pt.x, y: pt.y }) {
                *self.enter_valid.get() = false;
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                *self.last_css_pos.get() = None;
                *self.cached_payload.get() = None;
                if !effect.is_null() {
                    *effect = DROPEFFECT_NONE;
                }
                CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
                close_converter_overlay(&self.app);
                return Ok(());
            }

            if !effect.is_null() {
                *effect = *self.cursor_effect.get();
            }
            if *self.enter_valid.get() {
                let (x, y) = crate::services::screen_to_radial_css(pt.x, pt.y);
                let last = &mut *self.last_css_pos.get();
                if *last != Some((x, y)) {
                    *last = Some((x, y));
                    let _ = self.app.emit_to(
                        "overlay",
                        "converter-donut-drag-move",
                        serde_json::json!({ "x": x, "y": y }),
                    );
                }
            }
        }
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if unsafe { *self.enter_valid.get() } {
            unsafe {
                *self.enter_valid.get() = false;
                *self.last_css_pos.get() = None;
                *self.cached_payload.get() = None;
            }
            CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
            close_converter_overlay(&self.app);
        }
        Ok(())
    }

    fn Drop(
        &self,
        pdata: windows::core::Ref<'_, windows::Win32::System::Com::IDataObject>,
        _keys: windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS,
        pt: &windows::Win32::Foundation::POINTL,
        effect: *mut windows::Win32::System::Ole::DROPEFFECT,
    ) -> windows::core::Result<()> {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::System::Ole::DROPEFFECT_NONE;

        let over_notch = crate::services::is_point_over_notch_window(POINT { x: pt.x, y: pt.y });
        let enter_valid = unsafe { *self.enter_valid.get() };
        if over_notch || !enter_valid {
            unsafe {
                *self.enter_valid.get() = false;
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                *self.last_css_pos.get() = None;
                *self.cached_payload.get() = None;
                if !effect.is_null() {
                    *effect = DROPEFFECT_NONE;
                }
            }
            CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
            if over_notch {
                close_converter_overlay(&self.app);
            }
            return Ok(());
        }

        unsafe {
            *self.enter_valid.get() = false;
            *self.last_css_pos.get() = None;
        }
        let cached = unsafe { (*self.cached_payload.get()).take() };
        let extracted = pdata
            .as_ref()
            .map(|data| unsafe { self.extract_payload(data, true) });

        let (paths, urls, is_browser_drag) = match extracted {
            Some(p) if !p.paths.is_empty() || !p.urls.is_empty() => {
                (p.paths, p.urls, p.is_browser_drag)
            }
            _ => {
                if let Some(cached_payload) = cached {
                    // Never forward unmaterialized `virtual_names` as real file paths.
                    (
                        cached_payload.paths,
                        cached_payload.urls,
                        cached_payload.is_browser_drag,
                    )
                } else {
                    (
                        Vec::new(),
                        Vec::new(),
                        CONVERTER_DRAG_IS_BROWSER.load(Ordering::Relaxed),
                    )
                }
            }
        };

        let browser_allowed = get_converter_drag_config().browser_drag;
        if (paths.is_empty() && urls.is_empty())
            || (is_browser_drag && paths.is_empty() && !browser_allowed)
        {
            unsafe {
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                if !effect.is_null() {
                    *effect = DROPEFFECT_NONE;
                }
            }
            CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
            close_converter_overlay(&self.app);
            return Ok(());
        }

        unsafe {
            if !effect.is_null() {
                *effect = *self.cursor_effect.get();
            }
        }

        let (x, y) = crate::services::screen_to_radial_css(pt.x, pt.y);
        CONVERTER_OLE_DRAG_ENTERED.store(false, Ordering::SeqCst);
        CONVERTER_OLE_DROP_DONE.store(true, Ordering::SeqCst);

        let _ = self.app.emit_to(
            "overlay",
            "converter-donut-drop",
            serde_json::json!({
                "x": x,
                "y": y,
                "paths": paths,
                "urls": urls,
                "isBrowserDrag": is_browser_drag,
            }),
        );
        Ok(())
    }
}

fn collect_overlay_hwnds(top: windows::Win32::Foundation::HWND) -> Vec<isize> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

    unsafe extern "system" fn child_proc(child: HWND, lparam: LPARAM) -> BOOL {
        let out = &mut *(lparam.0 as *mut Vec<isize>);
        out.push(child.0 as isize);
        BOOL(1)
    }

    let mut hwnds = vec![top.0 as isize];
    unsafe {
        let _ = EnumChildWindows(
            Some(top),
            Some(child_proc),
            LPARAM(&mut hwnds as *mut Vec<isize> as isize),
        );
    }
    hwnds.sort_unstable();
    hwnds.dedup();
    hwnds
}

unsafe fn inject_converter_target(
    hwnd: windows::Win32::Foundation::HWND,
    app: &AppHandle,
    out: &mut Vec<windows::Win32::System::Ole::IDropTarget>,
) {
    use windows::Win32::System::Ole::{
        IDropTarget, RegisterDragDrop, RevokeDragDrop, DROPEFFECT_NONE,
    };

    let target: IDropTarget = ConverterDropTarget {
        app: app.clone(),
        enter_valid: UnsafeCell::new(false),
        cursor_effect: UnsafeCell::new(DROPEFFECT_NONE),
        last_css_pos: UnsafeCell::new(None),
        cached_payload: UnsafeCell::new(None),
    }
    .into();
    let _ = RevokeDragDrop(hwnd);
    if RegisterDragDrop(hwnd, &target).is_ok() {
        out.push(target);
    }
}

/// (Re)registers the converter OLE IDropTarget on `"overlay"` and all its current
/// descendant child windows. Must run on the main thread that owns `"overlay"`.
pub fn setup_converter_drop(app: &AppHandle) {
    if CONVERTER_OLE_DRAG_ENTERED.load(Ordering::Acquire) {
        return;
    }
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    let Ok(hwnd) = win.hwnd() else {
        return;
    };

    let hwnds = collect_overlay_hwnds(hwnd);
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let mut targets = Vec::with_capacity(hwnds.len());
        let mut registered_hwnds = Vec::with_capacity(hwnds.len());
        for raw in hwnds {
            let child_hwnd = HWND(raw as *mut _);
            let before = targets.len();
            inject_converter_target(child_hwnd, app, &mut targets);
            if targets.len() > before {
                registered_hwnds.push(raw);
            }
        }
        if let Ok(mut guard) = CONVERTER_DROP_TARGETS.lock() {
            *guard = Some(ConverterTargetStore(registered_hwnds, targets));
        }
    }
}

/// Ensures `"overlay"` and all its current child windows have `ConverterDropTarget` registered,
/// only re-registering if child HWNDs changed (e.g. WebView2 recreated its render child).
pub fn ensure_converter_drop(app: &AppHandle) {
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    let current = collect_overlay_hwnds(hwnd);
    let already_matches = CONVERTER_DROP_TARGETS
        .lock()
        .ok()
        .is_some_and(|guard| {
            guard
                .as_ref()
                .is_some_and(|store| !store.0.is_empty() && store.0 == current)
        });
    if !already_matches {
        setup_converter_drop(app);
    }
}

pub fn ensure_converter_drop_synced(app: &AppHandle) {
    if MAIN_THREAD_ID
        .get()
        .is_some_and(|&id| id == std::thread::current().id())
    {
        ensure_converter_drop(app);
        return;
    }
    let (tx, rx) = std::sync::mpsc::sync_channel::<()>(1);
    let app_clone = app.clone();
    if app
        .run_on_main_thread(move || {
            ensure_converter_drop(&app_clone);
            let _ = tx.send(());
        })
        .is_ok()
    {
        let _ = rx.recv_timeout(Duration::from_millis(80));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_paths() -> ConverterPaths {
        let root = PathBuf::from(
            r"C:\Users\Test\AppData\Roaming\io.github.abdulllrahmandev.zenith\converter",
        );
        converter_paths_from_root(root)
    }

    #[test]
    fn parse_cli_stderr_line_handles_progress_file_and_noise() {
        assert_eq!(
            parse_cli_stderr_line(r#"{"event":"progress","source":"a.heic","fraction":0.45}"#),
            Some(CliEvent::Progress {
                source: "a.heic".to_string(),
                fraction: 0.45,
            })
        );

        assert_eq!(
            parse_cli_stderr_line(
                r#"{"event":"file","source":"a.heic","state":"Failed","errorKey":"MissingEngine:ffmpeg"}"#
            ),
            Some(CliEvent::FileDone {
                source: "a.heic".to_string(),
                outputs: Vec::new(),
                state: "Failed".to_string(),
                error: None,
                error_key: Some("MissingEngine:ffmpeg".to_string()),
                missing_engine: Some("ffmpeg".to_string()),
            })
        );

        assert_eq!(
            parse_cli_stderr_line(
                r#"{"event":"file","source":"b.mp4","state":"failed","outputs":[],"error":"No converter","errorKey":"error.no_route","needsEngines":["ffmpeg"]}"#
            ),
            Some(CliEvent::FileDone {
                source: "b.mp4".to_string(),
                outputs: Vec::new(),
                state: "failed".to_string(),
                error: Some("No converter".to_string()),
                error_key: Some("error.no_route".to_string()),
                missing_engine: Some("ffmpeg".to_string()),
            })
        );

        assert_eq!(parse_cli_stderr_line(""), None);
        assert_eq!(parse_cli_stderr_line("   \r\n  "), None);
        assert_eq!(parse_cli_stderr_line("not json at all"), None);
        assert_eq!(
            parse_cli_stderr_line(r#"{"event":"progress","source":"a.heic""#),
            None
        );
        assert_eq!(
            parse_cli_stderr_line(r#"{"event":"unknown","foo":1}"#),
            None
        );
    }

    #[test]
    fn map_cli_exit_code_surfaces_missing_engine_and_errors() {
        assert_eq!(
            map_cli_exit_code(Some(0), None, ""),
            Ok(CliOutcome::Completed)
        );
        assert_eq!(
            map_cli_exit_code(Some(1), Some("ffmpeg"), "some stderr"),
            Err("MISSING_ENGINE:ffmpeg".to_string())
        );

        let fail_err = map_cli_exit_code(Some(1), None, "codec unsupported").unwrap_err();
        assert!(fail_err.starts_with("CONVERSION_FAILED:"), "got: {fail_err}");
        assert!(fail_err.contains("codec unsupported"));

        let usage_err = map_cli_exit_code(Some(2), None, "filee: unknown format").unwrap_err();
        assert!(usage_err.starts_with("USAGE_ERROR:"), "got: {usage_err}");
        assert!(usage_err.contains("unknown format"));

        let nothing_err =
            map_cli_exit_code(Some(3), None, "filee: no files to convert.").unwrap_err();
        assert!(
            nothing_err.starts_with("NOTHING_TO_CONVERT:"),
            "got: {nothing_err}"
        );

        assert_eq!(
            map_cli_exit_code(None, None, ""),
            Err("CANCELLED".to_string())
        );
    }

    #[test]
    fn build_convert_args_includes_json_output_quality_and_crop() {
        let paths = test_paths();
        let req = ConvertRequest {
            job_id: "job-1".to_string(),
            inputs: vec![
                r"C:\Temp\cropped photo.png".to_string(),
                r"C:\Temp\second.heic".to_string(),
            ],
            to: "webp".to_string(),
            preset: None,
            output_dir: Some(r"C:\Out Dir".to_string()),
            quality: Some(85),
            pages: Some("1-3,5".to_string()),
            split_every: None,
            split_parts: None,
            conflict: None,
            overwrite: Some(true),
            keep_dates: Some(true),
            zip: Some(true),
            iso_filesystem: None,
            iso_label: None,
            crop: None,
        };

        let args = build_convert_args(&req, &paths);
        assert_eq!(
            args,
            vec![
                "convert",
                r"C:\Temp\cropped photo.png",
                r"C:\Temp\second.heic",
                "--to",
                "webp",
                "-o",
                r"C:\Out Dir",
                "-q",
                "85",
                "--pages",
                "1-3,5",
                "--overwrite",
                "--keep-dates",
                "--zip",
                "--json",
            ]
        );

        let iso_req = ConvertRequest {
            job_id: "job-2".to_string(),
            inputs: vec![r"C:\Folder".to_string()],
            to: "iso".to_string(),
            preset: None,
            output_dir: None,
            quality: None,
            pages: None,
            split_every: None,
            split_parts: None,
            conflict: None,
            overwrite: Some(false),
            keep_dates: None,
            zip: None,
            iso_filesystem: Some("udf201".to_string()),
            iso_label: Some("MY_DISC".to_string()),
            crop: None,
        };
        let iso_args = build_convert_args(&iso_req, &paths);
        assert_eq!(
            iso_args,
            vec![
                "convert",
                r"C:\Folder",
                "--to",
                "iso",
                "--iso-filesystem",
                "udf201",
                "--iso-label",
                "MY_DISC",
                "--json",
            ]
        );

        let preset_req = ConvertRequest {
            job_id: "job-3".to_string(),
            inputs: vec![r"C:\Doc.pdf".to_string()],
            to: "pdf".to_string(),
            preset: Some("compress-pdf".to_string()),
            output_dir: None,
            quality: None,
            pages: None,
            split_every: None,
            split_parts: None,
            conflict: None,
            overwrite: None,
            keep_dates: None,
            zip: None,
            iso_filesystem: None,
            iso_label: None,
            crop: None,
        };
        assert_eq!(
            build_convert_args(&preset_req, &paths),
            vec![
                "convert",
                r"C:\Doc.pdf",
                "--preset",
                "compress-pdf",
                "--json",
            ]
        );

        let split_skip_req = ConvertRequest {
            job_id: "job-4".to_string(),
            inputs: vec![r"C:\Book.pdf".to_string()],
            to: "pdf".to_string(),
            preset: None,
            output_dir: None,
            quality: None,
            pages: Some("1-20".to_string()),
            split_every: Some(5),
            split_parts: Some(3),
            conflict: Some("skip".to_string()),
            overwrite: Some(true),
            keep_dates: None,
            zip: None,
            iso_filesystem: None,
            iso_label: None,
            crop: None,
        };
        assert_eq!(
            build_convert_args(&split_skip_req, &paths),
            vec![
                "convert",
                r"C:\Book.pdf",
                "--to",
                "pdf",
                "--pages",
                "1-20",
                "--split-every",
                "5",
                "--skip",
                "--json",
            ]
        );

        let parts_rename_req = ConvertRequest {
            job_id: "job-5".to_string(),
            inputs: vec![r"C:\Book.pdf".to_string()],
            to: "pdf".to_string(),
            preset: None,
            output_dir: None,
            quality: None,
            pages: None,
            split_every: None,
            split_parts: Some(4),
            conflict: Some("rename".to_string()),
            overwrite: Some(true),
            keep_dates: None,
            zip: None,
            iso_filesystem: None,
            iso_label: None,
            crop: None,
        };
        assert_eq!(
            build_convert_args(&parts_rename_req, &paths),
            vec![
                "convert",
                r"C:\Book.pdf",
                "--to",
                "pdf",
                "--split-parts",
                "4",
                "--json",
            ]
        );
    }

    #[test]
    fn converter_paths_and_isolated_env_stay_under_zenith_converter_root() {
        let paths = test_paths();
        assert_eq!(paths.bin_dir, paths.root.join("bin"));
        assert_eq!(paths.cli_exe, paths.root.join("bin").join("filee-cli.exe"));
        assert_eq!(paths.engines_dir, paths.root.join("engines"));
        assert_eq!(paths.state_file, paths.root.join("state.json"));
        assert_eq!(paths.downloads_dir, paths.root.join("downloads"));

        let args = vec!["convert".to_string(), "--json".to_string()];
        let cmd = build_cli_command(&paths.cli_exe, &args, &paths);
        assert_eq!(cmd.get_program(), paths.cli_exe.as_os_str());
        let envs: HashMap<_, _> = cmd
            .get_envs()
            .filter_map(|(k, v)| Some((k.to_string_lossy().to_string(), v?.to_string_lossy().to_string())))
            .collect();
        let expected_root = paths.root.to_string_lossy().to_string();
        for var in [
            "FILEE_DATA_DIR",
            "FILEE_APPDATA",
            "FILEE_HOME",
            "APPDATA",
            "LOCALAPPDATA",
        ] {
            assert_eq!(envs.get(var), Some(&expected_root));
        }
    }

    #[test]
    fn parse_cli_stdout_json_and_sha256_and_job_cancel_lifecycle() {
        let stdout = br#"{"preset":"webp","target":"webp","converted":1,"skipped":0,"failed":0,"files":[{"source":"a.png","state":"done","outputs":["a.webp"]}]}"#;
        let parsed = parse_cli_stdout_json(stdout).expect("valid stdout json");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].outputs, vec!["a.webp"]);
        assert_eq!(parse_cli_stdout_json(b"not json"), None);
        assert_eq!(parse_cli_stdout_json(b""), None);

        assert_eq!(
            compute_sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );

        let job_id = format!("test-cancel-{}", std::process::id());
        let (guard, rx) = register_active_job(&job_id).expect("register job");
        assert!(attach_job_pid(&job_id, Some(424242)));
        assert_eq!(mark_job_cancelled(&job_id), Some(424242));
        assert!(*rx.borrow());
        assert!(!attach_job_pid(&job_id, Some(999)));
        drop(guard);
        assert!(active_jobs_map()
            .lock()
            .unwrap()
            .get(&job_id)
            .is_none());
    }

    #[test]
    fn parse_engines_list_json_extracts_status_and_sizes() {
        let raw = r#"{
            "platform": "win-x64",
            "engines": [
                {
                    "id": "libreoffice",
                    "status": "notinstalled",
                    "version": "26.2.6",
                    "downloadable": true,
                    "downloadSize": 422969790,
                    "installedSize": 1265000000,
                    "converters": ["libreoffice"]
                },
                {
                    "id": "ffmpeg",
                    "status": "installed",
                    "outdated": false,
                    "version": "9.1",
                    "downloadable": true,
                    "downloadSize": 104990867,
                    "installedSize": 272000000,
                    "converters": ["ffmpeg"]
                },
                {
                    "id": "pandoc",
                    "status": "owncopy",
                    "fromSystem": true,
                    "folder": "C:\\Program Files\\Pandoc",
                    "version": "3.13",
                    "downloadable": true,
                    "downloadSize": 42983200,
                    "installedSize": 236000000,
                    "converters": ["pandoc"]
                },
                {
                    "id": "upscayl-bin",
                    "status": "notinstalled",
                    "downloadable": false,
                    "unavailableReason": "No Filee download is available for win-arm64.",
                    "converters": ["upscaler"]
                }
            ]
        }"#;

        let parsed = parse_engines_list_json(raw).expect("valid engines json");
        assert_eq!(parsed.len(), 4);

        assert_eq!(
            parsed[0],
            EnginePackInfo {
                id: "libreoffice".to_string(),
                status: "notinstalled".to_string(),
                version: Some("26.2.6".to_string()),
                downloadable: true,
                download_size: 422_969_790,
                installed_size: 1_265_000_000,
                converters: vec!["libreoffice".to_string()],
                outdated: false,
                from_system: false,
                folder: None,
                unavailable_reason: None,
            }
        );
        assert_eq!(parsed[1].status, "installed");
        assert!(!parsed[1].outdated);
        assert_eq!(parsed[1].download_size, 104_990_867);

        assert_eq!(parsed[2].status, "owncopy");
        assert!(parsed[2].from_system);
        assert_eq!(
            parsed[2].folder.as_deref(),
            Some(r"C:\Program Files\Pandoc")
        );

        assert!(!parsed[3].downloadable);
        assert_eq!(
            parsed[3].unavailable_reason.as_deref(),
            Some("No Filee download is available for win-arm64.")
        );

        assert!(parse_engines_list_json("").is_err());
        assert!(parse_engines_list_json("not json").is_err());
        assert!(parse_engines_list_json("{}").is_err());
    }

    #[test]
    fn parse_engine_progress_line_handles_download_and_noise() {
        assert_eq!(
            parse_engine_progress_line(
                r#"{"id":"ffmpeg","stage":"downloading","component":"ffmpeg","fraction":0.45,"bytesDone":450,"bytesTotal":1000}"#
            ),
            Some(EngineInstallProgressEvent {
                id: "ffmpeg".to_string(),
                stage: "downloading".to_string(),
                component: "ffmpeg".to_string(),
                fraction: 0.45,
                bytes_done: 450,
                bytes_total: 1000,
            })
        );

        assert_eq!(
            parse_engine_progress_line(
                r#"  {"id":"libreoffice","stage":"unpacking","component":"h2orestart","fraction":1.2,"bytesDone":611297,"bytesTotal":611297}  "#
            ),
            Some(EngineInstallProgressEvent {
                id: "libreoffice".to_string(),
                stage: "unpacking".to_string(),
                component: "h2orestart".to_string(),
                fraction: 1.0,
                bytes_done: 611_297,
                bytes_total: 611_297,
            })
        );

        assert_eq!(parse_engine_progress_line(""), None);
        assert_eq!(parse_engine_progress_line("   \r\n  "), None);
        assert_eq!(parse_engine_progress_line("Downloading ffmpeg..."), None);
        assert_eq!(parse_engine_progress_line(r#"{"id":"ffmpeg""#), None);
        assert_eq!(
            parse_engine_progress_line(r#"{"id":"","stage":"downloading","fraction":0.5}"#),
            None
        );
    }

    #[test]
    fn fallback_engine_catalog_includes_all_ten_windows_packs() {
        let catalog = fallback_engine_catalog();
        let ids: Vec<&str> = catalog.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "libreoffice",
                "pandoc",
                "ghostscript",
                "ffmpeg",
                "calibre",
                "weasyprint",
                "tesseract",
                "upscayl-bin",
                "whisper",
                "exiftool",
            ]
        );
        for pack in catalog {
            assert_eq!(pack.status, "notinstalled");
            assert!(pack.downloadable);
            assert!(pack.download_size > 0);
            assert!(pack.installed_size > 0);
            assert!(!pack.converters.is_empty());
        }
    }

    #[test]
    fn validate_engine_id_accepts_slugs_and_rejects_injection() {
        assert_eq!(validate_engine_id("ffmpeg"), Ok("ffmpeg"));
        assert_eq!(validate_engine_id("upscayl-bin"), Ok("upscayl-bin"));
        assert_eq!(validate_engine_id("7zip"), Ok("7zip"));

        assert!(validate_engine_id("").is_err());
        assert!(validate_engine_id("-").is_err());
        assert!(validate_engine_id("-o").is_err());
        assert!(validate_engine_id("--help").is_err());
        assert!(validate_engine_id("ffmpeg-").is_err());
        assert!(validate_engine_id("foo--bar").is_err());
        assert!(validate_engine_id("FFmpeg").is_err());
        assert!(validate_engine_id("ffmpeg --help").is_err());
        assert!(validate_engine_id("../evil").is_err());
        assert!(validate_engine_id("ffmpeg&calc").is_err());
        assert!(validate_engine_id("ffmpeg_extra").is_err());
    }

    #[test]
    fn parse_sha256_sums_and_select_windows_portable_asset() {
        let sums = "\
# comment line\n\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  Filee-2.5.0-win-Setup.exe\n\
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB *Filee-2.5.0-win-Portable.zip\n\
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  Filee-2.5.0-win-arm64-Portable.zip\n";

        assert_eq!(
            parse_sha256_sums_entry(sums, "Filee-2.5.0-win-Portable.zip").as_deref(),
            Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
        );
        assert_eq!(
            parse_sha256_sums_entry(sums, "missing.zip"),
            None
        );

        assert_eq!(
            parse_github_digest(Some(
                "sha256:ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789"
            ))
            .as_deref(),
            Some("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
        );
        assert_eq!(parse_github_digest(Some("sha256:short")), None);

        let assets = vec![
            GitHubAsset {
                name: "Filee-2.5.0-linux-x64.tar.gz".to_string(),
                browser_download_url: "https://example.invalid/linux.tar.gz".to_string(),
                size: 100,
                digest: None,
            },
            GitHubAsset {
                name: "Filee-2.5.0-win-arm64-Portable.zip".to_string(),
                browser_download_url: "https://example.invalid/arm64.zip".to_string(),
                size: 200,
                digest: None,
            },
            GitHubAsset {
                name: "Filee-2.5.0-win-Portable.zip".to_string(),
                browser_download_url: "https://example.invalid/x64.zip".to_string(),
                size: 300,
                digest: None,
            },
            GitHubAsset {
                name: "Filee-2.5.0-SHA256SUMS.txt".to_string(),
                browser_download_url: "https://example.invalid/sums.txt".to_string(),
                size: 400,
                digest: None,
            },
            GitHubAsset {
                name: "Filee-2.5.0-SHA256SUMS.txt.sig".to_string(),
                browser_download_url: "https://example.invalid/sums.txt.sig".to_string(),
                size: 500,
                digest: None,
            },
        ];

        assert_eq!(
            select_windows_portable_asset(&assets, false).map(|a| a.name.as_str()),
            Some("Filee-2.5.0-win-Portable.zip")
        );
        assert_eq!(
            select_windows_portable_asset(&assets, true).map(|a| a.name.as_str()),
            Some("Filee-2.5.0-win-arm64-Portable.zip")
        );
        assert_eq!(
            find_windows_checksum_asset(&assets).map(|a| a.name.as_str()),
            Some("Filee-2.5.0-SHA256SUMS.txt")
        );
    }

    #[test]
    fn extract_portable_zip_verifies_sha256_and_skips_portable_marker() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        let zip_path = base.join("portable.zip");
        let staging_dir = base.join("bin.staging");
        let bin_dir = base.join("bin");

        let zip_bytes = {
            let mut cursor = std::io::Cursor::new(Vec::new());
            {
                let mut writer = zip::ZipWriter::new(&mut cursor);
                let opts = zip::write::SimpleFileOptions::default();
                writer.start_file("filee-cli.exe", opts).unwrap();
                writer.write_all(b"MZ-stub").unwrap();
                writer.start_file("filee.portable", opts).unwrap();
                writer.write_all(b"").unwrap();
                writer.start_file("engines/rhwp/rhwp.exe", opts).unwrap();
                writer.write_all(b"rhwp-stub").unwrap();
                writer.finish().unwrap();
            }
            cursor.into_inner()
        };
        std::fs::write(&zip_path, &zip_bytes).unwrap();
        let actual_sha = compute_sha256_hex(&zip_bytes);

        let wrong_sha = "0".repeat(64);
        let err = extract_portable_zip_verified(
            &zip_path,
            &staging_dir,
            &bin_dir,
            &wrong_sha,
            zip_bytes.len() as u64,
        )
        .unwrap_err();
        assert!(err.starts_with("INTEGRITY_ERROR:"), "got: {err}");

        let missing_sha_err = extract_portable_zip_verified(
            &zip_path,
            &staging_dir,
            &bin_dir,
            "",
            zip_bytes.len() as u64,
        )
        .unwrap_err();
        assert!(
            missing_sha_err.starts_with("INTEGRITY_ERROR:"),
            "got: {missing_sha_err}"
        );

        extract_portable_zip_verified(
            &zip_path,
            &staging_dir,
            &bin_dir,
            &actual_sha,
            zip_bytes.len() as u64,
        )
        .expect("verified extraction should succeed");

        assert!(bin_dir.join("filee-cli.exe").is_file());
        assert!(bin_dir.join("engines").join("rhwp").join("rhwp.exe").is_file());
        assert!(!bin_dir.join("filee.portable").exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_expected_sha256_requires_verified_hash_and_detects_mismatch() {
        let sha_a = "a".repeat(64);
        let sha_b = "b".repeat(64);

        let missing = resolve_expected_sha256(None, None, "Filee-2.5.0-win-Portable.zip")
            .unwrap_err();
        assert!(missing.starts_with("INTEGRITY_ERROR:"), "got: {missing}");

        let disagree = resolve_expected_sha256(
            Some(sha_a.clone()),
            Some(sha_b),
            "Filee-2.5.0-win-Portable.zip",
        )
        .unwrap_err();
        assert!(disagree.starts_with("INTEGRITY_ERROR:"), "got: {disagree}");

        assert_eq!(
            resolve_expected_sha256(
                Some(sha_a.to_ascii_uppercase()),
                Some(sha_a.clone()),
                "Filee-2.5.0-win-Portable.zip",
            ),
            Ok(sha_a.clone())
        );
        assert_eq!(
            resolve_expected_sha256(None, Some(sha_a.clone()), "Filee-2.5.0-win-Portable.zip"),
            Ok(sha_a)
        );
    }

    #[test]
    fn should_open_converter_drag_arbitrates_all_guards() {
        assert!(!should_open_converter_drag(false, false, false, true, 100, 4));
        assert!(!should_open_converter_drag(true, true, false, true, 100, 4));
        assert!(!should_open_converter_drag(true, false, true, true, 100, 4));
        assert!(!should_open_converter_drag(true, false, false, false, 100, 4));
        assert!(!should_open_converter_drag(true, false, false, true, 15, 4));
        assert!(!should_open_converter_drag(true, false, false, true, -1, 4));

        assert!(should_open_converter_drag(true, false, false, true, 16, 4));
        assert!(should_open_converter_drag(true, false, false, true, 100, 4));
    }

    #[test]
    fn is_converter_drag_source_matches_file_managers_and_optional_browsers() {
        for class in ["CabinetWClass", "ExploreWClass", "Progman", "WorkerW"] {
            assert!(
                is_converter_drag_source(Some(class), Some("explorer"), false),
                "expected class {class} with explorer to match"
            );
            assert!(
                is_converter_drag_source(Some(class), Some("explorer.exe"), false),
                "expected class {class} with explorer.exe to match"
            );
            assert!(is_converter_drag_source(Some(class), None, false));
        }
        assert!(is_converter_drag_source(
            Some("SHELLDLL_DefView"),
            Some("explorer"),
            false
        ));
        assert!(is_converter_drag_source(
            Some("QWidget"),
            Some("dopus"),
            false
        ));

        for proc_name in [
            "Files",
            "Files.exe",
            "dopus",
            "dopus.exe",
            "TOTALCMD64",
            "TOTALCMD64.EXE",
            "TOTALCMD",
            "XYplorer",
            "OneCommander",
            "Q-Dir",
            "FreeCommander",
            "FPilot",
            "xplorer2_64",
            "rustyfiles",
        ] {
            assert!(
                is_converter_drag_source(None, Some(proc_name), false),
                "expected file manager {proc_name} to match"
            );
        }

        for browser in [
            "chrome",
            "chrome.exe",
            "msedge",
            "msedge.exe",
            "firefox",
            "firefox.exe",
            "brave",
            "brave.exe",
            "opera",
            "vivaldi",
            "arc",
        ] {
            assert!(
                !is_converter_drag_source(Some("Chrome_WidgetWin_1"), Some(browser), false),
                "expected browser {browser} to be rejected when disabled"
            );
            assert!(
                is_converter_drag_source(Some("Chrome_WidgetWin_1"), Some(browser), true),
                "expected browser {browser} to match when enabled"
            );
        }

        assert!(!is_converter_drag_source(None, None, true));
        assert!(!is_converter_drag_source(None, Some("explorer"), true));
        assert!(!is_converter_drag_source(
            None,
            Some("explorer.exe"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("#32770"),
            Some("explorer.exe"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("Notepad"),
            Some("notepad.exe"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("Chrome_WidgetWin_1"),
            Some("Code.exe"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("Shell_TrayWnd"),
            Some("explorer"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("Shell_TrayWnd"),
            Some("explorer.exe"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("Shell_SecondaryTrayWnd"),
            Some("explorer"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("NotifyIconOverflowWindow"),
            Some("explorer"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("WorkerW"),
            Some("customapp"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("WorkerW"),
            Some("customapp.exe"),
            true
        ));
        assert!(!is_converter_drag_source(Some("WorkerW"), Some(""), true));
        assert!(!is_converter_drag_source(
            Some("CabinetWClass"),
            Some("customapp"),
            true
        ));
        assert!(!is_converter_drag_source(
            Some("SHELLDLL_DefView"),
            Some("customapp"),
            true
        ));
    }

    #[test]
    fn should_disarm_normal_drag_prevents_mid_drag_modifier_hijack() {
        for trigger in [
            ConverterTriggerKey::Ctrl,
            ConverterTriggerKey::Alt,
            ConverterTriggerKey::Shift,
        ] {
            // Below threshold: do not disarm yet
            assert!(!should_disarm_normal_drag(trigger, false, 15, 4));
            assert!(!should_disarm_normal_drag(trigger, false, -1, 4));
            // At/past threshold without modifier held: disarm normal OS drag
            assert!(should_disarm_normal_drag(trigger, false, 16, 4));
            assert!(should_disarm_normal_drag(trigger, false, 64, 4));
            // With modifier held: stay armed
            assert!(!should_disarm_normal_drag(trigger, true, 16, 4));
        }
        // RightDrag relies on mouse button rather than keyboard modifier
        assert!(!should_disarm_normal_drag(
            ConverterTriggerKey::RightDrag,
            false,
            100,
            4
        ));
        assert!(!should_disarm_normal_drag(
            ConverterTriggerKey::RightDrag,
            true,
            100,
            4
        ));
    }

    #[test]
    fn cancelled_converter_session_is_never_resurrected() {
        assert_eq!(
            evaluate_converter_show_session(0, 1, true, false, false),
            ConverterShowAction::BailAlreadyInactive
        );
        assert_eq!(
            evaluate_converter_show_session(1, 2, true, false, false),
            ConverterShowAction::BailAlreadyInactive
        );
        assert_eq!(
            evaluate_converter_show_session(1, 1, false, false, false),
            ConverterShowAction::BailAlreadyInactive
        );
        assert_eq!(
            evaluate_converter_show_session(1, 1, true, true, false),
            ConverterShowAction::CancelAndBail
        );
        assert_eq!(
            evaluate_converter_show_session(1, 1, true, false, true),
            ConverterShowAction::CancelAndBail
        );
        assert_eq!(
            evaluate_converter_show_session(1, 1, true, false, false),
            ConverterShowAction::Proceed
        );

        let s1 = prepare_converter_overlay_open();
        assert!(CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));
        assert_eq!(CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst), s1);

        // Simulate Esc / button release cancelling s1 before show_overlay_for_converter runs
        set_converter_overlay_open(false);
        assert_eq!(
            check_converter_show_session(s1, false, false),
            ConverterShowAction::BailAlreadyInactive
        );
        assert!(!CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));
        assert_eq!(CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst), s1);

        // Blocking on radial menu or splash clears CONVERTER_OVERLAY_OPEN for the current session
        let s2 = prepare_converter_overlay_open();
        assert!(CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));
        assert_eq!(
            check_converter_show_session(s2, true, false),
            ConverterShowAction::CancelAndBail
        );
        assert!(!CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));
        assert_eq!(CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst), s2);

        let s3 = prepare_converter_overlay_open();
        assert_eq!(
            check_converter_show_session(s3, false, true),
            ConverterShowAction::CancelAndBail
        );
        assert!(!CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));

        // Older session check must never deactivate a newer active session
        let s4 = prepare_converter_overlay_open();
        assert_eq!(
            check_converter_show_session(s3, true, false),
            ConverterShowAction::BailAlreadyInactive
        );
        assert!(CONVERTER_OVERLAY_OPEN.load(Ordering::SeqCst));
        assert_eq!(CONVERTER_DRAG_SESSION_ID.load(Ordering::SeqCst), s4);
        set_converter_overlay_open(false);
    }

    #[test]
    fn converter_trigger_key_and_url_helpers_parse_cleanly() {
        assert_eq!(ConverterTriggerKey::parse("ctrl"), ConverterTriggerKey::Ctrl);
        assert_eq!(ConverterTriggerKey::parse("ALT"), ConverterTriggerKey::Alt);
        assert_eq!(ConverterTriggerKey::parse("Shift"), ConverterTriggerKey::Shift);
        assert_eq!(
            ConverterTriggerKey::parse("right-drag"),
            ConverterTriggerKey::RightDrag
        );
        assert_eq!(ConverterTriggerKey::parse("unknown"), ConverterTriggerKey::Ctrl);

        assert_eq!(
            parse_url_lines("https://example.com/a.png\r\nhttp://localhost:8080/f.pdf\nnot a url\nhttps://example.com/a.png"),
            vec![
                "https://example.com/a.png".to_string(),
                "http://localhost:8080/f.pdf".to_string(),
            ]
        );
        assert!(parse_url_lines("plain selected text").is_empty());
        assert!(is_supported_drag_url("file:///C:/Temp/photo.png"));
        assert!(!is_supported_drag_url("https://"));
    }

    #[test]
    fn converter_progress_rect_hit_tests_bounds() {
        assert!(!rect_contains_point(None, 50.0, 50.0));
        assert!(!rect_contains_point(Some((10.0, 20.0, 0.0, 40.0)), 10.0, 25.0));
        assert!(!rect_contains_point(Some((10.0, 20.0, 100.0, -5.0)), 20.0, 18.0));

        let rect = Some((100.0, 200.0, 276.0, 64.0));
        assert!(rect_contains_point(rect, 100.0, 200.0));
        assert!(rect_contains_point(rect, 376.0, 264.0));
        assert!(rect_contains_point(rect, 240.0, 232.0));
        assert!(!rect_contains_point(rect, 99.9, 232.0));
        assert!(!rect_contains_point(rect, 376.1, 232.0));
        assert!(!rect_contains_point(rect, 240.0, 199.9));
        assert!(!rect_contains_point(rect, 240.0, 264.1));
        assert!(!rect_contains_point(rect, f64::NAN, 232.0));

        converter_set_progress_rect(120.0, 340.0, 260.0, 60.0);
        assert!(has_converter_progress_rect());
        assert!(is_point_in_converter_progress_rect(150.0, 360.0));
        assert!(!is_point_in_converter_progress_rect(10.0, 10.0));

        converter_clear_progress_rect();
        assert!(!has_converter_progress_rect());
        assert!(!is_point_in_converter_progress_rect(150.0, 360.0));
    }

    #[test]
    fn converter_state_round_trips_atomically_and_caps_recent_at_50() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_state_rt_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let paths = converter_paths_from_root(base.clone());

        let mut recent = Vec::with_capacity(65);
        for idx in 0..65usize {
            recent.push(RecentConversion {
                id: format!("rec-{idx}"),
                source_path: format!(r"C:\Temp\photo_{idx}.png"),
                source_name: format!("photo_{idx}.png"),
                source_ext: "png".to_string(),
                output_path: format!(r"C:\Temp\photo_{idx}.webp"),
                output_format: "webp".to_string(),
                timestamp_ms: 1_700_000_000_000 + (idx as u64) * 1000,
                thumbnail_data_url: None,
                status: "done".to_string(),
            });
        }

        let mut state = ConverterState {
            profiles: vec![ToolbarProfileState {
                id: "images".to_string(),
                category: "image".to_string(),
                label: "Images".to_string(),
                primary_ids: vec!["to-webp".to_string(), "to-png".to_string()],
                secondary_ids: vec!["tool-crop".to_string(), "zip-all".to_string()],
            }],
            presets: vec![ConverterPresetConfig {
                id: "custom-webp-80".to_string(),
                name: "WebP 80".to_string(),
                target_format: "webp".to_string(),
                quality: Some(80),
                pages: None,
                split_every: None,
                split_parts: None,
                conflict: Some("overwrite".to_string()),
                keep_dates: Some(true),
                zip: Some(false),
                iso_filesystem: None,
                iso_label: None,
            }],
            recent,
            watch_rules: vec![WatchRule {
                id: "watch-1".to_string(),
                folder: r"C:\Watch".to_string(),
                target_format: "webp".to_string(),
                preset_id: None,
                output_folder: r"C:\Out".to_string(),
                recursive: true,
                move_originals: false,
                keep_dates: true,
                enabled: false,
            }],
        };

        save_converter_state_atomic(&paths, &mut state).expect("atomic save should succeed");
        assert!(paths.state_file.is_file());

        let entries: Vec<String> = std::fs::read_dir(&paths.root)
            .expect("read root dir")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(entries, vec!["state.json".to_string()]);

        let loaded = load_converter_state(&paths).expect("reload should succeed");
        assert_eq!(loaded.profiles, state.profiles);
        assert_eq!(loaded.presets, state.presets);
        assert_eq!(loaded.watch_rules, state.watch_rules);
        assert_eq!(loaded.recent.len(), 50);
        assert_eq!(loaded.recent[0].id, "rec-64");
        assert_eq!(loaded.recent[49].id, "rec-15");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn converter_state_loads_default_when_missing_or_corrupt() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_state_missing_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let paths = converter_paths_from_root(base.clone());

        let missing = load_converter_state(&paths).expect("missing file returns default state");
        assert_eq!(missing, ConverterState::default());

        std::fs::create_dir_all(&paths.root).unwrap();
        std::fs::write(&paths.state_file, "{ corrupt json !!!").unwrap();
        let err = load_converter_state(&paths).unwrap_err();
        assert!(
            err.contains("STATE_CORRUPT") || err.to_lowercase().contains("parse"),
            "expected clear parse error, got: {err}"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn generate_thumbnail_data_url_resizes_image_to_64px_or_less() {
        use base64::Engine;

        let base = std::env::temp_dir().join(format!(
            "zenith_converter_thumb_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let img_path = base.join("wide.png");
        let img = image::RgbaImage::from_pixel(200, 100, image::Rgba([255, 80, 40, 255]));
        img.save(&img_path).unwrap();

        let data_url =
            generate_thumbnail_data_url(&img_path).expect("thumbnail data url for png");
        let b64 = data_url
            .strip_prefix("data:image/png;base64,")
            .expect("png data url prefix");
        let decoded_bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .expect("valid base64");
        let thumb = image::load_from_memory(&decoded_bytes).expect("valid png bytes");
        assert!(thumb.width() <= 64 && thumb.height() <= 64);
        assert_eq!((thumb.width(), thumb.height()), (64, 32));

        let txt_path = base.join("not-an-image.txt");
        std::fs::write(&txt_path, b"hello").unwrap();
        assert_eq!(generate_thumbnail_data_url(&txt_path), None);
        assert_eq!(generate_thumbnail_data_url(&base.join("missing.png")), None);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn crop_image_region_clamps_bounds() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_crop_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let img_path = base.join("sample.png");
        let img = image::RgbaImage::from_pixel(100, 80, image::Rgba([40, 140, 240, 255]));
        img.save(&img_path).unwrap();

        let clamped = clamp_crop_box(
            &CropBox {
                x: 90,
                y: 70,
                width: 50,
                height: 40,
                ref_width: None,
                ref_height: None,
            },
            100,
            80,
        )
        .expect("out-of-bounds crop should clamp within image");
        assert_eq!(clamped, (90, 70, 10, 10));

        assert!(
            clamp_crop_box(
                &CropBox {
                    x: 10,
                    y: 10,
                    width: 0,
                    height: 20,
                    ref_width: None,
                    ref_height: None,
                },
                100,
                80,
            )
            .is_err(),
            "zero width crop must be rejected"
        );
        assert!(
            clamp_crop_box(
                &CropBox {
                    x: 10,
                    y: 10,
                    width: 20,
                    height: 0,
                    ref_width: None,
                    ref_height: None,
                },
                100,
                80,
            )
            .is_err(),
            "zero height crop must be rejected"
        );
        assert!(
            clamp_crop_box(
                &CropBox {
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    ref_width: None,
                    ref_height: None,
                },
                0,
                80,
            )
            .is_err(),
            "zero-dimension source image must be rejected"
        );

        let temp_dir = base.join("out");
        let out_png = crop_image_to_temp_png(
            &img_path,
            &CropBox {
                x: 90,
                y: 70,
                width: 50,
                height: 40,
                ref_width: None,
                ref_height: None,
            },
            &temp_dir,
        )
        .expect("crop_image_to_temp_png should succeed");
        assert!(out_png.is_file());
        let cropped = image::open(&out_png).expect("cropped png should be readable");
        assert_eq!((cropped.width(), cropped.height()), (10, 10));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn crop_image_to_temp_png_handles_same_stem_without_collision() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_crop_collision_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let dir_a = base.join("folder_a");
        let dir_b = base.join("folder_b");
        std::fs::create_dir_all(&dir_a).unwrap();
        std::fs::create_dir_all(&dir_b).unwrap();

        let src_a = dir_a.join("photo.png");
        let src_b = dir_b.join("photo.png");
        image::RgbaImage::from_pixel(60, 60, image::Rgba([255, 0, 0, 255]))
            .save(&src_a)
            .unwrap();
        image::RgbaImage::from_pixel(60, 60, image::Rgba([0, 255, 0, 255]))
            .save(&src_b)
            .unwrap();

        let crop = CropBox {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
            ref_width: None,
            ref_height: None,
        };
        let temp_dir = base.join("temp");
        let out_0 = crop_image_to_temp_png(&src_a, &crop, &temp_dir.join("item_0")).unwrap();
        let out_1 = crop_image_to_temp_png(&src_b, &crop, &temp_dir.join("item_1")).unwrap();
        assert_ne!(out_0, out_1);
        assert_eq!(out_0.file_name().and_then(|s| s.to_str()), Some("photo.png"));
        assert_eq!(out_1.file_name().and_then(|s| s.to_str()), Some("photo.png"));

        // Also verify calling twice with the exact same temp_dir preserves the stem via subfolder.
        let dup_dir = base.join("same_temp");
        let dup_0 = crop_image_to_temp_png(&src_a, &crop, &dup_dir).unwrap();
        let dup_1 = crop_image_to_temp_png(&src_b, &crop, &dup_dir).unwrap();
        assert_ne!(dup_0, dup_1);
        assert_eq!(dup_0.file_name().and_then(|s| s.to_str()), Some("photo.png"));
        assert_eq!(dup_1.file_name().and_then(|s| s.to_str()), Some("photo.png"));
        assert_eq!(
            image::open(&dup_0).unwrap().to_rgba8().get_pixel(0, 0),
            &image::Rgba([255, 0, 0, 255])
        );
        assert_eq!(
            image::open(&dup_1).unwrap().to_rgba8().get_pixel(0, 0),
            &image::Rgba([0, 255, 0, 255])
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn crop_image_region_scales_proportionally_for_ref_dimensions() {
        let base = std::env::temp_dir().join(format!(
            "zenith_converter_crop_scale_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let ref_crop = CropBox {
            x: 1000,
            y: 600,
            width: 2000,
            height: 1500,
            ref_width: Some(4000),
            ref_height: Some(3000),
        };
        let scaled = clamp_crop_box(&ref_crop, 800, 600)
            .expect("proportional crop from 4000x3000 onto 800x600 must succeed");
        assert_eq!(scaled, (200, 120, 400, 300));

        let small_img_path = base.join("small.png");
        image::RgbaImage::from_pixel(800, 600, image::Rgba([30, 90, 180, 255]))
            .save(&small_img_path)
            .unwrap();
        let cropped_path = crop_image_to_temp_png(&small_img_path, &ref_crop, &base.join("out"))
            .expect("crop_image_to_temp_png should scale ref crop cleanly");
        let cropped = image::open(&cropped_path).unwrap();
        assert_eq!((cropped.width(), cropped.height()), (400, 300));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn load_image_preview_sync_resizes_large_images_and_keeps_original_dims() {
        use base64::Engine;

        let base = std::env::temp_dir().join(format!(
            "zenith_converter_preview_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let img_path = base.join("large.png");
        let img = image::RgbaImage::from_pixel(1600, 800, image::Rgba([10, 200, 120, 255]));
        img.save(&img_path).unwrap();

        let payload = load_image_preview_sync(&img_path).expect("preview payload should succeed");
        assert_eq!((payload.width, payload.height), (1600, 800));
        let b64 = payload
            .data_url
            .strip_prefix("data:image/png;base64,")
            .expect("png data url prefix");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .expect("valid base64");
        let preview_img = image::load_from_memory(&bytes).expect("valid png bytes");
        assert_eq!((preview_img.width(), preview_img.height()), (1280, 640));

        // Ensure ConvertRequest remains backward compatible without `crop`.
        let legacy_json = r#"{"job_id":"j1","inputs":["a.png"],"to":"webp"}"#;
        let parsed: ConvertRequest =
            serde_json::from_str(legacy_json).expect("legacy ConvertRequest without crop");
        assert_eq!(parsed.crop, None);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn parse_browser_drop_payload_extracts_img_and_rejects_unsafe() {
        let cf_html = concat!(
            "Version:0.9\r\n",
            "StartHTML:0000000105\r\n",
            "EndHTML:0000000216\r\n",
            "StartFragment:0000000139\r\n",
            "EndFragment:0000000182\r\n",
            "<html><body>\r\n",
            "<!--StartFragment--><img src=\"https://cdn.example.com/pic.png\"><!--EndFragment-->\r\n",
            "</body></html>"
        );
        assert_eq!(
            parse_browser_drop_payload(Some(cf_html), None),
            Some(BrowserDragSource::RemoteImageUrl {
                url: "https://cdn.example.com/pic.png".to_string(),
                suggested_name: "pic.png".to_string(),
            })
        );

        let relative_cf_html = concat!(
            "Version:0.9\r\n",
            "StartHTML:0000000149\r\n",
            "EndHTML:0000000213\r\n",
            "StartFragment:0000000163\r\n",
            "EndFragment:0000000197\r\n",
            "SourceURL:https://cdn.example.com/gallery/\r\n",
            "<html><body>\r\n",
            "<img src=\"/media/hero.webp?w=800\">\r\n",
            "</body></html>"
        );
        assert_eq!(
            parse_browser_drop_payload(Some(relative_cf_html), None),
            Some(BrowserDragSource::RemoteImageUrl {
                url: "https://cdn.example.com/media/hero.webp?w=800".to_string(),
                suggested_name: "hero.webp".to_string(),
            })
        );

        let escaped_img = r#"<img src="https://cdn.example.com/pic.png?w=800&amp;q=90">"#;
        assert_eq!(
            parse_browser_drop_payload(Some(escaped_img), Some("https://example.com/article.html")),
            Some(BrowserDragSource::RemoteImageUrl {
                url: "https://cdn.example.com/pic.png?w=800&q=90".to_string(),
                suggested_name: "pic.png".to_string(),
            })
        );

        let wrapped_pdf = r#"<a href="https://example.com/report.pdf"><img src="https://cdn.example.com/thumb.png"></a>"#;
        assert_eq!(
            parse_browser_drop_payload(Some(wrapped_pdf), Some("https://example.com/report.pdf")),
            Some(BrowserDragSource::RemoteFileUrl {
                url: "https://example.com/report.pdf".to_string(),
                suggested_name: "report.pdf".to_string(),
            })
        );

        let data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        assert_eq!(
            parse_browser_drop_payload(None, Some(data_uri)),
            Some(BrowserDragSource::ImageDataUri {
                mime: "image/png".to_string(),
                raw_uri: data_uri.to_string(),
                suggested_name: "image.png".to_string(),
            })
        );

        assert_eq!(
            parse_browser_drop_payload(None, Some("https://example.com/report.pdf")),
            Some(BrowserDragSource::RemoteFileUrl {
                url: "https://example.com/report.pdf".to_string(),
                suggested_name: "report.pdf".to_string(),
            })
        );

        let prose_html = "<p>First paragraph of selected article text.</p><p>Second paragraph with <img src=\"https://cdn.example.com/icon.png\"> inline.</p>";
        assert_eq!(parse_browser_drop_payload(Some(prose_html), None), None);

        assert_eq!(parse_browser_drop_payload(None, Some("javascript:alert(1)")), None);
        assert_eq!(parse_browser_drop_payload(None, Some("vbscript:msgbox(1)")), None);
        assert_eq!(parse_browser_drop_payload(None, Some("blob:https://example.com/1234")), None);
        assert_eq!(parse_browser_drop_payload(None, Some("file:///C:/Windows/win.ini")), None);
        assert_eq!(parse_browser_drop_payload(None, Some("https://example.com/setup.exe")), None);
        assert_eq!(
            parse_browser_drop_payload(Some(r#"<img src="https://example.com/setup.exe">"#), None),
            None
        );
    }

    #[test]
    fn sanitize_download_filename_strips_traversal_and_reserved() {
        let con_clean = sanitize_download_filename(r"../../evil\..\CON.png", "png");
        assert!(!con_clean.contains('/'));
        assert!(!con_clean.contains('\\'));
        assert!(!con_clean.contains(".."));
        assert!(!con_clean.eq_ignore_ascii_case("CON.png"));
        assert!(con_clean.ends_with(".png"));

        let nul_clean = sanitize_download_filename("NUL", "pdf");
        assert!(!nul_clean.eq_ignore_ascii_case("NUL.pdf"));
        assert!(nul_clean.ends_with(".pdf"));

        let chars_clean = sanitize_download_filename(r#"bad<name>:with"chars|?*here.jpg"#, "png");
        assert!(!chars_clean.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')));
        assert!(chars_clean.ends_with(".jpg"));

        let fallback = sanitize_download_filename("../../", "webp");
        assert!(!fallback.is_empty());
        assert!(!fallback.contains(".."));
        assert!(fallback.ends_with(".webp"));

        let long_name = format!("{}.png", "a".repeat(300));
        let truncated = sanitize_download_filename(&long_name, "png");
        assert!(truncated.len() <= 160);
        assert!(truncated.ends_with(".png"));
    }

    #[test]
    fn is_local_network_ip_blocks_private_loopback_and_mapped_v6() {
        use std::net::IpAddr;

        for raw in [
            "127.0.0.1",
            "0.0.0.0",
            "10.0.0.5",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "224.0.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "fe80::1",
            "fc00::1",
            "ff02::1",
            "64:ff9b::127.0.0.1",
            "64:ff9b:1::1",
        ] {
            let ip: IpAddr = raw.parse().unwrap();
            assert!(is_local_network_ip(ip), "expected local/blocked IP: {raw}");
        }

        for raw in ["93.184.216.34", "1.1.1.1", "2606:2800:220:1:248:1893:25c8:1946"] {
            let ip: IpAddr = raw.parse().unwrap();
            assert!(!is_local_network_ip(ip), "expected public IP: {raw}");
        }

        assert!(is_local_hostname("localhost"));
        assert!(is_local_hostname("sub.localhost."));
        assert!(is_local_hostname("printer.local"));
        assert!(is_local_hostname("router.home.arpa"));
        assert!(is_local_hostname("api.internal"));
        assert!(!is_local_hostname("example.com"));
        assert!(!is_local_hostname("cdn.example.com"));
    }

    #[test]
    fn browser_asset_helpers_infer_magic_mime_and_block_executables() {
        assert_eq!(
            infer_extension_from_magic_bytes(b"\x89PNG\r\n\x1a\nrest"),
            Some("png")
        );
        assert_eq!(
            infer_extension_from_magic_bytes(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("jpg")
        );
        assert_eq!(
            infer_extension_from_magic_bytes(b"RIFF\x00\x00\x00\x00WEBP"),
            Some("webp")
        );
        assert_eq!(infer_extension_from_magic_bytes(b"%PDF-1.7"), Some("pdf"));
        assert!(is_executable_magic_bytes(b"MZ\x90\x00"));
        assert!(!is_executable_magic_bytes(b"BM\x00\x00"));

        assert_eq!(
            parse_content_disposition_filename(r#"attachment; filename="quarterly%20report.pdf""#),
            Some("quarterly report.pdf".to_string())
        );
        assert_eq!(
            parse_content_disposition_filename("attachment; filename*=UTF-8''my%20photo.webp"),
            Some("my photo.webp".to_string())
        );

        let data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        let (mime, bytes, ext) = parse_data_image_uri(data_uri).expect("valid data png");
        assert_eq!(mime, "image/png");
        assert_eq!(ext, "png");
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));

        assert!(parse_data_image_uri("data:text/html;base64,PHNjcmlwdD4=").is_none());
        assert!(parse_data_image_uri("data:image/png;base64,TVqQAAMAAAAEAAAA").is_none());
    }

    #[test]
    fn build_watch_args_covers_flags_and_custom_output() {
        let rule = WatchRule {
            id: "w1".to_string(),
            folder: r"D:\Inbox".to_string(),
            target_format: "pdf".to_string(),
            preset_id: None,
            output_folder: r"D:\Out".to_string(),
            recursive: true,
            move_originals: true,
            keep_dates: true,
            enabled: true,
        };
        assert_eq!(
            build_watch_args(&rule),
            vec![
                "watch",
                r"D:\Inbox",
                "--to",
                "pdf",
                "-o",
                r"D:\Out",
                "-r",
                "--move-originals",
                "--keep-dates",
                "--json",
            ]
        );

        let preset_rule = WatchRule {
            id: "w2".to_string(),
            folder: r"D:\Photos".to_string(),
            target_format: "*".to_string(),
            preset_id: Some("compress-image".to_string()),
            output_folder: String::new(),
            recursive: false,
            move_originals: false,
            keep_dates: false,
            enabled: true,
        };
        assert_eq!(
            build_watch_args(&preset_rule),
            vec![
                "watch",
                r"D:\Photos",
                "--preset",
                "compress-image",
                "--json",
            ]
        );
    }

    #[test]
    fn parse_watch_stdout_line_parses_started_file_stopped() {
        assert_eq!(
            parse_watch_stdout_line(
                r#"{"event":"started","folder":"D:\\Inbox","preset":"PDF","target":"pdf","outputFolder":"D:\\Out"}"#
            ),
            Some(WatchStdoutEvent::Started {
                folder: r"D:\Inbox".to_string(),
                target: "pdf".to_string(),
                output_folder: r"D:\Out".to_string(),
            })
        );
        assert_eq!(
            parse_watch_stdout_line(
                r#"{"event":"file","source":"a.png","outputs":["a.pdf"],"state":"Done"}"#
            ),
            Some(WatchStdoutEvent::FileDone(ConvertedFileItem {
                source: "a.png".to_string(),
                state: "Done".to_string(),
                outputs: vec!["a.pdf".to_string()],
                error: None,
                error_key: None,
                missing_engine: None,
            }))
        );
        assert_eq!(
            parse_watch_stdout_line(r#"{"event":"stopped"}"#),
            Some(WatchStdoutEvent::Stopped)
        );
        assert_eq!(parse_watch_stdout_line("Watching D:\\Inbox..."), None);
        assert_eq!(parse_watch_stdout_line("   "), None);
        assert_eq!(parse_watch_stdout_line("{not-json"), None);
    }

    #[test]
    fn parse_convert_cli_args_extracts_paths_after_flag() {
        assert_eq!(
            parse_convert_cli_args(vec![
                "Zenith.exe".to_string(),
                "--convert".to_string(),
                r"C:\a.png".to_string(),
                r"D:\b.docx".to_string(),
            ]),
            vec![r"C:\a.png".to_string(), r"D:\b.docx".to_string()]
        );
        assert_eq!(
            parse_convert_cli_args(vec![
                "Zenith.exe".to_string(),
                "--convert".to_string(),
                "".to_string(),
                "--self-flag".to_string(),
                r"C:\c.webp".to_string(),
            ]),
            vec![r"C:\c.webp".to_string()]
        );
        assert!(parse_convert_cli_args(vec!["Zenith.exe".to_string()]).is_empty());
    }

    #[test]
    fn build_watch_args_for_spawn_resolves_custom_preset_and_overrides() {
        let custom_preset = ConverterPresetConfig {
            id: "custom-1700000".to_string(),
            name: "WebP 75".to_string(),
            target_format: ".WEBP".to_string(),
            quality: Some(75),
            pages: Some("1-3".to_string()),
            split_every: None,
            split_parts: None,
            conflict: Some("overwrite".to_string()),
            keep_dates: Some(true),
            zip: Some(true),
            iso_filesystem: None,
            iso_label: None,
        };
        let rule = WatchRule {
            id: "w-custom".to_string(),
            folder: r"D:\Drop".to_string(),
            target_format: "webp".to_string(),
            preset_id: Some("custom-1700000".to_string()),
            output_folder: r"D:\DropOut".to_string(),
            recursive: true,
            move_originals: false,
            keep_dates: false,
            enabled: true,
        };
        assert_eq!(
            build_watch_args_for_spawn(&rule, &[custom_preset]),
            vec![
                "watch",
                r"D:\Drop",
                "--to",
                "webp",
                "-o",
                r"D:\DropOut",
                "-r",
                "-q",
                "75",
                "--pages",
                "1-3",
                "--overwrite",
                "--zip",
                "--keep-dates",
                "--json",
            ]
        );
    }

    #[test]
    fn parse_watch_stdout_line_handles_missing_engine_and_bom() {
        let line = "\u{feff}{\"event\":\"file\",\"source\":\"clip.mp4\",\"outputs\":[],\"state\":\"Failed\",\"error\":\"No route\",\"errorKey\":\"error.no_route\",\"needsEngines\":[\"ffmpeg\"]}";
        assert_eq!(
            parse_watch_stdout_line(line),
            Some(WatchStdoutEvent::FileDone(ConvertedFileItem {
                source: "clip.mp4".to_string(),
                state: "Failed".to_string(),
                outputs: Vec::new(),
                error: Some("No route".to_string()),
                error_key: Some("error.no_route".to_string()),
                missing_engine: Some("ffmpeg".to_string()),
            }))
        );
    }

    #[test]
    fn parse_convert_cli_args_deduplicates_and_handles_case() {
        assert_eq!(
            parse_convert_cli_args(vec![
                "Zenith.exe".to_string(),
                "--CONVERT".to_string(),
                r"C:\photo.png".to_string(),
                r"C:\photo.png".to_string(),
                "-h".to_string(),
                r"D:\Docs".to_string(),
            ]),
            vec![r"C:\photo.png".to_string(), r"D:\Docs".to_string()]
        );
    }
}
