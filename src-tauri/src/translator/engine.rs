use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

use super::config::{CloudTarget, TranslatorConfig};
use super::local_runtime::{run_local_chat, LocalChatMessage};
use super::ocr::{pick_nearest_ocr_lines, OcrBlock, RawOcrLine};

const GEMINI_DEFAULT_MODEL: &str = "gemini-flash-lite-latest";
const GROQ_TEXT_MODEL: &str = "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL: &str = "meta-llama/llama-4-scout-17b-16e-instruct";
const OPENAI_MODEL: &str = "gpt-4o-mini";
const ANTHROPIC_DEFAULT_MODEL: &str = "claude-3-5-haiku-latest";

pub fn clean_english_output(raw: &str) -> String {
    let mut text = raw.trim().to_string();
    let prefixes = [
        "Translation:",
        "Translated text:",
        "Here is the translation:",
        "English translation:",
        "Output:",
    ];
    for p in prefixes {
        if let Some(rest) = text.strip_prefix(p) {
            text = rest.trim().to_string();
        }
    }
    if (text.starts_with('"') && text.ends_with('"') && text.len() >= 2)
        || (text.starts_with('\'') && text.ends_with('\'') && text.len() >= 2)
    {
        text = text[1..text.len() - 1].trim().to_string();
    }
    text
}

pub fn build_inplace_messages(source_text: &str, custom_prompt: &str) -> (String, String) {
    let base_sys = if custom_prompt.trim().is_empty() {
        "You are a fast, precise bilingual translator. Translate the user's Arabic (or mixed) text into natural, fluent, grammatically correct English. Preserve tone, formatting, line breaks, and code/variables verbatim. Output ONLY the translated English text with zero preamble, no quotes, and no explanations."
    } else {
        custom_prompt.trim()
    };
    (base_sys.to_string(), source_text.to_string())
}

pub fn build_quick_messages(
    source_text: &str,
    output_mode: &str,
    target_language: &str,
    custom_prompt: &str,
) -> (String, String) {
    if !custom_prompt.trim().is_empty() {
        return (custom_prompt.trim().to_string(), source_text.to_string());
    }
    let target = if target_language.trim().is_empty() {
        "Arabic"
    } else {
        target_language.trim()
    };

    let sys = match output_mode {
        "explain" => format!(
            "You are a concise, crystal-clear tutor. Explain the user's text clearly in {target}. Focus on meaning, context, and key takeaways in short readable paragraphs or bullet points. Keep technical identifiers intact. Output ONLY the explanation in {target}."
        ),
        "summarize" => format!(
            "You are an expert summarizer. Summarize the key ideas of the user's text concisely in {target} using short clear bullet points. Output ONLY the summary in {target}."
        ),
        _ => format!(
            "You are a professional translator. Translate the user's text accurately and naturally into {target}. Preserve paragraph structure and technical identifiers verbatim. Output ONLY the translated text in {target} without preamble."
        ),
    };

    (sys, source_text.to_string())
}

pub fn parse_json_string_array(raw: &str, expected: usize) -> Option<Vec<String>> {
    let trimmed = raw.trim();
    let stripped = if trimmed.starts_with("```") {
        let mut s = trimmed.trim_start_matches('`');
        if let Some(nl) = s.find('\n') {
            s = &s[nl + 1..];
        }
        s.trim_end_matches('`').trim()
    } else {
        trimmed
    };

    let candidate = if stripped.starts_with('[') {
        stripped
    } else if let (Some(a), Some(b)) = (stripped.find('['), stripped.rfind(']')) {
        if b > a {
            &stripped[a..=b]
        } else {
            stripped
        }
    } else {
        stripped
    };

    let parsed: Value = serde_json::from_str(candidate).ok()?;
    let arr = parsed.as_array()?;
    let mut out = Vec::with_capacity(expected);
    for item in arr {
        match item {
            Value::String(s) => out.push(s.clone()),
            other => out.push(other.to_string()),
        }
    }
    if out.len() == expected {
        Some(out)
    } else {
        None
    }
}

static HTTP_CLIENT_45: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
static HTTP_CLIENT_60: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();

fn build_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(timeout_secs))
        .pool_idle_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
}

fn http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    match timeout_secs {
        45 => HTTP_CLIENT_45
            .get_or_init(|| build_http_client(45))
            .clone(),
        60 => HTTP_CLIENT_60
            .get_or_init(|| build_http_client(60))
            .clone(),
        _ => build_http_client(timeout_secs),
    }
}

fn validate_http_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("يرجى إدخال رابط API صحيح يبدأ بـ http:// أو https://".to_string());
    }
    let after_scheme = trimmed.split_once("://").map(|(_, rest)| rest).unwrap_or("");
    let host = after_scheme.split('/').next().unwrap_or("").trim();
    if host.is_empty() || trimmed.chars().any(|c| c.is_whitespace()) {
        return Err("رابط الـ API غير صالح، تأكد من عدم وجود مسافات أو نقص في العنوان".to_string());
    }
    Ok(trimmed.to_string())
}

fn split_exact_url(validated: &str) -> (&str, bool) {
    if let Some(exact) = validated.strip_suffix('#') {
        (exact.trim_end_matches('/'), true)
    } else {
        (validated.trim_end_matches('/'), false)
    }
}

fn has_non_empty_path(url: &str) -> bool {
    url.split_once("://")
        .and_then(|(_, rest)| rest.split_once('/'))
        .is_some_and(|(_, path)| !path.is_empty())
}

pub fn normalize_openai_chat_url(raw: &str) -> Result<String, String> {
    let validated = validate_http_url(raw)?;
    let (clean, exact) = split_exact_url(&validated);
    if exact || clean.to_ascii_lowercase().ends_with("/chat/completions") {
        return Ok(clean.to_string());
    }
    if has_non_empty_path(clean) {
        Ok(format!("{clean}/chat/completions"))
    } else {
        Ok(format!("{clean}/v1/chat/completions"))
    }
}

