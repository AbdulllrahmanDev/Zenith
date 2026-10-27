import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CornerUpLeft, Settings as SettingsIcon } from "lucide-react";
import type { RadialItem, RadialWorkspace, RadialWheelConfig } from "../radial/types";
import { DEFAULT_WORKSPACES, DEFAULT_WHEEL_CONFIG } from "../radial/types";
import { sectorIndexForDelta } from "../radial/radialSectors";
import {
	HUB_TARGET,
	noteForHighlight,
	playRadialSound,
	setRadialSoundVolume,
	sleepRadialSound,
	wakeRadialSound,
	type RadialSoundId,
	type RadialSounds,
	isRadialSoundId
} from "../radial/radialSound";
import { clampDwellMs } from "../radial/radialDwell";
import { HUB_DRAG_SLOP_PX, clampWheelCenter } from "../radial/radialDrag";
import { radialScrimGradient } from "../radial/radialScrim";
import { RovylLogo } from "../radial/RovylLogo";
import { SmartIcon } from "../radial/SmartIcon";
import { getRadialIcon } from "../radial/iconMap";
import {
	computeRadialLayout,
	getLabelPlacement,
	getReadableForeground,
	getSlicePresence,
	normalizeHoverColor,
	roundedRectPathFromTop,
	snapToDevicePixel,
	RadialSectors,
	LAUNCH_ECHO_MS,
	FIRED_SLICE_SCALE
} from "../radial/radialLayout";
import "./RadialMenu.css";

const INSTANT_ARM_DELAY_MS = 120;
const INSTANT_ARM_DISPLACEMENT_PX = 24;
const INSTANT_QUARANTINE_MS = 300;
const DWELL_SETTLE_PX = 10;
const DWELL_SETTLE_MS = 90;
const DWELL_HOLD_PX = 26;
const DWELL_ARC_MIN_MS = 90;

export interface RadialMenuProps {
	openX: number;
	openY: number;
	viewportWidth?: number;
	viewportHeight?: number;
	triggerMode: "hold" | "click";
	placement: "cursor" | "center";
	selectionMode: "area" | "cursor";
	areaWedges: boolean;
	instantActivate: "off" | "dwell";
	instantDwellMs: number;
	instantSensitivity?: "low" | "medium" | "high";
	numberLaunch: boolean;
	numberLabels: boolean;
	workspacePeek?: boolean;
	workspacePeekStyle?: "fan" | "ring";
	workspacePeekDelayMs?: number;
	soundEnabled: boolean;
	soundVolume: number;
	workspacesJson: string;
	activeWorkspaceId: string;
	wheelConfig?: Partial<RadialWheelConfig>;
	onClose: () => void;
	onLaunchVolumeMixer?: () => void;
}

interface RadialSliceProps {
	item: RadialItem;
	index: number;
	isActive: boolean;
	angularDistance: number | null;
	actualMenuRadius: number;
	actualIconSize: number;
	totalApps: number;
	backdropOpacity: number;
	hoverColor: string;
	showLabels: boolean;
	alwaysShowAppLabels: boolean;
	bloom: boolean;
	numberHint?: string;
	dwellMs?: number;
	dwellKey?: number;
	echo?: "fired" | "faded";
	echoMs?: number;
	onClick: (item: RadialItem) => void;
}

