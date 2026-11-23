# Zenith Converter (Filee Integration) Design Spec

**Date:** 2026-11-23  
**Status:** Approved by user  
**Target Platform:** Windows 10/11 (Zenith Tauri v2 + Rust + React 19/TypeScript)

---

## 1. Intent and Why

Integrate **Filee** (an offline drag-and-drop file converter supporting 270+ formats) as a core native feature inside **Zenith**, restyled completely to match Zenith's theme, visual tokens, window overlays, and bilingual UI (Arabic/English).

Users will access all mouse-centric features from one expandable **Mouse (`الماوس`)** parent group in Settings:
- **Compass (`البوصلة`)**: Existing quick-launch radial wheel for apps, folders, websites, and system actions (`src/settings/MouseTab.tsx` + `src/components/RadialMenu.tsx`).
- **Converter (`المُحوّل`)**: New drag-and-drop file converter donut, format/preset customizer, optional pack manager, watch folders, crop tool, and conversion history.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **All default Filee workflows active with Filee's defaults:**
  - `Ctrl + Drag` files over File Explorer, Desktop, supported third-party file managers, or browsers opens the Zenith-themed converter donut at the cursor.
  - Instant local format filtering (only formats compatible with the dragged file(s) appear).
  - Two-sided donut (`Tab` or mouse wheel flips between primary formats and secondary formats/tools).
  - Live progress ring on the donut/overlay and completion notification in the Notch.
  - Core formats (common images, PDF operations, text/markup, data JSON/YAML/TOML/XML/CSV, ZIP/TAR archives, basic audio/vector/3D/geospatial built-ins) work offline out of the box once the core converter runtime is ready.
  - Heavy optional engine packs (`ffmpeg`, `libreoffice`, `pandoc`, `ghostscript`, `calibre`, `tesseract`, `whisper`, `weasyprint`, `rhwp`, `7zip`, `exiftool`, `upscayl-bin`) are **never** downloaded silently in the background; they are installed only on explicit user demand (from Settings → Mouse → Converter → Packs, or via an inline one-click install card when a user drops a file onto a format that needs an uninstalled pack, with SHA-256 verification and live download progress).
  - Customizing donut slices/profiles per file category and conversion presets (quality, DPI, resize, PDF page ranges/split, video/audio options, conflict policy, keep dates, output directory).
  - Recent conversions list with thumbnails and quick open / open-folder actions + drop zone inside Settings.
  - Crop-before-convert modal for images.
  - Dragging images or file links directly out of web browsers (Chrome, Edge, Firefox) into the converter donut.
  - Watch folders (convert files landing in designated folders automatically, optional move-originals).
  - Optional Windows Explorer right-click context menu entry (`Convert with Zenith`).
- **Seamless Settings UX:**
  - Collapsible/expandable **Mouse (`الماوس`)** group in `src/Settings.tsx` revealing **Compass (`البوصلة`)** and **Converter (`المُحوّل`)** smoothly without cluttering the sidebar.
  - `ConverterTab.tsx` organized into clean internal sub-tabs (`General`, `Donut & Presets`, `Packs`, `Watch & History`).
- **Future Customizability:**
  - Users/developers can customize conversion options and presets directly in Zenith, override or extend conversion routing in `src-tauri/src/converter.rs`, or rebuild `filee-cli` from the Filee MIT source (`Downloads\Filee`) against the isolated `--json` boundary.

### Non-Goals
- No separate Filee window, separate system tray icon, or independent Filee self-updater.
- No rewriting Filee's 270+ format engines in Rust.
- No automatic background downloading of heavy optional engine packs (`ffmpeg`, `libreoffice`, `calibre`, etc.) without user action.

### Anti-Goals
- **Zero drag-open latency:** Never spawn `.NET` / `filee-cli` just to inspect file extensions when `Ctrl + Drag` begins.
- **Zero idle RAM:** Never keep a `.NET` process resident in memory when no conversion or active watch folder is running.
- **Zero input conflicts:** Never hijack drags destined for Zenith's **Notch Shelf**, never activate while **Compass (`MOUSE_RADIAL_MENU_OPEN`)** is active, and never hijack normal file moves/copies when the trigger key (`Ctrl`) is not held.

---

## 3. Chosen Architecture (Approach 1: Zenith UI + Local Matcher + On-Demand `filee-cli --json`)

### Alternatives Considered
1. **Approach 1 (Chosen):** Zenith owns all UI, hooks, theme styling, and instant local format matching; `filee-cli --json` is spawned on demand in Rust for conversion execution, progress streaming (`stderr` JSON lines), engine pack install/remove (`filee engines ... --json`), and active watch folders (`filee watch --json`).
   - *Trade-off:* ~200 ms cold-start when actually starting a conversion job, zero idle RAM, 100% Filee format compatibility, clean upgrade/modification boundary.
2. **Approach 2 (Rejected):** Long-lived C# JSON-RPC sidecar always running in background.
   - *Trade-off:* Constant 50–70 MB RAM footprint plus custom C# IPC layer to maintain.
3. **Approach 3 (Rejected):** Pure Rust converter reimplementation.
   - *Trade-off:* Loses ~250 formats (Office without Office installed, HWP, CAD, 3D, e-books, etc.).

### Data & Storage Layout
- **Simple scalar settings** (`zenith-converter-*`) live in `%APPDATA%/io.github.abdulllrahmandev.zenith/settings.json` as string values, synced via `src/hooks/useSettingsSync.ts` and documented in `SETTINGS.md`.
- **Isolated Converter home** lives under `%APPDATA%/io.github.abdulllrahmandev.zenith/converter/`:
  - `bin/` (`filee-cli.exe` and core runtime)
  - `engines/` (optional downloaded packs, isolated via `HOME`/`APPDATA`/`FILEE_HOME` override or CLI app data path so Zenith never touches any standalone Filee installation)
  - `state.json` (presets, donut toolbar profiles, watch folder rules, recent conversions history)
  - `downloads/` (temporary browser-drag downloads when user chooses not to keep source download)
- **Network & CSP:** All runtime/engine downloads execute in Rust via `reqwest` (never inside WebView2), keeping `src-tauri/tauri.conf.json` CSP restricted.

---

## 4. Phased Delivery

- **Phase 1 — Settings Navigation, Rust Bridge & Engine Pack Manager:**
  - Expandable `Mouse` (`الماوس`) sidebar group with `Compass` (`البوصلة`) and `Converter` (`المُحوّل`).
  - `src-tauri/src/converter.rs` CLI runner + core runtime bootstrap + optional engine pack list/install/remove/progress events.
- **Phase 2 — Drag Trigger & Zenith Converter Donut:**
  - Local instant format matcher & default toolbar profiles (`src/converter/formats.ts`).
  - Win32 `Ctrl + Drag` detection & arbitration in `src-tauri/src/services.rs`.
  - Zenith-themed `ConverterDonut` overlay (`src/components/ConverterDonut.tsx`), two-sided flip, live progress ring, and inline missing-pack prompt with auto-resume.
- **Phase 3 — Customization, Presets, Drop Zone & History:**
  - Donut profile/slice editor, conversion preset parameters, Settings drop zone, and recent conversions history with thumbnails.
- **Phase 4 — Power Features:**
  - Image crop-before-convert modal (`ConverterCropModal`).
  - Direct browser drag-to-convert (images & file links).
  - Watch folders lifecycle (`filee watch --json` managed safely with clean exit cleanup) + optional HKCU Windows Explorer context menu.
