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
	Sparkles
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

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
