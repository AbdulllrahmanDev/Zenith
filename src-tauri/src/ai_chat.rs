use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::translator::config::TranslatorConfig;
use crate::translator::engine::{
    resolve_chat_config, run_chat_completion, ChatTurnAttachmentImage, ChatTurnMessage,
};
use crate::translator::ocr::extract_raw_ocr_lines_from_rgba;

pub const MAX_EXTRACTED_CHARS: usize = 24_000;
const MAX_PDF_PAGES: u32 = 10;
const MAX_TEXT_READ_BYTES: u64 = 512 * 1024;
const MAX_IMAGE_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_OFFICE_ENTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_HISTORY_TURNS: usize = 24;
const MAX_IMAGE_DIM: u32 = 8192;
const MAX_IMAGE_DECODE_ALLOC: u64 = 256 * 1024 * 1024;

static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static CHAT_EXEC: OnceLock<Mutex<(u64, bool)>> = OnceLock::new();

fn store_mutex() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

fn chat_exec_mutex() -> &'static Mutex<(u64, bool)> {
    CHAT_EXEC.get_or_init(|| Mutex::new((0, false)))
}

fn is_busy() -> bool {
    chat_exec_mutex()
        .lock()
        .map(|g| g.1)
        .unwrap_or(false)
}

fn start_generation() -> u64 {
    let mut g = chat_exec_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.0 += 1;
    g.1 = true;
    g.0
}

fn cancel_generation() -> u64 {
    let mut g = chat_exec_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.0 += 1;
    g.1 = false;
    g.0
}

