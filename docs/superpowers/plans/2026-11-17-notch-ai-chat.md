# Notch AI Chat & Shared AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI Chat panel with file/image attachments and persistent history to Zenith's notch bar, while separating shared AI provider/model settings into a new **AI** (`الذكاء الاصطناعي`) Settings tab shared with the Translator.

**Architecture:** Generalize the existing Rust provider helpers in `translator/engine.rs` to handle multi-turn `ChatTurnMessage` histories and optional image attachments, then add `src-tauri/src/ai_chat.rs` for file/PDF/Office/image extraction, conversation persistence (`ai_chats.json`), and cancellation-safe async generation. On the frontend, split AI provider configuration out of `TranslatorTab.tsx` into `AiTab.tsx`, build `AiChatNotchPanel.tsx` with RTL/Arabic IME focus support and native file picking, and wire `"ai-chat"` plus conditional drag-and-drop routing into `App.tsx`.

**Tech Stack:** Rust (Tauri v2, `reqwest`, `serde_json`, `image`, `zip`, `base64`, `windows` 0.61 `Data_Pdf` + `Media_Ocr`), React 19, TypeScript, Framer Motion, Lucide React, `@tauri-apps/plugin-dialog`.

**Spec:** [2026-11-17-notch-ai-chat-design.md](file:///e:/Projects/Desktop/Zenith/docs/superpowers/specs/2026-11-17-notch-ai-chat-design.md)

## Global Constraints

- Windows-only Tauri v2 app; `cargo check --locked`, `cargo clippy --locked --all-targets`, and `cargo test --locked` in `src-tauri` must pass without modifying `Cargo.toml` or `Cargo.lock`.
- Frontend typecheck and bundle (`bun run build` -> `tsc && vite build`) must pass with `strict`, `noUnusedLocals`, and `noUnusedParameters` enabled.
- Existing `zenith-translator-*` setting keys remain the underlying storage keys so existing user API keys and local model config keep working with zero migration loss.
- Do not expand `tauri.conf.json` CSP `connect-src` for AI providers; all AI HTTP requests run in Rust.
- `.ai-chat-notch-wrapper` must use `position: absolute; top: 36px; left: 0; width: 100%; height: calc(100% - 36px); z-index: 2;` to prevent flex-layout exit/enter collisions with other notch panels.

## Review Focus

- **Empty/corrupted/binary/oversized files dropped onto AI Chat:** `prepare_attachment` must reject binary/null-byte non-image files cleanly with a per-attachment `error` instead of panicking or injecting garbage UTF-8 into prompts, and cap extracted text at 24,000 chars (`truncated: true`).
- **Image attachment sent to text-only models (local `llama.cpp` or text-only custom models):** backend must run Windows OCR fallback on the image (or surface a clear actionable error if OCR returns nothing) rather than silently dropping the image.
- **Native file picker focus theft:** clicking Attach (`@tauri-apps/plugin-dialog` `open`) opens an OS modal that steals focus from the notch window; `onPinChange(true)` must stay active until `open()` resolves so `releaseNotchHover` does not collapse the notch mid-pick.
- **Drag-and-drop routing boundary:** dragging onto the notch when `notchPanelMode === "ai-chat"` or (`!isOpen && lastPanel === "ai-chat" && aiChatEnabled`) must route files to AI Chat without opening Shelf, whereas dragging when any other panel is active/last-used must preserve Shelf drag-and-drop unchanged.
- **In-flight cancellation & rapid panel/conversation switching:** clicking Stop (`ai_chat_cancel`) or switching conversations mid-generation must increment a generation counter so a late HTTP response cannot append to the wrong conversation or overwrite `busy` state.

---

### Task 1: Multi-Turn & Multimodal Rust Provider Engine

**Files:**
- Modify: `src-tauri/src/translator/config.rs`
- Modify: `src-tauri/src/translator/engine.rs`

**Interfaces:**
- Consumes: `TranslatorConfig::from_app`, `CloudTarget`, `normalize_*_url`, `extract_*_content`, `run_local_chat` (`src-tauri/src/translator/local_runtime.rs`).
- Produces:
  - `pub struct ChatTurnAttachmentImage { pub mime_type: String, pub data_base64: String }` (in `translator::engine`)
  - `pub struct ChatTurnMessage { pub role: String, pub text: String, pub images: Vec<ChatTurnAttachmentImage> }` (in `translator::engine`)
  - `pub fn resolve_chat_config(base: &TranslatorConfig, provider_override: Option<&str>) -> TranslatorConfig` (in `translator::engine`)
  - `pub fn build_openai_chat_messages(system_prompt: &str, history: &[ChatTurnMessage]) -> Vec<serde_json::Value>` (in `translator::engine`)
  - `pub fn build_anthropic_chat_messages(history: &[ChatTurnMessage]) -> Vec<serde_json::Value>` (in `translator::engine`)
  - `pub fn build_gemini_chat_contents(history: &[ChatTurnMessage]) -> Vec<serde_json::Value>` (in `translator::engine`)
  - `pub async fn run_chat_completion(app: &AppHandle, cfg: &TranslatorConfig, provider_override: Option<&str>, system_prompt: &str, history: &[ChatTurnMessage], max_tokens: u32) -> Result<(String, String), String>` (returns `(reply_text, provider_label)`)

- [ ] **Step 1: Write failing unit tests in `src-tauri/src/translator/engine.rs`**

```rust
#[test]
fn resolves_provider_override_without_mutating_base_keys() {
    let mut cfg = TranslatorConfig::default();
    cfg.engine = "cloud".into();
    cfg.provider = "gemini".into();
    cfg.groq_api_key = "gsk_test".into();

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
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd src-tauri; cargo test --locked engine::tests`
Expected: FAIL with missing types/functions (`resolve_chat_config`, `ChatTurnMessage`, etc.).

- [ ] **Step 3: Implement multi-turn & multimodal helpers in `src-tauri/src/translator/engine.rs` (and expose any needed helper in `config.rs`)**

- Implement `ChatTurnAttachmentImage`, `ChatTurnMessage`, `resolve_chat_config`, `build_openai_chat_messages`, `build_anthropic_chat_messages`, `build_gemini_chat_contents`, and `run_chat_completion`.
- Keep existing `translate_inplace`, `translate_quick`, `translate_ocr_batch`, `translate_region_image`, `explain_cursor_region`, and `test_connection` behavior identical.
- In `run_chat_completion`: when `effective.engine == "local"`, map `history` to `Vec<LocalChatMessage>` (prepending `system_prompt` if non-empty); when `cloud`, dispatch through `CloudTarget` (`groq`, `openai`, `gemini`, `custom` with `anthropic`/`gemini`/`openai` format) using temperature `0.4` and returning `(reply, provider_name)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri; cargo test --locked translator::engine::tests`
Expected: PASS (all existing + 2 new tests).

---

### Task 2: Rust AI Chat Store, File/PDF/Office Extraction, & Tauri Commands

**Files:**
- Create: `src-tauri/src/ai_chat.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `crate::translator::config::TranslatorConfig`, `crate::translator::engine::{ChatTurnAttachmentImage, ChatTurnMessage, resolve_chat_config, run_chat_completion}`, `crate::translator::ocr::extract_raw_ocr_lines_from_rgba`, `crate::commands::open_settings_window`.
- Produces (structs + functions in `crate::ai_chat` and `#[tauri::command]` wrappers in `commands.rs`, registered in `main.rs`):
  - `ChatAttachment`, `ChatMessage`, `ChatConversation`, `AiChatSnapshot`
  - `ai_chat_get_state(app) -> AiChatSnapshot`
  - `ai_chat_new_conversation(app) -> Result<AiChatSnapshot, String>`
  - `ai_chat_select_conversation(app, id: String) -> Result<AiChatSnapshot, String>`
  - `ai_chat_delete_conversation(app, id: String) -> Result<AiChatSnapshot, String>`
  - `ai_chat_prepare_attachments(paths: Vec<String>) -> Vec<ChatAttachment>`
  - `ai_chat_send_message(app, conversation_id: Option<String>, text: String, attachments: Vec<ChatAttachment>, provider_override: Option<String>) -> Result<AiChatSnapshot, String>`
  - `ai_chat_cancel(app) -> AiChatSnapshot`
  - `ai_chat_open_settings(app)` (opens Settings and emits `"open-settings-tab"` with `"ai"`)
  - Emits `"ai-chat-updated"` (`AiChatSnapshot`) on store mutations and generation completion/cancellation.

- [ ] **Step 1: Write failing unit tests in `src-tauri/src/ai_chat.rs`**

```rust
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
}

#[test]
fn derives_conversation_title_from_first_user_message() {
    assert_eq!(derive_conversation_title("   شرح سريع للكود   ", &[]), "شرح سريع للكود");
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd src-tauri; cargo test --locked ai_chat::tests`
Expected: FAIL because `ai_chat` module does not exist yet.

- [ ] **Step 3: Implement `src-tauri/src/ai_chat.rs` and register commands in `commands.rs` + `main.rs`**

- Implement `prepare_attachment(path: &str)`:
  - **Images (`png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`):** open with `image::ImageReader` (32 MB file cap, 8192px decode cap), resize to max 1600px PNG for `image_base64`, plus 128px thumbnail `preview_data_url`.
  - **PDFs (`pdf`):** render up to 10 pages via `Windows::Data::Pdf::PdfDocument` to RGBA/SoftwareBitmap and extract text via `Windows::Media::Ocr` (reusing `extract_raw_ocr_lines_from_rgba` from `translator::ocr`), capped at `MAX_EXTRACTED_CHARS` (`24_000`). Return friendly error if encrypted/empty.
  - **Office XML (`docx`, `docm`, `dotx`, `pptx`, `pptm`, `xlsx`, `xlsm`, `odt`, `ods`, `odp`):** read XML entries via `zip::ZipArchive` (all slides `ppt/slides/slide*.xml` sorted, `word/document.xml`, `xl/sharedStrings.xml` + `xl/worksheets/sheet*.xml`, `content.xml`), unescape XML, cap at `24_000` chars.
  - **Text/code files:** read up to 512 KB, reject if `looks_binary` (`bytes.contains(&0)`), decode UTF-8 lossily, cap at `24_000` chars.
  - Unsupported binary extensions return `error` on that `ChatAttachment`.
- Implement `ai_chats.json` atomic persistence under `app.path().app_config_dir()` (strip raw `image_base64` before persisting history messages to keep `ai_chats.json` lightweight while preserving `preview_data_url` thumbnails and `extracted_text`).
- Implement `send_message`: checks generation ID (`CHAT_GEN: AtomicU64`) before/after async `run_chat_completion`; if target model is `local` (text-only) and an image attachment has no `extracted_text`, run OCR via `extract_raw_ocr_lines_from_rgba` so local Qwen can still read text in images (or inform the user clearly if no text found).
- Wire all 8 commands in `commands.rs` and `main.rs` (`generate_handler!`).

- [ ] **Step 4: Run Rust verification**

Run: `cd src-tauri; cargo test --locked; cargo clippy --locked --all-targets`
Expected: PASS with 0 test failures and 0 new clippy warnings.

---

### Task 3: Shared **AI** Settings Tab, Translator Separation, & i18n

**Files:**
- Create: `src/settings/AiTab.tsx`
- Modify: `src/settings/types.ts`
- Modify: `src/settings/index.ts`
- Modify: `src/settings/useSettings.ts`
- Modify: `src/settings/TranslatorTab.tsx`
- Modify: `src/settings/NotchTab.tsx`
- Modify: `src/Settings.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ar.ts`
- Modify: `SETTINGS.md`

**Interfaces:**
- Consumes: existing `zenith-translator-*` settings + `translator_get_local_status`, `translator_start_download`, `translator_cancel_download`, `translator_delete_local_model`, `translator_test_connection`.
- Produces:
  - `SettingsTab` union extended with `"ai"`
  - New keys in `useSettings`: `aiChatEnabled` (`zenith-ai-chat-enabled`), `aiChatProvider` (`zenith-ai-chat-provider`), `aiChatSystemPrompt` (`zenith-ai-chat-system-prompt`)
  - `AiTab` component holding Engine, Cloud Provider, API keys, Custom API config, Test Connection, Local Model download/delete, and AI Chat Notch settings
  - `TranslatorTab` streamlined to translation-only controls + an "AI Provider & Keys" summary row with an action button switching to `"ai"` tab
  - `NotchTab` Default Panel `<select>` includes `"ai-chat"` (`n.panelAiChat`)
  - `Settings.tsx` handles `open-settings-tab` `"ai"` and renders `<AiTab>`

- [ ] **Step 1: Update `src/settings/types.ts`, `src/settings/index.ts`, `src/i18n/en.ts`, and `src/i18n/ar.ts`**

Add `settingsWindow.tabs.ai` (`"AI"` / `"الذكاء الاصطناعي"`), `notch.panelAiChat` (`"AI Chat"` / `"محادثة AI"`), `aiSettings` dictionary, and `aiChatPanel` dictionary in both `en.ts` and `ar.ts`.

- [ ] **Step 2: Add AI Chat settings state/sync to `src/settings/useSettings.ts` and document in `SETTINGS.md`**

Add `aiChatEnabled` (default `true`), `aiChatProvider` (default `"inherit"`), `aiChatSystemPrompt` (default `""`) in state, `loadAllSettings`, `useSettingsSync`, and return value. Document the three keys in `SETTINGS.md`.

- [ ] **Step 3: Create `src/settings/AiTab.tsx`, refactor `src/settings/TranslatorTab.tsx`, update `src/settings/NotchTab.tsx` and `src/Settings.tsx`**

Move the AI Engine/Provider/Keys/Test/Local download JSX from `TranslatorTab.tsx` into `AiTab.tsx`, add the AI Chat Notch section in `AiTab.tsx`, add a clean shared-AI summary card with an "Open AI Settings" button in `TranslatorTab.tsx`, add `"ai-chat"` option to `NotchTab.tsx`, and wire `"ai"` tab in `Settings.tsx` (including `listen("open-settings-tab")` for `"ai"`).

- [ ] **Step 4: Run frontend build to verify TypeScript & bundle**

Run: `bun run build`
Expected: `tsc && vite build` exits with code `0`.

---

### Task 4: Notch AI Chat Panel & Conditional Drag-and-Drop Integration

**Files:**
- Create: `src/types/aiChat.ts`
- Create: `src/components/AiChatNotchPanel.tsx`
- Create: `src/components/AiChatNotchPanel.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Tauri commands from Task 2 (`ai_chat_get_state`, `ai_chat_new_conversation`, `ai_chat_select_conversation`, `ai_chat_delete_conversation`, `ai_chat_prepare_attachments`, `ai_chat_send_message`, `ai_chat_cancel`, `ai_chat_open_settings`, `set_notch_keyboard_focus`), `@tauri-apps/plugin-dialog` `open`, and `aiChatEnabled`/`aiChatProvider` settings.
- Produces:
  - `AiChatNotchPanel` component (`aiChatEnabled`, `defaultProviderOverride`, `pendingDropFiles`, `onClearPendingDropFiles`, `isDragHoveringForChat`, `onPinChange`, `onProviderOverrideChange`)
  - `"ai-chat"` registered in `NotchPanel` / `NOTCH_PANELS` in `src/App.tsx`

- [ ] **Step 1: Create `src/types/aiChat.ts` mirroring Rust `ai_chat` structs**

Define `ChatAttachment`, `ChatMessage`, `ChatConversation`, `AiChatSnapshot`, and `AiProviderChoice` (`"inherit" | "gemini" | "groq" | "openai" | "custom" | "local"`).

- [ ] **Step 2: Create `src/components/AiChatNotchPanel.css` & `src/components/AiChatNotchPanel.tsx`**

- `.ai-chat-notch-wrapper` uses `position: absolute; top: 36px; left: 0; width: 100%; height: calc(100% - 36px); z-index: 2;` to avoid flex layout transitions glitches.
- Header with quick provider/model switcher, History toggle, New Chat button, and Settings button (`ai_chat_open_settings`).
- Scrollable message area (`onWheel={(e) => e.stopPropagation()}`), `dir="auto"` per message, attachment chips on user messages, copy button on assistant messages, loading/cancel state, and error banner.
- History drawer listing saved conversations with click-to-open and delete button.
- Composer with staged attachment chips (`preview_data_url` thumbnail for images, file icon for docs, truncated badge, remove `×`), Paperclip button calling `open({ multiple: true })` while keeping `onPinChange(true)` active across the dialog lifetime, `<textarea dir={input ? "auto" : dir} />` using `set_notch_keyboard_focus` for Arabic/IME typing, and Send/Stop button.
- Consumes `pendingDropFiles` prop whenever files are dropped onto the notch while AI Chat is active/last-used, calling `ai_chat_prepare_attachments` and appending them to staged attachments.

- [ ] **Step 3: Wire `"ai-chat"` and conditional drag-and-drop into `src/App.tsx`**

- Add `"ai-chat"` to `NotchPanel`, `NOTCH_PANELS`, `NotchPanelMode`, `panelAvailable`, `releaseNotchHover`, `handleWheel` exclusion (`.ai-chat-content`), `getDynamicWidth()` (`480`), `getDynamicHeight()` (`310`), and `borderBottomLeftRadius`/`RightRadius: 26`.
- Hydrate `aiChatEnabled` & `aiChatProvider` in `load_settings` and `useSettingsSync`; keep `lastPanelRef` updated so `shelf-drag-enter` / `shelf-drag-drop` can check `notchPanelModeRef.current === "ai-chat" || (!isOpenRef.current && lastPanelRef.current === "ai-chat")` when `aiChatEnabledRef.current` is true:
  - If true: expand/stay on `"ai-chat"`, show chat drop state, and pass dropped `paths` (or dropped text) to `AiChatNotchPanel` instead of Shelf.
  - Otherwise: keep existing Shelf drag-and-drop flow untouched.

- [ ] **Step 4: Run full frontend & Rust verification**

Run:
- `bun run build`
- `cd src-tauri; cargo test --locked`
- `cd src-tauri; cargo clippy --locked --all-targets`
Expected: `bun run build` exits `0`, all Rust unit tests pass, and clippy produces zero warnings on added/modified files.
