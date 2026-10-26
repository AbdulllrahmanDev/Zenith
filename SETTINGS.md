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
| `bloom-dock-enabled`               | `"true"` / `"false"`             | `"false"`     | Show or hide the Bloom Dock (taskbar replacement).                                                                                                                               |
| `bloom-dock-display`               | `"primary"` / `"all"` / display id | `"primary"`   | Which display to show the dock on: `"primary"` (always primary display regardless of name/resolution), `"all"` (all displays), or specific display id. Locked to `"primary"` when only one display is connected. |
| `bloom-dock-isolation`             | `"true"` / `"false"`             | `"false"`     | In multi-monitor mode, isolate dock apps to only show open windows running on that specific display.                                                                           |
| `bloom-dock-mode`                  | `"fixed"` / `"smart"` / `"peek"` | `"smart"`     | Dock visibility behavior. **fixed** = always visible as AppBar. **smart** = auto-hide when overlapped by fullscreen apps. **peek** = hidden until cursor approaches bottom edge. |
| `bloom-dock-edge-delay`            | milliseconds `"0"`–`"2000"`      | `"200"`       | In smart/peek mode, how long the cursor must rest against the bottom screen edge before the dock appears. `"0"` reveals instantly.                                               |
| `bloom-dock-preview-enabled`       | `"true"` / `"false"`             | `"true"`      | Show window thumbnail previews when hovering dock icons.                                                                                                                         |
| `bloom-dock-icon-only`             | `"true"` / `"false"`             | `"false"`     | Minimal icon-only style (no background/padding around icons).                                                                                                                    |
| `bloom-dock-separator-enabled`     | `"true"` / `"false"`             | `"true"`      | Show a divider between pinned and unpinned dock apps when unpinned apps are present. Unpinned apps remain on the right when disabled.                                            |
| `bloom-start-icon`                 | icon key / `custom:<data URI>`   | `"default"`   | Start button icon: `default`, `zenith-holographic`, `zenith-emerald`, `zenith-gold`, `zenith-iznik-blue`, `zenith-midnight-gold`, `zenith-ivory-emerald`, `windows`, or `custom:` followed by an uploaded image's data URI. |
| `bloom-dock-task-view`             | `"true"` / `"false"`             | `"false"`     | Show a Task View button beside Start that opens Task View, like the taskbar's. Right-click it to hide it again.                                                                  |
| `bloom-dock-adaptive`              | `"true"` / `"false"`             | `"false"`     | Fixed dock only. Stretch the dock to full width like a traditional taskbar while a window is maximized, and contract back when it's restored.                                    |
| `bloom-dock-win-number-enabled`    | `"true"` / `"false"`             | `"true"`      | When the taskbar is replaced, Win+1 through Win+9 activate the matching pinned dock app (focus/minimize if running, launch otherwise) instead of the native taskbar slots.       |
| `bloom-dock-extras-position`       | `"off"` / `"left"` / `"right"`   | `"off"`       | Show a dock extras section with drives, folders and the Recycle Bin beside the app icons, on the left or right side of the dock.                                                 |
| `bloom-dock-extras-drives`         | `"true"` / `"false"`             | `"true"`      | Show fixed, removable (with media) and connected mapped network drives in the dock extras. Empty card readers and unloaded discs are hidden.                                     |
| `bloom-dock-extras-hidden-drives`  | comma-separated letters          | `""`          | Drives left out of the dock extras, e.g. `"D,E"`. Drives not listed appear, including newly connected ones. Right-clicking a drive and choosing Remove from Dock adds it here. |
| `bloom-dock-extras-recycle-bin`    | `"true"` / `"false"`             | `"true"`      | Show the Recycle Bin in the dock extras. The icon reflects whether the bin holds anything.                                                                                       |
| `bloom-dock-extras-folders`        | comma-separated ids              | `"downloads"` | Known folders in the dock extras: any of `desktop`, `downloads`, `documents`, `pictures`, `music`, `videos`, or `"none"` for no folders.                                         |
| `bloom-dock-extras-custom-folders` | JSON array                       | `"[]"`        | User-added folders, e.g. `[{"name":"Projects","path":"D:\\Projects"}]`. Folders that no longer exist are skipped until they return.                                              |

### Notch