pub fn normalize_anthropic_messages_url(raw: &str) -> Result<String, String> {
    let validated = validate_http_url(raw)?;
    let (clean, exact) = split_exact_url(&validated);
    let lower = clean.to_ascii_lowercase();
    if exact || lower.ends_with("/messages") {
        return Ok(clean.to_string());
    }
    if lower.ends_with("/v1") {
        Ok(format!("{clean}/messages"))
    } else {
        Ok(format!("{clean}/v1/messages"))
    }
}

pub fn normalize_gemini_generate_url(raw: &str, model: &str) -> Result<String, String> {
    let validated = validate_http_url(raw)?;
    let (clean, exact) = split_exact_url(&validated);
    let lower = clean.to_ascii_lowercase();
    if exact || lower.contains(":generatecontent") {
        return Ok(clean.to_string());
    }
    let model_name = if model.trim().is_empty() {
        GEMINI_DEFAULT_MODEL
    } else {
        model.trim()
    };
    if lower.ends_with("/models") {
        Ok(format!("{clean}/{model_name}:generateContent"))
    } else if lower.ends_with("/v1beta") || lower.ends_with("/v1") {
        Ok(format!("{clean}/models/{model_name}:generateContent"))
    } else {
        Ok(format!("{clean}/v1beta/models/{model_name}:generateContent"))
    }
}

static DETECTED_CUSTOM_FORMATS: OnceLock<Mutex<HashMap<String, &'static str>>> = OnceLock::new();

fn detected_custom_format_cache() -> &'static Mutex<HashMap<String, &'static str>> {
    DETECTED_CUSTOM_FORMATS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn custom_format_cache_key(url: &str, model: &str) -> String {
    let norm_url = url.trim().trim_end_matches('#').trim_end_matches('/').to_ascii_lowercase();
    let norm_model = model.trim().to_ascii_lowercase();
    format!("{norm_url}|{norm_model}")
}

fn record_detected_custom_format(url: &str, model: &str, fmt: &'static str) {
    let key = custom_format_cache_key(url, model);
    if let Ok(mut guard) = detected_custom_format_cache().lock() {
        guard.insert(key, fmt);
    }
}

pub fn infer_custom_format_candidates(url: &str, model: &str) -> Vec<&'static str> {
    let clean = url.trim().trim_end_matches('#').trim_end_matches('/').to_ascii_lowercase();
    let model_lower = model.trim().to_ascii_lowercase();

    // Explicit URL protocol cues
    if clean.contains(":generatecontent")
        || clean.contains("generativelanguage.googleapis.com")
        || clean.contains("aiplatform.googleapis.com")
        || clean.ends_with("/v1beta")
        || clean.ends_with("/models")
    {
        return vec!["gemini"];
    }
    if clean.contains("api.anthropic.com") || clean.ends_with("/messages") {
        return vec!["anthropic"];
    }
    if clean.ends_with("/chat/completions")
        || clean.contains("openrouter.ai")
        || clean.contains("api.openai.com")
        || clean.contains("api.deepseek.com")
        || clean.contains("api.groq.com")
    {
        return vec!["openai"];
    }

    // Generic base URL / aggregator proxy: OpenAI-compatible is the universal default,
    // with smart fallback order based on the model name if the proxy is native-only.
    let mut order: Vec<&'static str> = if model_lower.contains("claude") {
        vec!["openai", "anthropic", "gemini"]
    } else {
        vec!["openai", "gemini", "anthropic"]
    };

    let key = custom_format_cache_key(url, model);
    if let Ok(guard) = detected_custom_format_cache().lock() {
        if let Some(&cached) = guard.get(&key) {
            if let Some(pos) = order.iter().position(|&f| f == cached) {
                order.remove(pos);
                order.insert(0, cached);
            }
        }
    }
    order
}

fn is_protocol_mismatch_error(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    ["(404", "(405", "(400", "(415", "(422", "(501"]
        .iter()
        .any(|code| lower.contains(code))
        || lower.contains("empty response")
        || lower.contains("invalid provider response")
        || err.contains("برد فارغ")
        || err.contains("فشل قراءة رد")
}

pub fn extract_openai_content(val: &Value) -> Option<String> {
    let content = &val["choices"][0]["message"]["content"];
    if let Some(s) = content.as_str() {
        let trimmed = s.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    if let Some(parts) = content.as_array() {
        let joined: String = parts
            .iter()
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("");
        let trimmed = joined.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    val["choices"][0]["text"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn extract_anthropic_content(val: &Value) -> Option<String> {
    let arr = val["content"].as_array()?;
    let joined: String = arr
        .iter()
        .filter_map(|item| item["text"].as_str())
        .collect::<Vec<_>>()
        .join("");
    let trimmed = joined.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn extract_gemini_content(val: &Value) -> Option<String> {
    let parts = val["candidates"][0]["content"]["parts"].as_array()?;
    let joined: String = parts
        .iter()
        .filter_map(|p| p["text"].as_str())
        .collect::<Vec<_>>()
        .join("");
    let trimmed = joined.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

async fn call_openai_compatible(
    url: &str,
    api_key: &str,
    model: &str,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(45)?;
    let user_content: Value = if let Some(png) = image_png {
        let b64 = BASE64.encode(png);
        json!([
            { "type": "text", "text": user_text },
            { "type": "image_url", "image_url": { "url": format!("data:image/png;base64,{b64}") } }
        ])
    } else {
        json!(user_text)
    };

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": sys },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens
    });

    let mut req = client.post(url);
    if !api_key.trim().is_empty() {
        req = req.bearer_auth(api_key.trim());
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("خطأ في الاتصال بالخادم: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("خطأ من المزود ({status}): {err_body}"));
    }

    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("استجابة غير صالحة من الخادم: {e}"))?;
    extract_openai_content(&val).ok_or_else(|| "رد فارغ من المزود".to_string())
}

async fn call_anthropic(
    url: &str,
    api_key: &str,
    model: &str,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(45)?;
    let user_content: Value = if let Some(png) = image_png {
        json!([
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": BASE64.encode(png)
                }
            },
            { "type": "text", "text": user_text }
        ])
    } else {
        json!(user_text)
    };

    let body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "system": sys,
        "messages": [
            { "role": "user", "content": user_content }
        ]
    });

    let mut req = client
        .post(url)
        .header("anthropic-version", "2023-06-01");
    if !api_key.trim().is_empty() {
        req = req.header("x-api-key", api_key.trim());
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("خطأ في الاتصال بالخادم: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("خطأ من المزود ({status}): {err_body}"));
    }

    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("استجابة غير صالحة من الخادم: {e}"))?;
    extract_anthropic_content(&val).ok_or_else(|| "رد فارغ من المزود".to_string())
}