const RadialSlice = React.memo(
	({
		item,
		index,
		isActive,
		angularDistance,
		actualMenuRadius,
		actualIconSize,
		totalApps,
		backdropOpacity,
		hoverColor,
		showLabels,
		alwaysShowAppLabels,
		bloom,
		numberHint,
		dwellMs,
		dwellKey,
		echo,
		echoMs,
		onClick
	}: RadialSliceProps) => {
		const sliceAngle = 360 / Math.max(totalApps, 1);
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
		const activeForeground = getReadableForeground(hoverColor);

		const dwellRingSize = actualIconSize + 14;
		const dwellRingInset = (dwellRingSize - actualIconSize) / 2 - 1.25;
		const dwellRingRadius = Math.min(18 + dwellRingInset, (dwellRingSize - 2.5) / 2);
		const dwellRingPath = roundedRectPathFromTop(dwellRingSize, 1.25, dwellRingRadius);

		const fired = echo === "fired";
		const waveSize = actualIconSize + 6;
		const waveRadius = 21;
		const isFolder = item.type === "submenu" && item.children && item.children.length > 0;

		return (
			<div
				className={`zn-radial-slice${echo ? ` zn-radial-slice--${echo}` : ""}`}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					pointerEvents: "none",
					["--zn-tf" as string]: bloom
						? `translate3d(${snapToDevicePixel(pos.x)}px, ${snapToDevicePixel(pos.y)}px, 0) scale(${
								fired
									? FIRED_SLICE_SCALE
									: echo === "faded"
										? presence.scale * 0.88
										: presence.scale
							})`
						: "translate3d(0px, 0px, 0) scale(0.2)",
					["--zn-op" as string]: fired
						? 1
						: echo === "faded"
							? 0
							: bloom
								? presence.opacity
								: 0,
					...(echoMs ? { ["--zn-echo-ms" as string]: `${echoMs}ms` } : null),
					zIndex: fired ? 300 : isActive ? 200 : 100
				}}
				onMouseDown={(e) => e.stopPropagation()}
				onMouseUp={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					onClick(item);
				}}
			>
				<div
					style={{
						position: "relative",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						transform: "translate(-50%, -50%)"
					}}
				>
					{/* Dwell Progress Ring */}
					{dwellMs != null && (
						<svg
							key={dwellKey}
							style={{
								position: "absolute",
								left: "50%",
								top: "50%",
								transform: "translate(-50%, -50%)",
								pointerEvents: "none",
								zIndex: 10
							}}
							width={dwellRingSize}
							height={dwellRingSize}
							viewBox={`0 0 ${dwellRingSize} ${dwellRingSize}`}
							shapeRendering="geometricPrecision"
							aria-hidden
						>
							<path d={dwellRingPath} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={4.5} />
							<path d={dwellRingPath} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={2.5} />
							<path
								className="zn-dwell-arc"
								d={dwellRingPath}
								fill="none"
								stroke={hoverColor}
								strokeWidth={2.5}
								pathLength={1}
								style={{ ["--zn-dwell-ms" as string]: `${dwellMs}ms` }}
							/>
						</svg>
					)}

					{/* Launch Echo Waves */}
					{fired && (
						<>
							<span
								className="zn-launch-wave"
								style={{
									left: "50%",
									top: "50%",
									width: `${waveSize}px`,
									height: `${waveSize}px`,
									borderRadius: `${waveRadius}px`,
									border: `2px solid ${hoverColor}`,
									zIndex: 0
								}}
								aria-hidden
							/>
							<span
								className="zn-launch-wave zn-launch-wave--late"
								style={{
									left: "50%",
									top: "50%",
									width: `${waveSize}px`,
									height: `${waveSize}px`,
									borderRadius: `${waveRadius}px`,
									border: `2px solid ${hoverColor}`,
									zIndex: 0
								}}
								aria-hidden
							/>
						</>
					)}

					{/* Tile Plate Wrapper */}
					<div
						className={fired ? "zn-launch-pop" : undefined}
						style={{
							position: "relative",
							zIndex: 20,
							width: `${actualIconSize}px`,
							height: `${actualIconSize}px`,
							pointerEvents: bloom ? "auto" : "none",
							cursor: bloom ? "pointer" : "default"
						}}
					>
						<div
							style={{
								width: "100%",
								height: "100%",
								borderRadius: "18px",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								position: "relative",
								overflow: "hidden",
								transition: "background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
								backgroundColor: isActive
									? hoverColor
									: `rgb(${12 + Math.round(backdropOpacity * 10)}, ${12 + Math.round(backdropOpacity * 10)}, ${14 + Math.round(backdropOpacity * 10)})`,
								border: isActive
									? `1px solid ${hoverColor}`
									: `1px solid rgba(255,255,255,${(0.28 + backdropOpacity * 0.08).toFixed(2)})`,
								color: isActive ? activeForeground : "#ffffff",
								boxShadow: isActive
									? `0 0 0 1px rgba(0,0,0,0.45), 0 0 0 4px ${hoverColor}2e, 0 0 22px ${hoverColor}38, 0 12px 28px rgba(0,0,0,0.5)`
									: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.5), 0 8px 22px rgba(0,0,0,0.42)"
							}}
						>
							<SmartIcon item={item} size={actualIconSize} />
						</div>

						{/* Top-Left Circular Number Badge (1-9) */}
						{numberHint && (
							<div
								style={{
									position: "absolute",
									top: "-4px",
									left: "-4px",
									minWidth: "18px",
									height: "18px",
									padding: "0 4px",
									borderRadius: "999px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									zIndex: 30,
									background: isActive ? hoverColor : "rgba(6,7,9,0.95)",
									border: `1px solid ${isActive ? hoverColor : "rgba(255,255,255,0.26)"}`,
									color: isActive ? activeForeground : "rgba(255,255,255,0.78)",
									boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
									fontSize: "11px",
									fontWeight: 600,
									lineHeight: 1
								}}
								aria-hidden
							>
								{numberHint}
							</div>
						)}

						{/* Bottom-Right Submenu/Folder Badge */}
						{isFolder && (
							<div
								style={{
									position: "absolute",
									bottom: "-4px",
									right: "-4px",
									width: "20px",
									height: "20px",
									background: "#ffffff",
									borderRadius: "999px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "2px",
									border: "2px solid #1A1A1A",
									zIndex: 30,
									boxShadow: "0 2px 6px rgba(0,0,0,0.45)"
								}}
							>
								<div style={{ width: 4, height: 4, borderRadius: "50%", background: "#000" }} />
								<div style={{ width: 4, height: 4, borderRadius: "50%", background: "#000" }} />
							</div>
						)}
					</div>

					{/* Outer Ray-Aligned Label Pill */}
					{showLabels && (
						<div
							className={`zn-radial-label${fired ? " zn-launch-fade" : ""}`}
							style={{
								position: "absolute",
								left: "50%",
								top: "50%",
								pointerEvents: "none",
								zIndex: 30,
								["--zn-tf" as string]:
									`translate(${labelPlacement.originX}, ${labelPlacement.originY})` +
									` translate3d(${snapToDevicePixel(labelPlacement.x)}px, ${snapToDevicePixel(labelPlacement.y)}px, 0)` +
									` scale(${alwaysShowAppLabels ? (isActive ? 1 : 0.94) : isActive ? 1 : 0.9})`,
								["--zn-op" as string]: alwaysShowAppLabels
									? isActive
										? 1
										: 0.9
									: isActive
										? 1
										: 0
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "6px",
									padding: "6px 12px",
									borderRadius: "999px",
									whiteSpace: "nowrap",
									background: isActive ? hoverColor : "rgba(6,7,9,0.95)",
									border: `1px solid ${isActive ? hoverColor : "rgba(255,255,255,0.2)"}`,
									boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.45)"
								}}
							>
								<span
									style={{
										fontSize: "12px",
										lineHeight: 1,
										fontWeight: 500,
										letterSpacing: "-0.005em",
										color: isActive ? activeForeground : "rgba(255,255,255,0.78)"
									}}
								>
									{item.label}
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}
);
RadialSlice.displayName = "RadialSlice";