| Key                      | Type                             | Default   | Description                                                                                                                    |
| ------------------------ | -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bloom-notch-display`    | `"primary"` / `"all"` / display id | `"primary"` | Which display to show the notch on: `"primary"` (always primary display regardless of name/resolution), `"all"` (all displays), or specific display id. Locked to `"primary"` when only one display is connected. |
| `bloom-notch-mode`       | `"fixed"` / `"smart"` / `"peek"` | `"fixed"` | Notch (top bar) visibility behavior. Same modes as dock. **peek** shows the notch briefly on media events and notifications.   |
| `bloom-notch-edge-delay` | milliseconds `"0"`–`"2000"`      | `"200"`   | In smart/peek mode, how long the cursor must rest against the top screen edge before the notch peeks. `"0"` reveals instantly. |

### Weather

| Key                              | Type                         | Default     | Description                                                                        |
| -------------------------------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `bloom-weather-enabled`          | `"true"` / `"false"`         | `"true"`    | Show weather widget in the notch status bar.                                       |
| `bloom-weather-city`             | string                       | `""`        | Manually set city name for weather. Empty string = auto-detect via IP geolocation. |
| `bloom-weather-lat`              | number string                | (auto)      | Latitude coordinate for weather. Set automatically when a city is selected.        |
| `bloom-weather-lon`              | number string                | (auto)      | Longitude coordinate for weather. Set automatically when a city is selected.       |
| `bloom-weather-cached-temp`      | number string                | (none)      | Cached temperature value shown before next API fetch.                              |
| `bloom-weather-cached-condition` | string                       | (none)      | Cached weather condition text (e.g. "Partly Cloudy").                              |
| `bloom-temp-unit`                | `"celsius"` / `"fahrenheit"` | `"celsius"` | Temperature display unit.                                                          |

### Modules

| Key                         | Type                              | Default  | Description                                                                                              |
| --------------------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `bloom-calendar-enabled`    | `"true"` / `"false"`              | `"true"` | Enable calendar/timer mode in the notch.                                                                 |
| `bloom-music-mode-enabled`  | `"true"` / `"false"`              | `"true"` | Enable interactive music media widget.                                                                   |
| `bloom-music-compact-notch` | `"true"` / `"false"`              | `"true"` | Show compact music display (visualizer + artwork) in collapsed notch.                                    |
| `bloom-notch-remember-panel` | `"true"` / `"false"` | `"true"` | Click opens the last-used panel when on; when off, click opens `bloom-notch-default-panel`. |
| `bloom-notch-default-panel` | `"calendar"` / `"command-center"` / `"prayer"` | `"calendar"` | Fixed panel opened on click when panel memory is off. If calendar is disabled, Command Center opens instead. |
| `bloom-notch-last-panel`    | `"calendar"` / `"command-center"` / `"prayer"` | (unset)  | Last panel the notch was left on, saved by Bloom while panel memory is on. |
| `bloom-notch-click-to-open` | `"true"` / `"false"` | (legacy) | Old setting read only when `bloom-notch-remember-panel` is absent; `"false"` now selects fixed-panel behavior. |

### Prayer Times

| Key                       | Type                                                  | Default                | Description                                                                                                       |
| ------------------------- | ----------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bloom-prayer-enabled`    | `"true"` / `"false"`                                  | `"true"`               | Enable Islamic Prayer Times panel in the notch.                                                                   |
| `bloom-prayer-location-mode` | `"auto"` / `"manual"`                              | `"auto"`               | Location mode: **auto** = device GPS / IP geolocation; **manual** = specific country and city selection.          |
| `bloom-prayer-city`       | string                                                | `""`                   | Manually set city for prayer times when in manual mode.                                                           |
| `bloom-prayer-country`    | string                                                | `""`                   | Manually set country for prayer times when in manual mode.                                                        |
| `bloom-prayer-method`     | integer string (`"1"`–`"15"`)                         | `"4"`                  | Calculation method (e.g. 4 = Umm Al-Qura, 5 = Egyptian General Authority, 3 = MWL).                               |
| `bloom-prayer-time-offset`| integer string (`"-120"`–`"120"`)                     | `"0"`                  | Manual time offset adjustment in minutes.                                                                         |
| `bloom-prayer-alert-type` | `"sound_notification"` / `"notification_only"` / `"off"` | `"sound_notification"` | Notification mode when prayer time arrives (play Athan sound and/or show desktop notification).                   |
| `bloom-prayer-pre-alert`  | `"true"` / `"false"`                                  | `"true"`               | Show an advance desktop reminder 15 minutes before the next prayer.                                              |

### Shelf

