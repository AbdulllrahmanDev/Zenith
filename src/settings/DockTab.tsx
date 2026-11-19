import { useEffect, useState, type ChangeEvent, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	Monitor,
	Eye,
	EyeOff,
	Circle,
	Columns2,
	Maximize2,
	Keyboard,
	Sparkles,
	RotateCcw,
	Timer,
	LayoutPanelLeft,
	HardDrive,
	Trash2,
	Copy,
	FolderOpen,
	FolderPlus,
	Plus,
	X
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { useI18n } from "../i18n";
import {
	KNOWN_FOLDER_OPTIONS,
	driveLetter,
	parseEnabledFolders,
	parseCustomFolders,
	parseHiddenDrives,
	type DockExtra
} from "../dockExtras";
import type { DisplayInfo } from "../dockApps";

/** Where a setting row's label starts: the row icon's 28px plus its 12px margin.
 * Content under a label (chips, lists) is indented by this to line up with it. */
const ROW_CONTENT_INDENT = "40px";

/** One chip per connected drive, plus hidden drives that aren't connected. */
function DrivePicker({
	hiddenDrives,
	onToggle
}: {
	hiddenDrives: string;
	onToggle: (letter: string) => void;
}) {
	const { t } = useI18n();
	const [drives, setDrives] = useState<{ letter: string; name: string }[]>([]);

	useEffect(() => {
		invoke<DockExtra[]>("get_dock_drives")
			.then((list) =>
				setDrives(
					list.flatMap((drive) => {
						const letter = driveLetter(drive);
						return letter ? [{ letter, name: drive.name }] : [];
					})
				)
			)
			.catch((error) => console.error("Failed to list drives:", error));
	}, []);

	const hidden = parseHiddenDrives(hiddenDrives);
	const disconnected = hidden
		.filter((letter) => !drives.some((drive) => drive.letter === letter))
		.map((letter) => ({ letter, name: t.dock.drivesDisconnected(letter) }));

	return (
		<div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingInlineStart: ROW_CONTENT_INDENT }}>
			{[...drives, ...disconnected].map((drive) => (
				<button
					key={drive.letter}
					type="button"
					className={`folder-chip ${hidden.includes(drive.letter) ? "" : "active"}`}
					onClick={() => onToggle(drive.letter)}
				>
					{drive.name}
				</button>
			))}
		</div>
	);
}

const START_ICON_PRESETS = [
	{ key: "default", src: "/zenith-white-no-bg-nosmile.svg", label: "Zenith" },
	{ key: "zenith-holographic", src: "/zenith-color-1-holographic.svg", label: "Holographic" },
	{ key: "zenith-emerald", src: "/zenith-color-2-emerald.svg", label: "Emerald" },
	{ key: "zenith-gold", src: "/zenith-color-3-gold.svg", label: "Gold" },
	{ key: "zenith-iznik-blue", src: "/zenith-color-4-iznik-blue.svg", label: "Iznik Blue" },
	{ key: "zenith-midnight-gold", src: "/zenith-color-5-midnight-gold.svg", label: "Midnight Gold" },
	{ key: "zenith-ivory-emerald", src: "/zenith-color-6-ivory-emerald.svg", label: "Ivory Emerald" },
	{ key: "windows", src: "/windows-11.png", label: "Windows" }
];

const startIconTileStyle = (active: boolean): CSSProperties => ({
	width: "48px",
	height: "48px",
	borderRadius: "12px",
	border: active ? "2px solid var(--zenith-accent, #007aff)" : "2px solid rgba(255,255,255,0.1)",
	background: active ? "rgba(0,122,255,0.15)" : "rgba(255,255,255,0.05)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
	transition: "all 0.15s ease",
	padding: "6px",
	color: "rgba(255,255,255,0.5)"
});

