import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { X, Minus, Maximize2, Minimize2, Settings, Palette, PanelTop, Monitor, Layers, MousePointer, Languages, Info, Megaphone, CheckSquare } from "lucide-react";
import { ZenithAiIcon } from "./icons/ZenithAiIcon";
import {
	useSettings,
	GeneralTab,
	AppearanceTab,
	NotchTab,
	TasksTab,
	AiTab,
	DockTab,
	OverlaysTab,
	MouseTab,
	TranslatorTab,
	AboutTab
} from "./settings/index";
import type { SettingsTab } from "./settings/index";
import { useAnnouncement } from "./hooks/useAnnouncement";
import { LanguageProvider, useI18n } from "./i18n";
import { initTheme } from "./theme";
import "./Settings.css";

const appWindow = getCurrentWebviewWindow();

const TABS: {
	id: SettingsTab;
	labelKey: "general" | "appearance" | "notch" | "tasks" | "ai" | "dock" | "overlays" | "mouse" | "translator" | "about";
	icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
	{ id: "general", labelKey: "general", icon: Settings },
	{ id: "appearance", labelKey: "appearance", icon: Palette },
	{ id: "notch", labelKey: "notch", icon: PanelTop },
	{ id: "tasks", labelKey: "tasks", icon: CheckSquare },
	{ id: "ai", labelKey: "ai", icon: ZenithAiIcon },
	{ id: "dock", labelKey: "dock", icon: Monitor },
	{ id: "overlays", labelKey: "overlays", icon: Layers },
	{ id: "mouse", labelKey: "mouse", icon: MousePointer },
	{ id: "translator", labelKey: "translator", icon: Languages },
	{ id: "about", labelKey: "about", icon: Info }
];

