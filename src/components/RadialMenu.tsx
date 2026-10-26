import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getRadialIcon } from "../radial/iconMap";
import { playRadialBloom, playRadialHover } from "../radial/sound";
import { DEFAULT_WORKSPACES } from "../radial/types";
import type { RadialItem, RadialWorkspace } from "../radial/types";
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
	numberLaunch = false,
	numberLabels = true,
	soundEnabled = true,
	soundVolume = 70,
	workspaces = DEFAULT_WORKSPACES
}: RadialMenuProps) {
	const [activeWorkspaceIndex, setActiveWorkspaceIndex] = useState(0);
	const [activeSliceIndex, setActiveSliceIndex] = useState<number | null>(null);
	const [dwellProgress, setDwellProgress] = useState(0);

	const containerRef = useRef<HTMLDivElement>(null);
	const activeSliceRef = useRef<number | null>(null);
	activeSliceRef.current = activeSliceIndex;

	const currentWorkspace = workspaces[activeWorkspaceIndex] || workspaces[0] || DEFAULT_WORKSPACES[0];
	const items = currentWorkspace.items || [];
	const numItems = items.length;

	// Center coordinates of the wheel in window viewport
	const [wheelCenter, setWheelCenter] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

	useEffect(() => {
		if (!isOpen) return;

		let cx = position.x;
		let cy = position.y;

		if (placement === "center") {
			cx = window.innerWidth / 2;
			cy = window.innerHeight / 2;
		} else {
			// Clamp to ensure the 520px wheel stays inside viewport
			const half = 260;
			cx = Math.max(half, Math.min(window.innerWidth - half, cx));
			cy = Math.max(half, Math.min(window.innerHeight - half, cy));
		}

		setWheelCenter({ x: cx, y: cy });
		setActiveSliceIndex(null);
		setDwellProgress(0);

		if (soundEnabled) {
			playRadialBloom(soundVolume);
		}
	}, [isOpen, position.x, position.y, placement, soundEnabled, soundVolume]);

	// Launch execution helper
	const executeItem = useCallback(
		async (item: RadialItem) => {
			try {
				if (item.type === "system") {
					switch (item.target) {
						case "task_manager":
							await invoke("open_system_action", { action: "TaskManager" });
							break;
						case "open_settings":
							await invoke("open_settings_window");
							break;
						case "wifi_settings":
							await invoke("open_wifi_settings");
							break;
						case "bluetooth_settings":
							await invoke("open_bluetooth_settings");
							break;
						case "sound_settings":
							await invoke("open_sound_settings");
							break;
						case "action_center":
							await invoke("open_notification_center");
							break;
						case "task_view":
							await invoke("open_system_tray");
							break;
						default:
							await invoke("open_app", { appName: item.target });
							break;
					}
				} else if (item.type === "command" || item.type === "app" || item.type === "file" || item.type === "url" || item.type === "folder") {
					await invoke("shelf_open", { path: item.target }).catch(async () => {
						await invoke("launch_new_instance", { appPath: item.target, appName: item.label });
					});
				}
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

	// Directional angle tracking (area selection mode)
	useEffect(() => {
		if (!isOpen) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (selectionMode !== "area" || numItems === 0) return;

			const dx = e.clientX - wheelCenter.x;
			const dy = e.clientY - wheelCenter.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			// Deadzone in the center (radius 48px)
			if (dist < 48) {
				selectSlice(null);
				return;
			}

			// Angle in radians [-PI, PI], convert to [0, 2*PI]
			// Start at top (-PI/2) and rotate clockwise
			let angle = Math.atan2(dy, dx) + Math.PI / 2;
			if (angle < 0) angle += 2 * Math.PI;

			const sliceAngle = (2 * Math.PI) / numItems;
			// Center each slice around its mid-angle
			const halfSlice = sliceAngle / 2;
			let idx = Math.floor((angle + halfSlice) / sliceAngle) % numItems;
			if (idx < 0) idx += numItems;

			selectSlice(idx);
		};

		window.addEventListener("mousemove", handleMouseMove);
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

	// Hold-mode release support: when mouse is released anywhere, confirm selection
	useEffect(() => {
		if (!isOpen || triggerMode !== "hold") return;

		const handleMouseUp = () => {
			const currentIdx = activeSliceRef.current;
			if (currentIdx !== null && items[currentIdx]) {
				executeItem(items[currentIdx]);
			} else {
				onClose();
			}
		};

		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, [isOpen, triggerMode, items, executeItem, onClose]);

	if (!isOpen) return null;

	const RADIUS = 170; // Orbit distance of slices from center

	return (
		<AnimatePresence>
			<motion.div
				className="radial-menu-backdrop"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.16 }}
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<motion.div
					ref={containerRef}
					className="radial-wheel-container"
					style={{ left: wheelCenter.x, top: wheelCenter.y }}
					initial={{ scale: 0.75, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.8, opacity: 0 }}
					transition={{ type: "spring", stiffness: 420, damping: 28 }}
				>
					{/* Ambient glow behind wheel */}
					<div className="radial-ambient-glow" />

					{/* Optional wedge divider lines */}
					{areaWedges && numItems > 1 && (
						<svg className="radial-wedges-svg" viewBox="0 0 520 520">
							{items.map((_, i) => {
								const sliceAngle = (2 * Math.PI) / numItems;
								const angle = i * sliceAngle - Math.PI / 2 + sliceAngle / 2;
								const x2 = 260 + 240 * Math.cos(angle);
								const y2 = 260 + 240 * Math.sin(angle);
								return <line key={i} x1="260" y1="260" x2={x2} y2={y2} />;
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
								return <HubIcon size={22} strokeWidth={1.8} />;
							})()}
						</div>
						<div className="radial-hub-title">{currentWorkspace.name}</div>
						<div className="radial-hub-cancel-hint">Cancel</div>
					</div>

					{/* Radial Slices */}
					{items.map((item, index) => {
						const sliceAngle = (2 * Math.PI) / numItems;
						const angle = index * sliceAngle - Math.PI / 2;
						const posX = 260 + RADIUS * Math.cos(angle);
						const posY = 260 + RADIUS * Math.sin(angle);

						const isActive = activeSliceIndex === index;
						const ItemIcon = getRadialIcon(item.icon);

						return (
							<div
								key={item.id || index}
								className={`radial-slice-item ${isActive ? "active" : ""}`}
								style={{ left: posX, top: posY }}
								onMouseEnter={() => {
									if (selectionMode === "cursor") {
										selectSlice(index);
									}
								}}
								onMouseLeave={() => {
									if (selectionMode === "cursor" && activeSliceIndex === index) {
										selectSlice(null);
									}
								}}
								onClick={() => executeItem(item)}
							>
								{/* Number badge */}
								{numberLabels && (
									<div className="radial-number-badge">{index + 1}</div>
								)}

								{/* Dwell ring progress */}
								{isActive && instantActivate === "dwell" && dwellProgress > 0 && (
									<div className="radial-dwell-ring">
										<svg viewBox="0 0 90 76">
											<rect
												x="2"
												y="2"
												width="86"
												height="72"
												rx="16"
												style={{
													strokeDashoffset: 300 - 300 * dwellProgress
												}}
											/>
										</svg>
									</div>
								)}

								<div className="radial-slice-icon-wrap">
									<ItemIcon size={24} strokeWidth={1.7} />
								</div>
								<div className="radial-slice-label">{item.label}</div>
							</div>
						);
					})}

					{/* Workspaces navigation pill */}
					{workspaces.length > 1 && (
						<div className="radial-workspaces-bar">
							{workspaces.map((ws, idx) => {
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
