pub mod automation;
pub mod capture;
pub mod config;
pub mod engine;
pub mod hotkeys;
pub mod local_runtime;
pub mod ocr;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

use automation::{capture_selected_text, replace_selection_in_place, write_clipboard_unicode};
use capture::{
    annotate_cursor_reticle, capture_region_rect, capture_scrollable_page,
    capture_window_under_cursor, compute_card_position, encode_png_base64_data_url,
    get_cursor_pos, get_monitor_areas, CaptureRect,
};
use config::{migrate_legacy_translator_config, TranslatorConfig, KEY_CARD_POS};
use engine::{explain_cursor_region, translate_inplace, translate_ocr_batch, translate_quick};
use hotkeys::{
    start_hotkey_thread, stop_hotkey_thread, update_bindings, HotkeyBindings, HK_ANY_TO_AR,
    HK_AR_TO_EN, HK_FULLPAGE_OVERLAY, HK_SCREEN_OVERLAY, HK_TOGGLE_PANEL,
};
use local_runtime::{
    cancel_download, delete_local_model, download_model_and_runtime, get_local_status,
    stop_local_server, LocalDownloadStatus,
};
use ocr::{enrich_blocks_with_bg_style, extract_raw_ocr_lines_from_png, group_ocr_lines, OcrBlock};

static BUSY: AtomicBool = AtomicBool::new(false);
static OVERLAY_GENERATION: AtomicU64 = AtomicU64::new(0);
static LAST_CURSOR_CAPTURE: OnceLock<Mutex<Option<(i32, i32)>>> = OnceLock::new();
static PENDING_REGION_ACTION: OnceLock<Mutex<RegionAction>> = OnceLock::new();
static LATEST_CARD: OnceLock<Mutex<Option<CardPayload>>> = OnceLock::new();
static LATEST_OVERLAY: OnceLock<Mutex<Option<OverlayPayload>>> = OnceLock::new();
static LATEST_REGION: OnceLock<Mutex<Option<RegionPayload>>> = OnceLock::new();
static LATEST_SPINNER: OnceLock<Mutex<Option<serde_json::Value>>> = OnceLock::new();

#[derive(Clone, Copy, PartialEq, Eq)]
enum RegionAction {
    Overlay,
    ArToEnCard,
    AnyToArCard,
}

fn pending_region_action_lock() -> &'static Mutex<RegionAction> {
    PENDING_REGION_ACTION.get_or_init(|| Mutex::new(RegionAction::Overlay))
}

fn set_pending_region_action(action: RegionAction) {
    if let Ok(mut g) = pending_region_action_lock().lock() {
        *g = action;
    }
}

fn take_pending_region_action() -> RegionAction {
    if let Ok(mut g) = pending_region_action_lock().lock() {
        let action = *g;
        *g = RegionAction::Overlay;
        action
    } else {
        RegionAction::Overlay
    }
}

fn quick_mode_title(output_mode: &str) -> &'static str {
    match output_mode {
        "explain" => "شرح سريع",
        "summarize" => "ملخص سريع",
        _ => "الترجمة",
    }
}

fn extract_region_ocr_text(raw_lines: &[ocr::RawOcrLine], blocks: &[OcrBlock]) -> String {
    if !blocks.is_empty() {
        blocks
            .iter()
            .map(|b| b.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        raw_lines
            .iter()
            .map(|l| l.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn card_state_lock() -> &'static Mutex<Option<CardPayload>> {
    LATEST_CARD.get_or_init(|| Mutex::new(None))
}

fn overlay_state_lock() -> &'static Mutex<Option<OverlayPayload>> {
    LATEST_OVERLAY.get_or_init(|| Mutex::new(None))
}

fn region_state_lock() -> &'static Mutex<Option<RegionPayload>> {
    LATEST_REGION.get_or_init(|| Mutex::new(None))
}

fn spinner_state_lock() -> &'static Mutex<Option<serde_json::Value>> {
    LATEST_SPINNER.get_or_init(|| Mutex::new(None))
}

pub fn get_initial_state(window: &str) -> Option<serde_json::Value> {
    match window {
        "translator-card" => card_state_lock()
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .and_then(|p| serde_json::to_value(p).ok()),
        "translator-overlay" => overlay_state_lock()
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .and_then(|p| serde_json::to_value(p).ok()),
        "translator-region" => region_state_lock()
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .and_then(|p| serde_json::to_value(p).ok()),
        "translator-spinner" => spinner_state_lock().lock().ok().and_then(|g| g.clone()),
        _ => None,
    }
}

