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
	sectorGradientStops,
} from "../radial/radialSectors";
import { radialScrimGradient } from "../radial/radialScrim";
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
	const RADIUS_INNER = 46;
	const RADIUS_OUTER = 240;
	const ORBIT_RADIUS = 156;

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
			// Center directly at the cursor, keeping a minimal margin so it stays visible
			const minMargin = 64;
			cx = Math.max(minMargin, Math.min(w - minMargin, cx));
			cy = Math.max(minMargin, Math.min(h - minMargin, cy));
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

	// Directional angle tracking & cursor hit-testing
	useEffect(() => {
		if (!isOpen || numItems === 0) return;

		const handleMouseMove = (e: MouseEvent) => {
			const dx = e.clientX - wheelCenter.x;
			const dy = e.clientY - wheelCenter.y;
			const dist = Math.hypot(dx, dy);

			// Center deadzone: cancel selection if cursor is inside the central hub
			if (dist < RADIUS_INNER) {
				selectSlice(null);
				return;
			}

			// In direction/area mode, any movement outwards aims at that wedge
			const sectorIdx = sectorIndexForDelta(dx, dy, numItems);
			if (sectorIdx === null) {
				selectSlice(null);
				return;
			}

			if (selectionMode === "cursor") {
				// Proximity check in cursor mode: allow generous 74px radius
				const sliceAngleDeg = 360 / numItems;
				const targetAngleRad = (sectorIdx * sliceAngleDeg - 90) * (Math.PI / 180);
				const itemX = wheelCenter.x + ORBIT_RADIUS * Math.cos(targetAngleRad);
				const itemY = wheelCenter.y + ORBIT_RADIUS * Math.sin(targetAngleRad);
				const distToItem = Math.hypot(e.clientX - itemX, e.clientY - itemY);
				if (distToItem <= 74) {
					selectSlice(sectorIdx);
				} else {
					selectSlice(null);
				}
			} else {
				// Instant area directional lock
				selectSlice(sectorIdx);
			}
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, [isOpen, selectionMode, numItems, wheelCenter.x, wheelCenter.y, selectSlice]);

	// Hands-free Dwell timer with requestAnimationFrame for smooth 60-144Hz updates
	useEffect(() => {
		if (!isOpen || instantActivate !== "dwell" || activeSliceIndex === null) {
			setDwellProgress(0);
			return;
		}

		let frameId: number;
		const startTime = performance.now();

		const step = (now: number) => {
			const elapsed = now - startTime;
			const progress = Math.min(1, elapsed / instantDwellMs);
			setDwellProgress(progress);

			if (progress >= 1) {
				const targetItem = items[activeSliceIndex];
				if (targetItem) {
					executeItem(targetItem);
				}
			} else {
				frameId = requestAnimationFrame(step);
			}
		};

		frameId = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frameId);
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

	// Hold-mode release support: listen to "radial-release" event from Rust hook
	useEffect(() => {
		if (!isOpen) return;

		let active = true;
		const unlistenPromise = listen("radial-release", () => {
			if (!active) return;
			const currentIdx = activeSliceRef.current;
			if (currentIdx !== null && items[currentIdx]) {
				// An item was aimed: execute!
				executeItem(items[currentIdx]);
			}
			// If nothing was aimed: DO NOT close! Keep the wheel open so the user can click to choose or press Escape!
		});

		return () => {
			active = false;
			unlistenPromise.then((fn) => fn());
		};
	}, [isOpen, items, executeItem]);

	const backdropBg = useMemo(() => {
		return radialScrimGradient(wheelCenter, 0.82, RADIUS_OUTER);
	}, [wheelCenter.x, wheelCenter.y]);

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<motion.div
				className="radial-menu-backdrop"
				style={{ background: backdropBg }}
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
					style={{
						left: wheelCenter.x,
						top: wheelCenter.y,
						width: RADIUS_OUTER * 2,
						height: RADIUS_OUTER * 2,
					}}
					initial={{ scale: 0.82, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.85, opacity: 0 }}
					transition={{ type: "spring", stiffness: 480, damping: 28 }}
				>
					{/* Ambient neon glow behind wheel */}
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
									const stops = sectorGradientStops(0.18, 0.88, 0.55, 0.22);
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
											{stops.map((s, idx) => (
												<stop
													key={idx}
													offset={`${(s.offset * 100).toFixed(1)}%`}
													stopColor="var(--bloom-accent, #007aff)"
													stopOpacity={s.opacity}
												/>
											))}
										</linearGradient>
									);
								})}
							</defs>

							{/* Orbital guide ring */}
							<circle
								cx={RADIUS_OUTER}
								cy={RADIUS_OUTER}
								r={ORBIT_RADIUS}
								fill="none"
								stroke="rgba(255, 255, 255, 0.08)"
								strokeWidth="1.5"
								strokeDasharray="4 6"
							/>

							{/* Active Sector Wedge Highlight Beam */}
							{activeSliceIndex !== null && items[activeSliceIndex] && (
								<path
									d={annularSectorPath(
										RADIUS_INNER,
										RADIUS_OUTER,
										sectorBoundsDeg(activeSliceIndex, numItems).startDeg,
										sectorBoundsDeg(activeSliceIndex, numItems).endDeg
									)}
									fill={`url(#sector-grad-${activeSliceIndex})`}
									style={{
										filter: "drop-shadow(0 0 20px rgba(0, 122, 255, 0.45))",
										transition: "all 0.12s ease"
									}}
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
									/>
								);
							})}
						</svg>
					)}

					{/* Center Hub (Cancel / Workspace info) */}
					<div
						className="radial-center-hub"
						onClick={onClose}
						title="Click to Cancel (Esc)"
					>
						<div className="radial-hub-icon-wrap">
							{(() => {
								const HubIcon = getRadialIcon(currentWorkspace.icon);
								return <HubIcon size={20} strokeWidth={2} />;
							})()}
						</div>
						<div className="radial-hub-title">{currentWorkspace.name}</div>
						<div className="radial-hub-cancel-hint">Cancel</div>
					</div>

					{/* Radial Slices (Squircle icon tiles) */}
					{items.map((item: RadialItem, index: number) => {
						const sliceAngle = (2 * Math.PI) / numItems;
						const angle = index * sliceAngle - Math.PI / 2;
						const posX = RADIUS_OUTER + ORBIT_RADIUS * Math.cos(angle);
						const posY = RADIUS_OUTER + ORBIT_RADIUS * Math.sin(angle);

						// Floating label placement ray
						const labelOffset = 48;
						const labelX = RADIUS_OUTER + (ORBIT_RADIUS + labelOffset) * Math.cos(angle);
						const labelY = RADIUS_OUTER + (ORBIT_RADIUS + labelOffset) * Math.sin(angle);

						const isActive = activeSliceIndex === index;
						const ItemIcon = getRadialIcon(item.icon);

						return (
							<div key={item.id || index}>
								<div
									className={`radial-slice-item ${isActive ? "active" : ""}`}
									style={{ left: posX, top: posY }}
									onClick={(e) => {
										e.stopPropagation();
										executeItem(item);
									}}
								>
									{/* Key Number Chip Badge */}
									{numberLabels && (
										<div className="radial-number-badge">{index + 1}</div>
									)}

									{/* Hands-free Dwell Indicator */}
									{isActive && instantActivate === "dwell" && dwellProgress > 0 && (
										<div className="radial-dwell-ring">
											<svg viewBox="0 0 58 58">
												<rect
													x="2"
													y="2"
													width="54"
													height="54"
													rx="17"
													style={{
														strokeDashoffset: 216 - 216 * dwellProgress
													}}
												/>
											</svg>
										</div>
									)}

									<div className="radial-slice-icon-wrap">
										<ItemIcon size={25} strokeWidth={1.8} />
									</div>
								</div>

								{/* Floating Label Pill (Visible when active or on hover) */}
								{isActive && (
									<motion.div
										className="radial-floating-label"
										style={{ left: labelX, top: labelY }}
										initial={{ opacity: 0, scale: 0.9 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.9 }}
										transition={{ duration: 0.12 }}
									>
										<span>{item.label}</span>
									</motion.div>
								)}
							</div>
						);
					})}

					{/* Workspaces Navigation Bar */}
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
										<WsIcon size={13} strokeWidth={1.8} />
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
