import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getRadialIcon } from "../radial/iconMap";
import { playRadialBloom, playRadialHover, setRadialSoundVolume } from "../radial/radialSound";
import { DEFAULT_WORKSPACES } from "../radial/types";
import type { RadialItem, RadialWorkspace } from "../radial/types";
import {
	sectorBoundsDeg,
	sectorIndexForDelta,
	annularSectorPath,
	polarPoint,
	sectorCentreDeg,
} from "../radial/radialSectors";
import { clampWheelCenter } from "../radial/radialDrag";
import "./RadialMenu.css";

interface RadialMenuProps {
	isOpen: boolean;
	position: { x: number; y: number };
	onClose: () => void;
	triggerMode?: "hold" | "click";
	placement?: "cursor" | "center";
	selectionMode?: "area" | "cursor";
	areaWedges?: boolean;
	instantActivate?: "off" | "dwell";
	instantDwellMs?: number;
	numberLaunch?: boolean;
	numberLabels?: boolean;
	soundEnabled?: boolean;
	soundVolume?: number;
	workspaces?: RadialWorkspace[];
}

export function RadialMenu({
	isOpen,
	position,
	onClose,
	triggerMode = "hold",
	placement = "cursor",
	selectionMode = "area",
	areaWedges = false,
	instantActivate = "off",
	instantDwellMs = 350,
	numberLaunch = true,
	numberLabels = true,
	soundEnabled = true,
	soundVolume = 70,
	workspaces
}: RadialMenuProps) {
	const effectiveWorkspaces = useMemo(() => {
		if (workspaces && workspaces.length > 0) return workspaces;
		try {
			const stored = localStorage.getItem("zenith-mouse-workspaces");
			return stored ? JSON.parse(stored) : DEFAULT_WORKSPACES;
		} catch {
			return DEFAULT_WORKSPACES;
		}
	}, [workspaces]);

	const [activeWorkspaceIndex, setActiveWorkspaceIndex] = useState(0);
	const [activeSliceIndex, setActiveSliceIndex] = useState<number | null>(null);
	const [dwellProgress, setDwellProgress] = useState(0);

	const containerRef = useRef<HTMLDivElement>(null);
	const activeSliceRef = useRef<number | null>(null);
	activeSliceRef.current = activeSliceIndex;

	const currentWorkspace =
		effectiveWorkspaces[activeWorkspaceIndex] ||
		effectiveWorkspaces[0] ||
		DEFAULT_WORKSPACES[0];
	const items = currentWorkspace.items || [];
	const numItems = items.length;

	// Orbit geometry constants
	const RADIUS_INNER = 54;
	const RADIUS_OUTER = 250;
	const ORBIT_RADIUS = 168;

	// Center coordinates of the wheel in window viewport
	const [wheelCenter, setWheelCenter] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

	useEffect(() => {
		if (!isOpen) return;

		const w = window.innerWidth || 1920;
		const h = window.innerHeight || 1080;
		let cx = position.x;
		let cy = position.y;

		if (placement === "center") {
			cx = w / 2;
			cy = h / 2;
		} else {
			const clamped = clampWheelCenter({ x: cx, y: cy }, { width: w, height: h }, RADIUS_OUTER);
			cx = clamped.x;
			cy = clamped.y;
		}

		setWheelCenter({ x: cx, y: cy });
		setActiveSliceIndex(null);
		setDwellProgress(0);

		if (soundEnabled) {
			setRadialSoundVolume(soundVolume);
			playRadialBloom(soundVolume);
		}
	}, [isOpen, position.x, position.y, placement, soundEnabled, soundVolume]);

	// Launch execution helper
	const executeItem = useCallback(
		async (item: RadialItem) => {
			try {
				await invoke("launch_radial_item", {
					itemType: item.type,
					target: item.target
				});
			} catch (e) {
				console.error("Radial menu launch error:", e);
			}
			onClose();
		},
		[onClose]
	);

	// Slice change audio cue
	const selectSlice = useCallback(
		(index: number | null) => {
			if (index !== activeSliceRef.current) {
				setActiveSliceIndex(index);
				setDwellProgress(0);
				if (index !== null && soundEnabled) {
					playRadialHover(soundVolume);
				}
			}
		},
		[soundEnabled, soundVolume]
	);

	// Directional angle tracking & cursor hit-testing (matching Rovyl math)
	useEffect(() => {
		if (!isOpen || numItems === 0) return;

		const handleMouseMove = (e: MouseEvent) => {
			const dx = e.clientX - wheelCenter.x;
			const dy = e.clientY - wheelCenter.y;
			const dist = Math.hypot(dx, dy);

			// Center deadzone
			if (dist < RADIUS_INNER) {
				selectSlice(null);
				return;
			}

			// Mathematical sector calculation matching Rovyl's sectorIndexForDelta
			const sectorIdx = sectorIndexForDelta(dx, dy, numItems);

			if (sectorIdx === null) {
				selectSlice(null);
				return;
			}

			if (selectionMode === "cursor") {
				// In cursor mode, check proximity to the candidate item's coordinate
				const sliceAngleDeg = 360 / numItems;
				const targetAngleRad = (sectorIdx * sliceAngleDeg - 90) * (Math.PI / 180);
				const itemX = wheelCenter.x + ORBIT_RADIUS * Math.cos(targetAngleRad);
				const itemY = wheelCenter.y + ORBIT_RADIUS * Math.sin(targetAngleRad);
				const distToItem = Math.hypot(e.clientX - itemX, e.clientY - itemY);
				if (distToItem <= 54) {
					selectSlice(sectorIdx);
				} else {
					selectSlice(null);
				}
			} else {
				// Area mode: instant sector lock
				selectSlice(sectorIdx);
			}
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, [isOpen, selectionMode, numItems, wheelCenter.x, wheelCenter.y, selectSlice]);

	// Hands-free Dwell timer
	useEffect(() => {
		if (!isOpen || instantActivate !== "dwell" || activeSliceIndex === null) {
			setDwellProgress(0);
			return;
		}

		const startTime = performance.now();
		const interval = setInterval(() => {
			const elapsed = performance.now() - startTime;
			const progress = Math.min(1, elapsed / instantDwellMs);
			setDwellProgress(progress);

			if (progress >= 1) {
				clearInterval(interval);
				const targetItem = items[activeSliceIndex];
				if (targetItem) {
					executeItem(targetItem);
				}
			}
		}, 16);

		return () => clearInterval(interval);
	}, [isOpen, instantActivate, activeSliceIndex, instantDwellMs, items, executeItem]);

	// Keyboard listeners (1-9 quick launch, Escape to cancel)
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
				return;
			}

			if (numberLaunch) {
				const num = parseInt(e.key, 10);
				if (!isNaN(num) && num >= 1 && num <= numItems) {
					e.preventDefault();
					const item = items[num - 1];
					if (item) {
						executeItem(item);
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, numberLaunch, numItems, items, executeItem]);

	// Hold-mode release support: listen to "radial-release" event from Rust hook or mouseup
	useEffect(() => {
		if (!isOpen) return;

		let active = true;
		const unlistenPromise = listen("radial-release", () => {
			if (!active) return;
			const currentIdx = activeSliceRef.current;
			if (currentIdx !== null && items[currentIdx]) {
				executeItem(items[currentIdx]);
			} else {
				onClose();
			}
		});

		const handleMouseUp = () => {
			if (triggerMode !== "hold") return;
			const currentIdx = activeSliceRef.current;
			if (currentIdx !== null && items[currentIdx]) {
				executeItem(items[currentIdx]);
			} else {
				onClose();
			}
		};

		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			active = false;
			unlistenPromise.then((fn) => fn());
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isOpen, triggerMode, items, executeItem, onClose]);

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<motion.div
				className="radial-menu-backdrop"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.14 }}
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<motion.div
					ref={containerRef}
					className="radial-wheel-container"
					style={{ left: wheelCenter.x, top: wheelCenter.y }}
					initial={{ scale: 0.78, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.82, opacity: 0 }}
					transition={{ type: "spring", stiffness: 440, damping: 29 }}
				>
					{/* Ambient glow behind wheel */}
					<div className="radial-ambient-glow" />

					{/* SVG Sectors & Divider Seams Layer */}
					{numItems > 0 && (
						<svg
							className="radial-wedges-svg"
							viewBox={`0 0 ${RADIUS_OUTER * 2} ${RADIUS_OUTER * 2}`}
						>
							<defs>
								{items.map((_: RadialItem, i: number) => {
									const angle = sectorCentreDeg(i, numItems);
									const p1 = polarPoint(RADIUS_OUTER, RADIUS_INNER, angle);
									const p2 = polarPoint(RADIUS_OUTER, RADIUS_OUTER, angle);
									return (
										<linearGradient
											key={i}
											id={`sector-grad-${i}`}
											x1={p1.x}
											y1={p1.y}
											x2={p2.x}
											y2={p2.y}
											gradientUnits="userSpaceOnUse"
										>
											<stop offset="0%" stopColor="var(--bloom-accent, #007aff)" stopOpacity="0.45" />
											<stop offset="40%" stopColor="var(--bloom-accent, #007aff)" stopOpacity="0.25" />
											<stop offset="100%" stopColor="var(--bloom-accent, #007aff)" stopOpacity="0" />
										</linearGradient>
									);
								})}
							</defs>

							{/* Active Sector Wedge Highlight */}
							{activeSliceIndex !== null && items[activeSliceIndex] && (
								<path
									d={annularSectorPath(
										RADIUS_INNER,
										RADIUS_OUTER,
										sectorBoundsDeg(activeSliceIndex, numItems).startDeg,
										sectorBoundsDeg(activeSliceIndex, numItems).endDeg
									)}
									fill={`url(#sector-grad-${activeSliceIndex})`}
								/>
							)}

							{/* Wedge divider seam lines */}
							{areaWedges && numItems > 1 && items.map((_: RadialItem, i: number) => {
								const bounds = sectorBoundsDeg(i, numItems);
								const p1 = polarPoint(RADIUS_OUTER, RADIUS_INNER + 4, bounds.startDeg);
								const p2 = polarPoint(RADIUS_OUTER, RADIUS_OUTER - 20, bounds.startDeg);
								return (
									<line
										key={i}
										x1={p1.x}
										y1={p1.y}
										x2={p2.x}
										y2={p2.y}
										stroke="var(--bloom-border, rgba(255, 255, 255, 0.15))"
										strokeWidth="1"
										strokeDasharray="4 4"
									/>
								);
							})}
						</svg>
					)}

					{/* Center Hub */}
					<div
						className="radial-center-hub"
						onClick={onClose}
						title="Cancel / Close"
					>
						<div className="radial-hub-icon">
							{(() => {
								const HubIcon = getRadialIcon(currentWorkspace.icon);
								return <HubIcon size={22} strokeWidth={2} />;
							})()}
						</div>
						<div className="radial-hub-title">{currentWorkspace.name}</div>
						<div className="radial-hub-cancel-hint">Cancel</div>
					</div>

					{/* Radial Slices */}
					{items.map((item: RadialItem, index: number) => {
						const sliceAngle = (2 * Math.PI) / numItems;
						const angle = index * sliceAngle - Math.PI / 2;
						const posX = 260 + ORBIT_RADIUS * Math.cos(angle);
						const posY = 260 + ORBIT_RADIUS * Math.sin(angle);

						const isActive = activeSliceIndex === index;
						const ItemIcon = getRadialIcon(item.icon);

						return (
							<div
								key={item.id || index}
								className={`radial-slice-item ${isActive ? "active" : ""}`}
								style={{ left: posX, top: posY }}
								onClick={() => executeItem(item)}
							>
								{/* Number badge */}
								{numberLabels && (
									<div className="radial-number-badge">{index + 1}</div>
								)}

								{/* Dwell ring progress */}
								{isActive && instantActivate === "dwell" && dwellProgress > 0 && (
									<div className="radial-dwell-ring">
										<svg viewBox="0 0 92 74">
											<rect
												x="2"
												y="2"
												width="88"
												height="70"
												rx="16"
												style={{
													strokeDashoffset: 300 - 300 * dwellProgress
												}}
											/>
										</svg>
									</div>
								)}

								<div className="radial-slice-icon-wrap">
									<ItemIcon size={24} strokeWidth={1.8} />
								</div>
								<div className="radial-slice-label">{item.label}</div>
							</div>
						);
					})}

					{/* Workspaces navigation pill */}
					{effectiveWorkspaces.length > 1 && (
						<div className="radial-workspaces-bar">
							{effectiveWorkspaces.map((ws: RadialWorkspace, idx: number) => {
								const WsIcon = getRadialIcon(ws.icon);
								const isSelected = activeWorkspaceIndex === idx;
								return (
									<button
										key={ws.id || idx}
										className={`radial-workspace-pill ${isSelected ? "active" : ""}`}
										onClick={(e) => {
											e.stopPropagation();
											setActiveWorkspaceIndex(idx);
											selectSlice(null);
										}}
									>
										<WsIcon size={12} strokeWidth={1.8} />
										<span>{ws.name}</span>
									</button>
								);
							})}
						</div>
					)}
				</motion.div>
			</motion.div>
		</AnimatePresence>
	);
}
