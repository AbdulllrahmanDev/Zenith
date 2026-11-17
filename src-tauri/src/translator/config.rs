use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const KEY_ENABLED: &str = "zenith-translator-enabled";
pub const KEY_ENGINE: &str = "zenith-translator-engine";
pub const KEY_PROVIDER: &str = "zenith-translator-provider";
pub const KEY_API_KEY: &str = "zenith-translator-api-key";
pub const KEY_GROQ_API_KEY: &str = "zenith-translator-groq-api-key";
pub const KEY_OPENAI_API_KEY: &str = "zenith-translator-openai-api-key";
pub const KEY_CUSTOM_API_URL: &str = "zenith-translator-custom-api-url";
pub const KEY_CUSTOM_API_KEY: &str = "zenith-translator-custom-api-key";
pub const KEY_CUSTOM_MODEL: &str = "zenith-translator-custom-model";
pub const KEY_CUSTOM_API_FORMAT: &str = "zenith-translator-custom-api-format";
pub const KEY_LOCAL_MODEL_ID: &str = "zenith-translator-local-model-id";
pub const KEY_HOTKEY_AR_TO_EN: &str = "zenith-translator-hotkey-ar-to-en";
pub const KEY_HOTKEY_ANY_TO_AR: &str = "zenith-translator-hotkey-any-to-ar";
pub const KEY_HOTKEY_SCREEN: &str = "zenith-translator-hotkey-screen";
pub const KEY_HOTKEY_FULLPAGE: &str = "zenith-translator-hotkey-fullpage";
pub const KEY_HOTKEY_TOGGLE: &str = "zenith-translator-hotkey-toggle";
pub const KEY_TARGET_LANGUAGE: &str = "zenith-translator-target-language";
pub const KEY_OUTPUT_MODE: &str = "zenith-translator-output-mode";
pub const KEY_DISPLAY_TARGET: &str = "zenith-translator-display-target";
pub const KEY_SELECT_ALL_FALLBACK: &str = "zenith-translator-select-all-fallback";
pub const KEY_AUTO_PASTE_AR_TO_EN: &str = "zenith-translator-auto-paste-ar-to-en";
pub const KEY_CUSTOM_PROMPT_INPLACE: &str = "zenith-translator-custom-prompt-inplace";
pub const KEY_CUSTOM_PROMPT_QUICK: &str = "zenith-translator-custom-prompt-quick";
pub const KEY_FONT_SIZE: &str = "zenith-translator-font-size";
pub const KEY_CARD_TIMEOUT_SEC: &str = "zenith-translator-card-timeout-sec";
pub const KEY_OVERLAY_OPACITY: &str = "zenith-translator-overlay-opacity";
pub const KEY_CARD_POS: &str = "zenith-translator-card-pos";

pub const DEFAULT_LOCAL_MODEL_ID: &str = "qwen2.5-1.5b-instruct-q4_k_m";
pub const LOCAL_MODEL_FILENAME: &str = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
pub const LOCAL_MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true";
pub const LOCAL_MODEL_APPROX_MB: f64 = 986.0;

pub const LLAMA_RUNTIME_ZIP_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b12411/llama-b12411-bin-win-cpu-x64.zip";
pub const LLAMA_RUNTIME_APPROX_MB: f64 = 24.0;

pub const SUPPORTED_TARGET_LANGUAGES: &[&str] = &[
    "Arabic",
    "English",
    "French",
    "Spanish",
    "German",
    "Turkish",
    "Italian",
    "Portuguese",
    "Russian",
    "Chinese",
    "Japanese",
    "Korean",
    "Hindi",
    "Indonesian",
    "Urdu",
    "Dutch",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslatorConfig {
    pub enabled: bool,
    pub engine: String,
    pub provider: String,
    pub api_key: String,
    pub groq_api_key: String,
    pub openai_api_key: String,
    pub custom_api_url: String,
    pub custom_api_key: String,
    pub custom_model: String,
    pub custom_api_format: String,
    pub local_model_id: String,
    pub hotkey_ar_to_en: String,
    pub hotkey_any_to_ar: String,
    pub hotkey_screen_overlay: String,
    pub hotkey_fullpage_overlay: String,
    pub hotkey_toggle_panel: String,
    pub target_language: String,
    pub output_mode: String,
    pub display_target: String,
    pub select_all_fallback: bool,
    pub auto_paste_ar_to_en: bool,
    pub custom_prompt_inplace: String,
    pub custom_prompt_quick: String,
    pub font_size: u32,
    pub card_timeout_sec: u32,
    pub overlay_opacity: u32,
    pub card_pos: Option<(i32, i32)>,
}

impl Default for TranslatorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            engine: "cloud".to_string(),
            provider: "gemini".to_string(),
            api_key: String::new(),
            groq_api_key: String::new(),
            openai_api_key: String::new(),
            custom_api_url: String::new(),
            custom_api_key: String::new(),
            custom_model: String::new(),
            custom_api_format: "openai".to_string(),
            local_model_id: DEFAULT_LOCAL_MODEL_ID.to_string(),
            hotkey_ar_to_en: "Ctrl+Alt+A".to_string(),
            hotkey_any_to_ar: "Ctrl+Alt+X".to_string(),
            hotkey_screen_overlay: "Ctrl+Alt+S".to_string(),
            hotkey_fullpage_overlay: "Ctrl+Alt+W".to_string(),
            hotkey_toggle_panel: "Ctrl+Alt+Space".to_string(),
            target_language: "Arabic".to_string(),
            output_mode: "full".to_string(),
            display_target: "floating".to_string(),
            select_all_fallback: true,
            auto_paste_ar_to_en: true,
            custom_prompt_inplace: String::new(),
            custom_prompt_quick: String::new(),
            font_size: 15,
            card_timeout_sec: 12,
            overlay_opacity: 88,
            card_pos: None,
        }
    }
}

