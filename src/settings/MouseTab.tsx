import { useState, useEffect, useMemo, useRef } from "react";
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
	Edit3,
	X,
	Upload,
	Image as ImageIcon
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
import { ZenithLogo } from "../radial/ZenithLogo";
import { WheelPreview } from "../radial/WheelPreview";
import { SoundTryWheel } from "../radial/SoundTryWheel";

interface InstalledAppInfo {
	name: string;
	path: string;
	icon: string | null;
}

const QUICK_FOLDER_PRESETS: { label: string; target: string; icon: string }[] = [
	{ label: "Desktop", target: "shell:Desktop", icon: "Monitor" },
	{ label: "Downloads", target: "shell:Downloads", icon: "FolderOpen" },
	{ label: "Documents", target: "shell:Personal", icon: "FileText" },
	{ label: "Pictures", target: "shell:My Pictures", icon: "Image" },
	{ label: "Videos", target: "shell:My Video", icon: "Video" },
	{ label: "Music", target: "shell:My Music", icon: "Music" },
	{ label: "C: Drive", target: "C:\\", icon: "HardDrive" }
];

const WEB_URL_PRESETS: { label: string; target: string; icon: string; domain: string }[] = [
	{ label: "Google", target: "https://www.google.com", icon: "Search", domain: "google.com" },
	{ label: "YouTube", target: "https://www.youtube.com", icon: "Video", domain: "youtube.com" },
	{ label: "GitHub", target: "https://github.com", icon: "Code", domain: "github.com" },
	{ label: "ChatGPT", target: "https://chatgpt.com", icon: "Sparkles", domain: "chatgpt.com" },
	{ label: "Reddit", target: "https://reddit.com", icon: "MessageCircle", domain: "reddit.com" },
	{ label: "Twitter / X", target: "https://x.com", icon: "Globe", domain: "x.com" },
	{ label: "Notion", target: "https://notion.so", icon: "BookOpen", domain: "notion.so" },
	{ label: "Spotify Web", target: "https://open.spotify.com", icon: "Music", domain: "spotify.com" }
];

function guessIconForName(name: string): string {
	const n = name.toLowerCase();
	if (n.includes("chrome") || n.includes("edge") || n.includes("firefox") || n.includes("brave") || n.includes("browser")) return "Globe";
	if (n.includes("terminal") || n.includes("powershell") || n.includes("cmd") || n.includes("prompt")) return "Terminal";
	if (n.includes("code") || n.includes("studio") || n.includes("ide") || n.includes("git") || n.includes("cursor")) return "Code";
	if (n.includes("calc")) return "Calculator";
	if (n.includes("camera")) return "Camera";
	if (n.includes("music") || n.includes("spotify")) return "Music";
	if (n.includes("video") || n.includes("media") || n.includes("vlc") || n.includes("player")) return "Video";
	if (n.includes("setting") || n.includes("control")) return "Settings";
	if (n.includes("folder") || n.includes("explorer") || n.includes("file")) return "Folder";
	if (n.includes("mail") || n.includes("outlook")) return "Mail";
	if (n.includes("discord") || n.includes("slack") || n.includes("chat") || n.includes("telegram")) return "MessageCircle";
	if (n.includes("paint") || n.includes("photo") || n.includes("image") || n.includes("figma")) return "Image";
	return "AppWindow";
}

