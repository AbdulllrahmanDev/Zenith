use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;

use super::config::TranslatorConfig;
use super::local_runtime::{run_local_chat, LocalChatMessage};
use super::ocr::{pick_nearest_ocr_lines, OcrBlock, RawOcrLine};

const GEMINI_DEFAULT_MODEL: &str = "gemini-2.5-flash-lite";
const GROQ_TEXT_MODEL: &str = "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL: &str = "meta-llama/llama-4-scout-17b-16e-instruct";
const OPENAI_MODEL: &str = "gpt-4o-mini";

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

fn http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
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

    let resp = client
        .post(url)
        .bearer_auth(api_key)
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
    val["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "رد فارغ من المزود".to_string())
}

async fn call_gemini(
    api_key: &str,
    sys: &str,
    user_text: &str,
    image_png: Option<&[u8]>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = http_client(45)?;
    let mut parts = vec![json!({ "text": user_text })];
    if let Some(png) = image_png {
        parts.push(json!({
            "inline_data": {
                "mime_type": "image/png",
                "data": BASE64.encode(png)
            }
        }));
    }

    let body = json!({
        "system_instruction": { "parts": [{ "text": sys }] },
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens
        }
    });

    let candidates = if api_key.starts_with("AQ.") {
        vec![format!(
            "https://aiplatform.googleapis.com/v1/publishers/google/models/{GEMINI_DEFAULT_MODEL}:generateContent?key={api_key}"
        )]
    } else {
        vec![
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_DEFAULT_MODEL}:generateContent?key={api_key}"
            ),
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            ),
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            ),
        ]
    };

    let mut last_err = "تعذر الاتصال بـ Gemini".to_string();
    for url in candidates {
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("خطأ اتصال Gemini: {e}");
                continue;
            }
        };
        if resp.status().is_success() {
            let val: Value = resp
                .json()
                .await
                .map_err(|e| format!("فشل قراءة رد Gemini: {e}"))?;
            if let Some(text) = val["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                let cleaned = text.trim().to_string();
                if !cleaned.is_empty() {
                    return Ok(cleaned);
                }
            }
            last_err = "عاد Gemini برد فارغ".to_string();
            continue;
        }
        let status = resp.status();
        let body_txt = resp.text().await.unwrap_or_default();
        last_err = format!("خطأ Gemini ({status}): {body_txt}");
        // Retry next model only if model not found / rate-limited / overloaded
        if status.as_u16() != 404 && status.as_u16() != 429 && status.as_u16() != 503 {
            break;
        }
    }

    Err(last_err)
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

    let Some((provider, key)) = cfg.active_cloud_key() else {
        return Err("يرجى إدخال مفتاح API في إعدادات المترجم أو التحويل للمحرك المحلي".to_string());
    };

    match provider {
        "groq" => {
            call_openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions",
                key,
                GROQ_TEXT_MODEL,
                sys,
                user,
                None,
                max_tokens,
            )
            .await
        }
        "openai" => {
            call_openai_compatible(
                "https://api.openai.com/v1/chat/completions",
                key,
                OPENAI_MODEL,
                sys,
                user,
                None,
                max_tokens,
            )
            .await
        }
        _ => call_gemini(key, sys, user, None, max_tokens).await,
    }
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

    let Some((provider, key)) = cfg.active_cloud_key() else {
        return Err("يرجى إدخال مفتاح API أو تفعيل المحرك المحلي".to_string());
    };

    let mode_hint = match cfg.output_mode.as_str() {
        "explain" => format!("Explain concisely what is under or right next to the target reticle marker in {target}."),
        "summarize" => format!("Summarize concisely the section under the target reticle marker in {target}."),
        _ => format!("Translate accurately into {target} the text, element, button, or paragraph right under the target reticle marker."),
    };
    let sys = format!(
        "You are looking at a screenshot with a circular target reticle. {mode_hint} Output ONLY the response in {target}."
    );

    match provider {
        "groq" => {
            call_openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions",
                key,
                GROQ_VISION_MODEL,
                &sys,
                "Read and process the content at the crosshair reticle.",
                Some(annotated_png),
                900,
            )
            .await
        }
        "openai" => {
            call_openai_compatible(
                "https://api.openai.com/v1/chat/completions",
                key,
                OPENAI_MODEL,
                &sys,
                "Read and process the content at the crosshair reticle.",
                Some(annotated_png),
                900,
            )
            .await
        }
        _ => {
            call_gemini(
                key,
                &sys,
                "Read and process the content at the crosshair reticle.",
                Some(annotated_png),
                900,
            )
            .await
        }
    }
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
}
