# Zenith Settings Reference

All settings are stored in `settings.json` in the app config directory (`%APPDATA%/io.github.abdulllrahmandev.zenith/`). The file is a flat JSON object with `zenith-` prefixed keys. Zenith watches this file for external changes and applies them in real-time.

## Quick Start

Edit `settings.json` with any text editor while Zenith is running. Changes are applied immediately — no restart required.

```json
{
	"zenith-dock-enabled": "true",
	"zenith-dock-mode": "smart",
	"zenith-theme-mode": "dark",
	"zenith-scale": "1.0"
}
```

## Settings Keys

### Dock

| Key                                | Type                             | Default       | Description                                                                                                                                                                      |
| ---------------------------------- | -------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zenith-dock-enabled`               | `"true"` / `"false"`             | `"false"`     | Show or hide the Zenith Dock (taskbar replacement).                                                                                                                               |
| `zenith-dock-display`               | `"primary"` / `"all"` / display id | `"primary"`   | Which display to show the dock on: `"primary"` (always primary display regardless of name/resolution), `"all"` (all displays), or specific display id. Locked to `"primary"` when only one display is connected. |
| `zenith-dock-isolation`             | `"true"` / `"false"`             | `"false"`     | In multi-monitor mode, isolate dock apps to only show open windows running on that specific display.                                                                           |
| `zenith-dock-mode`                  | `"fixed"` / `"smart"` / `"peek"` | `"smart"`     | Dock visibility behavior. **fixed** = always visible as AppBar. **smart** = auto-hide when overlapped by fullscreen apps. **peek** = hidden until cursor approaches bottom edge. |
| `zenith-dock-edge-delay`            | milliseconds `"0"`–`"2000"`      | `"200"`       | In smart/peek mode, how long the cursor must rest against the bottom screen edge before the dock appears. `"0"` reveals instantly.                                               |
| `zenith-dock-preview-enabled`       | `"true"` / `"false"`             | `"true"`      | Show window thumbnail previews when hovering dock icons.                                                                                                                         |
| `zenith-dock-icon-only`             | `"true"` / `"false"`             | `"false"`     | Minimal icon-only style (no background/padding around icons).                                                                                                                    |
| `zenith-dock-separator-enabled`     | `"true"` / `"false"`             | `"true"`      | Show a divider between pinned and unpinned dock apps when unpinned apps are present. Unpinned apps remain on the right when disabled.                                            |
| `zenith-start-icon`                 | icon key / `custom:<data URI>`   | `"default"`   | Start button icon: `default`, `zenith-holographic`, `zenith-emerald`, `zenith-gold`, `zenith-iznik-blue`, `zenith-midnight-gold`, `zenith-ivory-emerald`, `windows`, or `custom:` followed by an uploaded image's data URI. |
| `zenith-dock-task-view`             | `"true"` / `"false"`             | `"false"`     | Show a Task View button beside Start that opens Task View, like the taskbar's. Right-click it to hide it again.                                                                  |
| `zenith-dock-adaptive`              | `"true"` / `"false"`             | `"false"`     | Fixed dock only. Stretch the dock to full width like a traditional taskbar while a window is maximized, and contract back when it's restored.                                    |
| `zenith-dock-win-number-enabled`    | `"true"` / `"false"`             | `"true"`      | When the taskbar is replaced, Win+1 through Win+9 activate the matching pinned dock app (focus/minimize if running, launch otherwise) instead of the native taskbar slots.       |
| `zenith-dock-extras-position`       | `"off"` / `"left"` / `"right"`   | `"off"`       | Show a dock extras section with drives, folders and the Recycle Bin beside the app icons, on the left or right side of the dock.                                                 |
| `zenith-dock-extras-drives`         | `"true"` / `"false"`             | `"true"`      | Show fixed, removable (with media) and connected mapped network drives in the dock extras. Empty card readers and unloaded discs are hidden.                                     |
| `zenith-dock-extras-hidden-drives`  | comma-separated letters          | `""`          | Drives left out of the dock extras, e.g. `"D,E"`. Drives not listed appear, including newly connected ones. Right-clicking a drive and choosing Remove from Dock adds it here. |
| `zenith-dock-extras-recycle-bin`    | `"true"` / `"false"`             | `"true"`      | Show the Recycle Bin in the dock extras. The icon reflects whether the bin holds anything.                                                                                       |
| `zenith-dock-extras-folders`        | comma-separated ids              | `"downloads"` | Known folders in the dock extras: any of `desktop`, `downloads`, `documents`, `pictures`, `music`, `videos`, or `"none"` for no folders.                                         |
| `zenith-dock-extras-custom-folders` | JSON array                       | `"[]"`        | User-added folders, e.g. `[{"name":"Projects","path":"D:\\Projects"}]`. Folders that no longer exist are skipped until they return.                                              |

### Notch

| Key                      | Type                             | Default   | Description                                                                                                                    |
| ------------------------ | -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `zenith-notch-display`    | `"primary"` / `"all"` / display id | `"primary"` | Which display to show the notch on: `"primary"` (always primary display regardless of name/resolution), `"all"` (all displays), or specific display id. Locked to `"primary"` when only one display is connected. |
| `zenith-notch-mode`       | `"fixed"` / `"smart"` / `"peek"` | `"fixed"` | Notch (top bar) visibility behavior. Same modes as dock. **peek** shows the notch briefly on media events and notifications.   |
| `zenith-notch-edge-delay` | milliseconds `"0"`–`"2000"`      | `"200"`   | In smart/peek mode, how long the cursor must rest against the top screen edge before the notch peeks. `"0"` reveals instantly. |

### Weather

| Key                              | Type                         | Default     | Description                                                                        |
| -------------------------------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `zenith-weather-enabled`          | `"true"` / `"false"`         | `"true"`    | Show weather widget in the notch status bar.                                       |
| `zenith-weather-city`             | string                       | `""`        | Manually set city name for weather. Empty string = auto-detect via IP geolocation. |
| `zenith-weather-lat`              | number string                | (auto)      | Latitude coordinate for weather. Set automatically when a city is selected.        |
| `zenith-weather-lon`              | number string                | (auto)      | Longitude coordinate for weather. Set automatically when a city is selected.       |
| `zenith-weather-cached-temp`      | number string                | (none)      | Cached temperature value shown before next API fetch.                              |
| `zenith-weather-cached-condition` | string                       | (none)      | Cached weather condition text (e.g. "Partly Cloudy").                              |
| `zenith-temp-unit`                | `"celsius"` / `"fahrenheit"` | `"celsius"` | Temperature display unit.                                                          |

### Modules

| Key                         | Type                              | Default  | Description                                                                                              |
| --------------------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `zenith-calendar-enabled`    | `"true"` / `"false"`              | `"true"` | Enable calendar/timer mode in the notch.                                                                 |
| `zenith-music-mode-enabled`  | `"true"` / `"false"`              | `"true"` | Enable interactive music media widget.                                                                   |
| `zenith-music-compact-notch` | `"true"` / `"false"`              | `"true"` | Show compact music display (visualizer + artwork) in collapsed notch.                                    |
| `zenith-notch-remember-panel` | `"true"` / `"false"` | `"true"` | Click opens the last-used panel when on; when off, click opens `zenith-notch-default-panel`. |
| `zenith-notch-default-panel` | `"calendar"` / `"command-center"` / `"prayer"` | `"calendar"` | Fixed panel opened on click when panel memory is off. If calendar is disabled, Command Center opens instead. |
| `zenith-notch-last-panel`    | `"calendar"` / `"command-center"` / `"prayer"` | (unset)  | Last panel the notch was left on, saved by Zenith while panel memory is on. |
| `zenith-notch-click-to-open` | `"true"` / `"false"` | (legacy) | Old setting read only when `zenith-notch-remember-panel` is absent; `"false"` now selects fixed-panel behavior. |

### Prayer Times

| Key                       | Type                                                  | Default                | Description                                                                                                       |
| ------------------------- | ----------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `zenith-prayer-enabled`    | `"true"` / `"false"`                                  | `"true"`               | Enable Islamic Prayer Times panel in the notch.                                                                   |
| `zenith-prayer-location-mode` | `"auto"` / `"manual"`                              | `"auto"`               | Location mode: **auto** = device GPS / IP geolocation; **manual** = specific country and city selection.          |
| `zenith-prayer-city`       | string                                                | `""`                   | Manually set city for prayer times when in manual mode.                                                           |
| `zenith-prayer-country`    | string                                                | `""`                   | Manually set country for prayer times when in manual mode.                                                        |
| `zenith-prayer-method`     | integer string (`"1"`–`"15"`)                         | `"4"`                  | Calculation method (e.g. 4 = Umm Al-Qura, 5 = Egyptian General Authority, 3 = MWL).                               |
| `zenith-prayer-time-offset`| integer string (`"-120"`–`"120"`)                     | `"0"`                  | Manual time offset adjustment in minutes.                                                                         |
| `zenith-prayer-alert-type` | `"sound_notification"` / `"notification_only"` / `"off"` | `"sound_notification"` | Notification mode when prayer time arrives (play Athan sound and/or show desktop notification).                   |
| `zenith-prayer-pre-alert`  | `"true"` / `"false"`                                  | `"true"`               | Show an advance desktop reminder 15 minutes before the next prayer.                                              |

### Shelf

| Key                   | Type                 | Default   | Description                                                                                                    |
| --------------------- | -------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `zenith-shelf-persist` | `"true"` / `"false"` | `"false"` | Keep notch shelf items across restarts. Off = items are cleared when Zenith closes. Max 10 items, newest first. |

### Music Appearance

| Key                                | Type                      | Default     | Description                                                                                     |
| ---------------------------------- | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `zenith-media-layout`               | `"classic"` / `"compact"` | `"classic"` | Expanded player style. **classic** = large album art. **compact** = small thumbnail + controls. |
| `zenith-media-ambience-enabled`     | `"true"` / `"false"`      | `"true"`    | Colored ambient glow behind expanded album art.                                                 |
| `zenith-media-compact-glow-enabled` | `"true"` / `"false"`      | `"true"`    | Glow effect around the collapsed compact thumbnail.                                             |
| `zenith-media-visualizer-enabled`   | `"true"` / `"false"`      | `"true"`    | Audio visualizer bars in music mode. Also accepts `zenith-visualizer-enabled` (legacy alias).    |
| `zenith-media-album-art-enabled`    | `"true"` / `"false"`      | `"true"`    | Show album artwork in the notch music display.                                                  |

### Overlays

| Key                                | Type                 | Default  | Description                                                              |
| ---------------------------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| `zenith-volume-overlay-enabled`     | `"true"` / `"false"` | `"true"` | Show Zenith volume HUD when volume changes (replaces native Windows OSD). |
| `zenith-volume-edge-enabled`        | `"true"` / `"false"` | `"true"` | Trigger volume HUD by hovering the left screen edge.                     |
| `zenith-brightness-overlay-enabled` | `"true"` / `"false"` | `"true"` | Show Zenith brightness HUD when brightness changes.                       |
| `zenith-brightness-edge-enabled`    | `"true"` / `"false"` | `"true"` | Trigger brightness HUD by hovering the right screen edge.                |

### Mouse Radial Launcher

| Key                                   | Type                                            | Default       | Description                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zenith-mouse-radial-enabled`         | `"true"` / `"false"`                            | `"true"`      | Enable or disable the Zenith Mouse Radial Menu launcher.                                                                                                    |
| `zenith-mouse-trigger-button`         | string                                          | `"middle"`    | Activation button / combo (e.g. `"middle"`, `"x1"`, `"x2"`, `"Ctrl+middle"`). Can be recorded directly in Settings.                                         |
| `zenith-mouse-trigger-mode`           | `"hold"` / `"click"`                            | `"hold"`      | Activation interaction mode. **hold** = menu opens on press and activates on release. **click** = click opens/pins menu, click item executes.               |
| `zenith-mouse-placement`              | `"cursor"` / `"center"`                         | `"cursor"`    | Where the wheel spawns: at cursor coordinates or fixed at monitor center.                                                                                   |
| `zenith-mouse-monitor`                | `"cursor"` / `"primary"`                        | `"cursor"`    | Which display to show the menu on: monitor where cursor resides or primary display.                                                                         |
| `zenith-mouse-selection-mode`         | `"area"` / `"cursor"`                           | `"area"`      | Aiming mechanics: **area** = 360° directional sectors; **cursor** = pointer must hover inside the tile plate.                                               |
| `zenith-mouse-area-wedges`            | `"true"` / `"false"`                            | `"true"`      | Render radial sector beams and seam dividers behind slices.                                                                                                 |
| `zenith-mouse-menu-radius`            | integer string (`"80"`–`"210"`)                 | `"126"`       | Radial distance in CSS px from center hub to tile plates.                                                                                                   |
| `zenith-mouse-icon-size`              | integer string (`"40"`–`"76"`)                  | `"56"`        | Tile plate size in CSS px.                                                                                                                                  |
| `zenith-mouse-app-spacing`            | integer string (`"4"`–`"28"`)                   | `"12"`        | Minimum spacing in CSS px between adjacent tiles.                                                                                                           |
| `zenith-mouse-backdrop-opacity`       | float string (`"0"`–`"1"`)                      | `"0.75"`      | Smoothstep radial scrim darkness behind the wheel.                                                                                                          |
| `zenith-mouse-hover-color`            | hex color string                                | `"#FFFFFF"`   | Highlight color for active slice and sector beam.                                                                                                           |
| `zenith-mouse-activation-threshold`   | integer string (`"36"`–`"96"`)                  | `"60"`        | Center hub dead-zone radius in CSS px before directional selection activates.                                                                               |
| `zenith-mouse-show-labels`            | `"true"` / `"false"`                            | `"true"`      | Show outer ray-aligned label pills around the wheel.                                                                                                        |
| `zenith-mouse-always-show-labels`     | `"true"` / `"false"`                            | `"false"`     | Keep all shortcut labels visible simultaneously instead of only the active slice.                                                                           |
| `zenith-mouse-show-workspace-pill`    | `"true"` / `"false"`                            | `"true"`      | Show the workspace switcher pill bar below the wheel.                                                                                                       |
| `zenith-mouse-number-launch`          | `"true"` / `"false"`                            | `"true"`      | Allow pressing number keys 1 through 9 while radial menu is visible to instantly trigger the corresponding slice.                                           |
| `zenith-mouse-number-labels`          | `"true"` / `"false"`                            | `"true"`      | Show circular 1–9 number badges on the top-left of tiles.                                                                                                   |
| `zenith-mouse-workspace-peek`         | `"true"` / `"false"`                            | `"true"`      | Hovering a workspace tab previews its slices without switching workspaces.                                                                                  |
| `zenith-mouse-workspace-peek-style`   | `"fan"` / `"ring"`                              | `"fan"`       | Layout style for workspace peek preview.                                                                                                                    |
| `zenith-mouse-workspace-peek-delay-ms`| milliseconds string (`"100"`–`"600"`)           | `"220"`       | Hover delay in ms before revealing workspace peek.                                                                                                          |
| `zenith-mouse-instant-activate`       | `"off"` / `"dwell"`                             | `"off"`       | Dwell activation: holding aim on a slice automatically triggers it after `zenith-mouse-instant-dwell-ms`.                                                   |
| `zenith-mouse-instant-dwell-ms`       | milliseconds string (`"160"`–`"900"`)           | `"220"`       | Hold duration in ms required for dwell auto-launch.                                                                                                         |
| `zenith-mouse-instant-sensitivity`    | `"low"` / `"medium"` / `"high"`                 | `"medium"`    | Jitter tolerance before dwell ring begins filling.                                                                                                          |
| `zenith-mouse-game-mode-enabled`      | `"true"` / `"false"`                            | `"true"`      | Suppress radial menu triggers while a fullscreen game or application is in the foreground.                                                                  |
| `zenith-mouse-game-mode-scope`        | `"all"` / `"list"`                              | `"all"`       | Game protection scope: suppress on **all** fullscreen apps, or only for listed executables.                                                                 |
| `zenith-mouse-game-mode-auto-detect`  | `"true"` / `"false"`                            | `"true"`      | Automatically detect Steam, Epic, Riot, and Xbox games when scope is `"list"`.                                                                              |
| `zenith-mouse-game-mode-blocked-apps` | comma-separated executables                     | `"csgo.exe, valorant.exe, league of legends.exe, dota2.exe"` | Process names to block trigger for when scope is `"list"`.                                                   |
| `zenith-mouse-sound-enabled`          | `"true"` / `"false"`                            | `"true"`      | Enable WebAudio procedural sound synthesizer for radial menu open and slice hover.                                                                         |
| `zenith-mouse-sound-volume`           | integer string (`"0"`–`"100"`)                  | `"70"`        | Master volume percentage for radial menu sound effects.                                                                                                     |
| `zenith-mouse-open-sound`             | sound voice id or `"off"`                       | `"sub-tick"`  | Synthesizer voice played on wheel open (`sub-tick`, `thump`, `knock`, `pluck`, `pulse`, `drop`, `felt-tap`, `rubber`, `reese`, `haptic`, or `off`).         |
| `zenith-mouse-hover-sound`            | sound voice id or `"off"`                       | `"sub-tick"`  | Synthesizer voice played on slice hover (`sub-tick`, `thump`, `knock`, `pluck`, `pulse`, `drop`, `felt-tap`, `rubber`, `reese`, `haptic`, or `off`).        |
| `zenith-mouse-active-workspace`       | workspace id                                    | `"main"`      | Currently selected radial workspace ID.                                                                                                                     |
| `zenith-mouse-workspaces`             | JSON string array                               | (default)     | Custom radial workspaces and items (`[{"id":"main","name":"Main","items":[...]}]`).                                                                         |

