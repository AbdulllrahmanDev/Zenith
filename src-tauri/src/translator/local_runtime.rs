use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::TcpListener;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::config::{
    translator_models_dir, translator_runtime_dir, LLAMA_RUNTIME_APPROX_MB,
    LLAMA_RUNTIME_ZIP_URL, LOCAL_MODEL_APPROX_MB, LOCAL_MODEL_FILENAME, LOCAL_MODEL_URL,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MIN_VALID_MODEL_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDownloadStatus {
    pub model_downloaded: bool,
    pub runtime_ready: bool,
    pub ready: bool,
    pub downloading: bool,
    pub percent: u8,
    pub downloaded_mb: f64,
    pub total_mb: f64,
    pub phase: String,
    pub error: Option<String>,
}

struct ServerState {
    child: Child,
    port: u16,
    model_path: PathBuf,
}

static SERVER_PROC: OnceLock<Mutex<Option<ServerState>>> = OnceLock::new();
static DOWNLOAD_STATE: OnceLock<Mutex<LocalDownloadStatus>> = OnceLock::new();
static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

fn server_mutex() -> &'static Mutex<Option<ServerState>> {
    SERVER_PROC.get_or_init(|| Mutex::new(None))
}

fn download_mutex() -> &'static Mutex<LocalDownloadStatus> {
    DOWNLOAD_STATE.get_or_init(|| {
        Mutex::new(LocalDownloadStatus {
            model_downloaded: false,
            runtime_ready: false,
            ready: false,
            downloading: false,
            percent: 0,
            downloaded_mb: 0.0,
            total_mb: LOCAL_MODEL_APPROX_MB + LLAMA_RUNTIME_APPROX_MB,
            phase: "idle".to_string(),
            error: None,
        })
    })
}

pub fn resolve_model_path(app: &AppHandle) -> Option<PathBuf> {
    let zenith_path = translator_models_dir(app).join(LOCAL_MODEL_FILENAME);
    if is_valid_file(&zenith_path, MIN_VALID_MODEL_BYTES) {
        return Some(zenith_path);
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let legacy = PathBuf::from(appdata)
            .join("AntigravityTranslator")
            .join("models")
            .join(LOCAL_MODEL_FILENAME);
        if is_valid_file(&legacy, MIN_VALID_MODEL_BYTES) {
            return Some(legacy);
        }
    }
    None
}

pub fn runtime_server_exe(app: &AppHandle) -> PathBuf {
    translator_runtime_dir(app).join("llama-server.exe")
}

pub fn is_runtime_ready(app: &AppHandle) -> bool {
    let dir = translator_runtime_dir(app);
    dir.join("llama-server.exe").is_file()
        && dir.join("llama.dll").is_file()
        && dir.join("ggml.dll").is_file()
        && dir.join("ggml-base.dll").is_file()
}

fn is_valid_file(path: &Path, min_bytes: u64) -> bool {
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.len() >= min_bytes)
        .unwrap_or(false)
}

pub fn get_local_status(app: &AppHandle) -> LocalDownloadStatus {
    let model_downloaded = resolve_model_path(app).is_some();
    let runtime_ready = is_runtime_ready(app);
    let ready = model_downloaded && runtime_ready;

    let mut snap = download_mutex()
        .lock()
        .map(|g| g.clone())
        .unwrap_or(LocalDownloadStatus {
            model_downloaded,
            runtime_ready,
            ready,
            downloading: false,
            percent: if ready { 100 } else { 0 },
            downloaded_mb: 0.0,
            total_mb: LOCAL_MODEL_APPROX_MB + LLAMA_RUNTIME_APPROX_MB,
            phase: if ready { "ready" } else { "idle" }.to_string(),
            error: None,
        });

    snap.model_downloaded = model_downloaded;
    snap.runtime_ready = runtime_ready;
    snap.ready = ready;
    if !snap.downloading && snap.error.is_none() {
        snap.phase = if ready {
            "ready".to_string()
        } else {
            "idle".to_string()
        };
        if ready {
            snap.percent = 100;
        }
    }
    snap
}

fn update_and_emit(app: &AppHandle, updater: impl FnOnce(&mut LocalDownloadStatus)) {
    if let Ok(mut guard) = download_mutex().lock() {
        updater(&mut guard);
        let snap = guard.clone();
        let _ = app.emit("translator-download-progress", snap);
    }
}

pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

pub async fn download_model_and_runtime(app: AppHandle) -> Result<(), String> {
    {
        let mut guard = download_mutex()
            .lock()
            .map_err(|_| "Download state lock poisoned".to_string())?;
        if guard.downloading {
            return Ok(());
        }
        CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
        guard.downloading = true;
        guard.percent = 0;
        guard.downloaded_mb = 0.0;
        guard.error = None;
        guard.phase = "runtime".to_string();
    }

    let result = run_unified_download(&app).await;

    let model_ok = resolve_model_path(&app).is_some();
    let runtime_ok = is_runtime_ready(&app);
    match &result {
        Ok(()) => {
            update_and_emit(&app, |s| {
                s.downloading = false;
                s.model_downloaded = model_ok;
                s.runtime_ready = runtime_ok;
                s.ready = model_ok && runtime_ok;
                s.percent = if s.ready { 100 } else { s.percent };
                s.phase = if s.ready {
                    "ready".to_string()
                } else {
                    "idle".to_string()
                };
                s.error = None;
            });
        }
        Err(err) => {
            update_and_emit(&app, |s| {
                s.downloading = false;
                s.model_downloaded = model_ok;
                s.runtime_ready = runtime_ok;
                s.ready = model_ok && runtime_ok;
                s.phase = "error".to_string();
                s.error = Some(err.clone());
            });
        }
    }

    result
}