fn finish_generation_if_current(my_gen: u64) -> bool {
    let mut g = chat_exec_mutex().lock().unwrap_or_else(|e| e.into_inner());
    if g.0 != my_gen {
        return false;
    }
    g.1 = false;
    true
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn next_id(prefix: &str) -> String {
    static SEQ: AtomicU64 = AtomicU64::new(1);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{n}", now_ms())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatAttachment {
    pub id: String,
    pub name: String,
    /// "image" | "text"
    pub kind: String,
    pub mime: String,
    #[serde(default)]
    pub preview_data_url: Option<String>,
    #[serde(default)]
    pub image_base64: Option<String>,
    #[serde(default)]
    pub extracted_text: Option<String>,
    #[serde(default)]
    pub char_count: usize,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    /// "user" | "assistant" | "error"
    pub role: String,
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<ChatAttachment>,
    pub created_at: i64,
    #[serde(default)]
    pub provider_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatConversation {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AiChatStoreData {
    #[serde(default)]
    conversations: Vec<ChatConversation>,
    #[serde(default)]
    active_conversation_id: Option<String>,
    #[serde(default)]
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatSnapshot {
    pub conversations: Vec<ChatConversation>,
    pub active_conversation_id: Option<String>,
    pub busy: bool,
    pub last_error: Option<String>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ai_chats.json"))
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

fn load_store(app: &AppHandle) -> AiChatStoreData {
    let _guard = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(path) = store_path(app) else {
        return AiChatStoreData::default();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return AiChatStoreData::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn mutate_store<F, R>(app: &AppHandle, f: F) -> Result<(R, AiChatStoreData), String>
where
    F: FnOnce(&mut AiChatStoreData) -> R,
{
    let _guard = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let path = store_path(app)?;
    let mut store: AiChatStoreData = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let res = f(&mut store);
    write_json_atomic(&path, &store)?;
    Ok((res, store))
}

fn snapshot_from_store(mut store: AiChatStoreData) -> AiChatSnapshot {
    store
        .conversations
        .sort_by_key(|c| std::cmp::Reverse(c.updated_at));
    let active_id = store
        .active_conversation_id
        .filter(|id| store.conversations.iter().any(|c| &c.id == id))
        .or_else(|| store.conversations.first().map(|c| c.id.clone()));

    AiChatSnapshot {
        conversations: store.conversations,
        active_conversation_id: active_id,
        busy: is_busy(),
        last_error: store.last_error,
    }
}

fn emit_snapshot(app: &AppHandle, store: AiChatStoreData) -> AiChatSnapshot {
    let snap = snapshot_from_store(store);
    let _ = app.emit("ai-chat-updated", snap.clone());
    snap
}

pub fn get_state(app: &AppHandle) -> AiChatSnapshot {
    snapshot_from_store(load_store(app))
}

pub fn new_conversation(app: &AppHandle) -> Result<AiChatSnapshot, String> {
    cancel_generation();
    let ts = now_ms();
    let id = next_id("chat");
    let (_, store) = mutate_store(app, |s| {
        s.last_error = None;
        s.conversations.insert(
            0,
            ChatConversation {
                id: id.clone(),
                title: String::new(),
                created_at: ts,
                updated_at: ts,
                messages: Vec::new(),
            },
        );
        s.active_conversation_id = Some(id);
    })?;
    Ok(emit_snapshot(app, store))
}

pub fn select_conversation(app: &AppHandle, id: String) -> Result<AiChatSnapshot, String> {
    cancel_generation();
    let (_, store) = mutate_store(app, |s| {
        s.last_error = None;
        if s.conversations.iter().any(|c| c.id == id) {
            s.active_conversation_id = Some(id);
        }
    })?;
    Ok(emit_snapshot(app, store))
}

pub fn delete_conversation(app: &AppHandle, id: String) -> Result<AiChatSnapshot, String> {
    cancel_generation();
    let (_, store) = mutate_store(app, |s| {
        s.conversations.retain(|c| c.id != id);
        if s.active_conversation_id.as_deref() == Some(id.as_str()) {
            s.active_conversation_id = s.conversations.first().map(|c| c.id.clone());
        }
    })?;
    Ok(emit_snapshot(app, store))
}

pub fn cancel(app: &AppHandle) -> AiChatSnapshot {
    cancel_generation();
    emit_snapshot(app, load_store(app))
}

// ============================================================================
// Text, Office, PDF, and Image Extraction
// ============================================================================

pub fn truncate_extracted_text(text: &str) -> (String, bool) {
    let count = text.chars().count();
    if count <= MAX_EXTRACTED_CHARS {
        (text.to_string(), false)
    } else {
        (text.chars().take(MAX_EXTRACTED_CHARS).collect(), true)
    }
}

pub fn looks_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

pub fn derive_conversation_title(text: &str, attachments: &[ChatAttachment]) -> String {
    let trimmed = text.trim();
    if !trimmed.is_empty() {
        let single_line = trimmed.lines().next().unwrap_or(trimmed).trim();
        let clipped: String = single_line.chars().take(48).collect();
        return clipped;
    }
    if let Some(first) = attachments.first() {
        return first.name.chars().take(48).collect();
    }
    "New Chat".to_string()
}

pub fn compose_user_turn_text(
    text: &str,
    attachments: &[ChatAttachment],
    include_image_ocr_fallback: bool,
) -> String {
    let mut blocks = Vec::new();
    for att in attachments {
        if att.error.is_some() {
            continue;
        }
        if att.kind == "text" {
            if let Some(body) = &att.extracted_text {
                if !body.trim().is_empty() {
                    let note = if att.truncated { " (truncated)" } else { "" };
                    blocks.push(format!("[File: {}{}]\n{}", att.name, note, body));
                }
            }
        } else if att.kind == "image" && include_image_ocr_fallback {
            if let Some(ocr) = &att.extracted_text {
                if !ocr.trim().is_empty() {
                    blocks.push(format!("[Image text OCR: {}]\n{}", att.name, ocr));
                }
            }
        }
    }
    let user_msg = text.trim();
    if blocks.is_empty() {
        user_msg.to_string()
    } else if user_msg.is_empty() {
        blocks.join("\n\n")
    } else {
        format!("{}\n\n{}", blocks.join("\n\n"), user_msg)
    }
}

fn unescape_xml(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn extract_xml_text(xml: &str) -> String {
    const PARAGRAPH_ENDS: &[&str] = &[
        "</w:p>",
        "</a:p>",
        "</text:p>",
        "</text:h>",
        "</si>",
        "</row>",
        "</t>",
    ];
    let mut out = String::new();
    let mut rest = xml;
    while let Some(start) = rest.find('<') {
        out.push_str(&unescape_xml(&rest[..start]));
        let Some(end) = rest[start..].find('>') else {
            break;
        };
        let tag = &rest[start..start + end + 1];
        if PARAGRAPH_ENDS.contains(&tag) {
            out.push('\n');
        }
        rest = &rest[start + end + 1..];
        if out.len() > MAX_EXTRACTED_CHARS * 4 {
            break;
        }
    }
    out
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn read_zip_entry(archive: &mut zip::ZipArchive<impl Read + std::io::Seek>, name: &str) -> Option<String> {
    let entry = archive.by_name(name).ok()?;
    if entry.size() > MAX_OFFICE_ENTRY_BYTES {
        return None;
    }
    let mut bytes = Vec::new();
    entry.take(MAX_OFFICE_ENTRY_BYTES).read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).to_string())
}

fn trailing_number_sort_key(name: &str) -> (u32, &str) {
    let digits: String = name
        .rsplit('/')
        .next()
        .unwrap_or(name)
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    (digits.parse::<u32>().unwrap_or(u32::MAX), name)
}

pub fn extract_office_text_from_reader<R: Read + std::io::Seek>(
    reader: R,
    ext: &str,
) -> Result<String, String> {
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|_| "Could not open Office document archive.".to_string())?;
    let mut parts = Vec::new();
    match ext {
        "docx" | "docm" | "dotx" => {
            if let Some(xml) = read_zip_entry(&mut archive, "word/document.xml") {
                parts.push(extract_xml_text(&xml));
            }
        }
        "pptx" | "pptm" => {
            let mut slides: Vec<String> = (0..archive.len())
                .filter_map(|i| {
                    let name = archive.by_index(i).ok()?.name().to_string();
                    if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect();
            slides.sort_by(|a, b| trailing_number_sort_key(a).cmp(&trailing_number_sort_key(b)));
            for s in slides.into_iter().take(40) {
                if let Some(xml) = read_zip_entry(&mut archive, &s) {
                    let t = extract_xml_text(&xml);
                    if !t.is_empty() {
                        parts.push(t);
                    }
                }
            }
        }
        "xlsx" | "xlsm" => {
            if let Some(xml) = read_zip_entry(&mut archive, "xl/sharedStrings.xml") {
                let t = extract_xml_text(&xml);
                if !t.is_empty() {
                    parts.push(t);
                }
            }
            let mut sheets: Vec<String> = (0..archive.len())
                .filter_map(|i| {
                    let name = archive.by_index(i).ok()?.name().to_string();
                    if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect();
            sheets.sort_by(|a, b| trailing_number_sort_key(a).cmp(&trailing_number_sort_key(b)));
            for sh in sheets.into_iter().take(10) {
                if let Some(xml) = read_zip_entry(&mut archive, &sh) {
                    let t = extract_xml_text(&xml);
                    if !t.is_empty() {
                        parts.push(t);
                    }
                }
            }
        }
        "odt" | "ods" | "odp" => {
            if let Some(xml) = read_zip_entry(&mut archive, "content.xml") {
                parts.push(extract_xml_text(&xml));
            }
        }
        _ => return Err("Unsupported Office document format.".to_string()),
    }
    let joined = parts.join("\n\n").trim().to_string();
    if joined.is_empty() {
        Err("No readable text found inside document.".to_string())
    } else {
        Ok(joined)
    }
}

fn extract_pdf_text(path: &str) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Data::Pdf::{PdfDocument, PdfPageRenderOptions};
    use windows::Storage::StorageFile;
    use windows::Storage::Streams::{DataReader, InMemoryRandomAccessStream};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    let com_ok = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    struct Guard(bool);
    impl Drop for Guard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }
    let _guard = Guard(com_ok);

    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
        .and_then(|op| op.get())
        .map_err(|_| "Could not open PDF file.".to_string())?;
    let document = PdfDocument::LoadFromFileAsync(&file)
        .and_then(|op| op.get())
        .map_err(|_| "Could not read PDF (it may be encrypted or damaged).".to_string())?;
    let count = document.PageCount().unwrap_or(0).min(MAX_PDF_PAGES);
    if count == 0 {
        return Err("PDF has no readable pages.".to_string());
    }

    let mut page_texts = Vec::new();
    let mut total_chars = 0usize;
    for idx in 0..count {
        if total_chars >= MAX_EXTRACTED_CHARS {
            break;
        }
        let Ok(page) = document.GetPage(idx) else {
            continue;
        };
        let Ok(options) = PdfPageRenderOptions::new() else {
            continue;
        };
        let _ = options.SetDestinationWidth(1200);
        let Ok(stream) = InMemoryRandomAccessStream::new() else {
            continue;
        };
        if page
            .RenderWithOptionsToStreamAsync(&stream, &options)
            .and_then(|op| op.get())
            .is_err()
        {
            continue;
        }
        let size = stream.Size().unwrap_or(0) as u32;
        if size == 0 {
            continue;
        }
        let Ok(input) = stream.GetInputStreamAt(0) else {
            continue;
        };
        let Ok(reader) = DataReader::CreateDataReader(&input) else {
            continue;
        };
        if reader.LoadAsync(size).and_then(|op| op.get()).is_err() {
            continue;
        }
        let mut png_bytes = vec![0u8; size as usize];
        if reader.ReadBytes(&mut png_bytes).is_err() {
            continue;
        }
        if let Ok(dyn_img) = image::load_from_memory(&png_bytes) {
            let rgba = dyn_img.to_rgba8();
            if let Ok(lines) = extract_raw_ocr_lines_from_rgba(&rgba, true) {
                let text = lines
                    .into_iter()
                    .map(|l| l.text.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n");
                if !text.is_empty() {
                    let block = format!("--- Page {} ---\n{}", idx + 1, text);
                    total_chars += block.chars().count();
                    page_texts.push(block);
                }
            }
        }
    }

    let joined = page_texts.join("\n\n");
    if joined.trim().is_empty() {
        Err("Could not extract text from this PDF.".to_string())
    } else {
        Ok(joined)
    }
}

fn ocr_image_base64(b64: &str) -> Option<String> {
    let bytes = BASE64.decode(b64).ok()?;
    let rgba = image::load_from_memory(&bytes).ok()?.to_rgba8();
    let lines = extract_raw_ocr_lines_from_rgba(&rgba, true).ok()?;
    let joined = lines
        .into_iter()
        .map(|l| l.text.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const OFFICE_EXTS: &[&str] = &[
    "docx", "docm", "dotx", "xlsx", "xlsm", "pptx", "pptm", "odt", "ods", "odp",
];

fn prepare_single_attachment(path_str: &str) -> ChatAttachment {
    let p = Path::new(path_str);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path_str)
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    let make_err = |msg: String| ChatAttachment {
        id: next_id("att"),
        name: name.clone(),
        kind: "text".to_string(),
        mime: "application/octet-stream".to_string(),
        preview_data_url: None,
        image_base64: None,
        extracted_text: None,
        char_count: 0,
        truncated: false,
        error: Some(msg),
    };

    let Ok(meta) = std::fs::metadata(p) else {
        return make_err("File not found.".to_string());
    };
    if !meta.is_file() {
        return make_err("Folders cannot be attached directly.".to_string());
    }

    if IMAGE_EXTS.contains(&ext.as_str()) {
        if meta.len() > MAX_IMAGE_FILE_BYTES {
            return make_err("Image exceeds 32 MB limit.".to_string());
        }
        let Ok(reader) = image::ImageReader::open(p) else {
            return make_err("Could not open image file.".to_string());
        };
        let Ok(mut guessed) = reader.with_guessed_format() else {
            return make_err("Unsupported image format.".to_string());
        };
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(MAX_IMAGE_DIM);
        limits.max_image_height = Some(MAX_IMAGE_DIM);
        limits.max_alloc = Some(MAX_IMAGE_DECODE_ALLOC);
        guessed.limits(limits);
        let Ok(decoded) = guessed.decode() else {
            return make_err("Could not decode image or image exceeds size limits.".to_string());
        };

        let resized = if decoded.width() > 1600 || decoded.height() > 1600 {
            decoded.resize(1600, 1600, image::imageops::FilterType::Lanczos3)
        } else {
            decoded.clone()
        };
        let mut png_full = Vec::new();
        if resized
            .write_to(&mut std::io::Cursor::new(&mut png_full), image::ImageFormat::Png)
            .is_err()
        {
            return make_err("Failed encoding image.".to_string());
        }

        let thumb = decoded.thumbnail(128, 128);
        let mut png_thumb = Vec::new();
        let preview_data_url = thumb
            .write_to(&mut std::io::Cursor::new(&mut png_thumb), image::ImageFormat::Png)
            .ok()
            .map(|_| format!("data:image/png;base64,{}", BASE64.encode(&png_thumb)));

        return ChatAttachment {
            id: next_id("att"),
            name,
            kind: "image".to_string(),
            mime: "image/png".to_string(),
            preview_data_url,
            image_base64: Some(BASE64.encode(&png_full)),
            extracted_text: None,
            char_count: 0,
            truncated: false,
            error: None,
        };
    }

    if ext == "pdf" {
        return match extract_pdf_text(path_str) {
            Ok(raw) => {
                let (clipped, truncated) = truncate_extracted_text(&raw);
                let char_count = clipped.chars().count();
                ChatAttachment {
                    id: next_id("att"),
                    name,
                    kind: "text".to_string(),
                    mime: "application/pdf".to_string(),
                    preview_data_url: None,
                    image_base64: None,
                    extracted_text: Some(clipped),
                    char_count,
                    truncated,
                    error: None,
                }
            }
            Err(e) => make_err(e),
        };
    }

    if OFFICE_EXTS.contains(&ext.as_str()) {
        let Ok(file) = std::fs::File::open(p) else {
            return make_err("Could not open document.".to_string());
        };
        return match extract_office_text_from_reader(file, &ext) {
            Ok(raw) => {
                let (clipped, truncated) = truncate_extracted_text(&raw);
                let char_count = clipped.chars().count();
                ChatAttachment {
                    id: next_id("att"),
                    name,
                    kind: "text".to_string(),
                    mime: "application/vnd.openxmlformats-officedocument".to_string(),
                    preview_data_url: None,
                    image_base64: None,
                    extracted_text: Some(clipped),
                    char_count,
                    truncated,
                    error: None,
                }
            }
            Err(e) => make_err(e),
        };
    }

    // Fallback: treat as UTF-8 text/code file unless binary
    let Ok(f) = std::fs::File::open(p) else {
        return make_err("Could not read file.".to_string());
    };
    let mut bytes = Vec::new();
    if f.take(MAX_TEXT_READ_BYTES).read_to_end(&mut bytes).is_err() {
        return make_err("Could not read file contents.".to_string());
    }
    if looks_binary(&bytes) {
        return make_err("Binary file format is not supported.".to_string());
    }
    let raw = String::from_utf8_lossy(&bytes)
        .trim_start_matches('\u{feff}')
        .to_string();
    let file_truncated = meta.len() > MAX_TEXT_READ_BYTES;
    let (clipped, char_truncated) = truncate_extracted_text(&raw);
    let char_count = clipped.chars().count();
    ChatAttachment {
        id: next_id("att"),
        name,
        kind: "text".to_string(),
        mime: "text/plain".to_string(),
        preview_data_url: None,
        image_base64: None,
        extracted_text: Some(clipped),
        char_count,
        truncated: file_truncated || char_truncated,
        error: None,
    }
}

pub async fn prepare_attachments(paths: Vec<String>) -> Vec<ChatAttachment> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .take(4)
            .map(|p| prepare_single_attachment(&p))
            .collect()
    })
    .await
    .unwrap_or_default()
}

fn validate_latest_turn_has_payload(
    text: &str,
    atts: &[ChatAttachment],
    is_local: bool,
) -> Result<(), String> {
    if is_local {
        let has_unreadable_image = atts.iter().any(|a| {
            a.kind == "image"
                && a.extracted_text
                    .as_deref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
        });
        if has_unreadable_image {
            return Err(
                "Local offline model cannot read images when OCR finds no text. Switch to Gemini/OpenAI or attach text/PDF."
                    .to_string(),
            );
        }
    }

    let composed = compose_user_turn_text(text, atts, is_local);
    let has_vision_image = !is_local && atts.iter().any(|a| a.kind == "image" && a.image_base64.is_some());
    if composed.trim().is_empty() && !has_vision_image {
        return Err("Enter a message or attach a file with readable content.".to_string());
    }
    Ok(())
}

pub async fn send_message(
    app: AppHandle,
    conversation_id: Option<String>,
    text: String,
    attachments: Vec<ChatAttachment>,
    provider_override: Option<String>,
) -> Result<AiChatSnapshot, String> {
    let valid_attachments: Vec<ChatAttachment> = attachments
        .into_iter()
        .filter(|a| a.error.is_none())
        .take(4)
        .collect();
    if text.trim().is_empty() && valid_attachments.is_empty() {
        return Err("Enter a message or attach a file.".to_string());
    }

    let base_cfg = TranslatorConfig::from_app(&app);
    let effective_cfg = resolve_chat_config(&base_cfg, provider_override.as_deref());
    let is_local = effective_cfg.engine == "local";

    // If sending images to a text-only local model, run OCR fallback on blocking pool first
    let prepared_for_send = if is_local && valid_attachments.iter().any(|a| a.kind == "image") {
        tauri::async_runtime::spawn_blocking(move || {
            valid_attachments
                .into_iter()
                .map(|mut a| {
                    if a.kind == "image" && a.extracted_text.is_none() {
                        if let Some(b64) = &a.image_base64 {
                            a.extracted_text = ocr_image_base64(b64);
                        }
                    }
                    a
                })
                .collect::<Vec<_>>()
        })
        .await
        .unwrap_or_default()
    } else {
        valid_attachments
    };

    validate_latest_turn_has_payload(&text, &prepared_for_send, is_local)?;

    // Strip heavy base64 payloads from persisted history; keep thumbnails & extracted text
    let persisted_attachments: Vec<ChatAttachment> = prepared_for_send
        .iter()
        .map(|a| {
            let mut copy = a.clone();
            copy.image_base64 = None;
            copy
        })
        .collect();

    let ts = now_ms();
    let user_msg = ChatMessage {
        id: next_id("msg"),
        role: "user".to_string(),
        text: text.trim().to_string(),
        attachments: persisted_attachments,
        created_at: ts,
        provider_used: None,
    };

    let ((target_conv_id, history_snapshot), initial_store) = mutate_store(&app, |s| {
        s.last_error = None;
        let conv_idx = conversation_id
            .as_deref()
            .and_then(|cid| s.conversations.iter().position(|c| c.id == cid))
            .or_else(|| {
                s.active_conversation_id
                    .as_deref()
                    .and_then(|cid| s.conversations.iter().position(|c| c.id == cid))
            });

        let idx = match conv_idx {
            Some(i) => i,
            None => {
                let new_id = next_id("chat");
                s.conversations.insert(
                    0,
                    ChatConversation {
                        id: new_id,
                        title: String::new(),
                        created_at: ts,
                        updated_at: ts,
                        messages: Vec::new(),
                    },
                );
                0
            }
        };

        let conv = &mut s.conversations[idx];
        if conv.title.trim().is_empty() {
            conv.title = derive_conversation_title(&user_msg.text, &user_msg.attachments);
        }
        conv.updated_at = ts;
        conv.messages.push(user_msg.clone());
        let cid = conv.id.clone();
        s.active_conversation_id = Some(cid.clone());
        (cid, conv.messages.clone())
    })?;

    let my_gen = start_generation();
    let initial_snap = emit_snapshot(&app, initial_store);

    // Build ChatTurnMessage history; keep current message's full image_base64 for vision
    let total = history_snapshot.len();
    let start = total.saturating_sub(MAX_HISTORY_TURNS);
    let mut turns = Vec::new();
    for (idx, msg) in history_snapshot[start..].iter().enumerate() {
        if msg.role == "error" {
            continue;
        }
        let is_latest = start + idx + 1 == total;
        let atts = if is_latest {
            &prepared_for_send
        } else {
            &msg.attachments
        };
        let turn_text = compose_user_turn_text(&msg.text, atts, is_local);
        let images = if is_latest && !is_local {
            prepared_for_send
                .iter()
                .filter(|a| a.kind == "image")
                .filter_map(|a| {
                    Some(ChatTurnAttachmentImage {
                        mime_type: a.mime.clone(),
                        data_base64: a.image_base64.clone()?,
                    })
                })
                .collect()
        } else {
            Vec::new()
        };
        turns.push(ChatTurnMessage {
            role: msg.role.clone(),
            text: turn_text,
            images,
        });
    }

    let custom_system = crate::utils::get_setting_str(&app, "zenith-ai-chat-system-prompt")
        .unwrap_or_default()
        .trim()
        .to_string();
    let system_prompt = if custom_system.is_empty() {
        "You are a helpful, concise AI assistant integrated into the Zenith desktop notch bar. Reply in the user's language (match Arabic or English naturally) and format answers clearly."
            .to_string()
    } else {
        custom_system
    };

    let app_clone = app.clone();
    let conv_id_clone = target_conv_id.clone();
    let max_tokens = if is_local { 1024 } else { 2048 };
    tauri::async_runtime::spawn(async move {
        let result = run_chat_completion(
            &app_clone,
            &base_cfg,
            provider_override.as_deref(),
            &system_prompt,
            &turns,
            max_tokens,
        )
        .await;

        if !finish_generation_if_current(my_gen) {
            return;
        }

        let reply_ts = now_ms();
        if let Ok((_, updated_store)) = mutate_store(&app_clone, |s| {
            if let Some(conv) = s.conversations.iter_mut().find(|c| c.id == conv_id_clone) {
                match result {
                    Ok((reply_text, provider_name)) => {
                        s.last_error = None;
                        conv.updated_at = reply_ts;
                        conv.messages.push(ChatMessage {
                            id: next_id("msg"),
                            role: "assistant".to_string(),
                            text: reply_text,
                            attachments: Vec::new(),
                            created_at: reply_ts,
                            provider_used: Some(provider_name),
                        });
                    }
                    Err(err_msg) => {
                        s.last_error = Some(err_msg.clone());
                        conv.updated_at = reply_ts;
                        conv.messages.push(ChatMessage {
                            id: next_id("msg"),
                            role: "error".to_string(),
                            text: err_msg,
                            attachments: Vec::new(),
                            created_at: reply_ts,
                            provider_used: None,
                        });
                    }
                }
            }
        }) {
            emit_snapshot(&app_clone, updated_store);
        }
    });

    Ok(initial_snap)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn truncates_long_text_and_rejects_binary_files() {
        let long = "a".repeat(MAX_EXTRACTED_CHARS + 500);
        let (clipped, truncated) = truncate_extracted_text(&long);
        assert_eq!(clipped.chars().count(), MAX_EXTRACTED_CHARS);
        assert!(truncated);

        assert!(looks_binary(b"abc\0def"));
        assert!(!looks_binary("مرحبا hello\nworld".as_bytes()));
    }

    #[test]
    fn formats_text_attachments_into_prompt_block_and_ocr_fallback() {
        let text_att = ChatAttachment {
            id: "1".into(),
            name: "notes.md".into(),
            kind: "text".into(),
            mime: "text/markdown".into(),
            preview_data_url: None,
            image_base64: None,
            extracted_text: Some("# Title\nBody".into()),
            char_count: 12,
            truncated: false,
            error: None,
        };
        let rendered = compose_user_turn_text("Summarize", &[text_att], false);
        assert!(rendered.contains("notes.md"));
        assert!(rendered.contains("# Title"));
        assert!(rendered.contains("Summarize"));

        let img_att = ChatAttachment {
            id: "2".into(),
            name: "screen.png".into(),
            kind: "image".into(),
            mime: "image/png".into(),
            preview_data_url: None,
            image_base64: Some("QUJD".into()),
            extracted_text: Some("OCR text here".into()),
            char_count: 13,
            truncated: false,
            error: None,
        };
        let with_ocr = compose_user_turn_text("Read it", std::slice::from_ref(&img_att), true);
        assert!(with_ocr.contains("OCR text here"));
        let without_ocr = compose_user_turn_text("Read it", &[img_att], false);
        assert!(!without_ocr.contains("OCR text here"));
    }

    #[test]
    fn derives_conversation_title_from_first_user_message() {
        assert_eq!(
            derive_conversation_title("   شرح سريع للكود   ", &[]),
            "شرح سريع للكود"
        );
        let att = ChatAttachment {
            id: "1".into(),
            name: "report.pdf".into(),
            kind: "text".into(),
            mime: "application/pdf".into(),
            preview_data_url: None,
            image_base64: None,
            extracted_text: None,
            char_count: 0,
            truncated: false,
            error: None,
        };
        assert_eq!(derive_conversation_title("", &[att]), "report.pdf");
    }

    #[test]
    fn extracts_office_docx_text_and_handles_missing_file() {
        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut zip_writer = zip::ZipWriter::new(&mut cursor);
            let opts = zip::write::SimpleFileOptions::default();
            zip_writer.start_file("word/document.xml", opts).unwrap();
            zip_writer
                .write_all(
                    "<w:document><w:body><w:p><w:r><w:t>Hello &amp; مرحبا</w:t></w:r></w:p></w:body></w:document>"
                        .as_bytes(),
                )
                .unwrap();
            zip_writer.finish().unwrap();
        }
        cursor.set_position(0);
        let extracted = extract_office_text_from_reader(cursor, "docx").unwrap();
        assert_eq!(extracted, "Hello & مرحبا");

        let missing = prepare_single_attachment("Z:/definitely/missing/file.txt");
        assert!(missing.error.is_some());
    }

    #[test]
    fn natural_slide_ordering_places_slide2_before_slide10() {
        let mut slides = vec![
            "ppt/slides/slide10.xml".to_string(),
            "ppt/slides/slide2.xml".to_string(),
            "ppt/slides/slide1.xml".to_string(),
        ];
        slides.sort_by(|a, b| trailing_number_sort_key(a).cmp(&trailing_number_sort_key(b)));
        assert_eq!(
            slides,
            vec![
                "ppt/slides/slide1.xml",
                "ppt/slides/slide2.xml",
                "ppt/slides/slide10.xml"
            ]
        );
    }

    #[test]
    fn generation_mutex_prevents_stale_completion_from_clearing_new_busy() {
        let g1 = start_generation();
        assert!(is_busy());
        let g2 = start_generation();
        assert!(!finish_generation_if_current(g1));
        assert!(is_busy());
        assert!(finish_generation_if_current(g2));
        assert!(!is_busy());
    }

    #[test]
    fn validates_local_unreadable_image_and_empty_text_attachments() {
        let empty_txt = ChatAttachment {
            id: "a1".into(),
            name: "empty.txt".into(),
            kind: "text".into(),
            mime: "text/plain".into(),
            preview_data_url: None,
            image_base64: None,
            extracted_text: Some("   ".into()),
            char_count: 3,
            truncated: false,
            error: None,
        };
        assert!(validate_latest_turn_has_payload("", &[empty_txt], false).is_err());

        let blank_img = ChatAttachment {
            id: "a2".into(),
            name: "photo.png".into(),
            kind: "image".into(),
            mime: "image/png".into(),
            preview_data_url: None,
            image_base64: Some("QUJD".into()),
            extracted_text: None,
            char_count: 0,
            truncated: false,
            error: None,
        };
        assert!(validate_latest_turn_has_payload("Describe", std::slice::from_ref(&blank_img), true).is_err());
        assert!(validate_latest_turn_has_payload("", &[blank_img], false).is_ok());
    }
}
