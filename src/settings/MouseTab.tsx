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
	RotateCcw,
	X,
	ExternalLink
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { DEFAULT_WORKSPACES } from "../radial/types";
import type { RadialItem, RadialWorkspace, RadialItemType } from "../radial/types";
import { getRadialIcon } from "../radial/iconMap";
import { WheelPreview } from "../radial/WheelPreview";

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
	const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
			{/* 1. Rovyl Hero Banner & Status */}
			<div className="rovyl-hero-banner">
				<div className="rovyl-hero-top">
					<div className="rovyl-hero-brand">
						<div className="rovyl-hero-icon">
							<Compass size={22} strokeWidth={2.2} />
						</div>
						<div>
							<div className="rovyl-hero-title">
								<span>Rovyl Radial Launcher</span>
								<span className="rovyl-hero-badge">Original Architecture</span>
							</div>
							<div className="rovyl-hero-sub">
								High-performance hold-aim-release radial wheel for Windows
							</div>
						</div>
					</div>

					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseRadialEnabled}
							onChange={toggleMouseRadial}
						/>
						<span className="slider"></span>
					</label>
				</div>

				<div className="rovyl-hero-body">
					<div className="rovyl-hero-desc">
						Hold your configured mouse trigger button, glide toward any shortcut slice in 360°, and release anywhere to launch instantly with sub-millisecond precision.
					</div>
					<button
						type="button"
						className="settings-btn-detect"
						onClick={testRadialMenu}
						style={{ background: "var(--bloom-accent, #007aff)", color: "#fff", borderColor: "transparent", flexShrink: 0 }}
					>
						<Play size={12} fill="currentColor" />
						<span>Test Wheel</span>
					</button>
				</div>
			</div>

			{/* 2. Interactive Wheel Live Preview */}
			<div className="setting-group-label">Wheel Preview ({currentWs.name})</div>
			<div className="setting-group">
				<div style={{ padding: "8px" }}>
					<WheelPreview
						items={currentWs.items}
						workspaceName={currentWs.name}
						workspaceIcon={currentWs.icon}
						areaWedges={mouseAreaWedges}
						numberLabels={mouseNumberLabels}
						onSliceClick={() => {
							emit("radial-open", { x: window.screen.width / 2, y: window.screen.height / 2 });
						}}
					/>
				</div>
			</div>

			{/* 3. Activation & Trigger Settings */}
			<div className="setting-group-label">Trigger & Gesture Behavior</div>
			<div className="setting-group">
				{/* Visual Selector for Hold vs Click */}
				<div style={{ padding: "12px 14px 4px 14px" }}>
					<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
						Gesture Behavior
					</span>
					<div className="rovyl-visual-grid">
						<div
							className={`rovyl-visual-card ${mouseTriggerMode === "hold" ? "active" : ""}`}
							onClick={() => handleMouseTriggerModeChange("hold")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Hold & Release</span>
								<Hand size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								Hold the trigger button, flick mouse toward the shortcut, and let go to launch instantly.
							</span>
						</div>

						<div
							className={`rovyl-visual-card ${mouseTriggerMode === "click" ? "active" : ""}`}
							onClick={() => handleMouseTriggerModeChange("click")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Click to Toggle</span>
								<MousePointer size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								Click the trigger button to open the wheel, click any slice to launch, or click center to cancel.
							</span>
						</div>
					</div>
				</div>

				<SettingRow
					icon={Sparkles}
					label="Trigger Button"
					desc="Physical mouse button used to trigger the radial wheel"
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
			</div>

			{/* 4. Aiming & Sector Targeting */}
			<div className="setting-group-label">Aiming & Targeting Mode</div>
			<div className="setting-group">
				<div style={{ padding: "12px 14px 4px 14px" }}>
					<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
						Targeting Mechanics
					</span>
					<div className="rovyl-visual-grid">
						<div
							className={`rovyl-visual-card ${mouseSelectionMode === "area" ? "active" : ""}`}
							onClick={() => handleMouseSelectionModeChange("area")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Directional / Sector</span>
								<Compass size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								360° is divided into equal sectors. Moving the cursor anywhere in a slice's angle selects it instantly.
							</span>
						</div>

						<div
							className={`rovyl-visual-card ${mouseSelectionMode === "cursor" ? "active" : ""}`}
							onClick={() => handleMouseSelectionModeChange("cursor")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Direct Hover</span>
								<MousePointer size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								Requires pointer to reach the slice card boundary directly. Releasing in open space cancels.
							</span>
						</div>
					</div>
				</div>

				<SettingRow
					icon={Layers}
					label="Wedge Dividers"
					desc="Draw radial divider seams separating sectors outwards"
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

				<SettingRow
					icon={Hash}
					label="Number Badges"
					desc="Display 1-9 numeric index badges on each slice card"
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
					icon={Hash}
					label="Number Key Launch"
					desc="Press keys 1-9 on keyboard to immediately trigger matching slice"
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
					label="Workspace Peek"
					desc="Hovering a workspace button reveals its shortcuts without switching"
					divider={!mouseWorkspacePeek}
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
							desc="Display peeked shortcuts as a fan arc or full outer ring"
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
							desc={`Reveal shortcuts after ${mouseWorkspacePeekDelayMs} ms of hover`}
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

			{/* 5. Placement & Display */}
			<div className="setting-group-label">Placement & Display</div>
			<div className="setting-group">
				<div style={{ padding: "12px 14px 4px 14px" }}>
					<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
						Spawn Placement
					</span>
					<div className="rovyl-visual-grid">
						<div
							className={`rovyl-visual-card ${mousePlacement === "cursor" ? "active" : ""}`}
							onClick={() => handleMousePlacementChange("cursor")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Under Pointer</span>
								<Compass size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								Blooms centered exactly under the mouse cursor for minimal hand travel distance.
							</span>
						</div>

						<div
							className={`rovyl-visual-card ${mousePlacement === "center" ? "active" : ""}`}
							onClick={() => handleMousePlacementChange("center")}
						>
							<div className="rovyl-visual-card-header">
								<span className="rovyl-visual-card-title">Screen Center</span>
								<Monitor size={15} className="rovyl-visual-card-icon" />
							</div>
							<span className="rovyl-visual-card-desc">
								Always blooms in the exact center of the screen, regardless of where the mouse is.
							</span>
						</div>
					</div>
				</div>

				<SettingRow
					icon={Monitor}
					label="Target Monitor"
					desc="Which display the radial wheel opens on"
					divider={false}
				>
					<select
						className="settings-select"
						value={mouseMonitor}
						onChange={(e) =>
							handleMouseMonitorChange(e.target.value as "cursor" | "primary")
						}
					>
						<option value="cursor">Pointer's Display (Follow Mouse)</option>
						<option value="primary">Primary Display Only</option>
					</select>
				</SettingRow>
			</div>

			{/* 6. Workspaces & Shortcuts Manager */}
			<div className="setting-group-label">Workspaces & Shortcuts Manager</div>
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

			{/* 7. Hands-Free (Dwell) & Fullscreen Protection */}
			<div className="setting-group-label">Hands-Free & Fullscreen Protection</div>
			<div className="setting-group">
				<SettingRow
					icon={Play}
					label="Launch Without Clicking"
					desc="Holding aim in a slice's direction auto-launches it via dwell timer"
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
							desc="Responsiveness to small pointer movements during dwell"
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

				<SettingRow
					icon={Shield}
					label="Game Mode Protection"
					desc="Prevent accidental opening during fullscreen games & videos"
					divider={!mouseGameModeEnabled}
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
									desc="Automatically protect Steam, Epic, and Xbox games"
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
										className="settings-text-input"
										value={mouseGameModeBlockedApps}
										onChange={(e) =>
											handleMouseGameModeBlockedAppsChange(e.target.value)
										}
										placeholder="csgo.exe, valorant.exe"
										style={{ width: "220px" }}
									/>
								</SettingRow>
							</>
						)}
					</>
				)}
			</div>

			{/* 8. Audio & Feedback */}
			<div className="setting-group-label">Audio Feedback</div>
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

			{/* 9. Original Rovyl GitHub Gallery & Screenshots */}
			<div className="setting-group-label">Original Rovyl Reference Gallery</div>
			<div className="setting-group">
				<div style={{ padding: "14px 16px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
						<div>
							<div style={{ fontSize: "12px", fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
								Original Screenshots & Architecture
							</div>
							<div style={{ fontSize: "11px", color: "var(--bloom-text-muted, rgba(255, 255, 255, 0.5))" }}>
								Fetched directly from arshit09/rovyl on GitHub. Click any preview to inspect in full resolution.
							</div>
						</div>
						<a
							href="https://github.com/arshit09/rovyl"
							target="_blank"
							rel="noreferrer"
							className="settings-btn"
							style={{ textDecoration: "none", display: "inline-flex", gap: "5px" }}
						>
							<span>GitHub Repo</span>
							<ExternalLink size={11} />
						</a>
					</div>

					<div className="rovyl-gallery-grid">
						<div
							className="rovyl-gallery-card"
							onClick={() => setLightboxImage("/images/rovyl/wheel.png")}
						>
							<img
								src="/images/rovyl/wheel.png"
								alt="Rovyl Radial Wheel"
								className="rovyl-gallery-img"
								loading="lazy"
							/>
							<div className="rovyl-gallery-meta">
								<span className="rovyl-gallery-title">Radial Wheel UI</span>
								<span className="rovyl-gallery-desc">Original 360° hold-aim-release wheel</span>
							</div>
						</div>

						<div
							className="rovyl-gallery-card"
							onClick={() => setLightboxImage("/images/rovyl/settings.png")}
						>
							<img
								src="/images/rovyl/settings.png"
								alt="Rovyl Precision Settings"
								className="rovyl-gallery-img"
								loading="lazy"
							/>
							<div className="rovyl-gallery-meta">
								<span className="rovyl-gallery-title">Precision Settings</span>
								<span className="rovyl-gallery-desc">Complete original configuration UI</span>
							</div>
						</div>

						<div
							className="rovyl-gallery-card"
							onClick={() => setLightboxImage("/images/rovyl/workspaces.png")}
						>
							<img
								src="/images/rovyl/workspaces.png"
								alt="Rovyl Workspaces Manager"
								className="rovyl-gallery-img"
								loading="lazy"
							/>
							<div className="rovyl-gallery-meta">
								<span className="rovyl-gallery-title">Workspaces & Slices</span>
								<span className="rovyl-gallery-desc">App shortcuts & multi-workspace manager</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Lightbox Modal */}
			{lightboxImage && (
				<div
					className="rovyl-modal-backdrop"
					onClick={() => setLightboxImage(null)}
				>
					<div
						className="rovyl-modal-content"
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className="rovyl-modal-close"
							onClick={() => setLightboxImage(null)}
							title="Close"
						>
							<X size={18} />
						</button>
						<img
							src={lightboxImage}
							alt="Rovyl Original Screenshot"
							className="rovyl-modal-img"
						/>
					</div>
				</div>
			)}
		</>
	);
}