async fn run_unified_download(app: &AppHandle) -> Result<(), String> {
    let need_runtime = !is_runtime_ready(app);
    let need_model = resolve_model_path(app).is_none();

    if !need_runtime && !need_model {
        return Ok(());
    }

    let est_runtime_bytes: u64 = if need_runtime {
        (LLAMA_RUNTIME_APPROX_MB * 1024.0 * 1024.0) as u64
    } else {
        0
    };
    let est_model_bytes: u64 = if need_model {
        (LOCAL_MODEL_APPROX_MB * 1024.0 * 1024.0) as u64
    } else {
        0
    };

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .user_agent("Zenith-Translator/1.0")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut total_expected = est_runtime_bytes + est_model_bytes;
    let mut completed_bytes_offset: u64 = 0;

    if need_runtime {
        let runtime_dir = translator_runtime_dir(app);
        std::fs::create_dir_all(&runtime_dir)
            .map_err(|e| format!("Cannot create runtime folder: {e}"))?;
        let zip_part = runtime_dir.join("llama-runtime.zip.part");

        update_and_emit(app, |s| {
            s.phase = "runtime".to_string();
            s.total_mb = total_expected as f64 / (1024.0 * 1024.0);
        });

        let actual_rt = stream_url_to_file(
            &client,
            LLAMA_RUNTIME_ZIP_URL,
            &zip_part,
            |downloaded, content_len| {
                if let Some(len) = content_len {
                    total_expected = len + est_model_bytes;
                }
                let combined = downloaded;
                let pct = ((combined as f64 / total_expected.max(1) as f64) * 100.0)
                    .clamp(0.0, 99.0) as u8;
                update_and_emit(app, |s| {
                    s.phase = "runtime".to_string();
                    s.downloaded_mb = combined as f64 / (1024.0 * 1024.0);
                    s.total_mb = total_expected as f64 / (1024.0 * 1024.0);
                    s.percent = pct;
                });
            },
        )
        .await?;

        completed_bytes_offset = actual_rt;
        total_expected = actual_rt + est_model_bytes;

        update_and_emit(app, |s| {
            s.phase = "extract".to_string();
        });

        let runtime_dir_clone = runtime_dir.clone();
        let zip_path_clone = zip_part.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            extract_runtime_zip(&zip_path_clone, &runtime_dir_clone)?;
            let _ = std::fs::remove_file(&zip_path_clone);
            Ok(())
        })
        .await
        .map_err(|e| format!("Extract join error: {e}"))??;
    }

    if need_model {
        let models_dir = translator_models_dir(app);
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("Cannot create models folder: {e}"))?;
        let model_part = models_dir.join(format!("{LOCAL_MODEL_FILENAME}.part"));
        let model_final = models_dir.join(LOCAL_MODEL_FILENAME);

        update_and_emit(app, |s| {
            s.phase = "model".to_string();
        });

        stream_url_to_file(
            &client,
            LOCAL_MODEL_URL,
            &model_part,
            |downloaded, content_len| {
                if let Some(len) = content_len {
                    total_expected = completed_bytes_offset + len;
                }
                let combined = completed_bytes_offset + downloaded;
                let pct = ((combined as f64 / total_expected.max(1) as f64) * 100.0)
                    .clamp(0.0, 99.0) as u8;
                update_and_emit(app, |s| {
                    s.phase = "model".to_string();
                    s.downloaded_mb = combined as f64 / (1024.0 * 1024.0);
                    s.total_mb = total_expected as f64 / (1024.0 * 1024.0);
                    s.percent = pct;
                });
            },
        )
        .await?;

        if model_final.exists() {
            let _ = std::fs::remove_file(&model_final);
        }
        std::fs::rename(&model_part, &model_final)
            .map_err(|e| format!("Failed to finalize model file: {e}"))?;
    }

    Ok(())
}

async fn stream_url_to_file<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    mut on_progress: F,
) -> Result<u64, String>
where
    F: FnMut(u64, Option<u64>),
{
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error {}", resp.status()));
    }

    let content_len = resp.content_length();
    let mut file =
        std::fs::File::create(dest).map_err(|e| format!("File create failed: {e}"))?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(dest);
            return Err("Download cancelled".to_string());
        }
        let bytes = chunk.map_err(|e| format!("Stream read failed: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("Disk write failed: {e}"))?;
        downloaded += bytes.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(120) {
            on_progress(downloaded, content_len);
            last_emit = Instant::now();
        }
    }

    file.flush()
        .map_err(|e| format!("Disk flush failed: {e}"))?;
    on_progress(downloaded, content_len);
    Ok(downloaded)
}