pub fn clear_window_state(window: &str) {
    match window {
        "translator-card" => {
            if let Ok(mut g) = card_state_lock().lock() {
                *g = None;
            }
        }
        "translator-overlay" => {
            if let Ok(mut g) = overlay_state_lock().lock() {
                *g = None;
            }
        }
        "translator-region" => {
            if let Ok(mut g) = region_state_lock().lock() {
                *g = None;
            }
        }
        "translator-spinner" => {
            if let Ok(mut g) = spinner_state_lock().lock() {
                *g = None;
            }
        }
        _ => {}
    }
}

fn ensure_translator_window(app: &AppHandle, label: &str) -> Option<tauri::WebviewWindow> {
    if let Some(win) = app.get_webview_window(label) {
        return Some(win);
    }
    let (url, title, w, h, focused, closable) = match label {
        "translator-card" => ("translator-card.html", "Zenith Translator Card", 440.0, 220.0, false, true),
        "translator-overlay" => ("translator-overlay.html", "Zenith Translator Overlay", 1280.0, 720.0, true, true),
        "translator-region" => ("translator-region.html", "Zenith Translator Region", 1280.0, 720.0, true, true),
        "translator-spinner" => ("translator-spinner.html", "Zenith Translator Status", 180.0, 70.0, false, false),
        _ => return None,
    };

    let win = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(closable)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .focused(focused)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .build()
        .ok()?;

    let w_clone = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w_clone.hide();
        }
    });
    Some(win)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardPayload {
    pub title: String,
    pub mode: String,
    pub source: String,
    pub text: String,
    pub error: bool,
    pub font_size: u32,
    pub timeout_sec: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPayload {
    pub generation: u64,
    pub image_data_url: String,
    pub image_width: u32,
    pub image_height: u32,
    pub fullpage: bool,
    pub opacity: u32,
    pub font_size: u32,
    pub status: String,
    pub blocks: Vec<OcrBlock>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionPayload {
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub monitor_w: i32,
    pub monitor_h: i32,
    pub background_data_url: String,
}

pub fn init(app: &AppHandle) {
    migrate_legacy_translator_config(app);
    // Refresh SETTINGS_CACHE from disk if migration wrote anything
    crate::utils::init_settings_cache(app);

    let cfg = TranslatorConfig::from_app(app);
    let bindings = HotkeyBindings {
        enabled: cfg.enabled,
        ar_to_en: cfg.hotkey_ar_to_en.clone(),
        any_to_ar: cfg.hotkey_any_to_ar.clone(),
        screen_overlay: cfg.hotkey_screen_overlay.clone(),
        fullpage_overlay: cfg.hotkey_fullpage_overlay.clone(),
        toggle_panel: cfg.hotkey_toggle_panel.clone(),
    };

    let app_handle = app.clone();
    start_hotkey_thread(bindings, move |id| {
        handle_hotkey(&app_handle, id);
    });
}

pub fn shutdown() {
    stop_hotkey_thread();
    cancel_download();
    stop_local_server();
}

pub fn sync_hotkeys_from_settings(app: &AppHandle) {
    let cfg = TranslatorConfig::from_app(app);
    update_bindings(HotkeyBindings {
        enabled: cfg.enabled,
        ar_to_en: cfg.hotkey_ar_to_en,
        any_to_ar: cfg.hotkey_any_to_ar,
        screen_overlay: cfg.hotkey_screen_overlay,
        fullpage_overlay: cfg.hotkey_fullpage_overlay,
        toggle_panel: cfg.hotkey_toggle_panel,
    });
}

fn handle_hotkey(app: &AppHandle, id: i32) {
    let cfg = TranslatorConfig::from_app(app);
    if id == HK_TOGGLE_PANEL {
        open_translator_settings_tab(app);
        return;
    }
    if !cfg.enabled {
        return;
    }

    match id {
        HK_AR_TO_EN => trigger_ar_to_en(app.clone()),
        HK_ANY_TO_AR => trigger_any_to_ar(app.clone()),
        HK_SCREEN_OVERLAY => trigger_screen_overlay(app.clone(), None),
        HK_FULLPAGE_OVERLAY => trigger_fullpage_overlay(app.clone()),
        _ => {}
    }
}

pub fn open_translator_settings_tab(app: &AppHandle) {
    crate::commands::open_settings_window(app.clone());
    let _ = app.emit("open-settings-tab", "translator");
}

fn show_spinner_near_cursor(app: &AppHandle, label: &str) {
    let cursor = get_cursor_pos();
    let (work, _) = get_monitor_areas(cursor);
    let pos = compute_card_position(cursor, work, 180, 64, None);
    let payload = serde_json::json!({ "visible": true, "label": label });
    if let Ok(mut g) = spinner_state_lock().lock() {
        *g = Some(payload.clone());
    }
    if let Some(win) = ensure_translator_window(app, "translator-spinner") {
        let _ = win.set_position(PhysicalPosition::new(pos.0, pos.1));
        let _ = win.set_size(PhysicalSize::new(180, 64));
        let _ = win.emit("translator-spinner-state", payload);
        let _ = win.show();
    }
}

fn hide_spinner(app: &AppHandle) {
    clear_window_state("translator-spinner");
    if let Some(win) = app.get_webview_window("translator-spinner") {
        let _ = win.emit("translator-spinner-state", serde_json::json!({ "visible": false }));
        let _ = win.hide();
    }
}

fn show_card(app: &AppHandle, cfg: &TranslatorConfig, cursor: (i32, i32), payload: CardPayload) {
    let char_count = payload.text.chars().count();
    let card_w: i32 = if char_count > 380 { 520 } else { 440 };
    let est_lines = ((char_count as f64) / 48.0).ceil().clamp(2.0, 12.0) as i32;
    let card_h: i32 = (128 + est_lines * ((cfg.font_size as i32) + 8)).clamp(170, 440);
    let (work, _) = get_monitor_areas(cursor);
    let pos = compute_card_position(cursor, work, card_w, card_h, cfg.card_pos);

    if let Ok(mut g) = card_state_lock().lock() {
        *g = Some(payload.clone());
    }
    if let Some(win) = ensure_translator_window(app, "translator-card") {
        let _ = win.set_size(PhysicalSize::new(card_w as u32, card_h as u32));
        let _ = win.set_position(PhysicalPosition::new(pos.0, pos.1));
        let _ = win.emit("translator-card-data", payload);
        let _ = win.show();
    }
}

pub fn trigger_ar_to_en(app: AppHandle) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _reset = BusyGuard;
        let cfg = TranslatorConfig::from_app(&app);
        let cursor = get_cursor_pos();

        let fallback = cfg.select_all_fallback;
        let selected = tokio::task::spawn_blocking(move || capture_selected_text(fallback))
            .await
            .ok()
            .flatten();

        let Some(text) = selected else {
            drop(_reset);
            start_region_selection_with(app, RegionAction::ArToEnCard);
            return;
        };

        show_spinner_near_cursor(&app, "جاري الترجمة");
        let res = translate_inplace(&app, &cfg, &text).await;
        hide_spinner(&app);

        match res {
            Ok(translated) => {
                if cfg.auto_paste_ar_to_en {
                    let t_clone = translated.clone();
                    let pasted =
                        tokio::task::spawn_blocking(move || replace_selection_in_place(&t_clone))
                            .await
                            .unwrap_or(false);
                    if !pasted {
                        show_card(
                            &app,
                            &cfg,
                            cursor,
                            CardPayload {
                                title: "الترجمة الإنجليزية".to_string(),
                                mode: "full".to_string(),
                                source: text,
                                text: translated,
                                error: false,
                                font_size: cfg.font_size,
                                timeout_sec: cfg.card_timeout_sec,
                            },
                        );
                    }
                } else {
                    show_card(
                        &app,
                        &cfg,
                        cursor,
                        CardPayload {
                            title: "الترجمة الإنجليزية".to_string(),
                            mode: "full".to_string(),
                            source: text,
                            text: translated,
                            error: false,
                            font_size: cfg.font_size,
                            timeout_sec: cfg.card_timeout_sec,
                        },
                    );
                }
            }
            Err(err) => {
                show_card(
                    &app,
                    &cfg,
                    cursor,
                    CardPayload {
                        title: "خطأ في الترجمة".to_string(),
                        mode: cfg.output_mode.clone(),
                        source: text,
                        text: err,
                        error: true,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                );
            }
        }
    });
}