impl TranslatorConfig {
    pub fn from_app(app: &AppHandle) -> Self {
        let get = |k: &str| crate::utils::get_setting_str(app, k);
        Self::from_lookup(|k| get(k))
    }

    pub fn from_lookup<F>(lookup: F) -> Self
    where
        F: Fn(&str) -> Option<String>,
    {
        let mut cfg = Self::default();

        if let Some(v) = lookup(KEY_ENABLED) {
            cfg.enabled = v != "false";
        }
        if let Some(v) = lookup(KEY_ENGINE) {
            let norm = v.trim().to_ascii_lowercase();
            if norm == "cloud" || norm == "local" {
                cfg.engine = norm;
            }
        }
        if let Some(v) = lookup(KEY_PROVIDER) {
            let norm = v.trim().to_ascii_lowercase();
            if norm == "gemini" || norm == "groq" || norm == "openai" || norm == "custom" {
                cfg.provider = norm;
            }
        }
        if let Some(v) = lookup(KEY_API_KEY) {
            cfg.api_key = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_GROQ_API_KEY) {
            cfg.groq_api_key = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_OPENAI_API_KEY) {
            cfg.openai_api_key = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_CUSTOM_API_URL) {
            cfg.custom_api_url = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_CUSTOM_API_KEY) {
            cfg.custom_api_key = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_CUSTOM_MODEL) {
            cfg.custom_model = v.trim().to_string();
        }
        if let Some(v) = lookup(KEY_CUSTOM_API_FORMAT) {
            let norm = v.trim().to_ascii_lowercase();
            if norm == "openai" || norm == "anthropic" || norm == "gemini" {
                cfg.custom_api_format = norm;
            }
        }
        if let Some(v) = lookup(KEY_LOCAL_MODEL_ID) {
            if !v.trim().is_empty() {
                cfg.local_model_id = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_HOTKEY_AR_TO_EN) {
            if !v.trim().is_empty() {
                cfg.hotkey_ar_to_en = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_HOTKEY_ANY_TO_AR) {
            if !v.trim().is_empty() {
                cfg.hotkey_any_to_ar = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_HOTKEY_SCREEN) {
            if !v.trim().is_empty() {
                cfg.hotkey_screen_overlay = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_HOTKEY_FULLPAGE) {
            if !v.trim().is_empty() {
                cfg.hotkey_fullpage_overlay = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_HOTKEY_TOGGLE) {
            if !v.trim().is_empty() {
                cfg.hotkey_toggle_panel = v.trim().to_string();
            }
        }
        if let Some(v) = lookup(KEY_TARGET_LANGUAGE) {
            let trimmed = v.trim();
            if SUPPORTED_TARGET_LANGUAGES.contains(&trimmed) {
                cfg.target_language = trimmed.to_string();
            }
        }
        if let Some(v) = lookup(KEY_OUTPUT_MODE) {
            let norm = v.trim().to_ascii_lowercase();
            if norm == "full" || norm == "explain" || norm == "summarize" {
                cfg.output_mode = norm;
            }
        }
        if let Some(v) = lookup(KEY_DISPLAY_TARGET) {
            let norm = v.trim().to_ascii_lowercase();
            if norm == "floating" || norm == "notch" {
                cfg.display_target = norm;
            }
        }
        if let Some(v) = lookup(KEY_SELECT_ALL_FALLBACK) {
            cfg.select_all_fallback = v != "false";
        }
        if let Some(v) = lookup(KEY_AUTO_PASTE_AR_TO_EN) {
            cfg.auto_paste_ar_to_en = v != "false";
        }
        if let Some(v) = lookup(KEY_CUSTOM_PROMPT_INPLACE) {
            cfg.custom_prompt_inplace = v;
        }
        if let Some(v) = lookup(KEY_CUSTOM_PROMPT_QUICK) {
            cfg.custom_prompt_quick = v;
        }
        if let Some(v) = lookup(KEY_FONT_SIZE) {
            if let Ok(n) = v.trim().parse::<u32>() {
                cfg.font_size = n.clamp(11, 28);
            }
        }
        if let Some(v) = lookup(KEY_CARD_TIMEOUT_SEC) {
            if let Ok(n) = v.trim().parse::<u32>() {
                cfg.card_timeout_sec = n.clamp(3, 60);
            }
        }
        if let Some(v) = lookup(KEY_OVERLAY_OPACITY) {
            if let Ok(n) = v.trim().parse::<u32>() {
                cfg.overlay_opacity = n.clamp(40, 100);
            }
        }
        if let Some(v) = lookup(KEY_CARD_POS) {
            cfg.card_pos = parse_card_pos(&v);
        }

        cfg
    }

    pub fn resolve_cloud_target(&self) -> Result<CloudTarget<'_>, String> {
        if self.provider == "custom" {
            if self.custom_api_url.is_empty() {
                return Err("يرجى إدخال رابط الـ API المخصص في إعدادات المترجم".to_string());
            }
            return Ok(CloudTarget::Custom {
                format: self.custom_api_format.as_str(),
                url: self.custom_api_url.as_str(),
                api_key: self.custom_api_key.as_str(),
                model: self.custom_model.as_str(),
            });
        }

        match self.provider.as_str() {
            "groq" if !self.groq_api_key.is_empty() => Ok(CloudTarget::Groq {
                api_key: self.groq_api_key.as_str(),
            }),
            "openai" if !self.openai_api_key.is_empty() => Ok(CloudTarget::OpenAi {
                api_key: self.openai_api_key.as_str(),
            }),
            "gemini" if !self.api_key.is_empty() => Ok(CloudTarget::Gemini {
                api_key: self.api_key.as_str(),
            }),
            _ => {
                if !self.api_key.is_empty() {
                    Ok(CloudTarget::Gemini {
                        api_key: self.api_key.as_str(),
                    })
                } else if !self.groq_api_key.is_empty() {
                    Ok(CloudTarget::Groq {
                        api_key: self.groq_api_key.as_str(),
                    })
                } else if !self.openai_api_key.is_empty() {
                    Ok(CloudTarget::OpenAi {
                        api_key: self.openai_api_key.as_str(),
                    })
                } else {
                    Err("يرجى إدخال مفتاح API في إعدادات المترجم أو التحويل للمحرك المحلي".to_string())
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudTarget<'a> {
    Gemini { api_key: &'a str },
    Groq { api_key: &'a str },
    OpenAi { api_key: &'a str },
    Custom {
        format: &'a str,
        url: &'a str,
        api_key: &'a str,
        model: &'a str,
    },
}

pub fn parse_card_pos(raw: &str) -> Option<(i32, i32)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let (Some(x), Some(y)) = (val.get("x").and_then(|v| v.as_i64()), val.get("y").and_then(|v| v.as_i64())) {
            return Some((x as i32, y as i32));
        }
    }
    None
}

pub fn translator_root_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| {
            std::env::var_os("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(std::env::temp_dir)
                .join("io.github.abdulllrahmandev.zenith")
        })
        .join("translator")
}

pub fn translator_models_dir(app: &AppHandle) -> PathBuf {
    translator_root_dir(app).join("models")
}

pub fn translator_runtime_dir(app: &AppHandle) -> PathBuf {
    translator_root_dir(app).join("runtime")
}

/// Migrate existing settings from `%APPDATA%/AntigravityTranslator/config.json` once
/// if Zenith has no translator keys stored yet.
pub fn migrate_legacy_translator_config(app: &AppHandle) {
    let Ok(app_config_dir) = app.path().app_config_dir() else {
        return;
    };
    let zenith_settings_path = app_config_dir.join("settings.json");

    // Only import when Zenith has no translator keys configured at all.
    let existing = crate::utils::read_settings_file(&zenith_settings_path).unwrap_or_default();
    if existing.keys().any(|k| k.starts_with("zenith-translator-")) {
        return;
    }

    let Some(appdata) = std::env::var_os("APPDATA") else {
        return;
    };
    let legacy_path = PathBuf::from(appdata)
        .join("AntigravityTranslator")
        .join("config.json");
    let Ok(raw) = std::fs::read_to_string(&legacy_path) else {
        return;
    };
    let Ok(legacy) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw) else {
        return;
    };

    let mapping: &[(&str, &str)] = &[
        ("enabled", KEY_ENABLED),
        ("engine", KEY_ENGINE),
        ("provider", KEY_PROVIDER),
        ("api_key", KEY_API_KEY),
        ("groq_api_key", KEY_GROQ_API_KEY),
        ("openai_api_key", KEY_OPENAI_API_KEY),
        ("local_model_id", KEY_LOCAL_MODEL_ID),
        ("hotkey_ar_to_en", KEY_HOTKEY_AR_TO_EN),
        ("hotkey_any_to_ar", KEY_HOTKEY_ANY_TO_AR),
        ("hotkey_screen_overlay", KEY_HOTKEY_SCREEN),
        ("hotkey_fullpage_overlay", KEY_HOTKEY_FULLPAGE),
        ("hotkey_toggle_panel", KEY_HOTKEY_TOGGLE),
        ("target_language", KEY_TARGET_LANGUAGE),
        ("output_mode", KEY_OUTPUT_MODE),
        ("select_all_fallback", KEY_SELECT_ALL_FALLBACK),
        ("auto_paste_ar_to_en", KEY_AUTO_PASTE_AR_TO_EN),
        ("custom_prompt_inplace", KEY_CUSTOM_PROMPT_INPLACE),
        ("custom_prompt_quick", KEY_CUSTOM_PROMPT_QUICK),
        ("font_size", KEY_FONT_SIZE),
        ("card_timeout_sec", KEY_CARD_TIMEOUT_SEC),
        ("overlay_opacity", KEY_OVERLAY_OPACITY),
    ];

    if let Some(parent) = zenith_settings_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    for (old_k, new_k) in mapping {
        if let Some(val) = legacy.get(*old_k) {
            let str_val = match val {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Bool(b) => {
                    if *b {
                        "true".to_string()
                    } else {
                        "false".to_string()
                    }
                }
                serde_json::Value::Number(n) => n.to_string(),
                _ => continue,
            };
            let _ = crate::utils::save_setting_file(
                &zenith_settings_path,
                (*new_k).to_string(),
                serde_json::Value::String(str_val),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_clamps_numbers_and_validates_enums() {
        let mut map = HashMap::new();
        map.insert(KEY_ENGINE.to_string(), "LOCAL".to_string());
        map.insert(KEY_PROVIDER.to_string(), "invalid".to_string());
        map.insert(KEY_DISPLAY_TARGET.to_string(), "NOTCH".to_string());
        map.insert(KEY_FONT_SIZE.to_string(), "99".to_string());
        map.insert(KEY_CARD_TIMEOUT_SEC.to_string(), "1".to_string());
        map.insert(KEY_OVERLAY_OPACITY.to_string(), "200".to_string());
        map.insert(KEY_ENABLED.to_string(), "false".to_string());
        map.insert(KEY_CARD_POS.to_string(), r#"{"x":120,"y":340}"#.to_string());

        let cfg = TranslatorConfig::from_lookup(|k| map.get(k).cloned());
        assert!(!cfg.enabled);
        assert_eq!(cfg.engine, "local");
        assert_eq!(cfg.provider, "gemini");
        assert_eq!(cfg.display_target, "notch");
        assert_eq!(cfg.font_size, 28);
        assert_eq!(cfg.card_timeout_sec, 3);
        assert_eq!(cfg.overlay_opacity, 100);
        assert_eq!(cfg.card_pos, Some((120, 340)));
    }

    #[test]
    fn custom_provider_resolves_with_and_without_key() {
        let mut map = HashMap::new();
        map.insert(KEY_PROVIDER.to_string(), "CUSTOM".to_string());
        map.insert(
            KEY_CUSTOM_API_URL.to_string(),
            "  http://localhost:11434/v1  ".to_string(),
        );
        map.insert(KEY_CUSTOM_MODEL.to_string(), "  qwen2.5:7b ".to_string());
        map.insert(KEY_CUSTOM_API_FORMAT.to_string(), "ANTHROPIC".to_string());

        let cfg = TranslatorConfig::from_lookup(|k| map.get(k).cloned());
        assert_eq!(cfg.provider, "custom");
        assert_eq!(cfg.custom_api_url, "http://localhost:11434/v1");
        assert_eq!(cfg.custom_model, "qwen2.5:7b");
        assert_eq!(cfg.custom_api_format, "anthropic");
        assert_eq!(
            cfg.resolve_cloud_target(),
            Ok(CloudTarget::Custom {
                format: "anthropic",
                url: "http://localhost:11434/v1",
                api_key: "",
                model: "qwen2.5:7b",
            })
        );

        map.remove(KEY_CUSTOM_API_URL);
        map.insert(KEY_API_KEY.to_string(), "AIza-test".to_string());
        let missing_url_cfg = TranslatorConfig::from_lookup(|k| map.get(k).cloned());
        assert!(missing_url_cfg.resolve_cloud_target().is_err());
    }
}
