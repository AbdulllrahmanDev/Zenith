import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "../updater";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { reloadIfMirrorWasStale } from "../hooks/settingsMirror";
import { getStoredLanguage, getTranslations } from "../i18n";
import { hexToHsl } from "../theme";
import {
	addCustomFolder,
	removeCustomFolder,
	toggleEnabledFolder,
	toggleHiddenDrive,
	DEFAULT_ENABLED_FOLDERS
} from "../dockExtras";
import type { WidgetConfig } from "./types";
import type { DisplayInfo } from "../dockApps";

function readBool(val: string | null): boolean {
	return val === "true";
}

type CustomApiFormat = "auto" | "openai" | "anthropic" | "gemini";

function parseCustomApiFormat(v: unknown): CustomApiFormat {
	return v === "openai" || v === "anthropic" || v === "gemini" ? v : "auto";
}

export function useSettings() {
	const [saveError, setSaveError] = useState(
		() => sessionStorage.getItem("zenith-settings-save-error") !== null
	);
	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const saveFailed = useRef(false);
	const debouncedSaveTimers = useRef<Record<string, number>>({});
	const pendingLocalWrites = useRef<Record<string, { value: string | null; until: number }>>({});
	const [autostart, setAutostart] = useState(false);
	const [weatherEnabled, setWeatherEnabled] = useState(true);
	const [calendarEnabled, setCalendarEnabled] = useState(true);
	const [prayerEnabled, setPrayerEnabled] = useState(
		() => localStorage.getItem("zenith-prayer-enabled") !== "false"
	);
	const [prayerCity, setPrayerCity] = useState(
		() => localStorage.getItem("zenith-prayer-city") || ""
	);
	const [prayerCountry, setPrayerCountry] = useState(
		() => localStorage.getItem("zenith-prayer-country") || ""
	);
	const [prayerLocationMode, setPrayerLocationMode] = useState<"auto" | "manual">(
		() => (localStorage.getItem("zenith-prayer-location-mode") === "manual" ? "manual" : "auto")
	);
	const [prayerMethod, setPrayerMethod] = useState(
		() => localStorage.getItem("zenith-prayer-method") || "5"
	);
	const [prayerTimeOffset, setPrayerTimeOffset] = useState(
		() => localStorage.getItem("zenith-prayer-time-offset") || "0"
	);
	const [prayerAlertType, setPrayerAlertType] = useState(
		() => localStorage.getItem("zenith-prayer-alert-type") || "sound_notification"
	);
	const [prayerPreAlert, setPrayerPreAlert] = useState(
		() => localStorage.getItem("zenith-prayer-pre-alert") !== "false"
	);
	const [prayerNotchPopup, setPrayerNotchPopup] = useState(
		() => localStorage.getItem("zenith-prayer-notch-popup") !== "false"
	);
	const [prayerLat, setPrayerLat] = useState<string>(
		() => localStorage.getItem("zenith-prayer-lat") || localStorage.getItem("bloom-prayer-lat") || ""
	);
	const [prayerLon, setPrayerLon] = useState<string>(
		() => localStorage.getItem("zenith-prayer-lon") || localStorage.getItem("bloom-prayer-lon") || ""
	);
	const [notificationsEnabled, setNotificationsEnabled] = useState(
		() => localStorage.getItem("zenith-notifications-enabled") !== "false"
	);
	const [notificationsSilent, setNotificationsSilent] = useState(
		() => localStorage.getItem("zenith-notifications-silent") === "true"
	);
	const [notificationsNotchEnabled, setNotificationsNotchEnabled] = useState(
		() => localStorage.getItem("zenith-notifications-notch-enabled") !== "false"
	);
	const [timerSoundEnabled, setTimerSoundEnabled] = useState(
		() => localStorage.getItem("zenith-timer-sound-enabled") !== "false"
	);
	const [musicModeEnabled, setMusicModeEnabled] = useState(true);
	const [notchRememberPanel, setNotchRememberPanel] = useState(
		() => (localStorage.getItem("zenith-notch-remember-panel") ??
			localStorage.getItem("zenith-notch-click-to-open")) !== "false"
	);
	const [notchDefaultPanel, setNotchDefaultPanel] = useState<
		"calendar" | "command-center" | "prayer" | "tasks" | "ai-chat"
	>(() => {
		const s = localStorage.getItem("zenith-notch-default-panel");
		if (s === "command-center" || s === "prayer" || s === "tasks" || s === "ai-chat") return s;
			return "calendar";
		}
	);
	const [musicCompactNotch, setMusicCompactNotch] = useState(true);
	const [shelfPersist, setShelfPersist] = useState(
		() => localStorage.getItem("zenith-shelf-persist") === "true"
	);
	const [volumeOverlayEnabled, setVolumeOverlayEnabled] = useState(true);
	const [volumeEdgeEnabled, setVolumeEdgeEnabled] = useState(
		() => localStorage.getItem("zenith-volume-edge-enabled") !== "false"
	);
	const [brightnessOverlayEnabled, setBrightnessOverlayEnabled] = useState(
		() => localStorage.getItem("zenith-brightness-overlay-enabled") !== "false"
	);
	const [brightnessEdgeEnabled, setBrightnessEdgeEnabled] = useState(
		() => localStorage.getItem("zenith-brightness-edge-enabled") !== "false"
	);
	const [mediaAmbienceEnabled, setMediaAmbienceEnabled] = useState(true);
	const [mediaCompactGlowEnabled, setMediaCompactGlowEnabled] = useState(true);
	const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(
		() => (localStorage.getItem("zenith-media-layout") as "classic" | "compact") || "classic"
	);
	const [cornersEnabled, setCornersEnabled] = useState(
		() => localStorage.getItem("zenith-corners-enabled") === "true"
	);
	const [notchFloating, setNotchFloating] = useState(
		() => localStorage.getItem("zenith-notch-floating") !== "false"
	);
	const [showUpdateIndicator, setShowUpdateIndicator] = useState(
		() => localStorage.getItem("zenith-show-update-indicator") !== "false"
	);
	const [timeFormat24h, setTimeFormat24h] = useState(
		() => localStorage.getItem("zenith-time-format-24h") === "true"
	);
	const [tempUnitFahrenheit, setTempUnitFahrenheit] = useState(false);
	const [cityName, setCityName] = useState("");
	const [citySearchResults, setCitySearchResults] = useState<
		Array<{ name: string; country: string; latitude: number; longitude: number }>
	>([]);
	const [showCityDropdown, setShowCityDropdown] = useState(false);
	const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
		left: ["weather"],
		right: ["battery"]
	});
	const [dockEnabled, setDockEnabled] = useState(
		() => localStorage.getItem("zenith-dock-enabled") === "true"
	);
	const [dockPreviewEnabled, setDockPreviewEnabled] = useState(true);
	const [dockIconOnly, setDockIconOnly] = useState(
		() => localStorage.getItem("zenith-dock-icon-only") === "true"
	);
	const [dockSeparatorEnabled, setDockSeparatorEnabled] = useState(
		() => localStorage.getItem("zenith-dock-separator-enabled") !== "false"
	);
	const [startIcon, setStartIcon] = useState(
		() => localStorage.getItem("zenith-start-icon") || "default"
	);
	const [dockAdaptive, setDockAdaptive] = useState(
		() => localStorage.getItem("zenith-dock-adaptive") === "true"
	);
	const [dockWinNumberEnabled, setDockWinNumberEnabled] = useState(
		() => localStorage.getItem("zenith-dock-win-number-enabled") !== "false"
	);
	const [dockExtrasPosition, setDockExtrasPosition] = useState(
		() => localStorage.getItem("zenith-dock-extras-position") || "off"
	);
	const [dockExtrasDrives, setDockExtrasDrives] = useState(
		() => localStorage.getItem("zenith-dock-extras-drives") !== "false"
	);
	const [dockExtrasHiddenDrives, setDockExtrasHiddenDrives] = useState(
		() => localStorage.getItem("zenith-dock-extras-hidden-drives") || ""
	);
	const [dockExtrasRecycleBin, setDockExtrasRecycleBin] = useState(
		() => localStorage.getItem("zenith-dock-extras-recycle-bin") !== "false"
	);
	const [dockTaskView, setDockTaskView] = useState(
		() => localStorage.getItem("zenith-dock-task-view") === "true"
	);
	const [dockExtrasFolders, setDockExtrasFolders] = useState(
		() => localStorage.getItem("zenith-dock-extras-folders") ?? DEFAULT_ENABLED_FOLDERS
	);
	const [dockExtrasCustomFolders, setDockExtrasCustomFolders] = useState(
		() => localStorage.getItem("zenith-dock-extras-custom-folders") || "[]"
	);
	const [dockMode, setDockMode] = useState(() => {
		const raw = localStorage.getItem("zenith-dock-mode") || "smart";
		return raw === "auto-hide" ? "smart" : raw;
	});
	const [dockEdgeDelay, setDockEdgeDelay] = useState(() => {
		const val = localStorage.getItem("zenith-dock-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [notchMode, setNotchMode] = useState("fixed");
	const [notchEdgeDelay, setNotchEdgeDelay] = useState(() => {
		const val = localStorage.getItem("zenith-notch-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [notchWorkDelay, setNotchWorkDelay] = useState(() => {
		const val = localStorage.getItem("zenith-notch-work-delay");
		if (val && val.trim().toLowerCase() === "never") return "never";
		const parsed = val !== null ? parseInt(val, 10) : 2000;
		return Number.isFinite(parsed) ? String(Math.min(5000, Math.max(500, parsed))) : "2000";
	});
	const [notchWorkLastDelayMs, setNotchWorkLastDelayMs] = useState(() => {
		const val = localStorage.getItem("zenith-notch-work-delay");
		const parsed = val !== null ? parseInt(val, 10) : 2000;
		return Number.isFinite(parsed) ? Math.min(5000, Math.max(500, parsed)) : 2000;
	});
	const [notchPosition, setNotchPosition] = useState<"left" | "center" | "right">(() => {
		const val = localStorage.getItem("zenith-notch-position");
		return val === "left" || val === "right" ? val : "center";
	});
	const [displays, setDisplays] = useState<DisplayInfo[]>([]);
	const [notchDisplay, setNotchDisplay] = useState(
		() => localStorage.getItem("zenith-notch-display") || "primary"
	);
	const [dockDisplay, setDockDisplay] = useState(
		() => localStorage.getItem("zenith-dock-display") || "primary"
	);
	const [dockIsolation, setDockIsolation] = useState(
		() => localStorage.getItem("zenith-dock-isolation") === "true"
	);

	// Mouse & Radial Menu State
	const [mouseRadialEnabled, setMouseRadialEnabled] = useState(
		() => localStorage.getItem("zenith-mouse-radial-enabled") !== "false"
	);
	const [mouseTriggerButton, setMouseTriggerButton] = useState(
		() => localStorage.getItem("zenith-mouse-trigger-button") || "middle"
	);
	const [mouseTriggerMode, setMouseTriggerMode] = useState<"hold" | "click">(
		() => (localStorage.getItem("zenith-mouse-trigger-mode") === "click" ? "click" : "hold")
	);
	const [mousePlacement, setMousePlacement] = useState<"cursor" | "center">(
		() => (localStorage.getItem("zenith-mouse-placement") === "center" ? "center" : "cursor")
	);
	const [mouseMonitor, setMouseMonitor] = useState<"cursor" | "primary">(
		() => (localStorage.getItem("zenith-mouse-monitor") === "primary" ? "primary" : "cursor")
	);
	const [mouseSelectionMode, setMouseSelectionMode] = useState<"area" | "cursor">(
		() => (localStorage.getItem("zenith-mouse-selection-mode") === "cursor" ? "cursor" : "area")
	);
	const [mouseAreaWedges, setMouseAreaWedges] = useState(
		() => localStorage.getItem("zenith-mouse-area-wedges") !== "false"
	);
	const [mouseInstantActivate, setMouseInstantActivate] = useState<"off" | "dwell">(
		() => (localStorage.getItem("zenith-mouse-instant-activate") === "dwell" ? "dwell" : "off")
	);
	const [mouseInstantDwellMs, setMouseInstantDwellMs] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-instant-dwell-ms") || "220", 10)
	);
	const [mouseInstantSensitivity, setMouseInstantSensitivity] = useState<"low" | "medium" | "high">(
		() => {
			const s = localStorage.getItem("zenith-mouse-instant-sensitivity");
			return s === "low" || s === "high" ? s : "medium";
		}
	);
	const [mouseNumberLaunch, setMouseNumberLaunch] = useState(
		() => localStorage.getItem("zenith-mouse-number-launch") !== "false"
	);
	const [mouseNumberLabels, setMouseNumberLabels] = useState(
		() => localStorage.getItem("zenith-mouse-number-labels") !== "false"
	);
	const [mouseWorkspacePeek, setMouseWorkspacePeek] = useState(
		() => localStorage.getItem("zenith-mouse-workspace-peek") !== "false"
	);
	const [mouseWorkspacePeekStyle, setMouseWorkspacePeekStyle] = useState<"fan" | "ring">(
		() => (localStorage.getItem("zenith-mouse-workspace-peek-style") === "ring" ? "ring" : "fan")
	);
	const [mouseWorkspacePeekDelayMs, setMouseWorkspacePeekDelayMs] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-workspace-peek-delay-ms") || "220", 10)
	);
	const [mouseGameModeEnabled, setMouseGameModeEnabled] = useState(
		() => localStorage.getItem("zenith-mouse-game-mode-enabled") !== "false"
	);
	const [mouseGameModeScope, setMouseGameModeScope] = useState<"all" | "list">(
		() => (localStorage.getItem("zenith-mouse-game-mode-scope") === "list" ? "list" : "all")
	);
	const [mouseGameModeBlockedApps, setMouseGameModeBlockedApps] = useState(
		() => localStorage.getItem("zenith-mouse-game-mode-blocked-apps") || "csgo.exe, valorant.exe, league of legends.exe, dota2.exe"
	);
	const [mouseGameModeAutoDetect, setMouseGameModeAutoDetect] = useState(
		() => localStorage.getItem("zenith-mouse-game-mode-auto-detect") !== "false"
	);
	const [mouseSoundEnabled, setMouseSoundEnabled] = useState(
		() => localStorage.getItem("zenith-mouse-sound-enabled") !== "false"
	);
	const [mouseSoundVolume, setMouseSoundVolume] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-sound-volume") || "70", 10)
	);
	const [mouseMenuRadius, setMouseMenuRadius] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-menu-radius") || "126", 10)
	);
	const [mouseIconSize, setMouseIconSize] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-icon-size") || "56", 10)
	);
	const [mouseAppSpacing, setMouseAppSpacing] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-app-spacing") || "12", 10)
	);
	const [mouseBackdropOpacity, setMouseBackdropOpacity] = useState<number>(
		() => parseFloat(localStorage.getItem("zenith-mouse-backdrop-opacity") || "0.75")
	);
	const [mouseHoverColor, setMouseHoverColor] = useState<string>(
		() => localStorage.getItem("zenith-mouse-hover-color") || "#FFFFFF"
	);
	const [mouseActivationThreshold, setMouseActivationThreshold] = useState<number>(
		() => parseInt(localStorage.getItem("zenith-mouse-activation-threshold") || "60", 10)
	);
	const [mouseShowLabels, setMouseShowLabels] = useState<boolean>(
		() => localStorage.getItem("zenith-mouse-show-labels") !== "false"
	);
	const [mouseAlwaysShowLabels, setMouseAlwaysShowLabels] = useState<boolean>(
		() => localStorage.getItem("zenith-mouse-always-show-labels") === "true"
	);
	const [mouseShowWorkspacePill, setMouseShowWorkspacePill] = useState<boolean>(
		() => localStorage.getItem("zenith-mouse-show-workspace-pill") !== "false"
	);
	const [mouseOpenSound, setMouseOpenSound] = useState<string>(
		() => localStorage.getItem("zenith-mouse-open-sound") || "sub-tick"
	);
	const [mouseHoverSound, setMouseHoverSound] = useState<string>(
		() => localStorage.getItem("zenith-mouse-hover-sound") || "sub-tick"
	);

	// Converter State
	const [converterEnabled, setConverterEnabled] = useState(
		() => localStorage.getItem("zenith-converter-enabled") !== "false"
	);
	const [converterTriggerKey, setConverterTriggerKey] = useState<
		"ctrl" | "alt" | "shift" | "right-drag"
	>(() => {
		const k = localStorage.getItem("zenith-converter-trigger-key");
		return k === "alt" || k === "shift" || k === "right-drag" ? k : "ctrl";
	});
	const [converterBrowserDrag, setConverterBrowserDrag] = useState(
		() => localStorage.getItem("zenith-converter-browser-drag") !== "false"
	);
	const [converterOutputMode, setConverterOutputMode] = useState<"next-to-source" | "folder">(
		() => (localStorage.getItem("zenith-converter-output-mode") === "folder" ? "folder" : "next-to-source")
	);
	const [converterOutputFolder, setConverterOutputFolder] = useState(
		() => localStorage.getItem("zenith-converter-output-folder") || ""
	);
	const [converterExplorerMenu, setConverterExplorerMenu] = useState(
		() => localStorage.getItem("zenith-converter-explorer-menu") === "true"
	);

	const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);

	// ── Translator state ──
	const [translatorEnabled, setTranslatorEnabled] = useState(
		() => localStorage.getItem("zenith-translator-enabled") !== "false"
	);
	const [translatorEngine, setTranslatorEngine] = useState<"cloud" | "local">(() =>
		localStorage.getItem("zenith-translator-engine") === "local" ? "local" : "cloud"
	);
	const [translatorProvider, setTranslatorProvider] = useState<"gemini" | "groq" | "openai" | "custom">(() => {
		const p = localStorage.getItem("zenith-translator-provider");
		return p === "groq" || p === "openai" || p === "custom" ? p : "gemini";
	});
	const [translatorApiKey, setTranslatorApiKey] = useState(
		() => localStorage.getItem("zenith-translator-api-key") || ""
	);
	const [translatorGroqApiKey, setTranslatorGroqApiKey] = useState(
		() => localStorage.getItem("zenith-translator-groq-api-key") || ""
	);
	const [translatorOpenaiApiKey, setTranslatorOpenaiApiKey] = useState(
		() => localStorage.getItem("zenith-translator-openai-api-key") || ""
	);
	const [translatorCustomApiUrl, setTranslatorCustomApiUrl] = useState(
		() => localStorage.getItem("zenith-translator-custom-api-url") || ""
	);
	const [translatorCustomApiKey, setTranslatorCustomApiKey] = useState(
		() => localStorage.getItem("zenith-translator-custom-api-key") || ""
	);
	const [translatorCustomModel, setTranslatorCustomModel] = useState(
		() => localStorage.getItem("zenith-translator-custom-model") || ""
	);
	const [translatorCustomApiFormat, setTranslatorCustomApiFormat] = useState<CustomApiFormat>(() =>
		parseCustomApiFormat(localStorage.getItem("zenith-translator-custom-api-format"))
	);
	const [translatorTargetLanguage, setTranslatorTargetLanguage] = useState(
		() => localStorage.getItem("zenith-translator-target-language") || "Arabic"
	);
	const [translatorOutputMode, setTranslatorOutputMode] = useState<"full" | "explain" | "summarize">(() => {
		const m = localStorage.getItem("zenith-translator-output-mode");
		return m === "explain" || m === "summarize" ? m : "full";
	});
	const [translatorDisplayTarget, setTranslatorDisplayTarget] = useState<"floating" | "notch">(() =>
		localStorage.getItem("zenith-translator-display-target") === "notch" ? "notch" : "floating"
	);
	const [translatorSelectAllFallback, setTranslatorSelectAllFallback] = useState(
		() => localStorage.getItem("zenith-translator-select-all-fallback") !== "false"
	);
	const [translatorAutoPasteArToEn, setTranslatorAutoPasteArToEn] = useState(
		() => localStorage.getItem("zenith-translator-auto-paste-ar-to-en") !== "false"
	);
	const [translatorHotkeyArToEn, setTranslatorHotkeyArToEn] = useState(
		() => localStorage.getItem("zenith-translator-hotkey-ar-to-en") || "Ctrl+Alt+A"
	);
	const [translatorHotkeyAnyToAr, setTranslatorHotkeyAnyToAr] = useState(
		() => localStorage.getItem("zenith-translator-hotkey-any-to-ar") || "Ctrl+Alt+X"
	);
	const [translatorHotkeyScreen, setTranslatorHotkeyScreen] = useState(
		() => localStorage.getItem("zenith-translator-hotkey-screen") || "Ctrl+Alt+S"
	);
	const [translatorHotkeyFullpage, setTranslatorHotkeyFullpage] = useState(
		() => localStorage.getItem("zenith-translator-hotkey-fullpage") || "Ctrl+Alt+W"
	);
	const [translatorHotkeyToggle, setTranslatorHotkeyToggle] = useState(
		() => localStorage.getItem("zenith-translator-hotkey-toggle") || "Ctrl+Alt+Space"
	);
	const [translatorFontSize, setTranslatorFontSize] = useState(
		() => parseInt(localStorage.getItem("zenith-translator-font-size") || "15", 10)
	);
	const [translatorCardTimeoutSec, setTranslatorCardTimeoutSec] = useState(
		() => parseInt(localStorage.getItem("zenith-translator-card-timeout-sec") || "12", 10)
	);
	const [translatorOverlayOpacity, setTranslatorOverlayOpacity] = useState(
		() => parseInt(localStorage.getItem("zenith-translator-overlay-opacity") || "88", 10)
	);
	const [translatorCustomPromptInplace, setTranslatorCustomPromptInplace] = useState(
		() => localStorage.getItem("zenith-translator-custom-prompt-inplace") || ""
	);
	const [translatorCustomPromptQuick, setTranslatorCustomPromptQuick] = useState(
		() => localStorage.getItem("zenith-translator-custom-prompt-quick") || ""
	);

	// ── AI Chat state ──
	const [aiChatEnabled, setAiChatEnabled] = useState(
		() => localStorage.getItem("zenith-ai-chat-enabled") !== "false"
	);
	const [aiChatProvider, setAiChatProvider] = useState<
		"inherit" | "gemini" | "groq" | "openai" | "custom" | "local"
	>(() => {
		const s = localStorage.getItem("zenith-ai-chat-provider");
		return s === "gemini" || s === "groq" || s === "openai" || s === "custom" || s === "local"
			? s
			: "inherit";
	});
	const [aiChatSystemPrompt, setAiChatSystemPrompt] = useState(
		() => localStorage.getItem("zenith-ai-chat-system-prompt") || ""
	);

	// ── Tasks & Notes state ──
	const [tasksEnabled, setTasksEnabled] = useState(
		() => localStorage.getItem("zenith-tasks-enabled") !== "false"
	);
	const [tasksDefaultTab, setTasksDefaultTab] = useState<"tasks" | "notes" | "remember">(() => {
		const v = localStorage.getItem("zenith-tasks-default-tab");
		return v === "notes" || v === "remember" ? v : "tasks";
	});
	const [tasksShowTasksTab, setTasksShowTasksTab] = useState(
		() => localStorage.getItem("zenith-tasks-show-tasks") !== "false"
	);
	const [tasksShowNotesTab, setTasksShowNotesTab] = useState(
		() => localStorage.getItem("zenith-tasks-show-notes") !== "false"
	);
	const [tasksShowQuickAdd, setTasksShowQuickAdd] = useState(
		() => localStorage.getItem("zenith-tasks-show-quick-add") !== "false"
	);
	const [tasksShowCompleted, setTasksShowCompleted] = useState(
		() => localStorage.getItem("zenith-tasks-show-completed") !== "false"
	);
	const [tasksShowTaskNotes, setTasksShowTaskNotes] = useState(
		() => localStorage.getItem("zenith-tasks-show-task-notes") !== "false"
	);
	const [tasksShowSourceBadge, setTasksShowSourceBadge] = useState(
		() => localStorage.getItem("zenith-tasks-show-source-badge") !== "false"
	);
	const [tasksDensity, setTasksDensity] = useState<"comfortable" | "compact">(() =>
		localStorage.getItem("zenith-tasks-density") === "compact" ? "compact" : "comfortable"
	);
	const [tasksDefaultSource, setTasksDefaultSource] = useState<"auto" | "local" | "google" | "notion">(() => {
		const v = localStorage.getItem("zenith-tasks-default-source");
		return v === "local" || v === "google" || v === "notion" ? v : "auto";
	});
	const [tasksAutoSync, setTasksAutoSync] = useState(
		() => localStorage.getItem("zenith-tasks-auto-sync") !== "false"
	);
	const [tasksSyncIntervalSec, setTasksSyncIntervalSec] = useState(
		() => parseInt(localStorage.getItem("zenith-tasks-sync-interval") || "120", 10) || 120
	);
	const [tasksNotionToken, setTasksNotionToken] = useState(
		() => localStorage.getItem("zenith-tasks-notion-token") || ""
	);
	const [tasksNotionTasksDb, setTasksNotionTasksDb] = useState(
		() => localStorage.getItem("zenith-tasks-notion-tasks-db") || ""
	);
	const [tasksNotionNotesDb, setTasksNotionNotesDb] = useState(
		() => localStorage.getItem("zenith-tasks-notion-notes-db") || ""
	);
	const [tasksGoogleClientId, setTasksGoogleClientId] = useState(
		() => localStorage.getItem("zenith-tasks-google-client-id") || ""
	);
	const [tasksGoogleClientSecret, setTasksGoogleClientSecret] = useState(
		() => localStorage.getItem("zenith-tasks-google-client-secret") || ""
	);
	const [tasksGoogleListId, setTasksGoogleListId] = useState(
		() => localStorage.getItem("zenith-tasks-google-list-id") || "@default"
	);
	const [updateStatus, setUpdateStatus] = useState<
		"idle" | "checking" | "available" | "uptodate" | "error" | "downloading" | "installing"
	>("idle");
	const [updateVersion, setUpdateVersion] = useState("");
	const [appVersion, setAppVersion] = useState("");
	const [autoUpdate, setAutoUpdate] = useState(
		() => localStorage.getItem("zenith-auto-update") === "true"
	);
	const [scale, setScale] = useState(() =>
		parseFloat(localStorage.getItem("zenith-scale") || "1.0")
	);
	const [themeMode, setThemeMode] = useState(
		() => localStorage.getItem("zenith-theme-mode") || "dark"
	);
	const [themeColor, setThemeColor] = useState(
		() => localStorage.getItem("zenith-theme-color") || "#007aff"
	);
	const [themeOpacity, setThemeOpacity] = useState(() => {
		const val = localStorage.getItem("zenith-theme-opacity");
		return val !== null ? parseFloat(val) : 0.8;
	});
	const [themeSaturation, setThemeSaturation] = useState(() => {
		const val = localStorage.getItem("zenith-theme-saturation");
		return val !== null ? parseFloat(val) : 0.5;
	});
	const [themeBrightness, setThemeBrightness] = useState(() => {
		const val = localStorage.getItem("zenith-theme-brightness");
		return val !== null ? parseFloat(val) : 0.15;
	});
	const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">(
		"idle"
	);
	const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">(
		"idle"
	);

	// ── Load all settings from backend + localStorage ──
	const loadAllSettings = useCallback(async () => {
		try {
			const settings: Record<string, string> = await invoke("load_settings");
			if (await reloadIfMirrorWasStale(settings)) return;
			const getVal = (key: string) => {
				const val = settings[key];
				if (val !== undefined && val !== null) return String(val);
				return localStorage.getItem(key);
			};

			const apply = <T>(
				val: string | null,
				setter: (v: T) => void,
				transform: (v: string) => T
			) => {
				if (val !== null) setter(transform(val));
			};

			apply(getVal("zenith-weather-enabled"), setWeatherEnabled, readBool);
			apply(getVal("zenith-calendar-enabled"), setCalendarEnabled, readBool);
			apply(getVal("zenith-timer-sound-enabled"), setTimerSoundEnabled, readBool);
			apply(getVal("zenith-music-mode-enabled"), setMusicModeEnabled, readBool);
			apply(getVal("zenith-notch-remember-panel") ?? getVal("zenith-notch-click-to-open"),
				setNotchRememberPanel, readBool);
			apply(getVal("zenith-notch-default-panel"), setNotchDefaultPanel, (v) =>
				v === "command-center" || v === "prayer" || v === "tasks" || v === "ai-chat"
					? v
					: "calendar"
			);
			apply(getVal("zenith-music-compact-notch"), setMusicCompactNotch, readBool);
			apply(getVal("zenith-shelf-persist"), setShelfPersist, readBool);
			apply(getVal("zenith-volume-overlay-enabled"), setVolumeOverlayEnabled, readBool);
			apply(getVal("zenith-brightness-overlay-enabled"), setBrightnessOverlayEnabled, readBool);
			apply(getVal("zenith-media-ambience-enabled"), setMediaAmbienceEnabled, readBool);
			apply(getVal("zenith-media-compact-glow-enabled"), setMediaCompactGlowEnabled, readBool);
			apply(getVal("zenith-corners-enabled"), setCornersEnabled, readBool);
			apply(getVal("zenith-notch-floating"), setNotchFloating, readBool);
			apply(getVal("zenith-time-format-24h"), setTimeFormat24h, readBool);
			apply(getVal("zenith-show-update-indicator"), setShowUpdateIndicator, readBool);
			apply(getVal("zenith-auto-update"), setAutoUpdate, readBool);
			apply(getVal("zenith-volume-edge-enabled"), setVolumeEdgeEnabled, readBool);
			apply(getVal("zenith-brightness-edge-enabled"), setBrightnessEdgeEnabled, readBool);
			apply(getVal("zenith-dock-enabled"), setDockEnabled, readBool);
			apply(getVal("zenith-dock-preview-enabled"), setDockPreviewEnabled, readBool);
			apply(getVal("zenith-dock-icon-only"), setDockIconOnly, readBool);
			apply(getVal("zenith-dock-separator-enabled"), setDockSeparatorEnabled, readBool);
			apply(getVal("zenith-start-icon"), setStartIcon, (v) => v);
			apply(getVal("zenith-dock-adaptive"), setDockAdaptive, readBool);
			apply(getVal("zenith-dock-win-number-enabled"), setDockWinNumberEnabled, readBool);
			apply(getVal("zenith-dock-extras-position"), setDockExtrasPosition, (v) => v);
			apply(getVal("zenith-dock-extras-drives"), setDockExtrasDrives, readBool);
			apply(getVal("zenith-dock-extras-recycle-bin"), setDockExtrasRecycleBin, readBool);
			apply(getVal("zenith-dock-task-view"), setDockTaskView, readBool);
			apply(getVal("zenith-dock-extras-hidden-drives"), setDockExtrasHiddenDrives, (v) => v);
			apply(getVal("zenith-dock-extras-folders"), setDockExtrasFolders, (v) => v);
			apply(getVal("zenith-dock-extras-custom-folders"), setDockExtrasCustomFolders, (v) => v);

			apply(getVal("zenith-temp-unit"), setTempUnitFahrenheit, (v) => v === "fahrenheit");
			apply(getVal("zenith-scale"), setScale, parseFloat);
			apply(getVal("zenith-low-battery-threshold"), setLowBatteryThreshold, parseInt);

			apply(getVal("zenith-notch-mode"), setNotchMode, (v) => (v === "auto-hide" ? "smart" : v));
			apply(getVal("zenith-notch-edge-delay"), setNotchEdgeDelay, parseInt);
			const rawWorkDelay = getVal("zenith-notch-work-delay");
			if (typeof rawWorkDelay === "string") {
				if (rawWorkDelay.trim().toLowerCase() === "never") {
					setNotchWorkDelay("never");
				} else {
					const parsed = parseInt(rawWorkDelay, 10);
					const clamped = Number.isFinite(parsed) ? Math.min(5000, Math.max(500, parsed)) : 2000;
					setNotchWorkLastDelayMs(clamped);
					setNotchWorkDelay(String(clamped));
				}
			}
			apply(getVal("zenith-notch-position"), setNotchPosition, (v) =>
				v === "left" || v === "right" ? v : "center"
			);
			apply(getVal("zenith-dock-mode"), setDockMode, (v) => (v === "auto-hide" ? "smart" : v));
			apply(getVal("zenith-dock-edge-delay"), setDockEdgeDelay, parseInt);
			apply(getVal("zenith-notch-display"), setNotchDisplay, (v) => v);
			apply(getVal("zenith-dock-display"), setDockDisplay, (v) => v);
			apply(getVal("zenith-dock-isolation"), setDockIsolation, readBool);

			// Mouse & Radial Menu Settings
			apply(getVal("zenith-mouse-radial-enabled"), setMouseRadialEnabled, readBool);
			apply(getVal("zenith-mouse-trigger-button"), setMouseTriggerButton, (v) => v);
			apply(getVal("zenith-mouse-trigger-mode"), setMouseTriggerMode, (v) => v === "click" ? "click" : "hold");
			apply(getVal("zenith-mouse-placement"), setMousePlacement, (v) => v === "center" ? "center" : "cursor");
			apply(getVal("zenith-mouse-monitor"), setMouseMonitor, (v) => v === "primary" ? "primary" : "cursor");
			apply(getVal("zenith-mouse-selection-mode"), setMouseSelectionMode, (v) => v === "cursor" ? "cursor" : "area");
			apply(getVal("zenith-mouse-area-wedges"), setMouseAreaWedges, (v) => v !== "false");
			apply(getVal("zenith-mouse-instant-activate"), setMouseInstantActivate, (v) => v === "dwell" ? "dwell" : "off");
			apply(getVal("zenith-mouse-instant-dwell-ms"), setMouseInstantDwellMs, parseInt);
			apply(getVal("zenith-mouse-instant-sensitivity"), setMouseInstantSensitivity, (v) => v === "low" || v === "high" ? v : "medium");
			apply(getVal("zenith-mouse-number-launch"), setMouseNumberLaunch, (v) => v !== "false");
			apply(getVal("zenith-mouse-number-labels"), setMouseNumberLabels, (v) => v !== "false");
			apply(getVal("zenith-mouse-workspace-peek"), setMouseWorkspacePeek, (v) => v !== "false");
			apply(getVal("zenith-mouse-workspace-peek-style"), setMouseWorkspacePeekStyle, (v) => v === "ring" ? "ring" : "fan");
			apply(getVal("zenith-mouse-workspace-peek-delay-ms"), setMouseWorkspacePeekDelayMs, parseInt);
			apply(getVal("zenith-mouse-game-mode-enabled"), setMouseGameModeEnabled, (v) => v !== "false");
			apply(getVal("zenith-mouse-game-mode-scope"), setMouseGameModeScope, (v) => v === "list" ? "list" : "all");
			apply(getVal("zenith-mouse-game-mode-blocked-apps"), setMouseGameModeBlockedApps, (v) => v);
			apply(getVal("zenith-mouse-game-mode-auto-detect"), setMouseGameModeAutoDetect, (v) => v !== "false");
			apply(getVal("zenith-mouse-sound-enabled"), setMouseSoundEnabled, (v) => v !== "false");
			apply(getVal("zenith-mouse-sound-volume"), setMouseSoundVolume, parseInt);
			apply(getVal("zenith-mouse-menu-radius"), setMouseMenuRadius, parseInt);
			apply(getVal("zenith-mouse-icon-size"), setMouseIconSize, parseInt);
			apply(getVal("zenith-mouse-app-spacing"), setMouseAppSpacing, parseInt);
			apply(getVal("zenith-mouse-backdrop-opacity"), setMouseBackdropOpacity, parseFloat);
			apply(getVal("zenith-mouse-hover-color"), setMouseHoverColor, (v) => v);
			apply(getVal("zenith-mouse-activation-threshold"), setMouseActivationThreshold, parseInt);
			apply(getVal("zenith-mouse-show-labels"), setMouseShowLabels, (v) => v !== "false");
			apply(getVal("zenith-mouse-always-show-labels"), setMouseAlwaysShowLabels, readBool);
			apply(getVal("zenith-mouse-show-workspace-pill"), setMouseShowWorkspacePill, (v) => v !== "false");
			apply(getVal("zenith-mouse-open-sound"), setMouseOpenSound, (v) => v);
			apply(getVal("zenith-mouse-hover-sound"), setMouseHoverSound, (v) => v);

			// Converter Settings
			apply(getVal("zenith-converter-enabled"), setConverterEnabled, (v) => v !== "false");
			apply(getVal("zenith-converter-trigger-key"), setConverterTriggerKey, (v) =>
				v === "alt" || v === "shift" || v === "right-drag" ? v : "ctrl"
			);
			apply(getVal("zenith-converter-browser-drag"), setConverterBrowserDrag, (v) => v !== "false");
			apply(getVal("zenith-converter-output-mode"), setConverterOutputMode, (v) =>
				v === "folder" ? "folder" : "next-to-source"
			);
			apply(getVal("zenith-converter-output-folder"), setConverterOutputFolder, (v) => v);
			apply(getVal("zenith-converter-explorer-menu"), setConverterExplorerMenu, readBool);

			const savedCity = getVal("zenith-weather-city");
			if (savedCity) setCityName(savedCity);

			apply(getVal("zenith-prayer-enabled"), setPrayerEnabled, readBool);
			apply(getVal("zenith-prayer-city"), setPrayerCity, (v) => v);
			apply(getVal("zenith-prayer-country"), setPrayerCountry, (v) => v);
			apply(getVal("zenith-prayer-location-mode"), setPrayerLocationMode, (v) => (v === "manual" ? "manual" : "auto"));
			apply(getVal("zenith-prayer-method"), setPrayerMethod, (v) => v);
			apply(getVal("zenith-prayer-time-offset"), setPrayerTimeOffset, (v) => v);
			apply(getVal("zenith-prayer-alert-type"), setPrayerAlertType, (v) => v);
			apply(getVal("zenith-prayer-pre-alert"), setPrayerPreAlert, readBool);
			apply(getVal("zenith-prayer-notch-popup"), setPrayerNotchPopup, readBool);
			apply(getVal("zenith-prayer-lat"), setPrayerLat, (v) => v);
			apply(getVal("zenith-prayer-lon"), setPrayerLon, (v) => v);
			apply(getVal("zenith-notifications-enabled"), setNotificationsEnabled, readBool);
			apply(getVal("zenith-notifications-silent"), setNotificationsSilent, readBool);
			apply(getVal("zenith-notifications-notch-enabled"), setNotificationsNotchEnabled, readBool);

			apply(getVal("zenith-theme-mode"), setThemeMode, (v) => v);
			apply(getVal("zenith-theme-color"), setThemeColor, (v) => v);
			apply(getVal("zenith-theme-opacity"), setThemeOpacity, parseFloat);
			apply(getVal("zenith-theme-saturation"), setThemeSaturation, parseFloat);
			apply(getVal("zenith-theme-brightness"), setThemeBrightness, parseFloat);

			apply(getVal("zenith-translator-enabled"), setTranslatorEnabled, (v) => v !== "false");
			apply(getVal("zenith-translator-engine"), setTranslatorEngine, (v) => (v === "local" ? "local" : "cloud"));
			apply(getVal("zenith-translator-provider"), setTranslatorProvider, (v) =>
				v === "groq" || v === "openai" || v === "custom" ? v : "gemini"
			);
			apply(getVal("zenith-translator-api-key"), setTranslatorApiKey, (v) => v);
			apply(getVal("zenith-translator-groq-api-key"), setTranslatorGroqApiKey, (v) => v);
			apply(getVal("zenith-translator-openai-api-key"), setTranslatorOpenaiApiKey, (v) => v);
			apply(getVal("zenith-translator-custom-api-url"), setTranslatorCustomApiUrl, (v) => v);
			apply(getVal("zenith-translator-custom-api-key"), setTranslatorCustomApiKey, (v) => v);
			apply(getVal("zenith-translator-custom-model"), setTranslatorCustomModel, (v) => v);
			apply(getVal("zenith-translator-custom-api-format"), setTranslatorCustomApiFormat, parseCustomApiFormat);
			apply(getVal("zenith-translator-target-language"), setTranslatorTargetLanguage, (v) => v);
			apply(getVal("zenith-translator-output-mode"), setTranslatorOutputMode, (v) =>
				v === "explain" || v === "summarize" ? v : "full"
			);
			apply(getVal("zenith-translator-display-target"), setTranslatorDisplayTarget, (v) =>
				v === "notch" ? "notch" : "floating"
			);
			apply(getVal("zenith-translator-select-all-fallback"), setTranslatorSelectAllFallback, (v) => v !== "false");
			apply(getVal("zenith-translator-auto-paste-ar-to-en"), setTranslatorAutoPasteArToEn, (v) => v !== "false");
			apply(getVal("zenith-translator-hotkey-ar-to-en"), setTranslatorHotkeyArToEn, (v) => v);
			apply(getVal("zenith-translator-hotkey-any-to-ar"), setTranslatorHotkeyAnyToAr, (v) => v);
			apply(getVal("zenith-translator-hotkey-screen"), setTranslatorHotkeyScreen, (v) => v);
			apply(getVal("zenith-translator-hotkey-fullpage"), setTranslatorHotkeyFullpage, (v) => v);
			apply(getVal("zenith-translator-hotkey-toggle"), setTranslatorHotkeyToggle, (v) => v);
			apply(getVal("zenith-translator-font-size"), setTranslatorFontSize, (v) => parseInt(v, 10) || 15);
			apply(getVal("zenith-translator-card-timeout-sec"), setTranslatorCardTimeoutSec, (v) => parseInt(v, 10) || 12);
			apply(getVal("zenith-translator-overlay-opacity"), setTranslatorOverlayOpacity, (v) => parseInt(v, 10) || 88);
			apply(getVal("zenith-translator-custom-prompt-inplace"), setTranslatorCustomPromptInplace, (v) => v);
			apply(getVal("zenith-translator-custom-prompt-quick"), setTranslatorCustomPromptQuick, (v) => v);

			apply(getVal("zenith-ai-chat-enabled"), setAiChatEnabled, (v) => v !== "false");
			apply(getVal("zenith-ai-chat-provider"), setAiChatProvider, (v) =>
				v === "gemini" || v === "groq" || v === "openai" || v === "custom" || v === "local"
					? v
					: "inherit"
			);
			apply(getVal("zenith-ai-chat-system-prompt"), setAiChatSystemPrompt, (v) => v);

			apply(getVal("zenith-tasks-enabled"), setTasksEnabled, (v) => v !== "false");
			apply(getVal("zenith-tasks-default-tab"), setTasksDefaultTab, (v) =>
				v === "notes" || v === "remember" ? v : "tasks"
			);
			apply(getVal("zenith-tasks-show-tasks"), setTasksShowTasksTab, (v) => v !== "false");
			apply(getVal("zenith-tasks-show-notes"), setTasksShowNotesTab, (v) => v !== "false");
			apply(getVal("zenith-tasks-show-quick-add"), setTasksShowQuickAdd, (v) => v !== "false");
			apply(getVal("zenith-tasks-show-completed"), setTasksShowCompleted, (v) => v !== "false");
			apply(getVal("zenith-tasks-show-task-notes"), setTasksShowTaskNotes, (v) => v !== "false");
			apply(getVal("zenith-tasks-show-source-badge"), setTasksShowSourceBadge, (v) => v !== "false");
			apply(getVal("zenith-tasks-density"), setTasksDensity, (v) =>
				v === "compact" ? "compact" : "comfortable"
			);
			apply(getVal("zenith-tasks-default-source"), setTasksDefaultSource, (v) =>
				v === "local" || v === "google" || v === "notion" ? v : "auto"
			);
			apply(getVal("zenith-tasks-auto-sync"), setTasksAutoSync, (v) => v !== "false");
			apply(getVal("zenith-tasks-sync-interval"), setTasksSyncIntervalSec, (v) => parseInt(v, 10) || 120);
			apply(getVal("zenith-tasks-notion-token"), setTasksNotionToken, (v) => v);
			apply(getVal("zenith-tasks-notion-tasks-db"), setTasksNotionTasksDb, (v) => v);
			apply(getVal("zenith-tasks-notion-notes-db"), setTasksNotionNotesDb, (v) => v);
			apply(getVal("zenith-tasks-google-client-id"), setTasksGoogleClientId, (v) => v);
			apply(getVal("zenith-tasks-google-client-secret"), setTasksGoogleClientSecret, (v) => v);
			apply(getVal("zenith-tasks-google-list-id"), setTasksGoogleListId, (v) => v || "@default");

			const widgetsVal = getVal("zenith-status-widgets");
			if (widgetsVal) {
				try {
					const parsed = JSON.parse(widgetsVal);
					if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
						setStatusWidgets(parsed);
					}
				} catch {}
			}
		} catch (e) {
			console.error("Failed to load settings:", e);
		}
	}, []);

	const saveSetting = (key: string, value: string | null): Promise<boolean> => {
		pendingLocalWrites.current[key] = { value, until: Date.now() + 900 };
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("zenith-settings-save-error", "true");
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				if (value === null) localStorage.removeItem(key);
				else localStorage.setItem(key, value);
				sessionStorage.removeItem("zenith-settings-save-error");
			} catch (error) {
				console.warn("Settings mirror update failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	const saveSettingDebounced = (key: string, value: string | null, delayMs = 90) => {
		pendingLocalWrites.current[key] = { value, until: Date.now() + 900 };
		try {
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, value);
		} catch {}
		const existing = debouncedSaveTimers.current[key];
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		debouncedSaveTimers.current[key] = window.setTimeout(() => {
			delete debouncedSaveTimers.current[key];
			void saveSetting(key, value);
		}, delayMs);
	};

	useEffect(() => {
		return () => {
			for (const timerId of Object.values(debouncedSaveTimers.current)) {
				window.clearTimeout(timerId);
			}
		};
	}, []);

	const saveLocation = (key: "zenith-weather-lat" | "zenith-weather-lon", value: string | null): Promise<boolean> => {
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("zenith-settings-save-error", "true");
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				localStorage.removeItem(key);
				sessionStorage.removeItem("zenith-settings-save-error");
			} catch (error) {
				console.warn("Settings mirror cleanup failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	const dismissSaveError = () => {
		sessionStorage.removeItem("zenith-settings-save-error");
		setSaveError(false);
	};

	// ── Initialize on mount ──
	useEffect(() => {
		loadAllSettings();

		invoke<DisplayInfo[]>("get_available_displays")
			.then((disps) => {
				setDisplays(disps);
				if (disps.length <= 1) {
					if (localStorage.getItem("zenith-notch-display") !== "primary") {
						setNotchDisplay("primary");
						saveSetting("zenith-notch-display", "primary");
					}
					if (localStorage.getItem("zenith-dock-display") !== "primary") {
						setDockDisplay("primary");
						saveSetting("zenith-dock-display", "primary");
					}
				}
			})
			.catch(() => {});

		isEnabled()
			.then(setAutostart)
			.catch(() => {});

		getVersion()
			.then((ver) => setAppVersion(ver || "3.1.2"))
			.catch(() => setAppVersion("3.1.2"));

		checkForUpdates(false);
	}, []);

	// ── Sync settings from other windows ──
	useSettingsSync({
		"zenith-dock-display": setDockDisplay,
		"zenith-notch-display": setNotchDisplay,
		"zenith-dock-mode": setDockMode,
		"zenith-dock-edge-delay": setDockEdgeDelay,
		"zenith-notch-mode": setNotchMode,
		"zenith-notch-edge-delay": setNotchEdgeDelay,
		"zenith-notch-work-delay": (v: unknown) => {
			if (typeof v === "string" && v.trim().toLowerCase() === "never") {
				setNotchWorkDelay("never");
				return;
			}
			const parsed = typeof v === "number" ? v : parseInt(String(v), 10);
			const clamped = Number.isFinite(parsed) ? Math.min(5000, Math.max(500, Math.round(parsed))) : 2000;
			setNotchWorkLastDelayMs(clamped);
			setNotchWorkDelay(String(clamped));
		},
		"zenith-notch-position": (v: unknown) =>
			setNotchPosition(v === "left" || v === "right" ? v : "center"),
		"zenith-dock-enabled": setDockEnabled,
		"zenith-dock-icon-only": setDockIconOnly,
		"zenith-dock-separator-enabled": setDockSeparatorEnabled,
		"zenith-start-icon": setStartIcon,
		"zenith-dock-preview-enabled": setDockPreviewEnabled,
		"zenith-dock-adaptive": setDockAdaptive,
		"zenith-dock-win-number-enabled": setDockWinNumberEnabled,
		"zenith-dock-extras-position": setDockExtrasPosition,
		"zenith-dock-extras-drives": setDockExtrasDrives,
		"zenith-dock-extras-recycle-bin": setDockExtrasRecycleBin,
		"zenith-dock-task-view": setDockTaskView,
		"zenith-dock-extras-hidden-drives": setDockExtrasHiddenDrives,
		"zenith-dock-extras-folders": setDockExtrasFolders,
		"zenith-dock-extras-custom-folders": setDockExtrasCustomFolders,
		"zenith-weather-enabled": setWeatherEnabled,
		"zenith-calendar-enabled": setCalendarEnabled,
		"zenith-prayer-enabled": setPrayerEnabled,
		"zenith-prayer-city": setPrayerCity,
		"zenith-prayer-country": setPrayerCountry,
		"zenith-prayer-location-mode": (v: unknown) => setPrayerLocationMode(v === "manual" ? "manual" : "auto"),
		"zenith-prayer-method": setPrayerMethod,
		"zenith-prayer-time-offset": setPrayerTimeOffset,
		"zenith-prayer-alert-type": setPrayerAlertType,
		"zenith-prayer-pre-alert": setPrayerPreAlert,
		"zenith-prayer-notch-popup": setPrayerNotchPopup,
		"zenith-prayer-lat": setPrayerLat,
		"zenith-prayer-lon": setPrayerLon,
		"zenith-notifications-enabled": setNotificationsEnabled,
		"zenith-notifications-silent": setNotificationsSilent,
		"zenith-notifications-notch-enabled": setNotificationsNotchEnabled,
		"zenith-timer-sound-enabled": setTimerSoundEnabled,
		"zenith-music-mode-enabled": setMusicModeEnabled,
		"zenith-notch-remember-panel": setNotchRememberPanel,
		"zenith-notch-default-panel": (v: unknown) =>
			setNotchDefaultPanel(
				v === "command-center" || v === "prayer" || v === "tasks" || v === "ai-chat"
					? (v as "command-center" | "prayer" | "tasks" | "ai-chat")
					: "calendar"
			),
		"zenith-music-compact-notch": setMusicCompactNotch,
		"zenith-media-ambience-enabled": setMediaAmbienceEnabled,
		"zenith-media-compact-glow-enabled": setMediaCompactGlowEnabled,
		"zenith-media-layout": setMediaLayout,
		"zenith-corners-enabled": setCornersEnabled,
		"zenith-notch-floating": setNotchFloating,
		"zenith-show-update-indicator": setShowUpdateIndicator,
		"zenith-time-format-24h": setTimeFormat24h,
		"zenith-low-battery-threshold": setLowBatteryThreshold,
		"zenith-scale": setScale,
		"zenith-temp-unit": (v) => setTempUnitFahrenheit(v === "fahrenheit"),
		"zenith-auto-update": setAutoUpdate,
		"zenith-volume-overlay-enabled": setVolumeOverlayEnabled,
		"zenith-volume-edge-enabled": setVolumeEdgeEnabled,
		"zenith-brightness-overlay-enabled": setBrightnessOverlayEnabled,
		"zenith-brightness-edge-enabled": setBrightnessEdgeEnabled,
		"zenith-theme-mode": setThemeMode,
		"zenith-theme-color": setThemeColor,
		"zenith-theme-opacity": setThemeOpacity,
		"zenith-theme-saturation": setThemeSaturation,
		"zenith-theme-brightness": setThemeBrightness,
		"zenith-weather-city": (v) => setCityName(v || ""),

		// Mouse & Radial Settings Sync
		"zenith-mouse-radial-enabled": setMouseRadialEnabled,
		"zenith-mouse-trigger-button": setMouseTriggerButton,
		"zenith-mouse-trigger-mode": (v: unknown) => setMouseTriggerMode(v === "click" ? "click" : "hold"),
		"zenith-mouse-placement": (v: unknown) => setMousePlacement(v === "center" ? "center" : "cursor"),
		"zenith-mouse-monitor": (v: unknown) => setMouseMonitor(v === "primary" ? "primary" : "cursor"),
		"zenith-mouse-selection-mode": (v: unknown) => setMouseSelectionMode(v === "cursor" ? "cursor" : "area"),
		"zenith-mouse-area-wedges": setMouseAreaWedges,
		"zenith-mouse-instant-activate": (v: unknown) => setMouseInstantActivate(v === "dwell" ? "dwell" : "off"),
		"zenith-mouse-instant-dwell-ms": setMouseInstantDwellMs,
		"zenith-mouse-instant-sensitivity": (v: unknown) => setMouseInstantSensitivity(v === "low" || v === "high" ? v : "medium"),
		"zenith-mouse-number-launch": setMouseNumberLaunch,
		"zenith-mouse-number-labels": setMouseNumberLabels,
		"zenith-mouse-workspace-peek": setMouseWorkspacePeek,
		"zenith-mouse-workspace-peek-style": (v: unknown) => setMouseWorkspacePeekStyle(v === "ring" ? "ring" : "fan"),
		"zenith-mouse-workspace-peek-delay-ms": setMouseWorkspacePeekDelayMs,
		"zenith-mouse-game-mode-enabled": setMouseGameModeEnabled,
		"zenith-mouse-game-mode-scope": (v: unknown) => setMouseGameModeScope(v === "list" ? "list" : "all"),
		"zenith-mouse-game-mode-blocked-apps": setMouseGameModeBlockedApps,
		"zenith-mouse-game-mode-auto-detect": setMouseGameModeAutoDetect,
		"zenith-mouse-sound-enabled": setMouseSoundEnabled,

		// Translator Settings Sync
		"zenith-translator-enabled": setTranslatorEnabled,
		"zenith-translator-engine": (v: unknown) => setTranslatorEngine(v === "local" ? "local" : "cloud"),
		"zenith-translator-provider": (v: unknown) =>
			setTranslatorProvider(v === "groq" || v === "openai" || v === "custom" ? v : "gemini"),
		"zenith-translator-api-key": setTranslatorApiKey,
		"zenith-translator-groq-api-key": setTranslatorGroqApiKey,
		"zenith-translator-openai-api-key": setTranslatorOpenaiApiKey,
		"zenith-translator-custom-api-url": setTranslatorCustomApiUrl,
		"zenith-translator-custom-api-key": setTranslatorCustomApiKey,
		"zenith-translator-custom-model": setTranslatorCustomModel,
		"zenith-translator-custom-api-format": (v: unknown) =>
			setTranslatorCustomApiFormat(parseCustomApiFormat(v)),
		"zenith-translator-target-language": setTranslatorTargetLanguage,
		"zenith-translator-output-mode": (v: unknown) =>
			setTranslatorOutputMode(v === "explain" || v === "summarize" ? v : "full"),
		"zenith-translator-display-target": (v: unknown) =>
			setTranslatorDisplayTarget(v === "notch" ? "notch" : "floating"),
		"zenith-translator-select-all-fallback": setTranslatorSelectAllFallback,
		"zenith-translator-auto-paste-ar-to-en": setTranslatorAutoPasteArToEn,
		"zenith-translator-hotkey-ar-to-en": setTranslatorHotkeyArToEn,
		"zenith-translator-hotkey-any-to-ar": setTranslatorHotkeyAnyToAr,
		"zenith-translator-hotkey-screen": setTranslatorHotkeyScreen,
		"zenith-translator-hotkey-fullpage": setTranslatorHotkeyFullpage,
		"zenith-translator-hotkey-toggle": setTranslatorHotkeyToggle,
		"zenith-translator-font-size": setTranslatorFontSize,
		"zenith-translator-card-timeout-sec": setTranslatorCardTimeoutSec,
		"zenith-translator-overlay-opacity": setTranslatorOverlayOpacity,
		"zenith-translator-custom-prompt-inplace": setTranslatorCustomPromptInplace,
		"zenith-translator-custom-prompt-quick": setTranslatorCustomPromptQuick,
		"zenith-ai-chat-enabled": (v: unknown) => setAiChatEnabled(v !== false && v !== "false"),
		"zenith-ai-chat-provider": (v: unknown) =>
			setAiChatProvider(
				v === "gemini" || v === "groq" || v === "openai" || v === "custom" || v === "local"
					? v
					: "inherit"
			),
		"zenith-ai-chat-system-prompt": (v: unknown) => setAiChatSystemPrompt(String(v ?? "")),
		"zenith-mouse-sound-volume": setMouseSoundVolume,
		"zenith-mouse-menu-radius": setMouseMenuRadius,
		"zenith-mouse-icon-size": setMouseIconSize,
		"zenith-mouse-app-spacing": setMouseAppSpacing,
		"zenith-mouse-backdrop-opacity": setMouseBackdropOpacity,
		"zenith-mouse-hover-color": setMouseHoverColor,
		"zenith-mouse-activation-threshold": setMouseActivationThreshold,
		"zenith-mouse-show-labels": setMouseShowLabels,
		"zenith-mouse-always-show-labels": setMouseAlwaysShowLabels,
		"zenith-mouse-show-workspace-pill": setMouseShowWorkspacePill,
		"zenith-mouse-open-sound": setMouseOpenSound,
		"zenith-mouse-hover-sound": setMouseHoverSound,

		// Tasks & Notes Sync
		"zenith-tasks-enabled": (v: unknown) => setTasksEnabled(v !== false && v !== "false"),
		"zenith-tasks-default-tab": (v: unknown) =>
			setTasksDefaultTab(v === "notes" || v === "remember" ? v : "tasks"),
		"zenith-tasks-show-tasks": (v: unknown) => setTasksShowTasksTab(v !== false && v !== "false"),
		"zenith-tasks-show-notes": (v: unknown) => setTasksShowNotesTab(v !== false && v !== "false"),
		"zenith-tasks-show-quick-add": (v: unknown) => setTasksShowQuickAdd(v !== false && v !== "false"),
		"zenith-tasks-show-completed": (v: unknown) => setTasksShowCompleted(v !== false && v !== "false"),
		"zenith-tasks-show-task-notes": (v: unknown) => setTasksShowTaskNotes(v !== false && v !== "false"),
		"zenith-tasks-show-source-badge": (v: unknown) => setTasksShowSourceBadge(v !== false && v !== "false"),
		"zenith-tasks-density": (v: unknown) => setTasksDensity(v === "compact" ? "compact" : "comfortable"),
		"zenith-tasks-default-source": (v: unknown) =>
			setTasksDefaultSource(v === "local" || v === "google" || v === "notion" ? v : "auto"),
		"zenith-tasks-auto-sync": (v: unknown) => setTasksAutoSync(v !== false && v !== "false"),
		"zenith-tasks-sync-interval": (v: unknown) => setTasksSyncIntervalSec(Number(v) || 120),
		"zenith-tasks-notion-token": (v: unknown) => setTasksNotionToken(String(v ?? "")),
		"zenith-tasks-notion-tasks-db": (v: unknown) => setTasksNotionTasksDb(String(v ?? "")),
		"zenith-tasks-notion-notes-db": (v: unknown) => setTasksNotionNotesDb(String(v ?? "")),
		"zenith-tasks-google-client-id": (v: unknown) => setTasksGoogleClientId(String(v ?? "")),
		"zenith-tasks-google-client-secret": (v: unknown) => setTasksGoogleClientSecret(String(v ?? "")),
		"zenith-tasks-google-list-id": (v: unknown) => setTasksGoogleListId(String(v || "@default")),

		// Converter Settings Sync
		"zenith-converter-enabled": (v: unknown) => setConverterEnabled(v !== false && v !== "false"),
		"zenith-converter-trigger-key": (v: unknown) =>
			setConverterTriggerKey(v === "alt" || v === "shift" || v === "right-drag" ? v : "ctrl"),
		"zenith-converter-browser-drag": (v: unknown) => setConverterBrowserDrag(v !== false && v !== "false"),
		"zenith-converter-output-mode": (v: unknown) =>
			setConverterOutputMode(v === "folder" ? "folder" : "next-to-source"),
		"zenith-converter-output-folder": (v: unknown) => setConverterOutputFolder(String(v ?? "")),
		"zenith-converter-explorer-menu": (v: unknown) =>
			setConverterExplorerMenu(v === true || v === "true")
	}, undefined, {
		shouldApply: (key, value, source) => {
			if (source !== "local-event") return true;
			const pending = pendingLocalWrites.current[key];
			if (!pending || Date.now() > pending.until) return true;
			return String(pending.value ?? "") === String(value ?? "");
		}
	});

	// ── Listen for system accent changes (adaptive theme) ──
	useEffect(() => {
		const unlisten = listen<string>("system-accent-changed", (event) => {
			const mode = localStorage.getItem("zenith-theme-mode") || "dark";
			if (mode === "adaptive") {
				try {
					const hsl = hexToHsl(event.payload);
					setThemeSaturation(hsl.s / 100);
					setThemeBrightness(hsl.l / 100);
				} catch (e) {
					console.error("Failed to parse system accent color change HSL:", e);
				}
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── City search debounce ──
	useEffect(() => {
		if (cityName.trim().length < 2) {
			setCitySearchResults([]);
			setShowCityDropdown(false);
			return;
		}

		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(
					`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`
				);
				const data = await res.json();
				if (data.results && data.results.length > 0) {
					setCitySearchResults(
						data.results.map((r: any) => ({
							name: r.name,
							country: r.country || "",
							latitude: r.latitude,
							longitude: r.longitude
						}))
					);
					setShowCityDropdown(true);
				} else {
					setCitySearchResults([]);
				}
			} catch {
				setCitySearchResults([]);
			}
		}, 300);

		return () => clearTimeout(timeout);
	}, [cityName]);

	// ── Update checker ──
	const checkForUpdates = async (manual = true) => {
		setUpdateStatus("checking");
		try {
			const result = await invoke<UpdateCheckResult>("check_for_updates", { force: manual });
			if (result.available) {
				setUpdateStatus("available");
				setUpdateVersion(result.version ?? "");
			} else {
				setUpdateStatus("uptodate");
			}
		} catch (e) {
			console.error("Updater error:", e);
			setUpdateStatus("error");
		}
	};

	const installUpdate = async () => {
		try {
			setUpdateStatus("downloading");
			await invoke("install_update");
			setUpdateStatus("idle");
		} catch (e) {
			console.error(e);
			setUpdateStatus("error");
		}
	};

	useEffect(() => {
		const unlisten = listen<{ status: string; progress?: number }>(
			"auto-update-status",
			(event) => {
				switch (event.payload.status) {
					case "downloading":
						setUpdateStatus("downloading");
						break;
					case "installing":
						setUpdateStatus("installing");
						break;
					case "done":
						setUpdateStatus((prev) =>
							prev === "downloading" || prev === "installing" ? "idle" : prev
						);
						break;
				}
			}
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── Autostart ──
	const toggleAutostart = async () => {
		try {
			const currentlyEnabled = await isEnabled();
			if (currentlyEnabled) {
				await disable();
				setAutostart(false);
			} else {
				await enable();
				setAutostart(true);
			}
		} catch (err) {}
	};

	// ── Simple boolean toggles ──
	const toggleWeather = () => {
		const next = !weatherEnabled;
		setWeatherEnabled(next);
		saveSetting("zenith-weather-enabled", String(next));
	};

	const toggleCalendar = () => {
		const next = !calendarEnabled;
		setCalendarEnabled(next);
		saveSetting("zenith-calendar-enabled", String(next));
	};

	const togglePrayer = () => {
		const next = !prayerEnabled;
		setPrayerEnabled(next);
		saveSetting("zenith-prayer-enabled", String(next));
	};

	const setPrayerCityValue = (val: string) => {
		setPrayerCity(val);
		saveSetting("zenith-prayer-city", val);
	};

	const setPrayerCountryValue = (val: string) => {
		setPrayerCountry(val);
		saveSetting("zenith-prayer-country", val);
	};

	const setPrayerLocationModeValue = (val: "auto" | "manual") => {
		setPrayerLocationMode(val);
		saveSetting("zenith-prayer-location-mode", val);
	};

	const setPrayerMethodValue = (val: string) => {
		setPrayerMethod(val);
		saveSetting("zenith-prayer-method", val);
	};

	const setPrayerTimeOffsetValue = (val: string) => {
		setPrayerTimeOffset(val);
		saveSetting("zenith-prayer-time-offset", val);
	};

	const setPrayerAlertTypeValue = (val: string) => {
		setPrayerAlertType(val);
		saveSetting("zenith-prayer-alert-type", val);
	};

	const togglePrayerPreAlert = () => {
		const next = !prayerPreAlert;
		setPrayerPreAlert(next);
		saveSetting("zenith-prayer-pre-alert", String(next));
	};

	const togglePrayerNotchPopup = () => {
		const next = !prayerNotchPopup;
		setPrayerNotchPopup(next);
		saveSetting("zenith-prayer-notch-popup", String(next));
	};

	const setPrayerCoordsValue = (lat: string, lon: string, city?: string, country?: string) => {
		setPrayerLat(lat);
		setPrayerLon(lon);
		saveSetting("zenith-prayer-lat", lat);
		saveSetting("zenith-prayer-lon", lon);
		if (city !== undefined && city.trim()) {
			setPrayerCity(city);
			saveSetting("zenith-prayer-city", city);
		}
		if (country !== undefined && country.trim()) {
			setPrayerCountry(country);
			saveSetting("zenith-prayer-country", country);
		}
	};

	const toggleNotifications = () => {
		const next = !notificationsEnabled;
		setNotificationsEnabled(next);
		saveSetting("zenith-notifications-enabled", String(next));
	};

	const toggleNotificationsSilent = () => {
		const next = !notificationsSilent;
		setNotificationsSilent(next);
		saveSetting("zenith-notifications-silent", String(next));
	};

	const toggleNotificationsNotch = () => {
		const next = !notificationsNotchEnabled;
		setNotificationsNotchEnabled(next);
		saveSetting("zenith-notifications-notch-enabled", String(next));
	};

	const toggleTimerSound = () => {
		const next = !timerSoundEnabled;
		setTimerSoundEnabled(next);
		saveSetting("zenith-timer-sound-enabled", String(next));
	};

	const toggleMusicMode = () => {
		const next = !musicModeEnabled;
		setMusicModeEnabled(next);
		saveSetting("zenith-music-mode-enabled", String(next));
	};

	const toggleNotchRememberPanel = () => {
		const next = !notchRememberPanel;
		setNotchRememberPanel(next);
		saveSetting("zenith-notch-remember-panel", String(next));
	};

	const changeNotchDefaultPanel = (panel: "calendar" | "command-center" | "prayer" | "tasks" | "ai-chat") => {
		setNotchDefaultPanel(panel);
		saveSetting("zenith-notch-default-panel", panel);
	};

	const toggleMusicCompactNotch = () => {
		const next = !musicCompactNotch;
		setMusicCompactNotch(next);
		saveSetting("zenith-music-compact-notch", String(next));
	};

	const toggleShelfPersist = () => {
		const next = !shelfPersist;
		setShelfPersist(next);
		saveSetting("zenith-shelf-persist", String(next));
	};

	const toggleMediaLayout = (layout: "classic" | "compact") => {
		setMediaLayout(layout);
		saveSetting("zenith-media-layout", layout);
	};

	const toggleVolumeOverlay = () => {
		const next = !volumeOverlayEnabled;
		setVolumeOverlayEnabled(next);
		saveSetting("zenith-volume-overlay-enabled", String(next));
	};

	const toggleVolumeEdge = () => {
		const next = !volumeEdgeEnabled;
		setVolumeEdgeEnabled(next);
		saveSetting("zenith-volume-edge-enabled", String(next));
	};

	const toggleBrightnessOverlay = () => {
		const next = !brightnessOverlayEnabled;
		setBrightnessOverlayEnabled(next);
		saveSetting("zenith-brightness-overlay-enabled", String(next));
	};

	const toggleBrightnessEdge = () => {
		const next = !brightnessEdgeEnabled;
		setBrightnessEdgeEnabled(next);
		saveSetting("zenith-brightness-edge-enabled", String(next));
	};

	const toggleAmbience = () => {
		const next = !mediaAmbienceEnabled;
		setMediaAmbienceEnabled(next);
		saveSetting("zenith-media-ambience-enabled", String(next));
	};

	const toggleCompactGlow = () => {
		const next = !mediaCompactGlowEnabled;
		setMediaCompactGlowEnabled(next);
		saveSetting("zenith-media-compact-glow-enabled", String(next));
	};

	// Mouse & Radial Menu Actions
	const toggleMouseRadial = () => {
		const next = !mouseRadialEnabled;
		setMouseRadialEnabled(next);
		saveSetting("zenith-mouse-radial-enabled", String(next));
	};

	const handleMouseTriggerButtonChange = (btn: string) => {
		setMouseTriggerButton(btn);
		saveSetting("zenith-mouse-trigger-button", btn);
	};

	const handleMouseTriggerModeChange = (mode: "hold" | "click") => {
		setMouseTriggerMode(mode);
		saveSetting("zenith-mouse-trigger-mode", mode);
	};

	const handleMousePlacementChange = (placement: "cursor" | "center") => {
		setMousePlacement(placement);
		saveSetting("zenith-mouse-placement", placement);
	};

	const handleMouseMonitorChange = (monitor: "cursor" | "primary") => {
		setMouseMonitor(monitor);
		saveSetting("zenith-mouse-monitor", monitor);
	};

	const handleMouseSelectionModeChange = (mode: "area" | "cursor") => {
		setMouseSelectionMode(mode);
		saveSetting("zenith-mouse-selection-mode", mode);
	};

	const toggleMouseAreaWedges = () => {
		const next = !mouseAreaWedges;
		setMouseAreaWedges(next);
		saveSetting("zenith-mouse-area-wedges", String(next));
	};

	const handleMouseInstantActivateChange = (val: "off" | "dwell") => {
		setMouseInstantActivate(val);
		saveSetting("zenith-mouse-instant-activate", val);
	};

	const handleMouseInstantDwellMsChange = (val: number) => {
		setMouseInstantDwellMs(val);
		saveSettingDebounced("zenith-mouse-instant-dwell-ms", String(val));
	};

	const handleMouseInstantSensitivityChange = (val: "low" | "medium" | "high") => {
		setMouseInstantSensitivity(val);
		saveSetting("zenith-mouse-instant-sensitivity", val);
	};

	const toggleMouseNumberLaunch = () => {
		const next = !mouseNumberLaunch;
		setMouseNumberLaunch(next);
		saveSetting("zenith-mouse-number-launch", String(next));
	};

	const toggleMouseNumberLabels = () => {
		const next = !mouseNumberLabels;
		setMouseNumberLabels(next);
		saveSetting("zenith-mouse-number-labels", String(next));
	};

	const toggleMouseWorkspacePeek = () => {
		const next = !mouseWorkspacePeek;
		setMouseWorkspacePeek(next);
		saveSetting("zenith-mouse-workspace-peek", String(next));
	};

	const handleMouseWorkspacePeekStyleChange = (style: "fan" | "ring") => {
		setMouseWorkspacePeekStyle(style);
		saveSetting("zenith-mouse-workspace-peek-style", style);
	};

	const handleMouseWorkspacePeekDelayMsChange = (val: number) => {
		setMouseWorkspacePeekDelayMs(val);
		saveSettingDebounced("zenith-mouse-workspace-peek-delay-ms", String(val));
	};

	const toggleMouseGameMode = () => {
		const next = !mouseGameModeEnabled;
		setMouseGameModeEnabled(next);
		saveSetting("zenith-mouse-game-mode-enabled", String(next));
	};

	const handleMouseGameModeScopeChange = (scope: "all" | "list") => {
		setMouseGameModeScope(scope);
		saveSetting("zenith-mouse-game-mode-scope", scope);
	};

	const handleMouseGameModeBlockedAppsChange = (apps: string) => {
		setMouseGameModeBlockedApps(apps);
		saveSetting("zenith-mouse-game-mode-blocked-apps", apps);
	};

	const toggleMouseGameModeAutoDetect = () => {
		const next = !mouseGameModeAutoDetect;
		setMouseGameModeAutoDetect(next);
		saveSetting("zenith-mouse-game-mode-auto-detect", String(next));
	};

	const toggleMouseSound = () => {
		const next = !mouseSoundEnabled;
		setMouseSoundEnabled(next);
		saveSetting("zenith-mouse-sound-enabled", String(next));
	};

	const handleMouseSoundVolumeChange = (val: number) => {
		setMouseSoundVolume(val);
		saveSettingDebounced("zenith-mouse-sound-volume", String(val));
	};

	const handleMouseMenuRadiusChange = (val: number) => {
		setMouseMenuRadius(val);
		saveSettingDebounced("zenith-mouse-menu-radius", String(val));
	};

	const handleMouseIconSizeChange = (val: number) => {
		setMouseIconSize(val);
		saveSettingDebounced("zenith-mouse-icon-size", String(val));
	};

	const handleMouseAppSpacingChange = (val: number) => {
		setMouseAppSpacing(val);
		saveSettingDebounced("zenith-mouse-app-spacing", String(val));
	};

	const handleMouseBackdropOpacityChange = (val: number) => {
		setMouseBackdropOpacity(val);
		saveSettingDebounced("zenith-mouse-backdrop-opacity", String(val));
	};

	const handleMouseHoverColorChange = (val: string) => {
		setMouseHoverColor(val);
		saveSettingDebounced("zenith-mouse-hover-color", val);
	};

	const handleMouseActivationThresholdChange = (val: number) => {
		setMouseActivationThreshold(val);
		saveSettingDebounced("zenith-mouse-activation-threshold", String(val));
	};

	const toggleMouseShowLabels = () => {
		const next = !mouseShowLabels;
		setMouseShowLabels(next);
		saveSetting("zenith-mouse-show-labels", String(next));
	};

	const toggleMouseAlwaysShowLabels = () => {
		const next = !mouseAlwaysShowLabels;
		setMouseAlwaysShowLabels(next);
		saveSetting("zenith-mouse-always-show-labels", String(next));
	};

	const toggleMouseShowWorkspacePill = () => {
		const next = !mouseShowWorkspacePill;
		setMouseShowWorkspacePill(next);
		saveSetting("zenith-mouse-show-workspace-pill", String(next));
	};

	const handleMouseOpenSoundChange = (val: string) => {
		setMouseOpenSound(val);
		saveSetting("zenith-mouse-open-sound", val);
	};

	const handleMouseHoverSoundChange = (val: string) => {
		setMouseHoverSound(val);
		saveSetting("zenith-mouse-hover-sound", val);
	};

	const toggleCorners = () => {
		const next = !cornersEnabled;
		setCornersEnabled(next);
		saveSetting("zenith-corners-enabled", String(next));
	};

	const toggleNotchFloating = () => {
		const next = !notchFloating;
		setNotchFloating(next);
		saveSetting("zenith-notch-floating", String(next));
	};

	const toggleUpdateIndicator = () => {
		const next = !showUpdateIndicator;
		setShowUpdateIndicator(next);
		saveSetting("zenith-show-update-indicator", String(next));
	};

	const toggleTimeFormat24h = () => {
		const next = !timeFormat24h;
		setTimeFormat24h(next);
		saveSetting("zenith-time-format-24h", String(next));
	};

	const toggleTempUnit = () => {
		const next = !tempUnitFahrenheit;
		setTempUnitFahrenheit(next);
		saveSetting("zenith-temp-unit", next ? "fahrenheit" : "celsius");
	};

	const toggleDock = () => {
		const next = !dockEnabled;
		setDockEnabled(next);
		saveSetting("zenith-dock-enabled", String(next));
		saveSetting("zenith-dock-enabled", String(next));
	};

	const toggleDockPreview = () => {
		const next = !dockPreviewEnabled;
		setDockPreviewEnabled(next);
		saveSetting("zenith-dock-preview-enabled", String(next));
	};

	const toggleDockIconOnly = () => {
		const next = !dockIconOnly;
		setDockIconOnly(next);
		saveSetting("zenith-dock-icon-only", String(next));
	};

	const toggleDockSeparator = () => {
		const next = !dockSeparatorEnabled;
		setDockSeparatorEnabled(next);
		saveSetting("zenith-dock-separator-enabled", String(next));
	};

	const handleStartIconChange = (icon: string) => {
		setStartIcon(icon);
		saveSetting("zenith-start-icon", icon);
	};

	const toggleDockAdaptive = () => {
		const next = !dockAdaptive;
		setDockAdaptive(next);
		saveSetting("zenith-dock-adaptive", String(next));
	};

	const toggleDockWinNumber = () => {
		const next = !dockWinNumberEnabled;
		setDockWinNumberEnabled(next);
		saveSetting("zenith-dock-win-number-enabled", String(next));
	};

	const handleDockExtrasPositionChange = (position: string) => {
		setDockExtrasPosition(position);
		saveSetting("zenith-dock-extras-position", position);
	};

	const toggleDockExtrasDrives = () => {
		const next = !dockExtrasDrives;
		setDockExtrasDrives(next);
		saveSetting("zenith-dock-extras-drives", String(next));
	};

	const toggleDockExtrasDrive = (letter: string) => {
		const next = toggleHiddenDrive(dockExtrasHiddenDrives, letter);
		setDockExtrasHiddenDrives(next);
		saveSetting("zenith-dock-extras-hidden-drives", next);
	};

	const toggleDockExtrasRecycleBin = () => {
		const next = !dockExtrasRecycleBin;
		setDockExtrasRecycleBin(next);
		saveSetting("zenith-dock-extras-recycle-bin", String(next));
	};

	const toggleDockTaskView = () => {
		const next = !dockTaskView;
		setDockTaskView(next);
		saveSetting("zenith-dock-task-view", String(next));
	};

	const toggleDockExtraFolder = (id: string) => {
		const next = toggleEnabledFolder(dockExtrasFolders, id);
		setDockExtrasFolders(next);
		saveSetting("zenith-dock-extras-folders", next);
	};

	const handleAddDockExtraFolder = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: "Add a folder to the dock",
				directory: true,
				multiple: false
			});
			if (typeof selected === "string") {
				const next = addCustomFolder(dockExtrasCustomFolders, selected);
				setDockExtrasCustomFolders(next);
				saveSetting("zenith-dock-extras-custom-folders", next);
			}
		} catch (e) {
			console.error("Folder picker failed:", e);
		}
	};

	const handleRemoveDockExtraFolder = (path: string) => {
		const next = removeCustomFolder(dockExtrasCustomFolders, path);
		setDockExtrasCustomFolders(next);
		saveSetting("zenith-dock-extras-custom-folders", next);
	};

	const toggleAutoUpdate = () => {
		const next = !autoUpdate;
		setAutoUpdate(next);
		saveSetting("zenith-auto-update", String(next));
	};

	// ── Value setters ──
	const setDockModeValue = (newMode: string) => {
		setDockMode(newMode);
		saveSetting("zenith-dock-mode", newMode);
	};

	const setNotchModeValue = (newMode: string) => {
		setNotchMode(newMode);
		saveSetting("zenith-notch-mode", newMode);
	};

	const setNotchDisplayValue = (val: string) => {
		const target = displays.length <= 1 ? "primary" : val;
		setNotchDisplay(target);
		saveSetting("zenith-notch-display", target);
	};

	const setDockDisplayValue = (val: string) => {
		const target = displays.length <= 1 ? "primary" : val;
		setDockDisplay(target);
		saveSetting("zenith-dock-display", target);
	};

	const toggleDockIsolation = () => {
		const next = !dockIsolation;
		setDockIsolation(next);
		saveSetting("zenith-dock-isolation", String(next));
	};

	const handleDockEdgeDelayChange = (val: number) => {
		setDockEdgeDelay(val);
		saveSetting("zenith-dock-edge-delay", val.toString());
	};

	const handleNotchEdgeDelayChange = (val: number) => {
		setNotchEdgeDelay(val);
		saveSetting("zenith-notch-edge-delay", val.toString());
	};

	const toggleNotchWorkNever = () => {
		if (notchWorkDelay === "never") {
			const next = String(notchWorkLastDelayMs);
			setNotchWorkDelay(next);
			saveSetting("zenith-notch-work-delay", next);
		} else {
			setNotchWorkDelay("never");
			saveSetting("zenith-notch-work-delay", "never");
		}
	};

	const handleNotchWorkDelayChange = (ms: number) => {
		const clamped = Math.min(5000, Math.max(500, Math.round(ms)));
		setNotchWorkLastDelayMs(clamped);
		const next = String(clamped);
		setNotchWorkDelay(next);
		saveSettingDebounced("zenith-notch-work-delay", next);
	};

	const setNotchPositionValue = (pos: "left" | "center" | "right") => {
		setNotchPosition(pos);
		saveSetting("zenith-notch-position", pos);
	};

	const handleThresholdChange = (val: number) => {
		setLowBatteryThreshold(val);
		saveSetting("zenith-low-battery-threshold", val.toString());
	};

	const handleScaleChange = (val: number) => {
		setScale(val);
		saveSetting("zenith-scale", val.toString());
	};

	const handleWidgetsChange = (config: WidgetConfig) => {
		setStatusWidgets(config);
		saveSetting("zenith-status-widgets", JSON.stringify(config));
	};

	// ── Translator handlers ──
	const toggleTranslatorEnabled = () => {
		const next = !translatorEnabled;
		setTranslatorEnabled(next);
		saveSetting("zenith-translator-enabled", String(next));
	};
	const handleTranslatorEngineChange = (v: "cloud" | "local") => {
		setTranslatorEngine(v);
		saveSetting("zenith-translator-engine", v);
	};
	const handleTranslatorProviderChange = (v: "gemini" | "groq" | "openai" | "custom") => {
		setTranslatorProvider(v);
		saveSetting("zenith-translator-provider", v);
	};
	const handleTranslatorApiKeyChange = (v: string) => {
		setTranslatorApiKey(v);
		saveSetting("zenith-translator-api-key", v);
	};
	const handleTranslatorGroqApiKeyChange = (v: string) => {
		setTranslatorGroqApiKey(v);
		saveSetting("zenith-translator-groq-api-key", v);
	};
	const handleTranslatorOpenaiApiKeyChange = (v: string) => {
		setTranslatorOpenaiApiKey(v);
		saveSetting("zenith-translator-openai-api-key", v);
	};
	const handleTranslatorCustomApiUrlChange = (v: string) => {
		setTranslatorCustomApiUrl(v);
		saveSetting("zenith-translator-custom-api-url", v);
	};
	const handleTranslatorCustomApiKeyChange = (v: string) => {
		setTranslatorCustomApiKey(v);
		saveSetting("zenith-translator-custom-api-key", v);
	};
	const handleTranslatorCustomModelChange = (v: string) => {
		setTranslatorCustomModel(v);
		saveSetting("zenith-translator-custom-model", v);
	};
	const handleTranslatorCustomApiFormatChange = (v: CustomApiFormat) => {
		setTranslatorCustomApiFormat(v);
		saveSetting("zenith-translator-custom-api-format", v);
	};
	const handleTranslatorTargetLanguageChange = (v: string) => {
		setTranslatorTargetLanguage(v);
		saveSetting("zenith-translator-target-language", v);
	};
	const handleTranslatorOutputModeChange = (v: "full" | "explain" | "summarize") => {
		setTranslatorOutputMode(v);
		saveSetting("zenith-translator-output-mode", v);
	};
	const handleTranslatorDisplayTargetChange = (v: "floating" | "notch") => {
		setTranslatorDisplayTarget(v);
		saveSetting("zenith-translator-display-target", v);
	};
	const toggleTranslatorSelectAllFallback = () => {
		const next = !translatorSelectAllFallback;
		setTranslatorSelectAllFallback(next);
		saveSetting("zenith-translator-select-all-fallback", String(next));
	};
	const toggleTranslatorAutoPasteArToEn = () => {
		const next = !translatorAutoPasteArToEn;
		setTranslatorAutoPasteArToEn(next);
		saveSetting("zenith-translator-auto-paste-ar-to-en", String(next));
	};
	const handleTranslatorHotkeyChange = (key: string, val: string) => {
		if (key === "zenith-translator-hotkey-ar-to-en") setTranslatorHotkeyArToEn(val);
		else if (key === "zenith-translator-hotkey-any-to-ar") setTranslatorHotkeyAnyToAr(val);
		else if (key === "zenith-translator-hotkey-screen") setTranslatorHotkeyScreen(val);
		else if (key === "zenith-translator-hotkey-fullpage") setTranslatorHotkeyFullpage(val);
		else if (key === "zenith-translator-hotkey-toggle") setTranslatorHotkeyToggle(val);
		saveSetting(key, val);
	};
	const handleTranslatorFontSizeChange = (v: number) => {
		setTranslatorFontSize(v);
		saveSetting("zenith-translator-font-size", String(v));
	};
	const handleTranslatorCardTimeoutSecChange = (v: number) => {
		setTranslatorCardTimeoutSec(v);
		saveSetting("zenith-translator-card-timeout-sec", String(v));
	};
	const handleTranslatorOverlayOpacityChange = (v: number) => {
		setTranslatorOverlayOpacity(v);
		saveSetting("zenith-translator-overlay-opacity", String(v));
	};
	const handleTranslatorCustomPromptInplaceChange = (v: string) => {
		setTranslatorCustomPromptInplace(v);
		saveSetting("zenith-translator-custom-prompt-inplace", v);
	};
	const handleTranslatorCustomPromptQuickChange = (v: string) => {
		setTranslatorCustomPromptQuick(v);
		saveSetting("zenith-translator-custom-prompt-quick", v);
	};

	// ── AI Chat handlers ──
	const toggleAiChatEnabled = () => {
		const next = !aiChatEnabled;
		setAiChatEnabled(next);
		saveSetting("zenith-ai-chat-enabled", String(next));
	};
	const handleAiChatProviderChange = (v: "inherit" | "gemini" | "groq" | "openai" | "custom" | "local") => {
		setAiChatProvider(v);
		saveSetting("zenith-ai-chat-provider", v);
	};
	const handleAiChatSystemPromptChange = (v: string) => {
		setAiChatSystemPrompt(v);
		saveSetting("zenith-ai-chat-system-prompt", v);
	};

	// ── Tasks & Notes handlers ──
	const toggleTasksEnabled = () => {
		const next = !tasksEnabled;
		setTasksEnabled(next);
		saveSetting("zenith-tasks-enabled", String(next));
	};
	const handleTasksDefaultTabChange = (v: "tasks" | "notes" | "remember") => {
		setTasksDefaultTab(v);
		saveSetting("zenith-tasks-default-tab", v);
	};
	const toggleTasksShowTasksTab = () => {
		const next = !tasksShowTasksTab;
		setTasksShowTasksTab(next);
		saveSetting("zenith-tasks-show-tasks", String(next));
	};
	const toggleTasksShowNotesTab = () => {
		const next = !tasksShowNotesTab;
		setTasksShowNotesTab(next);
		saveSetting("zenith-tasks-show-notes", String(next));
	};
	const toggleTasksShowQuickAdd = () => {
		const next = !tasksShowQuickAdd;
		setTasksShowQuickAdd(next);
		saveSetting("zenith-tasks-show-quick-add", String(next));
	};
	const toggleTasksShowCompleted = () => {
		const next = !tasksShowCompleted;
		setTasksShowCompleted(next);
		saveSetting("zenith-tasks-show-completed", String(next));
	};
	const toggleTasksShowTaskNotes = () => {
		const next = !tasksShowTaskNotes;
		setTasksShowTaskNotes(next);
		saveSetting("zenith-tasks-show-task-notes", String(next));
	};
	const toggleTasksShowSourceBadge = () => {
		const next = !tasksShowSourceBadge;
		setTasksShowSourceBadge(next);
		saveSetting("zenith-tasks-show-source-badge", String(next));
	};
	const handleTasksDensityChange = (v: "comfortable" | "compact") => {
		setTasksDensity(v);
		saveSetting("zenith-tasks-density", v);
	};
	const handleTasksDefaultSourceChange = (v: "auto" | "local" | "google" | "notion") => {
		setTasksDefaultSource(v);
		saveSetting("zenith-tasks-default-source", v);
	};
	const toggleTasksAutoSync = () => {
		const next = !tasksAutoSync;
		setTasksAutoSync(next);
		saveSetting("zenith-tasks-auto-sync", String(next));
	};
	const handleTasksSyncIntervalSecChange = (v: number) => {
		setTasksSyncIntervalSec(v);
		saveSetting("zenith-tasks-sync-interval", String(v));
	};
	const handleTasksNotionTokenChange = (v: string) => {
		setTasksNotionToken(v);
		saveSetting("zenith-tasks-notion-token", v);
	};
	const handleTasksNotionTasksDbChange = (v: string) => {
		setTasksNotionTasksDb(v);
		saveSetting("zenith-tasks-notion-tasks-db", v);
	};
	const handleTasksNotionNotesDbChange = (v: string) => {
		setTasksNotionNotesDb(v);
		saveSetting("zenith-tasks-notion-notes-db", v);
	};
	const handleTasksGoogleClientIdChange = (v: string) => {
		setTasksGoogleClientId(v);
		saveSetting("zenith-tasks-google-client-id", v);
	};
	const handleTasksGoogleClientSecretChange = (v: string) => {
		setTasksGoogleClientSecret(v);
		saveSetting("zenith-tasks-google-client-secret", v);
	};
	const handleTasksGoogleListIdChange = (v: string) => {
		setTasksGoogleListId(v);
		saveSetting("zenith-tasks-google-list-id", v);
	};

	// ── Converter handlers ──
	const toggleConverterEnabled = () => {
		const next = !converterEnabled;
		setConverterEnabled(next);
		saveSetting("zenith-converter-enabled", String(next));
	};
	const handleConverterTriggerKeyChange = (v: "ctrl" | "alt" | "shift" | "right-drag") => {
		setConverterTriggerKey(v);
		saveSetting("zenith-converter-trigger-key", v);
	};
	const toggleConverterBrowserDrag = () => {
		const next = !converterBrowserDrag;
		setConverterBrowserDrag(next);
		saveSetting("zenith-converter-browser-drag", String(next));
	};
	const handleConverterOutputModeChange = (v: "next-to-source" | "folder") => {
		setConverterOutputMode(v);
		saveSetting("zenith-converter-output-mode", v);
	};
	const handleConverterOutputFolderChange = (v: string) => {
		setConverterOutputFolder(v);
		saveSettingDebounced("zenith-converter-output-folder", v);
	};

	// ── Theme handlers ──
	const handleThemeModeChange = async (mode: string) => {
		setThemeMode(mode);
		saveSetting("zenith-theme-mode", mode);

		if (mode === "adaptive") {
			try {
				const accentHex = await invoke<string>("get_system_accent_color");
				const hsl = hexToHsl(accentHex);
				setThemeSaturation(hsl.s / 100);
				saveSetting("zenith-theme-saturation", String(hsl.s / 100));
				setThemeBrightness(hsl.l / 100);
				saveSetting("zenith-theme-brightness", String(hsl.l / 100));
			} catch (e) {
				console.error("Failed to parse adaptive accent HSL:", e);
			}
		}
	};

	const handleThemeColorChange = (color: string) => {
		setThemeColor(color);
		saveSetting("zenith-theme-color", color);

		try {
			const hsl = hexToHsl(color);
			setThemeSaturation(hsl.s / 100);
			saveSetting("zenith-theme-saturation", String(hsl.s / 100));
			setThemeBrightness(hsl.l / 100);
			saveSetting("zenith-theme-brightness", String(hsl.l / 100));
		} catch (e) {
			console.error("Failed to parse custom color HSL:", e);
		}
	};

	const handleOpacityChange = (value: number) => {
		setThemeOpacity(value);
		saveSetting("zenith-theme-opacity", String(value));
	};

	const handleSaturationChange = (value: number) => {
		setThemeSaturation(value);
		saveSetting("zenith-theme-saturation", String(value));
	};

	const handleBrightnessChange = (value: number) => {
		setThemeBrightness(value);
		saveSetting("zenith-theme-brightness", String(value));
	};

	// ── City search ──
	const selectCity = async (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => {
		setCityName(city.name);
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("zenith-weather-lat", city.latitude.toString())) &&
			(await saveLocation("zenith-weather-lon", city.longitude.toString())) &&
			(await saveSetting("zenith-weather-city", city.name));
		if (saved) emit("weather-refresh", { lat: city.latitude, lon: city.longitude });
	};

	const handleCityClear = async () => {
		setCityName("");
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("zenith-weather-lat", null)) &&
			(await saveLocation("zenith-weather-lon", null)) &&
			(await saveSetting("zenith-weather-city", null));
		if (saved) emit("weather-refresh", true);
	};

	// ── Reset to defaults ──
	const resetToDefaults = async () => {
		try {
			const t = getTranslations(getStoredLanguage()).general;
			const { ask } = await import("@tauri-apps/plugin-dialog");
			const confirmed = await ask(t.resetConfirmMessage, {
				title: t.resetConfirmTitle,
				kind: "warning",
				okLabel: t.resetConfirmOk,
				cancelLabel: t.resetConfirmCancel
			});
			if (!confirmed) return;

			await invoke("reset_settings");

			const keep = new Set(["zenith-first-run", "zenith-app-version"]);
			for (const key of Object.keys(localStorage)) {
				if ((key.startsWith("zenith-") || key.startsWith("zenith-")) && !keep.has(key)) {
					localStorage.removeItem(key);
				}
			}

			await invoke("restart_zenith").catch(console.error);
		} catch (e) {
			console.error("Reset failed:", e);
		}
	};

	// ── Export / Import ──
	const handleExportSettings = async () => {
		setExportStatus("exporting");
		try {
			const filePath = await invoke<string | null>("export_settings_to_file");
			if (filePath) {
				setExportStatus("success");
				setTimeout(() => setExportStatus("idle"), 2000);
			} else {
				setExportStatus("idle");
			}
		} catch (e) {
			console.error("Export failed:", e);
			setExportStatus("error");
			setTimeout(() => setExportStatus("idle"), 3000);
		}
	};

	const handleImportSettings = async () => {
		setImportStatus("importing");
		try {
			const filePath = await invoke<string | null>("import_settings_from_file");
			if (filePath) {
				await loadAllSettings();
				setImportStatus("success");
				setTimeout(() => setImportStatus("idle"), 2000);
			} else {
				setImportStatus("idle");
			}
		} catch (e) {
			console.error("Import failed:", e);
			setImportStatus("error");
			setTimeout(() => setImportStatus("idle"), 3000);
		}
	};

	return {
		saveError,
		dismissSaveError,
		// System
		autostart,
		toggleAutostart,
		autoUpdate,
		toggleAutoUpdate,
		lowBatteryThreshold,
		handleThresholdChange,
		timeFormat24h,
		toggleTimeFormat24h,
		showUpdateIndicator,
		toggleUpdateIndicator,
		scale,
		handleScaleChange,
		cornersEnabled,
		toggleCorners,
		notchFloating,
		toggleNotchFloating,

		// Theme
		themeMode,
		handleThemeModeChange,
		themeColor,
		handleThemeColorChange,
		themeOpacity,
		handleOpacityChange,
		themeSaturation,
		handleSaturationChange,
		themeBrightness,
		handleBrightnessChange,

		// Notch
		notchMode,
		setNotchModeValue,
		notchEdgeDelay,
		handleNotchEdgeDelayChange,
		notchWorkDelay,
		toggleNotchWorkNever,
		handleNotchWorkDelayChange,
		notchPosition,
		setNotchPositionValue,
		notchDisplay,
		setNotchDisplayValue,
		displays,
		calendarEnabled,
		toggleCalendar,
		prayerEnabled,
		togglePrayer,
		prayerCity,
		setPrayerCityValue,
		prayerCountry,
		setPrayerCountryValue,
		prayerLocationMode,
		setPrayerLocationModeValue,
		prayerMethod,
		setPrayerMethodValue,
		prayerTimeOffset,
		setPrayerTimeOffsetValue,
		prayerAlertType,
		setPrayerAlertTypeValue,
		prayerPreAlert,
		togglePrayerPreAlert,
		prayerNotchPopup,
		togglePrayerNotchPopup,
		prayerLat,
		prayerLon,
		setPrayerCoordsValue,
		timerSoundEnabled,
		toggleTimerSound,
		musicModeEnabled,
		toggleMusicMode,
		notchRememberPanel,
		toggleNotchRememberPanel,
		notchDefaultPanel,
		changeNotchDefaultPanel,
		musicCompactNotch,
		toggleMusicCompactNotch,
		shelfPersist,
		toggleShelfPersist,
		mediaLayout,
		toggleMediaLayout,
		mediaAmbienceEnabled,
		toggleAmbience,
		mediaCompactGlowEnabled,
		toggleCompactGlow,

		// Weather
		weatherEnabled,
		toggleWeather,
		tempUnitFahrenheit,
		toggleTempUnit,
		cityName,
		setCityName,
		citySearchResults,
		showCityDropdown,
		setShowCityDropdown,
		selectCity,
		handleCityClear,

		// Widgets
		statusWidgets,
		handleWidgetsChange,

		// Dock
		dockEnabled,
		toggleDock,
		dockMode,
		setDockModeValue,
		dockEdgeDelay,
		handleDockEdgeDelayChange,
		dockDisplay,
		setDockDisplayValue,
		dockIsolation,
		toggleDockIsolation,
		dockPreviewEnabled,
		toggleDockPreview,
		dockIconOnly,
		toggleDockIconOnly,
		dockSeparatorEnabled,
		toggleDockSeparator,
		startIcon,
		handleStartIconChange,
		dockAdaptive,
		toggleDockAdaptive,
		dockWinNumberEnabled,
		toggleDockWinNumber,
		dockExtrasPosition,
		handleDockExtrasPositionChange,
		dockExtrasDrives,
		toggleDockExtrasDrives,
		dockExtrasHiddenDrives,
		toggleDockExtrasDrive,
		dockExtrasRecycleBin,
		toggleDockExtrasRecycleBin,
		dockTaskView,
		toggleDockTaskView,
		dockExtrasFolders,
		toggleDockExtraFolder,
		dockExtrasCustomFolders,
		handleAddDockExtraFolder,
		handleRemoveDockExtraFolder,

		// Overlays
		volumeOverlayEnabled,
		toggleVolumeOverlay,
		volumeEdgeEnabled,
		toggleVolumeEdge,
		brightnessOverlayEnabled,
		toggleBrightnessOverlay,
		brightnessEdgeEnabled,
		toggleBrightnessEdge,

		// Mouse & Radial Menu
		mouseRadialEnabled,
		toggleMouseRadial,
		mouseTriggerButton,
		handleMouseTriggerButtonChange,
		mouseTriggerMode,
		handleMouseTriggerModeChange,
		mousePlacement,
		handleMousePlacementChange,
		mouseMonitor,
		handleMouseMonitorChange,
		mouseSelectionMode,
		handleMouseSelectionModeChange,
		mouseAreaWedges,
		toggleMouseAreaWedges,
		mouseInstantActivate,
		handleMouseInstantActivateChange,
		mouseInstantDwellMs,
		handleMouseInstantDwellMsChange,
		mouseInstantSensitivity,
		handleMouseInstantSensitivityChange,
		mouseNumberLaunch,
		toggleMouseNumberLaunch,
		mouseNumberLabels,
		toggleMouseNumberLabels,
		mouseWorkspacePeek,
		toggleMouseWorkspacePeek,
		mouseWorkspacePeekStyle,
		handleMouseWorkspacePeekStyleChange,
		mouseWorkspacePeekDelayMs,
		handleMouseWorkspacePeekDelayMsChange,
		mouseGameModeEnabled,
		toggleMouseGameMode,
		mouseGameModeScope,
		handleMouseGameModeScopeChange,
		mouseGameModeBlockedApps,
		handleMouseGameModeBlockedAppsChange,
		mouseGameModeAutoDetect,
		toggleMouseGameModeAutoDetect,
		mouseSoundEnabled,
		toggleMouseSound,
		mouseSoundVolume,
		handleMouseSoundVolumeChange,
		mouseMenuRadius,
		handleMouseMenuRadiusChange,
		mouseIconSize,
		handleMouseIconSizeChange,
		mouseAppSpacing,
		handleMouseAppSpacingChange,
		mouseBackdropOpacity,
		handleMouseBackdropOpacityChange,
		mouseHoverColor,
		handleMouseHoverColorChange,
		mouseActivationThreshold,
		handleMouseActivationThresholdChange,
		mouseShowLabels,
		toggleMouseShowLabels,
		mouseAlwaysShowLabels,
		toggleMouseAlwaysShowLabels,
		mouseShowWorkspacePill,
		toggleMouseShowWorkspacePill,
		mouseOpenSound,
		handleMouseOpenSoundChange,
		mouseHoverSound,
		handleMouseHoverSoundChange,

		// Converter
		converterEnabled,
		toggleConverterEnabled,
		converterTriggerKey,
		handleConverterTriggerKeyChange,
		converterBrowserDrag,
		toggleConverterBrowserDrag,
		converterOutputMode,
		handleConverterOutputModeChange,
		converterOutputFolder,
		handleConverterOutputFolderChange,
		converterExplorerMenu,

		// Notifications
		notificationsEnabled,
		toggleNotifications,
		notificationsSilent,
		toggleNotificationsSilent,
		notificationsNotchEnabled,
		toggleNotificationsNotch,

		// Translator
		translatorEnabled,
		toggleTranslatorEnabled,
		translatorEngine,
		handleTranslatorEngineChange,
		translatorProvider,
		handleTranslatorProviderChange,
		translatorApiKey,
		handleTranslatorApiKeyChange,
		translatorGroqApiKey,
		handleTranslatorGroqApiKeyChange,
		translatorOpenaiApiKey,
		handleTranslatorOpenaiApiKeyChange,
		translatorCustomApiUrl,
		handleTranslatorCustomApiUrlChange,
		translatorCustomApiKey,
		handleTranslatorCustomApiKeyChange,
		translatorCustomModel,
		handleTranslatorCustomModelChange,
		translatorCustomApiFormat,
		handleTranslatorCustomApiFormatChange,
		translatorTargetLanguage,
		handleTranslatorTargetLanguageChange,
		translatorOutputMode,
		handleTranslatorOutputModeChange,
		translatorDisplayTarget,
		handleTranslatorDisplayTargetChange,
		translatorSelectAllFallback,
		toggleTranslatorSelectAllFallback,
		translatorAutoPasteArToEn,
		toggleTranslatorAutoPasteArToEn,
		translatorHotkeyArToEn,
		translatorHotkeyAnyToAr,
		translatorHotkeyScreen,
		translatorHotkeyFullpage,
		translatorHotkeyToggle,
		handleTranslatorHotkeyChange,
		translatorFontSize,
		handleTranslatorFontSizeChange,
		translatorCardTimeoutSec,
		handleTranslatorCardTimeoutSecChange,
		translatorOverlayOpacity,
		handleTranslatorOverlayOpacityChange,
		translatorCustomPromptInplace,
		handleTranslatorCustomPromptInplaceChange,
		translatorCustomPromptQuick,
		handleTranslatorCustomPromptQuickChange,

		// AI Chat
		aiChatEnabled,
		toggleAiChatEnabled,
		aiChatProvider,
		handleAiChatProviderChange,
		aiChatSystemPrompt,
		handleAiChatSystemPromptChange,

		// Tasks & Notes
		tasksEnabled,
		toggleTasksEnabled,
		tasksDefaultTab,
		handleTasksDefaultTabChange,
		tasksShowTasksTab,
		toggleTasksShowTasksTab,
		tasksShowNotesTab,
		toggleTasksShowNotesTab,
		tasksShowQuickAdd,
		toggleTasksShowQuickAdd,
		tasksShowCompleted,
		toggleTasksShowCompleted,
		tasksShowTaskNotes,
		toggleTasksShowTaskNotes,
		tasksShowSourceBadge,
		toggleTasksShowSourceBadge,
		tasksDensity,
		handleTasksDensityChange,
		tasksDefaultSource,
		handleTasksDefaultSourceChange,
		tasksAutoSync,
		toggleTasksAutoSync,
		tasksSyncIntervalSec,
		handleTasksSyncIntervalSecChange,
		tasksNotionToken,
		handleTasksNotionTokenChange,
		tasksNotionTasksDb,
		handleTasksNotionTasksDbChange,
		tasksNotionNotesDb,
		handleTasksNotionNotesDbChange,
		tasksGoogleClientId,
		handleTasksGoogleClientIdChange,
		tasksGoogleClientSecret,
		handleTasksGoogleClientSecretChange,
		tasksGoogleListId,
		handleTasksGoogleListIdChange,

		// Updates
		updateStatus,
		updateVersion,
		appVersion,
		checkForUpdates,
		installUpdate,

		// Import / Export
		exportStatus,
		importStatus,
		handleExportSettings,
		handleImportSettings,

		// Utilities
		restartZenith: () => invoke("restart_zenith"),
		resetToDefaults,
		quitZenith: () => invoke("quit_zenith"),
	};
}
