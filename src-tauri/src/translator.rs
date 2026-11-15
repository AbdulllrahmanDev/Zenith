use serde::{Deserialize, Serialize};
use serde_json::json;
use std::ffi::c_void;
use std::sync::atomic::AtomicBool;
use windows::core::PCWSTR;

/// True while the user is actively recording a new shortcut in Settings > Translator
/// so the global keyboard hook does not trigger translation mid-recording.
pub static TRANSLATOR_RECORDING_HOTKEY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub custom_endpoint: String,
    pub tone: String,
    pub custom_prompt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResponse {
    pub translated_text: String,
    pub detected_source_lang: Option<String>,
    pub provider_used: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatorTriggerPayload {
    pub text: String,
    pub captured_selection: bool,
    pub cursor_x: i32,
    pub cursor_y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HotkeySpec {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    pub vk: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpSpec {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedUrl {
    pub is_https: bool,
    pub host: String,
    pub port: u16,
    pub path_and_query: String,
}

/// Parses a human-readable shortcut such as `"Ctrl+Alt+T"` or `"Ctrl+Shift+Space"`
/// into modifiers and a Windows virtual-key code.
/// Requires at least one modifier OR a function key (`F1`-`F24`) so normal typing
/// cannot be accidentally swallowed globally.
pub fn parse_hotkey(shortcut: &str) -> Option<HotkeySpec> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut spec = HotkeySpec {
        ctrl: false,
        alt: false,
        shift: false,
        win: false,
        vk: 0,
    };

    for raw_part in trimmed.split('+') {
        let part = raw_part.trim();
        if part.is_empty() {
            continue;
        }
        let lower = part.to_ascii_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => spec.ctrl = true,
            "alt" | "option" => spec.alt = true,
            "shift" => spec.shift = true,
            "win" | "meta" | "super" | "cmd" => spec.win = true,
            _ => {
                if spec.vk != 0 {
                    return None;
                }
                spec.vk = parse_vk_token(&lower)?;
            }
        }
    }

    if spec.vk == 0 {
        return None;
    }

    let is_fn_key = (0x70..=0x87).contains(&spec.vk);
    if !(spec.ctrl || spec.alt || spec.shift || spec.win || is_fn_key) {
        return None;
    }

    Some(spec)
}

fn parse_vk_token(lower: &str) -> Option<u16> {
    if lower.len() == 1 {
        let ch = lower.bytes().next()?;
        return match ch {
            b'a'..=b'z' => Some(ch.to_ascii_uppercase() as u16),
            b'0'..=b'9' => Some(ch as u16),
            b'`' | b'~' => Some(0xC0),
            b'-' => Some(0xBD),
            b'=' => Some(0xBB),
            b'[' => Some(0xDB),
            b']' => Some(0xDD),
            b'\\' => Some(0xDC),
            b';' => Some(0xBA),
            b'\'' => Some(0xDE),
            b',' => Some(0xBC),
            b'.' => Some(0xBE),
            b'/' => Some(0xBF),
            _ => None,
        };
    }

    if let Some(rest) = lower.strip_prefix('f') {
        if let Ok(n) = rest.parse::<u16>() {
            if (1..=24).contains(&n) {
                return Some(0x6F + n);
            }
        }
    }

    match lower {
        "space" => Some(0x20),
        "enter" | "return" => Some(0x0D),
        "tab" => Some(0x09),
        "esc" | "escape" => Some(0x1B),
        "backspace" => Some(0x08),
        "delete" | "del" => Some(0x2E),
        "insert" | "ins" => Some(0x2D),
        "home" => Some(0x24),
        "end" => Some(0x23),
        "pageup" | "pgup" => Some(0x21),
        "pagedown" | "pgdn" => Some(0x22),
        "up" | "arrowup" => Some(0x26),
        "down" | "arrowdown" => Some(0x28),
        "left" | "arrowleft" => Some(0x25),
        "right" | "arrowright" => Some(0x27),
        "capslock" => Some(0x14),
        _ => None,
    }
}

pub fn language_display_name(code: &str) -> &str {
    match code.trim() {
        "auto" => "Auto-detect",
        "ar" => "Arabic",
        "en" => "English",
        "fr" => "French",
        "es" => "Spanish",
        "de" => "German",
        "it" => "Italian",
        "pt" => "Portuguese",
        "ru" => "Russian",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh-CN" | "zh" => "Chinese (Simplified)",
        "zh-TW" => "Chinese (Traditional)",
        "tr" => "Turkish",
        "hi" => "Hindi",
        "nl" => "Dutch",
        "pl" => "Polish",
        "uk" => "Ukrainian",
        "id" => "Indonesian",
        other => other,
    }
}

pub fn url_encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for byte in input.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", byte));
            }
        }
    }
    out
}