const WS_PRESET_ICONS = [
	"Sparkles",
	"Music",
	"Wrench",
	"Code",
	"Gamepad2",
	"Layers",
	"Folder",
	"Globe",
	"Terminal",
	"Camera",
	"Video",
	"Monitor",
	"Briefcase",
	"Activity",
	"Settings",
	"Bell",
	"Star",
	"Zap",
	"Cpu",
	"FileText",
	"Compass",
	"Scissors",
	"Volume2"
];

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
	const [newItemCustomIconUrl, setNewItemCustomIconUrl] = useState("");
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const customIconFileRef = useRef<HTMLInputElement | null>(null);
	const wsIconFileInputRef = useRef<HTMLInputElement | null>(null);
	const [showWsIconPicker, setShowWsIconPicker] = useState(false);

	const handleCustomIconFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async () => {
			const dataUri = reader.result as string;
			try {
				const cacheKey = `radial_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
				const optimized = await invoke<string>("set_custom_icon", {
					cacheKey,
					iconData: dataUri
				});
				setNewItemCustomIconUrl(optimized);
			} catch {
				setNewItemCustomIconUrl(dataUri);
			}
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const handleWsCustomIconFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async () => {
			const dataUri = reader.result as string;
			try {
				const cacheKey = `ws_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
				const optimized = await invoke<string>("set_custom_icon", {
					cacheKey,
					iconData: dataUri
				});
				const updated = workspaces.map((ws, idx) =>
					idx === selectedWsIndex ? { ...ws, customIconUrl: optimized } : ws
				);
				saveWorkspaces(updated);
			} catch {
				const updated = workspaces.map((ws, idx) =>
					idx === selectedWsIndex ? { ...ws, customIconUrl: dataUri } : ws
				);
				saveWorkspaces(updated);
			}
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const handleSelectWsIcon = (iconName: string) => {
		const updated = workspaces.map((ws, idx) =>
			idx === selectedWsIndex ? { ...ws, icon: iconName, customIconUrl: undefined } : ws
		);
		saveWorkspaces(updated);
	};

	const handleClearWsCustomIcon = () => {
		const updated = workspaces.map((ws, idx) =>
			idx === selectedWsIndex ? { ...ws, customIconUrl: undefined } : ws
		);
		saveWorkspaces(updated);
	};

	// Installed Apps Picker & Native Icon Cache
	const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
	const [appIcons, setAppIcons] = useState<Record<string, string>>({});
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
		if (!q) return installedApps.slice(0, 80);
		return installedApps.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 80);
	}, [installedApps, appSearch]);

	// Fetch native Windows icons for visible installed apps in batch
	useEffect(() => {
		if (filteredApps.length === 0) return;
		let active = true;
		const targets = filteredApps.filter((a) => !appIcons[a.path]);
		if (targets.length === 0) return;

		Promise.all(
			targets.map(async (app) => {
				try {
					const icon = await invoke<string | null>("get_app_icon", {
						path: app.path,
						name: app.name,
						hwnd: null
					});
					return [app.path, icon] as const;
				} catch {
					return [app.path, null] as const;
				}
			})
		).then((pairs) => {
			if (!active) return;
			const batch: Record<string, string> = {};
			for (const [path, icon] of pairs) {
				if (icon) batch[path] = icon;
			}
			if (Object.keys(batch).length > 0) {
				setAppIcons((prev) => ({ ...prev, ...batch }));
			}
		});

		return () => {
			active = false;
		};
	}, [filteredApps, appIcons]);

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
		setNewItemCustomIconUrl("");
		if (kind === "app") {
			setNewItemType("app");
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
		setNewItemCustomIconUrl(item.customIconUrl || "");
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
								customIconUrl: newItemCustomIconUrl.trim() || undefined,
								useNativeIcon:
									newItemType === "command" ||
									newItemType === "app" ||
									newItemType === "file" ||
									newItemType === "folder"
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
				...(newItemCustomIconUrl.trim() ? { customIconUrl: newItemCustomIconUrl.trim() } : null),
				useNativeIcon:
					newItemType === "command" ||
					newItemType === "app" ||
					newItemType === "file" ||
					newItemType === "folder",
				...(newItemType === "submenu" ? { children: [] } : null)
			};
			updateDisplayedItems((items) => [...items, newItem]);
		}

		setNewItemLabel("");
		setNewItemTarget("");
		setNewItemCustomIconUrl("");
		setEditingItemId(null);
		setShowAddForm(false);
	};

	const handlePickInstalledApp = (app: InstalledAppInfo) => {
		setNewItemLabel(app.name);
		setNewItemTarget(app.path);
		setNewItemType("app");
		setNewItemIcon(guessIconForName(app.name));
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
				setNewItemType("app");
				setNewItemIcon(guessIconForName(cleanName));
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
						<ZenithLogo size={20} />
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
											{ws.customIconUrl ? (
												<img
													src={ws.customIconUrl}
													alt=""
													style={{ width: 13, height: 13, objectFit: "contain", borderRadius: 2 }}
												/>
											) : (
												<WsIcon size={12} strokeWidth={1.9} />
											)}
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
												if (id === "app") {
													setNewItemType("app");
													setNewItemIcon("AppWindow");
												} else if (id === "system") {
													setNewItemType("system");
													if (!newItemTarget) {
														setNewItemLabel(SYSTEM_ACTION_PRESETS[0].label);
														setNewItemTarget(SYSTEM_ACTION_PRESETS[0].target);
														setNewItemIcon(SYSTEM_ACTION_PRESETS[0].icon);
													}
												} else if (id === "folder") {
													setNewItemType("folder");
													setNewItemIcon("Folder");
												} else if (id === "url") {
													setNewItemType("url");
													setNewItemIcon("Globe");
												} else if (id === "submenu") {
													setNewItemType("submenu");
													setNewItemTarget("submenu");
													setNewItemIcon("Layers");
												}
											}}
										>
											<Icon size={13} />
											<span>{label}</span>
										</button>
									))}
								</div>

								{/* Source-Specific Picker */}
								{addKind === "app" && (
									<div className="zn-app-picker-section">
										<div className="zn-app-picker-search-row">
											<div className="zn-app-search-box">
												<Search size={13} />
												<input
													type="text"
													placeholder="Search installed Windows apps or executables..."
													value={appSearch}
													onChange={(e) => setAppSearch(e.target.value)}
												/>
												{appSearch && (
													<button
														type="button"
														className="zn-search-clear-btn"
														onClick={() => setAppSearch("")}
														title="Clear search"
													>
														<X size={12} />
													</button>
												)}
												<span className="zn-app-search-count">
													{loadingApps ? "Scanning..." : `${filteredApps.length} apps`}
												</span>
											</div>
											<button
												type="button"
												className="settings-btn"
												onClick={handleBrowseExecutable}
												title="Browse filesystem for .exe or .lnk"
											>
												<FolderOpen size={13} />
												<span>Browse .exe</span>
											</button>
										</div>

										<div className="zn-installed-apps-grid">
											{loadingApps ? (
												<div className="zn-apps-loading">
													<AppWindow size={16} />
													<span>Scanning installed Windows applications...</span>
												</div>
											) : filteredApps.length === 0 ? (
												<div className="zn-apps-loading">
													<span>No matching apps found. Click "Browse .exe" or type path below.</span>
												</div>
											) : (
												filteredApps.map((app) => {
													const isSelected = newItemTarget === app.path;
													const exeName = app.path.split(/[\\/]/).pop() || "";
													return (
														<button
															key={app.path}
															type="button"
															className={`zn-installed-app-chip ${isSelected ? "selected" : ""}`}
															onClick={() => handlePickInstalledApp(app)}
															title={app.path}
														>
															<div className="zn-app-chip-icon-box">
																{appIcons[app.path] ? (
																	<img src={appIcons[app.path]} alt={app.name} />
																) : (
																	<SmartIcon
																		item={{
																			id: app.path,
																			label: app.name,
																			target: app.path,
																			type: "app",
																			icon: guessIconForName(app.name)
																		}}
																		size={22}
																		displayScale={0.88}
																	/>
																)}
															</div>
															<div className="zn-app-chip-info">
																<span className="zn-app-chip-title">{app.name}</span>
																<span className="zn-app-chip-path">{exeName}</span>
															</div>
															{isSelected && (
																<div className="zn-app-chip-check">
																	<Check size={10} strokeWidth={3} />
																</div>
															)}
														</button>
													);
												})
											)}
										</div>
									</div>
								)}

								{addKind === "system" && (
									<div className="zn-system-presets-section">
										<div className="zn-picker-subtitle">Standard Windows & Zenith Actions</div>
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
														<div className="zn-system-preset-icon">
															<PIcon size={14} />
														</div>
														<span className="zn-system-preset-label">{preset.label}</span>
														{selected && (
															<Check size={11} strokeWidth={2.5} style={{ marginLeft: "auto" }} />
														)}
													</button>
												);
											})}
										</div>
									</div>
								)}

								{addKind === "folder" && (
									<div className="zn-folder-picker-section">
										<div className="zn-folder-actions-row">
											<button
												type="button"
												className="zn-folder-action-card"
												onClick={() => handleBrowseFolderOrFile(true)}
											>
												<div className="zn-folder-action-icon folder">
													<FolderOpen size={20} />
												</div>
												<div className="zn-folder-action-text">
													<span className="zn-folder-action-title">Browse Folder...</span>
													<span className="zn-folder-action-desc">Choose any directory on your computer</span>
												</div>
											</button>
											<button
												type="button"
												className="zn-folder-action-card"
												onClick={() => handleBrowseFolderOrFile(false)}
											>
												<div className="zn-folder-action-icon file">
													<FileText size={20} />
												</div>
												<div className="zn-folder-action-text">
													<span className="zn-folder-action-title">Browse File...</span>
													<span className="zn-folder-action-desc">Choose any document, media, or script</span>
												</div>
											</button>
										</div>

										<div className="zn-picker-subtitle">Quick Windows Folders</div>
										<div className="zn-quick-folders-grid">
											{QUICK_FOLDER_PRESETS.map((qf) => {
												const QIcon = getRadialIcon(qf.icon);
												const isSelected = newItemTarget === qf.target;
												return (
													<button
														key={qf.target}
														type="button"
														className={`zn-quick-folder-chip ${isSelected ? "selected" : ""}`}
														onClick={() => {
															setNewItemLabel(qf.label);
															setNewItemTarget(qf.target);
															setNewItemType("folder");
															setNewItemIcon(qf.icon);
														}}
													>
														<div className="zn-quick-folder-icon">
															<QIcon size={14} />
														</div>
														<span className="zn-quick-folder-title">{qf.label}</span>
													</button>
												);
											})}
										</div>
									</div>
								)}

								{addKind === "url" && (
									<div className="zn-url-picker-section">
										<div className="zn-picker-subtitle">Popular Website Presets</div>
										<div className="zn-quick-urls-grid">
											{WEB_URL_PRESETS.map((site) => {
												const SIcon = getRadialIcon(site.icon);
												const isSelected = newItemTarget === site.target;
												return (
													<button
														key={site.target}
														type="button"
														className={`zn-quick-url-chip ${isSelected ? "selected" : ""}`}
														onClick={() => {
															setNewItemLabel(site.label);
															setNewItemTarget(site.target);
															setNewItemType("url");
															setNewItemIcon(site.icon);
														}}
													>
														<div className="zn-quick-url-icon">
															<SIcon size={14} />
														</div>
														<div className="zn-quick-url-info">
															<span className="zn-quick-url-title">{site.label}</span>
															<span className="zn-quick-url-domain">{site.domain}</span>
														</div>
													</button>
												);
											})}
										</div>
									</div>
								)}

								{addKind === "submenu" && (
									<div className="zn-submenu-intro-card">
										<div className="zn-submenu-intro-icon">
											<FolderPlus size={24} />
										</div>
										<div className="zn-submenu-intro-body">
											<span className="zn-submenu-intro-title">Submenu Folder</span>
											<span className="zn-submenu-intro-desc">
												Creates an expandable slice on the wheel that opens its own nested ring of shortcuts.
											</span>
										</div>
									</div>
								)}

								{/* Item Configuration & Live Radial Slice Preview */}
								<div className="zn-drawer-config-panel">
									{/* Hidden file input for custom icon selection */}
									<input
										type="file"
										ref={customIconFileRef}
										accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico,.png,.jpg,.jpeg,.svg,.webp"
										style={{ display: "none" }}
										onChange={handleCustomIconFileSelect}
									/>

									<div className="zn-drawer-preview-box">
										<div
											className="zn-drawer-preview-disc"
											onClick={() => customIconFileRef.current?.click()}
											title="Click to choose a custom image or icon from your PC"
										>
											<SmartIcon
												item={{
													id: "preview_slice",
													label: newItemLabel || "Shortcut",
													target: newItemTarget || "app",
													type: newItemType,
													icon: newItemIcon,
													customIconUrl: newItemCustomIconUrl || undefined,
													useNativeIcon:
														!newItemCustomIconUrl &&
														(newItemType === "app" ||
															newItemType === "command" ||
															newItemType === "file" ||
															newItemType === "folder")
												}}
												size={36}
												displayScale={0.82}
											/>
											<div className="zn-preview-disc-hover-overlay">
												<Upload size={14} />
											</div>
										</div>

										<div className="zn-drawer-preview-details">
											<div className="zn-drawer-preview-top">
												<span className="zn-drawer-preview-label">
													{newItemLabel || "New Shortcut"}
												</span>
												<span className="zn-drawer-badge">{newItemType.toUpperCase()}</span>
												{newItemCustomIconUrl && (
													<span className="zn-custom-icon-active-badge">
														<ImageIcon size={10} /> Custom Image
													</span>
												)}
											</div>
											<span className="zn-drawer-preview-target" title={newItemTarget}>
												{newItemTarget || "Select an app, location, or action above"}
											</span>
										</div>

										<div className="zn-custom-icon-actions">
											<button
												type="button"
												className="zn-custom-icon-pick-btn"
												onClick={() => customIconFileRef.current?.click()}
												title="Upload custom image (PNG, ICO, SVG, JPG, WebP) from your computer"
											>
												<Upload size={12} />
												<span>{newItemCustomIconUrl ? "Change Image" : "Custom Image"}</span>
											</button>
											{newItemCustomIconUrl && (
												<button
													type="button"
													className="zn-custom-icon-remove-btn"
													onClick={() => setNewItemCustomIconUrl("")}
													title="Revert back to default / native icon"
												>
													<RotateCcw size={11} />
													<span>Reset</span>
												</button>
											)}
										</div>
									</div>

									<div className="zn-add-fields-grid">
										<div className="zn-field-group">
											<label className="zn-field-label">Label on Wheel</label>
											<input
												type="text"
												className="settings-text-input zn-input-styled"
												placeholder="e.g. Chrome, Discord, Work..."
												value={newItemLabel}
												onChange={(e) => setNewItemLabel(e.target.value)}
											/>
										</div>

										{addKind !== "submenu" && (
											<div className="zn-field-group zn-field-flex2">
												<label className="zn-field-label">
													{addKind === "url" ? "Target Web Address" : "Target Path / Command"}
												</label>
												<input
													type="text"
													className="settings-text-input zn-input-styled"
													placeholder={
														addKind === "url"
															? "https://example.com"
															: "Path, shell command, or executable"
													}
													value={newItemTarget}
													onChange={(e) => setNewItemTarget(e.target.value)}
												/>
											</div>
										)}

										<div className="zn-field-group">
											<label className="zn-field-label">Fallback Icon</label>
											<select
												className="settings-select zn-select-styled"
												value={newItemIcon}
												onChange={(e) => setNewItemIcon(e.target.value)}
												title="Fallback Icon when native icon is unavailable"
											>
												{RADIAL_ICON_NAMES.map((ic) => (
													<option key={ic} value={ic}>
														{ic}
													</option>
												))}
											</select>
										</div>
									</div>
								</div>

								<div className="zn-add-drawer-footer">
									<button
										type="button"
										className="zn-drawer-cancel-btn"
										onClick={() => {
											setShowAddForm(false);
											setEditingItemId(null);
										}}
									>
										Cancel
									</button>
									<button
										type="button"
										className="zn-mouse-save-btn"
										onClick={handleSaveItem}
										disabled={!newItemLabel.trim() || (!newItemTarget.trim() && addKind !== "submenu")}
									>
										<Check size={13} strokeWidth={2.4} />
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
