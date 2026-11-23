import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	Archive,
	ArrowLeftRight,
	ArrowRightLeft,
	BookOpen,
	Box,
	Braces,
	Check,
	Compass,
	Crop,
	Download,
	FileCode2,
	FileSpreadsheet,
	FileText,
	Film,
	FlipHorizontal2,
	Folder,
	FolderArchive,
	FolderOpen,
	Image,
	Languages,
	Layers,
	Loader2,
	MapPin,
	Minimize2,
	Music,
	Package,
	PenTool,
	Presentation,
	RotateCw,
	ScanText,
	Scissors,
	ShieldOff,
	Sparkles,
	Subtitles,
	Type,
	Wand2,
	X
} from "lucide-react";
import { matchFormatsForPaths } from "../converter/formats";
import type {
	ConverterRuntimeStatus,
	CoreInstallProgressEvent,
	DonutSides,
	EngineInstallProgressEvent,
	EnginePackInfo,
	FileCategory,
	TargetOption
} from "../converter/types";
import { useI18n } from "../i18n";
import { clampWheelCenter } from "../radial/radialDrag";
import {
	computeRadialLayout,
	getLabelPlacement,
	getReadableForeground,
	getSlicePresence,
	normalizeHoverColor,
	RadialSectors,
	snapToDevicePixel
} from "../radial/radialLayout";
import { radialScrimGradient } from "../radial/radialScrim";
import { sectorIndexForDelta } from "../radial/radialSectors";
import "./ConverterDonut.css";

export type ConverterPhase = "idle" | "donut" | "checking" | "install" | "progress";

export interface ConverterDonutProps {
	enabled: boolean;
	outputMode: "next-to-source" | "folder";
	outputFolder: string;
	suppressed: boolean;
	onPhaseChange?: (phase: ConverterPhase) => void;
	onRegionInvalidate?: () => void;
}

interface DonutOpenPayload {
	x: number;
	y: number;
	paths: string[];
	urls: string[];
	isBrowserDrag: boolean;
}

interface DonutDropPayload {
	x: number;
	y: number;
	paths: string[];
	urls: string[];
	isBrowserDrag: boolean;
}

interface ConverterProgressPayload {
	job_id: string;
	kind: string;
	source: string;
	fraction?: number;
	state?: string;
	outputs?: string[];
	error?: string;
	error_key?: string;
	missing_engine?: string;
}

interface ConvertedFileItem {
	source: string;
	state: string;
	outputs: string[];
	error: string | null;
	error_key: string | null;
	missing_engine: string | null;
}

interface ConvertJobResult {
	job_id: string;
	files: ConvertedFileItem[];
	missing_engine: string | null;
}

interface WheelSession {
	openX: number;
	openY: number;
	paths: string[];
	urls: string[];
	isBrowserDrag: boolean;
	sides: DonutSides;
	side: 0 | 1;
	flipKey: number;
}

interface InstallPromptState {
	option: TargetOption;
	inputs: string[];
	dropPoint: { x: number; y: number };
	needsCore: boolean;
	engineId: string | null;
	enginePack: EnginePackInfo | null;
	installing: boolean;
	coreProgress: CoreInstallProgressEvent | null;
	engineProgress: EngineInstallProgressEvent | null;
	error: string | null;
}

interface JobState {
	jobId: string;
	option: TargetOption;
	inputs: string[];
	dropPoint: { x: number; y: number };
	status: "checking" | "converting" | "done" | "error" | "cancelled";
	fraction: number;
	outputs: string[];
	error: string | null;
}

const PROGRESS_RING_RADIUS = 15;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;
const INSTALL_CARD_WIDTH = 320;
const INSTALL_CARD_HEIGHT_EST = 220;
const PROGRESS_PILL_WIDTH_EST = 276;
const PROGRESS_PILL_HEIGHT_EST = 64;
const WHEEL_FLIP_DEBOUNCE_MS = 140;

function readZenithAccentHex(): { accent: string; isLight: boolean } {
	if (typeof document === "undefined") {
		return { accent: "#007AFF", isLight: false };
	}
	const root = document.documentElement;
	const isLight = root.classList.contains("light-mode");
	const raw = getComputedStyle(root).getPropertyValue("--zenith-accent").trim();
	if (!raw) return { accent: "#007AFF", isLight };

	if (/^#[0-9a-f]{6}$/i.test(raw)) {
		return { accent: normalizeHoverColor(raw), isLight };
	}
	if (/^#[0-9a-f]{3}$/i.test(raw)) {
		const expanded = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
		return { accent: normalizeHoverColor(expanded), isLight };
	}
	const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (rgb) {
		const toHex = (n: string) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, "0");
		return { accent: `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`.toUpperCase(), isLight };
	}
	return { accent: "#007AFF", isLight };
}

function cleanErrorMessage(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err);
	return raw.replace(/^[A-Z0-9_]+:\s*/, "").trim() || raw;
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