pub fn normalize_custom_chat_endpoint(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Custom API endpoint is required".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Custom endpoint must start with https:// or http://".to_string());
    }
    let no_trail = trimmed.trim_end_matches('/');
    if no_trail.ends_with("/v1") {
        Ok(format!("{}/chat/completions", no_trail))
    } else {
        Ok(no_trail.to_string())
    }
}

pub fn build_translation_system_prompt(req: &TranslateRequest) -> String {
    let source_desc = if req.source_lang.trim().is_empty() || req.source_lang == "auto" {
        "the detected source language".to_string()
    } else {
        language_display_name(&req.source_lang).to_string()
    };
    let target_desc = language_display_name(if req.target_lang.trim().is_empty() {
        "en"
    } else {
        &req.target_lang
    });

    let tone_instruction = match req.tone.trim() {
        "formal" => "Use a polite, formal, professional register.",
        "casual" => "Use a friendly, conversational, everyday register.",
        "concise" => "Keep the phrasing concise and direct without losing meaning.",
        "technical" => "Preserve technical terminology accurately and clearly.",
        _ => "Keep the translation natural and fluent.",
    };

    let mut prompt = format!(
        "You are a precision translator. Translate the user text from {} into {}. \
         {} Preserve paragraph breaks, inline formatting, code identifiers, and placeholders. \
         Output ONLY the translated text with no explanation, labels, or surrounding quotes.",
        source_desc, target_desc, tone_instruction
    );

    let extra = req.custom_prompt.trim();
    if !extra.is_empty() {
        prompt.push(' ');
        prompt.push_str("Additional instructions: ");
        prompt.push_str(extra);
    }

    prompt
}

pub fn build_http_spec(req: &TranslateRequest) -> Result<HttpSpec, String> {
    let provider = req.provider.trim().to_ascii_lowercase();
    let provider = if provider.is_empty() {
        "free".to_string()
    } else {
        provider
    };

    match provider.as_str() {
        "free" => {
            let sl = if req.source_lang.trim().is_empty() {
                "auto"
            } else {
                req.source_lang.trim()
            };
            let tl = if req.target_lang.trim().is_empty() {
                "en"
            } else {
                req.target_lang.trim()
            };
            let url = format!(
                "https://translate.googleapis.com/translate_a/single?client=gtx&sl={}&tl={}&dt=t&q={}",
                url_encode_component(sl),
                url_encode_component(tl),
                url_encode_component(&req.text)
            );
            Ok(HttpSpec {
                url,
                headers: vec![("Accept".to_string(), "application/json".to_string())],
                body: None,
            })
        }
        "gemini" => {
            let key = req.api_key.trim();
            if key.is_empty() {
                return Err("Gemini API key is required".to_string());
            }
            let model = if req.model.trim().is_empty() {
                "gemini-2.5-flash"
            } else {
                req.model.trim()
            };
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                url_encode_component(model),
                url_encode_component(key)
            );
            let sys = build_translation_system_prompt(req);
            let payload = json!({
                "systemInstruction": {
                    "parts": [{ "text": sys }]
                },
                "contents": [{
                    "role": "user",
                    "parts": [{ "text": req.text }]
                }],
                "generationConfig": {
                    "temperature": 0.2
                }
            });
            Ok(HttpSpec {
                url,
                headers: vec![("Content-Type".to_string(), "application/json".to_string())],
                body: Some(payload.to_string().into_bytes()),
            })
        }
        "openai" | "groq" | "custom" => {
            let (url, default_model) = match provider.as_str() {
                "openai" => (
                    "https://api.openai.com/v1/chat/completions".to_string(),
                    "gpt-4o-mini",
                ),
                "groq" => (
                    "https://api.groq.com/openai/v1/chat/completions".to_string(),
                    "llama-3.3-70b-versatile",
                ),
                _ => (
                    normalize_custom_chat_endpoint(&req.custom_endpoint)?,
                    "gpt-4o-mini",
                ),
            };
            let key = req.api_key.trim();
            if provider != "custom" && key.is_empty() {
                return Err(format!("{} API key is required", provider.to_uppercase()));
            }
            let model = if req.model.trim().is_empty() {
                default_model
            } else {
                req.model.trim()
            };
            let sys = build_translation_system_prompt(req);
            let payload = json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": sys },
                    { "role": "user", "content": req.text }
                ],
                "temperature": 0.2
            });
            let mut headers = vec![("Content-Type".to_string(), "application/json".to_string())];
            if !key.is_empty() {
                headers.push(("Authorization".to_string(), format!("Bearer {}", key)));
            }
            Ok(HttpSpec {
                url,
                headers,
                body: Some(payload.to_string().into_bytes()),
            })
        }
        other => Err(format!("Unsupported translation provider: {}", other)),
    }
}

