# Notch AI Chat & Shared AI Settings — Design Document

**Date:** 2026-11-17  
**Platform:** Zenith (Windows-only Tauri v2 + React 19 / TypeScript + Rust)

---

## 1. Intent & Why

Add an **AI Chat** panel (`"ai-chat"`) directly inside Zenith's notch bar so the user can converse with AI models, switch models quickly, persist chat history across sessions, and attach files or images—without leaving their active workflow. At the same time, separate AI provider/model configuration out of the Translator tab into a dedicated shared **AI** (`الذكاء الاصطناعي`) tab in Settings so both Translator and Notch AI Chat share one source of truth for API keys, custom endpoints, and the offline local `llama.cpp` model.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Add `"ai-chat"` as a notch tool panel (`NOTCH_PANELS`: `calendar`, `command-center`, `prayer`, `tasks`, `ai-chat`), toggleable via Settings and added to Notch's Default Panel selector.
- Create a new Settings tab **AI** (`الذكاء الاصطناعي`) holding all shared AI engine, provider, API key, custom endpoint, local model download/runtime, and connection test controls—used by both Translator and AI Chat.
- Keep **Translator** settings focused on translation behavior (enable toggle, hotkeys, target language, output mode, display target, overlay styling, custom prompts) with a quick link/button jumping to the **AI** tab.
- Support multi-turn conversations (`user` / `assistant` history) with quick provider/model switching inside the notch chat header, a New Chat button, conversation history list/delete, copy message action, and persistent local storage (`ai_chats.json` under `app_config_dir`).
- Support attaching files and images via:
  1. An attach button inside the chat input bar (native file picker via `tauri-plugin-dialog`, pinning the notch open while the dialog is active so it does not collapse).
  2. Drag-and-drop onto the notch when the AI Chat panel is currently open **or** was the last-used panel (`lastPanel === "ai-chat"` when notch is closed); otherwise drag-and-drop continues to route to the **Shelf** as before.
- Support bilingual UI (English LTR & Arabic RTL) with `dir={value ? "auto" : dir}` and `set_notch_keyboard_focus` for Arabic/IME typing.

### Non-Goals
- No standalone external web search, tool calling, or code execution inside the notch chat.
- No cloud synchronization of chat transcripts across devices.
- No Cargo dependency additions that modify `Cargo.lock` (`cargo check --locked` and `cargo clippy --locked` must pass untouched).

### Anti-Goals
- Breaking existing saved `zenith-translator-*` keys or requiring users to re-enter their Gemini/Groq/OpenAI/Custom keys after moving the UI to the new **AI** tab.
- Dropping files into the Shelf when the user explicitly had AI Chat open or as their active/last notch panel, or accidentally breaking Shelf drag-and-drop for all other panels.
- Exposing API keys in frontend state fetches or relaxing `tauri.conf.json` CSP origins to call AI APIs from the webview.

---

## 3. Constraints

- **Locked Rust dependencies:** `src-tauri/Cargo.toml` / `Cargo.lock` cannot add new crates; all HTTP (`reqwest`), JSON (`serde_json`), ZIP/Office reading (`zip`), Base64 (`base64`), Win32 PDF/OCR (`Windows::Data::Pdf`, `Windows::Media::Ocr`), and local `llama.cpp` execution (`run_local_chat`) must use existing crates.
- **Notch window focus & geometry:** The notch window (`main`, `main-2`, `main-3`) uses `WS_EX_NOACTIVATE` and `SetWindowRgn` clipping. Typing requires `set_notch_keyboard_focus`, and opening a native OS file dialog requires pinning (`setNotchPinned(true)` / `releaseNotchHover` deferral) so focus loss to the OS dialog does not collapse the notch.
- **Panel transitions:** Per our prior fix, `.ai-chat-notch-wrapper` must use `position: absolute; top: 36px; left: 0; width: 100%; height: calc(100% - 36px); z-index: 2;` so transitions between `prayer`, `tasks`, `calendar`, `command-center`, and `ai-chat` never collide in the flex layout.
- **Settings persistence & backward compatibility:** Existing `zenith-translator-engine`, `zenith-translator-provider`, `zenith-translator-api-key`, `zenith-translator-groq-api-key`, `zenith-translator-openai-api-key`, `zenith-translator-custom-*`, and `zenith-translator-local-model-id` keys remain the underlying storage keys so existing users and `translator/config.rs` keep working with zero migration loss.

---

## 4. Approaches Considered