fn build_gemini_body(
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Value {
    let mut parts = vec![json!({ "text": user_text })];
    if let Some(png) = image_png {
        parts.push(json!({
            "inline_data": {
                "mime_type": "image/png",
                "data": BASE64.encode(png)
            }
        }));
    }

    json!({
        "system_instruction": { "parts": [{ "text": sys }] },
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens
        }
    })
}

async fn call_gemini_endpoint(
    url: &str,
    api_key_header: Option<&str>,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(45)?;
    let body = build_gemini_body(sys, user_text, image_png, max_tokens);
    let mut req = client.post(url);
    if let Some(key) = api_key_header.map(str::trim).filter(|k| !k.is_empty()) {
        if !url.contains("key=") {
            req = req.header("x-goog-api-key", key);
        }
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("خطأ في الاتصال بالخادم: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("خطأ من المزود ({status}): {err_body}"));
    }

    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("استجابة غير صالحة من الخادم: {e}"))?;
    extract_gemini_content(&val).ok_or_else(|| "رد فارغ من المزود".to_string())
}

static WORKING_GEMINI_URLS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn working_gemini_url_cache() -> &'static Mutex<HashMap<String, String>> {
    WORKING_GEMINI_URLS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn gemini_key_fingerprint(api_key: &str) -> String {
    let trimmed = api_key.trim();
    if trimmed.len() <= 12 {
        trimmed.to_string()
    } else {
        format!("{}..{}..{}", &trimmed[..6], trimmed.len(), &trimmed[trimmed.len() - 6..])
    }
}

fn record_working_gemini_url(api_key: &str, url: &str) {
    let fp = gemini_key_fingerprint(api_key);
    if let Ok(mut guard) = working_gemini_url_cache().lock() {
        guard.insert(fp, url.to_string());
    }
}

fn gemini_candidate_urls(api_key: &str) -> Vec<String> {
    let mut candidates = vec![
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_DEFAULT_MODEL}:generateContent"
        ),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent".to_string(),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent".to_string(),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent".to_string(),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent".to_string(),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent".to_string(),
    ];
    if api_key.trim().starts_with("AQ.") {
        candidates.push(
            "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent"
                .to_string(),
        );
    }
    let fp = gemini_key_fingerprint(api_key);
    if let Ok(guard) = working_gemini_url_cache().lock() {
        if let Some(cached) = guard.get(&fp) {
            if let Some(pos) = candidates.iter().position(|u| u == cached) {
                let winner = candidates.remove(pos);
                candidates.insert(0, winner);
            }
        }
    }
    candidates
}

fn is_vertex_disabled_err(err: &str) -> bool {
    err.contains("SERVICE_DISABLED") || err.contains("BILLING_DISABLED")
}

async fn call_gemini(
    api_key: &str,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(45)?;
    let body = build_gemini_body(sys, user_text, image_png, max_tokens);
    let trimmed_key = api_key.trim();
    let is_aq = trimmed_key.starts_with("AQ.");
    let candidates = gemini_candidate_urls(trimmed_key);

    let mut gl_err: Option<String> = None;
    let mut last_err = "تعذر الاتصال بـ Gemini".to_string();
    let mut skip_generativelanguage = false;
    for url in candidates {
        let is_gl = url.contains("generativelanguage.googleapis.com");
        if skip_generativelanguage && is_gl {
            continue;
        }
        let mut req = client.post(&url);
        if !trimmed_key.is_empty() {
            req = req.header("x-goog-api-key", trimmed_key);
        }
        let resp = match req.json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                let err = format!("خطأ اتصال Gemini: {e}");
                if is_gl && gl_err.is_none() {
                    gl_err = Some(err.clone());
                }
                last_err = err;
                continue;
            }
        };
        if resp.status().is_success() {
            let val: Value = resp
                .json()
                .await
                .map_err(|e| format!("فشل قراءة رد Gemini: {e}"))?;
            if let Some(cleaned) = extract_gemini_content(&val) {
                record_working_gemini_url(trimmed_key, &url);
                return Ok(cleaned);
            }
            let err = "عاد Gemini برد فارغ".to_string();
            if is_gl && gl_err.is_none() {
                gl_err = Some(err.clone());
            }
            last_err = err;
            continue;
        }
        let status = resp.status();
        let body_txt = resp.text().await.unwrap_or_default();
        let err = sanitize_err_secret(format!("خطأ Gemini ({status}): {body_txt}"), trimmed_key);
        if is_gl {
            gl_err = Some(err.clone());
        }
        last_err = if !is_gl && is_vertex_disabled_err(&err) {
            gl_err.clone().unwrap_or(err)
        } else {
            err
        };
        let code = status.as_u16();
        if code != 404 && code != 429 && code != 503 {
            if is_aq && is_gl {
                skip_generativelanguage = true;
                continue;
            }
            break;
        }
    }

    Err(last_err)
}

struct CustomEndpoint<'a> {
    url: &'a str,
    api_key: &'a str,
    model: &'a str,
}

