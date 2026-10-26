import { useState } from "react";
import {
	MousePointer,
	Compass,
	Hand,
	Layers,
	Shield,
	Volume2,
	Play,
	Monitor,
	Hash,
	Sparkles,
	Plus,
	Trash2,
	RotateCcw
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { DEFAULT_WORKSPACES } from "../radial/types";
import type { RadialItem, RadialWorkspace, RadialItemType } from "../radial/types";
import { getRadialIcon } from "../radial/iconMap";

interface MouseTabProps {
	mouseRadialEnabled: boolean;
	toggleMouseRadial: () => void;
	mouseTriggerButton: string;
	handleMouseTriggerButtonChange: (btn: string) => void;
	mouseTriggerMode: "hold" | "click";
	handleMouseTriggerModeChange: (mode: "hold" | "click") => void;
	mousePlacement: "cursor" | "center";
	handleMousePlacementChange: (placement: "cursor" | "center") => void;
	mouseMonitor: "cursor" | "primary";
	handleMouseMonitorChange: (monitor: "cursor" | "primary") => void;
	mouseSelectionMode: "area" | "cursor";
	handleMouseSelectionModeChange: (mode: "area" | "cursor") => void;
	mouseAreaWedges: boolean;
	toggleMouseAreaWedges: () => void;
	mouseInstantActivate: "off" | "dwell";
	handleMouseInstantActivateChange: (val: "off" | "dwell") => void;
	mouseInstantDwellMs: number;
	handleMouseInstantDwellMsChange: (val: number) => void;
	mouseInstantSensitivity: "low" | "medium" | "high";
	handleMouseInstantSensitivityChange: (val: "low" | "medium" | "high") => void;
	mouseNumberLaunch: boolean;
	toggleMouseNumberLaunch: () => void;
	mouseNumberLabels: boolean;
	toggleMouseNumberLabels: () => void;
	mouseWorkspacePeek: boolean;
	toggleMouseWorkspacePeek: () => void;
	mouseWorkspacePeekStyle: "fan" | "ring";
	handleMouseWorkspacePeekStyleChange: (style: "fan" | "ring") => void;
	mouseWorkspacePeekDelayMs: number;
	handleMouseWorkspacePeekDelayMsChange: (val: number) => void;
	mouseGameModeEnabled: boolean;
	toggleMouseGameMode: () => void;
	mouseGameModeScope: "all" | "list";
	handleMouseGameModeScopeChange: (scope: "all" | "list") => void;
	mouseGameModeBlockedApps: string;
	handleMouseGameModeBlockedAppsChange: (apps: string) => void;
	mouseGameModeAutoDetect: boolean;
	toggleMouseGameModeAutoDetect: () => void;
	mouseSoundEnabled: boolean;
	toggleMouseSound: () => void;
	mouseSoundVolume: number;
	handleMouseSoundVolumeChange: (val: number) => void;
}

const PRESET_OPTIONS = [
	{ label: "Custom App / URL", target: "", type: "command" as RadialItemType, icon: "Sparkles" },
	{ label: "File Explorer", target: "explorer.exe", type: "command" as RadialItemType, icon: "Folder" },
	{ label: "Web Browser", target: "https://google.com", type: "url" as RadialItemType, icon: "Globe" },
	{ label: "Terminal (PowerShell)", target: "powershell.exe", type: "command" as RadialItemType, icon: "Terminal" },
	{ label: "Zenith Settings", target: "open_settings", type: "system" as RadialItemType, icon: "Settings" },
	{ label: "Task Manager", target: "task_manager", type: "system" as RadialItemType, icon: "Activity" },
	{ label: "Calculator", target: "calc.exe", type: "command" as RadialItemType, icon: "Calculator" },
	{ label: "Notepad", target: "notepad.exe", type: "command" as RadialItemType, icon: "FileText" },
	{ label: "Snipping Tool", target: "snippingtool.exe", type: "command" as RadialItemType, icon: "Scissors" },
	{ label: "WiFi Settings", target: "wifi_settings", type: "system" as RadialItemType, icon: "Wifi" },
	{ label: "Bluetooth Settings", target: "bluetooth_settings", type: "system" as RadialItemType, icon: "Bluetooth" },
	{ label: "Sound Settings", target: "sound_settings", type: "system" as RadialItemType, icon: "Volume2" }
];

export function MouseTab({
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
	handleMouseSoundVolumeChange
}: MouseTabProps) {

	const [recording, setRecording] = useState(false);
	const [workspaces, setWorkspaces] = useState<RadialWorkspace[]>(() => {
		try {
			const stored = localStorage.getItem("zenith-mouse-workspaces");
			return stored ? JSON.parse(stored) : DEFAULT_WORKSPACES;
		} catch {
			return DEFAULT_WORKSPACES;
		}
	});
	const [selectedWsIndex, setSelectedWsIndex] = useState(0);
	const [showAddForm, setShowAddForm] = useState(false);
	const [newItemLabel, setNewItemLabel] = useState("");
	const [newItemTarget, setNewItemTarget] = useState("");
	const [newItemType, setNewItemType] = useState<RadialItemType>("command");
	const [newItemIcon, setNewItemIcon] = useState("Sparkles");

	const saveWorkspaces = (updated: RadialWorkspace[]) => {
		setWorkspaces(updated);
		const json = JSON.stringify(updated);
		localStorage.setItem("zenith-mouse-workspaces", json);
		invoke("save_setting", { key: "zenith-mouse-workspaces", value: json }).catch(() => {});
	};

	const currentWs = workspaces[selectedWsIndex] || workspaces[0] || DEFAULT_WORKSPACES[0];

	const handleDeleteItem = (itemId: string) => {
		const updated = workspaces.map((ws, idx) => {
			if (idx !== selectedWsIndex) return ws;
			return {
				...ws,
				items: ws.items.filter((it) => it.id !== itemId)
			};
		});
		saveWorkspaces(updated);
	};

	const handleAddItem = () => {
		if (!newItemLabel.trim() || !newItemTarget.trim()) return;
		const newItem: RadialItem = {
			id: `item_${Date.now()}`,
			label: newItemLabel.trim(),
			target: newItemTarget.trim(),
			type: newItemType,
			icon: newItemIcon
		};
		const updated = workspaces.map((ws, idx) => {
			if (idx !== selectedWsIndex) return ws;
			return {
				...ws,
				items: [...ws.items, newItem]
			};
		});
		saveWorkspaces(updated);
		setNewItemLabel("");
		setNewItemTarget("");
		setShowAddForm(false);
	};

	const handleResetWorkspaces = () => {
		saveWorkspaces(DEFAULT_WORKSPACES);
	};

	const handlePresetChange = (presetLabel: string) => {
		const p = PRESET_OPTIONS.find((opt) => opt.label === presetLabel);
		if (!p) return;
		if (p.target) {
			setNewItemLabel(p.label);
			setNewItemTarget(p.target);
			setNewItemType(p.type);
			setNewItemIcon(p.icon);
		} else {
			setNewItemLabel("");
			setNewItemTarget("");
			setNewItemType("command");
			setNewItemIcon("Sparkles");
		}
	};

	const handleRecordClick = () => {
		if (recording) {
			setRecording(false);
			invoke("stop_mouse_recording").catch(() => {});
		} else {
			setRecording(true);
			invoke("start_mouse_recording").catch(() => {});
		}
	};

	const testRadialMenu = () => {
		emit("radial-open", { x: window.screen.width / 2, y: window.screen.height / 2 });
	};

	return (
		<>
			{/* Activation & Trigger */}
			<div className="setting-group-label">Activation</div>
			<div className="setting-group">
				<SettingRow
					icon={MousePointer}
					label="Enable Mouse Radial Menu"
					desc="Open radial launcher with mouse gestures"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseRadialEnabled}
							onChange={toggleMouseRadial}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Sparkles}
					label="Trigger Button"
					desc="Mouse button used to trigger the radial wheel"
				>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px" }}>
						<select
							className="settings-select"
							value={mouseTriggerButton}
							onChange={(e) => handleMouseTriggerButtonChange(e.target.value)}
							disabled={recording}
							style={{ width: "100%" }}
						>
							<option value="middle">Wheel (Middle Button)</option>
							<option value="x1">Mouse 4 (Back Button)</option>
							<option value="x2">Mouse 5 (Forward Button)</option>
							<option value="Ctrl+middle">Ctrl + Wheel</option>
							<option value="Alt+middle">Alt + Wheel</option>
							<option value="Shift+middle">Shift + Wheel</option>
							<option value="Ctrl+left">Ctrl + Left Button</option>
							<option value="Alt+left">Alt + Left Button</option>
							<option value="Ctrl+right">Ctrl + Right Button</option>
						</select>

						<button
							type="button"
							className={`settings-btn ${recording ? "primary" : ""}`}
							onClick={handleRecordClick}
							style={{ width: "100%" }}
						>
							{recording ? "Listening..." : "Record"}
						</button>
					</div>
				</SettingRow>

				<SettingRow
					icon={Hand}
					label="Gesture Behavior"
					desc="Hold and release to launch, or click to toggle wheel open"
					divider={false}
				>
					<select
						className="settings-select"
						value={mouseTriggerMode}
						onChange={(e) =>
							handleMouseTriggerModeChange(e.target.value as "hold" | "click")
						}
					>
						<option value="hold">Hold & Release</option>
						<option value="click">Click to Toggle</option>
					</select>
				</SettingRow>
			</div>

			{/* Radial Items & Shortcuts */}
			<div className="setting-group-label">Radial Items & Shortcuts</div>
			<div className="setting-group">
				<div className="radial-manager-container">
					{/* Workspace tabs & reset */}
					<div className="radial-ws-tabs">
						<div className="radial-ws-tabs-left">
							{workspaces.map((ws, idx) => {
								const WsIcon = getRadialIcon(ws.icon);
								return (
									<button
										key={ws.id || idx}
										type="button"
										className={`radial-ws-tab-btn ${selectedWsIndex === idx ? "active" : ""}`}
										onClick={() => setSelectedWsIndex(idx)}
									>
										<WsIcon size={12} strokeWidth={1.8} />
										<span>{ws.name}</span>
										<span style={{ opacity: 0.6, fontSize: "10px" }}>({ws.items.length})</span>
									</button>
								);
							})}
						</div>

						<button
							type="button"
							className="settings-btn-detect"
							onClick={handleResetWorkspaces}
							title="Reset items to default"
						>
							<RotateCcw size={11} />
							<span>Reset Defaults</span>
						</button>
					</div>

					{/* Items List */}
					<div className="radial-items-list">
						{currentWs.items.map((item, index) => {
							const ItemIcon = getRadialIcon(item.icon);
							return (
								<div key={item.id || index} className="radial-item-row">
									<div className="radial-item-left">
										<span className="radial-item-num">#{index + 1}</span>
										<div className="radial-item-icon-box">
											<ItemIcon size={15} strokeWidth={1.8} />
										</div>
										<div className="radial-item-meta">
											<span className="radial-item-name">{item.label}</span>
											<span className="radial-item-target">{item.target}</span>
										</div>
									</div>

									<div className="radial-item-actions">
										<span className="radial-item-type-badge">{item.type}</span>
										<button
											type="button"
											className="radial-item-del-btn"
											onClick={() => handleDeleteItem(item.id)}
											title="Delete item"
										>
											<Trash2 size={13} />
										</button>
									</div>
								</div>
							);
						})}
					</div>

					{/* Add Item Box */}
					{showAddForm ? (
						<div className="radial-add-box">
							<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
								<select
									className="settings-select"
									style={{ flex: 1, textAlign: "left" }}
									onChange={(e) => handlePresetChange(e.target.value)}
									defaultValue=""
								>
									<option value="" disabled>Choose a Preset (or Custom)...</option>
									{PRESET_OPTIONS.map((opt) => (
										<option key={opt.label} value={opt.label}>
											{opt.label}
										</option>
									))}
								</select>

								<select
									className="settings-select"
									value={newItemType}
									onChange={(e) => setNewItemType(e.target.value as RadialItemType)}
									style={{ minWidth: "90px" }}
								>
									<option value="command">Command / App</option>
									<option value="url">Web URL</option>
									<option value="system">System Action</option>
									<option value="file">File</option>
									<option value="folder">Folder</option>
								</select>
							</div>

							<div style={{ display: "flex", gap: "8px" }}>
								<input
									type="text"
									className="settings-text-input"
									placeholder="Label (e.g. Chrome, Discord)"
									value={newItemLabel}
									onChange={(e) => setNewItemLabel(e.target.value)}
									style={{ flex: "1 1 40%" }}
								/>
								<input
									type="text"
									className="settings-text-input"
									placeholder="Target (e.g. chrome.exe, https://...)"
									value={newItemTarget}
									onChange={(e) => setNewItemTarget(e.target.value)}
									style={{ flex: "2 1 60%" }}
								/>
							</div>

							<div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "4px" }}>
								<button
									type="button"
									className="settings-btn"
									onClick={() => setShowAddForm(false)}
								>
									Cancel
								</button>
								<button
									type="button"
									className="settings-btn-detect"
									style={{ background: "var(--bloom-accent, #007aff)", color: "#fff", borderColor: "transparent" }}
									onClick={handleAddItem}
									disabled={!newItemLabel.trim() || !newItemTarget.trim()}
								>
									<Plus size={12} />
									<span>Add Item</span>
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							className="settings-btn-detect"
							onClick={() => setShowAddForm(true)}
							style={{ alignSelf: "flex-start" }}
						>
							<Plus size={12} />
							<span>Add Shortcut to {currentWs.name}</span>
						</button>
					)}
				</div>
			</div>

			{/* Placement & Display */}
			<div className="setting-group-label">Placement & Display</div>
			<div className="setting-group">
				<SettingRow
					icon={Compass}
					label="Wheel Placement"
					desc="Open wheel directly under pointer or centered on screen"
				>
					<select
						className="settings-select"
						value={mousePlacement}
						onChange={(e) =>
							handleMousePlacementChange(e.target.value as "cursor" | "center")
						}
					>
						<option value="cursor">Under Pointer</option>
						<option value="center">Screen Center</option>
					</select>
				</SettingRow>

				<SettingRow
					icon={Monitor}
					label="Target Monitor"
					desc="Which monitor the radial launcher appears on"
					divider={false}
				>
					<select
						className="settings-select"
						value={mouseMonitor}
						onChange={(e) =>
							handleMouseMonitorChange(e.target.value as "cursor" | "primary")
						}
					>
						<option value="cursor">Pointer's Display</option>
						<option value="primary">Primary Display</option>
					</select>
				</SettingRow>
			</div>

			{/* Aiming & Visuals */}
			<div className="setting-group-label">Aiming & Visuals</div>
			<div className="setting-group">
				<SettingRow
					icon={Compass}
					label="Aiming Mode"
					desc="Area direction selects by angle; Cursor mode requires direct hover"
				>
					<select
						className="settings-select"
						value={mouseSelectionMode}
						onChange={(e) =>
							handleMouseSelectionModeChange(e.target.value as "area" | "cursor")
						}
					>
						<option value="area">Directional / Sector</option>
						<option value="cursor">Direct Hover</option>
					</select>
				</SettingRow>

				<SettingRow
					icon={Layers}
					label="Wedge Dividers"
					desc="Draw radial divider lines between slices"
					divider={false}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseAreaWedges}
							onChange={toggleMouseAreaWedges}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			{/* Hands-Free (Dwell) */}
			<div className="setting-group-label">Hands-Free (Instant Activate)</div>
			<div className="setting-group">
				<SettingRow
					icon={Play}
					label="Launch Without Clicking"
					desc="Holding aim in a slice's direction auto-launches it"
				>
					<select
						className="settings-select"
						value={mouseInstantActivate}
						onChange={(e) =>
							handleMouseInstantActivateChange(e.target.value as "off" | "dwell")
						}
					>
						<option value="off">Disabled</option>
						<option value="dwell">Dwell (Timer)</option>
					</select>
				</SettingRow>

				{mouseInstantActivate === "dwell" && (
					<>
						<SettingRow
							icon={Hand}
							label="Dwell Duration"
							desc={`Hold direction for ${mouseInstantDwellMs} ms`}
						>
							<input
								type="range"
								min="150"
								max="1000"
								step="50"
								value={mouseInstantDwellMs}
								onChange={(e) =>
									handleMouseInstantDwellMsChange(parseInt(e.target.value, 10))
								}
								className="settings-slider"
							/>
						</SettingRow>

						<SettingRow
							icon={Compass}
							label="Direction Sensitivity"
							desc="How easily small pointer movement changes selection"
							divider={false}
						>
							<select
								className="settings-select"
								value={mouseInstantSensitivity}
								onChange={(e) =>
									handleMouseInstantSensitivityChange(
										e.target.value as "low" | "medium" | "high"
									)
								}
							>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
							</select>
						</SettingRow>
					</>
				)}
			</div>

			{/* Shortcuts & Numbers */}
			<div className="setting-group-label">Shortcuts & Numbers</div>
			<div className="setting-group">
				<SettingRow
					icon={Hash}
					label="Number Key Launch"
					desc="Press 1-9 to launch matching slice when wheel is open"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseNumberLaunch}
							onChange={toggleMouseNumberLaunch}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Layers}
					label="Number Badges"
					desc="Show 1-9 numeric badges on radial slices"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseNumberLabels}
							onChange={toggleMouseNumberLabels}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Layers}
					label="Workspace Peek"
					desc="Hovering a workspace fans out its shortcuts without entering"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseWorkspacePeek}
							onChange={toggleMouseWorkspacePeek}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{mouseWorkspacePeek && (
					<>
						<SettingRow
							icon={Compass}
							label="Peek Layout Style"
							desc="Fan arc outward or full outer ring"
						>
							<select
								className="settings-select"
								value={mouseWorkspacePeekStyle}
								onChange={(e) =>
									handleMouseWorkspacePeekStyleChange(
										e.target.value as "fan" | "ring"
									)
								}
							>
								<option value="fan">Fan Arc</option>
								<option value="ring">Outer Ring</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Hand}
							label="Peek Delay"
							desc={`Reveal shortcuts after ${mouseWorkspacePeekDelayMs} ms`}
							divider={false}
						>
							<input
								type="range"
								min="100"
								max="800"
								step="50"
								value={mouseWorkspacePeekDelayMs}
								onChange={(e) =>
									handleMouseWorkspacePeekDelayMsChange(
										parseInt(e.target.value, 10)
									)
								}
								className="settings-slider"
							/>
						</SettingRow>
					</>
				)}
			</div>

			{/* Protection & Game Mode */}
			<div className="setting-group-label">Fullscreen Protection</div>
			<div className="setting-group">
				<SettingRow
					icon={Shield}
					label="Game Mode Protection"
					desc="Prevent accidental opening during fullscreen games & videos"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseGameModeEnabled}
							onChange={toggleMouseGameMode}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{mouseGameModeEnabled && (
					<>
						<SettingRow
							icon={Monitor}
							label="Protection Scope"
							desc="Block during any fullscreen app, or only listed executables"
						>
							<select
								className="settings-select"
								value={mouseGameModeScope}
								onChange={(e) =>
									handleMouseGameModeScopeChange(
										e.target.value as "all" | "list"
									)
								}
							>
								<option value="all">All Fullscreen Apps</option>
								<option value="list">Protected List Only</option>
							</select>
						</SettingRow>

						{mouseGameModeScope === "list" && (
							<>
								<SettingRow
									icon={Shield}
									label="Auto-detect Games"
									desc="Automatically protect Steam, Epic, and Xbox game folders"
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={mouseGameModeAutoDetect}
											onChange={toggleMouseGameModeAutoDetect}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>

								<SettingRow
									icon={Shield}
									label="Blocked Executables"
									desc="Comma-separated filenames (e.g. csgo.exe, valorant.exe)"
									divider={false}
								>
									<input
										type="text"
										className="settings-input"
										value={mouseGameModeBlockedApps}
										onChange={(e) =>
											handleMouseGameModeBlockedAppsChange(e.target.value)
										}
										placeholder="csgo.exe, valorant.exe"
										style={{ width: "240px" }}
									/>
								</SettingRow>
							</>
						)}
					</>
				)}
			</div>

			{/* Audio Feedback */}
			<div className="setting-group-label">Audio & Feedback</div>
			<div className="setting-group">
				<SettingRow
					icon={Volume2}
					label="Radial Sound Effects"
					desc="Play futuristic audio cues on bloom and item hover"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseSoundEnabled}
							onChange={toggleMouseSound}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{mouseSoundEnabled && (
					<SettingRow
						icon={Volume2}
						label="Sound Volume"
						desc={`Volume level: ${mouseSoundVolume}%`}
						divider={false}
					>
						<input
							type="range"
							min="10"
							max="100"
							step="5"
							value={mouseSoundVolume}
							onChange={(e) =>
								handleMouseSoundVolumeChange(parseInt(e.target.value, 10))
							}
							className="settings-slider"
						/>
					</SettingRow>
				)}
			</div>

			{/* Test Radial Menu */}
			<div className="setting-group-label">Quick Test</div>
			<div className="setting-group">
				<SettingRow
					icon={Play}
					label="Preview Radial Launcher"
					desc="Open the radial menu now to preview layout and animation"
					action
					onClick={testRadialMenu}
					divider={false}
				/>
			</div>
		</>
	);
}