1. **Approach 1 (Chosen): Unified Rust Multi-Turn AI Engine + Native Multimodal & File Extraction (`src-tauri/src/ai_chat.rs` + shared `translator/engine.rs`)**
   - Generalizes provider request building in `translator/engine.rs` so `ai_chat.rs` can send full multi-turn `messages` arrays (including base64 image attachments for vision-capable models and extracted text payloads for documents/code/PDFs) across Gemini, Groq, OpenAI, Custom (OpenAI/Anthropic/Gemini), and local `llama.cpp`.
   - *Trade-off:* Requires refactoring `translator/engine.rs` call helpers to accept message slices and optional multiple/inline image parts, and implementing Windows PDF/text extraction with existing Win32/Rust tools rather than an external PDF crate.
   - *Why chosen:* Preserves native multi-turn roles, supports image vision natively, reuses every existing provider/key and local GGUF runtime, and keeps keys and HTTP inside Rust.

2. **Approach 2 (Rejected): Single-Turn Prompt Wrapper over Existing Translator Calls**
   - Flatten previous chat turns and file text into a single user string passed to existing `translator/engine.rs` single-turn functions.
   - *Trade-off:* Simpler upfront, but loses native `user`/`assistant` role separation, cannot natively attach images in multi-turn chat, and degrades conversation coherence.

3. **Approach 3 (Rejected): Direct Webview `fetch()` + Rust File Reader Only**
   - Ruled out because `tauri.conf.json` restricts `connect-src` CSP, Zenith isolates API keys inside Rust, and CORS/protocol differences for custom/Anthropic endpoints are already solved in Rust.

---

## 5. Decided Architecture & UX Details

### A. Shared **AI** (`الذكاء الاصطناعي`) Settings Tab
- Add `"ai"` to `SettingsTab` (`src/settings/types.ts`) and Settings sidebar (`src/Settings.tsx`) with a `Sparkles` / `Bot` icon, positioned before or right next to `translator`.
- Move the AI Engine selector (`Cloud` / `Local`), Cloud Provider selector (`Gemini`, `Groq`, `OpenAI`, `Custom`), API key inputs + visibility toggle, Custom API URL/Format/Model fields, "Test Connection" banner, and Local `Qwen2.5-1.5B-Instruct` download/runtime controls from `TranslatorTab.tsx` into a new `src/settings/AiTab.tsx`.
- Add Notch AI Chat appearance/behavior toggles in `AiTab.tsx`:
  - `zenith-ai-chat-enabled` (boolean string, default `"true"`) — enable/disable AI Chat panel in the notch.
  - `zenith-ai-chat-system-prompt` (string, default `""`) — optional default instruction for chat.
  - `zenith-ai-chat-default-model` / chat-selected provider override (`zenith-ai-chat-provider`, default `"inherit"` meaning follow shared AI provider, or pick `"gemini"` | `"groq"` | `"openai"` | `"custom"` | `"local"` quickly from inside the chat header!).
- In `TranslatorTab.tsx`: remove the moved AI provider/key/local-download blocks and replace them with a clean summary card showing the active shared AI engine/provider and a button (`openSettingsTab("ai")`) to configure AI connections.
- Support `"open-settings-tab"` payload `"ai"` in `Settings.tsx` and add `ai_chat_open_settings` (or generalize `open_settings_tab`) command so clicking the settings icon inside the Notch AI Chat opens Settings directly on the **AI** tab.

### B. Notch AI Chat Panel (`src/components/AiChatNotchPanel.tsx` & `.css`)
- **Geometry:** Width `480px`, Height `310px` (or `305px`, matching tall Calendar mode so chat messages + composer + attachment chips stay comfortable and readable).
- **Layout (`dir={dir}`):**
  - **Header bar:**
    - Left/start: Quick **Provider / Model chip** (cycles or opens a compact inline popover to pick among configured providers: Gemini, Groq, OpenAI, Custom, Local Qwen—only enabling/highlighting ones configured, or showing active provider).
    - Right/end: **History** toggle icon (shows saved conversations list), **New Chat** (`+` / `SquarePen`) button, and **Settings** gear icon (jumps to **AI** tab).
  - **Conversation view (scrollable `.ai-chat-scroll`, `onWheel={(e) => e.stopPropagation()}`):**
    - Clean message bubbles/rows (`user` right-aligned or compact tinted pill, `assistant` full-width readable prose with `dir="auto"` per message, copy-reply icon button, and attached file chips shown on user messages).
    - While generating: animated subtle thinking indicator + **Stop/Cancel** option (or request cancellation flag) and clear inline error banner with Retry if a provider call fails (e.g. missing API key).
    - Empty state: crisp prompt starter / hint noting drag-and-drop or attach button for files & images.
  - **History drawer view** (toggled from header History button):
    - Scrollable list of saved conversations (`title`, updated timestamp, message count), click to switch, trash icon to delete a conversation.
  - **Composer at bottom:**
    - Attachment chips strip above the input when files are staged (filename + type icon + remove `×` button; shows extraction error if an unreadable file is dropped).
    - Input bar: **Attach File** button (`Paperclip`, opens native `open({ multiple: true })` dialog via `@tauri-apps/plugin-dialog` while keeping notch pinned), auto-growing/single-to-multi-line `<textarea dir={input ? "auto" : dir} />` (`Enter` sends, `Shift+Enter` inserts newline), and **Send** button (`ArrowUp` / `Send`).