pub fn parse_free_translate_response(raw: &str) -> Result<(String, Option<String>), String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid translator JSON: {}", e))?;
    let sentences = val
        .get(0)
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Unexpected free translation response format".to_string())?;
    let mut out = String::new();
    for item in sentences {
        if let Some(chunk) = item.get(0).and_then(|c| c.as_str()) {
            out.push_str(chunk);
        }
    }
    let detected = val
        .get(2)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if out.is_empty() {
        return Err("Empty translation returned".to_string());
    }
    Ok((out, detected))
}

pub fn parse_gemini_response(raw: &str) -> Result<String, String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid Gemini JSON: {}", e))?;
    if let Some(err_msg) = val
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
    {
        return Err(err_msg.to_string());
    }
    let parts = val
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.as_array())
        .ok_or_else(|| "No translation candidates returned by Gemini".to_string())?;

    let mut out = String::new();
    for part in parts {
        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
            out.push_str(text);
        }
    }
    let trimmed = out.trim().to_string();
    if trimmed.is_empty() {
        return Err("Gemini returned an empty translation".to_string());
    }
    Ok(trimmed)
}

pub fn parse_openai_response(raw: &str) -> Result<String, String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid API JSON: {}", e))?;
    if let Some(err_msg) = val
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
    {
        return Err(err_msg.to_string());
    }
    let content = val
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| "No completion choices returned by provider".to_string())?;

    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        return Err("Provider returned an empty translation".to_string());
    }
    Ok(trimmed)
}

pub fn parse_provider_response(
    provider: &str,
    status: u16,
    body: &str,
) -> Result<(String, Option<String>), String> {
    let norm = provider.trim().to_ascii_lowercase();
    if status >= 400 {
        // Prefer structured API error messages when present.
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
            if let Some(msg) = val
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
            {
                return Err(format!("HTTP {}: {}", status, msg));
            }
        }
        let preview: String = body.chars().take(180).collect();
        return Err(if preview.trim().is_empty() {
            format!("HTTP {} error from provider", status)
        } else {
            format!("HTTP {}: {}", status, preview.trim())
        });
    }

    match norm.as_str() {
        "" | "free" => parse_free_translate_response(body),
        "gemini" => Ok((parse_gemini_response(body)?, None)),
        "openai" | "groq" | "custom" => Ok((parse_openai_response(body)?, None)),
        other => Err(format!("Unsupported translation provider: {}", other)),
    }
}

pub fn parse_url(url: &str) -> Result<ParsedUrl, String> {
    let (is_https, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err("URL must begin with https:// or http://".to_string());
    };

    let (authority, path_and_query) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, "/"),
    };

    if authority.is_empty() {
        return Err("URL host is empty".to_string());
    }

    let default_port = if is_https { 443 } else { 80 };
    let (host, port) = if let Some(colon) = authority.rfind(':') {
        let h = &authority[..colon];
        let p_str = &authority[colon + 1..];
        if !h.is_empty() && p_str.chars().all(|c| c.is_ascii_digit()) {
            let p = p_str
                .parse::<u16>()
                .map_err(|_| "Invalid URL port".to_string())?;
            (h.to_string(), p)
        } else {
            (authority.to_string(), default_port)
        }
    } else {
        (authority.to_string(), default_port)
    };

    Ok(ParsedUrl {
        is_https,
        host,
        port,
        path_and_query: path_and_query.to_string(),
    })
}

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

struct WinHttpHandle(*mut c_void);