function SettingsApp() {
	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const [isMaximized, setIsMaximized] = useState(false);
	const settings = useSettings();
	const { announcement, dismissed, dismiss } = useAnnouncement();
	const { dir, t } = useI18n();

	useEffect(() => {
		document.documentElement.dir = dir;
		document.title = t.settingsWindow.title;
	}, [dir, t.settingsWindow.title]);

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		listen<string>("open-settings-tab", (ev) => {
			if (ev.payload === "translator" || ev.payload === "tasks" || ev.payload === "ai") {
				setActiveTab(ev.payload);
			}
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});
		return () => {
			unlisten?.();
		};
	}, []);

	useEffect(() => {
		const preventContext = (e: MouseEvent) => e.preventDefault();
		document.addEventListener("contextmenu", preventContext as any);

		return () => {
			document.removeEventListener("contextmenu", preventContext as any);
		};
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		appWindow.isMaximized().then(setIsMaximized).catch(() => {});
		appWindow
			.onResized(() => {
				appWindow.isMaximized().then(setIsMaximized).catch(() => {});
			})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		return () => {
			unlisten?.();
		};
	}, []);

	useEffect(() => {
		if (!isMaximized) {
			invoke("resize_settings_window", {
				width: 740 * settings.scale,
				height: 620 * settings.scale
			}).catch(console.error);
		}
	}, [settings.scale, isMaximized]);

	const handleMinimize = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await appWindow.minimize();
		} catch {
			invoke("minimize_settings_window").catch(() => {});
		}
	};

	const handleToggleMaximize = async (e?: React.MouseEvent) => {
		e?.preventDefault();
		e?.stopPropagation();
		try {
			const next = await invoke<boolean>("toggle_maximize_settings_window");
			setIsMaximized(next);
		} catch {
			try {
				await appWindow.toggleMaximize();
				const max = await appWindow.isMaximized();
				setIsMaximized(max);
			} catch {}
		}
	};

	const handleClose = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await appWindow.hide();
		} catch {}
	};

	return (
		<div
			className={`settings-container ${isMaximized ? "maximized" : ""}`}
			dir={dir}
			style={{ zoom: settings.scale }}
		>
			<div className="title-bar" data-tauri-drag-region onDoubleClick={handleToggleMaximize}>
				<span className="title-text" data-tauri-drag-region>
					{t.settingsWindow.title}
				</span>
				<div className="window-controls">
					<button
						type="button"
						className="win-control-btn"
						onClick={handleMinimize}
						title={t.settingsWindow.minimize}
						aria-label={t.settingsWindow.minimize}
					>
						<Minus size={11} strokeWidth={2} />
					</button>
					<button
						type="button"
						className="win-control-btn"
						onClick={handleToggleMaximize}
						title={isMaximized ? t.settingsWindow.restore : t.settingsWindow.maximize}
						aria-label={isMaximized ? t.settingsWindow.restore : t.settingsWindow.maximize}
					>
						{isMaximized ? (
							<Minimize2 size={11} strokeWidth={2} />
						) : (
							<Maximize2 size={11} strokeWidth={2} />
						)}
					</button>
					<button
						type="button"
						className="win-control-btn close-btn"
						onClick={handleClose}
						title={t.settingsWindow.close}
						aria-label={t.settingsWindow.close}
					>
						<X size={12} strokeWidth={2} className="close-btn-icon" />
					</button>
				</div>
			</div>

			<div className="settings-body">
				<div className="settings-sidebar">
					{TABS.map(({ id, labelKey, icon: Icon }) => (
						<button
							key={id}
							className={`sidebar-tab ${activeTab === id ? "active" : ""}`}
							onClick={() => setActiveTab(id)}
						>
							<div className="sidebar-tab-icon">
								<Icon size={14} strokeWidth={1.5} />
							</div>
							<span>{t.settingsWindow.tabs[labelKey]}</span>
						</button>
					))}
				</div>

				<div className="settings-content">
					{settings.saveError && (
						<div className="settings-save-error" role="alert">
							<span>{t.settingsWindow.saveError}</span>
							<button onClick={settings.dismissSaveError} aria-label={t.settingsWindow.dismissSaveError}>
								<X size={14} strokeWidth={2} />
							</button>
						</div>
					)}
					{announcement && !dismissed && (
						<div className={`announcement-banner severity-${announcement.severity}`}>
							<Megaphone size={14} className="announcement-banner-icon" />
							<div className="announcement-banner-text">
								<span className="announcement-banner-title">{announcement.title}</span>
								{announcement.body && (
									<span className="announcement-banner-body">{announcement.body}</span>
								)}
							</div>
							{announcement.url && (
								<button
									className="announcement-banner-link"
									onClick={() => openUrl(announcement.url!)}
								>
									{t.common.learnMore}
								</button>
							)}
							<button className="announcement-banner-close" onClick={dismiss} title={t.common.dismiss}>
								<X size={12} strokeWidth={2.2} />
							</button>
						</div>
					)}
					{activeTab === "general" && (
						<GeneralTab
							autostart={settings.autostart}
							toggleAutostart={settings.toggleAutostart}
							timeFormat24h={settings.timeFormat24h}
							toggleTimeFormat24h={settings.toggleTimeFormat24h}
							showUpdateIndicator={settings.showUpdateIndicator}
							toggleUpdateIndicator={settings.toggleUpdateIndicator}
							lowBatteryThreshold={settings.lowBatteryThreshold}
							handleThresholdChange={settings.handleThresholdChange}
							openSettingsHotkey={settings.translatorHotkeyToggle}
							onOpenSettingsHotkeyChange={(combo) =>
								settings.handleTranslatorHotkeyChange("zenith-translator-hotkey-toggle", combo)
							}
							restartZenith={settings.restartZenith}
							resetToDefaults={settings.resetToDefaults}
							quitZenith={settings.quitZenith}
						/>
					)}
					{activeTab === "appearance" && (
						<AppearanceTab
							themeMode={settings.themeMode}
							handleThemeModeChange={settings.handleThemeModeChange}
							themeColor={settings.themeColor}
							handleThemeColorChange={settings.handleThemeColorChange}
							themeOpacity={settings.themeOpacity}
							handleOpacityChange={settings.handleOpacityChange}
							themeSaturation={settings.themeSaturation}
							handleSaturationChange={settings.handleSaturationChange}
							themeBrightness={settings.themeBrightness}
							handleBrightnessChange={settings.handleBrightnessChange}
							cornersEnabled={settings.cornersEnabled}
							toggleCorners={settings.toggleCorners}
							notchFloating={settings.notchFloating}
							toggleNotchFloating={settings.toggleNotchFloating}
							scale={settings.scale}
							handleScaleChange={settings.handleScaleChange}
						/>
					)}
					{activeTab === "notch" && (
						<NotchTab
							notchMode={settings.notchMode}
							setNotchModeValue={settings.setNotchModeValue}
							notchEdgeDelay={settings.notchEdgeDelay}
							handleNotchEdgeDelayChange={settings.handleNotchEdgeDelayChange}
							notchWorkDelay={settings.notchWorkDelay}
							toggleNotchWorkNever={settings.toggleNotchWorkNever}
							handleNotchWorkDelayChange={settings.handleNotchWorkDelayChange}
							notchPosition={settings.notchPosition}
							setNotchPositionValue={settings.setNotchPositionValue}
							notchDisplay={settings.notchDisplay}
							setNotchDisplayValue={settings.setNotchDisplayValue}
							displays={settings.displays}
							calendarEnabled={settings.calendarEnabled}
							toggleCalendar={settings.toggleCalendar}
							prayerEnabled={settings.prayerEnabled}
							togglePrayer={settings.togglePrayer}
							prayerLocationMode={settings.prayerLocationMode}
							setPrayerLocationModeValue={settings.setPrayerLocationModeValue}
							prayerCity={settings.prayerCity}
							setPrayerCityValue={settings.setPrayerCityValue}
							prayerCountry={settings.prayerCountry}
							setPrayerCountryValue={settings.setPrayerCountryValue}
							prayerMethod={settings.prayerMethod}
							setPrayerMethodValue={settings.setPrayerMethodValue}
							prayerTimeOffset={settings.prayerTimeOffset}
							setPrayerTimeOffsetValue={settings.setPrayerTimeOffsetValue}
							prayerAlertType={settings.prayerAlertType}
							setPrayerAlertTypeValue={settings.setPrayerAlertTypeValue}
							prayerPreAlert={settings.prayerPreAlert}
							togglePrayerPreAlert={settings.togglePrayerPreAlert}
							setPrayerCoordsValue={settings.setPrayerCoordsValue}
							notchRememberPanel={settings.notchRememberPanel}
							toggleNotchRememberPanel={settings.toggleNotchRememberPanel}
							notchDefaultPanel={settings.notchDefaultPanel}
							changeNotchDefaultPanel={settings.changeNotchDefaultPanel}
							tasksEnabled={settings.tasksEnabled}
							aiChatEnabled={settings.aiChatEnabled}
							timerSoundEnabled={settings.timerSoundEnabled}
							toggleTimerSound={settings.toggleTimerSound}
							musicModeEnabled={settings.musicModeEnabled}
							toggleMusicMode={settings.toggleMusicMode}
							musicCompactNotch={settings.musicCompactNotch}
							toggleMusicCompactNotch={settings.toggleMusicCompactNotch}
							shelfPersist={settings.shelfPersist}
							toggleShelfPersist={settings.toggleShelfPersist}
							mediaLayout={settings.mediaLayout}
							toggleMediaLayout={settings.toggleMediaLayout}
							mediaAmbienceEnabled={settings.mediaAmbienceEnabled}
							toggleAmbience={settings.toggleAmbience}
							mediaCompactGlowEnabled={settings.mediaCompactGlowEnabled}
							toggleCompactGlow={settings.toggleCompactGlow}
							weatherEnabled={settings.weatherEnabled}
							toggleWeather={settings.toggleWeather}
							tempUnitFahrenheit={settings.tempUnitFahrenheit}
							toggleTempUnit={settings.toggleTempUnit}
							cityName={settings.cityName}
							setCityName={settings.setCityName}
							citySearchResults={settings.citySearchResults}
							showCityDropdown={settings.showCityDropdown}
							setShowCityDropdown={settings.setShowCityDropdown}
							selectCity={settings.selectCity}
							handleCityClear={settings.handleCityClear}
							statusWidgets={settings.statusWidgets}
							handleWidgetsChange={settings.handleWidgetsChange}
							notificationsEnabled={settings.notificationsEnabled}
							toggleNotifications={settings.toggleNotifications}
							notificationsSilent={settings.notificationsSilent}
							toggleNotificationsSilent={settings.toggleNotificationsSilent}
							notificationsNotchEnabled={settings.notificationsNotchEnabled}
							toggleNotificationsNotch={settings.toggleNotificationsNotch}
						/>
					)}
					{activeTab === "tasks" && (
						<TasksTab
							tasksEnabled={settings.tasksEnabled}
							toggleTasksEnabled={settings.toggleTasksEnabled}
							tasksDefaultTab={settings.tasksDefaultTab}
							handleTasksDefaultTabChange={settings.handleTasksDefaultTabChange}
							tasksShowTasksTab={settings.tasksShowTasksTab}
							toggleTasksShowTasksTab={settings.toggleTasksShowTasksTab}
							tasksShowNotesTab={settings.tasksShowNotesTab}
							toggleTasksShowNotesTab={settings.toggleTasksShowNotesTab}
							tasksShowQuickAdd={settings.tasksShowQuickAdd}
							toggleTasksShowQuickAdd={settings.toggleTasksShowQuickAdd}
							tasksShowCompleted={settings.tasksShowCompleted}
							toggleTasksShowCompleted={settings.toggleTasksShowCompleted}
							tasksShowTaskNotes={settings.tasksShowTaskNotes}
							toggleTasksShowTaskNotes={settings.toggleTasksShowTaskNotes}
							tasksShowSourceBadge={settings.tasksShowSourceBadge}
							toggleTasksShowSourceBadge={settings.toggleTasksShowSourceBadge}
							tasksDensity={settings.tasksDensity}
							handleTasksDensityChange={settings.handleTasksDensityChange}
							tasksDefaultSource={settings.tasksDefaultSource}
							handleTasksDefaultSourceChange={settings.handleTasksDefaultSourceChange}
							tasksAutoSync={settings.tasksAutoSync}
							toggleTasksAutoSync={settings.toggleTasksAutoSync}
							tasksSyncIntervalSec={settings.tasksSyncIntervalSec}
							handleTasksSyncIntervalSecChange={settings.handleTasksSyncIntervalSecChange}
							tasksNotionToken={settings.tasksNotionToken}
							handleTasksNotionTokenChange={settings.handleTasksNotionTokenChange}
							tasksNotionTasksDb={settings.tasksNotionTasksDb}
							handleTasksNotionTasksDbChange={settings.handleTasksNotionTasksDbChange}
							tasksNotionNotesDb={settings.tasksNotionNotesDb}
							handleTasksNotionNotesDbChange={settings.handleTasksNotionNotesDbChange}
							tasksGoogleClientId={settings.tasksGoogleClientId}
							handleTasksGoogleClientIdChange={settings.handleTasksGoogleClientIdChange}
							tasksGoogleClientSecret={settings.tasksGoogleClientSecret}
							handleTasksGoogleClientSecretChange={settings.handleTasksGoogleClientSecretChange}
							tasksGoogleListId={settings.tasksGoogleListId}
							handleTasksGoogleListIdChange={settings.handleTasksGoogleListIdChange}
						/>
					)}
					{activeTab === "dock" && (
						<DockTab
							dockEnabled={settings.dockEnabled}
							toggleDock={settings.toggleDock}
							dockMode={settings.dockMode}
							setDockModeValue={settings.setDockModeValue}
							dockEdgeDelay={settings.dockEdgeDelay}
							handleDockEdgeDelayChange={settings.handleDockEdgeDelayChange}
							dockDisplay={settings.dockDisplay}
							setDockDisplayValue={settings.setDockDisplayValue}
							dockIsolation={settings.dockIsolation}
							toggleDockIsolation={settings.toggleDockIsolation}
							displays={settings.displays}
							dockPreviewEnabled={settings.dockPreviewEnabled}
							toggleDockPreview={settings.toggleDockPreview}
							dockIconOnly={settings.dockIconOnly}
							toggleDockIconOnly={settings.toggleDockIconOnly}
							dockSeparatorEnabled={settings.dockSeparatorEnabled}
							toggleDockSeparator={settings.toggleDockSeparator}
							dockAdaptive={settings.dockAdaptive}
							toggleDockAdaptive={settings.toggleDockAdaptive}
							dockWinNumberEnabled={settings.dockWinNumberEnabled}
							toggleDockWinNumber={settings.toggleDockWinNumber}
							dockExtrasPosition={settings.dockExtrasPosition}
							handleDockExtrasPositionChange={settings.handleDockExtrasPositionChange}
							dockExtrasDrives={settings.dockExtrasDrives}
							toggleDockExtrasDrives={settings.toggleDockExtrasDrives}
							dockExtrasHiddenDrives={settings.dockExtrasHiddenDrives}
							toggleDockExtrasDrive={settings.toggleDockExtrasDrive}
							dockExtrasRecycleBin={settings.dockExtrasRecycleBin}
							toggleDockExtrasRecycleBin={settings.toggleDockExtrasRecycleBin}
							dockTaskView={settings.dockTaskView}
							toggleDockTaskView={settings.toggleDockTaskView}
							dockExtrasFolders={settings.dockExtrasFolders}
							toggleDockExtraFolder={settings.toggleDockExtraFolder}
							dockExtrasCustomFolders={settings.dockExtrasCustomFolders}
							handleAddDockExtraFolder={settings.handleAddDockExtraFolder}
							handleRemoveDockExtraFolder={settings.handleRemoveDockExtraFolder}
							startIcon={settings.startIcon}
							handleStartIconChange={settings.handleStartIconChange}
						/>
					)}
					{activeTab === "overlays" && (
						<OverlaysTab
							volumeOverlayEnabled={settings.volumeOverlayEnabled}
							toggleVolumeOverlay={settings.toggleVolumeOverlay}
							volumeEdgeEnabled={settings.volumeEdgeEnabled}
							toggleVolumeEdge={settings.toggleVolumeEdge}
							brightnessOverlayEnabled={settings.brightnessOverlayEnabled}
							toggleBrightnessOverlay={settings.toggleBrightnessOverlay}
							brightnessEdgeEnabled={settings.brightnessEdgeEnabled}
							toggleBrightnessEdge={settings.toggleBrightnessEdge}
						/>
					)}
					{activeTab === "mouse" && (
						<MouseTab
							mouseRadialEnabled={settings.mouseRadialEnabled}
							toggleMouseRadial={settings.toggleMouseRadial}
							mouseTriggerButton={settings.mouseTriggerButton}
							handleMouseTriggerButtonChange={settings.handleMouseTriggerButtonChange}
							mouseTriggerMode={settings.mouseTriggerMode}
							handleMouseTriggerModeChange={settings.handleMouseTriggerModeChange}
							mousePlacement={settings.mousePlacement}
							handleMousePlacementChange={settings.handleMousePlacementChange}
							mouseMonitor={settings.mouseMonitor}
							handleMouseMonitorChange={settings.handleMouseMonitorChange}
							mouseSelectionMode={settings.mouseSelectionMode}
							handleMouseSelectionModeChange={settings.handleMouseSelectionModeChange}
							mouseAreaWedges={settings.mouseAreaWedges}
							toggleMouseAreaWedges={settings.toggleMouseAreaWedges}
							mouseInstantActivate={settings.mouseInstantActivate}
							handleMouseInstantActivateChange={settings.handleMouseInstantActivateChange}
							mouseInstantDwellMs={settings.mouseInstantDwellMs}
							handleMouseInstantDwellMsChange={settings.handleMouseInstantDwellMsChange}
							mouseInstantSensitivity={settings.mouseInstantSensitivity}
							handleMouseInstantSensitivityChange={settings.handleMouseInstantSensitivityChange}
							mouseNumberLaunch={settings.mouseNumberLaunch}
							toggleMouseNumberLaunch={settings.toggleMouseNumberLaunch}
							mouseNumberLabels={settings.mouseNumberLabels}
							toggleMouseNumberLabels={settings.toggleMouseNumberLabels}
							mouseWorkspacePeek={settings.mouseWorkspacePeek}
							toggleMouseWorkspacePeek={settings.toggleMouseWorkspacePeek}
							mouseWorkspacePeekStyle={settings.mouseWorkspacePeekStyle}
							handleMouseWorkspacePeekStyleChange={settings.handleMouseWorkspacePeekStyleChange}
							mouseWorkspacePeekDelayMs={settings.mouseWorkspacePeekDelayMs}
							handleMouseWorkspacePeekDelayMsChange={settings.handleMouseWorkspacePeekDelayMsChange}
							mouseGameModeEnabled={settings.mouseGameModeEnabled}
							toggleMouseGameMode={settings.toggleMouseGameMode}
							mouseGameModeScope={settings.mouseGameModeScope}
							handleMouseGameModeScopeChange={settings.handleMouseGameModeScopeChange}
							mouseGameModeBlockedApps={settings.mouseGameModeBlockedApps}
							handleMouseGameModeBlockedAppsChange={settings.handleMouseGameModeBlockedAppsChange}
							mouseGameModeAutoDetect={settings.mouseGameModeAutoDetect}
							toggleMouseGameModeAutoDetect={settings.toggleMouseGameModeAutoDetect}
							mouseSoundEnabled={settings.mouseSoundEnabled}
							toggleMouseSound={settings.toggleMouseSound}
							mouseSoundVolume={settings.mouseSoundVolume}
							handleMouseSoundVolumeChange={settings.handleMouseSoundVolumeChange}
							mouseMenuRadius={settings.mouseMenuRadius}
							handleMouseMenuRadiusChange={settings.handleMouseMenuRadiusChange}
							mouseIconSize={settings.mouseIconSize}
							handleMouseIconSizeChange={settings.handleMouseIconSizeChange}
							mouseAppSpacing={settings.mouseAppSpacing}
							handleMouseAppSpacingChange={settings.handleMouseAppSpacingChange}
							mouseBackdropOpacity={settings.mouseBackdropOpacity}
							handleMouseBackdropOpacityChange={settings.handleMouseBackdropOpacityChange}
							mouseHoverColor={settings.mouseHoverColor}
							handleMouseHoverColorChange={settings.handleMouseHoverColorChange}
							mouseActivationThreshold={settings.mouseActivationThreshold}
							handleMouseActivationThresholdChange={settings.handleMouseActivationThresholdChange}
							mouseShowLabels={settings.mouseShowLabels}
							toggleMouseShowLabels={settings.toggleMouseShowLabels}
							mouseAlwaysShowLabels={settings.mouseAlwaysShowLabels}
							toggleMouseAlwaysShowLabels={settings.toggleMouseAlwaysShowLabels}
							mouseShowWorkspacePill={settings.mouseShowWorkspacePill}
							toggleMouseShowWorkspacePill={settings.toggleMouseShowWorkspacePill}
							mouseOpenSound={settings.mouseOpenSound}
							handleMouseOpenSoundChange={settings.handleMouseOpenSoundChange}
							mouseHoverSound={settings.mouseHoverSound}
							handleMouseHoverSoundChange={settings.handleMouseHoverSoundChange}
						/>
					)}
					{activeTab === "ai" && (
						<AiTab
							translatorEngine={settings.translatorEngine}
							handleTranslatorEngineChange={settings.handleTranslatorEngineChange}
							translatorProvider={settings.translatorProvider}
							handleTranslatorProviderChange={settings.handleTranslatorProviderChange}
							translatorApiKey={settings.translatorApiKey}
							handleTranslatorApiKeyChange={settings.handleTranslatorApiKeyChange}
							translatorGroqApiKey={settings.translatorGroqApiKey}
							handleTranslatorGroqApiKeyChange={settings.handleTranslatorGroqApiKeyChange}
							translatorOpenaiApiKey={settings.translatorOpenaiApiKey}
							handleTranslatorOpenaiApiKeyChange={settings.handleTranslatorOpenaiApiKeyChange}
							translatorCustomApiUrl={settings.translatorCustomApiUrl}
							handleTranslatorCustomApiUrlChange={settings.handleTranslatorCustomApiUrlChange}
							translatorCustomApiKey={settings.translatorCustomApiKey}
							handleTranslatorCustomApiKeyChange={settings.handleTranslatorCustomApiKeyChange}
							translatorCustomModel={settings.translatorCustomModel}
							handleTranslatorCustomModelChange={settings.handleTranslatorCustomModelChange}
							translatorCustomApiFormat={settings.translatorCustomApiFormat}
							handleTranslatorCustomApiFormatChange={settings.handleTranslatorCustomApiFormatChange}
							aiChatEnabled={settings.aiChatEnabled}
							toggleAiChatEnabled={settings.toggleAiChatEnabled}
							aiChatProvider={settings.aiChatProvider}
							handleAiChatProviderChange={settings.handleAiChatProviderChange}
							aiChatSystemPrompt={settings.aiChatSystemPrompt}
							handleAiChatSystemPromptChange={settings.handleAiChatSystemPromptChange}
						/>
					)}
					{activeTab === "translator" && (
						<TranslatorTab
							translatorEnabled={settings.translatorEnabled}
							toggleTranslatorEnabled={settings.toggleTranslatorEnabled}
							translatorEngine={settings.translatorEngine}
							translatorProvider={settings.translatorProvider}
							onOpenAiTab={() => setActiveTab("ai")}
							translatorTargetLanguage={settings.translatorTargetLanguage}
							handleTranslatorTargetLanguageChange={settings.handleTranslatorTargetLanguageChange}
							translatorOutputMode={settings.translatorOutputMode}
							handleTranslatorOutputModeChange={settings.handleTranslatorOutputModeChange}
							translatorDisplayTarget={settings.translatorDisplayTarget}
							handleTranslatorDisplayTargetChange={settings.handleTranslatorDisplayTargetChange}
							translatorSelectAllFallback={settings.translatorSelectAllFallback}
							toggleTranslatorSelectAllFallback={settings.toggleTranslatorSelectAllFallback}
							translatorAutoPasteArToEn={settings.translatorAutoPasteArToEn}
							toggleTranslatorAutoPasteArToEn={settings.toggleTranslatorAutoPasteArToEn}
							translatorHotkeyArToEn={settings.translatorHotkeyArToEn}
							translatorHotkeyAnyToAr={settings.translatorHotkeyAnyToAr}
							translatorHotkeyScreen={settings.translatorHotkeyScreen}
							translatorHotkeyFullpage={settings.translatorHotkeyFullpage}
							handleTranslatorHotkeyChange={settings.handleTranslatorHotkeyChange}
							translatorFontSize={settings.translatorFontSize}
							handleTranslatorFontSizeChange={settings.handleTranslatorFontSizeChange}
							translatorCardTimeoutSec={settings.translatorCardTimeoutSec}
							handleTranslatorCardTimeoutSecChange={settings.handleTranslatorCardTimeoutSecChange}
							translatorOverlayOpacity={settings.translatorOverlayOpacity}
							handleTranslatorOverlayOpacityChange={settings.handleTranslatorOverlayOpacityChange}
							translatorCustomPromptInplace={settings.translatorCustomPromptInplace}
							handleTranslatorCustomPromptInplaceChange={settings.handleTranslatorCustomPromptInplaceChange}
							translatorCustomPromptQuick={settings.translatorCustomPromptQuick}
							handleTranslatorCustomPromptQuickChange={settings.handleTranslatorCustomPromptQuickChange}
						/>
					)}
					{activeTab === "about" && (
						<AboutTab
							appVersion={settings.appVersion}
							autoUpdate={settings.autoUpdate}
							toggleAutoUpdate={settings.toggleAutoUpdate}
							updateStatus={settings.updateStatus}
							updateVersion={settings.updateVersion}
							checkForUpdates={settings.checkForUpdates}
							installUpdate={settings.installUpdate}
							exportStatus={settings.exportStatus}
							importStatus={settings.importStatus}
							handleExportSettings={settings.handleExportSettings}
							handleImportSettings={settings.handleImportSettings}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<LanguageProvider>
			<SettingsApp />
		</LanguageProvider>
	</StrictMode>
);