fn extract_runtime_zip(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("Open zip failed: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid runtime zip: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry read failed: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = Path::new(entry.name())
            .file_name()
            .and_then(|n| n.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        let lower = name.to_ascii_lowercase();
        let needed = lower == "llama-server.exe" || lower.ends_with(".dll");
        if !needed {
            continue;
        }
        let dst = out_dir.join(&name);
        let mut out_file =
            std::fs::File::create(&dst).map_err(|e| format!("Write {name} failed: {e}"))?;
        std::io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("Extract {name} failed: {e}"))?;
    }
    Ok(())
}

pub fn delete_local_model(app: &AppHandle) -> Result<(), String> {
    stop_local_server();
    let zenith_model = translator_models_dir(app).join(LOCAL_MODEL_FILENAME);
    if zenith_model.exists() {
        std::fs::remove_file(&zenith_model)
            .map_err(|e| format!("Failed to delete model: {e}"))?;
    }
    let part = translator_models_dir(app).join(format!("{LOCAL_MODEL_FILENAME}.part"));
    if part.exists() {
        let _ = std::fs::remove_file(&part);
    }
    update_and_emit(app, |s| {
        s.downloading = false;
        s.model_downloaded = resolve_model_path(app).is_some();
        s.runtime_ready = is_runtime_ready(app);
        s.ready = s.model_downloaded && s.runtime_ready;
        s.percent = if s.ready { 100 } else { 0 };
        s.phase = if s.ready {
            "ready".to_string()
        } else {
            "idle".to_string()
        };
        s.error = None;
    });
    Ok(())
}

pub fn stop_local_server() {
    if let Ok(mut guard) = server_mutex().lock() {
        if let Some(mut st) = guard.take() {
            let _ = st.child.kill();
            let _ = st.child.wait();
        }
    }
}

fn find_free_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Port bind failed: {e}"))?;
    listener
        .local_addr()
        .map(|a| a.port())
        .map_err(|e| format!("Port read failed: {e}"))
}

pub async fn ensure_server_running(app: &AppHandle) -> Result<u16, String> {
    if !is_runtime_ready(app) {
        return Err(
            "أدوات تشغيل الموديل المحلي غير مثبتة بعد — اضغط «تحميل الموديل والأدوات» في إعدادات المترجم"
                .to_string(),
        );
    }
    let model_path = resolve_model_path(app).ok_or_else(|| {
        "الموديل المحلي غير محمل بعد — اضغط «تحميل الموديل والأدوات» في إعدادات المترجم"
            .to_string()
    })?;

    if let Ok(mut guard) = server_mutex().lock() {
        if let Some(st) = guard.as_mut() {
            let still_alive = st.child.try_wait().ok().flatten().is_none();
            if still_alive && st.model_path == model_path {
                return Ok(st.port);
            }
            let _ = st.child.kill();
            let _ = st.child.wait();
            *guard = None;
        }
    }

    let port = find_free_port()?;
    let exe = runtime_server_exe(app);
    let runtime_dir = translator_runtime_dir(app);
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().saturating_sub(1).clamp(1, 6))
        .unwrap_or(2);

    let child = Command::new(&exe)
        .current_dir(&runtime_dir)
        .args([
            "-m",
            &model_path.to_string_lossy(),
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "-c",
            "2048",
            "-t",
            &threads.to_string(),
            "--no-webui",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("تعذر تشغيل خادم الموديل المحلي (llama-server): {e}"))?;

    if let Ok(mut guard) = server_mutex().lock() {
        *guard = Some(ServerState {
            child,
            port,
            model_path,
        });
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let health_url = format!("http://127.0.0.1:{port}/health");
    let start = Instant::now();

    while start.elapsed() < Duration::from_secs(45) {
        if let Ok(mut guard) = server_mutex().lock() {
            if let Some(st) = guard.as_mut() {
                if let Ok(Some(status)) = st.child.try_wait() {
                    *guard = None;
                    return Err(format!(
                        "توقف محرك الموديل المحلي بشكل غير متوقع (رمز الخروج: {status})"
                    ));
                }
            }
        }
        if let Ok(resp) = client.get(&health_url).send().await {
            if resp.status().is_success() {
                return Ok(port);
            }
        }
        tokio::time::sleep(Duration::from_millis(220)).await;
    }

    stop_local_server();
    Err("انتهت مهلة بدء تشغيل الموديل المحلي".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalChatMessage {
    pub role: String,
    pub content: String,
}

pub async fn run_local_chat(
    app: &AppHandle,
    messages: Vec<LocalChatMessage>,
    max_tokens: u32,
    temperature: f32,
) -> Result<String, String> {
    let port = ensure_server_running(app).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let payload = serde_json::json!({
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": false
    });

    let resp = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("فشل الاتصال بالمحرك المحلي: {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("خطأ من المحرك المحلي ({code}): {body}"));
    }

    let val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("استجابة JSON غير صالحة من المحرك المحلي: {e}"))?;

    val["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "عاد المحرك المحلي برد فارغ".to_string())
}