interface DockTabProps {
	dockEnabled: boolean;
	toggleDock: () => void;
	dockMode: string;
	setDockModeValue: (mode: string) => void;
	dockEdgeDelay: number;
	handleDockEdgeDelayChange: (val: number) => void;
	dockPreviewEnabled: boolean;
	toggleDockPreview: () => void;
	dockIconOnly: boolean;
	toggleDockIconOnly: () => void;
	dockSeparatorEnabled: boolean;
	toggleDockSeparator: () => void;
	dockAdaptive: boolean;
	toggleDockAdaptive: () => void;
	dockWinNumberEnabled: boolean;
	toggleDockWinNumber: () => void;
	dockExtrasPosition: string;
	handleDockExtrasPositionChange: (position: string) => void;
	dockExtrasDrives: boolean;
	toggleDockExtrasDrives: () => void;
	dockExtrasHiddenDrives: string;
	toggleDockExtrasDrive: (letter: string) => void;
	dockExtrasRecycleBin: boolean;
	toggleDockExtrasRecycleBin: () => void;
	dockTaskView: boolean;
	toggleDockTaskView: () => void;
	dockExtrasFolders: string;
	toggleDockExtraFolder: (id: string) => void;
	dockExtrasCustomFolders: string;
	handleAddDockExtraFolder: () => void;
	handleRemoveDockExtraFolder: (path: string) => void;
	startIcon: string;
	handleStartIconChange: (icon: string) => void;
	dockDisplay: string;
	setDockDisplayValue: (val: string) => void;
	dockIsolation: boolean;
	toggleDockIsolation: () => void;
	displays: DisplayInfo[];
}

