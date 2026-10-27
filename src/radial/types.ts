export type RadialItemType = "app" | "url" | "folder" | "file" | "command" | "system" | "submenu";

export interface RadialItem {
	id: string;
	label: string;
	icon: string;
	type: RadialItemType;
	target: string;
	args?: string;
	customIconUrl?: string;
	useNativeIcon?: boolean;
	children?: RadialItem[];
}

export interface RadialWorkspace {
	id: string;
	name: string;
	icon: string;
	enabled?: boolean;
	hotkey?: string;
	items: RadialItem[];
}

export interface RadialWheelConfig {
	menuRadius: number;
	iconSize: number;
	appSpacing: number;
	backdropOpacity: number;
	hoverColor: string;
	activationThreshold: number;
	showLabels: boolean;
	alwaysShowAppLabels: boolean;
	showWorkspacePill: boolean;
	openSoundId: string;
	hoverSoundId: string;
}

export const DEFAULT_WHEEL_CONFIG: RadialWheelConfig = {
	menuRadius: 150,
	iconSize: 64,
	appSpacing: 0,
	backdropOpacity: 0.75,
	hoverColor: "#FFFFFF",
	activationThreshold: 60,
	showLabels: true,
	alwaysShowAppLabels: false,
	showWorkspacePill: true,
	openSoundId: "sub-tick",
	hoverSoundId: "sub-tick"
};

export const HOVER_COLOR_PRESETS = [
	{ label: "Pure White", value: "#FFFFFF" },
	{ label: "Warm Ivory", value: "#F4F2ED" },
	{ label: "Sky Blue", value: "#38BDF8" },
	{ label: "Electric Blue", value: "#0A84FF" },
	{ label: "Emerald", value: "#34D399" },
	{ label: "Amber", value: "#FBBF24" },
	{ label: "Coral Red", value: "#F87171" },
	{ label: "Violet", value: "#A78BFA" }
] as const;

export const SYSTEM_ACTION_PRESETS: { id: string; label: string; icon: string; target: string }[] = [
	{ id: "open_settings", label: "Zenith Settings", icon: "Settings", target: "open_settings" },
	{ id: "task_manager", label: "Task Manager", icon: "Activity", target: "task_manager" },
	{ id: "sound_settings", label: "Sound Settings", icon: "Volume2", target: "sound_settings" },
	{ id: "wifi_settings", label: "Wi-Fi Settings", icon: "Wifi", target: "wifi_settings" },
	{ id: "bluetooth_settings", label: "Bluetooth Settings", icon: "Bluetooth", target: "bluetooth_settings" },
	{ id: "action_center", label: "Notification Center", icon: "Bell", target: "action_center" },
	{ id: "task_view", label: "Task View", icon: "Grid", target: "task_view" },
	{ id: "volume_mixer", label: "Volume Mixer", icon: "Sliders", target: "volume_mixer" }
];

export const DEFAULT_WORKSPACES: RadialWorkspace[] = [
	{
		id: "main",
		name: "Main",
		icon: "Sparkles",
		enabled: true,
		items: [
			{
				id: "explorer",
				label: "File Explorer",
				icon: "Folder",
				type: "app",
				target: "C:\\Windows\\explorer.exe",
				useNativeIcon: true
			},
			{
				id: "browser",
				label: "Browser",
				icon: "Globe",
				type: "url",
				target: "https://google.com"
			},
			{
				id: "terminal",
				label: "Terminal",
				icon: "Terminal",
				type: "command",
				target: "powershell.exe",
				useNativeIcon: false
			},
			{
				id: "settings",
				label: "Zenith Settings",
				icon: "Settings",
				type: "system",
				target: "open_settings"
			},
			{
				id: "taskmgr",
				label: "Task Manager",
				icon: "Activity",
				type: "system",
				target: "task_manager"
			},
			{
				id: "notepad",
				label: "Notepad",
				icon: "FileText",
				type: "app",
				target: "notepad.exe",
				useNativeIcon: true
			},
			{
				id: "calculator",
				label: "Calculator",
				icon: "Calculator",
				type: "app",
				target: "calc.exe",
				useNativeIcon: true
			},
			{
				id: "snip",
				label: "Snipping Tool",
				icon: "Scissors",
				type: "app",
				target: "snippingtool.exe",
				useNativeIcon: true
			}
		]
	},
	{
		id: "media",
		name: "Media",
		icon: "Music",
		enabled: true,
		items: [
			{
				id: "sound_settings",
				label: "Sound Settings",
				icon: "Volume2",
				type: "system",
				target: "sound_settings"
			},
			{
				id: "youtube",
				label: "YouTube",
				icon: "PlaySquare",
				type: "url",
				target: "https://youtube.com"
			},
			{
				id: "spotify",
				label: "Spotify",
				icon: "Music2",
				type: "url",
				target: "https://open.spotify.com"
			},
			{
				id: "mixer",
				label: "Volume Mixer",
				icon: "Sliders",
				type: "system",
				target: "volume_mixer"
			}
		]
	},
	{
		id: "tools",
		name: "Tools",
		icon: "Wrench",
		enabled: true,
		items: [
			{
				id: "wifi",
				label: "Wi-Fi Settings",
				icon: "Wifi",
				type: "system",
				target: "wifi_settings"
			},
			{
				id: "bluetooth",
				label: "Bluetooth Settings",
				icon: "Bluetooth",
				type: "system",
				target: "bluetooth_settings"
			},
			{
				id: "action_center",
				label: "Notification Center",
				icon: "Bell",
				type: "system",
				target: "action_center"
			},
			{
				id: "task_view",
				label: "Task View",
				icon: "Grid",
				type: "system",
				target: "task_view"
			}
		]
	}
];