### C. File Attachment & Drag-and-Drop Routing
- **Drag-and-drop routing in `App.tsx`:**
  - In `shelf-drag-enter` and `shelf-drag-drop`: check whether `notchPanelModeRef.current === "ai-chat"` OR (when the notch is collapsed / not showing another explicit panel) `lastPanelRef.current === "ai-chat"` (and `aiChatEnabled`).
  - When true: `shelf-drag-enter` keeps/expands the notch on `"ai-chat"` with a subtle drop-target highlight inside the chat composer instead of switching to `"shelf"`; `shelf-drag-drop` passes the dropped file paths directly to `AiChatNotchPanel` (via prop/callback or event) to attach them to the current draft!
  - Note: if the drag carries plain selected *text* (not file paths) when AI Chat is active, either insert/attach it as a snippet or route text drops to Shelf if preferred—builder may attach dropped text as a text snippet or prefill the composer when `paths.length === 0 && text`.
  - When false (any other panel active/last-used): preserve existing Shelf drag-and-drop behavior untouched.
- **Rust File Processing (`ai_chat_prepare_attachment(path)`):**
  - Accepts local file paths (from drag-drop or `plugin-dialog`) and returns a prepared `ChatAttachment` (`id`, `name`, `kind`: `"image"` | `"text"`, `mime`, `preview_data_url?`, `image_base64?`, `extracted_text?`, `char_count`, `truncated`, `error?`):
    - **Images** (`png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`): read & resize/encode as PNG/JPEG base64 (capped at e.g. 1600px max dimension via existing `image` crate so payloads stay fast and within provider limits) + tiny thumbnail preview.
    - **Text & Code files** (`txt`, `md`, `json`, `csv`, `ts`, `tsx`, `js`, `rs`, `py`, `html`, `css`, `log`, `xml`, `yaml`, etc.): read UTF-8 text (lossy fallback), cap at a safe context limit (e.g. `24,000` chars with `truncated: true` badge if trimmed).
    - **Office documents** (`docx`, `xlsx`, `pptx`, `odt`, etc.): extract full text using the `zip` XML text extraction already patterned in `shelf_preview.rs` (increased cap vs Shelf's 400-char preview).
    - **PDFs** (`pdf`): extract text by rendering pages via `Windows::Data::Pdf::PdfDocument` + running `Windows::Media::Ocr` (both already enabled in `Cargo.toml` and used in `translator/ocr.rs`!), capping pages/chars (e.g. first 10 pages / 24k chars) so multi-page PDFs work completely offline with zero extra crates.
    - **Vision fallback / unsupported guard:** If the user sends an image to a text-only model (e.g., local Qwen2.5-1.5B or Groq text-only), either automatically run `Windows::Media::Ocr` on the image to extract text for the model OR return a clear inline warning explaining the active model doesn't support images (OCR text extraction fallback is great when OCR yields text!).

### D. Persistence & Commands (`src-tauri/src/ai_chat.rs`)
- Store conversations in `app.path().app_config_dir()/ai_chats.json` (atomic writes, protected by `Mutex`, storing text + attachment metadata/extracted text and thumbnail previews—avoiding multi-megabyte raw image blobs in JSON history if pruned or capped, or storing compact thumbnails).
- Tauri commands registered in `main.rs`:
  - `ai_chat_get_state` -> returns `{ conversations, active_conversation_id, active_provider, busy }`
  - `ai_chat_new_conversation` -> creates/activates a fresh conversation
  - `ai_chat_select_conversation(id)` / `ai_chat_delete_conversation(id)`
  - `ai_chat_prepare_attachments(paths: Vec<String>)` -> extracts text / prepares image payloads on a blocking worker
  - `ai_chat_send_message(app, conversation_id, text, attachments, provider_override?)` -> appends user message immediately, emits `"ai-chat-updated"`, executes provider call asynchronously, appends assistant reply (or error state), emits `"ai-chat-updated"`
  - `ai_chat_cancel()` -> cancels/ignores in-flight generation flag
  - `ai_chat_open_settings()` -> opens Settings directly to the `"ai"` tab

---

## 6. Left to the Builder

- Exact provider model-name presets inside the quick switcher (e.g. reusing `translator/engine.rs` defaults vs offering a small curated model list per provider).
- Exact character/page truncation thresholds (`~20k–30k` chars, max ~10 PDF pages, max 4 attachments per message) and markdown/code-block formatting inside assistant bubbles.
- Exact copy phrasing for new `en.ts` / `ar.ts` keys and `SETTINGS.md` updates.
