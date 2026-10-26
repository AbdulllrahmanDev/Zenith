export type RadialItemType = "app" | "url" | "folder" | "file" | "command" | "system";

export interface RadialItem {
	id: string;
	label: string;
	icon: string;
	type: RadialItemType;
	target: string;
	args?: string;
}

export interface RadialWorkspace {
	id: string;
	name: string;
	icon: string;
	items: RadialItem[];
}

export const DEFAULT_WORKSPACES: RadialWorkspace[] = [
	{
		id: "main",
		name: "Main",
		icon: "Sparkles",
		items: [
			{
				id: "explorer",
				label: "File Explorer",
				icon: "Folder",
				type: "command",
				target: "explorer.exe"
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
				target: "powershell.exe"
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
				type: "command",
				target: "notepad.exe"
			},
			{
				id: "calculator",
				label: "Calculator",
				icon: "Calculator",
				type: "command",
				target: "calc.exe"
			},
			{
				id: "snip",
				label: "Snipping Tool",
				icon: "Scissors",
				type: "command",
				target: "snippingtool.exe"
			}
		]
	},
	{
		id: "media",
		name: "Media",
		icon: "Music",
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