async fn call_custom_with_format(
    format: &str,
    target: &CustomEndpoint<'_>,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    match format {
        "anthropic" => {
            let endpoint = normalize_anthropic_messages_url(target.url)?;
            let model_name = if target.model.trim().is_empty() {
                ANTHROPIC_DEFAULT_MODEL
            } else {
                target.model.trim()
            };
            call_anthropic(
                &endpoint,
                target.api_key,
                model_name,
                sys,
                user_text,
                image_png,
                max_tokens,
            )
            .await
        }
        "gemini" => {
            let endpoint = normalize_gemini_generate_url(target.url, target.model)?;
            call_gemini_endpoint(
                &endpoint,
                Some(target.api_key),
                sys,
                user_text,
                image_png,
                max_tokens,
            )
            .await
        }
        _ => {
            let endpoint = normalize_openai_chat_url(target.url)?;
            let model_name = if target.model.trim().is_empty() {
                OPENAI_MODEL
            } else {
                target.model.trim()
            };
            call_openai_compatible(
                &endpoint,
                target.api_key,
                model_name,
                sys,
                user_text,
                image_png,
                max_tokens,
            )
            .await
        }
    }
}

async fn call_cloud_target(
    cfg: &TranslatorConfig,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    match cfg.resolve_cloud_target()? {
        CloudTarget::Groq { api_key } => {
            let model = if image_png.is_some() {
                GROQ_VISION_MODEL
            } else {
                GROQ_TEXT_MODEL
            };
            call_openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions",
                api_key,
                model,
                sys,
                user_text,
                image_png,
                max_tokens,
            )
            .await
        }
        CloudTarget::OpenAi { api_key } => {
            call_openai_compatible(
                "https://api.openai.com/v1/chat/completions",
                api_key,
                OPENAI_MODEL,
                sys,
                user_text,
                image_png,
                max_tokens,
            )
            .await
        }
        CloudTarget::Gemini { api_key } => {
            call_gemini(api_key, sys, user_text, image_png, max_tokens).await
        }
        CloudTarget::Custom {
            format,
            url,
            api_key,
            model,
        } => {
            let target = CustomEndpoint { url, api_key, model };
            if format != "auto" {
                return call_custom_with_format(
                    format, &target, sys, user_text, image_png, max_tokens,
                )
                .await;
            }
            let candidates = infer_custom_format_candidates(url, model);
            let mut first_err: Option<String> = None;
            for candidate in candidates {
                match call_custom_with_format(
                    candidate, &target, sys, user_text, image_png, max_tokens,
                )
                .await
                {
                    Ok(reply) => {
                        record_detected_custom_format(url, model, candidate);
                        return Ok(reply);
                    }
                    Err(err) => {
                        let retry = is_protocol_mismatch_error(&err);
                        if first_err.is_none() {
                            first_err = Some(err);
                        }
                        if !retry {
                            break;
                        }
                    }
                }
            }
            Err(first_err.unwrap_or_else(|| "Custom API request failed".to_string()))
        }
    }
}

async fn run_text_prompt(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    sys: &str,
    user: &str,
    max_tokens: u32,
) -> Result<String, String> {
    if cfg.engine == "local" {
        let msgs = vec![
            LocalChatMessage {
                role: "system".to_string(),
                content: sys.to_string(),
            },
            LocalChatMessage {
                role: "user".to_string(),
                content: user.to_string(),
            },
        ];
        return run_local_chat(app, msgs, max_tokens, 0.2).await;
    }

    call_cloud_target(cfg, sys, user, None, max_tokens).await
}

pub async fn translate_inplace(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    source_text: &str,
) -> Result<String, String> {
    let (sys, user) = build_inplace_messages(source_text, &cfg.custom_prompt_inplace);
    let raw = run_text_prompt(app, cfg, &sys, &user, 1024).await?;
    Ok(clean_english_output(&raw))
}

pub async fn translate_quick(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    source_text: &str,
) -> Result<String, String> {
    let (sys, user) = build_quick_messages(
        source_text,
        &cfg.output_mode,
        &cfg.target_language,
        &cfg.custom_prompt_quick,
    );
    run_text_prompt(app, cfg, &sys, &user, 1500).await
}

pub async fn explain_cursor_region(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    annotated_png: &[u8],
    nearest_ocr: &[RawOcrLine],
    cursor_rel: Option<(i32, i32)>,
) -> Result<String, String> {
    let target = if cfg.target_language.trim().is_empty() {
        "Arabic"
    } else {
        cfg.target_language.trim()
    };

    if cfg.engine == "local" {
        let lines = pick_nearest_ocr_lines(nearest_ocr, cursor_rel, 10);
        if lines.is_empty() {
            return Err("لم يتم العثور على نص واضح قرب المؤشر".to_string());
        }
        let joined = lines.join("\n");
        return translate_quick(app, cfg, &joined).await;
    }

    let mode_hint = match cfg.output_mode.as_str() {
        "explain" => format!("Explain concisely what is under or right next to the target reticle marker in {target}."),
        "summarize" => format!("Summarize concisely the section under the target reticle marker in {target}."),
        _ => format!("Translate accurately into {target} the text, element, button, or paragraph right under the target reticle marker."),
    };
    let sys = format!(
        "You are looking at a screenshot with a circular target reticle. {mode_hint} Output ONLY the response in {target}."
    );

    call_cloud_target(
        cfg,
        &sys,
        "Read and process the content at the crosshair reticle.",
        Some(annotated_png),
        900,
    )
    .await
}

pub async fn translate_region_image(
    cfg: &TranslatorConfig,
    png_bytes: &[u8],
    to_english_only: bool,
) -> Result<String, String> {
    if cfg.engine == "local" {
        return Err("لم يتم اكتشاف نص واضح في المنطقة المحددة".to_string());
    }

    if to_english_only {
        let sys = if cfg.custom_prompt_inplace.trim().is_empty() {
            "You are a fast, precise bilingual translator. Read all text shown in this cropped screenshot and translate it into natural, fluent English. Output ONLY the translated English text with zero preamble or quotes.".to_string()
        } else {
            cfg.custom_prompt_inplace.trim().to_string()
        };
        let raw = call_cloud_target(
            cfg,
            &sys,
            "Read and translate the text in this cropped screenshot into English.",
            Some(png_bytes),
            1024,
        )
        .await?;
        return Ok(clean_english_output(&raw));
    }

    let target = if cfg.target_language.trim().is_empty() {
        "Arabic"
    } else {
        cfg.target_language.trim()
    };

    let sys = if !cfg.custom_prompt_quick.trim().is_empty() {
        cfg.custom_prompt_quick.trim().to_string()
    } else {
        match cfg.output_mode.as_str() {
            "explain" => format!(
                "You are a concise, crystal-clear tutor. Read the content shown in this cropped screenshot and explain it clearly in {target}. Output ONLY the explanation in {target}."
            ),
            "summarize" => format!(
                "You are an expert summarizer. Read the content shown in this cropped screenshot and summarize it concisely in {target}. Output ONLY the summary in {target}."
            ),
            _ => format!(
                "You are a professional translator. Read all text shown in this cropped screenshot and translate it accurately and naturally into {target}. Output ONLY the translated text in {target} without preamble."
            ),
        }
    };

    call_cloud_target(
        cfg,
        &sys,
        "Read and process all content shown in this cropped screenshot.",
        Some(png_bytes),
        1200,
    )
    .await
}

