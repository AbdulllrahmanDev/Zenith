use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::watch;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_STDERR_TAIL_LINES: usize = 20;
const MAX_STDERR_LINE_BYTES: usize = 64 * 1024;
const MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024;

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

struct ActiveJobState {
    pid: Option<u32>,
    cancelled: bool,
    cancel_tx: watch::Sender<bool>,
}

static ACTIVE_CONVERTER_JOBS: OnceLock<Mutex<HashMap<String, ActiveJobState>>> = OnceLock::new();

fn active_jobs_map() -> &'static Mutex<HashMap<String, ActiveJobState>> {
    ACTIVE_CONVERTER_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
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

#[allow(dead_code)]
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
}
