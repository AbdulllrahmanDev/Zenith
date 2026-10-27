import { useState, useEffect, useMemo } from "react";
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
	FolderOpen,
	FileText,
	Globe,
	AppWindow,
	Cpu,
	ChevronUp,
	ChevronDown,
	CornerUpLeft,
	Search,
	Check,
	Palette,
	Sliders,
	FolderPlus,
	Edit3
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	DEFAULT_WORKSPACES,
	HOVER_COLOR_PRESETS,
	SYSTEM_ACTION_PRESETS,
	type RadialItem,
	type RadialWorkspace,
	type RadialItemType,
	type RadialWheelConfig
} from "../radial/types";
import { RADIAL_SOUNDS, playRadialSound, setRadialSoundVolume, isRadialSoundId, type RadialSoundId } from "../radial/radialSound";
import { getRadialIcon, RADIAL_ICON_NAMES } from "../radial/iconMap";
import { SmartIcon } from "../radial/SmartIcon";
import { RovylLogo } from "../radial/RovylLogo";
import { WheelPreview } from "../radial/WheelPreview";
import { SoundTryWheel } from "../radial/SoundTryWheel";

interface InstalledAppInfo {
	name: string;
	path: string;
	icon: string | null;
}

export interface MouseTabProps {
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
	mouseMenuRadius: number;
	handleMouseMenuRadiusChange: (val: number) => void;
	mouseIconSize: number;
	handleMouseIconSizeChange: (val: number) => void;
	mouseAppSpacing: number;
	handleMouseAppSpacingChange: (val: number) => void;
	mouseBackdropOpacity: number;
	handleMouseBackdropOpacityChange: (val: number) => void;
	mouseHoverColor: string;
	handleMouseHoverColorChange: (val: string) => void;
	mouseActivationThreshold: number;
	handleMouseActivationThresholdChange: (val: number) => void;
	mouseShowLabels: boolean;
	toggleMouseShowLabels: () => void;
	mouseAlwaysShowLabels: boolean;
	toggleMouseAlwaysShowLabels: () => void;
	mouseShowWorkspacePill: boolean;
	toggleMouseShowWorkspacePill: () => void;
	mouseOpenSound: string;
	handleMouseOpenSoundChange: (val: string) => void;
	mouseHoverSound: string;
	handleMouseHoverSoundChange: (val: string) => void;
}