pub async fn translate_ocr_batch(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    blocks: &[OcrBlock],
) -> Result<Vec<String>, String> {
    if blocks.is_empty() {
        return Ok(Vec::new());
    }
    let target = if cfg.target_language.trim().is_empty() {
        "Arabic"
    } else {
        cfg.target_language.trim()
    };

    let texts: Vec<&str> = blocks.iter().map(|b| b.text.as_str()).collect();
    let input_json = serde_json::to_string(&texts).unwrap_or_default();
    let sys = format!(
        "You are a fast UI & document batch translator. Translate each string in the JSON array into natural {target}. Return ONLY a valid JSON array of strings with the EXACT SAME number of items ({}) and matching order. No markdown fences, no commentary.",
        texts.len()
    );

    if let Ok(raw) = run_text_prompt(app, cfg, &sys, &input_json, 2048).await {
        if let Some(arr) = parse_json_string_array(&raw, texts.len()) {
            return Ok(arr);
        }
    }

    // Fallback: translate item-by-item if model didn't return exact JSON array
    let mut out = Vec::with_capacity(blocks.len());
    for b in blocks {
        let single = translate_quick(app, cfg, &b.text)
            .await
            .unwrap_or_else(|_| b.text.clone());
        out.push(single);
    }
    Ok(out)
}

#[derive(Debug, Clone)]
pub struct ChatTurnAttachmentImage {
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Debug, Clone)]
pub struct ChatTurnMessage {
    pub role: String,
    pub text: String,
    pub images: Vec<ChatTurnAttachmentImage>,
}

pub fn resolve_chat_config(
    base: &TranslatorConfig,
    provider_override: Option<&str>,
) -> TranslatorConfig {
    let mut cfg = base.clone();
    let Some(raw) = provider_override else {
        return cfg;
    };
    let norm = raw.trim().to_ascii_lowercase();
    match norm.as_str() {
        "" | "inherit" => cfg,
        "local" => {
            cfg.engine = "local".to_string();
            cfg
        }
        "gemini" | "groq" | "openai" | "custom" => {
            cfg.engine = "cloud".to_string();
            cfg.provider = norm;
            cfg
        }
        _ => cfg,
    }
}

pub fn build_openai_chat_messages(
    system_prompt: &str,
    history: &[ChatTurnMessage],
) -> Vec<Value> {
    let mut messages = Vec::new();
    if !system_prompt.trim().is_empty() {
        messages.push(json!({ "role": "system", "content": system_prompt.trim() }));
    }
    for msg in history {
        let role = if msg.role == "assistant" { "assistant" } else { "user" };
        if msg.images.is_empty() || role == "assistant" {
            if !msg.text.trim().is_empty() {
                messages.push(json!({ "role": role, "content": msg.text }));
            }
        } else {
            let mut parts = Vec::new();
            if !msg.text.trim().is_empty() {
                parts.push(json!({ "type": "text", "text": msg.text }));
            }
            for img in &msg.images {
                parts.push(json!({
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:{};base64,{}", img.mime_type, img.data_base64)
                    }
                }));
            }
            if !parts.is_empty() {
                messages.push(json!({ "role": role, "content": parts }));
            }
        }
    }
    messages
}

pub fn build_anthropic_chat_messages(history: &[ChatTurnMessage]) -> Vec<Value> {
    fn turn_parts(msg: &ChatTurnMessage, role: &str) -> Vec<Value> {
        let mut parts = Vec::new();
        if role == "user" {
            for img in &msg.images {
                parts.push(json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img.mime_type,
                        "data": img.data_base64
                    }
                }));
            }
        }
        if !msg.text.trim().is_empty() {
            parts.push(json!({ "type": "text", "text": msg.text }));
        }
        parts
    }

    // Store paired (role, parts) first so consecutive same-role turns coalesce cleanly
    // (e.g. after skipped "error" messages, Anthropic rejects adjacent user turns).
    let mut grouped: Vec<(&'static str, Vec<Value>)> = Vec::new();
    for msg in history {
        let role = if msg.role == "assistant" { "assistant" } else { "user" };
        let mut parts = turn_parts(msg, role);
        if parts.is_empty() {
            continue;
        }
        if let Some((last_role, last_parts)) = grouped.last_mut() {
            if *last_role == role {
                last_parts.append(&mut parts);
                continue;
            }
        }
        grouped.push((role, parts));
    }

    grouped
        .into_iter()
        .map(|(role, parts)| {
            if parts.len() == 1 && parts[0].get("type").and_then(|t| t.as_str()) == Some("text") {
                if let Some(txt) = parts[0].get("text").and_then(|t| t.as_str()) {
                    return json!({ "role": role, "content": txt });
                }
            }
            json!({ "role": role, "content": parts })
        })
        .collect()
}