export default function RadialMenu({
	openX,
	openY,
	viewportWidth,
	viewportHeight,
	triggerMode,
	placement,
	selectionMode,
	areaWedges,
	instantActivate,
	instantDwellMs,
	numberLaunch,
	numberLabels,
	workspacePeek = true,
	workspacePeekDelayMs = 220,
	soundEnabled,
	soundVolume,
	workspacesJson,
	activeWorkspaceId,
	wheelConfig: wheelConfigProp,
	onClose,
	onLaunchVolumeMixer
}: RadialMenuProps) {
	const cfg: RadialWheelConfig = useMemo(
		() => ({
			...DEFAULT_WHEEL_CONFIG,
			...wheelConfigProp
		}),
		[wheelConfigProp]
	);

	const workspaces: RadialWorkspace[] = useMemo(() => {
		try {
			const parsed = JSON.parse(workspacesJson);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed.filter((w: RadialWorkspace) => w.enabled !== false);
			}
		} catch {}
		return DEFAULT_WORKSPACES;
	}, [workspacesJson]);

	const [currentWsId, setCurrentWsId] = useState<string>(
		activeWorkspaceId || workspaces[0]?.id || "main"
	);

	useEffect(() => {
		if (activeWorkspaceId) setCurrentWsId(activeWorkspaceId);
	}, [activeWorkspaceId]);

	const currentWorkspace = useMemo(
		() => workspaces.find((w) => w.id === currentWsId) || workspaces[0] || DEFAULT_WORKSPACES[0],
		[workspaces, currentWsId]
	);

	const viewportSize = useMemo(
		() => ({
			width: viewportWidth || window.innerWidth || 1920,
			height: viewportHeight || window.innerHeight || 1080
		}),
		[viewportWidth, viewportHeight]
	);

	// Wheel center position (supports Hub Drag-to-Carry!)
	const [centerPos, setCenterPos] = useState<{ x: number; y: number }>(() => {
		if (placement === "center") {
			return { x: Math.round(viewportSize.width / 2), y: Math.round(viewportSize.height / 2) };
		}
		return {
			x: Math.max(180, Math.min(viewportSize.width - 180, openX)),
			y: Math.max(180, Math.min(viewportSize.height - 180, openY))
		};
	});

	useEffect(() => {
		if (placement === "center") {
			setCenterPos({ x: Math.round(viewportSize.width / 2), y: Math.round(viewportSize.height / 2) });
		} else {
			setCenterPos({
				x: Math.max(180, Math.min(viewportSize.width - 180, openX)),
				y: Math.max(180, Math.min(viewportSize.height - 180, openY))
			});
		}
	}, [openX, openY, placement, viewportSize.width, viewportSize.height]);

	// Folder / Submenu navigation stack
	const [folderStack, setFolderStack] = useState<{ label: string; items: RadialItem[] }[]>([]);
	const [typeAhead, setTypeAhead] = useState("");
	const typeAheadRef = useRef(typeAhead);
	typeAheadRef.current = typeAhead;

	const rawLevelItems = useMemo(() => {
		if (folderStack.length > 0) {
			return folderStack[folderStack.length - 1].items;
		}
		return currentWorkspace?.items || [];
	}, [folderStack, currentWorkspace]);

	const currentLevelItems = useMemo(() => {
		const q = typeAhead.trim().toLowerCase();
		if (!q) return rawLevelItems;
		return rawLevelItems.filter((item) => item.label.toLowerCase().includes(q));
	}, [rawLevelItems, typeAhead]);

	// Active slice & center state
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [isCenterActive, setIsCenterActive] = useState(false);
	const [bloom, setBloom] = useState(false);
	const [isExiting, setIsExiting] = useState(false);
	const [launchEcho, setLaunchEcho] = useState<{ index: number; key: number } | null>(null);

	// Workspace Peek state
	const [peekWsId, setPeekWsId] = useState<string | null>(null);
	const peekTimerRef = useRef<number | null>(null);

	const hoverColor = normalizeHoverColor(cfg.hoverColor);
	const hoverForeground = getReadableForeground(hoverColor);

	const { actualMenuRadius, actualIconSize } = useMemo(
		() =>
			computeRadialLayout({
				numberOfApps: currentLevelItems.length,
				iconSizePx: cfg.iconSize,
				minGap: cfg.appSpacing,
				menuRadius: cfg.menuRadius,
				activationThreshold: cfg.activationThreshold,
				viewportSize
			}),
		[
			currentLevelItems.length,
			cfg.iconSize,
			cfg.appSpacing,
			cfg.menuRadius,
			cfg.activationThreshold,
			viewportSize
		]
	);

	const hubDiameter =
		Math.max(
			32,
			Math.min(
				Math.round(cfg.iconSize * 0.82 * 1.2),
				Math.round((actualMenuRadius - actualIconSize / 2 - 10) * 2)
			)
		) & ~1;
	const hubHitSize = Math.round(hubDiameter * 1.06) + 4;
	const deadZoneRadius = Math.max(
		cfg.activationThreshold ?? 60,
		Math.ceil((hubDiameter / 2) * 1.06 * Math.SQRT2) + 4
	);

	// Sound configuration & lifecycle
	const sounds: RadialSounds = useMemo(() => {
		if (!soundEnabled) return { open: null, hover: null };
		const openId: RadialSoundId | null = isRadialSoundId(cfg.openSoundId)
			? cfg.openSoundId
			: cfg.openSoundId === "off"
				? null
				: "sub-tick";
		const hoverId: RadialSoundId | null = isRadialSoundId(cfg.hoverSoundId)
			? cfg.hoverSoundId
			: cfg.hoverSoundId === "off"
				? null
				: "sub-tick";
		return { open: openId, hover: hoverId };
	}, [soundEnabled, cfg.openSoundId, cfg.hoverSoundId]);

	const bloomedAtRef = useRef<number | null>(null);
	const aimedAwayRef = useRef(false);
	const soundedHighlightRef = useRef<string | null>(null);

	useEffect(() => {
		setRadialSoundVolume(soundVolume);
	}, [soundVolume]);

	useEffect(() => {
		if (sounds.open || sounds.hover) {
			wakeRadialSound();
		} else {
			sleepRadialSound();
		}
		return () => sleepRadialSound();
	}, [sounds.open, sounds.hover]);

	// Bloom entrance animation + open sound
	const paintReadyAtRef = useRef<number | null>(null);
	useLayoutEffect(() => {
		setBloom(false);
		paintReadyAtRef.current = null;
		const raf = requestAnimationFrame(() => {
			paintReadyAtRef.current = Date.now();
			setBloom(true);
			if (bloomedAtRef.current === null) {
				bloomedAtRef.current = performance.now();
				if (sounds.open) playRadialSound(sounds.open);
			}
		});
		return () => cancelAnimationFrame(raf);
	}, [currentLevelItems, sounds.open]);

	// Highlight sound effect
	const highlight =
		activeIndex !== null
			? currentLevelItems[activeIndex]?.id ?? null
			: isCenterActive
				? HUB_TARGET
				: null;

	useEffect(() => {
		const prev = soundedHighlightRef.current;
		soundedHighlightRef.current = highlight;
		if (highlight === prev) return;
		const aimedAway = aimedAwayRef.current;
		if (highlight !== null && highlight !== HUB_TARGET) aimedAwayRef.current = true;
		const bloomedAt = bloomedAtRef.current;
		if (isExiting || closingRef.current || bloomedAt === null) return;
		const note = noteForHighlight(highlight, aimedAway, performance.now() - bloomedAt, sounds);
		if (note) playRadialSound(note);
	}, [highlight, isExiting, sounds]);

	// State refs for zero-latency event handlers
	const closingRef = useRef(false);
	const exitingRef = useRef(false);
	const gestureConsumedRef = useRef(false);
	const launchEchoTimerRef = useRef<number | null>(null);
	const launchEchoSeqRef = useRef(0);
	const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

	// Dwell refs
	const levelGenRef = useRef(0);
	const dwellArmedRef = useRef(false);
	const dwellBaselineRef = useRef<{ x: number; y: number } | null>(null);
	const dwellTimerRef = useRef<number | null>(null);
	const dwellTargetRef = useRef<{ gen: number; index: number; itemId: string } | null>(null);
	const dwellPendingRef = useRef<{ gen: number; index: number; itemId: string } | null>(null);
	const dwellSettleTimerRef = useRef<number | null>(null);
	const dwellAnchorRef = useRef<{ x: number; y: number } | null>(null);
	const quarantineUntilRef = useRef(0);
	const dwellSeqRef = useRef(0);
	const [dwellTick, setDwellTick] = useState<{ index: number; key: number } | null>(null);

	const dwellMsVal = clampDwellMs(instantDwellMs);
	const dwellSettleMs = Math.min(DWELL_SETTLE_MS, dwellMsVal);
	const dwellRunMs = Math.max(0, dwellMsVal - dwellSettleMs);

	const cancelDwell = useCallback(() => {
		if (dwellTimerRef.current !== null) {
			window.clearTimeout(dwellTimerRef.current);
			dwellTimerRef.current = null;
		}
		if (dwellSettleTimerRef.current !== null) {
			window.clearTimeout(dwellSettleTimerRef.current);
			dwellSettleTimerRef.current = null;
		}
		dwellPendingRef.current = null;
		dwellAnchorRef.current = null;
		if (dwellTargetRef.current !== null) {
			dwellTargetRef.current = null;
			setDwellTick(null);
		}
	}, []);

	const disarmDwell = useCallback(() => {
		cancelDwell();
		dwellArmedRef.current = false;
		dwellBaselineRef.current = null;
	}, [cancelDwell]);

	const stateRef = useRef({
		centerPos,
		viewportSize,
		currentLevelItems,
		folderStack,
		selectionMode,
		actualMenuRadius,
		actualIconSize,
		deadZoneRadius,
		activeIndex,
		isCenterActive,
		instantActivate,
		dwellSettleMs,
		dwellRunMs
	});

	useLayoutEffect(() => {
		stateRef.current = {
			centerPos,
			viewportSize,
			currentLevelItems,
			folderStack,
			selectionMode,
			actualMenuRadius,
			actualIconSize,
			deadZoneRadius,
			activeIndex,
			isCenterActive,
			instantActivate,
			dwellSettleMs,
			dwellRunMs
		};
	});

	const resolveAimAtPoint = useCallback(
		(point: { x: number; y: number } | null): { isCenter: boolean; index: number | null } => {
			const {
				centerPos: pos,
				currentLevelItems: items,
				selectionMode: selMode,
				actualMenuRadius: radius,
				actualIconSize: iconSz,
				deadZoneRadius: deadZone
			} = stateRef.current;

			if (!point) return { isCenter: true, index: null };
			const dx = point.x - pos.x;
			const dy = point.y - pos.y;
			if (dx * dx + dy * dy < deadZone * deadZone) {
				return { isCenter: true, index: null };
			}
			if (items.length === 0) return { isCenter: false, index: null };

			const candidateIndex = sectorIndexForDelta(dx, dy, items.length);
			if (selMode === "cursor") {
				if (candidateIndex === null) return { isCenter: false, index: null };
				const sliceAngle = 360 / items.length;
				const hitRadius = Math.max(iconSz * 0.85, 22);
				const itemRad = (candidateIndex * sliceAngle - 90) * (Math.PI / 180);
				const targetX = radius * Math.cos(itemRad);
				const targetY = radius * Math.sin(itemRad);
				const diffX = dx - targetX;
				const diffY = dy - targetY;
				return {
					isCenter: false,
					index: diffX * diffX + diffY * diffY <= hitRadius * hitRadius ? candidateIndex : null
				};
			}

			return { isCenter: false, index: candidateIndex };
		},
		[]
	);

	const dismissWithAnimation = useCallback(() => {
		if (exitingRef.current) return;
		exitingRef.current = true;
		closingRef.current = true;
		cancelDwell();
		if (launchEchoTimerRef.current !== null) {
			window.clearTimeout(launchEchoTimerRef.current);
			launchEchoTimerRef.current = null;
		}
		setIsExiting(true);
		setBloom(false);
		window.setTimeout(() => {
			invoke("close_radial_menu").catch(() => {});
			onClose();
		}, 120);
	}, [cancelDwell, onClose]);

	const executeItem = useCallback(
		(item: RadialItem, sliceIdx?: number) => {
			if (Date.now() < quarantineUntilRef.current) return;
			if (launchEchoTimerRef.current !== null || closingRef.current) return;
			disarmDwell();

			// Submenu / Folder navigation stays inside the wheel
			if (item.type === "submenu" && item.children && item.children.length > 0) {
				levelGenRef.current += 1;
				gestureConsumedRef.current = false;
				setFolderStack((prev) => [...prev, { label: item.label, items: item.children! }]);
				setTypeAhead("");
				setActiveIndex(null);
				return;
			}

			closingRef.current = true;
			gestureConsumedRef.current = true;

			const idx =
				sliceIdx !== undefined
					? sliceIdx
					: stateRef.current.currentLevelItems.findIndex((i) => i.id === item.id);

			const reducedMotion =
				typeof window !== "undefined" &&
				window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
			const echoDuration = reducedMotion || idx === -1 ? 0 : LAUNCH_ECHO_MS;

			if (echoDuration > 0) {
				launchEchoSeqRef.current += 1;
				setLaunchEcho({ index: idx, key: launchEchoSeqRef.current });
			}

			if (item.type === "system" && item.target === "volume_mixer" && onLaunchVolumeMixer) {
				invoke("close_radial_menu").catch(() => {});
				onLaunchVolumeMixer();
				return;
			}

			// Launch immediately at 0ms while the Launch Echo wave plays over the desktop
			invoke("launch_radial_item", {
				itemType: item.type,
				target: item.target,
				echoMs: echoDuration
			}).catch(console.error);

			if (echoDuration > 0) {
				launchEchoTimerRef.current = window.setTimeout(() => {
					launchEchoTimerRef.current = null;
					invoke("close_radial_menu").catch(() => {});
					onClose();
				}, echoDuration);
			} else {
				onClose();
			}
		},
		[disarmDwell, onClose, onLaunchVolumeMixer]
	);

	const handleCenterActivate = useCallback(() => {
		if (Date.now() < quarantineUntilRef.current) return;
		if (launchEchoTimerRef.current !== null || closingRef.current) return;
		disarmDwell();
		if (stateRef.current.folderStack.length > 0) {
			levelGenRef.current += 1;
			gestureConsumedRef.current = false;
			setFolderStack((prev) => prev.slice(0, -1));
			setTypeAhead("");
			setActiveIndex(null);
			setIsCenterActive(false);
			return;
		}
		dismissWithAnimation();
	}, [disarmDwell, dismissWithAnimation]);

	// Dwell engine
	const fireDwell = useCallback(() => {
		dwellTimerRef.current = null;
		const target = dwellTargetRef.current;
		if (!target) return;
		if (stateRef.current.instantActivate !== "dwell") return void cancelDwell();
		if (closingRef.current) return void cancelDwell();
		if (paintReadyAtRef.current === null) return void cancelDwell();
		if (target.gen !== levelGenRef.current) return void cancelDwell();

		const aim = resolveAimAtPoint(lastPointerRef.current);
		if (aim.isCenter || aim.index === null || aim.index !== target.index) return void cancelDwell();
		const item = stateRef.current.currentLevelItems[aim.index];
		if (!item || item.id !== target.itemId) return void cancelDwell();
		if (gestureConsumedRef.current || Date.now() < quarantineUntilRef.current) return void cancelDwell();

		cancelDwell();
		dwellArmedRef.current = false;
		dwellBaselineRef.current = null;
		executeItem(item, aim.index);
		quarantineUntilRef.current = Date.now() + INSTANT_QUARANTINE_MS;
	}, [cancelDwell, resolveAimAtPoint, executeItem]);

	const startDwell = useCallback(() => {
		dwellSettleTimerRef.current = null;
		const pending = dwellPendingRef.current;
		if (!pending) return;
		if (stateRef.current.instantActivate !== "dwell" || closingRef.current) return void cancelDwell();
		if (paintReadyAtRef.current === null || pending.gen !== levelGenRef.current)
			return void cancelDwell();

		const aim = resolveAimAtPoint(lastPointerRef.current);
		if (aim.isCenter || aim.index === null || aim.index !== pending.index) return void cancelDwell();
		const item = stateRef.current.currentLevelItems[aim.index];
		if (!item || item.id !== pending.itemId) return void cancelDwell();

		if (lastPointerRef.current) {
			dwellAnchorRef.current = { x: lastPointerRef.current.x, y: lastPointerRef.current.y };
		}
		dwellPendingRef.current = null;
		dwellTargetRef.current = pending;
		dwellSeqRef.current += 1;
		if (stateRef.current.dwellRunMs >= DWELL_ARC_MIN_MS) {
			setDwellTick({ index: pending.index, key: dwellSeqRef.current });
		}
		dwellTimerRef.current = window.setTimeout(fireDwell, stateRef.current.dwellRunMs);
	}, [cancelDwell, fireDwell, resolveAimAtPoint]);

	const armAndTrackDwell = useCallback(
		(point: { x: number; y: number }, aim: { isCenter: boolean; index: number | null }) => {
			if (stateRef.current.instantActivate !== "dwell" || closingRef.current)
				return void cancelDwell();
			if (paintReadyAtRef.current === null) return void cancelDwell();

			if (dwellBaselineRef.current === null) {
				dwellBaselineRef.current = { x: point.x, y: point.y };
				return;
			}

			if (!dwellArmedRef.current) {
				if (Date.now() - paintReadyAtRef.current < INSTANT_ARM_DELAY_MS) return;
				const baseline = dwellBaselineRef.current;
				if (Math.hypot(point.x - baseline.x, point.y - baseline.y) < INSTANT_ARM_DISPLACEMENT_PX) {
					return;
				}
				dwellArmedRef.current = true;
			}

			if (aim.isCenter || aim.index === null) return void cancelDwell();
			const level = stateRef.current.currentLevelItems;
			if (level.length === 1 && stateRef.current.selectionMode !== "cursor") {
				return void cancelDwell();
			}
			const item = level[aim.index];
			if (!item) return void cancelDwell();

			const next = { gen: levelGenRef.current, index: aim.index, itemId: item.id };
			const running = dwellTargetRef.current ?? dwellPendingRef.current;
			const anchor = dwellAnchorRef.current;
			const sameTarget =
				!!running &&
				running.gen === next.gen &&
				running.index === next.index &&
				running.itemId === next.itemId;
			const holdRadius = dwellTargetRef.current !== null ? DWELL_HOLD_PX : DWELL_SETTLE_PX;
			const stillSettled =
				anchor !== null && Math.hypot(point.x - anchor.x, point.y - anchor.y) <= holdRadius;

			if (sameTarget && stillSettled) return;

			cancelDwell();
			dwellAnchorRef.current = { x: point.x, y: point.y };
			dwellPendingRef.current = next;
			dwellSettleTimerRef.current = window.setTimeout(startDwell, stateRef.current.dwellSettleMs);
		},
		[cancelDwell, startDwell]
	);

	// Hub Drag-to-Carry
	const hubDragRef = useRef<{
		offset: { x: number; y: number };
		start: { x: number; y: number };
		moved: boolean;
	} | null>(null);
	const releaseHubDragRef = useRef<() => void>(() => {});

	const beginHubDrag = useCallback(
		(event: React.MouseEvent) => {
			if (event.button !== 0 || hubDragRef.current) return;
			const { centerPos: pos } = stateRef.current;
			hubDragRef.current = {
				offset: { x: event.clientX - pos.x, y: event.clientY - pos.y },
				start: { x: event.clientX, y: event.clientY },
				moved: false
			};

			const onMove = (e: MouseEvent) => {
				const drag = hubDragRef.current;
				if (!drag) return;
				if (!drag.moved) {
					const dx = e.clientX - drag.start.x;
					const dy = e.clientY - drag.start.y;
					if (dx * dx + dy * dy < HUB_DRAG_SLOP_PX * HUB_DRAG_SLOP_PX) return;
					drag.moved = true;
					disarmDwell();
				}
				e.stopPropagation();
				const { viewportSize: vp, actualMenuRadius: r, actualIconSize: sz } = stateRef.current;
				setCenterPos(
					clampWheelCenter(
						{ x: e.clientX - drag.offset.x, y: e.clientY - drag.offset.y },
						vp,
						r + sz / 2
					)
				);
			};

			const onUp = (e: MouseEvent) => {
				const drag = hubDragRef.current;
				if (!drag || e.button !== 0) return;
				hubDragRef.current = null;
				releaseHubDragRef.current();
				if (!drag.moved) return;
				e.stopPropagation();
				const swallow = (ev: MouseEvent) => {
					ev.preventDefault();
					ev.stopPropagation();
					window.removeEventListener("click", swallow, true);
				};
				window.addEventListener("click", swallow, true);
				window.setTimeout(() => window.removeEventListener("click", swallow, true), 250);

				const pt = { x: e.clientX, y: e.clientY };
				lastPointerRef.current = pt;
				setIsCenterActive(true);
				setActiveIndex(null);
			};

			window.addEventListener("mousemove", onMove, true);
			window.addEventListener("mouseup", onUp, true);
			releaseHubDragRef.current = () => {
				window.removeEventListener("mousemove", onMove, true);
				window.removeEventListener("mouseup", onUp, true);
			};
		},
		[disarmDwell]
	);

	useEffect(
		() => () => {
			hubDragRef.current = null;
			releaseHubDragRef.current();
			cancelDwell();
			if (launchEchoTimerRef.current !== null) window.clearTimeout(launchEchoTimerRef.current);
		},
		[cancelDwell]
	);

	// Switch workspace helper
	const switchWorkspace = useCallback(
		(nextWsId: string) => {
			if (nextWsId === currentWsId) return;
			levelGenRef.current += 1;
			disarmDwell();
			gestureConsumedRef.current = false;
			setCurrentWsId(nextWsId);
			setFolderStack([]);
			setTypeAhead("");
			setActiveIndex(null);
			localStorage.setItem("zenith-mouse-active-workspace", nextWsId);
			invoke("save_setting", {
				key: "zenith-mouse-active-workspace",
				value: nextWsId
			}).catch(() => {});
		},
		[currentWsId, disarmDwell]
	);

	// Pointer & Tauri live hook events (`radial-move`, `radial-release`, `radial-cancel`)
	useEffect(() => {
		let rafId: number | null = null;

		const updateAimFromPoint = (pt: { x: number; y: number }) => {
			if (closingRef.current || hubDragRef.current?.moved) return;
			lastPointerRef.current = pt;
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				const aimPt = lastPointerRef.current;
				if (!aimPt || closingRef.current) return;
				const aim = resolveAimAtPoint(aimPt);
				if (aim.isCenter) {
					cancelDwell();
					if (stateRef.current.activeIndex !== null) setActiveIndex(null);
					if (!stateRef.current.isCenterActive) setIsCenterActive(true);
					return;
				}
				if (stateRef.current.isCenterActive) setIsCenterActive(false);
				if (stateRef.current.activeIndex !== aim.index) setActiveIndex(aim.index);
				armAndTrackDwell(aimPt, aim);
			});
		};

		const onMouseMove = (e: MouseEvent) => {
			updateAimFromPoint({ x: e.clientX, y: e.clientY });
		};

		const onMouseUp = (e: MouseEvent) => {
			if (e.button === 1) return;
			if (e.button === 2) {
				e.preventDefault();
				dismissWithAnimation();
				return;
			}
			if (e.button !== 0) return;
			if (Date.now() < quarantineUntilRef.current) return;
			if (gestureConsumedRef.current || closingRef.current) return;

			// Ignore clicks inside workspace switcher tabs
			if ((e.target as HTMLElement | null)?.closest?.(".zn-ws-tabs")) return;

			const pt = { x: e.clientX, y: e.clientY };
			const aim = resolveAimAtPoint(pt);
			if (aim.isCenter) {
				handleCenterActivate();
				return;
			}
			if (aim.index !== null && stateRef.current.currentLevelItems[aim.index]) {
				executeItem(stateRef.current.currentLevelItems[aim.index], aim.index);
			} else if (triggerMode === "click") {
				dismissWithAnimation();
			}
		};

		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault();
			dismissWithAnimation();
		};

		const onWheel = (e: WheelEvent) => {
			if (workspaces.length <= 1 || closingRef.current) return;
			e.preventDefault();
			const idx = workspaces.findIndex((w) => w.id === currentWsId);
			const nextIdx =
				e.deltaY > 0
					? (idx + 1) % workspaces.length
					: (idx - 1 + workspaces.length) % workspaces.length;
			switchWorkspace(workspaces[nextIdx].id);
		};

		window.addEventListener("mousemove", onMouseMove, { passive: true });
		window.addEventListener("mouseup", onMouseUp);
		window.addEventListener("contextmenu", onContextMenu);
		window.addEventListener("wheel", onWheel, { passive: false });

		const unlistenMove = listen<{ x: number; y: number }>("radial-move", (ev) => {
			updateAimFromPoint({ x: ev.payload.x, y: ev.payload.y });
		});

		const unlistenRelease = listen<{ x?: number; y?: number }>("radial-release", (ev) => {
			if (triggerMode !== "hold" || closingRef.current || gestureConsumedRef.current) return;
			const releasePt =
				typeof ev.payload?.x === "number" && typeof ev.payload?.y === "number"
					? { x: ev.payload.x, y: ev.payload.y }
					: lastPointerRef.current;
			const aim = resolveAimAtPoint(releasePt);
			if (aim.isCenter) {
				handleCenterActivate();
				return;
			}
			if (aim.index !== null && stateRef.current.currentLevelItems[aim.index]) {
				executeItem(stateRef.current.currentLevelItems[aim.index], aim.index);
			} else {
				dismissWithAnimation();
			}
		});

		const unlistenCancel = listen("radial-cancel", () => {
			dismissWithAnimation();
		});

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			window.removeEventListener("contextmenu", onContextMenu);
			window.removeEventListener("wheel", onWheel);
			unlistenMove.then((fn) => fn());
			unlistenRelease.then((fn) => fn());
			unlistenCancel.then((fn) => fn());
		};
	}, [
		triggerMode,
		workspaces,
		currentWsId,
		resolveAimAtPoint,
		armAndTrackDwell,
		cancelDwell,
		handleCenterActivate,
		executeItem,
		dismissWithAnimation,
		switchWorkspace
	]);

	// Keyboard navigation, 1-9 quick launch, and type-ahead filter
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				if (typeAheadRef.current) {
					setTypeAhead("");
					return;
				}
				dismissWithAnimation();
				return;
			}

			if (launchEchoTimerRef.current !== null || closingRef.current) return;

			if (e.key === "Backspace") {
				if (typeAheadRef.current) {
					e.preventDefault();
					setTypeAhead((prev) => prev.slice(0, -1));
					return;
				}
				if (stateRef.current.folderStack.length > 0) {
					e.preventDefault();
					handleCenterActivate();
					return;
				}
				return;
			}

			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				const items = stateRef.current.currentLevelItems;
				const idx = stateRef.current.activeIndex;
				if (idx !== null && items[idx]) {
					executeItem(items[idx], idx);
				}
				return;
			}

			if (e.key === "Tab") {
				e.preventDefault();
				const count = stateRef.current.currentLevelItems.length;
				if (count === 0) return;
				if (e.shiftKey) {
					setActiveIndex((prev) => (prev === null ? count - 1 : (prev - 1 + count) % count));
				} else {
					setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % count));
				}
				return;
			}

			if (
				numberLaunch &&
				!typeAheadRef.current &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.metaKey &&
				e.key >= "1" &&
				e.key <= "9"
			) {
				const idx = parseInt(e.key, 10) - 1;
				const target = stateRef.current.currentLevelItems[idx];
				if (target) {
					e.preventDefault();
					setActiveIndex(idx);
					executeItem(target, idx);
					return;
				}
			}

			const isTypedChar =
				e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && e.key !== " ";
			if (isTypedChar) {
				e.preventDefault();
				setTypeAhead((curr) => (curr.length >= 24 ? curr : curr + e.key));
			}
		};

		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [numberLaunch, dismissWithAnimation, handleCenterActivate, executeItem]);

	const backdropRadius = Math.ceil(
		actualMenuRadius + actualIconSize * 0.75 + Math.max(18, cfg.appSpacing)
	);
	const sectorOuterRadius = Math.max(
		Math.round(actualMenuRadius + actualIconSize * 0.6),
		Math.floor(
			Math.min(
				centerPos.x,
				centerPos.y,
				viewportSize.width - centerPos.x,
				viewportSize.height - centerPos.y
			)
		)
	);

	const overlayDim = useMemo(
		() => radialScrimGradient(centerPos, cfg.backdropOpacity, backdropRadius),
		[centerPos, cfg.backdropOpacity, backdropRadius]
	);

	const echoActive = launchEcho !== null;
	const isRoot = folderStack.length === 0;
	const areaMode = selectionMode !== "cursor" && areaWedges;
	const numberBadgesOn = numberLaunch && numberLabels;

	return (
		<div
			className={`zn-radial-root${isExiting ? " zn-radial--closing" : ""}`}
			style={{
				["--zn-hover-color" as string]: hoverColor,
				["--zn-hover-fg" as string]: hoverForeground
			}}
		>
			{/* Smoothstep Radial Scrim (Zero DWM Blur Lag) */}
			<div
				className={`zn-radial-scrim${echoActive ? " zn-launch-scrim" : ""}`}
				style={{
					pointerEvents: !isExiting && !echoActive ? "auto" : "none",
					background: overlayDim,
					["--zn-op" as string]: !isExiting && bloom ? 1 : 0,
					["--zn-dur-op" as string]: !isExiting ? "180ms" : "120ms",
					...(echoActive ? { ["--zn-echo-ms" as string]: `${LAUNCH_ECHO_MS}ms` } : null)
				}}
			/>

			{/* Type-Ahead Filter Readout */}
			{!echoActive && typeAhead && (
				<div className="zn-radial-filter" role="status" aria-live="polite">
					<span className="zn-radial-filter-query">{typeAhead}</span>
					<span className="zn-radial-filter-count">
						{currentLevelItems.length === 0
							? "No matches"
							: `${currentLevelItems.length} / ${rawLevelItems.length}`}
					</span>
				</div>
			)}

			{/* Corner Quick Settings Gear */}
			{!echoActive && (
				<button
					type="button"
					className="zn-radial-pill"
					onClick={(e) => {
						e.stopPropagation();
						invoke("open_settings_window").catch(() => {});
						dismissWithAnimation();
					}}
					title="Open Mouse Settings"
					style={{
						position: "fixed",
						bottom: "24px",
						right: "24px",
						zIndex: 35,
						width: "36px",
						height: "36px",
						borderRadius: "50%",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(8, 9, 12, 0.86)",
						border: "1px solid rgba(255, 255, 255, 0.16)",
						boxShadow: "0 4px 20px rgba(0, 0, 0, 0.45)",
						color: "rgba(255, 255, 255, 0.7)",
						cursor: "pointer",
						pointerEvents: "auto",
						["--zn-op" as string]: !isExiting && bloom ? 1 : 0
					}}
				>
					<SettingsIcon size={16} strokeWidth={1.75} />
				</button>
			)}

			{/* Wheel Origin Container */}
			<div
				style={{
					position: "fixed",
					left: Math.round(centerPos.x),
					top: Math.round(centerPos.y),
					width: 0,
					height: 0,
					zIndex: 10,
					pointerEvents: "none"
				}}
			>
				{/* Area Wedges & Seams */}
				{areaMode && currentLevelItems.length > 0 && (
					<RadialSectors
						count={currentLevelItems.length}
						activeIndex={launchEcho ? launchEcho.index : activeIndex}
						radiusInner={Math.max(deadZoneRadius, hubDiameter / 2 + 8)}
						radiusOuter={sectorOuterRadius}
						falloffRadius={backdropRadius}
						hoverColor={hoverColor}
						visible={!isExiting && bloom}
						dimmed={echoActive}
					/>
				)}

				{/* Invisible Square Hub Hit Target (prevents corner click bleed) */}
				<div
					data-zn-radial-center="true"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						zIndex: 30,
						width: `${hubHitSize}px`,
						height: `${hubHitSize}px`,
						transform: "translate(-50%, -50%)",
						pointerEvents: "auto",
						cursor: "pointer"
					}}
					onMouseDown={(e) => {
						e.stopPropagation();
						beginHubDrag(e);
					}}
					onMouseUp={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.stopPropagation();
						handleCenterActivate();
					}}
					aria-hidden
				/>

				{/* Central Hub Disc */}
				<div
					className="zn-radial-hub"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: `${hubDiameter}px`,
						height: `${hubDiameter}px`,
						borderRadius: "50%",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 20,
						pointerEvents: "auto",
						cursor: "pointer",
						backgroundColor: isCenterActive ? hoverColor : "rgba(6,7,9,0.90)",
						border: "none",
						color: isCenterActive ? hoverForeground : "rgba(255,255,255,0.75)",
						boxShadow: isCenterActive
							? `0 0 22px ${hoverColor}3d, 0 8px 22px rgba(0,0,0,0.55)`
							: "0 1px 3px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.5)",
						["--zn-tf" as string]: `translate(-50%, -50%) scale(${
							bloom && !isExiting ? (isCenterActive ? 1.06 : 1) : 0.82
						})`,
						["--zn-op" as string]: echoActive ? 0 : bloom && !isExiting ? 1 : 0,
						["--zn-dur" as string]: isExiting ? "120ms" : "160ms",
						...(echoActive ? { ["--zn-dur-op" as string]: "140ms" } : null)
					}}
					onMouseDown={(e) => e.stopPropagation()}
					onMouseUp={(e) => e.stopPropagation()}
				>
					{/* Crisp Vector Hub Ring */}
					<svg
						style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
						width={hubDiameter}
						height={hubDiameter}
						viewBox={`0 0 ${hubDiameter} ${hubDiameter}`}
						shapeRendering="geometricPrecision"
						aria-hidden
					>
						<circle
							cx={hubDiameter / 2}
							cy={hubDiameter / 2}
							r={(hubDiameter - 1.5) / 2}
							fill="none"
							stroke={isCenterActive ? hoverColor : "rgba(255,255,255,0.30)"}
							strokeWidth={1.5}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>

					{isRoot ? (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								opacity: isCenterActive ? 1 : 0.78,
								transition: "opacity 150ms ease"
							}}
						>
							<RovylLogo
								size={Math.round(actualIconSize * 0.64)}
								color={isCenterActive ? hoverForeground : "#F4F2ED"}
							/>
						</div>
					) : (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								gap: "3px"
							}}
						>
							<CornerUpLeft size={Math.round(actualIconSize * 0.45)} strokeWidth={1.6} />
							{!isCenterActive && (
								<div style={{ display: "flex", gap: "3px", marginTop: "2px" }}>
									{folderStack.map((_, i) => (
										<div
											key={i}
											style={{
												width: 4,
												height: 4,
												borderRadius: "50%",
												background: "rgba(255,255,255,0.45)"
											}}
										/>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Bottom Context / Workspace Switcher Pill */}
				{cfg.showWorkspacePill !== false && (
					<div
						className="zn-radial-pill"
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							zIndex: 30,
							["--zn-tf" as string]: `translate(-50%, 0) translate3d(0, ${Math.round(
								actualMenuRadius + actualIconSize * 0.75 + 34
							)}px, 0)`,
							["--zn-op" as string]: !isExiting && bloom && !echoActive ? 1 : 0,
							...(echoActive ? { ["--zn-dur-op" as string]: "130ms" } : null)
						}}
					>
						{isRoot && workspaces.length > 1 ? (
							<div
								className="zn-ws-tabs"
								onMouseDown={(e) => e.stopPropagation()}
								onMouseUp={(e) => e.stopPropagation()}
							>
								{workspaces.map((ws) => {
									const WsIcon = getRadialIcon(ws.icon);
									const isWsActive = ws.id === currentWorkspace.id;
									const isPeeking = peekWsId === ws.id && !isWsActive;
									return (
										<button
											key={ws.id}
											type="button"
											className={`zn-ws-tab${isWsActive ? " is-active" : ""}`}
											onClick={(e) => {
												e.stopPropagation();
												switchWorkspace(ws.id);
											}}
											onMouseEnter={() => {
												if (!workspacePeek || isWsActive) return;
												if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current);
												peekTimerRef.current = window.setTimeout(() => {
													setPeekWsId(ws.id);
												}, workspacePeekDelayMs);
											}}
											onMouseLeave={() => {
												if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current);
												setPeekWsId(null);
											}}
										>
											{isPeeking && ws.items.length > 0 && (
												<div className="zn-ws-peek">
													{ws.items.slice(0, 6).map((peekItem) => (
														<div key={peekItem.id} className="zn-ws-peek-item">
															<SmartIcon item={peekItem} size={22} />
														</div>
													))}
												</div>
											)}
											<WsIcon size={12} strokeWidth={2} />
											<span>{ws.name}</span>
										</button>
									);
								})}
							</div>
						) : (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									padding: "6px 12px",
									borderRadius: "999px",
									whiteSpace: "nowrap",
									background: "rgba(4,5,7,0.92)",
									border: "1px solid rgba(255,255,255,0.14)",
									boxShadow: "0 0 0 1px rgba(0,0,0,0.45)"
								}}
							>
								{(isRoot
									? [currentWorkspace?.name || "Rovyl"]
									: folderStack.map((level) => level.label)
								).map((label, i) => (
									<React.Fragment key={`${label}-${i}`}>
										{i > 0 && (
											<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>/</span>
										)}
										<span
											style={{
												fontSize: 11,
												fontWeight: 500,
												color: "rgba(255,255,255,0.65)"
											}}
										>
											{label}
										</span>
									</React.Fragment>
								))}
								<span
									style={{
										fontSize: 10,
										color: "rgba(255,255,255,0.45)",
										padding: "3px 6px",
										borderRadius: 5,
										background: "rgba(255,255,255,0.09)"
									}}
								>
									{isRoot ? "Esc" : "Back"}
								</span>
							</div>
						)}
					</div>
				)}

				{/* Radial Slices */}
				{currentLevelItems.map((item, index) => {
					const isActive = launchEcho ? launchEcho.index === index : index === activeIndex;
					let angularDistance: number | null = null;
					if (activeIndex !== null) {
						const raw = Math.abs(index - activeIndex);
						angularDistance = Math.min(raw, currentLevelItems.length - raw);
					}
					const numberHint = numberBadgesOn && index < 9 ? String(index + 1) : undefined;

					return (
						<RadialSlice
							key={`${item.id}-${folderStack.length}-${index}`}
							item={item}
							index={index}
							isActive={isActive}
							angularDistance={angularDistance}
							actualMenuRadius={actualMenuRadius}
							actualIconSize={actualIconSize}
							totalApps={currentLevelItems.length}
							backdropOpacity={cfg.backdropOpacity}
							hoverColor={hoverColor}
							showLabels={cfg.showLabels}
							alwaysShowAppLabels={cfg.alwaysShowAppLabels}
							bloom={!isExiting && bloom}
							numberHint={numberHint}
							dwellMs={dwellTick && dwellTick.index === index ? dwellRunMs : undefined}
							dwellKey={dwellTick && dwellTick.index === index ? dwellTick.key : undefined}
							echo={launchEcho ? (launchEcho.index === index ? "fired" : "faded") : undefined}
							echoMs={launchEcho ? LAUNCH_ECHO_MS : undefined}
							onClick={(clickedItem) => executeItem(clickedItem, index)}
						/>
					);
				})}
			</div>
		</div>
	);
}

export { RadialMenu };