| Key                   | Type                 | Default   | Description                                                                                                    |
| --------------------- | -------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `bloom-shelf-persist` | `"true"` / `"false"` | `"false"` | Keep notch shelf items across restarts. Off = items are cleared when Bloom closes. Max 10 items, newest first. |

### Music Appearance

| Key                                | Type                      | Default     | Description                                                                                     |
| ---------------------------------- | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `bloom-media-layout`               | `"classic"` / `"compact"` | `"classic"` | Expanded player style. **classic** = large album art. **compact** = small thumbnail + controls. |
| `bloom-media-ambience-enabled`     | `"true"` / `"false"`      | `"true"`    | Colored ambient glow behind expanded album art.                                                 |
| `bloom-media-compact-glow-enabled` | `"true"` / `"false"`      | `"true"`    | Glow effect around the collapsed compact thumbnail.                                             |
| `bloom-media-visualizer-enabled`   | `"true"` / `"false"`      | `"true"`    | Audio visualizer bars in music mode. Also accepts `bloom-visualizer-enabled` (legacy alias).    |
| `bloom-media-album-art-enabled`    | `"true"` / `"false"`      | `"true"`    | Show album artwork in the notch music display.                                                  |

### Overlays

| Key                                | Type                 | Default  | Description                                                              |
| ---------------------------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| `bloom-volume-overlay-enabled`     | `"true"` / `"false"` | `"true"` | Show Bloom volume HUD when volume changes (replaces native Windows OSD). |
| `bloom-volume-edge-enabled`        | `"true"` / `"false"` | `"true"` | Trigger volume HUD by hovering the left screen edge.                     |
| `bloom-brightness-overlay-enabled` | `"true"` / `"false"` | `"true"` | Show Bloom brightness HUD when brightness changes.                       |
| `bloom-brightness-edge-enabled`    | `"true"` / `"false"` | `"true"` | Trigger brightness HUD by hovering the right screen edge.                |

### Appearance

| Key                      | Type                                             | Default     | Description                                                                                                                                                 |
| ------------------------ | ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bloom-theme-mode`       | `"dark"` / `"light"` / `"custom"` / `"adaptive"` | `"dark"`    | Theme mode. **dark** = dark translucent. **light** = light translucent. **custom** = user-picked color. **adaptive** = follows Windows system accent color. |
| `bloom-theme-color`      | hex string                                       | `"#007aff"` | Custom theme color (used in `custom` and `adaptive` modes).                                                                                                 |
| `bloom-theme-opacity`    | float string                                     | `"0.80"`    | Background opacity (0.1 to 1.0).                                                                                                                            |
| `bloom-theme-saturation` | float string                                     | `"0.50"`    | Color saturation for custom/adaptive themes (0.0 to 1.0).                                                                                                   |
| `bloom-theme-brightness` | float string                                     | `"0.15"`    | Background brightness for custom/adaptive themes (0.0 to 1.0).                                                                                              |
| `bloom-corners-enabled`  | `"true"` / `"false"`                             | `"false"`   | Render rounded screen corner overlays on top edges.                                                                                                         |

### Status Widgets

| Key                    | Type        | Default                                    | Description                                                                                                 |
| ---------------------- | ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `bloom-status-widgets` | JSON string | `{"left":["weather"],"right":["battery"]}` | Widget layout in collapsed notch. Available: `"weather"`, `"battery"`, `"cpu"`, `"ram"`, `"disk"`, `"net"`. |

Example:

```json
{
	"bloom-status-widgets": "{\"left\":[\"cpu\",\"ram\"],\"right\":[\"battery\",\"net\"]}"
}
```

### System

| Key                            | Type                 | Default   | Description                                                                                          |
| ------------------------------ | -------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
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
- The `useSettingsSync` hook auto-converts `"true"` / `"false"` strings to booleans.
- `auto-hide` mode values in `zenith-dock-mode` and `zenith-notch-mode` are legacy aliases for `smart` — they are mapped automatically.
- Changing `zenith-scale` triggers AppBar re-registration to adjust reserved screen space.
- Settings → General → Reset to Defaults removes every `zenith-` key from `settings.json` and `localStorage` (except the `zenith-first-run` / `zenith-app-version` lifecycle sentinels), then restarts Zenith. Pinned apps (`pinned_apps.json`) and uploaded icons (`custom_icons/`) are preserved.
- Theme changes (`zenith-theme-*`) are applied by reading all theme values from `localStorage` and calling `applyTheme()` — the theme system depends on all five theme keys being in sync.
