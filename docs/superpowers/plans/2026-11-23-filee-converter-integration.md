# Zenith Converter (Filee Integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Filee's 270+ format offline file converter directly into Zenith under a unified, expandable **Mouse (`الماوس`)** Settings group containing **Compass (`البوصلة`)** and **Converter (`المُحوّل`)**, styled completely in Zenith's theme with on-demand heavy engine packs.

**Architecture:** Zenith owns all UI (`ConverterTab` in Settings, `ConverterDonut` and `ConverterCropModal` in `Overlay`), Win32 drag-trigger hooks (`Ctrl + Drag` in `services.rs`), and instant local format filtering (`src/converter/formats.ts`). On-demand Rust runner `src-tauri/src/converter.rs` invokes `filee-cli --json` for actual conversions, streams live progress from `stderr`, manages optional engine packs via `filee engines ... --json` inside `%APPDATA%/io.github.abdulllrahmandev.zenith/converter/`, and supervises active `filee watch --json` processes.

**Tech Stack:** Tauri v2, Rust (`windows 0.61`, `tokio`, `reqwest`, `serde_json`, `image`, `zip`), React 19, TypeScript, Framer Motion, Bun (`bun run build`), Cargo (`cargo test --locked`, `cargo clippy --locked --all-targets`).

**Spec:** [2026-11-23-filee-converter-integration-design.md](file:///e:/Projects/Desktop/Zenith/docs/superpowers/specs/2026-11-23-filee-converter-integration-design.md)

---

## Global Constraints

- **Platform & Toolchain:** Windows-only Tauri v2 app (`windows` crate pinned at `0.61`); Bun is the package manager (never create `package-lock.json`); `bun run build` (`tsc && vite build`), `cargo test --locked`, and `cargo clippy --locked --all-targets` in `src-tauri` are mandatory verification gates.
- **Exact Naming:**
  - Parent Settings group: **Mouse** / **الماوس**
  - Sub-item 1 (existing radial quick launcher): **Compass** / **البوصلة**
  - Sub-item 2 (new drag-and-drop file converter): **Converter** / **المُحوّل**
- **Isolated Storage:** `filee-cli`, downloaded optional packs, `state.json` (presets, profiles, watch rules, recent items), and temp browser downloads live strictly under `%APPDATA%/io.github.abdulllrahmandev.zenith/converter/`. Never read/write standalone Filee's AppData folder.
- **Zero Idle `.NET` Footprint:** Never spawn `filee-cli` on drag hover; never spawn a permanent resident daemon when no conversion or active watch folder exists; never silently download optional engine packs (`ffmpeg`, `libreoffice`, `pandoc`, `ghostscript`, `calibre`, `tesseract`, `whisper`, `weasyprint`, `rhwp`, `7zip`, `exiftool`, `upscayl-bin`) in the background.
- **Settings Contract:** Every scalar `zenith-converter-*` key uses string values in `settings.json`, syncs via `src/hooks/useSettingsSync.ts`, and is documented in `SETTINGS.md`.
- **Clean Shutdown:** Every exit path (`tauri::RunEvent::Exit` in `src-tauri/src/main.rs`) must terminate active `filee watch` and active conversion child processes alongside restoring the Windows taskbar and unregistering AppBars.

---

## Review Focus

1. **Drag Arbitration Conflict (`Notch Shelf` & `Compass` vs `Converter`):** Dragging a file over the Notch Shelf while holding `Ctrl` (or triggering `Compass`) must never open `ConverterDonut` on top of the Shelf or while `MOUSE_RADIAL_MENU_OPEN` is `true` → pinned by `should_open_converter_drag` tests in **Task 5**.
2. **Missing Optional Engine Recovery:** Dropping a file onto a target format requiring an uninstalled pack (e.g., `.mp4` → `.gif` without `ffmpeg`) must return a structured `MissingEngine` result, prompt one-click install in `ConverterDonut`, and auto-resume the conversion once install succeeds → pinned by `parse_missing_engine_error` test in **Task 2** and auto-resume flow in **Task 6**.
3. **Malformed CLI Output & Cancellation:** Partial/non-JSON stderr noise or non-zero exit codes (`1`, `2`, `3`) from `filee-cli` must never panic or leak orphaned processes on cancel → pinned by `parse_cli_stderr_line` and `map_cli_exit_code` tests in **Task 2**.
4. **Heterogeneous Multi-File Drops:** Dropping mixed extensions (e.g., `photo.png` + `report.docx`) must compute the intersection of valid targets and always fall back to archive targets (`zip`, `7z`, `tar`) instead of rendering an empty or broken wheel → pinned by `matchFormatsForExtensions` unit logic in **Task 4**.
5. **Orphaned Watch Processes on Exit:** Active `filee watch --json` child processes must be tracked in `CONVERTER_STATE` and explicitly killed during `RunEvent::Exit` → pinned by `WatchManager::shutdown_all` lifecycle in **Task 10**.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/settings/types.ts` | Expand `SettingsTab` union with `"mouse-compass"` and `"mouse-converter"` (preserving `"mouse"` fallback) |
| `src/Settings.tsx`, `src/Settings.css` | Collapsible `Mouse` (`الماوس`) sidebar accordion routing to `MouseTab` (Compass) and `ConverterTab` (Converter) |
| `src/i18n/en.ts`, `src/i18n/ar.ts` | Bilingual strings for `Compass`/`البوصلة`, `Converter`/`المُحوّل`, all sub-tabs, and `ConverterDonut` / `ConverterCropModal` |
| `src/settings/useSettings.ts`, `src/hooks/useSettingsSync.ts`, `SETTINGS.md` | Scalar `zenith-converter-*` settings keys & cross-window sync |
| `src/converter/types.ts`, `src/converter/formats.ts` | TS domain types (`ConverterFormat`, `ConverterPreset`, `EnginePackInfo`, `WatchRule`, `RecentConversion`) + instant local format matcher & default donut profiles |
| `src/settings/ConverterTab.tsx`, `src/settings/ConverterTab.css` | Smooth 4-subtab UI: `General`, `Donut & Presets`, `Packs`, `Watch & History` (with Settings Drop Zone) |
| `src/components/ConverterDonut.tsx`, `src/components/ConverterDonut.css` | Zenith-themed cursor donut, two-sided `Tab`/wheel flip, live progress ring, inline missing-pack prompt |
| `src/components/ConverterCropModal.tsx`, `src/components/ConverterCropModal.css` | Image crop-before-convert modal styled in Zenith's glass/surface theme |
| `src/Overlay.tsx` | Mount `ConverterDonut` and `ConverterCropModal`, extend `updateOverlayRegion` for converter elements |
| `src-tauri/Cargo.toml` | Enable `tokio` `"process"` + `"io-util"` features and add `sha2 = "0.10"` for engine archive SHA-256 verification |
| `src-tauri/src/converter.rs` | Isolated converter home, `filee-cli --json` runner & parser, core runtime bootstrap, optional pack manager, `state.json` store, browser link downloader, watch process supervisor, HKCU Explorer menu |
| `src-tauri/src/services.rs` | `Ctrl + Drag` Win32 detection & drag arbitration emitting `converter-donut-open` / `converter-donut-close` |
| `src-tauri/src/commands.rs`, `src-tauri/src/main.rs` | Register `converter_*` Tauri commands, wire `RunEvent::Exit` watch shutdown, re-sync `zenith-converter-*` settings |

---

## Phase 1: Settings Navigation, Rust Bridge & Engine Pack Manager

### Task 1: Expandable Mouse Sidebar Group (`Compass` + `Converter`) & Settings Keys

**Files:**
- Modify: `src/settings/types.ts:8`
- Modify: `src/Settings.tsx:30-46, 63-77, 192-206, 441-475`
- Modify: `src/Settings.css:163-255`
- Modify: `src/i18n/en.ts:41, 352`
- Modify: `src/i18n/ar.ts:41, 352`
- Modify: `src/settings/useSettings.ts`
- Modify: `SETTINGS.md`
- Create: `src/settings/ConverterTab.tsx` (skeleton with 4 smooth sub-tabs)

**Interfaces:**
- Produces:
  - `SettingsTab`: `"general" | "appearance" | "notch" | "tasks" | "ai" | "dock" | "overlays" | "mouse-compass" | "mouse-converter" | "translator" | "about"`
  - Settings keys in `useSettings`: `converterEnabled: boolean`, `converterTriggerKey: "ctrl" | "alt" | "shift" | "right-drag"`, `converterBrowserDrag: boolean`, `converterOutputMode: "next-to-source" | "folder"`, `converterOutputFolder: string`, `converterExplorerMenu: boolean`

- [ ] **Step 1: Add `mouse-compass` and `mouse-converter` tab types and i18n keys**

Update `SettingsTab` in `src/settings/types.ts` and add `tabs.mouseCompass` (`"Compass"` / `"البوصلة"`), `tabs.mouseConverter` (`"Converter"` / `"المُحوّل"`), `tabs.mouse` (`"Mouse"` / `"الماوس"`), and a `converter` section in `src/i18n/en.ts` and `src/i18n/ar.ts`. Ensure `Compass` and `Converter` use single-word labels (`"Compass"` / `"البوصلة"`, `"Converter"` / `"المُحوّل"`).

- [ ] **Step 2: Add expandable Mouse accordion in `src/Settings.tsx` and `src/Settings.css`**

In `src/Settings.tsx`:
- Default `activeTab` remains `"general"`, and `mouseGroupOpen` state auto-expands whenever `activeTab` is `"mouse-compass"` or `"mouse-converter"`, and supports `open-settings-tab` payloads `"mouse-compass"` / `"mouse-converter"`.
- Clicking the **Mouse** group toggles expansion smoothly (CSS grid/height transition in `src/Settings.css` `.sidebar-subtabs`), and clicking **Compass** renders `<MouseTab ... />` while clicking **Converter** renders `<ConverterTab />`.

- [ ] **Step 3: Wire scalar `zenith-converter-*` settings in `src/settings/useSettings.ts` and document in `SETTINGS.md`**

Add keys:
- `zenith-converter-enabled` (default `"true"`)
- `zenith-converter-trigger-key` (`"ctrl"` | `"alt"` | `"shift"` | `"right-drag"`, default `"ctrl"`)
- `zenith-converter-browser-drag` (default `"true"`)
- `zenith-converter-output-mode` (`"next-to-source"` | `"folder"`, default `"next-to-source"`)
- `zenith-converter-output-folder` (default `""`)
- `zenith-converter-explorer-menu` (default `"false"`)

- [ ] **Step 4: Create `src/settings/ConverterTab.tsx` skeleton with segmented sub-tab switcher**

Render 4 smooth sub-tabs (`General`, `Donut & Presets`, `Packs`, `Watch & History`) matching Zenith's `.settings-group` and `.settings-select` aesthetic, with General toggles wired to `useSettings`.

- [ ] **Step 5: Verify frontend build**

Run: `bun run build`
Expected: Exit code `0`, zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/settings/types.ts src/Settings.tsx src/Settings.css src/i18n/en.ts src/i18n/ar.ts src/settings/useSettings.ts src/settings/ConverterTab.tsx SETTINGS.md
git commit -m "feat(settings): split Mouse sidebar into Compass and Converter sub-tabs"
```

---

### Task 2: Rust Converter Module & `filee-cli --json` Runner

**Files:**
- Modify: `src-tauri/Cargo.toml:85-95`
- Create: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/main.rs:3-20, 131`

**Interfaces:**
- Produces (in `src-tauri/src/converter.rs`):
  - `pub struct ConverterPaths { pub root: PathBuf, pub bin_dir: PathBuf, pub cli_exe: PathBuf, pub engines_dir: PathBuf, pub state_file: PathBuf, pub downloads_dir: PathBuf }`
  - `pub enum CliEvent { Progress { source: String, fraction: f64 }, FileDone { source: String, outputs: Vec<String>, state: String, error: Option<String>, error_key: Option<String>, missing_engine: Option<String> } }`
  - `pub fn resolve_converter_paths(app: &tauri::AppHandle) -> Result<ConverterPaths, String>`
  - `pub fn parse_cli_stderr_line(line: &str) -> Option<CliEvent>`
  - `pub fn map_cli_exit_code(code: Option<i32>, missing_engine: Option<&str>, stderr_tail: &str) -> Result<CliOutcome, String>`
  - `pub fn build_convert_args(req: &ConvertRequest, paths: &ConverterPaths) -> Vec<String>`
  - `#[tauri::command] pub async fn converter_convert(app: tauri::AppHandle, req: ConvertRequest) -> Result<ConvertJobResult, String>`
  - `#[tauri::command] pub async fn converter_cancel(job_id: String) -> Result<(), String>`

- [ ] **Step 1: Enable `tokio` `process`/`io-util` and add `sha2 = "0.10"` in `src-tauri/Cargo.toml`**

Verify dependency resolution compiles cleanly.

- [ ] **Step 2: Write failing unit tests in `src-tauri/src/converter.rs`**

Add `#[cfg(test)] mod tests` testing:
1. `parse_cli_stderr_line_handles_progress_file_and_noise`: parses `{"event":"progress","source":"a.heic","fraction":0.45}`, `{"event":"file","source":"a.heic","state":"Failed","errorKey":"MissingEngine:ffmpeg"}`, and returns `None` for blank or malformed non-JSON lines without panicking.
2. `map_cli_exit_code_surfaces_missing_engine_and_errors`: exit code `0` → `Ok(Completed)`, exit `1` with `missing_engine: Some("ffmpeg")` → `Err("MISSING_ENGINE:ffmpeg")`, exit `2` → structured usage error, `None` (killed) → `"CANCELLED"`.
3. `build_convert_args_includes_json_output_quality_and_crop`: produces `["convert", ..., "--to", "webp", "-q", "85", "--json"]` cleanly without shell-quoting bugs.

- [ ] **Step 3: Run tests to verify they fail**

Run (in `src-tauri`): `cargo test --locked converter::tests`
Expected: FAIL because `mod converter;` is not defined yet.

- [ ] **Step 4: Implement `src-tauri/src/converter.rs` runner + `main.rs` registration**

Implement `ConverterPaths` rooted at `app.path().app_config_dir()?.join("converter")`, spawn `filee-cli.exe` with `CREATE_NO_WINDOW` (`0x08000000`) and isolated `FILEE_APPDATA` / `APPDATA` environment override pointing to `paths.root` so Filee's own settings/engines never leak outside Zenith's `converter/` directory. Track active `Child` PIDs in `ACTIVE_CONVERTER_JOBS` so `converter_cancel` kills the process cleanly. Register `converter_convert` and `converter_cancel` in `src-tauri/src/main.rs`.

- [ ] **Step 5: Run Rust tests and clippy**

Run (in `src-tauri`): `cargo test --locked converter::tests && cargo clippy --locked --all-targets`
Expected: All `converter::tests` PASS, 0 new clippy warnings.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/converter.rs src-tauri/src/main.rs
git commit -m "feat(converter): add isolated Rust filee-cli JSON runner and job cancellation"
```

---

### Task 3: Core Runtime Bootstrap & Optional Engine Pack Manager

**Files:**
- Modify: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/main.rs` (`generate_handler!`)
- Modify: `src/settings/ConverterTab.tsx`
- Create: `src/converter/types.ts`

**Interfaces:**
- Produces (Rust Tauri commands):
  - `converter_status(app) -> ConverterRuntimeStatus` (`core_installed: bool`, `version: Option<String>`, `cli_path: String`, `installing: bool`)
  - `converter_ensure_core(app) -> Result<ConverterRuntimeStatus, String>` (downloads core `filee-cli` bundle on first user activation or locates bundled resource, verifies SHA-256, emits `converter-core-progress`)
  - `converter_list_engines(app) -> Result<Vec<EnginePackInfo>, String>` (runs `filee engines --json`, returns metadata for all optional packs: `ffmpeg`, `libreoffice`, `pandoc`, `ghostscript`, `calibre`, `tesseract`, `whisper`, `weasyprint`, `rhwp`, `7zip`, `exiftool`, `upscayl-bin` with installed status, size bytes, version, and format capabilities)
  - `converter_install_engine(app, id: String) -> Result<EnginePackInfo, String>` (runs `filee engines install <id> --json`, forwards `stderr` progress lines via `converter-engine-progress` event)
  - `converter_remove_engine(app, id: String) -> Result<EnginePackInfo, String>` (runs `filee engines remove <id> --json`)
- Consumes (Frontend): `ConverterTab.tsx` **Packs** sub-tab invokes these commands and listens to `converter-engine-progress` & `converter-core-progress`.

- [ ] **Step 1: Write failing unit tests in `src-tauri/src/converter.rs` for `filee engines --json` & install progress parsing**

Test `parse_engines_list_json` against sample `filee engines --json` output (capturing `status`: `"installed"` / `"not_installed"` / `"owncopy"`, `version`, `sizeBytes`) and `parse_engine_progress_line` for download/extract fractions.

- [ ] **Step 2: Run tests to verify they fail**

Run (in `src-tauri`): `cargo test --locked converter::tests::parse_engines`
Expected: FAIL (`not found`).

- [ ] **Step 3: Implement core bootstrap + optional engine commands in `src-tauri/src/converter.rs`**

Ensure `converter_ensure_core` prefers a bundled `resources/converter/filee-cli.exe` if packaged in release installers, and otherwise downloads the pinned release archive in Rust with `reqwest` + `sha2::Sha256` verification and streams progress to `converter-core-progress`. Never trigger `converter_install_engine` automatically on startup.

- [ ] **Step 4: Build `src/converter/types.ts` and wire the **Packs** sub-tab in `src/settings/ConverterTab.tsx`**

Display Core Runtime banner (ready vs one-click download/setup) plus cards for every optional pack with Arabic/English description of which formats it unlocks (e.g., FFmpeg → Video/Audio, LibreOffice → Legacy DOC/XLS/PPT, Tesseract → OCR), download size, live progress bar, and Install / Remove button.

- [ ] **Step 5: Verify Rust tests, clippy, and frontend build**

Run: `bun run build` and (in `src-tauri`) `cargo test --locked && cargo clippy --locked --all-targets`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/converter.rs src-tauri/src/main.rs src/converter/types.ts src/settings/ConverterTab.tsx
git commit -m "feat(converter): add core runtime bootstrap and on-demand optional engine pack manager"
```

---

## Phase 2: `Ctrl + Drag` Trigger & Zenith Converter Donut

### Task 4: Instant Local Format Matcher & Built-In Default Profiles

**Files:**
- Create: `src/converter/formats.ts`
- Modify: `src/converter/types.ts`

**Interfaces:**
- Produces:
  - `export type FileCategory = "image" | "vector" | "pdf" | "document" | "spreadsheet" | "presentation" | "hwp" | "text" | "ebook" | "video" | "audio" | "subtitle" | "archive" | "cad" | "font" | "data" | "model3d" | "geospatial" | "folder" | "mixed"`
  - `export interface TargetOption { format: string; label: string; category: FileCategory; requiredEngine?: string; actionKind?: "convert" | "crop" | "pack-zip" | "same-audio"; presetId?: string }`
  - `export interface DonutSides { primary: TargetOption[]; secondary: TargetOption[]; detectedCategory: FileCategory }`
  - `export function matchFormatsForPaths(paths: string[], profiles?: ToolbarProfile[]): DonutSides`

- [ ] **Step 1: Create format catalog and default two-sided donut profiles in `src/converter/formats.ts`**

Port Filee's format-routing map (`Downloads\Filee\src\Filee.Core\Formats\`) into a static lookup map so matching happens in **< 1 ms** in TypeScript with zero IPC/process overhead:
- Map 270+ input extensions into `FileCategory` and valid target formats, annotating `requiredEngine` (e.g., `mp4` → `gif`/`mp3` requires `ffmpeg`, `doc` → `pdf` requires `libreoffice`, `epub` → `mobi` requires `calibre`, `pdf` → `svg` requires `libreoffice` or `ghostscript`).
- Include Filee's default two-sided donut layouts: side 1 holds the 6–8 everyday formats (plus `Crop` on image inputs), side 2 holds secondary formats/tools (`ZIP`, `7Z`, `PDF merge/split`, `same-audio`, `OCR`, `Upscale`, `CAD/3D/Geospatial` exports).
- For heterogeneous multi-file inputs (e.g., `.png` + `.docx`), `matchFormatsForPaths` computes the intersection of compatible target formats and always includes archive packing (`zip`, `7z`, `tar`, `tar.gz`).

- [ ] **Step 2: Verify TypeScript compilation (`bun run build`)**

Run: `bun run build`
Expected: Exit code `0`.

- [ ] **Step 3: Commit**

```bash
git add src/converter/formats.ts src/converter/types.ts
git commit -m "feat(converter): add instant local 270+ format matcher and default two-sided profiles"
```

---

### Task 5: Win32 `Ctrl + Drag` Hook & Drag Arbitration (`services.rs`)

**Files:**
- Modify: `src-tauri/src/services.rs` (alongside mouse hook & radial state)
- Modify: `src-tauri/src/converter.rs` (OLE drag clipboard/selected-paths helper & window-under-cursor check)
- Modify: `src-tauri/src/commands.rs` (expose `converter_set_overlay_open`, `converter_update_trigger_config`)
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces (events emitted to `"overlay"` window):
  - `converter-donut-open` payload: `{ x: number, y: number, paths: string[], urls: string[], isBrowserDrag: boolean }` (CSS pixels relative to target monitor origin, matching `screen_to_radial_css`)
  - `converter-donut-close` payload: `{}`
- Produces (Rust pure helper for arbitration):
  - `pub fn should_open_converter_drag(converter_enabled: bool, radial_open: bool, over_notch_window: bool, trigger_held: bool, drag_distance_px: i32, threshold_px: i32) -> bool`

- [ ] **Step 1: Write failing unit tests in `src-tauri/src/converter.rs` for drag arbitration**

Test `should_open_converter_drag`:
- Returns `false` when `converter_enabled == false`, or `radial_open == true` (`MOUSE_RADIAL_MENU_OPEN`), or `over_notch_window == true` (Notch Shelf takes precedence), or `trigger_held == false`, or `drag_distance_px < threshold_px`.
- Returns `true` only when all conditions hold.

- [ ] **Step 2: Run test to verify it fails**

Run (in `src-tauri`): `cargo test --locked converter::tests::should_open_converter_drag`
Expected: FAIL (`not found`).

- [ ] **Step 3: Implement `should_open_converter_drag`, Explorer selection/dragged-path resolution, and Win32 mouse drag watcher in `src-tauri/src/services.rs`**

Reuse Zenith's existing `WH_MOUSE_LL` / `WH_KEYBOARD_LL` hook infrastructure and `screen_to_radial_css`:
- Track left-button drag start over Explorer (`CabinetWClass`, `ExploreWClass`), Desktop (`Progman`, `WorkerW`), third-party file managers (`Files`, `dopus`, `TOTALCMD64`, `XYplorer`, `OneCommander`, etc. as in Filee's `FileManagerProcesses`), or browsers when `zenith-converter-browser-drag` is enabled.
- When `drag_distance >= SM_CXDRAG` and the configured trigger key (`Ctrl` by default, or `Alt`/`Shift`/`right-drag`) is held, evaluate `should_open_converter_drag`.
- If `true`, read dragged file paths (via Explorer `Shell.Application` active selection or OLE drop target proxy overlay positioned under the cursor) and emit `converter-donut-open` to `"overlay"`; ensure the overlay window activates click/drop reception over the cursor and restores click-through immediately when drag cancels (`Esc` or release outside slices).

- [ ] **Step 4: Verify Rust tests and clippy**

Run (in `src-tauri`): `cargo test --locked && cargo clippy --locked --all-targets`
Expected: PASS, 0 new warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services.rs src-tauri/src/converter.rs src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat(converter): add Ctrl+Drag trigger hook with Notch Shelf and Compass arbitration"
```

---

### Task 6: Zenith-Themed `ConverterDonut` Overlay, Flip, Progress Ring & Missing-Pack Card

**Files:**
- Create: `src/components/ConverterDonut.tsx`
- Create: `src/components/ConverterDonut.css`
- Modify: `src/Overlay.tsx:13, 990-1040, 1200-1325`

**Interfaces:**
- Consumes:
  - Events: `converter-donut-open`, `converter-donut-close`, `converter-progress`, `converter-complete`, `converter-engine-progress`
  - Commands: `converter_ensure_core`, `converter_convert`, `converter_cancel`, `converter_list_engines`, `converter_install_engine`, `converter_set_overlay_open`
  - Local matcher: `matchFormatsForPaths` from `src/converter/formats.ts`
- Produces:
  - `<ConverterDonut />` mounted inside `src/Overlay.tsx`, registered in `updateOverlayRegion` via selector `[".converter-donut-region", 24]` so click-through regions accurately frame the donut and progress ring.

- [ ] **Step 1: Build `src/components/ConverterDonut.tsx` & `ConverterDonut.css` matching Zenith's RadialMenu visual language**

- Reuse Zenith's CSS custom properties (`--zenith-bg`, `--zenith-bg-expanded`, `--zenith-text`, `--zenith-border`, `--zenith-accent`) and geometry helpers from `src/radial/radialLayout.ts` (`computeRadialLayout`, `RadialSectors`, `clampWheelCenter`).
- **Two sides:** Render Primary side by default; `Tab` key or mouse wheel (`onWheel`) flips smoothly to Secondary side with spring animation and visual side indicator (`1 / 2`).
- **Drop / Click selection:** Dropping files or clicking a format slice checks whether `core_installed` is true and whether `option.requiredEngine` is installed:
  - If `core` or `requiredEngine` is missing, transform the donut center into a compact Zenith glass card showing the pack name + size (e.g. `FFmpeg · 105 MB`) and a **"Install & Convert / تثبيت وتحويل"** button; on completion, automatically resume the conversion!
- **Progress Ring:** During conversion, keep a compact floating progress ring at the drop point (with cancel `×` button calling `converter_cancel`) and emit a brief Notch toast/completion cue via `converter-complete`.

- [ ] **Step 2: Integrate `<ConverterDonut />` into `src/Overlay.tsx`**

Listen for `converter-donut-open` / `converter-donut-close`, coordinate with `radial-open` so both never show simultaneously, and add the donut's bounding box to `updateOverlayRegion` in `src/Overlay.tsx`.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Exit code `0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConverterDonut.tsx src/components/ConverterDonut.css src/Overlay.tsx
git commit -m "feat(converter): render Zenith-themed two-sided ConverterDonut with progress ring and on-demand pack prompt"
```

---

## Phase 3: Customization, Presets, Drop Zone & History

### Task 7: Toolbar/Preset Editor, Settings Drop Zone & Recent Conversions (`state.json`)

**Files:**
- Modify: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/settings/ConverterTab.tsx`
- Create: `src/settings/ConverterTab.css`

**Interfaces:**
- Produces (Rust commands):
  - `converter_get_state(app) -> ConverterState` (`profiles`, `presets`, `recent`, `watch_rules`)
  - `converter_save_profiles(app, profiles: Vec<ToolbarProfile>) -> Result<(), String>`
  - `converter_save_presets(app, presets: Vec<ConverterPreset>) -> Result<(), String>`
  - `converter_clear_history(app) -> Result<(), String>`
  - `converter_open_output(path: String, reveal_in_folder: bool) -> Result<(), String>`

- [ ] **Step 1: Add `ConverterState` atomic JSON persistence + unit test in `src-tauri/src/converter.rs`**

Write `load_converter_state` / `save_converter_state_atomic` (temp-file + rename, bounded `recent` list capped at 50 entries with generated thumbnail data URIs for images via `image` crate), and test round-trip serialization + max-50 history truncation in `cargo test --locked`.

- [ ] **Step 2: Implement Donut & Presets sub-tab in `src/settings/ConverterTab.tsx`**

- Profile selector per file category (`Images`, `Video`, `Audio`, `PDF`, `Documents`, `Archives`, etc.) with drag-to-reorder slices for Face 1 & Face 2.
- Preset editor controls mapped cleanly to `filee convert` CLI options (`--quality 1-100`, `--pages`, `--split-every`, `--split-parts`, `--overwrite` / `--skip`, `--keep-dates`, `--zip`, `--iso-filesystem`).

- [ ] **Step 3: Implement Watch & History sub-tab + Settings Drop Zone in `src/settings/ConverterTab.tsx`**

- Interactive HTML5/Tauri drag-and-drop zone inside Settings so users can drop files right inside **Settings → Mouse → Converter** and pick a target format without using the keyboard trigger.
- Recent conversions list showing thumbnail/icon, source → target badge, timestamp, and **Open** / **Show in Folder** buttons.

- [ ] **Step 4: Verify Rust tests, clippy, and frontend build**

Run: `bun run build` and (in `src-tauri`) `cargo test --locked && cargo clippy --locked --all-targets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/converter.rs src-tauri/src/main.rs src/settings/ConverterTab.tsx src/settings/ConverterTab.css
git commit -m "feat(converter): add donut slice editor, presets, drop zone, and conversion history"
```

---

## Phase 4: Crop, Browser Drag, Watch Folders & Explorer Menu

### Task 8: Image Crop-Before-Convert Modal

**Files:**
- Create: `src/components/ConverterCropModal.tsx`
- Create: `src/components/ConverterCropModal.css`
- Modify: `src/components/ConverterDonut.tsx`
- Modify: `src-tauri/src/converter.rs`

**Interfaces:**
- Produces:
  - `CropBox { x: number; y: number; width: number; height: number; aspect?: string; targetFormat: string }`
  - Rust pre-crop helper in `src-tauri/src/converter.rs`: uses the `image` crate to crop each queued image into a temporary PNG in `paths.downloads_dir` before passing to `filee-cli convert --to <targetFormat>` and preserving source folder/filename stem + output directory.

- [ ] **Step 1: Add unit test in `src-tauri/src/converter.rs` for `crop_image_region_clamps_bounds`**

Verify pixel crop bounds clamp cleanly to image dimensions and write valid output image before conversion.

- [ ] **Step 2: Build `ConverterCropModal.tsx` with aspect-ratio presets (`Free`, `1:1`, `16:9`, `4:3`, `9:16`) and interactive frame drag**

When the user selects the `Crop` slice in `ConverterDonut`, open `ConverterCropModal` over the queued images one by one (or apply-to-all), pick target output format (`PNG`, `JPG`, `WEBP`, etc.), and run conversion on confirm.

- [ ] **Step 3: Verify tests, clippy, and `bun run build`**

Run: `bun run build` and (in `src-tauri`) `cargo test --locked && cargo clippy --locked --all-targets`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConverterCropModal.tsx src/components/ConverterCropModal.css src/components/ConverterDonut.tsx src-tauri/src/converter.rs
git commit -m "feat(converter): add interactive image crop-before-convert modal"
```

---

### Task 9: Browser Drag-to-Convert (Images & File Links)

**Files:**
- Modify: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/services.rs`
- Modify: `src/components/ConverterDonut.tsx`

**Interfaces:**
- Produces:
  - `parse_browser_drop_payload(html: Option<&str>, url_text: Option<&str>) -> Option<BrowserDragSource>` (`ImageDataUri`, `RemoteImageUrl`, `RemoteFileUrl`)
  - `#[tauri::command] pub async fn converter_fetch_browser_asset(app: AppHandle, url: String) -> Result<String, String>` (downloads via Rust `reqwest` with safe filename sanitization into `%APPDATA%/.../converter/downloads/` without requiring browser sign-in)

- [ ] **Step 1: Write failing unit tests for `parse_browser_drop_payload` and filename sanitization in `src-tauri/src/converter.rs`**

Test `CF_HTML` `<img src="https://...">`, `text/uri-list`, `data:image/png;base64,...`, and rejecting unsafe `javascript:` / traversal filenames (`../../evil.exe`).

- [ ] **Step 2: Run tests to verify they fail**

Run (in `src-tauri`): `cargo test --locked converter::tests::parse_browser_drop`
Expected: FAIL.

- [ ] **Step 3: Implement browser OLE drag extraction & safe Rust asset downloader**

When `Ctrl + Drag` originates over Chrome, Edge, Firefox, or Brave and `zenith-converter-browser-drag` is `"true"`, open `ConverterDonut` using the dragged asset's inferred extension; upon slice drop, call `converter_fetch_browser_asset` to materialize the file locally (or save to `Downloads` if configured), then invoke `converter_convert`.

- [ ] **Step 4: Verify tests, clippy, and `bun run build`**

Run: `bun run build` and (in `src-tauri`) `cargo test --locked && cargo clippy --locked --all-targets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/converter.rs src-tauri/src/services.rs src/components/ConverterDonut.tsx
git commit -m "feat(converter): support direct browser image and link drag-to-convert"
```

---

### Task 10: Watch Folders Supervision & Windows Explorer Right-Click Menu

**Files:**
- Modify: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/main.rs:677-686` (`RunEvent::Exit` cleanup + startup watch launch)
- Modify: `src/settings/ConverterTab.tsx`

**Interfaces:**
- Produces (Rust commands):
  - `converter_save_watch_rules(app, rules: Vec<WatchRule>) -> Result<Vec<WatchRuleStatus>, String>`
  - `converter_toggle_explorer_menu(app, enabled: bool) -> Result<bool, String>` (writes/deletes `HKCU\Software\Classes\*\shell\ZenithConvert` pointing to `Zenith.exe --convert "%1"`, plus `main.rs` CLI arg forwarding `--convert <path>` to open ConverterDonut/Settings Drop Zone)
  - `pub fn shutdown_converter()` called from `RunEvent::Exit` in `src-tauri/src/main.rs` to kill all running `filee watch` child processes and active conversion jobs.

- [ ] **Step 1: Write failing tests in `src-tauri/src/converter.rs` for `build_watch_args` and `--convert` startup arg parsing**

Verify `build_watch_args` produces `["watch", <folder>, "--to", <format>, "--json", ...]` with optional `-r`, `--move-originals`, `--output`, and `--keep-dates`.

- [ ] **Step 2: Implement `WatchManager`, `shutdown_converter()` in `main.rs`, and HKCU Explorer Context Menu**

- On app startup, spawn `filee watch --json` only for rules with `enabled: true` (zero processes if no watch folders are enabled).
- Stream `{"event":"file",...}` stdout lines into `RecentConversion` history and Notch notifications.
- Register `converter::shutdown_converter()` inside `tauri::RunEvent::Exit` in `src-tauri/src/main.rs` right alongside `crate::translator::shutdown()`.
- Wire Watch Folder CRUD UI + Explorer Context Menu toggle inside `src/settings/ConverterTab.tsx`.

- [ ] **Step 3: Full verification across all gates**

Run from repo root:
`bun run build`
Run inside `src-tauri`:
`cargo check --locked && cargo clippy --locked --all-targets && cargo test --locked`
Expected: All pass cleanly with zero test failures.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/converter.rs src-tauri/src/main.rs src/settings/ConverterTab.tsx
git commit -m "feat(converter): add watch folders supervisor, clean exit shutdown, and Explorer context menu"
```