### Appearance

| Key                      | Type                                             | Default     | Description                                                                                                                                                 |
| ------------------------ | ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zenith-theme-mode`       | `"dark"` / `"light"` / `"custom"` / `"adaptive"` | `"dark"`    | Theme mode. **dark** = dark translucent. **light** = light translucent. **custom** = user-picked color. **adaptive** = follows Windows system accent color. |
| `zenith-theme-color`      | hex string                                       | `"#007aff"` | Custom theme color (used in `custom` and `adaptive` modes).                                                                                                 |
| `zenith-theme-opacity`    | float string                                     | `"0.80"`    | Background opacity (0.1 to 1.0).                                                                                                                            |
| `zenith-theme-saturation` | float string                                     | `"0.50"`    | Color saturation for custom/adaptive themes (0.0 to 1.0).                                                                                                   |
| `zenith-theme-brightness` | float string                                     | `"0.15"`    | Background brightness for custom/adaptive themes (0.0 to 1.0).                                                                                              |
| `zenith-corners-enabled`  | `"true"` / `"false"`                             | `"false"`   | Render rounded screen corner overlays on top edges.                                                                                                         |

### Status Widgets

| Key                    | Type        | Default                                    | Description                                                                                                 |
| ---------------------- | ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `zenith-status-widgets` | JSON string | `{"left":["weather"],"right":["battery"]}` | Widget layout in collapsed notch. Available: `"weather"`, `"battery"`, `"cpu"`, `"ram"`, `"disk"`, `"net"`. |

Example:

```json
{
	"zenith-status-widgets": "{\"left\":[\"cpu\",\"ram\"],\"right\":[\"battery\",\"net\"]}"
}
```

### System

| Key                            | Type                 | Default   | Description                                                                                          |
| ------------------------------ | -------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `zenith-language`               | `"en"` / `"ar"`      | `"en"`    | Application UI language (`"en"` for English, `"ar"` for Arabic).                                     |
| `zenith-scale`                  | float string         | `"1.0"`   | UI scale factor (0.8 to 1.3). Changing this re-registers AppBars to resize the reserved screen area. |
| `zenith-low-battery-threshold`  | integer string       | `"20"`    | Battery percentage that triggers the low-battery alert pulse (5 to 50, step 5).                      |
| `zenith-auto-update`            | `"true"` / `"false"` | `"false"` | Check for and download updates automatically on startup.                                             |
| `zenith-show-update-indicator`  | `"true"` / `"false"` | `"true"`  | Show a green dot on the notch when an update is available.                                           |
| `zenith-announcement-dismissed` | announcement id      | `""`      | ID of the last dismissed in-app announcement (published via `website/public/announcements.json`).    |
| `zenith-time-format-24h`        | `"true"` / `"false"` | `"false"` | Use 24-hour clock format in the notch. When `"false"`, displays 12-hour format with AM/PM.           |

### Internal (Do Not Edit Manually)

| Key                 | Type     | Description                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------------- |
| `zenith-first-run`   | sentinel | Set to `"done"` after first launch. Triggers splash screen if absent.                 |
| `zenith-app-version` | string   | Last known app version. If it differs from current, splash screen is shown on update. |

## Event System

Zenith uses two Tauri events for settings synchronization:

### `settings-changed`

- **Emitted by:** `save_setting` command (frontend or backend)
- **Payload:** `{ "key": "zenith-...", "value": ... }`
- **Purpose:** Broadcasts changes made through the Zenith UI to all windows
- **Key format:** Zenith-prefixed keys as-is (e.g. `"zenith-dock-mode"`)

### `settings-external-changed`

- **Emitted by:** File watcher (detects external edits to `settings.json`)
- **Payload:** `{ "key": "zenith-...", "value": ... }` or `{ "key": "zenith-...", "value": null }` for removed keys
- **Purpose:** Broadcasts changes made by external editors (VS Code, notepad, scripts)
- **Key format:** Zenith-prefixed keys as-is
- **Behavior:** Also syncs values to `localStorage` for instant frontend reads

### Flow

```
External editor saves settings.json
    ↓
