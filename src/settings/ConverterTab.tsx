import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
	AlertCircle,
	Archive,
	ArrowRightLeft,
	BookOpen,
	Box,
	Braces,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Compass,
	Cpu,
	Disc,
	Download,
	ExternalLink,
	FileCode2,
	FileSpreadsheet,
	FileText,
	Film,
	Folder,
	FolderOpen,
	FolderSync,
	Globe,
	GripVertical,
	History,
	Image,
	Keyboard,
	Loader2,
	MapPin,
	Menu,
	Music,
	Package,
	Pencil,
	PenTool,
	Plus,
	Power,
	Presentation,
	RefreshCw,
	RotateCcw,
	Save,
	Sliders,
	Subtitles,
	Trash2,
	Type,
	Upload,
	X
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { useI18n } from "../i18n";
import {
	buildConvertRequestFromOption,
	buildCustomMatcherInputs,
	DEFAULT_PRESET_CATALOG,
	DEFAULT_TOOLBAR_PROFILES,
	detectInputCategory,
	getCompatibleCatalogIdsForCategory,
	matchFormatsForPaths
} from "../converter/formats";
import type {
	ConflictPolicy,
	ConverterPresetConfig,
	ConverterRuntimeStatus,
	ConverterState,
	ConvertJobResult,
	CoreInstallProgressEvent,
	EngineInstallProgressEvent,
	EnginePackInfo,
	FileCategory,
	IsoFilesystem,
	RecentConversion,
	TargetOption,
	ToolbarProfileState,
	WatchRule,
	WatchRuleStatus
} from "../converter/types";
import "./ConverterTab.css";

export type ConverterTriggerKey = "ctrl" | "alt" | "shift" | "right-drag";
export type ConverterOutputMode = "next-to-source" | "folder";
export type ConverterSubTab = "general" | "donut" | "packs" | "history";

export interface ConverterTabProps {
	converterEnabled: boolean;
	toggleConverterEnabled: () => void;
	converterTriggerKey: ConverterTriggerKey;
	handleConverterTriggerKeyChange: (v: ConverterTriggerKey) => void;
	converterBrowserDrag: boolean;
	toggleConverterBrowserDrag: () => void;
	converterOutputMode: ConverterOutputMode;
	handleConverterOutputModeChange: (v: ConverterOutputMode) => void;
	converterOutputFolder: string;
	handleConverterOutputFolderChange: (v: string) => void;
	converterExplorerMenu: boolean;
	toggleConverterExplorerMenu?: () => void;
}

interface DropJobState {
	jobId: string;
	targetLabel: string;
	status: "converting" | "done" | "error" | "cancelled";
	fraction: number;
	outputs: string[];
	error: string | null;
}

interface PendingDropInstall {
	option: TargetOption;
	inputs: string[];
	needsCore: boolean;
	engineId: string | null;
	enginePack: EnginePackInfo | null;
	installing: boolean;
	error: string | null;
}

interface ConverterProgressPayload {
	job_id: string;
	kind: string;
	source: string;
	fraction?: number;
}

const EMPTY_CONVERTER_STATE: ConverterState = {
	profiles: [],
	presets: [],
	recent: [],
	watch_rules: []
};

const WATCH_UNSUPPORTED_PRESET_IDS = new Set([
	"pdf-edit",
	"crop-video",
	"pdf-nup",
	"rotate",
	"flip",
	"extract",
	"zip-all",
	"merge-pdf",
	"merge-images",
	"merge-videos",
	"merge-audio",
	"translate"
]);

function isWatchSupportedPresetId(id: string): boolean {
	return !id.startsWith("tool-") && !WATCH_UNSUPPORTED_PRESET_IDS.has(id);
}

function createEmptyWatchDraft(): WatchRule {
	return {
		id: `watch-${Date.now()}`,
		folder: "",
		target_format: "pdf",
		preset_id: "to-pdf",
		output_folder: "",
		recursive: false,
		move_originals: false,
		keep_dates: false,
		enabled: true
	};
}

function formatPackSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
	if (bytes >= 1_000_000_000) {
		return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
	}
	if (bytes >= 1_000_000) {
		return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
	}
	return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function formatTransferAmount(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
	if (bytes >= 1_000_000_000) {
		return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
	}
	if (bytes >= 100_000_000) {
		return `${(bytes / 1_000_000).toFixed(0)} MB`;
	}
	if (bytes >= 1_000_000) {
		return `${(bytes / 1_000_000).toFixed(1)} MB`;
	}
	return `${Math.max(0, Math.round(bytes / 1000))} KB`;
}

function cleanErrorMessage(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err);
	return raw.replace(/^[A-Z0-9_]+:\s*/, "").trim() || raw;
}