export function DockTab({
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
	displays,
	dockPreviewEnabled,
	toggleDockPreview,
	dockIconOnly,
	toggleDockIconOnly,
	dockSeparatorEnabled,
	toggleDockSeparator,
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
	startIcon,
	handleStartIconChange
}: DockTabProps) {
	const handleStartIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			handleStartIconChange(`custom:${reader.result as string}`);
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const { t } = useI18n();
	const d = t.dock;

	return (
		<>
			<div className="setting-group-label">{d.group}</div>
			<div className="setting-group">
				<SettingRow icon={Monitor} label={d.enableDock} desc={d.enableDockDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={dockEnabled} onChange={toggleDock} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{dockEnabled && (
					<>
						<SettingRow
							icon={Monitor}
							label={d.display}
							desc={displays.length > 1 ? d.displayMultiDesc : d.displaySingleDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={displays.length <= 1 ? "primary" : dockDisplay}
								disabled={displays.length <= 1}
								onChange={(e) => setDockDisplayValue(e.target.value)}
							>
								<option value="primary">{d.primaryDisplay}</option>
								<option value="all">{d.allDisplays}</option>
								{displays.length > 1 &&
									displays.map((disp) => (
										<option key={disp.id} value={disp.id}>
											{disp.name.includes(`${disp.width}x${disp.height}`)
												? disp.name
												: `${disp.name} (${disp.width}x${disp.height})`}
										</option>
									))}
							</ZenithSelect>
						</SettingRow>

						{displays.length > 1 && (
							<SettingRow
								icon={Columns2}
								label={d.isolateApps}
								desc={d.isolateAppsDesc}
							>
								<label className="toggle-switch">
									<input
										type="checkbox"
										checked={dockIsolation}
										onChange={toggleDockIsolation}
									/>
									<span className="slider"></span>
								</label>
							</SettingRow>
						)}

						<SettingRow
							icon={dockMode === "fixed" ? EyeOff : Eye}
							label={d.behavior}
							desc={d.behaviorDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={dockMode}
								onChange={(e) => setDockModeValue(e.target.value)}
							>
								<option value="fixed">{d.modeFixed}</option>
								<option value="smart">{d.modeSmart}</option>
								<option value="peek">{d.modePeek}</option>
							</ZenithSelect>
						</SettingRow>

						{dockMode !== "fixed" && (
							<SettingRow
								icon={Timer}
								label={d.peekDelay}
								desc={
									dockEdgeDelay === 0
										? d.peekDelayInstant
										: d.peekDelayMs(dockEdgeDelay)
								}
							>
								<input
									type="range"
									min="0"
									max="800"
									step="50"
									value={dockEdgeDelay}
									onChange={(e) => handleDockEdgeDelayChange(parseInt(e.target.value))}
									className="settings-slider"
								/>
							</SettingRow>
						)}

						<SettingRow icon={Eye} label={d.showAppPreviews} desc={d.showAppPreviewsDesc}>
							<label className="toggle-switch">
								<input type="checkbox" checked={dockPreviewEnabled} onChange={toggleDockPreview} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow icon={Circle} label={d.iconOnly} desc={d.iconOnlyDesc}>
							<label className="toggle-switch">
								<input type="checkbox" checked={dockIconOnly} onChange={toggleDockIconOnly} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Columns2}
							label={d.appSeparator}
							desc={d.appSeparatorDesc}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={dockSeparatorEnabled}
									onChange={toggleDockSeparator}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow icon={Copy} label={d.taskView} desc={d.taskViewDesc}>
							<label className="toggle-switch">
								<input type="checkbox" checked={dockTaskView} onChange={toggleDockTaskView} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label={d.winNumberShortcuts}
							desc={d.winNumberShortcutsDesc}
							divider={dockMode === "fixed"}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={dockWinNumberEnabled}
									onChange={toggleDockWinNumber}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						{dockMode === "fixed" && (
							<SettingRow
								icon={Maximize2}
								label={d.adaptiveMode}
								desc={d.adaptiveModeDesc}
								divider={false}
							>
								<label className="toggle-switch">
									<input type="checkbox" checked={dockAdaptive} onChange={toggleDockAdaptive} />
									<span className="slider"></span>
								</label>
							</SettingRow>
						)}

						<SettingRow
							icon={LayoutPanelLeft}
							label={d.dockExtras}
							desc={d.dockExtrasDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={dockExtrasPosition}
								onChange={(e) => handleDockExtrasPositionChange(e.target.value)}
							>
								<option value="off">{d.extrasOff}</option>
								<option value="left">{d.extrasLeft}</option>
								<option value="right">{d.extrasRight}</option>
							</ZenithSelect>
						</SettingRow>

						{dockExtrasPosition !== "off" && (
							<>
								<SettingRow
									icon={HardDrive}
									label={d.drives}
									desc={d.drivesDesc}
									divider={!dockExtrasDrives}
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={dockExtrasDrives}
											onChange={toggleDockExtrasDrives}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>

								{dockExtrasDrives && (
									<>
										<div className="setting-item" style={{ paddingTop: 0, paddingBottom: 12 }}>
											<DrivePicker
												hiddenDrives={dockExtrasHiddenDrives}
												onToggle={toggleDockExtrasDrive}
											/>
										</div>
										<div className="setting-divider" />
									</>
								)}

								<SettingRow
									icon={Trash2}
									label={d.recycleBin}
									desc={d.recycleBinDesc}
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={dockExtrasRecycleBin}
											onChange={toggleDockExtrasRecycleBin}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>

								<div
									className="setting-item"
									style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}
								>
									<div style={{ display: "flex", alignItems: "center", width: "100%" }}>
										<div className="setting-icon-bg">
											<FolderOpen size={14} strokeWidth={1.5} />
										</div>
										<div className="setting-info">
											<span className="setting-label">{d.specialFolders}</span>
											<span className="setting-desc">
												{d.specialFoldersDesc}
											</span>
										</div>
									</div>
									<div
										style={{
											display: "flex",
											gap: "8px",
											flexWrap: "wrap",
											paddingInlineStart: ROW_CONTENT_INDENT
										}}
									>
										{KNOWN_FOLDER_OPTIONS.map((folder) => {
											const active = parseEnabledFolders(dockExtrasFolders).includes(folder.id);
											return (
												<button
													key={folder.id}
													type="button"
													className={`folder-chip ${active ? "active" : ""}`}
													onClick={() => toggleDockExtraFolder(folder.id)}
												>
													{d.folders[folder.id] ?? folder.label}
												</button>
											);
										})}
									</div>
								</div>
								<div className="setting-divider" />

								<div
									className="setting-item"
									style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}
								>
									<div style={{ display: "flex", alignItems: "center", width: "100%" }}>
										<div className="setting-icon-bg">
											<FolderPlus size={14} strokeWidth={1.5} />
										</div>
										<div className="setting-info">
											<span className="setting-label">{d.customFolders}</span>
											<span className="setting-desc">{d.customFoldersDesc}</span>
										</div>
									</div>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "6px",
											width: "100%",
											paddingInlineStart: ROW_CONTENT_INDENT,
											boxSizing: "border-box"
										}}
									>
										{parseCustomFolders(dockExtrasCustomFolders).map((folder) => (
											<div key={folder.path} className="extra-folder-row">
												<span className="extra-folder-name">{folder.name}</span>
												<span className="extra-folder-path">{folder.path}</span>
												<button
													type="button"
													className="extra-folder-remove"
													title={d.removeFolderTitle}
													onClick={() => handleRemoveDockExtraFolder(folder.path)}
												>
													<X size={14} strokeWidth={2} />
												</button>
											</div>
										))}
										<button
											type="button"
											className="folder-chip add"
											onClick={handleAddDockExtraFolder}
										>
											<Plus size={13} strokeWidth={2} />
											{d.addFolder}
										</button>
									</div>
								</div>
							</>
						)}

						<div className="setting-divider" />
						<div
							className="setting-item"
							style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}
						>
							<div style={{ display: "flex", alignItems: "center", width: "100%" }}>
								<div className="setting-icon-bg">
									<Sparkles size={14} strokeWidth={1.5} />
								</div>
								<div className="setting-info">
									<span className="setting-label">{d.startMenuIcon}</span>
									<span className="setting-desc">{d.startMenuIconDesc}</span>
								</div>
							</div>
							<div
								style={{
									display: "flex",
									gap: "8px",
									flexWrap: "wrap",
									paddingInlineStart: ROW_CONTENT_INDENT
								}}
							>
								{START_ICON_PRESETS.map((icon) => {
									const presetLabel = d.startPresets[icon.key] ?? icon.label;
									return (
										<div
											key={icon.key}
											onClick={() => handleStartIconChange(icon.key)}
											style={startIconTileStyle(
												startIcon === icon.key ||
												(icon.key === "default" && (!startIcon || startIcon === "default" || startIcon === "zenith-white"))
											)}
											title={presetLabel}
										>
											<img
												src={icon.src}
												alt={presetLabel}
												style={{ width: "100%", height: "100%", objectFit: "contain" }}
												draggable={false}
											/>
										</div>
									);
								})}
								<div
									onClick={() => document.getElementById("start-icon-file-input")?.click()}
									style={startIconTileStyle(startIcon.startsWith("custom:"))}
									title={d.customIconTitle}
								>
									{startIcon.startsWith("custom:") ? (
										<img
											src={startIcon.replace("custom:", "")}
											alt={t.common.custom}
											style={{
												width: "100%",
												height: "100%",
												objectFit: "contain",
												borderRadius: "8px"
											}}
											draggable={false}
										/>
									) : (
										<Plus size={20} strokeWidth={2} />
									)}
								</div>
								{startIcon !== "default" && (
									<div
										onClick={() => handleStartIconChange("default")}
										style={startIconTileStyle(false)}
										title={d.resetToDefaultTitle}
									>
										<RotateCcw size={18} strokeWidth={1.5} />
									</div>
								)}
							</div>
							<input
								id="start-icon-file-input"
								type="file"
								accept=".png,.ico,.jpg,.jpeg,.svg,.bmp"
								style={{ display: "none" }}
								onChange={handleStartIconUpload}
							/>
						</div>
					</>
				)}
			</div>
		</>
	);
}