function extractBaseName(path: string): string {
	const trimmed = path.trim();
	const withoutQuery = trimmed.split(/[?#]/)[0];
	const idx = Math.max(withoutQuery.lastIndexOf("/"), withoutQuery.lastIndexOf("\\"));
	const base = idx >= 0 ? withoutQuery.slice(idx + 1) : withoutQuery;
	return base || trimmed;
}

function parentDirectory(path: string): string {
	const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	if (idx <= 0) return path;
	return path.slice(0, idx);
}

function resolveMatchInputs(paths: string[], urls: string[]): string[] {
	if (paths.length > 0) return paths;
	if (urls.length === 0) return [];
	return urls
		.map((raw) => {
			try {
				const parsed = new URL(raw);
				return parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : raw.split(/[?#]/)[0];
			} catch {
				return raw.split(/[?#]/)[0];
			}
		})
		.filter((s) => s.trim().length > 0);
}

function clampBoxPosition(
	point: { x: number; y: number },
	boxWidth: number,
	boxHeight: number,
	viewport: { width: number; height: number }
): { left: number; top: number } {
	const margin = 16;
	const maxLeft = Math.max(margin, viewport.width - boxWidth - margin);
	const maxTop = Math.max(margin, viewport.height - boxHeight - margin);
	const left = Math.round(Math.max(margin, Math.min(maxLeft, point.x - boxWidth / 2)));
	const top = Math.round(Math.max(margin, Math.min(maxTop, point.y - boxHeight / 2)));
	return { left, top };
}

function shortSliceBadge(option: TargetOption): string {
	switch (option.presetId) {
		case "tool-crop":
		case "crop-video":
		case "tool-pdf-crop":
			return "CROP";
		case "rotate":
		case "rotate-left":
		case "rotate-right":
		case "rotate-180":
		case "pdf-rotate-left":
		case "pdf-rotate-right":
			return "ROT";
		case "flip":
		case "flip-horizontal":
		case "flip-vertical":
			return "FLIP";
		case "remove-background":
			return "NO BG";
		case "tool-background":
			return "BG";
		case "trim-transparent":
			return "TRIM";
		case "half-size":
			return "50%";
		case "grayscale":
			return "GRAY";
		case "compress-image":
		case "compress-pdf":
		case "compress-video":
		case "compress-audio":
			return "MINI";
		case "merge-images":
		case "merge-pdf":
		case "merge-videos":
		case "merge-audio":
			return "MERGE";
		case "pdf-split":
			return "SPLIT";
		case "searchable-pdf":
			return "OCR";
		case "tool-upscale":
			return "AI 4×";
		case "tool-clip":
			return "CLIP";
		case "remove-metadata":
		case "tool-metadata":
			return "META";
		case "zip-all":
			return "1 ZIP";
		case "extract":
			return "UNZIP";
		case "same-audio":
		case "extract-audio":
			return "AUDIO";
		case "caption-video":
			return "AI SRT";
		case "translate":
			return "TRANS";
		case "pdf-long-image":
			return "LONG";
		default:
			break;
	}
	if (option.format === "*" || option.format === "*audio") {
		return option.label.slice(0, 6).toUpperCase();
	}
	if (option.label.length <= 7) {
		return option.label.toUpperCase();
	}
	return option.format.toUpperCase();
}

function iconForOption(option: TargetOption) {
	switch (option.actionKind) {
		case "crop":
			return Crop;
		case "pack-zip":
			return FolderArchive;
		case "extract":
			return FolderOpen;
		case "same-audio":
			return Music;
		case "merge-pdf":
			return Layers;
		case "split-pdf":
			return Scissors;
		case "compress-pdf":
			return Minimize2;
		case "ocr":
			return ScanText;
		case "upscale":
			return Sparkles;
		default:
			break;
	}

	switch (option.presetId) {
		case "remove-background":
		case "tool-background":
			return Wand2;
		case "rotate":
		case "rotate-left":
		case "rotate-right":
		case "rotate-180":
		case "pdf-rotate-left":
		case "pdf-rotate-right":
			return RotateCw;
		case "flip":
		case "flip-horizontal":
		case "flip-vertical":
			return FlipHorizontal2;
		case "compress-image":
		case "compress-video":
		case "compress-audio":
			return Minimize2;
		case "tool-clip":
		case "crop-video":
		case "tool-pdf-crop":
			return Scissors;
		case "translate":
			return Languages;
		case "remove-metadata":
		case "tool-metadata":
			return ShieldOff;
		case "caption-video":
		case "extract-subtitles":
			return Subtitles;
		default:
			break;
	}

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
	return map[option.category] ?? ArrowRightLeft;
}

function lightModeScrim(position: { x: number; y: number }, backdropRadius: number): string {
	const scrimRadius = Math.round(backdropRadius * 2);
	const peak = 0.24;
	const stops = [0, 0.25, 0.5, 0.75, 1]
		.map((t) => {
			const falloff = 1 - (3 * t * t - 2 * t * t * t);
			return `rgba(15, 23, 42, ${(peak * falloff).toFixed(3)}) ${Math.round(t * scrimRadius)}px`;
		})
		.join(", ");
	return `radial-gradient(circle at ${Math.round(position.x)}px ${Math.round(position.y)}px, ${stops})`;
}

interface DonutSliceProps {
	option: TargetOption;
	index: number;
	total: number;
	isActive: boolean;
	angularDistance: number | null;
	actualMenuRadius: number;
	actualIconSize: number;
	accentColor: string;
	accentForeground: string;
	revealed: boolean;
	onClick: (option: TargetOption) => void;
}

const DonutSlice = React.memo(
	({
		option,
		index,
		total,
		isActive,
		angularDistance,
		actualMenuRadius,
		actualIconSize,
		accentColor,
		accentForeground,
		revealed,
		onClick
	}: DonutSliceProps) => {
		const sliceAngle = 360 / Math.max(total, 1);
		const angleDeg = index * sliceAngle - 90;
		const angleRad = angleDeg * (Math.PI / 180);
		const pos = {
			x: actualMenuRadius * Math.cos(angleRad),
			y: actualMenuRadius * Math.sin(angleRad)
		};

		const labelPlacement = useMemo(
			() => getLabelPlacement(angleDeg, actualIconSize),
			[angleDeg, actualIconSize]
		);
		const presence = getSlicePresence(angularDistance);
		const Icon = iconForOption(option);
		const shortBadge = shortSliceBadge(option);

		return (
			<div
				className="zn-conv-slice"
				style={{
					["--zn-tf" as string]: revealed
						? `translate3d(${snapToDevicePixel(pos.x)}px, ${snapToDevicePixel(pos.y)}px, 0) scale(${presence.scale})`
						: "translate3d(0px, 0px, 0) scale(0.24)",
					["--zn-op" as string]: revealed ? presence.opacity : 0,
					zIndex: isActive ? 200 : 100
				}}
			>
				<div className="zn-conv-slice-inner">
					<div
						className={`zn-conv-plate${isActive ? " is-active" : ""}`}
						style={{
							width: `${actualIconSize}px`,
							height: `${actualIconSize}px`,
							pointerEvents: revealed ? "auto" : "none",
							...(isActive
								? {
										backgroundColor: accentColor,
										borderColor: accentColor,
										color: accentForeground,
										boxShadow: `0 0 0 1px rgba(0,0,0,0.35), 0 0 0 4px ${accentColor}30, 0 0 22px ${accentColor}40, 0 12px 26px rgba(0,0,0,0.42)`
									}
								: null)
						}}
						onMouseDown={(e) => e.stopPropagation()}
						onMouseUp={(e) => e.stopPropagation()}
						onClick={(e) => {
							e.stopPropagation();
							onClick(option);
						}}
					>
						<Icon size={Math.max(15, Math.round(actualIconSize * 0.3))} strokeWidth={1.9} />
						<span className="zn-conv-plate-badge">{shortBadge}</span>
						{option.requiredEngine && <span className="zn-conv-engine-dot" aria-hidden />}
					</div>

					{/* Ray-Aligned Outer Label Pill */}
					<div
						className="zn-conv-label"
						style={{
							["--zn-tf" as string]:
								`translate(${labelPlacement.originX}, ${labelPlacement.originY})` +
								` translate3d(${snapToDevicePixel(labelPlacement.x)}px, ${snapToDevicePixel(labelPlacement.y)}px, 0)` +
								` scale(${isActive ? 1 : 0.9})`,
							["--zn-op" as string]: isActive ? 1 : 0
						}}
					>
						<div
							className="zn-conv-label-pill"
							style={
								isActive
									? {
											background: accentColor,
											borderColor: accentColor,
											color: accentForeground
										}
									: undefined
							}
						>
							<span>{option.label}</span>
							{option.requiredEngine && (
								<span className="zn-conv-label-engine">+{option.requiredEngine}</span>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}
);
DonutSlice.displayName = "DonutSlice";

export function ConverterDonut({
	enabled,
	outputMode,
	outputFolder,
	suppressed,
	onPhaseChange,
	onRegionInvalidate
}: ConverterDonutProps) {
	const { t, dir } = useI18n();
	const c = t.converter;

	const [wheelSession, setWheelSession] = useState<WheelSession | null>(null);
	const [checkingJob, setCheckingJob] = useState<JobState | null>(null);
	const [checkingVisible, setCheckingVisible] = useState(false);
	const [installPrompt, setInstallPrompt] = useState<InstallPromptState | null>(null);
	const [jobState, setJobState] = useState<JobState | null>(null);

	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [isCenterActive, setIsCenterActive] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [ringHovered, setRingHovered] = useState(false);

	const [viewportSize, setViewportSize] = useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth || 1920 : 1920,
		height: typeof window !== "undefined" ? window.innerHeight || 1080 : 1080
	}));
	const [themeSnap, setThemeSnap] = useState(() => readZenithAccentHex());

	const installCardRef = useRef<HTMLDivElement | null>(null);
	const progressRingRef = useRef<HTMLDivElement | null>(null);

	const sessionGenRef = useRef(0);
	const jobSeqRef = useRef(0);
	const activeJobIdRef = useRef<string | null>(null);
	const cancelledJobIdsRef = useRef<Set<string>>(new Set());
	const emittedJobIdsRef = useRef<Set<string>>(new Set());
	const fileProgressRef = useRef<Map<string, number>>(new Map());
	const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
	const lastWheelFlipRef = useRef(0);
	const autoDismissTimerRef = useRef<number | null>(null);
	const checkingTimerRef = useRef<number | null>(null);

	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const suppressedRef = useRef(suppressed);
	suppressedRef.current = suppressed;
	const outputModeRef = useRef(outputMode);
	outputModeRef.current = outputMode;
	const outputFolderRef = useRef(outputFolder);
	outputFolderRef.current = outputFolder;
	const onRegionInvalidateRef = useRef(onRegionInvalidate);
	onRegionInvalidateRef.current = onRegionInvalidate;

	const refreshThemeSnap = useCallback(() => {
		setThemeSnap(readZenithAccentHex());
	}, []);

	const releaseOverlayLock = useCallback(async () => {
		await invoke("converter_set_overlay_open", { open: false }).catch(() => {});
		requestAnimationFrame(() => {
			onRegionInvalidateRef.current?.();
		});
	}, []);

	// Track current high-level overlay phase for Overlay.tsx region & mode coordination.
	const phase: ConverterPhase = wheelSession
		? "donut"
		: checkingJob
			? "checking"
			: installPrompt
				? "install"
				: jobState
					? "progress"
					: "idle";

	useEffect(() => {
		onPhaseChange?.(phase);
	}, [phase, onPhaseChange]);

	// Keep viewport size synced on resize.
	useEffect(() => {
		const onResize = () => {
			setViewportSize({
				width: window.innerWidth || 1920,
				height: window.innerHeight || 1080
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Refresh theme colors when settings/system accent updates.
	useEffect(() => {
		const p1 = listen("settings-changed", refreshThemeSnap);
		const p2 = listen("settings-external-changed", refreshThemeSnap);
		const p3 = listen("system-accent-changed", refreshThemeSnap);
		return () => {
			p1.then((fn) => fn());
			p2.then((fn) => fn());
			p3.then((fn) => fn());
		};
	}, [refreshThemeSnap]);

	const clearCheckingState = useCallback(() => {
		if (checkingTimerRef.current !== null) {
			window.clearTimeout(checkingTimerRef.current);
			checkingTimerRef.current = null;
		}
		setCheckingJob(null);
		setCheckingVisible(false);
	}, []);

	// Observe compact card/ring bounds so Overlay.tsx re-measures whenever content changes size.
	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			onRegionInvalidateRef.current?.();
		});
		if (installCardRef.current) observer.observe(installCardRef.current);
		if (progressRingRef.current) observer.observe(progressRingRef.current);
		return () => observer.disconnect();
	}, [installPrompt, jobState, checkingVisible, checkingJob]);

	// If suppressed by RadialMenu / Splash / Updating, dismiss open donut, preflight, or install card cleanly.
	useEffect(() => {
		if (!suppressed) return;
		if (wheelSession || checkingJob || installPrompt) {
			sessionGenRef.current += 1;
			clearCheckingState();
			setWheelSession(null);
			setInstallPrompt(null);
			setActiveIndex(null);
			setIsCenterActive(false);
			void releaseOverlayLock();
		}
	}, [suppressed, wheelSession, checkingJob, installPrompt, clearCheckingState, releaseOverlayLock]);

	const currentSlices = useMemo(() => {
		if (!wheelSession) return [];
		return wheelSession.side === 0 ? wheelSession.sides.primary : wheelSession.sides.secondary;
	}, [wheelSession]);

	const { actualMenuRadius, actualIconSize } = useMemo(
		() =>
			computeRadialLayout({
				numberOfApps: Math.max(currentSlices.length, 1),
				iconSizePx: 58,
				minGap: 16,
				menuRadius: 138,
				activationThreshold: 56,
				viewportSize
			}),
		[currentSlices.length, viewportSize]
	);

	const hubDiameter = useMemo(
		() =>
			Math.max(
				76,
				Math.min(92, Math.round((actualMenuRadius - actualIconSize / 2 - 10) * 2))
			) & ~1,
		[actualMenuRadius, actualIconSize]
	);

	const deadZoneRadius = useMemo(
		() => Math.max(46, Math.round(hubDiameter / 2) + 8),
		[hubDiameter]
	);

	const centerPos = useMemo(() => {
		if (!wheelSession) return { x: 0, y: 0 };
		return clampWheelCenter(
			{ x: wheelSession.openX, y: wheelSession.openY },
			viewportSize,
			actualMenuRadius + actualIconSize / 2 + 28
		);
	}, [wheelSession, viewportSize, actualMenuRadius, actualIconSize]);

	// Entrance bloom animation whenever donut opens or flips faces.
	useLayoutEffect(() => {
		if (!wheelSession) {
			setRevealed(false);
			return;
		}
		setRevealed(false);
		const raf = requestAnimationFrame(() => {
			setRevealed(true);
		});
		return () => cancelAnimationFrame(raf);
	}, [wheelSession?.openX, wheelSession?.openY, wheelSession?.side, wheelSession?.flipKey]);

	const stateRef = useRef({
		wheelSession,
		checkingJob,
		installPrompt,
		currentSlices,
		centerPos,
		deadZoneRadius,
		activeIndex,
		isCenterActive
	});
	useLayoutEffect(() => {
		stateRef.current = {
			wheelSession,
			checkingJob,
			installPrompt,
			currentSlices,
			centerPos,
			deadZoneRadius,
			activeIndex,
			isCenterActive
		};
	});

	const aimAtPoint = useCallback(
		(point: { x: number; y: number } | null): { isCenter: boolean; index: number | null } => {
			const { currentSlices: slices, centerPos: center, deadZoneRadius: deadZone } = stateRef.current;
			if (!point) return { isCenter: true, index: null };
			const dx = point.x - center.x;
			const dy = point.y - center.y;
			if (dx * dx + dy * dy < deadZone * deadZone) {
				return { isCenter: true, index: null };
			}
			if (slices.length === 0) return { isCenter: false, index: null };
			return { isCenter: false, index: sectorIndexForDelta(dx, dy, slices.length) };
		},
		[]
	);

	const dismissWheelOrInstall = useCallback(() => {
		sessionGenRef.current += 1;
		clearCheckingState();
		setWheelSession(null);
		setInstallPrompt(null);
		setActiveIndex(null);
		setIsCenterActive(false);
		releaseOverlayLock();
	}, [clearCheckingState, releaseOverlayLock]);

	const flipSide = useCallback(() => {
		const ws = stateRef.current.wheelSession;
		if (!ws || ws.sides.secondary.length === 0) return;
		const nextSide: 0 | 1 = ws.side === 0 ? 1 : 0;
		const nextSlices = nextSide === 0 ? ws.sides.primary : ws.sides.secondary;

		setWheelSession((prev) =>
			prev
				? {
						...prev,
						side: nextSide,
						flipKey: prev.flipKey + 1
					}
				: null
		);

		const ptr = lastPointerRef.current;
		if (ptr && nextSlices.length > 0) {
			const { centerPos: center, deadZoneRadius: deadZone } = stateRef.current;
			const dx = ptr.x - center.x;
			const dy = ptr.y - center.y;
			if (dx * dx + dy * dy < deadZone * deadZone) {
				setIsCenterActive(true);
				setActiveIndex(null);
			} else {
				setIsCenterActive(false);
				setActiveIndex(sectorIndexForDelta(dx, dy, nextSlices.length));
			}
		} else {
			setActiveIndex(null);
		}
	}, []);

	const openMissingEnginePrompt = useCallback(
		async (
			engineId: string,
			option: TargetOption,
			inputs: string[],
			dropPoint: { x: number; y: number },
			needsCore = false,
			gen?: number
		) => {
			const checkGen = gen ?? sessionGenRef.current;
			setJobState(null);
			const engines = await invoke<EnginePackInfo[]>("converter_list_engines").catch(() => []);
			if (sessionGenRef.current !== checkGen) return;

			const pack =
				engines.find((e) => e.id.toLowerCase() === engineId.toLowerCase()) ?? null;

			invoke("converter_set_overlay_open", { open: true }).catch(() => {});
			setInstallPrompt({
				option,
				inputs,
				dropPoint,
				needsCore,
				engineId,
				enginePack: pack,
				installing: false,
				coreProgress: null,
				engineProgress: null,
				error: null
			});
		},
		[]
	);

	const openMissingCorePrompt = useCallback(
		async (
			option: TargetOption,
			inputs: string[],
			dropPoint: { x: number; y: number },
			gen?: number
		) => {
			const checkGen = gen ?? sessionGenRef.current;
			setJobState(null);
			const requiredEngine = option.requiredEngine?.trim() || null;
			const engines = requiredEngine
				? await invoke<EnginePackInfo[]>("converter_list_engines").catch(() => [])
				: [];
			if (sessionGenRef.current !== checkGen) return;

			const pack = requiredEngine
				? engines.find((e) => e.id.toLowerCase() === requiredEngine.toLowerCase()) ?? null
				: null;

			invoke("converter_set_overlay_open", { open: true }).catch(() => {});
			setInstallPrompt({
				option,
				inputs,
				dropPoint,
				needsCore: true,
				engineId: requiredEngine,
				enginePack: pack,
				installing: false,
				coreProgress: null,
				engineProgress: null,
				error: null
			});
		},
		[]
	);

	const emitJobFinished = useCallback(
		(
			jobId: string,
			status: "done" | "error" | "cancelled",
			option: TargetOption,
			inputs: string[],
			outputs: string[],
			error?: string | null
		) => {
			if (emittedJobIdsRef.current.has(jobId)) return;
			emittedJobIdsRef.current.add(jobId);
			if (emittedJobIdsRef.current.size > 64) {
				const oldest = emittedJobIdsRef.current.values().next().value;
				if (oldest !== undefined) emittedJobIdsRef.current.delete(oldest);
			}
			emit("converter-job-finished", {
				jobId,
				status,
				targetFormat: option.format,
				targetLabel: option.label,
				inputs,
				outputs,
				...(error ? { error } : null)
			}).catch(() => {});
		},
		[]
	);

	const runConversionJob = useCallback(
		async (
			option: TargetOption,
			inputs: string[],
			dropPoint: { x: number; y: number },
			gen: number
		) => {
			if (sessionGenRef.current !== gen) return;
			const jobId = `conv-${Date.now()}-${++jobSeqRef.current}`;
			activeJobIdRef.current = jobId;
			fileProgressRef.current = new Map(inputs.map((p) => [p, 0]));

			setJobState({
				jobId,
				option,
				inputs,
				dropPoint,
				status: "converting",
				fraction: 0,
				outputs: [],
				error: null
			});

			const outDir =
				outputModeRef.current === "folder" && outputFolderRef.current.trim().length > 0
					? outputFolderRef.current.trim()
					: null;

			const req = {
				job_id: jobId,
				inputs,
				to: option.format,
				preset: option.presetId ?? null,
				output_dir: outDir,
				quality: option.quality ?? null
			};

			try {
				const result = await invoke<ConvertJobResult>("converter_convert", { req });
				if (activeJobIdRef.current !== jobId || cancelledJobIdsRef.current.has(jobId)) return;

				const outputs = result.files.flatMap((f) => f.outputs ?? []);
				const missingEngine =
					result.missing_engine ||
					result.files.find((f) => Boolean(f.missing_engine))?.missing_engine ||
					null;

				if (missingEngine && outputs.length === 0) {
					await openMissingEnginePrompt(missingEngine, option, inputs, dropPoint, false, gen);
					return;
				}

				const failedFile = result.files.find((f) => f.state.toLowerCase() === "failed");
				if (failedFile && outputs.length === 0) {
					const errMsg = cleanErrorMessage(failedFile.error || c.donut.failedTitle);
					setJobState((prev) =>
						prev && prev.jobId === jobId
							? { ...prev, status: "error", error: errMsg }
							: prev
					);
					emitJobFinished(jobId, "error", option, inputs, outputs, errMsg);
					return;
				}

				setJobState((prev) =>
					prev && prev.jobId === jobId
						? { ...prev, status: "done", fraction: 1, outputs, error: null }
						: prev
				);
				emitJobFinished(jobId, "done", option, inputs, outputs);
			} catch (err) {
				if (activeJobIdRef.current !== jobId || cancelledJobIdsRef.current.has(jobId)) return;
				const raw = err instanceof Error ? err.message : String(err);

				if (raw === "CANCELLED" || raw.startsWith("CANCELLED")) {
					setJobState((prev) =>
						prev && prev.jobId === jobId
							? { ...prev, status: "cancelled", error: null }
							: prev
					);
					emitJobFinished(jobId, "cancelled", option, inputs, []);
					return;
				}

				if (raw.startsWith("MISSING_ENGINE:")) {
					const engineId = raw.slice("MISSING_ENGINE:".length).trim();
					if (engineId) {
						await openMissingEnginePrompt(engineId, option, inputs, dropPoint, false, gen);
						return;
					}
				}

				if (raw.startsWith("CORE_NOT_INSTALLED")) {
					await openMissingCorePrompt(option, inputs, dropPoint, gen);
					return;
				}

				const clean = cleanErrorMessage(raw);
				setJobState((prev) =>
					prev && prev.jobId === jobId
						? { ...prev, status: "error", error: clean }
						: prev
				);
				emitJobFinished(jobId, "error", option, inputs, [], clean);
			}
		},
		[c.donut.failedTitle, emitJobFinished, openMissingCorePrompt, openMissingEnginePrompt]
	);

	const commitSlice = useCallback(
		async (option: TargetOption, inputs: string[], dropPoint: { x: number; y: number }) => {
			if (inputs.length === 0) {
				dismissWheelOrInstall();
				return;
			}
			const myGen = ++sessionGenRef.current;
			setWheelSession(null);
			setActiveIndex(null);
			setIsCenterActive(false);

			clearCheckingState();
			setCheckingJob({
				jobId: `checking-${myGen}`,
				option,
				inputs,
				dropPoint,
				status: "checking",
				fraction: 0,
				outputs: [],
				error: null
			});
			checkingTimerRef.current = window.setTimeout(() => {
				checkingTimerRef.current = null;
				if (sessionGenRef.current === myGen) {
					setCheckingVisible(true);
				}
			}, 120);

			const [statusRes, enginesRes] = await Promise.allSettled([
				invoke<ConverterRuntimeStatus>("converter_status"),
				invoke<EnginePackInfo[]>("converter_list_engines")
			]);
			if (sessionGenRef.current !== myGen) return;

			const coreInstalled =
				statusRes.status === "fulfilled" ? statusRes.value.core_installed : true;
			const engines = enginesRes.status === "fulfilled" ? enginesRes.value : [];
			const requiredEngine = option.requiredEngine?.trim() || null;
			const enginePack = requiredEngine
				? engines.find((e) => e.id.toLowerCase() === requiredEngine.toLowerCase()) ?? null
				: null;
			const needsEngine = Boolean(
				requiredEngine &&
					(enginesRes.status === "fulfilled"
						? !enginePack || enginePack.status === "notinstalled"
						: !coreInstalled)
			);

			clearCheckingState();

			if (!coreInstalled || needsEngine) {
				setJobState(null);
				setInstallPrompt({
					option,
					inputs,
					dropPoint,
					needsCore: !coreInstalled,
					engineId: needsEngine ? requiredEngine : null,
					enginePack,
					installing: false,
					coreProgress: null,
					engineProgress: null,
					error: null
				});
				return;
			}

			await releaseOverlayLock();
			await runConversionJob(option, inputs, dropPoint, myGen);
		},
		[clearCheckingState, dismissWheelOrInstall, releaseOverlayLock, runConversionJob]
	);

	const handleConfirmInstall = useCallback(async () => {
		const prompt = stateRef.current.installPrompt;
		if (!prompt || prompt.installing) return;

		const myGen = sessionGenRef.current;
		setInstallPrompt((prev) =>
			prev
				? { ...prev, installing: true, error: null, coreProgress: null, engineProgress: null }
				: null
		);

		try {
			if (prompt.needsCore) {
				const status = await invoke<ConverterRuntimeStatus>("converter_ensure_core");
				if (sessionGenRef.current !== myGen) return;
				if (!status.core_installed) {
					throw new Error(c.runtime.missingTitle);
				}
			}

			if (prompt.engineId) {
				const engines = await invoke<EnginePackInfo[]>("converter_list_engines").catch(
					() => [] as EnginePackInfo[]
				);
				if (sessionGenRef.current !== myGen) return;

				const currentPack =
					engines.find((e) => e.id.toLowerCase() === prompt.engineId!.toLowerCase()) ??
					prompt.enginePack;

				if (!currentPack || currentPack.status === "notinstalled") {
					if (currentPack && !currentPack.downloadable) {
						throw new Error(currentPack.unavailable_reason || c.donut.unavailablePack);
					}
					await invoke<EnginePackInfo>("converter_install_engine", {
						id: prompt.engineId
					});
					if (sessionGenRef.current !== myGen) return;
				}
			}

			setInstallPrompt(null);
			await releaseOverlayLock();
			await runConversionJob(prompt.option, prompt.inputs, prompt.dropPoint, myGen);
		} catch (err) {
			if (sessionGenRef.current !== myGen) return;
			const msg = cleanErrorMessage(err);
			setInstallPrompt((prev) =>
				prev ? { ...prev, installing: false, error: msg } : null
			);
		}
	}, [c.donut.unavailablePack, c.runtime.missingTitle, releaseOverlayLock, runConversionJob]);

	// Tauri event listeners for drag lifecycle + install/conversion progress.
	useEffect(() => {
		const unOpen = listen<DonutOpenPayload>("converter-donut-open", (ev) => {
			if (!enabledRef.current || suppressedRef.current) {
				releaseOverlayLock();
				return;
			}
			const { x, y, paths, urls, isBrowserDrag } = ev.payload;
			const matchInputs = resolveMatchInputs(paths ?? [], urls ?? []);
			if (matchInputs.length === 0) {
				releaseOverlayLock();
				return;
			}

			sessionGenRef.current += 1;
			clearCheckingState();
			refreshThemeSnap();
			const sides = matchFormatsForPaths(matchInputs);
			lastPointerRef.current = { x, y };

			setInstallPrompt(null);
			setJobState((prev) =>
				prev && prev.status === "converting" ? prev : null
			);
			setWheelSession({
				openX: x,
				openY: y,
				paths: paths ?? [],
				urls: urls ?? [],
				isBrowserDrag: Boolean(isBrowserDrag),
				sides,
				side: 0,
				flipKey: 0
			});
			setActiveIndex(null);
			setIsCenterActive(true);
		});

		const unMove = listen<{ x: number; y: number }>("converter-donut-drag-move", (ev) => {
			if (!stateRef.current.wheelSession) return;
			const pt = { x: ev.payload.x, y: ev.payload.y };
			lastPointerRef.current = pt;
			const aim = aimAtPoint(pt);
			if (aim.isCenter) {
				if (stateRef.current.activeIndex !== null) setActiveIndex(null);
				if (!stateRef.current.isCenterActive) setIsCenterActive(true);
			} else {
				if (stateRef.current.isCenterActive) setIsCenterActive(false);
				if (stateRef.current.activeIndex !== aim.index) setActiveIndex(aim.index);
			}
		});

		const unDrop = listen<DonutDropPayload>("converter-donut-drop", (ev) => {
			const ws = stateRef.current.wheelSession;
			if (!ws) {
				releaseOverlayLock();
				return;
			}
			const dropPt = { x: ev.payload.x, y: ev.payload.y };
			lastPointerRef.current = dropPt;
			const aim = aimAtPoint(dropPt);
			const slices = stateRef.current.currentSlices;
			if (aim.isCenter || aim.index === null || !slices[aim.index]) {
				dismissWheelOrInstall();
				return;
			}

			const chosen = slices[aim.index];
			const inputs =
				ev.payload.paths && ev.payload.paths.length > 0
					? ev.payload.paths
					: ev.payload.urls && ev.payload.urls.length > 0
						? ev.payload.urls
						: ws.paths.length > 0
							? ws.paths
							: ws.urls;

			commitSlice(chosen, inputs, dropPt);
		});

		const unClose = listen("converter-donut-close", () => {
			if (
				stateRef.current.wheelSession ||
				stateRef.current.checkingJob ||
				stateRef.current.installPrompt
			) {
				sessionGenRef.current += 1;
				clearCheckingState();
				setWheelSession(null);
				setInstallPrompt(null);
				setActiveIndex(null);
				setIsCenterActive(false);
				requestAnimationFrame(() => {
					onRegionInvalidateRef.current?.();
				});
			}
		});

		const unProgress = listen<ConverterProgressPayload>("converter-progress", (ev) => {
			const p = ev.payload;
			if (!activeJobIdRef.current || p.job_id !== activeJobIdRef.current) return;

			if (p.kind === "progress" && typeof p.fraction === "number") {
				fileProgressRef.current.set(p.source, Math.max(0, Math.min(1, p.fraction)));
			} else if (p.kind === "file") {
				fileProgressRef.current.set(p.source, 1);
			}

			const vals = Array.from(fileProgressRef.current.values());
			const avg =
				vals.length > 0
					? vals.reduce((acc, v) => acc + v, 0) / vals.length
					: Math.max(0, Math.min(1, p.fraction ?? 0));

			setJobState((prev) =>
				prev && prev.jobId === p.job_id && prev.status === "converting"
					? { ...prev, fraction: avg }
					: prev
			);
		});

		const unCoreProgress = listen<CoreInstallProgressEvent>("converter-core-progress", (ev) => {
			setInstallPrompt((prev) =>
				prev && prev.installing ? { ...prev, coreProgress: ev.payload } : prev
			);
		});

		const unEngineProgress = listen<EngineInstallProgressEvent>(
			"converter-engine-progress",
			(ev) => {
				setInstallPrompt((prev) =>
					prev && prev.installing && (!prev.engineId || ev.payload.id === prev.engineId)
						? { ...prev, engineProgress: ev.payload }
						: prev
				);
			}
		);

		return () => {
			if (checkingTimerRef.current !== null) {
				window.clearTimeout(checkingTimerRef.current);
				checkingTimerRef.current = null;
			}
			unOpen.then((fn) => fn());
			unMove.then((fn) => fn());
			unDrop.then((fn) => fn());
			unClose.then((fn) => fn());
			unProgress.then((fn) => fn());
			unCoreProgress.then((fn) => fn());
			unEngineProgress.then((fn) => fn());
		};
	}, [aimAtPoint, clearCheckingState, commitSlice, dismissWheelOrInstall, refreshThemeSnap, releaseOverlayLock]);

	// Pointer, Wheel, and Keyboard handlers while Donut, Preflight Check, or Install Prompt is open.
	useEffect(() => {
		if (!wheelSession && !installPrompt && !checkingJob) return;
		let rafId: number | null = null;

		const onMouseMove = (e: MouseEvent) => {
			if (!stateRef.current.wheelSession) return;
			const pt = { x: e.clientX, y: e.clientY };
			lastPointerRef.current = pt;
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				const current = lastPointerRef.current;
				if (!current || !stateRef.current.wheelSession) return;
				const aim = aimAtPoint(current);
				if (aim.isCenter) {
					if (stateRef.current.activeIndex !== null) setActiveIndex(null);
					if (!stateRef.current.isCenterActive) setIsCenterActive(true);
				} else {
					if (stateRef.current.isCenterActive) setIsCenterActive(false);
					if (stateRef.current.activeIndex !== aim.index) setActiveIndex(aim.index);
				}
			});
		};

		const onWheel = (e: WheelEvent) => {
			if (!stateRef.current.wheelSession) return;
			if (stateRef.current.wheelSession.sides.secondary.length === 0) return;
			e.preventDefault();
			const now = performance.now();
			if (now - lastWheelFlipRef.current < WHEEL_FLIP_DEBOUNCE_MS) return;
			lastWheelFlipRef.current = now;
			flipSide();
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				dismissWheelOrInstall();
				return;
			}
			if (!stateRef.current.wheelSession) return;
			if (e.key === "Tab") {
				e.preventDefault();
				flipSide();
				return;
			}
			if (e.key === "Enter" || e.key === " ") {
				const { activeIndex: idx, currentSlices: slices, wheelSession: ws, centerPos: center } =
					stateRef.current;
				if (ws && idx !== null && slices[idx]) {
					e.preventDefault();
					const inputs = ws.paths.length > 0 ? ws.paths : ws.urls;
					commitSlice(slices[idx], inputs, lastPointerRef.current ?? center);
				}
			}
		};

		window.addEventListener("mousemove", onMouseMove, { passive: true });
		window.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("keydown", onKeyDown, { capture: true });

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("wheel", onWheel);
			window.removeEventListener("keydown", onKeyDown, { capture: true });
		};
	}, [
		Boolean(wheelSession),
		Boolean(installPrompt),
		Boolean(checkingJob),
		aimAtPoint,
		commitSlice,
		dismissWheelOrInstall,
		flipSide
	]);

	// Auto-dismiss Progress Ring after completion / error / cancellation (pauses while hovered).
	useEffect(() => {
		if (autoDismissTimerRef.current !== null) {
			window.clearTimeout(autoDismissTimerRef.current);
			autoDismissTimerRef.current = null;
		}
		if (!jobState || jobState.status === "converting" || jobState.status === "checking" || ringHovered) {
			return;
		}
		const delay =
			jobState.status === "done" ? 3400 : jobState.status === "cancelled" ? 1800 : 5200;
		const finishedId = jobState.jobId;
		autoDismissTimerRef.current = window.setTimeout(() => {
			autoDismissTimerRef.current = null;
			setJobState((prev) => (prev && prev.jobId === finishedId ? null : prev));
			if (activeJobIdRef.current === finishedId) {
				activeJobIdRef.current = null;
			}
		}, delay);
		return () => {
			if (autoDismissTimerRef.current !== null) {
				window.clearTimeout(autoDismissTimerRef.current);
				autoDismissTimerRef.current = null;
			}
		};
	}, [jobState?.jobId, jobState?.status, ringHovered]);

	const handleCancelJob = useCallback(() => {
		if (!jobState) return;
		const id = jobState.jobId;
		if (jobState.status === "converting") {
			cancelledJobIdsRef.current.add(id);
			if (cancelledJobIdsRef.current.size > 64) {
				const oldest = cancelledJobIdsRef.current.values().next().value;
				if (oldest !== undefined) cancelledJobIdsRef.current.delete(oldest);
			}
			invoke("converter_cancel", { jobId: id }).catch(() => {});
			setJobState((prev) =>
				prev && prev.jobId === id ? { ...prev, status: "cancelled", error: null } : prev
			);
			emitJobFinished(id, "cancelled", jobState.option, jobState.inputs, []);
		} else {
			setJobState(null);
			if (activeJobIdRef.current === id) {
				activeJobIdRef.current = null;
			}
		}
	}, [emitJobFinished, jobState]);

	const handleRevealOutput = useCallback(() => {
		if (!jobState || jobState.status !== "done") return;
		const target = jobState.outputs[0] ?? jobState.inputs[0];
		if (!target) return;
		revealItemInDir(target).catch(() => {
			const dirPath = parentDirectory(target);
			invoke("shelf_open", { path: dirPath }).catch(() => {});
		});
	}, [jobState]);

	const accentColor = themeSnap.accent;
	const accentForeground = getReadableForeground(accentColor);

	const backdropRadius = Math.ceil(actualMenuRadius + actualIconSize * 0.75 + 32);
	const sectorOuterRadius = Math.max(
		Math.round(actualMenuRadius + actualIconSize * 0.65),
		Math.floor(
			Math.min(
				centerPos.x,
				centerPos.y,
				viewportSize.width - centerPos.x,
				viewportSize.height - centerPos.y
			)
		)
	);

	const scrimBg = useMemo(() => {
		if (!wheelSession) return "transparent";
		return themeSnap.isLight
			? lightModeScrim(centerPos, backdropRadius)
			: radialScrimGradient(centerPos, 0.66, backdropRadius);
	}, [wheelSession, themeSnap.isLight, centerPos, backdropRadius]);

	const hasSecondSide = Boolean(wheelSession && wheelSession.sides.secondary.length > 0);
	const totalSides = hasSecondSide ? 2 : 1;
	const currentSideNum = wheelSession ? wheelSession.side + 1 : 1;

	const sourceSummary = useMemo(() => {
		if (!wheelSession) return "";
		const fileCount = wheelSession.paths.length;
		if (fileCount === 1) return extractBaseName(wheelSession.paths[0]);
		if (fileCount > 1) return c.donut.fileCount(fileCount);
		if (wheelSession.urls.length === 1) return extractBaseName(wheelSession.urls[0]);
		return c.donut.urlCount(wheelSession.urls.length);
	}, [wheelSession, c.donut]);

	const hubCountLabel = useMemo(() => {
		if (!wheelSession) return "";
		if (wheelSession.paths.length > 0) return c.donut.fileCount(wheelSession.paths.length);
		return c.donut.urlCount(wheelSession.urls.length);
	}, [wheelSession, c.donut]);

	const categoryLabel = wheelSession
		? c.donut.categories[wheelSession.sides.detectedCategory] ??
			wheelSession.sides.detectedCategory
		: "";

	const installCardPos = useMemo(() => {
		if (!installPrompt) return { left: 0, top: 0 };
		return clampBoxPosition(
			installPrompt.dropPoint,
			INSTALL_CARD_WIDTH,
			INSTALL_CARD_HEIGHT_EST,
			viewportSize
		);
	}, [installPrompt, viewportSize]);

	const activeRingJob = !wheelSession && !installPrompt
		? checkingVisible && checkingJob
			? checkingJob
			: jobState
		: null;

	const progressRingPos = useMemo(() => {
		if (!activeRingJob) return { left: 0, top: 0 };
		return clampBoxPosition(
			activeRingJob.dropPoint,
			PROGRESS_PILL_WIDTH_EST,
			PROGRESS_PILL_HEIGHT_EST,
			viewportSize
		);
	}, [activeRingJob, viewportSize]);

	const progressRingShown = Boolean(activeRingJob && !suppressed);

	const reportProgressBounds = useCallback(() => {
		const el = progressRingRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			invoke("converter_set_progress_rect", {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height
			}).catch(() => {});
		}
	}, []);

	useLayoutEffect(() => {
		if (!progressRingShown) return;
		reportProgressBounds();
		const el = progressRingRef.current;
		const observer =
			el && typeof ResizeObserver !== "undefined"
				? new ResizeObserver(reportProgressBounds)
				: null;
		if (el && observer) observer.observe(el);
		return () => {
			observer?.disconnect();
			invoke("converter_clear_progress_rect").catch(() => {});
		};
	}, [progressRingShown, progressRingPos.left, progressRingPos.top, reportProgressBounds]);

	const installPackMeta = useMemo(() => {
		if (!installPrompt) return null;
		const engineId = installPrompt.engineId;
		const catalogEntry = engineId ? c.packs.catalog[engineId] : undefined;
		const packName = catalogEntry?.name ?? engineId ?? "";
		const downloadBytes = installPrompt.enginePack?.download_size ?? 0;

		let title = c.donut.coreRequiredTitle;
		let desc = c.donut.coreRequiredDesc(installPrompt.option.label);
		if (engineId) {
			title = c.donut.packRequiredTitle;
			desc = installPrompt.needsCore
				? c.donut.coreAndPackRequiredDesc(packName, installPrompt.option.label)
				: c.donut.packRequiredDesc(packName, installPrompt.option.label);
		}

		let progressPct = 0;
		let progressLabel = "";
		if (installPrompt.installing) {
			if (installPrompt.engineProgress) {
				progressPct = Math.max(
					0,
					Math.min(100, Math.round(installPrompt.engineProgress.fraction * 100))
				);
				const ep = installPrompt.engineProgress;
				const stageName =
					ep.stage === "downloading"
						? c.packs.stageDownloading
						: ep.stage === "copying"
							? c.packs.stageCopying
							: ep.stage === "unpacking"
								? c.packs.stageUnpacking
								: c.packs.stageWorking;
				const bytesMeta =
					ep.bytes_total > 0
						? `${formatTransferAmount(ep.bytes_done)} / ${formatTransferAmount(ep.bytes_total)} · `
						: "";
				progressLabel = `${stageName}${bytesMeta ? ` · ${bytesMeta}` : " "}${progressPct}%`;
			} else if (installPrompt.coreProgress) {
				progressPct = Math.max(
					0,
					Math.min(100, Math.round(installPrompt.coreProgress.fraction * 100))
				);
				progressLabel = `${c.donut.installingCore} (${progressPct}%)`;
			} else {
				progressLabel = installPrompt.needsCore
					? c.donut.installingCore
					: c.donut.installingPack(packName);
			}
		}

		return {
			packName,
			downloadBytes,
			title,
			desc,
			progressPct,
			progressLabel
		};
	}, [installPrompt, c.donut, c.packs]);

	return (
		<div className="zn-conv-root" dir={dir}>
			{/* ── Two-Sided Converter Donut Wheel ── */}
			{wheelSession && !suppressed && (
				<div
					className="converter-donut-region"
					onContextMenu={(e) => {
						e.preventDefault();
						dismissWheelOrInstall();
					}}
				>
					<div
						className="zn-conv-scrim"
						style={{
							background: scrimBg,
							["--zn-op" as string]: revealed ? 1 : 0
						}}
						onClick={dismissWheelOrInstall}
					/>

					<div
						className="zn-conv-wheel-origin"
						style={{
							left: Math.round(centerPos.x),
							top: Math.round(centerPos.y)
						}}
					>
						{currentSlices.length > 0 && (
							<RadialSectors
								count={currentSlices.length}
								activeIndex={activeIndex}
								radiusInner={Math.max(deadZoneRadius, hubDiameter / 2 + 6)}
								radiusOuter={sectorOuterRadius}
								falloffRadius={backdropRadius}
								hoverColor={accentColor}
								visible={revealed}
								dimmed={false}
							/>
						)}

						{/* Center Hub */}
						<motion.div
							key={`hub-${wheelSession.flipKey}`}
							className="zn-conv-hub"
							initial={{ scale: 0.88, rotateY: wheelSession.flipKey > 0 ? 90 : 0 }}
							animate={{ scale: isCenterActive ? 1.04 : 1, rotateY: 0 }}
							transition={{ type: "spring", stiffness: 420, damping: 28 }}
							style={{
								width: `${hubDiameter}px`,
								height: `${hubDiameter}px`,
								marginLeft: `${-Math.round(hubDiameter / 2)}px`,
								marginTop: `${-Math.round(hubDiameter / 2)}px`,
								["--zn-op" as string]: revealed ? 1 : 0
							}}
							onMouseDown={(e) => e.stopPropagation()}
							onMouseUp={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								if (hasSecondSide) {
									flipSide();
								} else {
									dismissWheelOrInstall();
								}
							}}
							title={hasSecondSide ? c.donut.flipAction : c.donut.dropPrompt}
						>
							<svg
								className="zn-conv-hub-ring"
								width={hubDiameter}
								height={hubDiameter}
								viewBox={`0 0 ${hubDiameter} ${hubDiameter}`}
								shapeRendering="geometricPrecision"
								aria-hidden
							>
								<circle
									cx={hubDiameter / 2}
									cy={hubDiameter / 2}
									r={(hubDiameter - 2) / 2}
									fill="none"
									stroke={isCenterActive ? accentColor : "var(--zenith-border, rgba(255,255,255,0.22))"}
									strokeWidth={1.6}
								/>
							</svg>

							<span className="zn-conv-hub-count">{hubCountLabel}</span>
							<span className="zn-conv-hub-cat">{categoryLabel}</span>
							<span
								className="zn-conv-hub-side"
								style={
									hasSecondSide && wheelSession.side === 1
										? {
												backgroundColor: accentColor,
												borderColor: accentColor,
												color: accentForeground
											}
										: undefined
								}
							>
								{c.donut.sideIndicator(currentSideNum, totalSides)}
							</span>
						</motion.div>

						{/* Target Slices */}
						{currentSlices.length === 0 ? (
							<div
								className="zn-conv-context-pill"
								style={{
									["--zn-tf" as string]: "translate(-50%, -50%)",
									["--zn-op" as string]: 1
								}}
							>
								<div className="zn-conv-context-inner">
									<span>{c.donut.noTargets}</span>
								</div>
							</div>
						) : (
							currentSlices.map((option, index) => {
								const isActive = index === activeIndex;
								let angularDistance: number | null = null;
								if (activeIndex !== null) {
									const raw = Math.abs(index - activeIndex);
									angularDistance = Math.min(raw, currentSlices.length - raw);
								}
								return (
									<DonutSlice
										key={`${wheelSession.side}-${option.presetId ?? option.format}-${index}`}
										option={option}
										index={index}
										total={currentSlices.length}
										isActive={isActive}
										angularDistance={angularDistance}
										actualMenuRadius={actualMenuRadius}
										actualIconSize={actualIconSize}
										accentColor={accentColor}
										accentForeground={accentForeground}
										revealed={revealed}
										onClick={(opt) => {
											const inputs =
												wheelSession.paths.length > 0
													? wheelSession.paths
													: wheelSession.urls;
											commitSlice(opt, inputs, lastPointerRef.current ?? centerPos);
										}}
									/>
								);
							})
						)}

						{/* Bottom Context & Side Flip Pill */}
						<div
							className="zn-conv-context-pill"
							style={{
								["--zn-tf" as string]: `translate(-50%, 0) translate3d(0, ${Math.round(
									actualMenuRadius + actualIconSize * 0.75 + 26
								)}px, 0)`,
								["--zn-op" as string]: revealed ? 1 : 0
							}}
							onMouseDown={(e) => e.stopPropagation()}
							onMouseUp={(e) => e.stopPropagation()}
						>
							<div className="zn-conv-context-inner">
								<span className="zn-conv-context-source">
									{activeIndex !== null && currentSlices[activeIndex]
										? currentSlices[activeIndex].label
										: sourceSummary || c.donut.dropPrompt}
								</span>

								{hasSecondSide && (
									<button
										type="button"
										className="zn-conv-flip-btn"
										onClick={(e) => {
											e.stopPropagation();
											flipSide();
										}}
									>
										<ArrowLeftRight size={11} />
										<span>{c.donut.sideIndicator(currentSideNum, totalSides)}</span>
										<span className="zn-conv-flip-kbd">{c.donut.flipHint}</span>
									</button>
								)}

								<button
									type="button"
									className="zn-conv-close-mini"
									onClick={(e) => {
										e.stopPropagation();
										dismissWheelOrInstall();
									}}
									title={c.donut.escToCancel}
									aria-label={c.donut.dismiss}
								>
									<X size={12} />
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ── Inline Missing Core / Optional Engine Pack Card ── */}
			<AnimatePresence onExitComplete={() => onRegionInvalidateRef.current?.()}>
				{installPrompt && installPackMeta && !suppressed && (
					<motion.div
						ref={installCardRef}
						key="converter-install-card"
						className="converter-install-card"
						role="dialog"
						aria-label={installPackMeta.title}
						style={{ left: installCardPos.left, top: installCardPos.top }}
						initial={{ opacity: 0, scale: 0.92, y: 6 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.94, y: 4 }}
						transition={{ type: "spring", stiffness: 420, damping: 30 }}
						onMouseDown={(e) => e.stopPropagation()}
					>
						<div className="zn-conv-card-header">
							<div className="zn-conv-card-title-group">
								<div className="zn-conv-card-icon">
									<Package size={16} />
								</div>
								<div className="zn-conv-card-title">{installPackMeta.title}</div>
							</div>
							<button
								type="button"
								className="zn-conv-close-mini"
								onClick={dismissWheelOrInstall}
								disabled={installPrompt.installing}
								title={t.common.cancel}
								aria-label={t.common.cancel}
							>
								<X size={13} />
							</button>
						</div>

						<div className="zn-conv-card-desc">{installPackMeta.desc}</div>

						<div className="zn-conv-card-badges">
							{installPackMeta.packName && (
								<span className="zn-conv-card-pill">{installPackMeta.packName}</span>
							)}
							{installPackMeta.downloadBytes > 0 && (
								<span className="zn-conv-card-pill">
									{c.donut.packSizeBadge(formatPackSize(installPackMeta.downloadBytes))}
								</span>
							)}
							<span className="zn-conv-card-pill" dir="ltr">
								→ {installPrompt.option.label}
							</span>
						</div>

						{installPrompt.needsCore && installPrompt.engineId && !installPrompt.installing && (
							<div className="zn-conv-card-note">{c.donut.installCoreNote}</div>
						)}

						{installPrompt.installing && (
							<div className="zn-conv-card-progress">
								<div className="zn-conv-card-progress-meta">
									<span>{installPackMeta.progressLabel}</span>
									<span>{installPackMeta.progressPct}%</span>
								</div>
								<div className="zn-conv-card-track">
									<div
										className="zn-conv-card-fill"
										style={{
											width: `${Math.max(installPackMeta.progressPct, 6)}%`,
											backgroundColor: accentColor
										}}
									/>
								</div>
							</div>
						)}

						{installPrompt.enginePack && !installPrompt.enginePack.downloadable && !installPrompt.error && (
							<div className="zn-conv-card-error" role="status">
								<AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
								<span>
									{installPrompt.enginePack.unavailable_reason || c.donut.unavailablePack}
								</span>
							</div>
						)}

						{installPrompt.error && (
							<div className="zn-conv-card-error" role="alert">
								<AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
								<span>{installPrompt.error}</span>
							</div>
						)}

						<div className="zn-conv-card-actions">
							<button
								type="button"
								className="zn-conv-btn"
								onClick={dismissWheelOrInstall}
								disabled={installPrompt.installing}
							>
								{t.common.cancel}
							</button>
							<button
								type="button"
								className="zn-conv-btn zn-conv-btn-primary"
								style={{
									backgroundColor: accentColor,
									color: accentForeground
								}}
								onClick={handleConfirmInstall}
								disabled={
									installPrompt.installing ||
									Boolean(installPrompt.enginePack && !installPrompt.enginePack.downloadable)
								}
							>
								{installPrompt.installing ? (
									<Loader2 size={13} className="zn-conv-spin" />
								) : (
									<Download size={13} />
								)}
								<span>
									{installPrompt.installing
										? c.packs.installing
										: installPrompt.error
											? c.donut.retryInstallAndConvert
											: c.donut.installAndConvert}
								</span>
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* ── Compact Floating Progress Ring ── */}
			<AnimatePresence onExitComplete={() => onRegionInvalidateRef.current?.()}>
				{activeRingJob && !suppressed && (
					<motion.div
						ref={progressRingRef}
						key="converter-progress-ring"
						className={`converter-progress-ring is-${activeRingJob.status}`}
						style={{ left: progressRingPos.left, top: progressRingPos.top }}
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.9 }}
						transition={{ type: "spring", stiffness: 440, damping: 32 }}
						onAnimationComplete={() => {
							if (progressRingShown) reportProgressBounds();
						}}
						onMouseEnter={() => setRingHovered(true)}
						onMouseLeave={() => setRingHovered(false)}
						onClick={activeRingJob.status === "done" ? handleRevealOutput : undefined}
						title={activeRingJob.status === "done" ? c.donut.clickToReveal : undefined}
					>
						<div className="zn-conv-ring-visual">
							<svg
								className={`zn-conv-ring-svg${
									activeRingJob.status === "checking" ||
									(activeRingJob.status === "converting" && activeRingJob.fraction <= 0.01)
										? " is-indeterminate"
										: ""
								}`}
								viewBox="0 0 38 38"
								aria-hidden
							>
								<circle cx="19" cy="19" r={PROGRESS_RING_RADIUS} className="zn-conv-ring-track" />
								<circle
									cx="19"
									cy="19"
									r={PROGRESS_RING_RADIUS}
									className="zn-conv-ring-arc"
									strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
									strokeDashoffset={
										activeRingJob.status === "done"
											? 0
											: activeRingJob.status === "checking" ||
												  (activeRingJob.status === "converting" &&
														activeRingJob.fraction <= 0.01)
												? PROGRESS_RING_CIRCUMFERENCE * 0.72
												: PROGRESS_RING_CIRCUMFERENCE *
													(1 - Math.max(0.04, Math.min(1, activeRingJob.fraction)))
									}
									style={
										activeRingJob.status === "converting" || activeRingJob.status === "checking"
											? { stroke: accentColor }
											: undefined
									}
								/>
							</svg>
							<div className="zn-conv-ring-center">
								{activeRingJob.status === "done" ? (
									<Check size={14} strokeWidth={2.5} />
								) : activeRingJob.status === "error" ? (
									<AlertCircle size={14} strokeWidth={2.3} />
								) : activeRingJob.status === "cancelled" ? (
									<X size={13} strokeWidth={2.3} />
								) : activeRingJob.status === "checking" ? (
									"..."
								) : (
									`${Math.round(activeRingJob.fraction * 100)}%`
								)}
							</div>
						</div>

						<div className="zn-conv-ring-body">
							<div className="zn-conv-ring-title">
								{activeRingJob.inputs.length === 1
									? `${extractBaseName(activeRingJob.inputs[0])} → ${activeRingJob.option.label}`
									: `${c.donut.fileCount(activeRingJob.inputs.length)} → ${activeRingJob.option.label}`}
							</div>
							<div className="zn-conv-ring-sub">
								{activeRingJob.status === "checking"
									? c.donut.checkingRuntime
									: activeRingJob.status === "converting"
										? c.donut.convertingTitle
										: activeRingJob.status === "done"
											? `✓ ${c.donut.doneTitle} · ${c.donut.doneOutputsCount(
													Math.max(1, activeRingJob.outputs.length)
												)}`
											: activeRingJob.status === "cancelled"
												? c.donut.cancelledTitle
												: activeRingJob.error || c.donut.failedTitle}
							</div>
						</div>

						<div className="zn-conv-ring-actions">
							{activeRingJob.status === "done" && (
								<button
									type="button"
									className="zn-conv-ring-btn"
									onClick={(e) => {
										e.stopPropagation();
										handleRevealOutput();
									}}
									title={c.donut.openFolder}
									aria-label={c.donut.openFolder}
								>
									<FolderOpen size={12} />
								</button>
							)}
							<button
								type="button"
								className="zn-conv-ring-btn"
								onClick={(e) => {
									e.stopPropagation();
									if (activeRingJob.status === "checking") {
										dismissWheelOrInstall();
									} else {
										handleCancelJob();
									}
								}}
								title={
									activeRingJob.status === "converting" || activeRingJob.status === "checking"
										? c.donut.cancelJob
										: c.donut.dismiss
								}
								aria-label={
									activeRingJob.status === "converting" || activeRingJob.status === "checking"
										? c.donut.cancelJob
										: c.donut.dismiss
								}
							>
								<X size={12} />
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export default ConverterDonut;