pub fn trigger_any_to_ar(app: AppHandle) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _reset = BusyGuard;
        let cfg = TranslatorConfig::from_app(&app);
        let cursor = get_cursor_pos();

        let fallback = cfg.select_all_fallback;
        let selected = tokio::task::spawn_blocking(move || capture_selected_text(fallback))
            .await
            .ok()
            .flatten();

        let Some(text) = selected else {
            drop(_reset);
            start_region_selection_with(app, RegionAction::AnyToArCard);
            return;
        };

        show_spinner_near_cursor(&app, "جاري التحليل");
        let res = translate_quick(&app, &cfg, &text).await;
        hide_spinner(&app);

        let title = quick_mode_title(&cfg.output_mode).to_string();

        match res {
            Ok(out) => show_card(
                &app,
                &cfg,
                cursor,
                CardPayload {
                    title,
                    mode: cfg.output_mode.clone(),
                    source: text,
                    text: out,
                    error: false,
                    font_size: cfg.font_size,
                    timeout_sec: cfg.card_timeout_sec,
                },
            ),
            Err(err) => show_card(
                &app,
                &cfg,
                cursor,
                CardPayload {
                    title: "تعذر التنفيذ".to_string(),
                    mode: cfg.output_mode.clone(),
                    source: text,
                    text: err,
                    error: true,
                    font_size: cfg.font_size,
                    timeout_sec: cfg.card_timeout_sec,
                },
            ),
        }
    });
}

