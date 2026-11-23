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
    pub overwrite: Option<bool>,
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

    if req.overwrite == Some(true) {
        args.push("--overwrite".to_string());
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
    let args = build_convert_args(&req, &paths);
    let std_cmd = build_cli_command(&paths.cli_exe, &args, &paths);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("CLI_SPAWN_FAILED: {e}"))?;
    let pid = child.id();

    if !attach_job_pid(&req.job_id, pid) {
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
    let job_id_for_stderr = req.job_id.clone();
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
                            emit_converter_event(&app_for_stderr, &job_id_for_stderr, &event);
                            if let CliEvent::FileDone {
                                source,
                                outputs,
                                state,
                                error,
                                error_key,
                                missing_engine: file_missing,
                            } = event
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
        let cancel_fut = std::pin::pin!(wait_for_cancel(&mut cancel_rx));
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
        let cancel_fut = std::pin::pin!(wait_for_cancel(&mut cancel_rx));
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

    let files = match parse_cli_stdout_json(&stdout_bytes) {
        Some(parsed) if !parsed.is_empty() => parsed,
        _ => stderr_files,
    };

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

    map_cli_exit_code(status.code(), missing_engine.as_deref(), &detail_tail)?;

    Ok(ConvertJobResult {
        job_id: req.job_id,
        files,
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
        Ok(status) => Ok(status),
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

struct ConverterTargetStore(
    #[allow(dead_code)] Vec<isize>,
    #[allow(dead_code)] Vec<windows::Win32::System::Ole::IDropTarget>,
);
unsafe impl Send for ConverterTargetStore {}

static CONVERTER_DROP_TARGETS: Mutex<Option<ConverterTargetStore>> = Mutex::new(None);
static CF_INETURL_W: OnceLock<u16> = OnceLock::new();
static CF_INETURL_A: OnceLock<u16> = OnceLock::new();

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

struct ConverterDragPayload {
    paths: Vec<String>,
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

    unsafe fn extract_hglobal_utf16(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
    ) -> Option<String> {
        let bytes = Self::read_hglobal_bytes(data, cf, MAX_URL_UNITS * 2)?;
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

    unsafe fn extract_hglobal_ansi(
        data: &windows::Win32::System::Com::IDataObject,
        cf: u16,
    ) -> Option<String> {
        let bytes = Self::read_hglobal_bytes(data, cf, MAX_URL_UNITS)?;
        let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
        (end > 0).then(|| String::from_utf8_lossy(&bytes[..end]).into_owned())
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
        data: &windows::Win32::System::Com::IDataObject,
    ) -> (Vec<String>, Vec<String>) {
        let paths = Self::extract_files(data);
        let urls = Self::extract_urls(data);
        (paths, urls)
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

        let (paths, urls) = pdata
            .as_ref()
            .map(|data| unsafe { ConverterDropTarget::extract_payload(data) })
            .unwrap_or_default();

        if paths.is_empty() && urls.is_empty() {
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
        let is_browser_drag = CONVERTER_DRAG_IS_BROWSER.load(Ordering::Relaxed)
            || (paths.is_empty() && !urls.is_empty());

        unsafe {
            *self.enter_valid.get() = true;
            *self.cursor_effect.get() = DROPEFFECT_COPY;
            *self.last_css_pos.get() = Some((x, y));
            *self.cached_payload.get() = Some(ConverterDragPayload {
                paths: paths.clone(),
                urls: urls.clone(),
                is_browser_drag,
            });
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
                "paths": paths,
                "urls": urls,
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
        let (mut paths, mut urls) = pdata
            .as_ref()
            .map(|data| unsafe { ConverterDropTarget::extract_payload(data) })
            .unwrap_or_default();

        let is_browser_drag = if paths.is_empty() && urls.is_empty() {
            if let Some(cached_payload) = cached {
                paths = cached_payload.paths;
                urls = cached_payload.urls;
                cached_payload.is_browser_drag
            } else {
                CONVERTER_DRAG_IS_BROWSER.load(Ordering::Relaxed)
            }
        } else {
            CONVERTER_DRAG_IS_BROWSER.load(Ordering::Relaxed)
                || (paths.is_empty() && !urls.is_empty())
        };

        if paths.is_empty() && urls.is_empty() {
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
            overwrite: Some(true),
            keep_dates: Some(true),
            zip: Some(true),
            iso_filesystem: None,
            iso_label: None,
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
            overwrite: Some(false),
            keep_dates: None,
            zip: None,
            iso_filesystem: Some("udf201".to_string()),
            iso_label: Some("MY_DISC".to_string()),
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
            overwrite: None,
            keep_dates: None,
            zip: None,
            iso_filesystem: None,
            iso_label: None,
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
}