function extractBaseName(path: string): string {
	const trimmed = path.trim();
	const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return idx >= 0 ? trimmed.slice(idx + 1) || trimmed : trimmed;
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function iconForCategory(category: FileCategory) {
	const map: Record<FileCategory, typeof Image> = {
		image: Image,
		vector: PenTool,
		pdf: FileText,
		document: FileText,
		spreadsheet: FileSpreadsheet,
		presentation: Presentation,
		hwp: FileText,
		text: FileCode2,
		ebook: BookOpen,
		video: Film,
		audio: Music,
		subtitle: Subtitles,
		archive: Archive,
		cad: Compass,
		font: Type,
		data: Braces,
		model3d: Box,
		geospatial: MapPin,
		folder: Folder,
		mixed: ArrowRightLeft
	};
	return map[category] ?? ArrowRightLeft;
}

function buildDraftForPresetId(
	id: string,
	savedPresets: ConverterPresetConfig[]
): ConverterPresetConfig {
	const existing = savedPresets.find((p) => p.id === id);
	if (existing) {
		return { ...existing };
	}
	const builtIn = DEFAULT_PRESET_CATALOG[id];
	if (builtIn) {
		return {
			id,
			name: builtIn.label,
			target_format: builtIn.format,
			quality: builtIn.quality ?? null,
			pages: null,
			split_every: null,
			split_parts: null,
			conflict: "rename",
			keep_dates: false,
			zip: false,
			iso_filesystem: null,
			iso_label: null
		};
	}
	return {
		id,
		name: "",
		target_format: "webp",
		quality: 85,
		pages: null,
		split_every: null,
		split_parts: null,
		conflict: "rename",
		keep_dates: false,
		zip: false,
		iso_filesystem: null,
		iso_label: null
	};
}

export function ConverterTab({
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
	converterExplorerMenu
}: ConverterTabProps) {
	const { t, dir } = useI18n();
	const c = t.converter;
	const [subTab, setSubTab] = useState<ConverterSubTab>("general");

	const [runtimeStatus, setRuntimeStatus] = useState<ConverterRuntimeStatus | null>(null);
	const [statusChecking, setStatusChecking] = useState(true);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [coreProgress, setCoreProgress] = useState<CoreInstallProgressEvent | null>(null);
	const [coreActionRunning, setCoreActionRunning] = useState(false);
	const [coreError, setCoreError] = useState<string | null>(null);

	const [engines, setEngines] = useState<EnginePackInfo[]>([]);
	const [enginesLoading, setEnginesLoading] = useState(true);
	const [enginesError, setEnginesError] = useState<string | null>(null);
	const [activeEngineOp, setActiveEngineOp] = useState<Record<string, "installing" | "removing">>({});
	const [engineProgress, setEngineProgress] = useState<Record<string, EngineInstallProgressEvent>>({});
	const [packErrors, setPackErrors] = useState<Record<string, string>>({});

	// Persistent state.json (profiles, presets, recent, watch_rules)
	const [converterState, setConverterState] = useState<ConverterState>(EMPTY_CONVERTER_STATE);
	const [stateError, setStateError] = useState<string | null>(null);
	const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
	const saveStatusTimerRef = useRef<number | null>(null);

	// Donut Slice & Preset Editor state
	const [selectedProfileId, setSelectedProfileId] = useState<string>(
		DEFAULT_TOOLBAR_PROFILES[0]?.id ?? "images"
	);
	const [addSliceSelection, setAddSliceSelection] = useState<{ primary: string; secondary: string }>({
		primary: "",
		secondary: ""
	});
	const [dragSlice, setDragSlice] = useState<{ face: "primary" | "secondary"; index: number } | null>(
		null
	);
	const [dragOverSlice, setDragOverSlice] = useState<{
		face: "primary" | "secondary";
		index: number;
	} | null>(null);

	const [selectedPresetId, setSelectedPresetId] = useState<string>("to-jpg");
	const [isCreatingPreset, setIsCreatingPreset] = useState(false);
	const [presetDraft, setPresetDraft] = useState<ConverterPresetConfig>(() =>
		buildDraftForPresetId("to-jpg", [])
	);
	const [presetSplitMode, setPresetSplitMode] = useState<"none" | "every" | "parts">("none");
	const [presetSplitInput, setPresetSplitInput] = useState<string>("5");
	const [presetError, setPresetError] = useState<string | null>(null);
	const [presetSavedFlash, setPresetSavedFlash] = useState(false);
	const presetSavedTimerRef = useRef<number | null>(null);
	const initialStateLoadedRef = useRef(false);
	const selectedPresetIdRef = useRef(selectedPresetId);
	selectedPresetIdRef.current = selectedPresetId;
	const presetEditorRef = useRef<HTMLDivElement | null>(null);

	// Settings Drop Zone, Watch Folders & History state
	const [queuedFiles, setQueuedFiles] = useState<string[]>([]);
	const [isDropOver, setIsDropOver] = useState(false);
	const [dropJob, setDropJob] = useState<DropJobState | null>(null);
	const [pendingDropInstall, setPendingDropInstall] = useState<PendingDropInstall | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [clearingHistory, setClearingHistory] = useState(false);

	const [explorerMenuBusy, setExplorerMenuBusy] = useState(false);
	const [explorerMenuError, setExplorerMenuError] = useState<string | null>(null);

	const [watchStatuses, setWatchStatuses] = useState<Record<string, WatchRuleStatus>>({});
	const [watchSaving, setWatchSaving] = useState(false);
	const [watchError, setWatchError] = useState<string | null>(null);
	const [watchEditorOpen, setWatchEditorOpen] = useState(false);
	const [watchEditingId, setWatchEditingId] = useState<string | null>(null);
	const [watchDraft, setWatchDraft] = useState<WatchRule>(createEmptyWatchDraft);
	const [watchTargetMode, setWatchTargetMode] = useState<"preset" | "custom">("preset");
	const [watchCustomFormat, setWatchCustomFormat] = useState<string>("");

	const dropJobSeqRef = useRef(0);
	const activeDropJobIdRef = useRef<string | null>(null);
	const dropFileProgressRef = useRef<Map<string, number>>(new Map());

	const refreshStatusAndPacks = useCallback(async () => {
		setStatusChecking(true);
		setStatusError(null);
		setEnginesLoading(true);
		setEnginesError(null);
		const [statusRes, enginesRes] = await Promise.allSettled([
			invoke<ConverterRuntimeStatus>("converter_status"),
			invoke<EnginePackInfo[]>("converter_list_engines")
		]);

		if (statusRes.status === "fulfilled") {
			setRuntimeStatus(statusRes.value);
		} else {
			setStatusError(cleanErrorMessage(statusRes.reason));
		}
		if (enginesRes.status === "fulfilled") {
			setEngines(enginesRes.value);
		} else {
			setEnginesError(cleanErrorMessage(enginesRes.reason));
		}
		setStatusChecking(false);
		setEnginesLoading(false);
	}, []);

	const syncSplitStateFromDraft = useCallback((draft: ConverterPresetConfig) => {
		if (draft.split_every && draft.split_every > 0) {
			setPresetSplitMode("every");
			setPresetSplitInput(String(draft.split_every));
		} else if (draft.split_parts && draft.split_parts >= 2) {
			setPresetSplitMode("parts");
			setPresetSplitInput(String(draft.split_parts));
		} else {
			setPresetSplitMode("none");
			setPresetSplitInput("5");
		}
	}, []);

	const loadState = useCallback(async () => {
		try {
			const st = await invoke<ConverterState>("converter_get_state");
			setConverterState(st);
			setStateError(null);
			if (!initialStateLoadedRef.current) {
				initialStateLoadedRef.current = true;
				const initialDraft = buildDraftForPresetId(selectedPresetIdRef.current, st.presets);
				setPresetDraft(initialDraft);
				syncSplitStateFromDraft(initialDraft);
			}
		} catch (e) {
			setStateError(cleanErrorMessage(e));
		}
	}, [syncSplitStateFromDraft]);

	useEffect(() => {
		let cancelled = false;
		let unlistenCore: (() => void) | undefined;
		let unlistenEngine: (() => void) | undefined;
		let unlistenState: (() => void) | undefined;
		let unlistenWatch: (() => void) | undefined;

		refreshStatusAndPacks();
		loadState();
		invoke<WatchRuleStatus[]>("converter_get_watch_statuses")
			.then((list) => {
				if (cancelled) return;
				const next: Record<string, WatchRuleStatus> = {};
				for (const item of list) next[item.id] = item;
				setWatchStatuses(next);
			})
			.catch(() => {});

		listen<CoreInstallProgressEvent>("converter-core-progress", (ev) => {
			if (cancelled) return;
			setCoreProgress(ev.payload);
			if (ev.payload.stage === "error") {
				setCoreError(cleanErrorMessage(ev.payload.message));
			}
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenCore = fn;
			})
			.catch(() => {});

		listen<EngineInstallProgressEvent>("converter-engine-progress", (ev) => {
			if (cancelled) return;
			setEngineProgress((prev) => ({
				...prev,
				[ev.payload.id]: ev.payload
			}));
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenEngine = fn;
			})
			.catch(() => {});

		listen<ConverterState>("converter-state-changed", (ev) => {
			if (cancelled) return;
			setConverterState(ev.payload);
			setStateError(null);
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenState = fn;
			})
			.catch(() => {});

		listen<WatchRuleStatus[]>("converter-watch-status", (ev) => {
			if (cancelled) return;
			const next: Record<string, WatchRuleStatus> = {};
			for (const item of ev.payload) {
				next[item.id] = item;
			}
			setWatchStatuses(next);
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenWatch = fn;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			if (saveStatusTimerRef.current !== null) {
				window.clearTimeout(saveStatusTimerRef.current);
			}
			if (presetSavedTimerRef.current !== null) {
				window.clearTimeout(presetSavedTimerRef.current);
			}
			unlistenCore?.();
			unlistenEngine?.();
			unlistenState?.();
			unlistenWatch?.();
		};
	}, [loadState, refreshStatusAndPacks]);

	// Listen for native Tauri drag-and-drop events when Watch & History sub-tab is active
	useEffect(() => {
		if (subTab !== "history") {
			setIsDropOver(false);
			return;
		}
		let cancelled = false;
		let unlistenDrop: (() => void) | undefined;

		getCurrentWebview()
			.onDragDropEvent((ev) => {
				if (cancelled) return;
				if (ev.payload.type === "enter" || ev.payload.type === "over") {
					setIsDropOver(true);
				} else if (ev.payload.type === "leave") {
					setIsDropOver(false);
				} else if (ev.payload.type === "drop") {
					setIsDropOver(false);
					const dropped = ev.payload.paths ?? [];
					if (dropped.length > 0) {
						setQueuedFiles((prev) => {
							const merged = [...prev];
							for (const p of dropped) {
								if (p && !merged.includes(p)) {
									merged.push(p);
								}
							}
							return merged;
						});
						setPendingDropInstall(null);
					}
				}
			})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenDrop = fn;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			unlistenDrop?.();
		};
	}, [subTab]);

	// Track live CLI progress for Settings Drop Zone jobs
	useEffect(() => {
		if (!dropJob || dropJob.status !== "converting") return;
		let cancelled = false;
		let unlistenProg: (() => void) | undefined;

		listen<ConverterProgressPayload>("converter-progress", (ev) => {
			if (cancelled) return;
			const p = ev.payload;
			if (!activeDropJobIdRef.current || p.job_id !== activeDropJobIdRef.current) return;

			if (p.kind === "progress" && typeof p.fraction === "number") {
				dropFileProgressRef.current.set(p.source, Math.max(0, Math.min(1, p.fraction)));
			} else if (p.kind === "file") {
				dropFileProgressRef.current.set(p.source, 1);
			}

			const vals = Array.from(dropFileProgressRef.current.values());
			const avg =
				vals.length > 0
					? vals.reduce((acc, v) => acc + v, 0) / vals.length
					: Math.max(0, Math.min(1, p.fraction ?? 0));

			setDropJob((prev) =>
				prev && prev.jobId === p.job_id && prev.status === "converting"
					? { ...prev, fraction: avg }
					: prev
			);
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlistenProg = fn;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			unlistenProg?.();
		};
	}, [dropJob?.jobId, dropJob?.status]);

	const customMatcherInputs = useMemo(
		() => buildCustomMatcherInputs(converterState),
		[converterState]
	);

	const mergedProfiles = useMemo<ToolbarProfileState[]>(() => {
		return DEFAULT_TOOLBAR_PROFILES.map((def) => {
			const saved = converterState.profiles.find(
				(sp) => sp.id === def.id || sp.category === def.category
			);
			if (saved) {
				return {
					id: def.id,
					category: def.category,
					label: saved.label || def.label,
					primary_ids: [...saved.primary_ids],
					secondary_ids: [...saved.secondary_ids]
				};
			}
			return {
				id: def.id,
				category: def.category,
				label: def.label,
				primary_ids: [...def.primaryIds],
				secondary_ids: [...def.secondaryIds]
			};
		});
	}, [converterState.profiles]);

	const customizedProfileIds = useMemo(() => {
		const set = new Set<string>();
		for (const def of DEFAULT_TOOLBAR_PROFILES) {
			const saved = converterState.profiles.find(
				(sp) => sp.id === def.id || sp.category === def.category
			);
			if (
				saved &&
				(!arraysEqual(saved.primary_ids, def.primaryIds) ||
					!arraysEqual(saved.secondary_ids, def.secondaryIds))
			) {
				set.add(def.id);
			}
		}
		return set;
	}, [converterState.profiles]);

	const activeProfile = useMemo(
		() => mergedProfiles.find((p) => p.id === selectedProfileId) ?? mergedProfiles[0],
		[mergedProfiles, selectedProfileId]
	);

	// Reset add-slice dropdowns when switching category
	useEffect(() => {
		setAddSliceSelection({ primary: "", secondary: "" });
	}, [selectedProfileId]);

	const dropZoneDonutSides = useMemo(() => {
		if (queuedFiles.length === 0) return null;
		return matchFormatsForPaths(
			queuedFiles,
			customMatcherInputs.profiles,
			customMatcherInputs.extraPresets
		);
	}, [queuedFiles, customMatcherInputs]);

	const triggerLabel =
		converterTriggerKey === "alt"
			? c.triggerAlt
			: converterTriggerKey === "shift"
				? c.triggerShift
				: converterTriggerKey === "right-drag"
					? c.triggerRightDrag
					: c.triggerCtrl;

	const handleBrowseOutputFolder = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: c.browseFolderTitle,
				directory: true,
				multiple: false
			});
			if (typeof selected === "string" && selected.trim()) {
				handleConverterOutputFolderChange(selected);
			}
		} catch (e) {
			console.error("Failed to pick converter output folder:", e);
		}
	};

	const handleEnsureCore = async (): Promise<{ ok: boolean; error?: string }> => {
		if (coreActionRunning || runtimeStatus?.installing) {
			return { ok: false, error: c.runtime.installingTitle };
		}
		setCoreActionRunning(true);
		setCoreError(null);
		setStatusError(null);
		setCoreProgress(null);
		try {
			const status = await invoke<ConverterRuntimeStatus>("converter_ensure_core");
			setRuntimeStatus(status);
			await refreshStatusAndPacks();
			return status.core_installed
				? { ok: true }
				: { ok: false, error: c.runtime.missingTitle };
		} catch (e) {
			const msg = cleanErrorMessage(e);
			setCoreError(msg);
			return { ok: false, error: msg };
		} finally {
			setCoreActionRunning(false);
		}
	};

	const handleInstallPack = async (id: string): Promise<{ ok: boolean; error?: string }> => {
		if (activeEngineOp[id]) return { ok: false, error: c.packs.installing };
		setPackErrors((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setActiveEngineOp((prev) => ({ ...prev, [id]: "installing" }));

		try {
			if (!runtimeStatus?.core_installed) {
				const coreResult = await handleEnsureCore();
				if (!coreResult.ok) {
					if (coreResult.error) {
						setPackErrors((prev) => ({ ...prev, [id]: coreResult.error! }));
					}
					return { ok: false, error: coreResult.error };
				}
			}
			const updated = await invoke<EnginePackInfo>("converter_install_engine", { id });
			setEngines((prev) => {
				const exists = prev.some((p) => p.id === updated.id);
				return exists ? prev.map((p) => (p.id === updated.id ? updated : p)) : [...prev, updated];
			});
			return { ok: true };
		} catch (e) {
			const msg = cleanErrorMessage(e);
			setPackErrors((prev) => ({ ...prev, [id]: msg }));
			return { ok: false, error: msg };
		} finally {
			setActiveEngineOp((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
			setEngineProgress((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
		}
	};

	const handleRemovePack = async (id: string) => {
		if (activeEngineOp[id]) return;
		setPackErrors((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setActiveEngineOp((prev) => ({ ...prev, [id]: "removing" }));

		try {
			const updated = await invoke<EnginePackInfo>("converter_remove_engine", { id });
			setEngines((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
		} catch (e) {
			setPackErrors((prev) => ({ ...prev, [id]: cleanErrorMessage(e) }));
		} finally {
			setActiveEngineOp((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
		}
	};

	// ─── Donut Profile Slice Mutations ───────────────────────────────────────────

	const persistMergedProfiles = useCallback(async (nextAllProfiles: ToolbarProfileState[]) => {
		const customizedOnly = nextAllProfiles.filter((profile) => {
			const def = DEFAULT_TOOLBAR_PROFILES.find(
				(d) => d.id === profile.id || d.category === profile.category
			);
			if (!def) return true;
			return (
				!arraysEqual(profile.primary_ids, def.primaryIds) ||
				!arraysEqual(profile.secondary_ids, def.secondaryIds)
			);
		});

		setProfileSaveStatus("saving");
		setStateError(null);
		if (saveStatusTimerRef.current !== null) {
			window.clearTimeout(saveStatusTimerRef.current);
			saveStatusTimerRef.current = null;
		}
		try {
			const updated = await invoke<ConverterState>("converter_save_profiles", {
				profiles: customizedOnly
			});
			setConverterState(updated);
			setProfileSaveStatus("saved");
			saveStatusTimerRef.current = window.setTimeout(() => {
				saveStatusTimerRef.current = null;
				setProfileSaveStatus("idle");
			}, 1600);
		} catch (e) {
			setStateError(cleanErrorMessage(e));
			setProfileSaveStatus("idle");
		}
	}, []);

	const updateActiveProfileSlices = useCallback(
		(face: "primary" | "secondary", updater: (ids: string[]) => string[]) => {
			if (!activeProfile) return;
			const nextProfiles = mergedProfiles.map((p) => {
				if (p.id !== activeProfile.id) return p;
				return {
					...p,
					primary_ids: face === "primary" ? updater(p.primary_ids) : p.primary_ids,
					secondary_ids: face === "secondary" ? updater(p.secondary_ids) : p.secondary_ids
				};
			});
			void persistMergedProfiles(nextProfiles);
		},
		[activeProfile, mergedProfiles, persistMergedProfiles]
	);

	const handleMoveSlice = (face: "primary" | "secondary", fromIdx: number, toIdx: number) => {
		updateActiveProfileSlices(face, (ids) => {
			if (toIdx < 0 || toIdx >= ids.length || fromIdx === toIdx) return ids;
			const copy = [...ids];
			const [item] = copy.splice(fromIdx, 1);
			copy.splice(toIdx, 0, item);
			return copy;
		});
	};

	const handleRemoveSlice = (face: "primary" | "secondary", index: number) => {
		updateActiveProfileSlices(face, (ids) => ids.filter((_, i) => i !== index));
	};

	const handleAddSlice = (face: "primary" | "secondary", sliceIdOverride?: string) => {
		const targetId = (sliceIdOverride ?? addSliceSelection[face]).trim();
		if (!targetId) return;
		updateActiveProfileSlices(face, (ids) => (ids.includes(targetId) ? ids : [...ids, targetId]));
		if (!sliceIdOverride) {
			setAddSliceSelection((prev) => ({ ...prev, [face]: "" }));
		}
	};

	const handleResetCategoryProfile = () => {
		if (!activeProfile) return;
		const def = DEFAULT_TOOLBAR_PROFILES.find(
			(d) => d.id === activeProfile.id || d.category === activeProfile.category
		);
		if (!def) return;
		const nextProfiles = mergedProfiles.map((p) =>
			p.id === activeProfile.id
				? {
						...p,
						primary_ids: [...def.primaryIds],
						secondary_ids: [...def.secondaryIds]
					}
				: p
		);
		void persistMergedProfiles(nextProfiles);
	};

	const handleResetAllProfiles = () => {
		const defaults: ToolbarProfileState[] = DEFAULT_TOOLBAR_PROFILES.map((d) => ({
			id: d.id,
			category: d.category,
			label: d.label,
			primary_ids: [...d.primaryIds],
			secondary_ids: [...d.secondaryIds]
		}));
		void persistMergedProfiles(defaults);
	};

	// ─── Preset Editor Handlers ──────────────────────────────────────────────────

	const handleSelectPresetForEdit = (id: string) => {
		const nextDraft = buildDraftForPresetId(id, converterState.presets);
		setIsCreatingPreset(false);
		setSelectedPresetId(id);
		setPresetDraft(nextDraft);
		syncSplitStateFromDraft(nextDraft);
		setPresetError(null);
		setPresetSavedFlash(false);
	};

	const handleJumpToPresetFromSlice = (id: string) => {
		handleSelectPresetForEdit(id);
		presetEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	};

	const handleNewPreset = () => {
		const freshId = `custom-${Date.now()}`;
		const freshDraft: ConverterPresetConfig = {
			id: freshId,
			name: "",
			target_format: "webp",
			quality: 85,
			pages: null,
			split_every: null,
			split_parts: null,
			conflict: "rename",
			keep_dates: false,
			zip: false,
			iso_filesystem: null,
			iso_label: null
		};
		setIsCreatingPreset(true);
		setSelectedPresetId(freshId);
		setPresetDraft(freshDraft);
		syncSplitStateFromDraft(freshDraft);
		setPresetError(null);
		setPresetSavedFlash(false);
	};

	const savePresetList = useCallback(async (nextPresets: ConverterPresetConfig[]) => {
		const updated = await invoke<ConverterState>("converter_save_presets", {
			presets: nextPresets
		});
		setConverterState(updated);
		return updated;
	}, []);

	const handleSavePreset = async (): Promise<ConverterPresetConfig | null> => {
		const cleanFmt = presetDraft.target_format.trim().replace(/^\./, "").toLowerCase();
		if (!cleanFmt) {
			setPresetError(c.presets.validationFormatRequired);
			return null;
		}
		const cleanName = presetDraft.name.trim() || cleanFmt.toUpperCase();
		const isIso = cleanFmt === "iso";
		const parsedSplitNum = Number.parseInt(presetSplitInput, 10);
		const splitEvery =
			presetSplitMode === "every"
				? Math.max(1, Number.isFinite(parsedSplitNum) ? parsedSplitNum : 5)
				: null;
		const splitParts =
			presetSplitMode === "parts"
				? Math.max(2, Number.isFinite(parsedSplitNum) ? parsedSplitNum : 2)
				: null;

		const toSave: ConverterPresetConfig = {
			...presetDraft,
			name: cleanName,
			target_format: cleanFmt,
			quality:
				presetDraft.quality !== null && presetDraft.quality !== undefined
					? Math.max(1, Math.min(100, Math.round(presetDraft.quality)))
					: null,
			pages: presetDraft.pages?.trim() || null,
			split_every: splitEvery,
			split_parts: splitParts,
			conflict: presetDraft.conflict || "rename",
			keep_dates: Boolean(presetDraft.keep_dates),
			zip: Boolean(presetDraft.zip),
			iso_filesystem: isIso ? presetDraft.iso_filesystem || null : null,
			iso_label: isIso ? presetDraft.iso_label?.trim() || null : null
		};

		setPresetError(null);
		try {
			const exists = converterState.presets.some((p) => p.id === toSave.id);
			const nextPresets = exists
				? converterState.presets.map((p) => (p.id === toSave.id ? toSave : p))
				: [...converterState.presets, toSave];
			await savePresetList(nextPresets);
			setIsCreatingPreset(false);
			setSelectedPresetId(toSave.id);
			setPresetDraft(toSave);
			syncSplitStateFromDraft(toSave);
			setPresetSavedFlash(true);
			if (presetSavedTimerRef.current !== null) {
				window.clearTimeout(presetSavedTimerRef.current);
			}
			presetSavedTimerRef.current = window.setTimeout(() => {
				presetSavedTimerRef.current = null;
				setPresetSavedFlash(false);
			}, 1800);
			return toSave;
		} catch (e) {
			setPresetError(cleanErrorMessage(e));
			return null;
		}
	};

	const handleDeleteOrResetPreset = async () => {
		const id = presetDraft.id;
		const isSaved = converterState.presets.some((p) => p.id === id);
		if (!isSaved) {
			if (isCreatingPreset) {
				handleSelectPresetForEdit("to-jpg");
			}
			return;
		}
		setPresetError(null);
		try {
			const nextPresets = converterState.presets.filter((p) => p.id !== id);
			await savePresetList(nextPresets);

			// If a custom preset was removed from presets, clean up any profile references to it.
			const isBuiltIn = Boolean(DEFAULT_PRESET_CATALOG[id]);
			if (!isBuiltIn) {
				const hasRef = mergedProfiles.some(
					(p) => p.primary_ids.includes(id) || p.secondary_ids.includes(id)
				);
				if (hasRef) {
					const cleanedProfiles = mergedProfiles.map((p) => ({
						...p,
						primary_ids: p.primary_ids.filter((x) => x !== id),
						secondary_ids: p.secondary_ids.filter((x) => x !== id)
					}));
					await persistMergedProfiles(cleanedProfiles);
				}
				handleSelectPresetForEdit("to-jpg");
			} else {
				const resetDraft = buildDraftForPresetId(id, nextPresets);
				setPresetDraft(resetDraft);
				syncSplitStateFromDraft(resetDraft);
			}
		} catch (e) {
			setPresetError(cleanErrorMessage(e));
		}
	};

	const handleAddPresetToFace = async (face: "primary" | "secondary") => {
		const saved = await handleSavePreset();
		if (saved) {
			handleAddSlice(face, saved.id);
		}
	};

	// ─── Settings Drop Zone & History Actions ────────────────────────────────────

	const handleBrowseDropZoneFiles = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				multiple: true
			});
			const picked = Array.isArray(selected) ? selected : [];
			if (picked.length > 0) {
				setQueuedFiles((prev) => {
					const merged = [...prev];
					for (const p of picked) {
						if (p && !merged.includes(p)) merged.push(p);
					}
					return merged;
				});
				setPendingDropInstall(null);
			}
		} catch (e) {
			setHistoryError(cleanErrorMessage(e));
		}
	};

	const executeDropConversion = useCallback(
		async (option: TargetOption, inputs: string[]) => {
			if (inputs.length === 0) return;
			const jobId = `settings-${Date.now()}-${++dropJobSeqRef.current}`;
			activeDropJobIdRef.current = jobId;
			dropFileProgressRef.current = new Map(inputs.map((p) => [p, 0]));
			setPendingDropInstall(null);
			setHistoryError(null);
			setDropJob({
				jobId,
				targetLabel: option.label,
				status: "converting",
				fraction: 0,
				outputs: [],
				error: null
			});

			const outDir =
				converterOutputMode === "folder" && converterOutputFolder.trim().length > 0
					? converterOutputFolder.trim()
					: null;

			const req = buildConvertRequestFromOption({
				jobId,
				inputs,
				option,
				outputDir: outDir,
				presetsById: customMatcherInputs.presetsById
			});

			try {
				const result = await invoke<ConvertJobResult>("converter_convert", { req });
				if (activeDropJobIdRef.current !== jobId) return;

				const outputs = result.files.flatMap((f) => f.outputs ?? []);
				const missingEngine =
					result.missing_engine ||
					result.files.find((f) => Boolean(f.missing_engine))?.missing_engine ||
					null;

				if (missingEngine && outputs.length === 0) {
					const latestEngines = await invoke<EnginePackInfo[]>("converter_list_engines").catch(
						() => engines
					);
					const pack =
						latestEngines.find((e) => e.id.toLowerCase() === missingEngine.toLowerCase()) ??
						null;
					setDropJob(null);
					setPendingDropInstall({
						option,
						inputs,
						needsCore: false,
						engineId: missingEngine,
						enginePack: pack,
						installing: false,
						error: null
					});
					return;
				}

				const failedFile = result.files.find((f) => f.state.toLowerCase() === "failed");
				if (failedFile && outputs.length === 0) {
					setDropJob({
						jobId,
						targetLabel: option.label,
						status: "error",
						fraction: 0,
						outputs,
						error: cleanErrorMessage(failedFile.error || c.donut.failedTitle)
					});
					return;
				}

				setDropJob({
					jobId,
					targetLabel: option.label,
					status: "done",
					fraction: 1,
					outputs,
					error: null
				});
			} catch (err) {
				if (activeDropJobIdRef.current !== jobId) return;
				const raw = err instanceof Error ? err.message : String(err);
				if (raw === "CANCELLED" || raw.startsWith("CANCELLED")) {
					setDropJob({
						jobId,
						targetLabel: option.label,
						status: "cancelled",
						fraction: 0,
						outputs: [],
						error: null
					});
					return;
				}
				if (raw.startsWith("CORE_NOT_INSTALLED")) {
					const requiredEngine = option.requiredEngine?.trim() || null;
					const pack = requiredEngine
						? engines.find((e) => e.id.toLowerCase() === requiredEngine.toLowerCase()) ?? null
						: null;
					setDropJob(null);
					setPendingDropInstall({
						option,
						inputs,
						needsCore: true,
						engineId: requiredEngine,
						enginePack: pack,
						installing: false,
						error: null
					});
					return;
				}
				if (raw.startsWith("MISSING_ENGINE:")) {
					const missingId = raw.slice("MISSING_ENGINE:".length).trim();
					const pack =
						engines.find((e) => e.id.toLowerCase() === missingId.toLowerCase()) ?? null;
					setDropJob(null);
					setPendingDropInstall({
						option,
						inputs,
						needsCore: false,
						engineId: missingId,
						enginePack: pack,
						installing: false,
						error: null
					});
					return;
				}
				setDropJob({
					jobId,
					targetLabel: option.label,
					status: "error",
					fraction: 0,
					outputs: [],
					error: cleanErrorMessage(raw)
				});
			}
		},
		[
			c.donut.failedTitle,
			converterOutputFolder,
			converterOutputMode,
			customMatcherInputs.presetsById,
			engines
		]
	);

	const handleDropTargetClick = async (option: TargetOption) => {
		if (queuedFiles.length === 0 || dropJob?.status === "converting") return;

		const [statusRes, enginesRes] = await Promise.allSettled([
			invoke<ConverterRuntimeStatus>("converter_status"),
			invoke<EnginePackInfo[]>("converter_list_engines")
		]);

		const coreInstalled =
			statusRes.status === "fulfilled" ? statusRes.value.core_installed : Boolean(runtimeStatus?.core_installed);
		const latestEngines = enginesRes.status === "fulfilled" ? enginesRes.value : engines;
		if (enginesRes.status === "fulfilled") {
			setEngines(latestEngines);
		}
		if (statusRes.status === "fulfilled") {
			setRuntimeStatus(statusRes.value);
		}

		const requiredEngine = option.requiredEngine?.trim() || null;
		const enginePack = requiredEngine
			? latestEngines.find((e) => e.id.toLowerCase() === requiredEngine.toLowerCase()) ?? null
			: null;
		const needsEngine = Boolean(
			requiredEngine &&
				(enginesRes.status === "fulfilled"
					? !enginePack || enginePack.status === "notinstalled"
					: !coreInstalled)
		);

		if (!coreInstalled || needsEngine) {
			setDropJob(null);
			setPendingDropInstall({
				option,
				inputs: [...queuedFiles],
				needsCore: !coreInstalled,
				engineId: needsEngine ? requiredEngine : null,
				enginePack,
				installing: false,
				error: null
			});
			return;
		}

		await executeDropConversion(option, [...queuedFiles]);
	};

	const handleConfirmDropInstall = async () => {
		if (!pendingDropInstall || pendingDropInstall.installing) return;
		const current = pendingDropInstall;
		setPendingDropInstall((prev) => (prev ? { ...prev, installing: true, error: null } : null));

		try {
			if (current.needsCore) {
				const coreRes = await handleEnsureCore();
				if (!coreRes.ok) {
					throw new Error(coreRes.error || c.runtime.missingTitle);
				}
			}
			if (current.engineId) {
				const packRes = await handleInstallPack(current.engineId);
				if (!packRes.ok) {
					throw new Error(packRes.error || c.donut.unavailablePack);
				}
			}
			await executeDropConversion(current.option, current.inputs);
		} catch (e) {
			setPendingDropInstall((prev) =>
				prev ? { ...prev, installing: false, error: cleanErrorMessage(e) } : null
			);
		}
	};

	const handleCancelDropJob = async () => {
		if (!dropJob || dropJob.status !== "converting") return;
		const id = dropJob.jobId;
		activeDropJobIdRef.current = null;
		await invoke("converter_cancel", { jobId: id }).catch(() => {});
		setDropJob((prev) => (prev && prev.jobId === id ? { ...prev, status: "cancelled" } : prev));
	};

	const handleOpenOutput = async (path: string, revealInFolder: boolean) => {
		if (!path.trim()) return;
		setHistoryError(null);
		try {
			await invoke("converter_open_output", { path, revealInFolder });
		} catch (e) {
			setHistoryError(cleanErrorMessage(e));
		}
	};

	const handleClearHistory = async () => {
		if (clearingHistory || converterState.recent.length === 0) return;
		setClearingHistory(true);
		setHistoryError(null);
		try {
			const updated = await invoke<ConverterState>("converter_clear_history");
			setConverterState(updated);
		} catch (e) {
			setHistoryError(cleanErrorMessage(e));
		} finally {
			setClearingHistory(false);
		}
	};

	const handleToggleExplorerMenu = async () => {
		if (explorerMenuBusy) return;
		const next = !converterExplorerMenu;
		setExplorerMenuBusy(true);
		setExplorerMenuError(null);
		try {
			const applied = await invoke<boolean>("converter_toggle_explorer_menu", {
				enabled: next
			});
			try {
				localStorage.setItem("zenith-converter-explorer-menu", String(applied));
			} catch {
				// Ignore localStorage failures.
			}
		} catch (e) {
			setExplorerMenuError(cleanErrorMessage(e));
		} finally {
			setExplorerMenuBusy(false);
		}
	};

	const watchTargetGroups = useMemo(() => {
		const savedIds = new Set<string>();
		const savedOptions: { id: string; label: string; targetFormat: string; isBuiltInOverride: boolean }[] = [];
		for (const p of converterState.presets) {
			const id = p.id.trim();
			const fmt = p.target_format.trim().replace(/^\./, "").toLowerCase();
			if (!id || !fmt || !isWatchSupportedPresetId(id)) continue;
			savedIds.add(id);
			const builtIn = DEFAULT_PRESET_CATALOG[id];
			const isBuiltInOverride = Boolean(builtIn && fmt !== builtIn.format.toLowerCase());
			savedOptions.push({
				id,
				label: `${p.name.trim() || builtIn?.label || id} (${fmt === "*" ? "*" : fmt.toUpperCase()})`,
				targetFormat: fmt,
				isBuiltInOverride
			});
		}

		const builtInOptions: { id: string; label: string; targetFormat: string }[] = [];
		for (const [id, opt] of Object.entries(DEFAULT_PRESET_CATALOG)) {
			if (savedIds.has(id) || !isWatchSupportedPresetId(id)) continue;
			const fmtLabel =
				opt.format === "*"
					? "*"
					: opt.format === "*audio"
						? "AUDIO"
						: opt.format.toUpperCase();
			builtInOptions.push({
				id,
				label:
					opt.label.toUpperCase() === fmtLabel
						? opt.label
						: `${opt.label} (${fmtLabel})`,
				targetFormat: opt.format
			});
		}

		return { savedOptions, builtInOptions };
	}, [converterState.presets]);

	const applyWatchStatuses = (list: WatchRuleStatus[]) => {
		const next: Record<string, WatchRuleStatus> = {};
		for (const item of list) {
			next[item.id] = item;
		}
		setWatchStatuses(next);
	};

	const persistWatchRules = async (nextRules: WatchRule[]): Promise<boolean> => {
		setWatchSaving(true);
		setWatchError(null);
		try {
			const statuses = await invoke<WatchRuleStatus[]>("converter_save_watch_rules", {
				rules: nextRules
			});
			applyWatchStatuses(statuses);
			setConverterState((prev) => ({ ...prev, watch_rules: nextRules }));
			return true;
		} catch (e) {
			setWatchError(cleanErrorMessage(e));
			return false;
		} finally {
			setWatchSaving(false);
		}
	};

	const handleOpenNewWatchForm = () => {
		setWatchDraft(createEmptyWatchDraft());
		setWatchEditingId(null);
		setWatchTargetMode("preset");
		setWatchCustomFormat("");
		setWatchError(null);
		setWatchEditorOpen(true);
	};

	const handleEditWatchRule = (rule: WatchRule) => {
		const hasPreset = Boolean(
			rule.preset_id &&
				(watchTargetGroups.savedOptions.some((o) => o.id === rule.preset_id) ||
					watchTargetGroups.builtInOptions.some((o) => o.id === rule.preset_id))
		);
		setWatchDraft({ ...rule });
		setWatchEditingId(rule.id);
		setWatchTargetMode(hasPreset ? "preset" : "custom");
		setWatchCustomFormat(hasPreset ? "" : rule.target_format);
		setWatchError(null);
		setWatchEditorOpen(true);
	};

	const handleBrowseWatchFolder = async (field: "folder" | "output_folder") => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				directory: true,
				multiple: false
			});
			if (typeof selected === "string" && selected.trim()) {
				setWatchDraft((prev) => ({
					...prev,
					[field]: selected.trim()
				}));
			}
		} catch (e) {
			setWatchError(cleanErrorMessage(e));
		}
	};

	const handleSaveWatchDraft = async () => {
		if (watchSaving) return;
		const folder = watchDraft.folder.trim();
		if (!folder) {
			setWatchError(c.history.watchValidationFolder);
			return;
		}

		let targetFormat = watchDraft.target_format.trim().replace(/^\./, "").toLowerCase();
		let presetId: string | null = watchDraft.preset_id?.trim() || null;

		if (watchTargetMode === "custom") {
			targetFormat = watchCustomFormat.trim().replace(/^\./, "").toLowerCase();
			presetId = null;
			if (!targetFormat) {
				setWatchError(c.history.watchValidationTarget);
				return;
			}
		} else {
			if (!presetId && !targetFormat) {
				setWatchError(c.history.watchValidationTarget);
				return;
			}
			if (presetId) {
				const savedOpt = watchTargetGroups.savedOptions.find((o) => o.id === presetId);
				if (savedOpt?.isBuiltInOverride) {
					targetFormat = savedOpt.targetFormat;
					presetId = null;
				}
			}
		}

		const nextRule: WatchRule = {
			...watchDraft,
			folder,
			target_format: targetFormat,
			preset_id: presetId,
			output_folder: watchDraft.output_folder.trim()
		};

		const existing = converterState.watch_rules;
		const nextRules = watchEditingId
			? existing.map((r) => (r.id === watchEditingId ? nextRule : r))
			: [...existing, nextRule];

		const ok = await persistWatchRules(nextRules);
		if (ok) {
			setWatchEditorOpen(false);
			setWatchEditingId(null);
		}
	};

	const handleToggleWatchRule = async (ruleId: string) => {
		if (watchSaving) return;
		const nextRules = converterState.watch_rules.map((r) =>
			r.id === ruleId ? { ...r, enabled: !r.enabled } : r
		);
		await persistWatchRules(nextRules);
	};

	const handleDeleteWatchRule = async (ruleId: string) => {
		if (watchSaving) return;
		const nextRules = converterState.watch_rules.filter((r) => r.id !== ruleId);
		const ok = await persistWatchRules(nextRules);
		if (ok && watchEditingId === ruleId) {
			setWatchEditorOpen(false);
			setWatchEditingId(null);
		}
	};

	const formatTimestamp = (timestampMs: number): string => {
		if (!timestampMs) return "";
		const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
		if (diffSec < 60) return c.history.justNow;
		if (diffSec < 3600) return c.history.minutesAgo(Math.floor(diffSec / 60));
		if (diffSec < 86400) return c.history.hoursAgo(Math.floor(diffSec / 3600));
		if (diffSec < 7 * 86400) return c.history.daysAgo(Math.floor(diffSec / 86400));
		try {
			return new Date(timestampMs).toLocaleDateString();
		} catch {
			return "";
		}
	};

	const isCoreInstalling = coreActionRunning || Boolean(runtimeStatus?.installing);
	const corePct = Math.max(0, Math.min(100, Math.round((coreProgress?.fraction ?? 0) * 100)));
	const coreStageLabel =
		(coreProgress?.stage && c.runtime.stages[coreProgress.stage]) ||
		coreProgress?.message ||
		c.runtime.installingTitle;

	const renderCoreBanner = () => {
		if (isCoreInstalling) {
			return (
				<div className="zn-core-banner installing">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon">
								<Loader2 size={15} className="zn-spin" />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.installingTitle}</div>
								<div className="zn-core-desc">{coreProgress?.message || coreStageLabel}</div>
							</div>
						</div>
						<span className="zn-core-pct">{corePct}%</span>
					</div>
					<div className="zn-converter-progress-track">
						<div className="zn-converter-progress-fill" style={{ width: `${corePct}%` }} />
					</div>
				</div>
			);
		}

		if (runtimeStatus?.core_installed) {
			return (
				<div className="zn-core-banner ready">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon ready">
								<CheckCircle2 size={15} />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">
									<span>{c.runtime.readyTitle}</span>
									{runtimeStatus.version && (
										<span className="zn-core-version-pill">v{runtimeStatus.version}</span>
									)}
								</div>
								<div className="zn-core-desc">{c.runtime.readyDesc(runtimeStatus.version)}</div>
							</div>
						</div>
					</div>
				</div>
			);
		}

		if (statusChecking && runtimeStatus === null) {
			return (
				<div className="zn-core-banner">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon">
								<Loader2 size={15} className="zn-spin" />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.checking}</div>
							</div>
						</div>
					</div>
				</div>
			);
		}

		if (statusError && runtimeStatus === null) {
			return (
				<div className="zn-core-banner missing">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon missing">
								<AlertCircle size={15} />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.statusCheckFailedTitle}</div>
							</div>
						</div>
						<button
							type="button"
							className="settings-btn zn-converter-primary-btn"
							onClick={refreshStatusAndPacks}
						>
							<RefreshCw size={13} />
							<span>{c.runtime.retryCheckButton}</span>
						</button>
					</div>
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{statusError}</span>
					</div>
				</div>
			);
		}

		return (
			<div className="zn-core-banner missing">
				<div className="zn-core-banner-top">
					<div className="zn-core-banner-info">
						<div className="zn-core-status-icon missing">
							<Cpu size={15} />
						</div>
						<div className="zn-core-text">
							<div className="zn-core-title">{c.runtime.missingTitle}</div>
							<div className="zn-core-desc">{c.runtime.missingDesc}</div>
						</div>
					</div>
					<button
						type="button"
						className="settings-btn zn-converter-primary-btn"
						onClick={handleEnsureCore}
					>
						<Download size={13} />
						<span>{coreError ? c.runtime.retryButton : c.runtime.setupButton}</span>
					</button>
				</div>
				{coreError && (
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{coreError}</span>
					</div>
				)}
			</div>
		);
	};

	const renderPackCard = (pack: EnginePackInfo) => {
		const meta = c.packs.catalog[pack.id];
		const displayName = meta?.name ?? pack.id;
		const formatsLabel = meta?.formats ?? pack.converters.join(" · ").toUpperCase();
		const descText = meta?.desc ?? pack.unavailable_reason ?? "";
		const op = activeEngineOp[pack.id];
		const progress = engineProgress[pack.id];
		const errorMsg = packErrors[pack.id];

		let badgeLabel = c.packs.statusNotInstalled;
		let badgeClass = "notinstalled";
		if (pack.status === "installed") {
			if (pack.outdated) {
				badgeLabel = c.packs.statusOutdated;
				badgeClass = "outdated";
			} else {
				badgeLabel = c.packs.statusInstalled;
				badgeClass = "installed";
			}
		} else if (pack.status === "owncopy") {
			badgeLabel = pack.from_system ? c.packs.statusSystemCopy : c.packs.statusCustomCopy;
			badgeClass = "owncopy";
		}

		const progressPct = Math.max(0, Math.min(100, Math.round((progress?.fraction ?? 0) * 100)));
		const progressStageText =
			progress?.stage === "downloading"
				? c.packs.stageDownloading
				: progress?.stage === "copying"
					? c.packs.stageCopying
					: progress?.stage === "unpacking"
						? c.packs.stageUnpacking
						: c.packs.stageWorking;

		return (
			<div key={pack.id} className={`zn-pack-card status-${badgeClass}`}>
				<div className="zn-pack-card-main">
					<div className="zn-pack-card-info">
						<div className="zn-pack-card-header">
							<span className="zn-pack-name">{displayName}</span>
							{pack.version && pack.status !== "owncopy" && (
								<span className="zn-pack-version">v{pack.version}</span>
							)}
							<span className={`zn-pack-badge ${badgeClass}`}>{badgeLabel}</span>
						</div>
						{formatsLabel && <div className="zn-pack-formats">{formatsLabel}</div>}
						{descText && <div className="zn-pack-desc">{descText}</div>}
						<div className="zn-pack-meta">
							{pack.status === "owncopy" && pack.folder ? (
								<span className="zn-pack-folder" dir="ltr">
									{pack.folder}
								</span>
							) : pack.status === "installed" ? (
								<span>{c.packs.installedSize(formatPackSize(pack.installed_size))}</span>
							) : pack.downloadable ? (
								<span>
									{c.packs.downloadSize(formatPackSize(pack.download_size))} ·{" "}
									{c.packs.installedSize(formatPackSize(pack.installed_size))}
								</span>
							) : (
								<span>{pack.unavailable_reason || c.packs.unavailable}</span>
							)}
						</div>
					</div>

					<div className="zn-pack-actions">
						{op ? (
							<button type="button" className="settings-btn zn-pack-btn" disabled>
								<Loader2 size={12} className="zn-spin" />
								<span>{op === "removing" ? c.packs.removing : c.packs.installing}</span>
							</button>
						) : pack.status === "installed" ? (
							<>
								{pack.outdated && pack.downloadable && (
									<button
										type="button"
										className="settings-btn zn-converter-primary-btn zn-pack-btn"
										onClick={() => handleInstallPack(pack.id)}
										disabled={isCoreInstalling}
									>
										<Download size={12} />
										<span>{c.packs.update}</span>
									</button>
								)}
								<button
									type="button"
									className="settings-btn zn-pack-btn zn-pack-remove-btn"
									onClick={() => handleRemovePack(pack.id)}
								>
									<Trash2 size={12} />
									<span>{c.packs.remove}</span>
								</button>
							</>
						) : pack.status === "owncopy" ? null : pack.downloadable ? (
							<button
								type="button"
								className="settings-btn zn-converter-primary-btn zn-pack-btn"
								onClick={() => handleInstallPack(pack.id)}
								disabled={isCoreInstalling}
							>
								<Download size={12} />
								<span>{c.packs.install}</span>
							</button>
						) : (
							<button type="button" className="settings-btn zn-pack-btn" disabled>
								<span>{c.packs.unavailable}</span>
							</button>
						)}
					</div>
				</div>

				{op === "installing" && (
					<div className="zn-pack-progress">
						<div className="zn-pack-progress-meta">
							<span>
								{progressStageText}
								{progress?.component && progress.component !== pack.id
									? ` · ${progress.component}`
									: ""}
							</span>
							<span className="zn-pack-progress-nums">
								{progress && progress.bytes_total > 0
									? `${formatTransferAmount(progress.bytes_done)} / ${formatTransferAmount(progress.bytes_total)} · `
									: ""}
								{progressPct}%
							</span>
						</div>
						<div className="zn-converter-progress-track">
							<div
								className="zn-converter-progress-fill"
								style={{ width: `${Math.max(progress ? progressPct : 6, 0)}%` }}
							/>
						</div>
					</div>
				)}

				{errorMsg && (
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{errorMsg}</span>
					</div>
				)}
			</div>
		);
	};

	const resolveCatalogEntry = (id: string): TargetOption | undefined =>
		customMatcherInputs.extraPresets?.[id] ?? DEFAULT_PRESET_CATALOG[id];

	const renderFaceColumn = (face: "primary" | "secondary", ids: string[]) => {
		const faceTitle = face === "primary" ? c.donutEditor.face1Title : c.donutEditor.face2Title;
		const existingSet = new Set(ids);
		const activeCat = (activeProfile?.category as FileCategory) || "mixed";
		const compatibleIds = getCompatibleCatalogIdsForCategory(activeCat).filter(
			(id) => !existingSet.has(id)
		);
		const compatSet = new Set(compatibleIds);
		const customPresetEntries = converterState.presets.filter(
			(p) => !existingSet.has(p.id) && !(p.id in DEFAULT_PRESET_CATALOG)
		);
		const remainingCatalogIds = Object.keys(DEFAULT_PRESET_CATALOG).filter(
			(id) => !existingSet.has(id) && !compatSet.has(id)
		);

		return (
			<div className="zn-conv-slice-face-card">
				<div className="zn-conv-slice-face-header">
					<span className="zn-conv-slice-face-title">{faceTitle}</span>
					<span className="zn-conv-slice-count-pill">{ids.length}</span>
				</div>

				<div className="zn-conv-slice-list">
					{ids.length === 0 ? (
						<div className="zn-conv-slice-empty">{c.donutEditor.emptyFace}</div>
					) : (
						ids.map((sliceId, index) => {
							const opt = resolveCatalogEntry(sliceId);
							const fmtBadge =
								opt && opt.format !== "*" && opt.format !== "*audio"
									? opt.format.toUpperCase()
									: sliceId;
							const isDragTarget =
								dragOverSlice?.face === face && dragOverSlice?.index === index;

							return (
								<div
									key={`${face}-${sliceId}-${index}`}
									className={`zn-conv-slice-row ${isDragTarget ? "is-drag-target" : ""}`}
									draggable
									onDragStart={(e) => {
										e.dataTransfer.effectAllowed = "move";
										e.dataTransfer.setData("text/plain", String(index));
										setDragSlice({ face, index });
									}}
									onDragOver={(e) => {
										if (dragSlice && dragSlice.face === face) {
											e.preventDefault();
											if (dragOverSlice?.index !== index || dragOverSlice?.face !== face) {
												setDragOverSlice({ face, index });
											}
										}
									}}
									onDrop={(e) => {
										e.preventDefault();
										if (dragSlice && dragSlice.face === face) {
											handleMoveSlice(face, dragSlice.index, index);
										}
										setDragSlice(null);
										setDragOverSlice(null);
									}}
									onDragEnd={() => {
										setDragSlice(null);
										setDragOverSlice(null);
									}}
								>
									<span className="zn-conv-slice-drag-grip" aria-hidden>
										<GripVertical size={12} />
									</span>
									<div className="zn-conv-slice-info">
										<span className="zn-conv-slice-label">{opt?.label ?? sliceId}</span>
										<span className="zn-conv-slice-fmt">{fmtBadge}</span>
										{opt?.requiredEngine && (
											<span className="zn-conv-slice-engine">+{opt.requiredEngine}</span>
										)}
									</div>
									<div className="zn-conv-slice-row-actions">
										<button
											type="button"
											className="zn-icon-action-btn"
											disabled={index === 0}
											onClick={() => handleMoveSlice(face, index, index - 1)}
											title={c.donutEditor.moveUp}
											aria-label={c.donutEditor.moveUp}
										>
											<ChevronUp size={12} />
										</button>
										<button
											type="button"
											className="zn-icon-action-btn"
											disabled={index === ids.length - 1}
											onClick={() => handleMoveSlice(face, index, index + 1)}
											title={c.donutEditor.moveDown}
											aria-label={c.donutEditor.moveDown}
										>
											<ChevronDown size={12} />
										</button>
										<button
											type="button"
											className="zn-icon-action-btn"
											onClick={() => handleJumpToPresetFromSlice(sliceId)}
											title={c.donutEditor.editPreset}
											aria-label={c.donutEditor.editPreset}
										>
											<Sliders size={11} />
										</button>
										<button
											type="button"
											className="zn-icon-action-btn danger"
											onClick={() => handleRemoveSlice(face, index)}
											title={c.donutEditor.removeSlice}
											aria-label={c.donutEditor.removeSlice}
										>
											<X size={12} />
										</button>
									</div>
								</div>
							);
						})
					)}
				</div>

				<div className="zn-conv-slice-add-row">
					<ZenithSelect
						className="settings-select zn-conv-slice-add-select"
						value={addSliceSelection[face]}
						onChange={(e) => {
							const val = e.target.value;
							if (val) {
								handleAddSlice(face, val);
							}
						}}
						aria-label={c.donutEditor.addSlicePlaceholder}
					>
						<option value="" disabled>
							{c.donutEditor.addSlicePlaceholder}
						</option>
						{customPresetEntries.length > 0 && (
							<option value={`__hdr_custom_${face}`} disabled>
								— {c.donutEditor.customPresetsGroup} —
							</option>
						)}
						{customPresetEntries.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name || p.id} ({p.target_format.toUpperCase()})
							</option>
						))}
						{compatibleIds.length > 0 && (
							<option value={`__hdr_compat_${face}`} disabled>
								— {c.donutEditor.compatibleGroup} —
							</option>
						)}
						{compatibleIds.map((id) => {
							const opt = resolveCatalogEntry(id);
							return (
								<option key={id} value={id}>
									{opt?.label ?? id}
								</option>
							);
						})}
						{remainingCatalogIds.length > 0 && (
							<option value={`__hdr_all_${face}`} disabled>
								— {c.donutEditor.allCatalogGroup} —
							</option>
						)}
						{remainingCatalogIds.map((id) => {
							const opt = resolveCatalogEntry(id);
							return (
								<option key={id} value={id}>
									{opt?.label ?? id}
								</option>
							);
						})}
					</ZenithSelect>
				</div>
			</div>
		);
	};

	const renderDonutSubTab = () => {
		const isBuiltInPreset = Boolean(DEFAULT_PRESET_CATALOG[presetDraft.id]);
		const isSavedInState = converterState.presets.some((p) => p.id === presetDraft.id);
		const isIsoTarget = presetDraft.target_format.trim().toLowerCase() === "iso";
		const builtInIds = Object.keys(DEFAULT_PRESET_CATALOG);

		return (
			<div key="donut" className="zn-converter-panel">
				{stateError && (
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{stateError}</span>
					</div>
				)}

				{/* Donut Slice Layout Editor */}
				<div className="zn-converter-section-card">
					<div className="zn-converter-section-head">
						<div className="zn-converter-section-title-col">
							<div className="zn-converter-section-title">
								<span>{c.donutEditor.profilesLabel}</span>
								{profileSaveStatus === "saving" && (
									<span className="zn-conv-slice-count-pill">{c.donutEditor.saving}</span>
								)}
								{profileSaveStatus === "saved" && (
									<span className="zn-converter-save-pill">{c.donutEditor.saved}</span>
								)}
							</div>
							<div className="zn-converter-section-desc">{c.donutEditor.profilesDesc}</div>
						</div>

						<div className="zn-converter-section-actions">
							<button
								type="button"
								className="settings-btn"
								onClick={handleResetCategoryProfile}
								disabled={!activeProfile || !customizedProfileIds.has(activeProfile.id)}
							>
								<RotateCcw size={11} />
								<span>{c.donutEditor.resetCategory}</span>
							</button>
							<button
								type="button"
								className="settings-btn"
								onClick={handleResetAllProfiles}
								disabled={customizedProfileIds.size === 0}
							>
								<span>{c.donutEditor.resetAll}</span>
							</button>
						</div>
					</div>

					<div className="zn-converter-category-pills">
						{mergedProfiles.map((profile) => {
							const label = c.donut.categories[profile.category] ?? profile.label;
							const isActive = profile.id === activeProfile?.id;
							const isEdited = customizedProfileIds.has(profile.id);
							return (
								<button
									key={profile.id}
									type="button"
									className={`zn-conv-cat-pill ${isActive ? "active" : ""}`}
									onClick={() => setSelectedProfileId(profile.id)}
								>
									<span>{label}</span>
									{isEdited && (
										<span
											className="zn-conv-cat-dot"
											title={c.donutEditor.customizedBadge}
											aria-label={c.donutEditor.customizedBadge}
										/>
									)}
								</button>
							);
						})}
					</div>

					{activeProfile && (
						<div className="zn-conv-slice-faces-grid">
							{renderFaceColumn("primary", activeProfile.primary_ids)}
							{renderFaceColumn("secondary", activeProfile.secondary_ids)}
						</div>
					)}
				</div>

				{/* Preset & CLI Options Editor */}
				<div ref={presetEditorRef} className="zn-converter-section-card">
					<div className="zn-converter-section-head">
						<div className="zn-converter-section-title-col">
							<div className="zn-converter-section-title">
								<span>{c.presets.groupLabel}</span>
								<span
									className={`zn-preset-kind-badge ${!isBuiltInPreset ? "is-custom" : ""}`}
								>
									{isBuiltInPreset ? c.presets.builtInTag : c.presets.customTag}
								</span>
								{presetSavedFlash && (
									<span className="zn-converter-save-pill">{c.donutEditor.saved}</span>
								)}
							</div>
							<div className="zn-converter-section-desc">{c.presets.groupDesc}</div>
						</div>

						<div className="zn-converter-section-actions">
							<button type="button" className="settings-btn" onClick={handleNewPreset}>
								<Plus size={12} />
								<span>{c.presets.newPreset}</span>
							</button>
						</div>
					</div>

					<div className="zn-preset-toolbar">
						<ZenithSelect
							className="settings-select zn-preset-select"
							value={isCreatingPreset ? "__creating__" : selectedPresetId}
							onChange={(e) => {
								if (e.target.value !== "__creating__") {
									handleSelectPresetForEdit(e.target.value);
								}
							}}
							aria-label={c.presets.selectLabel}
						>
							{isCreatingPreset && (
								<option value="__creating__">
									{presetDraft.name.trim() || c.presets.newPreset}
								</option>
							)}
							{converterState.presets.length > 0 && (
								<option value="__hdr_saved_presets" disabled>
									— {c.presets.customGroup} —
								</option>
							)}
							{converterState.presets.map((p) => (
								<option key={`saved-${p.id}`} value={p.id}>
									{p.name} ({p.target_format.toUpperCase()})
								</option>
							))}
							<option value="__hdr_builtin_presets" disabled>
								— {c.presets.builtInGroup} —
							</option>
							{builtInIds
								.filter((id) => !converterState.presets.some((sp) => sp.id === id))
								.map((id) => {
									const opt = DEFAULT_PRESET_CATALOG[id];
									return (
										<option key={`bi-${id}`} value={id}>
											{opt.label} ({opt.format.toUpperCase()})
										</option>
									);
								})}
						</ZenithSelect>
					</div>

					<div className="zn-preset-form-grid">
						<div className="zn-preset-field">
							<label className="zn-preset-field-label" htmlFor="zn-preset-name">
								{c.presets.nameLabel}
							</label>
							<input
								id="zn-preset-name"
								type="text"
								className="settings-text-input"
								value={presetDraft.name}
								placeholder={c.presets.namePlaceholder}
								onChange={(e) =>
									setPresetDraft((prev) => ({ ...prev, name: e.target.value }))
								}
							/>
						</div>

						<div className="zn-preset-field">
							<label className="zn-preset-field-label" htmlFor="zn-preset-format">
								{c.presets.targetFormatLabel}
							</label>
							<input
								id="zn-preset-format"
								type="text"
								className="settings-text-input"
								dir="ltr"
								disabled={isBuiltInPreset}
								value={presetDraft.target_format}
								placeholder={c.presets.targetFormatPlaceholder}
								onChange={(e) =>
									setPresetDraft((prev) => ({ ...prev, target_format: e.target.value }))
								}
							/>
						</div>

						<div className="zn-preset-field full-span">
							<div className="zn-preset-field-label-row">
								<span className="zn-preset-field-label">{c.presets.qualityLabel}</span>
								<label className="zn-preset-inline-check">
									<input
										type="checkbox"
										checked={presetDraft.quality !== null && presetDraft.quality !== undefined}
										onChange={(e) =>
											setPresetDraft((prev) => ({
												...prev,
												quality: e.target.checked ? prev.quality ?? 85 : null
											}))
										}
									/>
									<span>
										{presetDraft.quality !== null && presetDraft.quality !== undefined
											? c.presets.qualityUseCustom
											: c.presets.qualityDefault}
									</span>
								</label>
							</div>
							{presetDraft.quality !== null && presetDraft.quality !== undefined && (
								<div className="zn-preset-quality-row">
									<input
										type="range"
										min={1}
										max={100}
										className="settings-slider zn-preset-quality-slider"
										value={presetDraft.quality}
										onChange={(e) =>
											setPresetDraft((prev) => ({
												...prev,
												quality: Number(e.target.value)
											}))
										}
									/>
									<span className="zn-preset-quality-val">{presetDraft.quality}</span>
								</div>
							)}
						</div>

						<div className="zn-preset-field">
							<label className="zn-preset-field-label" htmlFor="zn-preset-pages">
								{c.presets.pagesLabel}
							</label>
							<input
								id="zn-preset-pages"
								type="text"
								className="settings-text-input"
								dir="ltr"
								value={presetDraft.pages ?? ""}
								placeholder={c.presets.pagesPlaceholder}
								onChange={(e) =>
									setPresetDraft((prev) => ({
										...prev,
										pages: e.target.value || null
									}))
								}
							/>
						</div>

						<div className="zn-preset-field">
							<span className="zn-preset-field-label">{c.presets.conflictLabel}</span>
							<ZenithSelect
								className="settings-select"
								value={(presetDraft.conflict as ConflictPolicy) || "rename"}
								onChange={(e) =>
									setPresetDraft((prev) => ({
										...prev,
										conflict: e.target.value as ConflictPolicy
									}))
								}
							>
								<option value="rename">{c.presets.conflictRename}</option>
								<option value="overwrite">{c.presets.conflictOverwrite}</option>
								<option value="skip">{c.presets.conflictSkip}</option>
							</ZenithSelect>
						</div>

						<div className="zn-preset-field">
							<span className="zn-preset-field-label">{c.presets.splitModeLabel}</span>
							<ZenithSelect
								className="settings-select"
								value={presetSplitMode}
								onChange={(e) => {
									const next = e.target.value as "none" | "every" | "parts";
									setPresetSplitMode(next);
									if (next === "every") {
										const val = presetDraft.split_every || 5;
										setPresetSplitInput(String(val));
										setPresetDraft((prev) => ({
											...prev,
											split_every: val,
											split_parts: null
										}));
									} else if (next === "parts") {
										const val = presetDraft.split_parts || 2;
										setPresetSplitInput(String(val));
										setPresetDraft((prev) => ({
											...prev,
											split_every: null,
											split_parts: val
										}));
									} else {
										setPresetDraft((prev) => ({
											...prev,
											split_every: null,
											split_parts: null
										}));
									}
								}}
							>
								<option value="none">{c.presets.splitNone}</option>
								<option value="every">{c.presets.splitEvery}</option>
								<option value="parts">{c.presets.splitParts}</option>
							</ZenithSelect>
						</div>

						{presetSplitMode !== "none" && (
							<div className="zn-preset-field">
								<label className="zn-preset-field-label" htmlFor="zn-preset-split-val">
									{presetSplitMode === "every"
										? c.presets.splitEveryLabel
										: c.presets.splitPartsLabel}
								</label>
								<input
									id="zn-preset-split-val"
									type="number"
									min={presetSplitMode === "every" ? 1 : 2}
									max={9999}
									className="settings-text-input"
									dir="ltr"
									value={presetSplitInput}
									onChange={(e) => {
										const raw = e.target.value;
										setPresetSplitInput(raw);
										const num = Number.parseInt(raw, 10);
										if (Number.isFinite(num)) {
											setPresetDraft((prev) =>
												presetSplitMode === "every"
													? { ...prev, split_every: Math.max(1, num), split_parts: null }
													: { ...prev, split_parts: Math.max(2, num), split_every: null }
											);
										}
									}}
								/>
							</div>
						)}

						{isIsoTarget && (
							<>
								<div className="zn-preset-field">
									<span className="zn-preset-field-label">{c.presets.isoFsLabel}</span>
									<ZenithSelect
										className="settings-select"
										value={(presetDraft.iso_filesystem as IsoFilesystem) || ""}
										onChange={(e) =>
											setPresetDraft((prev) => ({
												...prev,
												iso_filesystem: e.target.value || null
											}))
										}
									>
										<option value="">{c.presets.isoFsDefault}</option>
										<option value="joliet">{c.presets.isoFsJoliet}</option>
										<option value="udf201">{c.presets.isoFsUdf}</option>
									</ZenithSelect>
								</div>

								<div className="zn-preset-field">
									<label className="zn-preset-field-label" htmlFor="zn-preset-iso-label">
										{c.presets.isoLabelField}
									</label>
									<input
										id="zn-preset-iso-label"
										type="text"
										className="settings-text-input"
										dir="ltr"
										value={presetDraft.iso_label ?? ""}
										placeholder={c.presets.isoLabelPlaceholder}
										onChange={(e) =>
											setPresetDraft((prev) => ({
												...prev,
												iso_label: e.target.value || null
											}))
										}
									/>
								</div>
							</>
						)}

						<div className="zn-preset-field full-span">
							<div className="zn-preset-toggles">
								<div className="zn-preset-toggle-row">
									<div className="zn-preset-toggle-info">
										<span className="zn-preset-toggle-title">{c.presets.keepDatesLabel}</span>
										<span className="zn-preset-toggle-desc">{c.presets.keepDatesDesc}</span>
									</div>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={Boolean(presetDraft.keep_dates)}
											onChange={(e) =>
												setPresetDraft((prev) => ({
													...prev,
													keep_dates: e.target.checked
												}))
											}
										/>
										<span className="slider" />
									</label>
								</div>

								<div className="zn-preset-toggle-row">
									<div className="zn-preset-toggle-info">
										<span className="zn-preset-toggle-title">{c.presets.zipLabel}</span>
										<span className="zn-preset-toggle-desc">{c.presets.zipDesc}</span>
									</div>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={Boolean(presetDraft.zip)}
											onChange={(e) =>
												setPresetDraft((prev) => ({
													...prev,
													zip: e.target.checked
												}))
											}
										/>
										<span className="slider" />
									</label>
								</div>
							</div>
						</div>
					</div>

					{presetError && (
						<div className="zn-converter-error-banner" role="alert">
							<AlertCircle size={13} />
							<span>{presetError}</span>
						</div>
					)}

					<div className="zn-preset-footer">
						<div className="zn-preset-footer-group">
							{activeProfile && (
								<>
									<button
										type="button"
										className="settings-btn"
										onClick={() => handleAddPresetToFace("primary")}
									>
										<span>{c.presets.addToFace1}</span>
									</button>
									<button
										type="button"
										className="settings-btn"
										onClick={() => handleAddPresetToFace("secondary")}
									>
										<span>{c.presets.addToFace2}</span>
									</button>
								</>
							)}
						</div>

						<div className="zn-preset-footer-group">
							{isSavedInState && (
								<button
									type="button"
									className="settings-btn zn-pack-remove-btn"
									onClick={handleDeleteOrResetPreset}
								>
									<Trash2 size={12} />
									<span>
										{isBuiltInPreset ? c.presets.resetOverride : c.presets.deletePreset}
									</span>
								</button>
							)}
							<button
								type="button"
								className="settings-btn zn-converter-primary-btn"
								onClick={handleSavePreset}
							>
								<Save size={12} />
								<span>{c.presets.savePreset}</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	};

	const renderRecentRow = (item: RecentConversion) => {
		const cat = detectInputCategory(item.source_ext || item.output_format);
		const Icon = iconForCategory(cat);
		const normalizedStatus = item.status.toLowerCase();
		const statusLabel =
			normalizedStatus === "skipped"
				? c.history.statusSkipped
				: normalizedStatus === "failed"
					? c.history.statusFailed
					: c.history.statusDone;
		const statusClass =
			normalizedStatus === "skipped"
				? "is-skipped"
				: normalizedStatus === "failed"
					? "is-failed"
					: "is-done";
		const srcLabel = (item.source_ext || "FILE").toUpperCase();
		const outLabel = (item.output_format || "FILE").toUpperCase();
		const canOpen = Boolean(item.output_path) && normalizedStatus !== "failed";
		const revealPath = item.output_path || item.source_path;

		return (
			<div key={item.id} className="zn-recent-item">
				<div className="zn-recent-main">
					<div className="zn-recent-thumb">
						{item.thumbnail_data_url ? (
							<img src={item.thumbnail_data_url} alt="" />
						) : (
							<Icon size={16} strokeWidth={1.7} />
						)}
					</div>
					<div className="zn-recent-info">
						<div className="zn-recent-name" title={item.source_path}>
							{item.source_name}
						</div>
						<div className="zn-recent-meta">
							<span className="zn-recent-flow-badge" dir="ltr">
								{srcLabel} → {outLabel}
							</span>
							<span className={`zn-recent-status ${statusClass}`}>{statusLabel}</span>
							<span>{formatTimestamp(item.timestamp_ms)}</span>
						</div>
					</div>
				</div>

				<div className="zn-recent-actions">
					{canOpen && (
						<button
							type="button"
							className="settings-btn"
							onClick={() => handleOpenOutput(item.output_path, false)}
							title={c.history.openFile}
						>
							<ExternalLink size={11} />
							<span>{c.history.openFile}</span>
						</button>
					)}
					{revealPath && (
						<button
							type="button"
							className="settings-btn"
							onClick={() => handleOpenOutput(revealPath, true)}
							title={c.history.revealInFolder}
						>
							<FolderOpen size={11} />
							<span>{c.history.revealInFolder}</span>
						</button>
					)}
				</div>
			</div>
		);
	};

	const renderHistorySubTab = () => {
		const dropPct = Math.max(0, Math.min(100, Math.round((dropJob?.fraction ?? 0) * 100)));
		const pendingPackName = pendingDropInstall?.engineId
			? c.packs.catalog[pendingDropInstall.engineId]?.name ?? pendingDropInstall.engineId
			: null;

		return (
			<div key="history" className="zn-converter-panel">
				{/* Interactive Settings Drop Zone */}
				<div className="zn-converter-section-card">
					<div className="zn-converter-section-head">
						<div className="zn-converter-section-title-col">
							<div className="zn-converter-section-title">
								<span>{c.dropZone.groupLabel}</span>
							</div>
						</div>
						<div className="zn-converter-section-actions">
							<button
								type="button"
								className="settings-btn"
								onClick={handleBrowseDropZoneFiles}
							>
								<FolderOpen size={12} />
								<span>{c.dropZone.browseFiles}</span>
							</button>
							{queuedFiles.length > 0 && (
								<button
									type="button"
									className="settings-btn"
									onClick={() => {
										setQueuedFiles([]);
										setPendingDropInstall(null);
										setDropJob(null);
									}}
								>
									<span>{c.dropZone.clearFiles}</span>
								</button>
							)}
						</div>
					</div>

					<div
						className={`zn-dropzone-area ${isDropOver ? "is-dragover" : ""}`}
						onDragOver={(e) => {
							e.preventDefault();
							if (!isDropOver) setIsDropOver(true);
						}}
						onDragLeave={() => setIsDropOver(false)}
						onDrop={(e) => {
							e.preventDefault();
							setIsDropOver(false);
							const files = Array.from(e.dataTransfer?.files ?? []);
							const paths = files
								.map((f) => (f as File & { path?: string }).path)
								.filter((p): p is string => Boolean(p && p.trim()));
							if (paths.length > 0) {
								setQueuedFiles((prev) => {
									const merged = [...prev];
									for (const p of paths) {
										if (!merged.includes(p)) merged.push(p);
									}
									return merged;
								});
								setPendingDropInstall(null);
							}
						}}
					>
						<div className="zn-dropzone-icon">
							<Upload size={16} strokeWidth={1.8} />
						</div>
						<div className="zn-dropzone-title">
							{isDropOver ? c.dropZone.activeTitle : c.dropZone.title}
						</div>
						<div className="zn-dropzone-desc">{c.dropZone.desc}</div>
					</div>

					{queuedFiles.length > 0 && dropZoneDonutSides && (
						<div className="zn-dropzone-queued">
							<div className="zn-dropzone-files-bar">
								<span className="zn-conv-slice-count-pill">
									{c.dropZone.queuedFiles(queuedFiles.length)} ·{" "}
									{c.donut.categories[dropZoneDonutSides.detectedCategory] ??
										dropZoneDonutSides.detectedCategory}
								</span>
							</div>

							<div className="zn-dropzone-chips">
								{queuedFiles.map((filePath) => (
									<span key={filePath} className="zn-dropzone-file-chip" title={filePath}>
										<span className="zn-dropzone-file-name">{extractBaseName(filePath)}</span>
										<button
											type="button"
											className="zn-dropzone-chip-x"
											onClick={() =>
												setQueuedFiles((prev) => prev.filter((p) => p !== filePath))
											}
											aria-label={c.donutEditor.removeSlice}
										>
											<X size={11} />
										</button>
									</span>
								))}
							</div>

							{dropZoneDonutSides.primary.length > 0 && (
								<div className="zn-dropzone-targets-group">
									<div className="zn-dropzone-targets-label">{c.dropZone.primaryTargets}</div>
									<div className="zn-dropzone-pills">
										{dropZoneDonutSides.primary.map((opt, idx) => (
											<button
												key={`dz-p-${opt.presetId ?? opt.format}-${idx}`}
												type="button"
												className="zn-target-pill-btn"
												disabled={dropJob?.status === "converting"}
												onClick={() => handleDropTargetClick(opt)}
											>
												<span>{opt.label}</span>
												{opt.requiredEngine && (
													<span className="zn-target-pill-engine">
														+{opt.requiredEngine}
													</span>
												)}
											</button>
										))}
									</div>
								</div>
							)}

							{dropZoneDonutSides.secondary.length > 0 && (
								<div className="zn-dropzone-targets-group">
									<div className="zn-dropzone-targets-label">{c.dropZone.secondaryTargets}</div>
									<div className="zn-dropzone-pills">
										{dropZoneDonutSides.secondary.map((opt, idx) => (
											<button
												key={`dz-s-${opt.presetId ?? opt.format}-${idx}`}
												type="button"
												className="zn-target-pill-btn"
												disabled={dropJob?.status === "converting"}
												onClick={() => handleDropTargetClick(opt)}
											>
												<span>{opt.label}</span>
												{opt.requiredEngine && (
													<span className="zn-target-pill-engine">
														+{opt.requiredEngine}
													</span>
												)}
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{pendingDropInstall && (
						<div className="zn-dropzone-job-box">
							<div className="zn-dropzone-job-top">
								<span>
									{pendingPackName
										? c.dropZone.requiresPackNotice(pendingPackName)
										: c.dropZone.requiresCoreNotice}
								</span>
								<button
									type="button"
									className="zn-icon-action-btn"
									disabled={pendingDropInstall.installing}
									onClick={() => setPendingDropInstall(null)}
									aria-label={t.common.cancel}
								>
									<X size={12} />
								</button>
							</div>
							{pendingDropInstall.error && (
								<div className="zn-converter-error-banner" role="alert">
									<AlertCircle size={13} />
									<span>{pendingDropInstall.error}</span>
								</div>
							)}
							<div className="zn-dropzone-done-actions">
								<button
									type="button"
									className="settings-btn zn-converter-primary-btn"
									disabled={
										pendingDropInstall.installing ||
										Boolean(
											pendingDropInstall.enginePack &&
												!pendingDropInstall.enginePack.downloadable
										)
									}
									onClick={handleConfirmDropInstall}
								>
									{pendingDropInstall.installing ? (
										<Loader2 size={12} className="zn-spin" />
									) : (
										<Download size={12} />
									)}
									<span>
										{pendingPackName
											? c.dropZone.installPackAction(pendingPackName)
											: c.dropZone.setupCoreAction}
									</span>
								</button>
							</div>
						</div>
					)}

					{dropJob && (
						<div className="zn-dropzone-job-box">
							<div className="zn-dropzone-job-top">
								<span>
									{dropJob.status === "converting"
										? `${c.dropZone.converting} (${dropJob.targetLabel}) · ${dropPct}%`
										: dropJob.status === "done"
											? `${c.dropZone.doneTitle} · ${dropJob.targetLabel}`
											: dropJob.status === "cancelled"
												? c.donut.cancelledTitle
												: c.donut.failedTitle}
								</span>
								{dropJob.status === "converting" ? (
									<button
										type="button"
										className="settings-btn"
										onClick={handleCancelDropJob}
									>
										<X size={11} />
										<span>{c.dropZone.cancel}</span>
									</button>
								) : (
									<button
										type="button"
										className="zn-icon-action-btn"
										onClick={() => setDropJob(null)}
										aria-label={c.donut.dismiss}
									>
										<X size={12} />
									</button>
								)}
							</div>

							{dropJob.status === "converting" && (
								<div className="zn-converter-progress-track">
									<div
										className="zn-converter-progress-fill"
										style={{ width: `${Math.max(dropPct, 6)}%` }}
									/>
								</div>
							)}

							{dropJob.status === "error" && dropJob.error && (
								<div className="zn-converter-error-banner" role="alert">
									<AlertCircle size={13} />
									<span>{dropJob.error}</span>
								</div>
							)}

							{dropJob.status === "done" && dropJob.outputs.length > 0 && (
								<div className="zn-dropzone-done-actions">
									<button
										type="button"
										className="settings-btn"
										onClick={() => handleOpenOutput(dropJob.outputs[0], false)}
									>
										<ExternalLink size={11} />
										<span>{c.dropZone.openOutput}</span>
									</button>
									<button
										type="button"
										className="settings-btn"
										onClick={() => handleOpenOutput(dropJob.outputs[0], true)}
									>
										<FolderOpen size={11} />
										<span>{c.dropZone.showInFolder}</span>
									</button>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Watch Folders */}
				<div className="zn-converter-section-card">
					<div className="zn-converter-section-head">
						<div className="zn-converter-section-title-col">
							<div className="zn-converter-section-title">
								<FolderSync size={15} strokeWidth={1.8} />
								<span>{c.history.watchTitle}</span>
								<span className="zn-conv-slice-count-pill">
									{converterState.watch_rules.length}
								</span>
							</div>
							<div className="zn-converter-section-desc">{c.history.watchDesc}</div>
						</div>
						<div className="zn-converter-section-actions">
							<button
								type="button"
								className="settings-btn zn-converter-primary-btn"
								disabled={watchSaving}
								onClick={handleOpenNewWatchForm}
							>
								<Plus size={12} />
								<span>{c.history.watchAdd}</span>
							</button>
						</div>
					</div>

					{watchError && (
						<div className="zn-converter-error-banner" role="alert">
							<AlertCircle size={13} />
							<span>{watchError}</span>
						</div>
					)}

					{watchEditorOpen && (
						<div className="zn-watch-editor-card">
							<div className="zn-preset-form-grid">
								<div className="zn-preset-field full-span">
									<label className="zn-preset-field-label" htmlFor="zn-watch-folder-input">
										{c.history.watchFolderLabel}
									</label>
									<div className="zn-converter-folder-control">
										<input
											id="zn-watch-folder-input"
											type="text"
											dir="ltr"
											className="settings-text-input zn-watch-path-input"
											value={watchDraft.folder}
											placeholder={c.history.watchFolderPlaceholder}
											onChange={(e) =>
												setWatchDraft((prev) => ({
													...prev,
													folder: e.target.value
												}))
											}
										/>
										<button
											type="button"
											className="settings-btn"
											onClick={() => handleBrowseWatchFolder("folder")}
										>
											{t.common.browseDots}
										</button>
									</div>
								</div>

								<div className="zn-preset-field">
									<span className="zn-preset-field-label">
										{c.history.watchTargetLabel}
									</span>
									<ZenithSelect
										className="settings-select"
										value={
											watchTargetMode === "custom"
												? "__custom__"
												: watchDraft.preset_id || "to-pdf"
										}
										onChange={(e) => {
											const val = e.target.value;
											if (val === "__custom__") {
												setWatchTargetMode("custom");
												setWatchCustomFormat((prev) =>
													prev || (watchDraft.target_format !== "*" ? watchDraft.target_format : "webp")
												);
											} else {
												setWatchTargetMode("preset");
												const savedMatch = watchTargetGroups.savedOptions.find(
													(o) => o.id === val
												);
												const builtInMatch = watchTargetGroups.builtInOptions.find(
													(o) => o.id === val
												);
												setWatchDraft((prev) => ({
													...prev,
													preset_id: val,
													target_format:
														savedMatch?.targetFormat ??
														builtInMatch?.targetFormat ??
														prev.target_format
												}));
											}
										}}
									>
										{watchTargetGroups.savedOptions.length > 0 && (
											<optgroup label={c.history.watchPresetGroupSaved}>
												{watchTargetGroups.savedOptions.map((opt) => (
													<option key={`w-s-${opt.id}`} value={opt.id}>
														{opt.label}
													</option>
												))}
											</optgroup>
										)}
										<optgroup label={c.history.watchPresetGroupBuiltIn}>
											{watchTargetGroups.builtInOptions.map((opt) => (
												<option key={`w-b-${opt.id}`} value={opt.id}>
													{opt.label}
												</option>
											))}
										</optgroup>
										<option value="__custom__">
											{c.history.watchTargetCustomOption}
										</option>
									</ZenithSelect>
								</div>

								{watchTargetMode === "custom" ? (
									<div className="zn-preset-field">
										<label
											className="zn-preset-field-label"
											htmlFor="zn-watch-custom-fmt"
										>
											{c.presets.targetFormatLabel}
										</label>
										<input
											id="zn-watch-custom-fmt"
											type="text"
											dir="ltr"
											className="settings-text-input"
											value={watchCustomFormat}
											placeholder={c.history.watchCustomFormatPlaceholder}
											onChange={(e) => setWatchCustomFormat(e.target.value)}
										/>
									</div>
								) : (
									<div className="zn-preset-field">
										<label
											className="zn-preset-field-label"
											htmlFor="zn-watch-out-input"
										>
											{c.history.watchOutputLabel}
										</label>
										<div className="zn-converter-folder-control">
											<input
												id="zn-watch-out-input"
												type="text"
												dir="ltr"
												className="settings-text-input zn-watch-path-input"
												value={watchDraft.output_folder}
												placeholder={c.history.watchOutputPlaceholder}
												onChange={(e) =>
													setWatchDraft((prev) => ({
														...prev,
														output_folder: e.target.value
													}))
												}
											/>
											<button
												type="button"
												className="settings-btn"
												onClick={() => handleBrowseWatchFolder("output_folder")}
											>
												{t.common.browseDots}
											</button>
										</div>
									</div>
								)}

								{watchTargetMode === "custom" && (
									<div className="zn-preset-field full-span">
										<label
											className="zn-preset-field-label"
											htmlFor="zn-watch-out-input-custom"
										>
											{c.history.watchOutputLabel}
										</label>
										<div className="zn-converter-folder-control">
											<input
												id="zn-watch-out-input-custom"
												type="text"
												dir="ltr"
												className="settings-text-input zn-watch-path-input"
												value={watchDraft.output_folder}
												placeholder={c.history.watchOutputPlaceholder}
												onChange={(e) =>
													setWatchDraft((prev) => ({
														...prev,
														output_folder: e.target.value
													}))
												}
											/>
											<button
												type="button"
												className="settings-btn"
												onClick={() => handleBrowseWatchFolder("output_folder")}
											>
												{t.common.browseDots}
											</button>
										</div>
									</div>
								)}

								<div className="zn-preset-field full-span">
									<div className="zn-preset-toggles">
										<div className="zn-preset-toggle-row">
											<span className="zn-preset-toggle-title">
												{c.history.watchRecursive}
											</span>
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={watchDraft.recursive}
													onChange={(e) =>
														setWatchDraft((prev) => ({
															...prev,
															recursive: e.target.checked
														}))
													}
												/>
												<span className="slider" />
											</label>
										</div>
										<div className="zn-preset-toggle-row">
											<span className="zn-preset-toggle-title">
												{c.history.watchMoveOriginals}
											</span>
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={watchDraft.move_originals}
													onChange={(e) =>
														setWatchDraft((prev) => ({
															...prev,
															move_originals: e.target.checked
														}))
													}
												/>
												<span className="slider" />
											</label>
										</div>
										<div className="zn-preset-toggle-row">
											<span className="zn-preset-toggle-title">
												{c.history.watchKeepDates}
											</span>
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={watchDraft.keep_dates}
													onChange={(e) =>
														setWatchDraft((prev) => ({
															...prev,
															keep_dates: e.target.checked
														}))
													}
												/>
												<span className="slider" />
											</label>
										</div>
										<div className="zn-preset-toggle-row">
											<span className="zn-preset-toggle-title">
												{c.history.watchEnabledLabel}
											</span>
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={watchDraft.enabled}
													onChange={(e) =>
														setWatchDraft((prev) => ({
															...prev,
															enabled: e.target.checked
														}))
													}
												/>
												<span className="slider" />
											</label>
										</div>
									</div>
								</div>
							</div>

							<div className="zn-preset-footer">
								<div />
								<div className="zn-preset-footer-group">
									<button
										type="button"
										className="settings-btn"
										disabled={watchSaving}
										onClick={() => {
											setWatchEditorOpen(false);
											setWatchEditingId(null);
											setWatchError(null);
										}}
									>
										<span>{c.history.watchCancel}</span>
									</button>
									<button
										type="button"
										className="settings-btn zn-converter-primary-btn"
										disabled={watchSaving}
										onClick={handleSaveWatchDraft}
									>
										{watchSaving ? (
											<Loader2 size={12} className="zn-spin" />
										) : (
											<Save size={12} />
										)}
										<span>{c.history.watchSave}</span>
									</button>
								</div>
							</div>
						</div>
					)}

					{converterState.watch_rules.length === 0 && !watchEditorOpen ? (
						<div className="zn-recent-empty">
							<div className="zn-converter-empty-title">{c.history.watchEmptyTitle}</div>
							<div className="zn-converter-empty-desc">{c.history.watchEmptyDesc}</div>
						</div>
					) : (
						<div className="zn-watch-list">
							{converterState.watch_rules.map((rule) => {
								const st = watchStatuses[rule.id];
								const isRunning = Boolean(st?.running);
								const convertedCount = st?.converted_count ?? 0;
								const targetBadge = rule.preset_id
									? customMatcherInputs.presetsById.get(rule.preset_id)?.name ||
										DEFAULT_PRESET_CATALOG[rule.preset_id]?.label ||
										rule.preset_id
									: rule.target_format.toUpperCase();

								return (
									<div key={rule.id} className="zn-watch-rule-item">
										<div className="zn-watch-rule-top">
											<div className="zn-watch-rule-info">
												<div className="zn-watch-rule-title-row">
													<span
														className="zn-watch-rule-folder-name"
														title={rule.folder}
													>
														{extractBaseName(rule.folder)}
													</span>
													<span
														className={`zn-watch-status-badge ${
															isRunning ? "is-running" : "is-stopped"
														}`}
													>
														<span className="zn-watch-status-dot" />
														<span>
															{isRunning
																? c.history.watchStatusRunning
																: c.history.watchStatusStopped}
														</span>
													</span>
													{(isRunning || convertedCount > 0) && (
														<span className="zn-conv-slice-count-pill">
															{c.history.watchConvertedCount(convertedCount)}
														</span>
													)}
												</div>
												<div className="zn-watch-rule-path" dir="ltr" title={rule.folder}>
													{rule.folder}
												</div>
											</div>

											<div className="zn-watch-rule-actions">
												<label className="toggle-switch">
													<input
														type="checkbox"
														checked={rule.enabled}
														disabled={watchSaving}
														onChange={() => handleToggleWatchRule(rule.id)}
													/>
													<span className="slider" />
												</label>
												<button
													type="button"
													className="zn-icon-action-btn"
													disabled={watchSaving}
													onClick={() => handleEditWatchRule(rule)}
													title={c.history.watchEdit}
													aria-label={c.history.watchEdit}
												>
													<Pencil size={12} />
												</button>
												<button
													type="button"
													className="zn-icon-action-btn zn-pack-remove-btn"
													disabled={watchSaving}
													onClick={() => handleDeleteWatchRule(rule.id)}
													title={c.history.watchDelete}
													aria-label={c.history.watchDelete}
												>
													<Trash2 size={12} />
												</button>
											</div>
										</div>

										<div className="zn-watch-rule-tags">
											<span className="zn-recent-flow-badge" dir="ltr">
												→ {targetBadge}
											</span>
											<span className="zn-watch-rule-tag" dir={rule.output_folder ? "ltr" : dir}>
												{rule.output_folder || c.history.watchDefaultOutputTag}
											</span>
											{rule.recursive && (
												<span className="zn-watch-rule-tag">
													{c.history.watchRecursiveTag}
												</span>
											)}
											{rule.move_originals && (
												<span className="zn-watch-rule-tag">
													{c.history.watchMoveOriginalsTag}
												</span>
											)}
											{rule.keep_dates && (
												<span className="zn-watch-rule-tag">
													{c.history.watchKeepDatesTag}
												</span>
											)}
										</div>

										{st?.last_error && (
											<div className="zn-converter-error-banner" role="alert">
												<AlertCircle size={13} />
												<span>{cleanErrorMessage(st.last_error)}</span>
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Recent Conversions List */}
				<div className="zn-converter-section-card">
					<div className="zn-converter-section-head">
						<div className="zn-converter-section-title-col">
							<div className="zn-converter-section-title">
								<span>{c.history.recentGroupLabel}</span>
								<span className="zn-conv-slice-count-pill">{converterState.recent.length}</span>
							</div>
						</div>
						<div className="zn-converter-section-actions">
							<button
								type="button"
								className="settings-btn zn-pack-remove-btn"
								disabled={clearingHistory || converterState.recent.length === 0}
								onClick={handleClearHistory}
							>
								<Trash2 size={12} />
								<span>{c.history.clearHistory}</span>
							</button>
						</div>
					</div>

					{(stateError || historyError) && (
						<div className="zn-converter-error-banner" role="alert">
							<AlertCircle size={13} />
							<span>{historyError || stateError}</span>
						</div>
					)}

					{converterState.recent.length === 0 ? (
						<div className="zn-recent-empty">
							<div className="zn-converter-empty-title">{c.history.emptyTitle}</div>
							<div className="zn-converter-empty-desc">{c.history.emptyDesc}</div>
						</div>
					) : (
						<div className="zn-recent-list">{converterState.recent.map(renderRecentRow)}</div>
					)}
				</div>
			</div>
		);
	};

	return (
		<div className="zn-mouse-tab-root zn-converter-tab-root" dir={dir}>
			{/* Header Card */}
			<div className="zn-mouse-header-card">
				<div className="zn-mouse-header-left">
					<div className="zn-mouse-logo-badge">
						<ArrowRightLeft size={18} strokeWidth={1.8} />
					</div>
					<div>
						<div className="zn-mouse-header-title">
							<span>{c.headerTitle}</span>
							<span className="zn-mouse-trigger-pill">{triggerLabel}</span>
						</div>
						<div className="zn-mouse-header-sub">{c.headerSub}</div>
					</div>
				</div>

				<div className="zn-mouse-header-actions">
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={converterEnabled}
							onChange={toggleConverterEnabled}
						/>
						<span className="slider" />
					</label>
				</div>
			</div>

			{/* Core Runtime Status Banner */}
			{renderCoreBanner()}

			{/* Segmented Sub-Navigation */}
			<div className="zn-mouse-subnav" role="tablist" aria-label={c.headerTitle}>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "general"}
					className={`zn-mouse-subnav-btn ${subTab === "general" ? "active" : ""}`}
					onClick={() => setSubTab("general")}
				>
					<Sliders size={13} />
					<span>{c.subtabs.general}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "donut"}
					className={`zn-mouse-subnav-btn ${subTab === "donut" ? "active" : ""}`}
					onClick={() => setSubTab("donut")}
				>
					<Disc size={13} />
					<span>{c.subtabs.donut}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "packs"}
					className={`zn-mouse-subnav-btn ${subTab === "packs" ? "active" : ""}`}
					onClick={() => setSubTab("packs")}
				>
					<Package size={13} />
					<span>{c.subtabs.packs}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "history"}
					className={`zn-mouse-subnav-btn ${subTab === "history" ? "active" : ""}`}
					onClick={() => setSubTab("history")}
				>
					<History size={13} />
					<span>{c.subtabs.history}</span>
				</button>
			</div>

			{/* Sub-tab 1: General */}
			{subTab === "general" && (
				<div key="general" className="zn-converter-panel">
					<div className="setting-group-label">{c.triggerGroup}</div>
					<div className="setting-group">
						<SettingRow
							icon={Power}
							label={c.enableConverter}
							desc={c.enableConverterDesc}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterEnabled}
									onChange={toggleConverterEnabled}
								/>
								<span className="slider" />
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label={c.triggerKey}
							desc={c.triggerKeyDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={converterTriggerKey}
								onChange={(e) =>
									handleConverterTriggerKeyChange(e.target.value as ConverterTriggerKey)
								}
							>
								<option value="ctrl">{c.triggerCtrl}</option>
								<option value="alt">{c.triggerAlt}</option>
								<option value="shift">{c.triggerShift}</option>
								<option value="right-drag">{c.triggerRightDrag}</option>
							</ZenithSelect>
						</SettingRow>

						<SettingRow
							icon={Globe}
							label={c.browserDrag}
							desc={c.browserDragDesc}
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterBrowserDrag}
									onChange={toggleConverterBrowserDrag}
								/>
								<span className="slider" />
							</label>
						</SettingRow>
					</div>

					<div className="setting-group-label">{c.outputGroup}</div>
					<div className="setting-group">
						<SettingRow
							icon={Folder}
							label={c.outputMode}
							desc={c.outputModeDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={converterOutputMode}
								onChange={(e) =>
									handleConverterOutputModeChange(e.target.value as ConverterOutputMode)
								}
							>
								<option value="next-to-source">{c.outputNextToSource}</option>
								<option value="folder">{c.outputFolder}</option>
							</ZenithSelect>
						</SettingRow>

						{converterOutputMode === "folder" && (
							<SettingRow
								icon={FolderOpen}
								label={c.outputFolderPath}
								desc={c.outputFolderPathDesc}
							>
								<div className="zn-converter-folder-control">
									<input
										type="text"
										className="settings-text-input zn-converter-folder-input"
										value={converterOutputFolder}
										placeholder={c.outputFolderPlaceholder}
										onChange={(e) => handleConverterOutputFolderChange(e.target.value)}
									/>
									<button
										type="button"
										className="settings-btn"
										onClick={handleBrowseOutputFolder}
									>
										{t.common.browseDots}
									</button>
								</div>
							</SettingRow>
						)}

						<SettingRow
							icon={Menu}
							label={c.explorerMenu}
							desc={c.explorerMenuDesc}
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterExplorerMenu}
									disabled={explorerMenuBusy}
									onChange={handleToggleExplorerMenu}
								/>
								<span className="slider" />
							</label>
						</SettingRow>
						{explorerMenuError && (
							<div className="zn-converter-error-banner zn-explorer-menu-error" role="alert">
								<AlertCircle size={13} />
								<span>{explorerMenuError}</span>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Sub-tab 2: Donut & Presets */}
			{subTab === "donut" && renderDonutSubTab()}

			{/* Sub-tab 3: Packs */}
			{subTab === "packs" && (
				<div key="packs" className="zn-converter-panel">
					<div className="zn-packs-header-row">
						<div className="setting-group-label" style={{ margin: 0 }}>
							{c.packs.groupLabel}
						</div>
						<button
							type="button"
							className="settings-btn zn-packs-refresh-btn"
							onClick={refreshStatusAndPacks}
							disabled={enginesLoading}
						>
							<RefreshCw size={12} className={enginesLoading ? "zn-spin" : undefined} />
							<span>{enginesLoading ? c.packs.refreshing : c.packs.refresh}</span>
						</button>
					</div>

					<div className="zn-packs-intro-card">
						<div>{c.packs.intro}</div>
						{!runtimeStatus?.core_installed && (
							<div className="zn-packs-intro-hint">{c.packs.coreRequiredHint}</div>
						)}
					</div>

					{enginesError && (
						<div className="zn-converter-error-banner" role="alert">
							<AlertCircle size={13} />
							<span>{enginesError || c.packs.loadError}</span>
						</div>
					)}

					<div className="zn-packs-list">
						{engines.map(renderPackCard)}
					</div>
				</div>
			)}

			{/* Sub-tab 4: Watch & History */}
			{subTab === "history" && renderHistorySubTab()}
		</div>
	);
}