pub fn trigger_screen_overlay(app: AppHandle, mode_override: Option<String>) {
    if mode_override.as_deref() == Some("region") {
        start_region_selection(app);
        return;
    }
    let cfg = TranslatorConfig::from_app(&app);

    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _reset = BusyGuard;
        let gen = OVERLAY_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        hide_translator_windows(&app);
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        let cap_res = tokio::task::spawn_blocking(capture_window_under_cursor)
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);

        let cap = match cap_res {
            Ok(c) => c,
            Err(err) => {
                show_card(
                    &app,
                    &cfg,
                    get_cursor_pos(),
                    CardPayload {
                        title: "خطأ في التصوير".to_string(),
                        mode: "full".to_string(),
                        source: String::new(),
                        text: err,
                        error: true,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                );
                return;
            }
        };

        process_capture_into_overlay(&app, &cfg, gen, cap, false).await;
    });
}

pub fn start_region_selection(app: AppHandle) {
    start_region_selection_with(app, RegionAction::Overlay);
}

pub fn cancel_region_selection(app: &AppHandle) {
    set_pending_region_action(RegionAction::Overlay);
    clear_window_state("translator-region");
    if let Some(win) = app.get_webview_window("translator-region") {
        let _ = win.hide();
    }
}

fn start_region_selection_with(app: AppHandle, action: RegionAction) {
    set_pending_region_action(action);
    let cursor = get_cursor_pos();
    if let Ok(mut g) = LAST_CURSOR_CAPTURE
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *g = Some(cursor);
    }

    tauri::async_runtime::spawn(async move {
        hide_translator_windows(&app);
        tokio::time::sleep(std::time::Duration::from_millis(70)).await;
        let (_, full) = get_monitor_areas(cursor);
        let rect = CaptureRect {
            x: full.0,
            y: full.1,
            w: full.2,
            h: full.3,
        };
        let cap = tokio::task::spawn_blocking(move || capture_region_rect(rect))
            .await
            .ok()
            .and_then(|r| r.ok());

        let Some(cap) = cap else { return };
        let bg_url = encode_png_base64_data_url(&cap.png_bytes);

        let payload = RegionPayload {
            monitor_x: rect.x,
            monitor_y: rect.y,
            monitor_w: rect.w,
            monitor_h: rect.h,
            background_data_url: bg_url,
        };
        if let Ok(mut g) = region_state_lock().lock() {
            *g = Some(payload.clone());
        }
        if let Some(win) = ensure_translator_window(&app, "translator-region") {
            let _ = win.set_position(PhysicalPosition::new(rect.x, rect.y));
            let _ = win.set_size(PhysicalSize::new(rect.w as u32, rect.h as u32));
            let _ = win.emit("translator-region-init", payload);
            let _ = win.show();
            let _ = win.set_focus();
        }
    });
}