impl Drop for WinHttpHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                let _ = windows::Win32::Networking::WinHttp::WinHttpCloseHandle(self.0);
            }
        }
    }
}

pub fn execute_http_blocking(spec: &HttpSpec) -> Result<(u16, String), String> {
    use windows::Win32::Networking::WinHttp::{
        WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryDataAvailable,
        WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest,
        WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_FLAG_SECURE,
        WINHTTP_OPEN_REQUEST_FLAGS, WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    };

    let parsed = parse_url(&spec.url)?;
    let agent_w = to_wide_null("ZenithTranslator/1.0");
    let host_w = to_wide_null(&parsed.host);
    let verb_w = to_wide_null(if spec.body.is_some() { "POST" } else { "GET" });
    let path_w = to_wide_null(&parsed.path_and_query);

    unsafe {
        let session = WinHttpOpen(
            PCWSTR(agent_w.as_ptr()),
            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
            PCWSTR::null(),
            PCWSTR::null(),
            0,
        );
        if session.is_null() {
            return Err("WinHttpOpen failed".to_string());
        }
        let _session_guard = WinHttpHandle(session);
        let _ = WinHttpSetTimeouts(session, 5000, 8000, 10000, 30000);

        let connect = WinHttpConnect(session, PCWSTR(host_w.as_ptr()), parsed.port, 0);
        if connect.is_null() {
            return Err(format!("Failed to connect to {}", parsed.host));
        }
        let _connect_guard = WinHttpHandle(connect);

        let flags: WINHTTP_OPEN_REQUEST_FLAGS = if parsed.is_https {
            WINHTTP_FLAG_SECURE
        } else {
            WINHTTP_OPEN_REQUEST_FLAGS(0)
        };
        let request = WinHttpOpenRequest(
            connect,
            PCWSTR(verb_w.as_ptr()),
            PCWSTR(path_w.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            std::ptr::null(),
            flags,
        );
        if request.is_null() {
            return Err("WinHttpOpenRequest failed".to_string());
        }
        let _req_guard = WinHttpHandle(request);

        let mut header_block = String::new();
        for (name, val) in &spec.headers {
            header_block.push_str(name);
            header_block.push_str(": ");
            header_block.push_str(val);
            header_block.push_str("\r\n");
        }
        let header_w: Vec<u16> = header_block.encode_utf16().collect();
        let header_slice = if header_w.is_empty() {
            None
        } else {
            Some(header_w.as_slice())
        };

        let (body_ptr, body_len) = match &spec.body {
            Some(bytes) if !bytes.is_empty() => {
                (Some(bytes.as_ptr() as *const c_void), bytes.len() as u32)
            }
            _ => (None, 0),
        };

        WinHttpSendRequest(request, header_slice, body_ptr, body_len, body_len, 0)
            .map_err(|e| format!("Network request failed: {}", e))?;

        WinHttpReceiveResponse(request, std::ptr::null_mut())
            .map_err(|e| format!("Network response failed: {}", e))?;

        let mut status: u32 = 0;
        let mut status_len: u32 = std::mem::size_of::<u32>() as u32;
        let mut idx: u32 = 0;
        WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            PCWSTR::null(),
            Some(&mut status as *mut u32 as *mut c_void),
            &mut status_len,
            &mut idx,
        )
        .map_err(|e| format!("Failed reading HTTP status: {}", e))?;

        let mut raw_bytes: Vec<u8> = Vec::new();
        loop {
            let mut available: u32 = 0;
            WinHttpQueryDataAvailable(request, &mut available)
                .map_err(|e| format!("Failed reading response stream: {}", e))?;
            if available == 0 {
                break;
            }
            let chunk_size = available.min(65536) as usize;
            let mut buf = vec![0u8; chunk_size];
            let mut read: u32 = 0;
            WinHttpReadData(
                request,
                buf.as_mut_ptr() as *mut c_void,
                chunk_size as u32,
                &mut read,
            )
            .map_err(|e| format!("Failed reading HTTP body: {}", e))?;
            if read == 0 {
                break;
            }
            raw_bytes.extend_from_slice(&buf[..read as usize]);
        }

        let body_text = String::from_utf8_lossy(&raw_bytes).into_owned();
        Ok((status as u16, body_text))
    }
}