type MouseSubTab = "workspaces" | "trigger" | "appearance" | "sound";
type AddSourceKind = "app" | "system" | "folder" | "url" | "submenu";

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
	handleMouseHoverSoundChange
}: MouseTabProps) {
	const [subTab, setSubTab] = useState<MouseSubTab>("workspaces");
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
	const [editingSubmenuId, setEditingSubmenuId] = useState<string | null>(null);
	const [renamingWs, setRenamingWs] = useState(false);
	const [wsNameDraft, setWsNameDraft] = useState("");

	// Add / Edit Item Drawer State
	const [showAddForm, setShowAddForm] = useState(false);
	const [addKind, setAddKind] = useState<AddSourceKind>("app");
	const [newItemLabel, setNewItemLabel] = useState("");
	const [newItemTarget, setNewItemTarget] = useState("");
	const [newItemType, setNewItemType] = useState<RadialItemType>("command");
	const [newItemIcon, setNewItemIcon] = useState("Sparkles");
	const [editingItemId, setEditingItemId] = useState<string | null>(null);

	// Installed Apps Picker
	const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
	const [loadingApps, setLoadingApps] = useState(false);
	const [appSearch, setAppSearch] = useState("");

	// Listen for recorded mouse button from backend hook
	useEffect(() => {
		const unlistenPromise = listen<string>("mouse-trigger-recorded", (event) => {
			setRecording(false);
			if (event.payload) {
				handleMouseTriggerButtonChange(event.payload);
			}
		});
		return () => {
			unlistenPromise.then((fn) => fn());
		};
	}, [handleMouseTriggerButtonChange]);

	// Load installed apps lazily when opening the Add App form
	useEffect(() => {
		if (!showAddForm || addKind !== "app" || installedApps.length > 0 || loadingApps) return;
		setLoadingApps(true);
		invoke<InstalledAppInfo[]>("get_installed_apps")
			.then((apps) => {
				if (Array.isArray(apps)) {
					const sorted = [...apps].sort((a, b) => a.name.localeCompare(b.name));
					setInstalledApps(sorted);
				}
			})
			.catch(() => {})
			.finally(() => setLoadingApps(false));
	}, [showAddForm, addKind, installedApps.length, loadingApps]);

	const filteredApps = useMemo(() => {
		const q = appSearch.trim().toLowerCase();
		if (!q) return installedApps.slice(0, 40);
		return installedApps.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 40);
	}, [installedApps, appSearch]);

	const wheelConfig: Partial<RadialWheelConfig> = useMemo(
		() => ({
			menuRadius: mouseMenuRadius,
			iconSize: mouseIconSize,
			appSpacing: mouseAppSpacing,
			backdropOpacity: mouseBackdropOpacity,
			hoverColor: mouseHoverColor,
			activationThreshold: mouseActivationThreshold,
			showLabels: mouseShowLabels,
			alwaysShowAppLabels: mouseAlwaysShowLabels,
			showWorkspacePill: mouseShowWorkspacePill,
			openSoundId: (isRadialSoundId(mouseOpenSound) ? mouseOpenSound : "sub-tick") as RadialSoundId,
			hoverSoundId: (isRadialSoundId(mouseHoverSound) ? mouseHoverSound : "sub-tick") as RadialSoundId
		}),
		[
			mouseMenuRadius,
			mouseIconSize,
			mouseAppSpacing,
			mouseBackdropOpacity,
			mouseHoverColor,
			mouseActivationThreshold,
			mouseShowLabels,
			mouseAlwaysShowLabels,
			mouseShowWorkspacePill,
			mouseOpenSound,
			mouseHoverSound
		]
	);

	const saveWorkspaces = (updated: RadialWorkspace[]) => {
		setWorkspaces(updated);
		const json = JSON.stringify(updated);
		localStorage.setItem("zenith-mouse-workspaces", json);
		invoke("save_setting", { key: "zenith-mouse-workspaces", value: json }).catch(() => {});
	};

	const currentWs = workspaces[selectedWsIndex] || workspaces[0] || DEFAULT_WORKSPACES[0];

	const activeSubmenuItem = useMemo(() => {
		if (!editingSubmenuId) return null;
		return currentWs.items.find((it) => it.id === editingSubmenuId && it.type === "submenu") || null;
	}, [currentWs.items, editingSubmenuId]);

	const displayedItems = activeSubmenuItem ? activeSubmenuItem.children || [] : currentWs.items;

	const updateDisplayedItems = (updater: (items: RadialItem[]) => RadialItem[]) => {
		const updated = workspaces.map((ws, idx) => {
			if (idx !== selectedWsIndex) return ws;
			if (activeSubmenuItem) {
				return {
					...ws,
					items: ws.items.map((it) =>
						it.id === activeSubmenuItem.id
							? { ...it, children: updater(it.children || []) }
							: it
					)
				};
			}
			return {
				...ws,
				items: updater(ws.items)
			};
		});
		saveWorkspaces(updated);
	};

	const handleDeleteItem = (itemId: string) => {
		updateDisplayedItems((items) => items.filter((it) => it.id !== itemId));
	};

	const handleMoveItem = (index: number, direction: -1 | 1) => {
		const targetIndex = index + direction;
		if (targetIndex < 0 || targetIndex >= displayedItems.length) return;
		updateDisplayedItems((items) => {
			const next = [...items];
			const [moved] = next.splice(index, 1);
			next.splice(targetIndex, 0, moved);
			return next;
		});
	};

	const openAddDrawer = (kind: AddSourceKind = "app") => {
		setEditingItemId(null);
		setAddKind(kind);
		setNewItemLabel("");
		setNewItemTarget("");
		if (kind === "app") {
			setNewItemType("command");
			setNewItemIcon("AppWindow");
		} else if (kind === "system") {
			const first = SYSTEM_ACTION_PRESETS[0];
			setNewItemType("system");
			setNewItemLabel(first.label);
			setNewItemTarget(first.target);
			setNewItemIcon(first.icon);
		} else if (kind === "folder") {
			setNewItemType("folder");
			setNewItemIcon("Folder");
		} else if (kind === "url") {
			setNewItemType("url");
			setNewItemTarget("https://");
			setNewItemIcon("Globe");
		} else if (kind === "submenu") {
			setNewItemType("submenu");
			setNewItemTarget("submenu");
			setNewItemIcon("Layers");
		}
		setShowAddForm(true);
	};

	const openEditDrawer = (item: RadialItem) => {
		setEditingItemId(item.id);
		setNewItemLabel(item.label);
		setNewItemTarget(item.target || "");
		setNewItemType(item.type);
		setNewItemIcon(item.icon || "Sparkles");
		if (item.type === "system") setAddKind("system");
		else if (item.type === "url") setAddKind("url");
		else if (item.type === "folder" || item.type === "file") setAddKind("folder");
		else if (item.type === "submenu") setAddKind("submenu");
		else setAddKind("app");
		setShowAddForm(true);
	};

	const handleSaveItem = () => {
		const label = newItemLabel.trim();
		const target = addKind === "submenu" ? "submenu" : newItemTarget.trim();
		if (!label || (!target && addKind !== "submenu")) return;

		if (editingItemId) {
			updateDisplayedItems((items) =>
				items.map((it) =>
					it.id === editingItemId
						? {
								...it,
								label,
								target,
								type: newItemType,
								icon: newItemIcon,
								useNativeIcon: newItemType === "command" || newItemType === "app"
							}
						: it
				)
			);
		} else {
			const newItem: RadialItem = {
				id: `item_${Date.now()}`,
				label,
				target,
				type: newItemType,
				icon: newItemIcon,
				useNativeIcon: newItemType === "command" || newItemType === "app",
				...(newItemType === "submenu" ? { children: [] } : null)
			};
			updateDisplayedItems((items) => [...items, newItem]);
		}

		setNewItemLabel("");
		setNewItemTarget("");
		setEditingItemId(null);
		setShowAddForm(false);
	};

	const handlePickInstalledApp = (app: InstalledAppInfo) => {
		setNewItemLabel(app.name);
		setNewItemTarget(app.path);
		setNewItemType("command");
		setNewItemIcon("AppWindow");
	};

	const handleBrowseExecutable = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: "Select Application or Shortcut",
				directory: false,
				multiple: false,
				filters: [{ name: "Applications", extensions: ["exe", "lnk", "bat", "cmd"] }]
			});
			if (typeof selected === "string") {
				const base = selected.split(/[\\/]/).pop() || selected;
				const cleanName = base.replace(/\.(exe|lnk|bat|cmd)$/i, "");
				setNewItemTarget(selected);
				if (!newItemLabel.trim()) setNewItemLabel(cleanName);
				setNewItemType("command");
			}
		} catch {}
	};

	const handleBrowseFolderOrFile = async (directory: boolean) => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: directory ? "Select Folder" : "Select File",
				directory,
				multiple: false
			});
			if (typeof selected === "string") {
				const base = selected.split(/[\\/]/).filter(Boolean).pop() || selected;
				setNewItemTarget(selected);
				if (!newItemLabel.trim()) setNewItemLabel(base);
				setNewItemType(directory ? "folder" : "file");
				setNewItemIcon(directory ? "Folder" : "FileText");
			}
		} catch {}
	};

	const handleAddWorkspace = () => {
		const newWs: RadialWorkspace = {
			id: `ws_${Date.now()}`,
			name: `Workspace ${workspaces.length + 1}`,
			icon: "Layers",
			enabled: true,
			items: [
				{ id: `it_${Date.now()}_1`, label: "Explorer", target: "explorer.exe", type: "command", icon: "Folder" },
				{ id: `it_${Date.now()}_2`, label: "Browser", target: "https://google.com", type: "url", icon: "Globe" },
				{ id: `it_${Date.now()}_3`, label: "Settings", target: "open_settings", type: "system", icon: "Settings" }
			]
		};
		const updated = [...workspaces, newWs];
		saveWorkspaces(updated);
		setSelectedWsIndex(updated.length - 1);
		setEditingSubmenuId(null);
	};

	const handleDeleteWorkspace = () => {
		if (workspaces.length <= 1) return;
		const updated = workspaces.filter((_, idx) => idx !== selectedWsIndex);
		saveWorkspaces(updated);
		setSelectedWsIndex(Math.max(0, selectedWsIndex - 1));
		setEditingSubmenuId(null);
	};

	const handleCommitRenameWs = () => {
		const trimmed = wsNameDraft.trim();
		setRenamingWs(false);
		if (!trimmed) return;
		const updated = workspaces.map((ws, idx) =>
			idx === selectedWsIndex ? { ...ws, name: trimmed } : ws
		);
		saveWorkspaces(updated);
	};

	const handleResetWorkspaces = () => {
		saveWorkspaces(DEFAULT_WORKSPACES);
		setSelectedWsIndex(0);
		setEditingSubmenuId(null);
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
		invoke("trigger_radial_menu").catch(() => {});
	};

	const formatTriggerLabel = (btn: string) => {
		const map: Record<string, string> = {
			middle: "Middle Click (Wheel)",
			x1: "Mouse 4 (Back)",
			x2: "Mouse 5 (Forward)",
			right: "Right Click",
			"Ctrl+middle": "Ctrl + Middle Click",
			"Alt+middle": "Alt + Middle Click",
			"Shift+middle": "Shift + Middle Click",
			"Ctrl+left": "Ctrl + Left Click",
			"Alt+left": "Alt + Left Click",
			"Ctrl+right": "Ctrl + Right Click",
			"Ctrl+x1": "Ctrl + Mouse 4",
			"Ctrl+x2": "Ctrl + Mouse 5"
		};
		return map[btn] || btn;
	};

	return (
		<div className="zn-mouse-tab-root">
			{/* Top Header Bar */}
			<div className="zn-mouse-header-card">
				<div className="zn-mouse-header-left">
					<div className="zn-mouse-logo-badge">
						<RovylLogo size={20} />
					</div>
					<div>
						<div className="zn-mouse-header-title">
							<span>Radial Mouse Launcher</span>
							<span className="zn-mouse-trigger-pill">{formatTriggerLabel(mouseTriggerButton)}</span>
						</div>
						<div className="zn-mouse-header-sub">
							Hold trigger, flick toward any slice in 360°, and release to launch
						</div>
					</div>
				</div>

				<div className="zn-mouse-header-actions">
					<button
						type="button"
						className="zn-mouse-test-btn"
						onClick={testRadialMenu}
						title="Open the live radial wheel now"
					>
						<Play size={12} fill="currentColor" />
						<span>Test Wheel</span>
					</button>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={mouseRadialEnabled}
							onChange={toggleMouseRadial}
						/>
						<span className="slider"></span>
					</label>
				</div>
			</div>

			{/* Sub-Navigation Pills */}
			<div className="zn-mouse-subnav">
				<button
					type="button"
					className={`zn-mouse-subnav-btn ${subTab === "workspaces" ? "active" : ""}`}
					onClick={() => setSubTab("workspaces")}
				>
					<Layers size={13} />
					<span>Workspaces</span>
				</button>
				<button
					type="button"
					className={`zn-mouse-subnav-btn ${subTab === "trigger" ? "active" : ""}`}
					onClick={() => setSubTab("trigger")}
				>
					<MousePointer size={13} />
					<span>Trigger & Aim</span>
				</button>
				<button
					type="button"
					className={`zn-mouse-subnav-btn ${subTab === "appearance" ? "active" : ""}`}
					onClick={() => setSubTab("appearance")}
				>
					<Palette size={13} />
					<span>Appearance</span>
				</button>
				<button
					type="button"
					className={`zn-mouse-subnav-btn ${subTab === "sound" ? "active" : ""}`}
					onClick={() => setSubTab("sound")}
				>
					<Volume2 size={13} />
					<span>Sound</span>
				</button>
			</div>

			{/* ───────────────── SUB-TAB 1: WORKSPACES & SHORTCUTS ───────────────── */}
			{subTab === "workspaces" && (
				<>
					{/* Workspace Selector Bar */}
					<div className="setting-group">
						<div className="zn-ws-manager-top">
							<div className="zn-ws-pills-scroll">
								{workspaces.map((ws, idx) => {
									const WsIcon = getRadialIcon(ws.icon);
									return (
										<button
											key={ws.id || idx}
											type="button"
											className={`zn-ws-pill-btn ${selectedWsIndex === idx ? "active" : ""}`}
											onClick={() => {
												setSelectedWsIndex(idx);
												setEditingSubmenuId(null);
												setShowAddForm(false);
												localStorage.setItem("zenith-mouse-active-workspace", ws.id);
												invoke("save_setting", {
													key: "zenith-mouse-active-workspace",
													value: ws.id
												}).catch(() => {});
											}}
										>
											<WsIcon size={12} strokeWidth={1.9} />
											<span>{ws.name}</span>
											<span className="zn-ws-pill-count">{ws.items.length}</span>
										</button>
									);
								})}
								<button
									type="button"
									className="zn-ws-pill-add"
									onClick={handleAddWorkspace}
									title="Add new workspace"
								>
									<Plus size={12} />
									<span>New</span>
								</button>
							</div>

							<div className="zn-ws-toolbar-right">
								{renamingWs ? (
									<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
										<input
											type="text"
											className="settings-text-input"
											value={wsNameDraft}
											onChange={(e) => setWsNameDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") handleCommitRenameWs();
												if (e.key === "Escape") setRenamingWs(false);
											}}
											style={{ width: 110, padding: "3px 7px", fontSize: 11 }}
											autoFocus
										/>
										<button
											type="button"
											className="settings-btn primary"
											onClick={handleCommitRenameWs}
											style={{ padding: "3px 7px" }}
										>
											<Check size={11} />
										</button>
									</div>
								) : (
									<button
										type="button"
										className="zn-icon-action-btn"
										onClick={() => {
											setWsNameDraft(currentWs.name);
											setRenamingWs(true);
										}}
										title="Rename workspace"
									>
										<Edit3 size={12} />
									</button>
								)}
								{workspaces.length > 1 && (
									<button
										type="button"
										className="zn-icon-action-btn danger"
										onClick={handleDeleteWorkspace}
										title="Delete workspace"
									>
										<Trash2 size={12} />
									</button>
								)}
								<button
									type="button"
									className="zn-icon-action-btn"
									onClick={handleResetWorkspaces}
									title="Reset all workspaces to defaults"
								>
									<RotateCcw size={12} />
								</button>
							</div>
						</div>

						{/* Interactive Wheel Preview + Slice List Split */}
						<div className="zn-ws-split-layout">
							<div className="zn-ws-preview-col">
								<WheelPreview
									items={displayedItems}
									config={wheelConfig}
									areaWedges={mouseAreaWedges}
									workspaceName={activeSubmenuItem ? activeSubmenuItem.label : currentWs.name}
									size={226}
								/>
							</div>

							<div className="zn-ws-list-col">
								{activeSubmenuItem && (
									<div className="zn-submenu-breadcrumb">
										<button
											type="button"
											className="zn-submenu-back-btn"
											onClick={() => setEditingSubmenuId(null)}
										>
											<CornerUpLeft size={12} />
											<span>Back to {currentWs.name}</span>
										</button>
										<span className="zn-submenu-title">
											Folder: <strong>{activeSubmenuItem.label}</strong>
										</span>
									</div>
								)}

								<div className="zn-slice-list">
									{displayedItems.length === 0 ? (
										<div className="zn-slice-empty">
											No shortcuts yet. Click one of the buttons below to add an app, folder, or action.
										</div>
									) : (
										displayedItems.map((item, index) => {
											const isSubmenu = item.type === "submenu";
											return (
												<div key={item.id || index} className="zn-slice-row">
													<div className="zn-slice-row-left">
														<span className="zn-slice-index">{index + 1}</span>
														<div className="zn-slice-icon-plate">
															<SmartIcon item={item} size={28} />
														</div>
														<div className="zn-slice-meta">
															<span className="zn-slice-name">{item.label}</span>
															<span className="zn-slice-target">
																{isSubmenu
																	? `${(item.children || []).length} nested items`
																	: item.target}
															</span>
														</div>
													</div>

													<div className="zn-slice-row-actions">
														{isSubmenu && (
															<button
																type="button"
																className="zn-slice-open-folder-btn"
																onClick={() => setEditingSubmenuId(item.id)}
																title="Edit folder contents"
															>
																<span>Items ({(item.children || []).length})</span>
															</button>
														)}
														<button
															type="button"
															className="zn-icon-action-btn"
															onClick={() => handleMoveItem(index, -1)}
															disabled={index === 0}
															title="Move up"
														>
															<ChevronUp size={12} />
														</button>
														<button
															type="button"
															className="zn-icon-action-btn"
															onClick={() => handleMoveItem(index, 1)}
															disabled={index === displayedItems.length - 1}
															title="Move down"
														>
															<ChevronDown size={12} />
														</button>
														<button
															type="button"
															className="zn-icon-action-btn"
															onClick={() => openEditDrawer(item)}
															title="Edit shortcut"
														>
															<Edit3 size={12} />
														</button>
														<button
															type="button"
															className="zn-icon-action-btn danger"
															onClick={() => handleDeleteItem(item.id)}
															title="Remove shortcut"
														>
															<Trash2 size={12} />
														</button>
													</div>
												</div>
											);
										})
									)}
								</div>

								{/* Quick Add Bar */}
								{!showAddForm && (
									<div className="zn-quick-add-bar">
										<button
											type="button"
											className="zn-quick-add-btn primary"
											onClick={() => openAddDrawer("app")}
										>
											<AppWindow size={12} />
											<span>+ App</span>
										</button>
										<button
											type="button"
											className="zn-quick-add-btn"
											onClick={() => openAddDrawer("system")}
										>
											<Cpu size={12} />
											<span>+ System</span>
										</button>
										<button
											type="button"
											className="zn-quick-add-btn"
											onClick={() => openAddDrawer("folder")}
										>
											<FolderOpen size={12} />
											<span>+ Folder/File</span>
										</button>
										<button
											type="button"
											className="zn-quick-add-btn"
											onClick={() => openAddDrawer("url")}
										>
											<Globe size={12} />
											<span>+ URL</span>
										</button>
										{!activeSubmenuItem && (
											<button
												type="button"
												className="zn-quick-add-btn"
												onClick={() => openAddDrawer("submenu")}
											>
												<FolderPlus size={12} />
												<span>+ Submenu</span>
											</button>
										)}
									</div>
								)}
							</div>
						</div>

						{/* Add / Edit Shortcut Drawer */}
						{showAddForm && (
							<div className="zn-add-drawer">
								<div className="zn-add-drawer-tabs">
									{(
										[
											{ id: "app", label: "App", icon: AppWindow },
											{ id: "system", label: "System Action", icon: Cpu },
											{ id: "folder", label: "Folder / File", icon: FolderOpen },
											{ id: "url", label: "Web URL", icon: Globe },
											...(!activeSubmenuItem
												? [{ id: "submenu", label: "Submenu Folder", icon: FolderPlus }]
												: [])
										] as { id: AddSourceKind; label: string; icon: typeof AppWindow }[]
									).map(({ id, label, icon: Icon }) => (
										<button
											key={id}
											type="button"
											className={`zn-add-kind-btn ${addKind === id ? "active" : ""}`}
											onClick={() => {
												setAddKind(id);
												if (id === "app") setNewItemType("command");
												else if (id === "system") {
													setNewItemType("system");
													if (!newItemTarget) {
														setNewItemLabel(SYSTEM_ACTION_PRESETS[0].label);
														setNewItemTarget(SYSTEM_ACTION_PRESETS[0].target);
														setNewItemIcon(SYSTEM_ACTION_PRESETS[0].icon);
													}
												} else if (id === "folder") setNewItemType("folder");
												else if (id === "url") setNewItemType("url");
												else if (id === "submenu") {
													setNewItemType("submenu");
													setNewItemTarget("submenu");
													setNewItemIcon("Layers");
												}
											}}
										>
											<Icon size={12} />
											<span>{label}</span>
										</button>
									))}
								</div>

								{/* Source-Specific Picker */}
								{addKind === "app" && (
									<div className="zn-app-picker-section">
										<div className="zn-app-picker-search-row">
											<div className="zn-app-search-box">
												<Search size={12} />
												<input
													type="text"
													placeholder="Search installed Windows apps..."
													value={appSearch}
													onChange={(e) => setAppSearch(e.target.value)}
												/>
											</div>
											<button
												type="button"
												className="settings-btn"
												onClick={handleBrowseExecutable}
											>
												<FolderOpen size={12} />
												<span>Browse .exe</span>
											</button>
										</div>

										<div className="zn-installed-apps-grid">
											{loadingApps ? (
												<div className="zn-apps-loading">Scanning installed applications...</div>
											) : filteredApps.length === 0 ? (
												<div className="zn-apps-loading">No matching apps found. Use Browse .exe or type path below.</div>
											) : (
												filteredApps.map((app) => (
													<button
														key={app.path}
														type="button"
														className={`zn-installed-app-chip ${
															newItemTarget === app.path ? "selected" : ""
														}`}
														onClick={() => handlePickInstalledApp(app)}
													>
														{app.icon ? (
															<img src={app.icon} alt="" />
														) : (
															<AppWindow size={14} />
														)}
														<span>{app.name}</span>
													</button>
												))
											)}
										</div>
									</div>
								)}

								{addKind === "system" && (
									<div className="zn-system-presets-grid">
										{SYSTEM_ACTION_PRESETS.map((preset) => {
											const PIcon = getRadialIcon(preset.icon);
											const selected = newItemTarget === preset.target;
											return (
												<button
													key={preset.target}
													type="button"
													className={`zn-system-preset-chip ${selected ? "selected" : ""}`}
													onClick={() => {
														setNewItemLabel(preset.label);
														setNewItemTarget(preset.target);
														setNewItemType("system");
														setNewItemIcon(preset.icon);
													}}
												>
													<PIcon size={13} />
													<span>{preset.label}</span>
												</button>
											);
										})}
									</div>
								)}

								{addKind === "folder" && (
									<div style={{ display: "flex", gap: 8 }}>
										<button
											type="button"
											className="settings-btn"
											onClick={() => handleBrowseFolderOrFile(true)}
											style={{ flex: 1, justifyContent: "center" }}
										>
											<FolderOpen size={13} />
											<span>Choose Folder...</span>
										</button>
										<button
											type="button"
											className="settings-btn"
											onClick={() => handleBrowseFolderOrFile(false)}
											style={{ flex: 1, justifyContent: "center" }}
										>
											<FileText size={13} />
											<span>Choose File...</span>
										</button>
									</div>
								)}

								{/* Common Label + Target + Icon Row */}
								<div className="zn-add-fields-row">
									<input
										type="text"
										className="settings-text-input"
										placeholder="Label (e.g. Chrome, Work Tools)"
										value={newItemLabel}
										onChange={(e) => setNewItemLabel(e.target.value)}
										style={{ flex: "1 1 36%" }}
									/>
									{addKind !== "submenu" && (
										<input
											type="text"
											className="settings-text-input"
											placeholder={
												addKind === "url"
													? "https://example.com"
													: "Path, command, or action ID"
											}
											value={newItemTarget}
											onChange={(e) => setNewItemTarget(e.target.value)}
											style={{ flex: "1 1 44%" }}
										/>
									)}
									<select
										className="settings-select"
										value={newItemIcon}
										onChange={(e) => setNewItemIcon(e.target.value)}
										style={{ minWidth: 105 }}
										title="Fallback Icon"
									>
										{RADIAL_ICON_NAMES.map((ic) => (
											<option key={ic} value={ic}>
												{ic}
											</option>
										))}
									</select>
								</div>

								<div className="zn-add-drawer-footer">
									<button
										type="button"
										className="settings-btn"
										onClick={() => {
											setShowAddForm(false);
											setEditingItemId(null);
										}}
									>
										Cancel
									</button>
									<button
										type="button"
										className="zn-mouse-test-btn"
										onClick={handleSaveItem}
										disabled={!newItemLabel.trim() || (!newItemTarget.trim() && addKind !== "submenu")}
									>
										<Check size={12} />
										<span>{editingItemId ? "Save Changes" : "Add to Wheel"}</span>
									</button>
								</div>
							</div>
						)}
					</div>
				</>
			)}

			{/* ───────────────── SUB-TAB 2: APPEARANCE & GEOMETRY ───────────────── */}
			{subTab === "appearance" && (
				<div className="setting-group">
					<div className="zn-appearance-split">
						<div className="zn-appearance-preview-sticky">
							<WheelPreview
								items={currentWs.items}
								config={wheelConfig}
								areaWedges={mouseAreaWedges}
								workspaceName={currentWs.name}
								size={236}
							/>
						</div>

						<div className="zn-appearance-controls">
							{/* Hover Accent Swatches */}
							<div className="zn-control-block">
								<div className="zn-control-block-header">
									<span>Hover Highlight Color</span>
									<span className="zn-control-val">{mouseHoverColor.toUpperCase()}</span>
								</div>
								<div className="zn-color-swatch-row">
									{HOVER_COLOR_PRESETS.map((preset) => (
										<button
											key={preset.value}
											type="button"
											title={preset.label}
											className={`zn-color-swatch ${
												mouseHoverColor.toLowerCase() === preset.value.toLowerCase()
													? "active"
													: ""
											}`}
											style={{ background: preset.value }}
											onClick={() => handleMouseHoverColorChange(preset.value)}
										/>
									))}
									<label className="zn-color-custom-picker" title="Custom Hex Color">
										<input
											type="color"
											value={mouseHoverColor}
											onChange={(e) => handleMouseHoverColorChange(e.target.value)}
										/>
										<span>Custom</span>
									</label>
								</div>
							</div>

							{/* Geometry Sliders in Responsive Grid */}
							<div className="zn-controls-grid-2">
								<div className="zn-control-block">
									<div className="zn-control-block-header">
										<span>Wheel Radius</span>
										<span className="zn-control-val">{mouseMenuRadius} px</span>
									</div>
									<input
										type="range"
										min="80"
										max="210"
										step="2"
										value={mouseMenuRadius}
										onChange={(e) => handleMouseMenuRadiusChange(parseInt(e.target.value, 10))}
										className="settings-slider"
										style={{ width: "100%" }}
									/>
								</div>

								<div className="zn-control-block">
									<div className="zn-control-block-header">
										<span>Tile Size</span>
										<span className="zn-control-val">{mouseIconSize} px</span>
									</div>
									<input
										type="range"
										min="40"
										max="76"
										step="2"
										value={mouseIconSize}
										onChange={(e) => handleMouseIconSizeChange(parseInt(e.target.value, 10))}
										className="settings-slider"
										style={{ width: "100%" }}
									/>
								</div>

								<div className="zn-control-block">
									<div className="zn-control-block-header">
										<span>Tile Spacing</span>
										<span className="zn-control-val">{mouseAppSpacing} px</span>
									</div>
									<input
										type="range"
										min="4"
										max="28"
										step="2"
										value={mouseAppSpacing}
										onChange={(e) => handleMouseAppSpacingChange(parseInt(e.target.value, 10))}
										className="settings-slider"
										style={{ width: "100%" }}
									/>
								</div>

								<div className="zn-control-block">
									<div className="zn-control-block-header">
										<span>Center Dead-Zone</span>
										<span className="zn-control-val">{mouseActivationThreshold} px</span>
									</div>
									<input
										type="range"
										min="36"
										max="96"
										step="2"
										value={mouseActivationThreshold}
										onChange={(e) =>
											handleMouseActivationThresholdChange(parseInt(e.target.value, 10))
										}
										className="settings-slider"
										style={{ width: "100%" }}
									/>
								</div>

								<div className="zn-control-block" style={{ gridColumn: "1 / -1" }}>
									<div className="zn-control-block-header">
										<span>Scrim Backdrop Darkness</span>
										<span className="zn-control-val">{Math.round(mouseBackdropOpacity * 100)}%</span>
									</div>
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										value={mouseBackdropOpacity}
										onChange={(e) => handleMouseBackdropOpacityChange(parseFloat(e.target.value))}
										className="settings-slider"
										style={{ width: "100%" }}
									/>
								</div>
							</div>
						</div>
					</div>

					<SettingRow
						icon={Layers}
						label="Radial Sector Wedges"
						desc="Render illuminated sector beams and seam dividers behind slices"
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
						icon={Sparkles}
						label="Show Shortcut Labels"
						desc="Display ray-aligned outer pill labels around the wheel"
					>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={mouseShowLabels}
								onChange={toggleMouseShowLabels}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>

					{mouseShowLabels && (
						<SettingRow
							icon={Sparkles}
							label="Always Show All Labels"
							desc="Keep every shortcut label visible instead of only the hovered slice"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={mouseAlwaysShowLabels}
									onChange={toggleMouseAlwaysShowLabels}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>
					)}

					<SettingRow
						icon={Hash}
						label="Number Badges (1–9)"
						desc="Show circular 1–9 shortcut badges on the top-left of tiles"
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
						label="Workspace Switcher Pill"
						desc="Show the workspace tab bar below the wheel when multiple workspaces exist"
						divider={false}
					>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={mouseShowWorkspacePill}
								onChange={toggleMouseShowWorkspacePill}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>
				</div>
			)}

			{/* ───────────────── SUB-TAB 3: TRIGGER & AIMING ───────────────── */}
			{subTab === "trigger" && (
				<>
					<div className="setting-group">
						<SettingRow
							icon={Sparkles}
							label="Trigger Mouse Button"
							desc="Physical mouse button or modifier combo that opens the wheel"
						>
							<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<select
									className="settings-select"
									value={mouseTriggerButton}
									onChange={(e) => handleMouseTriggerButtonChange(e.target.value)}
									disabled={recording}
									style={{ minWidth: 165 }}
								>
									<option value="middle">Middle Click (Wheel)</option>
									<option value="x1">Mouse 4 (Back)</option>
									<option value="x2">Mouse 5 (Forward)</option>
									<option value="Ctrl+middle">Ctrl + Middle</option>
									<option value="Alt+middle">Alt + Middle</option>
									<option value="Shift+middle">Shift + Middle</option>
									<option value="Ctrl+right">Ctrl + Right Click</option>
									<option value="Ctrl+x1">Ctrl + Mouse 4</option>
									<option value="Ctrl+x2">Ctrl + Mouse 5</option>
								</select>
								<button
									type="button"
									className={`settings-btn ${recording ? "primary" : ""}`}
									onClick={handleRecordClick}
								>
									{recording ? "Press Button..." : "Record"}
								</button>
							</div>
						</SettingRow>

						<div style={{ padding: "10px 14px 4px 14px" }}>
							<span style={{ fontSize: 11, fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
								Gesture Mode
							</span>
							<div className="rovyl-visual-grid">
								<div
									className={`rovyl-visual-card ${mouseTriggerMode === "hold" ? "active" : ""}`}
									onClick={() => handleMouseTriggerModeChange("hold")}
								>
									<div className="rovyl-visual-card-header">
										<span className="rovyl-visual-card-title">Hold, Flick & Release</span>
										<Hand size={15} className="rovyl-visual-card-icon" />
									</div>
									<span className="rovyl-visual-card-desc">
										Hold the trigger button, aim in any direction, and release to launch immediately. Quick stationary tap passes the normal click through.
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
										Click once to open the wheel, then left-click any slice to launch or click the center hub to dismiss.
									</span>
								</div>
							</div>
						</div>

						<div style={{ padding: "4px 14px 4px 14px" }}>
							<span style={{ fontSize: 11, fontWeight: 600, color: "var(--bloom-text, #fff)" }}>
								Aiming Mechanics
							</span>
							<div className="rovyl-visual-grid">
								<div
									className={`rovyl-visual-card ${mouseSelectionMode === "area" ? "active" : ""}`}
									onClick={() => handleMouseSelectionModeChange("area")}
								>
									<div className="rovyl-visual-card-header">
										<span className="rovyl-visual-card-title">360° Directional Sector</span>
										<Compass size={15} className="rovyl-visual-card-icon" />
									</div>
									<span className="rovyl-visual-card-desc">
										Moving outside the center dead-zone selects the slice in that angular sector, even at the edge of the screen.
									</span>
								</div>

								<div
									className={`rovyl-visual-card ${mouseSelectionMode === "cursor" ? "active" : ""}`}
									onClick={() => handleMouseSelectionModeChange("cursor")}
								>
									<div className="rovyl-visual-card-header">
										<span className="rovyl-visual-card-title">Direct Tile Hover</span>
										<MousePointer size={15} className="rovyl-visual-card-icon" />
									</div>
									<span className="rovyl-visual-card-desc">
										Only highlights a shortcut when the cursor is directly over its tile plate.
									</span>
								</div>
							</div>
						</div>

						<SettingRow
							icon={Compass}
							label="Spawn Position"
							desc="Open centered under the mouse pointer or at the center of the monitor"
						>
							<select
								className="settings-select"
								value={mousePlacement}
								onChange={(e) =>
									handleMousePlacementChange(e.target.value as "cursor" | "center")
								}
							>
								<option value="cursor">Under Mouse Pointer</option>
								<option value="center">Center of Screen</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Monitor}
							label="Target Display"
							desc="Which monitor the radial wheel appears on"
						>
							<select
								className="settings-select"
								value={mouseMonitor}
								onChange={(e) =>
									handleMouseMonitorChange(e.target.value as "cursor" | "primary")
								}
							>
								<option value="cursor">Follow Mouse Pointer</option>
								<option value="primary">Primary Monitor Only</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Hash}
							label="1–9 Keyboard Quick Launch"
							desc="Pressing number keys 1–9 while the wheel is open launches that slice"
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
							label="Workspace Peek on Hover"
							desc="Hovering another workspace pill previews its items without losing your place"
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
									label="Peek Layout"
									desc="Preview style when hovering a workspace tab"
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
										<option value="fan">Compact Card</option>
										<option value="ring">Expanded List</option>
									</select>
								</SettingRow>
								<SettingRow
									icon={Sliders}
									label="Peek Hover Delay"
									desc={`Show preview after ${mouseWorkspacePeekDelayMs} ms`}
									divider={false}
								>
									<input
										type="range"
										min="100"
										max="600"
										step="40"
										value={mouseWorkspacePeekDelayMs}
										onChange={(e) =>
											handleMouseWorkspacePeekDelayMsChange(parseInt(e.target.value, 10))
										}
										className="settings-slider"
									/>
								</SettingRow>
							</>
						)}
					</div>

					{/* Hands-Free Dwell Launch */}
					<div className="setting-group">
						<SettingRow
							icon={Play}
							label="Hands-Free Dwell Launch"
							desc="Auto-trigger the aimed slice when holding still, without releasing or clicking"
							divider={mouseInstantActivate === "dwell"}
						>
							<select
								className="settings-select"
								value={mouseInstantActivate}
								onChange={(e) =>
									handleMouseInstantActivateChange(e.target.value as "off" | "dwell")
								}
							>
								<option value="off">Disabled</option>
								<option value="dwell">Enabled (Dwell Ring)</option>
							</select>
						</SettingRow>

						{mouseInstantActivate === "dwell" && (
							<>
								<SettingRow
									icon={Hand}
									label="Dwell Hold Time"
									desc={`Trigger after holding aim for ${mouseInstantDwellMs} ms`}
								>
									<input
										type="range"
										min="160"
										max="900"
										step="20"
										value={mouseInstantDwellMs}
										onChange={(e) =>
											handleMouseInstantDwellMsChange(parseInt(e.target.value, 10))
										}
										className="settings-slider"
									/>
								</SettingRow>

								<SettingRow
									icon={Compass}
									label="Settle Sensitivity"
									desc="How still the cursor must be before the dwell progress ring starts"
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
										<option value="low">Strict (Low Jitter)</option>
										<option value="medium">Balanced (Medium)</option>
										<option value="high">Fast (High Tolerance)</option>
									</select>
								</SettingRow>
							</>
						)}
					</div>

					{/* Fullscreen Gaming Protection */}
					<div className="setting-group">
						<SettingRow
							icon={Shield}
							label="Fullscreen Game Mode Protection"
							desc="Automatically suppress the radial wheel while playing fullscreen games"
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
									desc="Suppress in all fullscreen apps or only specific games"
								>
									<select
										className="settings-select"
										value={mouseGameModeScope}
										onChange={(e) =>
											handleMouseGameModeScopeChange(e.target.value as "all" | "list")
										}
									>
										<option value="all">All Fullscreen Applications</option>
										<option value="list">Blocked Executables List Only</option>
									</select>
								</SettingRow>

								{mouseGameModeScope === "list" && (
									<>
										<SettingRow
											icon={Shield}
											label="Auto-Detect Game Launchers"
											desc="Automatically suppress in Steam, Epic Games, Riot, and Xbox games"
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
											desc="Comma-separated process names (e.g. csgo.exe, valorant.exe)"
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
												style={{ width: 210 }}
											/>
										</SettingRow>
									</>
								)}
							</>
						)}
					</div>
				</>
			)}

			{/* ───────────────── SUB-TAB 4: PROCEDURAL SOUND ENGINE ───────────────── */}
			{subTab === "sound" && (
				<div className="setting-group">
					<SettingRow
						icon={Volume2}
						label="Synthesized Haptic Audio"
						desc="Zero-latency WebAudio procedural sound cues on wheel bloom and slice hover"
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
						<>
							<SettingRow
								icon={Volume2}
								label="Master Volume"
								desc={`Output level: ${mouseSoundVolume}%`}
							>
								<input
									type="range"
									min="10"
									max="100"
									step="5"
									value={mouseSoundVolume}
									onChange={(e) => {
										const v = parseInt(e.target.value, 10);
										setRadialSoundVolume(v);
										handleMouseSoundVolumeChange(v);
									}}
									className="settings-slider"
								/>
							</SettingRow>

							<SettingRow
								icon={Sparkles}
								label="Wheel Open Voice"
								desc="Synthesizer voice played when the radial menu blooms"
							>
								<select
									className="settings-select"
									value={mouseOpenSound}
									onChange={(e) => {
										const val = e.target.value;
										handleMouseOpenSoundChange(val);
										if (isRadialSoundId(val)) playRadialSound(val);
									}}
								>
									<option value="off">Silent (Off)</option>
									{RADIAL_SOUNDS.map((s) => (
										<option key={s.id} value={s.id}>
											{s.name}
										</option>
									))}
								</select>
							</SettingRow>

							<SettingRow
								icon={Compass}
								label="Slice Hover Voice"
								desc="Synthesizer voice played as you sweep across slices"
							>
								<select
									className="settings-select"
									value={mouseHoverSound}
									onChange={(e) => {
										const val = e.target.value;
										handleMouseHoverSoundChange(val);
										if (isRadialSoundId(val)) playRadialSound(val);
									}}
								>
									<option value="off">Silent (Off)</option>
									{RADIAL_SOUNDS.map((s) => (
										<option key={s.id} value={s.id}>
											{s.name}
										</option>
									))}
								</select>
							</SettingRow>

							<div style={{ padding: "12px 14px" }}>
								<SoundTryWheel
									openSoundId={
										(isRadialSoundId(mouseOpenSound) ? mouseOpenSound : "off") as
											| RadialSoundId
											| "off"
									}
									hoverSoundId={
										(isRadialSoundId(mouseHoverSound) ? mouseHoverSound : "off") as
											| RadialSoundId
											| "off"
									}
									soundEnabled={mouseSoundEnabled}
									hoverColor={mouseHoverColor}
								/>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