File watcher detects change (ReadDirectoryChangesW)
    ↓
Diffs against SETTINGS_CACHE
    ↓
Emits settings-external-changed for each changed/removed key
    ↓
useSettingsSync hook updates React state + localStorage
    ↓
useSettingsSync hook updates React state
    ↓
UI re-renders with new values
```

## Example: Changing Dock Mode via Script

```powershell
# PowerShell: switch dock to smart mode
$json = Get-Content "$env:APPDATA\io.github.abdulllrahmandev.zenith\settings.json" | ConvertFrom-Json
$json.'zenith-dock-mode' = 'smart'
$json | ConvertTo-Json | Set-Content "$env:APPDATA\io.github.abdulllrahmandev.zenith\settings.json"
```

```python
# Python: disable dock
import json, os
path = os.path.join(os.environ["APPDATA"], "io.github.abdulllrahmandev.zenith", "settings.json")
with open(path) as f: settings = json.load(f)
settings['zenith-dock-enabled'] = 'false'
with open(path, 'w') as f: json.dump(settings, f)
```

## Notes

- All boolean values are strings (`"true"` / `"false"`) for consistency with `localStorage`.

### Translator (`المترجم`)

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `zenith-translator-enabled` | boolean string | `"true"` | Enable or disable global translator hotkeys |
| `zenith-translator-engine` | `"cloud"` \| `"local"` | `"cloud"` | AI backend (`cloud` API or offline `local` GGUF model) |
| `zenith-translator-provider` | `"gemini"` \| `"groq"` \| `"openai"` \| `"custom"` | `"gemini"` | Cloud API provider |
| `zenith-translator-api-key` | string | `""` | Google Gemini API key |
| `zenith-translator-groq-api-key` | string | `""` | Groq API key |
| `zenith-translator-openai-api-key` | string | `""` | OpenAI API key |
| `zenith-translator-custom-api-url` | string | `""` | Custom API base URL or full endpoint URL |
| `zenith-translator-custom-api-key` | string | `""` | Custom API key (optional for local servers) |
| `zenith-translator-custom-model` | string | `""` | Model identifier for the custom API |
| `zenith-translator-custom-api-format` | `"openai"` \| `"anthropic"` \| `"gemini"` | `"openai"` | Wire protocol used by the custom API |
| `zenith-translator-local-model-id` | string | `"qwen2.5-1.5b-instruct-q4_k_m"` | Offline local GGUF model identifier |
| `zenith-translator-target-language` | string | `"Arabic"` | Target language for quick card and screen overlays |
| `zenith-translator-output-mode` | `"full"` \| `"explain"` \| `"summarize"` | `"full"` | Quick processing mode |
| `zenith-translator-display-target` | `"floating"` \| `"notch"` | `"floating"` | Where translation card results appear (`floating` popup or `notch`) |
| `zenith-translator-select-all-fallback` | boolean string | `"true"` | Fallback to Ctrl+A if no text is selected |
| `zenith-translator-auto-paste-ar-to-en` | boolean string | `"true"` | Auto-paste English translation in-place via Ctrl+V |
| `zenith-translator-hotkey-ar-to-en` | string | `"Ctrl+Alt+A"` | Global hotkey for instant Arabic→English replacement |
| `zenith-translator-hotkey-any-to-ar` | string | `"Ctrl+Alt+X"` | Global hotkey for floating card translation/explanation |
| `zenith-translator-hotkey-screen` | string | `"Ctrl+Alt+S"` | Global hotkey for screen overlay translation |
| `zenith-translator-hotkey-fullpage` | string | `"Ctrl+Alt+W"` | Global hotkey for scrolling full-page overlay translation |
| `zenith-translator-hotkey-toggle` | string | `"Ctrl+Alt+Space"` | Global hotkey to open Zenith Settings |
| `zenith-translator-font-size` | integer string | `"15"` | Font size (`11`–`28` px) for floating card and screen overlay |
| `zenith-translator-card-timeout-sec` | integer string | `"12"` | Auto-dismiss timeout (`3`–`60` seconds) for floating card |
| `zenith-translator-overlay-opacity` | integer string | `"88"` | Overlay backdrop opacity (`40`–`100`) |
| `zenith-translator-custom-prompt-inplace` | string | `""` | Optional custom system prompt for in-place English translation |
| `zenith-translator-custom-prompt-quick` | string | `""` | Optional custom system prompt for quick card / overlay translation |
| `zenith-translator-card-pos` | JSON string | `""` | Saved floating card screen coordinates (`{"x":0,"y":0}`) |

### Tasks & Notes (`المهام والملاحظات`)

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `zenith-tasks-enabled` | boolean string | `"true"` | Enable or disable the Tasks & Notes panel in the Notch |
| `zenith-tasks-default-tab` | `"tasks"` \| `"notes"` \| `"remember"` | `"tasks"` | Initial sub-tab inside the Tasks & Notes notch panel |
| `zenith-tasks-last-tab` | `"tasks"` \| `"notes"` | `"tasks"` | Last sub-tab remembered when `zenith-tasks-default-tab` is `"remember"` |
| `zenith-tasks-show-tasks` | boolean string | `"true"` | Show the Tasks switcher icon on the left rail |
| `zenith-tasks-show-notes` | boolean string | `"true"` | Show the Notes switcher icon on the left rail |
| `zenith-tasks-show-quick-add` | boolean string | `"true"` | Show the quick-add input bar at the top of Tasks |
| `zenith-tasks-show-completed` | boolean string | `"true"` | Show completed tasks below active tasks |
| `zenith-tasks-show-task-notes` | boolean string | `"true"` | Display optional task details/notes subtext |
| `zenith-tasks-show-source-badge` | boolean string | `"true"` | Display Local/Google/Notion source badges |
| `zenith-tasks-density` | `"comfortable"` \| `"compact"` | `"comfortable"` | Spacing density for task rows |
| `zenith-tasks-default-source` | `"auto"` \| `"local"` \| `"google"` \| `"notion"` | `"auto"` | Default destination for newly created tasks |
| `zenith-tasks-auto-sync` | boolean string | `"true"` | Automatically sync when opening the panel and periodically |
| `zenith-tasks-sync-interval` | integer string | `"120"` | Background sync interval in seconds |
| `zenith-tasks-notion-token` | string | `""` | Notion internal integration token |
| `zenith-tasks-notion-tasks-db` | string | `""` | Notion Tasks database ID or URL |
| `zenith-tasks-notion-notes-db` | string | `""` | Notion Notes database or page ID / URL |
| `zenith-tasks-google-client-id` | string | `""` | Google OAuth 2.0 Desktop Client ID |
| `zenith-tasks-google-client-secret` | string | `""` | Google OAuth 2.0 Desktop Client Secret |
| `zenith-tasks-google-list-id` | string | `"@default"` | Selected Google Tasks list ID |
- The `useSettingsSync` hook auto-converts `"true"` / `"false"` strings to booleans.
- `auto-hide` mode values in `zenith-dock-mode` and `zenith-notch-mode` are legacy aliases for `smart` — they are mapped automatically.
- Changing `zenith-scale` triggers AppBar re-registration to adjust reserved screen space.
- Settings → General → Reset to Defaults removes every `zenith-` key from `settings.json` and `localStorage` (except the `zenith-first-run` / `zenith-app-version` lifecycle sentinels), then restarts Zenith. Pinned apps (`pinned_apps.json`) and uploaded icons (`custom_icons/`) are preserved.
- Theme changes (`zenith-theme-*`) are applied by reading all theme values from `localStorage` and calling `applyTheme()` — the theme system depends on all five theme keys being in sync.