pub fn translate_blocking(req: &TranslateRequest) -> Result<TranslateResponse, String> {
    if req.text.trim().is_empty() {
        return Err("Text to translate is empty".to_string());
    }
    let spec = build_http_spec(req)?;
    let (status, body) = execute_http_blocking(&spec)?;
    let (translated_text, detected_source_lang) =
        parse_provider_response(&req.provider, status, &body)?;
    Ok(TranslateResponse {
        translated_text,
        detected_source_lang,
        provider_used: if req.provider.trim().is_empty() {
            "free".to_string()
        } else {
            req.provider.trim().to_ascii_lowercase()
        },
    })
}

fn read_clipboard_unicode_text() -> Option<String> {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    const CF_UNICODETEXT_ID: u32 = 13;

    unsafe {
        let mut opened = false;
        for _ in 0..4 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        if !opened {
            return None;
        }

        let result = (|| {
            let handle = GetClipboardData(CF_UNICODETEXT_ID).ok()?;
            let hmem = windows::Win32::Foundation::HGLOBAL(handle.0);
            let ptr = GlobalLock(hmem) as *const u16;
            if ptr.is_null() {
                return None;
            }
            let mut len = 0usize;
            while *ptr.add(len) != 0 && len < 1_000_000 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(ptr, len);
            let text = String::from_utf16_lossy(slice);
            let _ = GlobalUnlock(hmem);
            Some(text)
        })();

        let _ = CloseClipboard();
        result
    }
}

fn write_clipboard_unicode_text(text: &str) {
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };

    const CF_UNICODETEXT_ID: u32 = 13;
    let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = utf16.len() * std::mem::size_of::<u16>();

    unsafe {
        let Ok(hmem) = GlobalAlloc(GMEM_MOVEABLE, byte_len) else {
            return;
        };
        let ptr = GlobalLock(hmem) as *mut u16;
        if ptr.is_null() {
            let _ = GlobalFree(Some(hmem));
            return;
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr, utf16.len());
        let _ = GlobalUnlock(hmem);

        let mut opened = false;
        for _ in 0..4 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        if !opened {
            let _ = GlobalFree(Some(hmem));
            return;
        }
        let _ = EmptyClipboard();
        if SetClipboardData(CF_UNICODETEXT_ID, Some(HANDLE(hmem.0))).is_err() {
            let _ = GlobalFree(Some(hmem));
        }
        let _ = CloseClipboard();
    }
}