pub fn build_gemini_chat_contents(history: &[ChatTurnMessage]) -> Vec<Value> {
    let mut grouped: Vec<(&'static str, Vec<Value>)> = Vec::new();
    for msg in history {
        let role = if msg.role == "assistant" { "model" } else { "user" };
        let mut parts = Vec::new();
        if !msg.text.trim().is_empty() {
            parts.push(json!({ "text": msg.text }));
        }
        if role == "user" {
            for img in &msg.images {
                parts.push(json!({
                    "inline_data": {
                        "mime_type": img.mime_type,
                        "data": img.data_base64
                    }
                }));
            }
        }
        if parts.is_empty() {
            continue;
        }
        if let Some((last_role, last_parts)) = grouped.last_mut() {
            if *last_role == role {
                last_parts.append(&mut parts);
                continue;
            }
        }
        grouped.push((role, parts));
    }
    grouped
        .into_iter()
        .map(|(role, parts)| json!({ "role": role, "parts": parts }))
        .collect()
}

fn sanitize_err_secret(message: String, api_key: &str) -> String {
    let key = api_key.trim();
    if key.is_empty() {
        message
    } else {
        message.replace(key, "[REDACTED]")
    }
}

fn format_chat_reqwest_err(prefix: &str, e: reqwest::Error, api_key: &str) -> String {
    sanitize_err_secret(format!("{prefix}: {}", e.without_url()), api_key)
}

async fn post_openai_chat(
    url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    history: &[ChatTurnMessage],
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(60)?;
    let body = json!({
        "model": model,
        "messages": build_openai_chat_messages(system_prompt, history),
        "temperature": 0.4,
        "max_tokens": max_tokens
    });
    let mut req = client.post(url);
    if !api_key.trim().is_empty() {
        req = req.bearer_auth(api_key.trim());
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format_chat_reqwest_err("Connection error", e, api_key))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(sanitize_err_secret(format!("Provider error ({status}): {err_body}"), api_key));
    }
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format_chat_reqwest_err("Invalid provider response", e, api_key))?;
    extract_openai_content(&val).ok_or_else(|| "Provider returned an empty response.".to_string())
}

async fn post_anthropic_chat(
    url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    history: &[ChatTurnMessage],
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(60)?;
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "messages": build_anthropic_chat_messages(history)
    });
    if !system_prompt.trim().is_empty() {
        body["system"] = json!(system_prompt.trim());
    }
    let mut req = client.post(url).header("anthropic-version", "2023-06-01");
    if !api_key.trim().is_empty() {
        req = req.header("x-api-key", api_key.trim());
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format_chat_reqwest_err("Connection error", e, api_key))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(sanitize_err_secret(format!("Provider error ({status}): {err_body}"), api_key));
    }
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format_chat_reqwest_err("Invalid provider response", e, api_key))?;
    extract_anthropic_content(&val).ok_or_else(|| "Provider returned an empty response.".to_string())
}

async fn post_gemini_chat(
    api_key: &str,
    custom_url: Option<&str>,
    custom_model: Option<&str>,
    system_prompt: &str,
    history: &[ChatTurnMessage],
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(60)?;
    let mut body = json!({
        "contents": build_gemini_chat_contents(history),
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": max_tokens
        }
    });
    if !system_prompt.trim().is_empty() {
        body["system_instruction"] = json!({ "parts": [{ "text": system_prompt.trim() }] });
    }

    if let Some(url) = custom_url {
        let endpoint = normalize_gemini_generate_url(url, custom_model.unwrap_or(""))?;
        let mut req = client.post(&endpoint);
        if !api_key.trim().is_empty() && !endpoint.contains("key=") {
            req = req.header("x-goog-api-key", api_key.trim());
        }
        let resp = req
            .json(&body)
            .send()
            .await
            .map_err(|e| format_chat_reqwest_err("Connection error", e, api_key))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(sanitize_err_secret(format!("Provider error ({status}): {err_body}"), api_key));
        }
        let val: Value = resp
            .json()
            .await
            .map_err(|e| format_chat_reqwest_err("Invalid provider response", e, api_key))?;
        return extract_gemini_content(&val)
            .ok_or_else(|| "Provider returned an empty response.".to_string());
    }

    let trimmed_key = api_key.trim();
    let is_aq = trimmed_key.starts_with("AQ.");
    let candidates = gemini_candidate_urls(trimmed_key);

    let mut gl_err: Option<String> = None;
    let mut last_err = "Failed connecting to Gemini".to_string();
    let mut skip_generativelanguage = false;
    for url in candidates {
        let is_gl = url.contains("generativelanguage.googleapis.com");
        if skip_generativelanguage && is_gl {
            continue;
        }
        let mut req = client.post(&url);
        if !trimmed_key.is_empty() {
            req = req.header("x-goog-api-key", trimmed_key);
        }
        let resp = match req.json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                let err = format_chat_reqwest_err("Gemini connection error", e, trimmed_key);
                if is_gl && gl_err.is_none() {
                    gl_err = Some(err.clone());
                }
                last_err = err;
                continue;
            }
        };
        if resp.status().is_success() {
            let val: Value = resp
                .json()
                .await
                .map_err(|e| format_chat_reqwest_err("Invalid Gemini response", e, trimmed_key))?;
            if let Some(text) = extract_gemini_content(&val) {
                record_working_gemini_url(trimmed_key, &url);
                return Ok(text);
            }
            let err = "Gemini returned an empty response.".to_string();
            if is_gl && gl_err.is_none() {
                gl_err = Some(err.clone());
            }
            last_err = err;
            continue;
        }
        let status = resp.status();
        let body_txt = resp.text().await.unwrap_or_default();
        let err = sanitize_err_secret(format!("Gemini error ({status}): {body_txt}"), trimmed_key);
        if is_gl {
            gl_err = Some(err.clone());
        }
        last_err = if !is_gl && is_vertex_disabled_err(&err) {
            gl_err.clone().unwrap_or(err)
        } else {
            err
        };
        let code = status.as_u16();
        if code != 404 && code != 429 && code != 503 {
            if is_aq && is_gl {
                skip_generativelanguage = true;
                continue;
            }
            break;
        }
    }
    Err(last_err)
}