pub fn submit_region_selection(app: AppHandle, x: i32, y: i32, w: i32, h: i32) {
    let action = take_pending_region_action();
    clear_window_state("translator-region");
    if let Some(win) = app.get_webview_window("translator-region") {
        let _ = win.hide();
    }
    if w < 8 || h < 8 {
        return;
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let _reset = BusyGuard;
        let cfg = TranslatorConfig::from_app(&app);
        let gen = OVERLAY_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        let rect = CaptureRect { x, y, w, h };
        let cap_res = tokio::task::spawn_blocking(move || capture_region_rect(rect))
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);

        let Ok(cap) = cap_res else {
            return;
        };

        if action != RegionAction::Overlay {
            show_spinner_near_cursor(
                &app,
                if action == RegionAction::ArToEnCard {
                    "جاري الترجمة"
                } else {
                    "جاري التحليل"
                },
            );
        }

        // Extract OCR text from captured region.
        let png_clone = cap.png_bytes.clone();
        let raw_lines =
            tokio::task::spawn_blocking(move || extract_raw_ocr_lines_from_png(&png_clone))
                .await
                .ok()
                .and_then(|r| r.ok())
                .unwrap_or_default();

        let blocks = group_ocr_lines(&raw_lines, cap.rgba.width(), cap.rgba.height());
        let anchor = (x + w / 2, y + h / 2);

        match action {
            RegionAction::ArToEnCard => {
                let ocr_text = extract_region_ocr_text(&raw_lines, &blocks);
                if ocr_text.is_empty() {
                    hide_spinner(&app);
                    show_card(
                        &app,
                        &cfg,
                        anchor,
                        CardPayload {
                            title: "ترجمة فورية".to_string(),
                            mode: "full".to_string(),
                            source: String::new(),
                            text: "لم يتم اكتشاف نص واضح في المنطقة المحددة".to_string(),
                            error: true,
                            font_size: cfg.font_size,
                            timeout_sec: cfg.card_timeout_sec,
                        },
                    );
                    return;
                }
                let res = translate_inplace(&app, &cfg, &ocr_text).await;
                hide_spinner(&app);
                match res {
                    Ok(translated) => show_card(
                        &app,
                        &cfg,
                        anchor,
                        CardPayload {
                            title: "الترجمة الإنجليزية".to_string(),
                            mode: "full".to_string(),
                            source: ocr_text,
                            text: translated,
                            error: false,
                            font_size: cfg.font_size,
                            timeout_sec: cfg.card_timeout_sec,
                        },
                    ),
                    Err(err) => show_card(
                        &app,
                        &cfg,
                        anchor,
                        CardPayload {
                            title: "خطأ في الترجمة".to_string(),
                            mode: "full".to_string(),
                            source: ocr_text,
                            text: err,
                            error: true,
                            font_size: cfg.font_size,
                            timeout_sec: cfg.card_timeout_sec,
                        },
                    ),
                }
                return;
            }
            RegionAction::AnyToArCard => {
                let ocr_text = extract_region_ocr_text(&raw_lines, &blocks);
                if !ocr_text.is_empty() {
                    let res = translate_quick(&app, &cfg, &ocr_text).await;
                    hide_spinner(&app);
                    let title = quick_mode_title(&cfg.output_mode).to_string();
                    match res {
                        Ok(out) => show_card(
                            &app,
                            &cfg,
                            anchor,
                            CardPayload {
                                title,
                                mode: cfg.output_mode.clone(),
                                source: ocr_text,
                                text: out,
                                error: false,
                                font_size: cfg.font_size,
                                timeout_sec: cfg.card_timeout_sec,
                            },
                        ),
                        Err(err) => show_card(
                            &app,
                            &cfg,
                            anchor,
                            CardPayload {
                                title: "تعذر التنفيذ".to_string(),
                                mode: cfg.output_mode.clone(),
                                source: ocr_text,
                                text: err,
                                error: true,
                                font_size: cfg.font_size,
                                timeout_sec: cfg.card_timeout_sec,
                            },
                        ),
                    }
                    return;
                }
                if cfg.engine == "cloud" {
                    let annotated = annotate_cursor_reticle(
                        &cap.rgba,
                        (cap.rgba.width() / 2) as i32,
                        (cap.rgba.height() / 2) as i32,
                    )
                    .unwrap_or_else(|_| cap.png_bytes.clone());
                    let res = explain_cursor_region(&app, &cfg, &annotated, &raw_lines, None).await;
                    hide_spinner(&app);
                    match res {
                        Ok(out) => show_card(
                            &app,
                            &cfg,
                            anchor,
                            CardPayload {
                                title: "تحليل المنطقة المحددة".to_string(),
                                mode: cfg.output_mode.clone(),
                                source: String::new(),
                                text: out,
                                error: false,
                                font_size: cfg.font_size,
                                timeout_sec: cfg.card_timeout_sec,
                            },
                        ),
                        Err(err) => show_card(
                            &app,
                            &cfg,
                            anchor,
                            CardPayload {
                                title: "تعذر التحليل".to_string(),
                                mode: cfg.output_mode.clone(),
                                source: String::new(),
                                text: err,
                                error: true,
                                font_size: cfg.font_size,
                                timeout_sec: cfg.card_timeout_sec,
                            },
                        ),
                    }
                } else {
                    hide_spinner(&app);
                    show_card(
                        &app,
                        &cfg,
                        anchor,
                        CardPayload {
                            title: quick_mode_title(&cfg.output_mode).to_string(),
                            mode: cfg.output_mode.clone(),
                            source: String::new(),
                            text: "لم يتم اكتشاف نص واضح في المنطقة المحددة".to_string(),
                            error: true,
                            font_size: cfg.font_size,
                            timeout_sec: cfg.card_timeout_sec,
                        },
                    );
                }
                return;
            }
            RegionAction::Overlay => {}
        }

        if blocks.is_empty() && cfg.engine == "cloud" {
            show_spinner_near_cursor(&app, "تحليل المنطقة");
            let annotated = annotate_cursor_reticle(
                &cap.rgba,
                (cap.rgba.width() / 2) as i32,
                (cap.rgba.height() / 2) as i32,
            )
            .unwrap_or_else(|_| cap.png_bytes.clone());
            let res = explain_cursor_region(&app, &cfg, &annotated, &raw_lines, None).await;
            hide_spinner(&app);
            match res {
                Ok(out) => show_card(
                    &app,
                    &cfg,
                    (x + w / 2, y + h / 2),
                    CardPayload {
                        title: "تحليل المنطقة المحددة".to_string(),
                        mode: cfg.output_mode.clone(),
                        source: String::new(),
                        text: out,
                        error: false,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                ),
                Err(err) => show_card(
                    &app,
                    &cfg,
                    (x + w / 2, y + h / 2),
                    CardPayload {
                        title: "تعذر التحليل".to_string(),
                        mode: cfg.output_mode.clone(),
                        source: String::new(),
                        text: err,
                        error: true,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                ),
            }
            return;
        }

        process_capture_into_overlay(&app, &cfg, gen, cap, false).await;
    });
}