fn make_key_input(vk: u16, keyup: bool) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: if keyup {
                    KEYEVENTF_KEYUP
                } else {
                    Default::default()
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Captures the currently selected text in the foreground application by
/// releasing held trigger modifiers, sending `Ctrl+C`, and restoring the
/// previous clipboard text if the clipboard changed.
pub fn capture_selected_text() -> Option<String> {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN,
        VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN,
    };

    unsafe {
        // Release any physical modifiers currently held from the trigger hotkey
        // so the foreground app sees a clean Ctrl+C instead of Ctrl+Alt+Shift+C.
        let mut release_inputs: Vec<INPUT> = Vec::new();
        for vk in [
            VK_LMENU.0,
            VK_RMENU.0,
            VK_LSHIFT.0,
            VK_RSHIFT.0,
            VK_LWIN.0,
            VK_RWIN.0,
            VK_LCONTROL.0,
            VK_RCONTROL.0,
        ] {
            if (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 {
                release_inputs.push(make_key_input(vk, true));
            }
        }
        if !release_inputs.is_empty() {
            SendInput(&release_inputs, std::mem::size_of::<INPUT>() as i32);
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        let seq_before = GetClipboardSequenceNumber();
        let previous_text = read_clipboard_unicode_text();

        let copy_inputs = [
            make_key_input(VK_LCONTROL.0, false),
            make_key_input(b'C' as u16, false),
            make_key_input(b'C' as u16, true),
            make_key_input(VK_LCONTROL.0, true),
        ];
        SendInput(&copy_inputs, std::mem::size_of::<INPUT>() as i32);

        let mut changed = false;
        for _ in 0..14 {
            std::thread::sleep(std::time::Duration::from_millis(15));
            if GetClipboardSequenceNumber() != seq_before {
                changed = true;
                break;
            }
        }

        if !changed {
            return None;
        }

        let copied = read_clipboard_unicode_text();
        if let Some(prev) = previous_text {
            write_clipboard_unicode_text(&prev);
        }

        copied.and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(s)
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_req(provider: &str) -> TranslateRequest {
        TranslateRequest {
            text: "Hello world".to_string(),
            source_lang: "auto".to_string(),
            target_lang: "ar".to_string(),
            provider: provider.to_string(),
            api_key: "sk-test-key".to_string(),
            model: String::new(),
            custom_endpoint: String::new(),
            tone: "natural".to_string(),
            custom_prompt: String::new(),
        }
    }

    #[test]
    fn parse_hotkey_valid_combos() {
        assert_eq!(
            parse_hotkey("Ctrl+Alt+T"),
            Some(HotkeySpec {
                ctrl: true,
                alt: true,
                shift: false,
                win: false,
                vk: b'T' as u16,
            })
        );
        assert_eq!(
            parse_hotkey(" ctrl + shift + space "),
            Some(HotkeySpec {
                ctrl: true,
                alt: false,
                shift: true,
                win: false,
                vk: 0x20,
            })
        );
        assert_eq!(
            parse_hotkey("F9"),
            Some(HotkeySpec {
                ctrl: false,
                alt: false,
                shift: false,
                win: false,
                vk: 0x78,
            })
        );
    }

    #[test]
    fn parse_hotkey_rejects_unmodified_typing_keys() {
        assert_eq!(parse_hotkey("T"), None);
        assert_eq!(parse_hotkey("Ctrl"), None);
        assert_eq!(parse_hotkey(""), None);
        assert_eq!(parse_hotkey("Ctrl+A+B"), None);
    }

    #[test]
    fn build_http_spec_free_encodes_query() {
        let req = sample_req("free");
        let spec = build_http_spec(&req).unwrap();
        assert!(spec.body.is_none());
        assert!(spec
            .url
            .starts_with("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=Hello%20world"));
    }

    #[test]
    fn build_http_spec_gemini_and_openai() {
        let gem = build_http_spec(&sample_req("gemini")).unwrap();
        assert!(gem
            .url
            .contains("/models/gemini-2.5-flash:generateContent?key=sk-test-key"));
        let gem_body = String::from_utf8(gem.body.unwrap()).unwrap();
        assert!(gem_body.contains("Arabic"));
        assert!(gem_body.contains("Hello world"));

        let mut custom = sample_req("custom");
        custom.api_key = String::new();
        custom.custom_endpoint = "http://localhost:11434/v1".to_string();
        let cust_spec = build_http_spec(&custom).unwrap();
        assert_eq!(cust_spec.url, "http://localhost:11434/v1/chat/completions");
        assert!(!cust_spec
            .headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("Authorization")));
    }

    #[test]
    fn parse_provider_responses() {
        let free_json = r#"[[["مرحبا ","Hello ",null,null,1],["بالعالم","world",null,null,1]],null,"en"]"#;
        let (txt, detected) = parse_provider_response("free", 200, free_json).unwrap();
        assert_eq!(txt, "مرحبا بالعالم");
        assert_eq!(detected.as_deref(), Some("en"));

        let gem_json = r#"{"candidates":[{"content":{"parts":[{"text":"مرحبا بالعالم"}]}}]}"#;
        let (g_txt, _) = parse_provider_response("gemini", 200, gem_json).unwrap();
        assert_eq!(g_txt, "مرحبا بالعالم");

        let oai_json = r#"{"choices":[{"message":{"content":"  أهلاً بالعالم  "}}]}"#;
        let (o_txt, _) = parse_provider_response("openai", 200, oai_json).unwrap();
        assert_eq!(o_txt, "أهلاً بالعالم");

        let err_json = r#"{"error":{"message":"Invalid API key"}}"#;
        let err = parse_provider_response("openai", 401, err_json).unwrap_err();
        assert!(err.contains("401"));
        assert!(err.contains("Invalid API key"));
    }

    #[test]
    fn parse_url_handles_ports_and_paths() {
        let https = parse_url("https://api.openai.com/v1/chat/completions").unwrap();
        assert!(https.is_https);
        assert_eq!(https.host, "api.openai.com");
        assert_eq!(https.port, 443);
        assert_eq!(https.path_and_query, "/v1/chat/completions");

        let local = parse_url("http://127.0.0.1:11434/v1/chat/completions").unwrap();
        assert!(!local.is_https);
        assert_eq!(local.host, "127.0.0.1");
        assert_eq!(local.port, 11434);
    }
}