async fn post_custom_chat_with_format(
    format: &str,
    url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    history: &[ChatTurnMessage],
    max_tokens: u32,
) -> Result<String, String> {
    match format {
        "anthropic" => {
            let endpoint = normalize_anthropic_messages_url(url)?;
            let model_name = if model.trim().is_empty() {
                ANTHROPIC_DEFAULT_MODEL
            } else {
                model.trim()
            };
            post_anthropic_chat(
                &endpoint,
                api_key,
                model_name,
                system_prompt,
                history,
                max_tokens,
            )
            .await
        }
        "gemini" => {
            post_gemini_chat(
                api_key,
                Some(url),
                Some(model),
                system_prompt,
                history,
                max_tokens,
            )
            .await
        }
        _ => {
            let endpoint = normalize_openai_chat_url(url)?;
            let model_name = if model.trim().is_empty() {
                OPENAI_MODEL
            } else {
                model.trim()
            };
            post_openai_chat(
                &endpoint,
                api_key,
                model_name,
                system_prompt,
                history,
                max_tokens,
            )
            .await
        }
    }
}

pub async fn run_chat_completion(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    provider_override: Option<&str>,
    system_prompt: &str,
    history: &[ChatTurnMessage],
    max_tokens: u32,
) -> Result<(String, String), String> {
    let effective = resolve_chat_config(cfg, provider_override);
    let explicit_cloud = provider_override
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("inherit") && !s.eq_ignore_ascii_case("local"));

    if effective.engine == "local" {
        let mut msgs = Vec::new();
        if !system_prompt.trim().is_empty() {
            msgs.push(LocalChatMessage {
                role: "system".to_string(),
                content: system_prompt.trim().to_string(),
            });
        }
        for turn in history {
            if !turn.text.trim().is_empty() {
                msgs.push(LocalChatMessage {
                    role: if turn.role == "assistant" {
                        "assistant".to_string()
                    } else {
                        "user".to_string()
                    },
                    content: turn.text.clone(),
                });
            }
        }
        let reply = run_local_chat(app, msgs, max_tokens, 0.4).await?;
        return Ok((reply, "local".to_string()));
    }

    if let Some(exp) = explicit_cloud {
        match exp.to_ascii_lowercase().as_str() {
            "gemini" if effective.api_key.trim().is_empty() => {
                return Err("Gemini API key is missing in AI Settings.".to_string());
            }
            "groq" if effective.groq_api_key.trim().is_empty() => {
                return Err("Groq API key is missing in AI Settings.".to_string());
            }
            "openai" if effective.openai_api_key.trim().is_empty() => {
                return Err("OpenAI API key is missing in AI Settings.".to_string());
            }
            "custom" if effective.custom_api_url.trim().is_empty() => {
                return Err("Custom API URL is missing in AI Settings.".to_string());
            }
            _ => {}
        }
    }

    let has_images = history.iter().any(|m| !m.images.is_empty());
    match effective.resolve_cloud_target()? {
        CloudTarget::Groq { api_key } => {
            let model = if has_images { GROQ_VISION_MODEL } else { GROQ_TEXT_MODEL };
            let reply = post_openai_chat(
                "https://api.groq.com/openai/v1/chat/completions",
                api_key,
                model,
                system_prompt,
                history,
                max_tokens,
            )
            .await?;
            Ok((reply, "groq".to_string()))
        }
        CloudTarget::OpenAi { api_key } => {
            let reply = post_openai_chat(
                "https://api.openai.com/v1/chat/completions",
                api_key,
                OPENAI_MODEL,
                system_prompt,
                history,
                max_tokens,
            )
            .await?;
            Ok((reply, "openai".to_string()))
        }
        CloudTarget::Gemini { api_key } => {
            let reply =
                post_gemini_chat(api_key, None, None, system_prompt, history, max_tokens).await?;
            Ok((reply, "gemini".to_string()))
        }
        CloudTarget::Custom {
            format,
            url,
            api_key,
            model,
        } => {
            let reply = if format != "auto" {
                post_custom_chat_with_format(
                    format,
                    url,
                    api_key,
                    model,
                    system_prompt,
                    history,
                    max_tokens,
                )
                .await?
            } else {
                let candidates = infer_custom_format_candidates(url, model);
                let mut first_err: Option<String> = None;
                let mut resolved: Option<String> = None;
                for candidate in candidates {
                    match post_custom_chat_with_format(
                        candidate,
                        url,
                        api_key,
                        model,
                        system_prompt,
                        history,
                        max_tokens,
                    )
                    .await
                    {
                        Ok(text) => {
                            record_detected_custom_format(url, model, candidate);
                            resolved = Some(text);
                            break;
                        }
                        Err(err) => {
                            let retry = is_protocol_mismatch_error(&err);
                            if first_err.is_none() {
                                first_err = Some(err);
                            }
                            if !retry {
                                break;
                            }
                        }
                    }
                }
                match resolved {
                    Some(text) => text,
                    None => {
                        return Err(first_err.unwrap_or_else(|| "Custom API request failed".to_string()));
                    }
                }
            };
            Ok((reply, "custom".to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_english_output_prefixes_and_quotes() {
        assert_eq!(
            clean_english_output("Translation: \"Hello world!\""),
            "Hello world!"
        );
        assert_eq!(clean_english_output("'Sample text'"), "Sample text");
    }

    #[test]
    fn parses_fenced_json_array() {
        let raw = "```json\n[\"مرحبا\", \"أهلا\"]\n```";
        assert_eq!(
            parse_json_string_array(raw, 2),
            Some(vec!["مرحبا".to_string(), "أهلا".to_string()])
        );
        assert_eq!(parse_json_string_array("[\"only one\"]", 2), None);
    }

    #[test]
    fn normalizes_openai_urls() {
        assert_eq!(
            normalize_openai_chat_url("https://api.deepseek.com").unwrap(),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_openai_chat_url("https://openrouter.ai/api/v1/").unwrap(),
            "https://openrouter.ai/api/v1/chat/completions"
        );
        assert_eq!(
            normalize_openai_chat_url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            normalize_openai_chat_url("https://api.openai.com/v1/chat/completions").unwrap(),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_openai_chat_url("https://proxy.example.com/custom#").unwrap(),
            "https://proxy.example.com/custom"
        );
        assert!(normalize_openai_chat_url("ftp://example.com").is_err());
        assert!(normalize_openai_chat_url("https://bad host.com/v1").is_err());
    }

    #[test]
    fn normalizes_anthropic_and_gemini_urls() {
        assert_eq!(
            normalize_anthropic_messages_url("https://api.anthropic.com").unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            normalize_anthropic_messages_url("https://proxy.example.com/v1").unwrap(),
            "https://proxy.example.com/v1/messages"
        );
        assert_eq!(
            normalize_anthropic_messages_url("https://api.anthropic.com/v1/messages").unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            normalize_gemini_generate_url("https://my-gemini.proxy", "gemini-2.5-flash").unwrap(),
            "https://my-gemini.proxy/v1beta/models/gemini-2.5-flash:generateContent"
        );
        assert_eq!(
            normalize_gemini_generate_url("https://generativelanguage.googleapis.com/v1beta", "").unwrap(),
            format!("https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_DEFAULT_MODEL}:generateContent")
        );
    }

    #[test]
    fn extracts_openai_and_anthropic_content() {
        let openai_str = json!({ "choices": [{ "message": { "content": "  مرحبا  " } }] });
        assert_eq!(extract_openai_content(&openai_str), Some("مرحبا".to_string()));

        let openai_parts = json!({
            "choices": [{ "message": { "content": [{ "type": "text", "text": "Hello " }, { "type": "text", "text": "world" }] } }]
        });
        assert_eq!(extract_openai_content(&openai_parts), Some("Hello world".to_string()));

        let anthropic = json!({
            "content": [{ "type": "text", "text": "  أهلا بكم  " }]
        });
        assert_eq!(extract_anthropic_content(&anthropic), Some("أهلا بكم".to_string()));
    }

    #[test]
    fn resolves_provider_override_without_mutating_base_keys() {
        let cfg = TranslatorConfig {
            engine: "cloud".into(),
            provider: "gemini".into(),
            groq_api_key: "gsk_test".into(),
            ..Default::default()
        };

        let local = resolve_chat_config(&cfg, Some("local"));
        assert_eq!(local.engine, "local");

        let groq = resolve_chat_config(&cfg, Some("groq"));
        assert_eq!(groq.engine, "cloud");
        assert_eq!(groq.provider, "groq");

        let inherited = resolve_chat_config(&cfg, Some("inherit"));
        assert_eq!(inherited.provider, "gemini");
    }

    #[test]
    fn builds_multimodal_chat_payloads_for_openai_anthropic_and_gemini() {
        let history = vec![
            ChatTurnMessage {
                role: "user".into(),
                text: "Analyze this".into(),
                images: vec![ChatTurnAttachmentImage {
                    mime_type: "image/png".into(),
                    data_base64: "QUJD".into(),
                }],
            },
            ChatTurnMessage {
                role: "assistant".into(),
                text: "Looks good".into(),
                images: vec![],
            },
        ];

        let oa = build_openai_chat_messages("Be concise", &history);
        assert_eq!(oa.len(), 3);
        assert_eq!(oa[0]["role"], "system");
        assert_eq!(oa[1]["content"][1]["type"], "image_url");

        let ant = build_anthropic_chat_messages(&history);
        assert_eq!(ant.len(), 2);
        assert_eq!(ant[0]["content"][0]["type"], "image");

        let gem = build_gemini_chat_contents(&history);
        assert_eq!(gem.len(), 2);
        assert_eq!(gem[1]["role"], "model");
        assert_eq!(gem[0]["parts"][1]["inline_data"]["data"], "QUJD");

        // Consecutive user turns (e.g. after a skipped error turn) must coalesce for Anthropic & Gemini.
        let consecutive = vec![
            ChatTurnMessage { role: "user".into(), text: "First".into(), images: vec![] },
            ChatTurnMessage { role: "user".into(), text: "Second".into(), images: vec![] },
        ];
        let ant_merged = build_anthropic_chat_messages(&consecutive);
        assert_eq!(ant_merged.len(), 1);
        assert_eq!(ant_merged[0]["role"], "user");
        let gem_merged = build_gemini_chat_contents(&consecutive);
        assert_eq!(gem_merged.len(), 1);
        assert_eq!(gem_merged[0]["parts"].as_array().unwrap().len(), 2);

        let sanitized = sanitize_err_secret("GET https://x?key=AIzaSecret123 failed".into(), "AIzaSecret123");
        assert!(!sanitized.contains("AIzaSecret123"));
        assert!(sanitized.contains("[REDACTED]"));
    }

    #[test]
    fn infers_custom_format_candidates_and_mismatch_errors() {
        assert_eq!(
            infer_custom_format_candidates("https://generativelanguage.googleapis.com", ""),
            vec!["gemini"]
        );
        assert_eq!(
            infer_custom_format_candidates("https://api.anthropic.com", ""),
            vec!["anthropic"]
        );
        assert_eq!(
            infer_custom_format_candidates("https://openrouter.ai/api/v1", ""),
            vec!["openai"]
        );
        assert_eq!(
            infer_custom_format_candidates("https://apinex.bond", "gemini-2.5-flash"),
            vec!["openai", "gemini", "anthropic"]
        );
        assert_eq!(
            infer_custom_format_candidates("https://apinex.bond", "claude-3-5-sonnet"),
            vec!["openai", "anthropic", "gemini"]
        );

        assert!(is_protocol_mismatch_error("Provider error (404 Not Found): not found"));
        assert!(is_protocol_mismatch_error("Provider returned an empty response."));
        assert!(!is_protocol_mismatch_error("Provider error (401 Unauthorized): invalid api key"));

        let aq_urls = gemini_candidate_urls("AQ.test_auth_key");
        assert!(aq_urls[0].starts_with("https://generativelanguage.googleapis.com/"));
        assert!(aq_urls.last().unwrap().starts_with("https://aiplatform.googleapis.com/"));

        let aiza_urls = gemini_candidate_urls("AIzaTestKey");
        assert_eq!(aiza_urls.len(), 6);
        assert!(aiza_urls.iter().all(|u| u.starts_with("https://generativelanguage.googleapis.com/")));
    }
}