pub fn trigger_fullpage_overlay(app: AppHandle) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _reset = BusyGuard;
        let cfg = TranslatorConfig::from_app(&app);
        let gen = OVERLAY_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        hide_translator_windows(&app);
        show_spinner_near_cursor(&app, "جاري التقاط الصفحة");

        let cap_res = tokio::task::spawn_blocking(|| capture_scrollable_page(8))
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);

        hide_spinner(&app);

        let cap = match cap_res {
            Ok(c) => c,
            Err(err) => {
                show_card(
                    &app,
                    &cfg,
                    get_cursor_pos(),
                    CardPayload {
                        title: "خطأ في التمرير".to_string(),
                        mode: "full".to_string(),
                        source: String::new(),
                        text: err,
                        error: true,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                );
                return;
            }
        };

        process_capture_into_overlay(&app, &cfg, gen, cap, true).await;
    });
}

async fn process_capture_into_overlay(
    app: &AppHandle,
    cfg: &TranslatorConfig,
    gen: u64,
    cap: capture::WindowCapture,
    fullpage: bool,
) {
    let img_w = cap.rgba.width();
    let img_h = cap.rgba.height();
    let img_url = encode_png_base64_data_url(&cap.png_bytes);

    let png_clone = cap.png_bytes.clone();
    let rgba_clone = cap.rgba.clone();

    let blocks_res = tokio::task::spawn_blocking(move || -> Result<Vec<OcrBlock>, String> {
        let lines = extract_raw_ocr_lines_from_png(&png_clone)?;
        let mut blocks = group_ocr_lines(&lines, rgba_clone.width(), rgba_clone.height());
        enrich_blocks_with_bg_style(&rgba_clone, &mut blocks);
        Ok(blocks)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    let mut blocks = match blocks_res {
        Ok(b) => b,
        Err(err) => {
            show_overlay_window(
                app,
                cap.rect,
                fullpage,
                OverlayPayload {
                    generation: gen,
                    image_data_url: img_url,
                    image_width: img_w,
                    image_height: img_h,
                    fullpage,
                    opacity: cfg.overlay_opacity,
                    font_size: cfg.font_size,
                    status: "error".to_string(),
                    blocks: Vec::new(),
                    error: Some(err),
                },
            );
            return;
        }
    };

    if blocks.is_empty() {
        if let (Some((cx, cy)), "cloud") = (cap.cursor_rel, cfg.engine.as_str()) {
            show_spinner_near_cursor(app, "تحليل الشاشة");
            let annotated = annotate_cursor_reticle(&cap.rgba, cx, cy)
                .unwrap_or_else(|_| cap.png_bytes.clone());
            let res = explain_cursor_region(app, cfg, &annotated, &[], Some((cx, cy))).await;
            hide_spinner(app);
            match res {
                Ok(out) => show_card(
                    app,
                    cfg,
                    (cap.rect.x + cx, cap.rect.y + cy),
                    CardPayload {
                        title: "تحليل تحت المؤشر".to_string(),
                        mode: cfg.output_mode.clone(),
                        source: String::new(),
                        text: out,
                        error: false,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                ),
                Err(err) => show_card(
                    app,
                    cfg,
                    (cap.rect.x + cx, cap.rect.y + cy),
                    CardPayload {
                        title: "تعذر التحليل".to_string(),
                        mode: cfg.output_mode.clone(),
                        source: String::new(),
                        text: err,
                        error: true,
                        font_size: cfg.font_size,
                        timeout_sec: cfg.card_timeout_sec,
                    },
                ),
            }
            return;
        }
        show_overlay_window(
            app,
            cap.rect,
            fullpage,
            OverlayPayload {
                generation: gen,
                image_data_url: img_url,
                image_width: img_w,
                image_height: img_h,
                fullpage,
                opacity: cfg.overlay_opacity,
                font_size: cfg.font_size,
                status: "empty".to_string(),
                blocks: Vec::new(),
                error: Some("لم يتم اكتشاف نصوص واضحة على الشاشة".to_string()),
            },
        );
        return;
    }

    // Show overlay immediately with detected regions while AI translates chunks
    show_overlay_window(
        app,
        cap.rect,
        fullpage,
        OverlayPayload {
            generation: gen,
            image_data_url: img_url,
            image_width: img_w,
            image_height: img_h,
            fullpage,
            opacity: cfg.overlay_opacity,
            font_size: cfg.font_size,
            status: "translating".to_string(),
            blocks: blocks.clone(),
            error: None,
        },
    );

    let chunk_size = if cfg.engine == "local" { 6 } else { 32 };
    for start in (0..blocks.len()).step_by(chunk_size) {
        if OVERLAY_GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }
        let end = (start + chunk_size).min(blocks.len());
        let slice = &blocks[start..end];
        match translate_ocr_batch(app, cfg, slice).await {
            Ok(translations) => {
                for (offset, tr) in translations.into_iter().enumerate() {
                    if let Some(b) = blocks.get_mut(start + offset) {
                        b.translated = tr;
                    }
                }
                let status = if end >= blocks.len() { "done" } else { "translating" };
                if let Ok(mut g) = overlay_state_lock().lock() {
                    if let Some(ref mut cached) = *g {
                        if cached.generation == gen {
                            cached.status = status.to_string();
                            cached.blocks = blocks.clone();
                            cached.error = None;
                        }
                    }
                }
                let _ = app.emit(
                    "translator-overlay-update",
                    serde_json::json!({
                        "generation": gen,
                        "status": status,
                        "blocks": &blocks,
                        "error": serde_json::Value::Null
                    }),
                );
            }
            Err(err) => {
                if let Ok(mut g) = overlay_state_lock().lock() {
                    if let Some(ref mut cached) = *g {
                        if cached.generation == gen {
                            cached.status = "error".to_string();
                            cached.blocks = blocks.clone();
                            cached.error = Some(err.clone());
                        }
                    }
                }
                let _ = app.emit(
                    "translator-overlay-update",
                    serde_json::json!({
                        "generation": gen,
                        "status": "error",
                        "blocks": &blocks,
                        "error": err
                    }),
                );
                return;
            }
        }
    }
}

fn show_overlay_window(
    app: &AppHandle,
    rect: CaptureRect,
    fullpage: bool,
    payload: OverlayPayload,
) {
    let target_rect = if fullpage {
        let (work, _) = get_monitor_areas((rect.x + 10, rect.y + 10));
        CaptureRect {
            x: rect.x,
            y: rect.y.max(work.1),
            w: rect.w.min(work.2),
            h: rect.h.min(work.3),
        }
    } else {
        rect
    };

    if let Ok(mut g) = overlay_state_lock().lock() {
        *g = Some(payload.clone());
    }
    if let Some(win) = ensure_translator_window(app, "translator-overlay") {
        let _ = win.set_position(PhysicalPosition::new(target_rect.x, target_rect.y));
        let _ = win.set_size(PhysicalSize::new(
            target_rect.w.max(200) as u32,
            target_rect.h.max(140) as u32,
        ));
        let _ = win.emit("translator-overlay-init", payload);
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn hide_translator_windows(app: &AppHandle) {
    for label in [
        "translator-card",
        "translator-overlay",
        "translator-region",
        "translator-spinner",
    ] {
        clear_window_state(label);
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.hide();
        }
    }
}

pub fn close_overlay(app: &AppHandle) {
    OVERLAY_GENERATION.fetch_add(1, Ordering::SeqCst);
    clear_window_state("translator-overlay");
    if let Some(win) = app.get_webview_window("translator-overlay") {
        let _ = win.hide();
    }
}

pub fn save_card_position(app: &AppHandle, x: i32, y: i32) {
    let val = serde_json::json!({ "x": x, "y": y }).to_string();
    let _ = crate::commands::save_setting(
        app.clone(),
        KEY_CARD_POS.to_string(),
        serde_json::Value::String(val),
    );
}

pub async fn test_connection(app: &AppHandle) -> Result<String, String> {
    let cfg = TranslatorConfig::from_app(app);
    let sample = "Hello, world!";
    translate_quick(app, &cfg, sample).await
}

pub fn copy_text(text: &str) -> bool {
    write_clipboard_unicode(text)
}

pub fn get_download_status(app: &AppHandle) -> LocalDownloadStatus {
    get_local_status(app)
}

pub async fn start_model_and_runtime_download(app: AppHandle) -> Result<(), String> {
    download_model_and_runtime(app).await
}

pub fn delete_model(app: &AppHandle) -> Result<(), String> {
    delete_local_model(app)
}

struct BusyGuard;
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_mode_title_maps_all_modes() {
        assert_eq!(quick_mode_title("explain"), "شرح سريع");
        assert_eq!(quick_mode_title("summarize"), "ملخص سريع");
        assert_eq!(quick_mode_title("full"), "الترجمة");
        assert_eq!(quick_mode_title("other"), "الترجمة");
    }

    #[test]
    fn extract_region_ocr_text_prefers_blocks_and_falls_back_to_raw_lines() {
        let raw = vec![
            ocr::RawOcrLine {
                left: 0.0,
                top: 0.0,
                width: 10.0,
                height: 10.0,
                text: "  Hello  ".to_string(),
            },
            ocr::RawOcrLine {
                left: 0.0,
                top: 15.0,
                width: 10.0,
                height: 10.0,
                text: "World".to_string(),
            },
        ];
        assert_eq!(extract_region_ocr_text(&raw, &[]), "Hello\nWorld");

        let blocks = vec![OcrBlock {
            id: 0,
            left: 0.0,
            top: 0.0,
            width: 50.0,
            height: 20.0,
            text: "Hello World".to_string(),
            bg_color: String::new(),
            text_color: String::new(),
            translated: String::new(),
        }];
        assert_eq!(extract_region_ocr_text(&raw, &blocks), "Hello World");
    }
}
