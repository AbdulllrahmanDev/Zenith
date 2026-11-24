import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Crop, Loader2, RotateCcw, SkipForward, X } from "lucide-react";
import type { CropBox, ImagePreviewPayload } from "../converter/types";
import { useI18n } from "../i18n";
import "./ConverterCropModal.css";

export interface CropConfirmItem {
	path: string;
	crop: CropBox;
	format: string;
}

export interface ConverterCropModalProps {
	inputs: string[];
	accentColor: string;
	accentForeground: string;
	onConfirm: (items: CropConfirmItem[]) => void;
	onCancel: () => void;
}

type AspectPreset = "free" | "1:1" | "16:9" | "4:3" | "9:16";
type DragHandle = "move" | "nw" | "ne" | "sw" | "se";

interface NormRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const DEFAULT_NORM_CROP: NormRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };
const CROP_TARGET_FORMATS = ["png", "jpg", "webp", "tiff", "bmp", "avif"] as const;
const ASPECT_RATIO_MAP: Record<AspectPreset, number | null> = {
	free: null,
	"1:1": 1,
	"16:9": 16 / 9,
	"4:3": 4 / 3,
	"9:16": 9 / 16
};

function clampNumber(val: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, val));
}

function extractFileName(path: string): string {
	const trimmed = path.trim();
	const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function inferDefaultTargetFormat(path: string): string {
	const name = extractFileName(path);
	const dot = name.lastIndexOf(".");
	if (dot < 0) return "png";
	const raw = name.slice(dot + 1).toLowerCase();
	const normalized = raw === "jpeg" ? "jpg" : raw;
	return (CROP_TARGET_FORMATS as readonly string[]).includes(normalized) ? normalized : "png";
}

function applyAspectToNormRect(
	rect: NormRect,
	pixelRatio: number | null,
	imgWidth: number,
	imgHeight: number
): NormRect {
	if (!pixelRatio || imgWidth <= 0 || imgHeight <= 0) {
		return rect;
	}
	const normRatio = pixelRatio * (imgHeight / imgWidth);
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;

	let w = rect.width;
	let h = w / normRatio;
	if (h > 1) {
		h = 1;
		w = h * normRatio;
	}
	if (w > 1) {
		w = 1;
		h = w / normRatio;
	}
	const x = clampNumber(cx - w / 2, 0, Math.max(0, 1 - w));
	const y = clampNumber(cy - h / 2, 0, Math.max(0, 1 - h));
	return { x, y, width: w, height: h };
}

function resizeNormRectFromCorner(
	start: NormRect,
	handle: Exclude<DragHandle, "move">,
	dxNorm: number,
	dyNorm: number,
	normRatio: number | null,
	minW: number,
	minH: number
): NormRect {
	const isLeft = handle === "nw" || handle === "sw";
	const isTop = handle === "nw" || handle === "ne";
	const ax = isLeft ? start.x + start.width : start.x;
	const ay = isTop ? start.y + start.height : start.y;
	const maxW = Math.max(minW, isLeft ? ax : 1 - ax);
	const maxH = Math.max(minH, isTop ? ay : 1 - ay);

	const rawW = isLeft ? start.width - dxNorm : start.width + dxNorm;
	const rawH = isTop ? start.height - dyNorm : start.height + dyNorm;

	let w = clampNumber(rawW, minW, maxW);
	let h = clampNumber(rawH, minH, maxH);

	if (normRatio !== null && Number.isFinite(normRatio) && normRatio > 0) {
		// Fit exact aspect ratio within [min..max] from the anchored opposite corner.
		if (Math.abs(dxNorm) >= Math.abs(dyNorm)) {
			h = w / normRatio;
			if (h > maxH) {
				h = maxH;
				w = h * normRatio;
			}
		} else {
			w = h * normRatio;
			if (w > maxW) {
				w = maxW;
				h = w / normRatio;
			}
		}
		if (w < minW) {
			w = Math.min(maxW, minW);
			h = w / normRatio;
		}
		if (h < minH) {
			h = Math.min(maxH, minH);
			w = h * normRatio;
		}
		if (w > maxW) {
			w = maxW;
			h = w / normRatio;
		}
		if (h > maxH) {
			h = maxH;
			w = h * normRatio;
		}
	}

	const x = clampNumber(isLeft ? ax - w : ax, 0, 1);
	const y = clampNumber(isTop ? ay - h : ay, 0, 1);
	return {
		x,
		y,
		width: clampNumber(w, 0, 1 - x),
		height: clampNumber(h, 0, 1 - y)
	};
}

function normToCropBox(norm: NormRect, naturalWidth: number, naturalHeight: number): CropBox {
	const imgW = Math.max(1, Math.round(naturalWidth));
	const imgH = Math.max(1, Math.round(naturalHeight));
	const x = Math.max(0, Math.min(imgW - 1, Math.round(norm.x * imgW)));
	const y = Math.max(0, Math.min(imgH - 1, Math.round(norm.y * imgH)));
	const width = Math.max(1, Math.min(imgW - x, Math.round(norm.width * imgW)));
	const height = Math.max(1, Math.min(imgH - y, Math.round(norm.height * imgH)));
	return { x, y, width, height };
}

export const ConverterCropModal: React.FC<ConverterCropModalProps> = ({
	inputs,
	accentColor,
	accentForeground,
	onConfirm,
	onCancel
}) => {
	const { t, dir } = useI18n();
	const cm = t.converter.cropModal;

	const [currentIndex, setCurrentIndex] = useState(0);
	const [queuedItems, setQueuedItems] = useState<CropConfirmItem[]>([]);
	const [preview, setPreview] = useState<ImagePreviewPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [normCrop, setNormCrop] = useState<NormRect>(DEFAULT_NORM_CROP);
	const [aspect, setAspect] = useState<AspectPreset>("free");
	const [targetFormat, setTargetFormat] = useState<string>(() =>
		inputs[0] ? inferDefaultTargetFormat(inputs[0]) : "png"
	);
	const [formatTouched, setFormatTouched] = useState(false);

	const [viewport, setViewport] = useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth || 1920 : 1920,
		height: typeof window !== "undefined" ? window.innerHeight || 1080 : 1080
	}));

	const stageWrapRef = useRef<HTMLDivElement | null>(null);
	const dragCleanupRef = useRef<(() => void) | null>(null);

	const currentPath = inputs[currentIndex] ?? inputs[0] ?? "";
	const totalCount = inputs.length;
	const hasMultiple = totalCount > 1;
	const isLast = currentIndex >= totalCount - 1;

	useEffect(() => {
		const onResize = () => {
			setViewport({
				width: window.innerWidth || 1920,
				height: window.innerHeight || 1080
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(() => {
		return () => {
			dragCleanupRef.current?.();
			dragCleanupRef.current = null;
		};
	}, []);

	// Load image preview via Rust `data:image/png;base64,...` payload (CSP-compliant).
	useEffect(() => {
		if (!currentPath) {
			setPreview(null);
			setLoading(false);
			setLoadError(cm.previewError);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setLoadError(null);
		setPreview(null);
		setNormCrop(DEFAULT_NORM_CROP);
		if (!formatTouched) {
			setTargetFormat(inferDefaultTargetFormat(currentPath));
		}

		invoke<ImagePreviewPayload>("converter_load_image_preview", { path: currentPath })
			.then((payload) => {
				if (cancelled) return;
				setPreview(payload);
				setNormCrop(
					applyAspectToNormRect(
						DEFAULT_NORM_CROP,
						ASPECT_RATIO_MAP[aspect],
						payload.width,
						payload.height
					)
				);
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				const msg = err instanceof Error ? err.message : String(err);
				setLoadError(msg.replace(/^[A-Z0-9_]+:\s*/, "").trim() || cm.previewError);
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
		// Re-run only when currentPath changes; aspect changes are applied by handleAspectChange.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPath]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onCancel();
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [onCancel]);

	const displayDimensions = useMemo(() => {
		if (!preview || preview.width <= 0 || preview.height <= 0) {
			return { width: 420, height: 280 };
		}
		const maxW = Math.max(260, Math.min(760, viewport.width - 120));
		const maxH = Math.max(200, Math.min(440, viewport.height - 280));
		const minUpscale = Math.min(2.6, 260 / Math.max(preview.width, preview.height));
		const scale = Math.min(maxW / preview.width, maxH / preview.height, Math.max(1, minUpscale));
		return {
			width: Math.max(48, Math.round(preview.width * scale)),
			height: Math.max(48, Math.round(preview.height * scale))
		};
	}, [preview, viewport.width, viewport.height]);

	const cropBoxPx = useMemo(() => {
		if (!preview) return { x: 0, y: 0, width: 0, height: 0 };
		return normToCropBox(normCrop, preview.width, preview.height);
	}, [normCrop, preview]);

	const handleAspectChange = useCallback(
		(nextAspect: AspectPreset) => {
			setAspect(nextAspect);
			if (!preview) return;
			setNormCrop((prev) =>
				applyAspectToNormRect(
					prev,
					ASPECT_RATIO_MAP[nextAspect],
					preview.width,
					preview.height
				)
			);
		},
		[preview]
	);

	const handleResetCrop = useCallback(() => {
		setAspect("free");
		setNormCrop({ x: 0, y: 0, width: 1, height: 1 });
	}, []);

	const startDrag = useCallback(
		(handle: DragHandle, e: React.PointerEvent) => {
			if (!preview || !stageWrapRef.current) return;
			e.preventDefault();
			e.stopPropagation();
			dragCleanupRef.current?.();

			const rect = stageWrapRef.current.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;

			const startX = e.clientX;
			const startY = e.clientY;
			const startNorm = normCrop;
			const pixelRatio = ASPECT_RATIO_MAP[aspect];
			const normRatio =
				pixelRatio !== null ? pixelRatio * (preview.height / preview.width) : null;
			const minW = Math.max(1 / preview.width, 14 / rect.width);
			const minH = Math.max(1 / preview.height, 14 / rect.height);

			const onMove = (ev: PointerEvent) => {
				const dxNorm = (ev.clientX - startX) / rect.width;
				const dyNorm = (ev.clientY - startY) / rect.height;

				if (handle === "move") {
					const x = clampNumber(startNorm.x + dxNorm, 0, Math.max(0, 1 - startNorm.width));
					const y = clampNumber(startNorm.y + dyNorm, 0, Math.max(0, 1 - startNorm.height));
					setNormCrop({
						x,
						y,
						width: startNorm.width,
						height: startNorm.height
					});
					return;
				}

				setNormCrop(
					resizeNormRectFromCorner(startNorm, handle, dxNorm, dyNorm, normRatio, minW, minH)
				);
			};

			const cleanup = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", cleanup);
				window.removeEventListener("pointercancel", cleanup);
				window.removeEventListener("blur", cleanup);
				dragCleanupRef.current = null;
			};

			dragCleanupRef.current = cleanup;
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", cleanup);
			window.addEventListener("pointercancel", cleanup);
			window.addEventListener("blur", cleanup);
		},
		[aspect, normCrop, preview]
	);

	const handleSkip = useCallback(() => {
		if (!isLast) {
			setCurrentIndex((idx) => idx + 1);
			return;
		}
		if (queuedItems.length > 0) {
			onConfirm(queuedItems);
		} else {
			onCancel();
		}
	}, [isLast, onCancel, onConfirm, queuedItems]);

	const handleConfirmCurrent = useCallback(() => {
		if (!preview) return;
		const item: CropConfirmItem = {
			path: currentPath,
			crop: normToCropBox(normCrop, preview.width, preview.height),
			format: targetFormat
		};
		if (!isLast) {
			setQueuedItems((prev) => [...prev, item]);
			setCurrentIndex((idx) => idx + 1);
			return;
		}
		onConfirm([...queuedItems, item]);
	}, [currentPath, isLast, normCrop, onConfirm, preview, queuedItems, targetFormat]);

	const handleApplyAll = useCallback(() => {
		if (!preview) return;
		const currentCrop: CropBox = {
			...normToCropBox(normCrop, preview.width, preview.height),
			ref_width: preview.width,
			ref_height: preview.height
		};
		const remaining: CropConfirmItem[] = inputs.slice(currentIndex).map((path) => ({
			path,
			crop: currentCrop,
			format: targetFormat
		}));
		onConfirm([...queuedItems, ...remaining]);
	}, [currentIndex, inputs, normCrop, onConfirm, preview, queuedItems, targetFormat]);

	const aspectOptions: Array<{ id: AspectPreset; label: string }> = [
		{ id: "free", label: cm.aspectFree },
		{ id: "1:1", label: cm.aspect1x1 },
		{ id: "16:9", label: cm.aspect16x9 },
		{ id: "4:3", label: cm.aspect4x3 },
		{ id: "9:16", label: cm.aspect9x16 }
	];

	return (
		<div
			className="zn-crop-backdrop"
			dir={dir}
			onMouseDown={(e) => e.stopPropagation()}
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onCancel();
				}
			}}
		>
			<AnimatePresence>
				<motion.div
					className="converter-crop-modal"
					role="dialog"
					aria-modal="true"
					aria-label={cm.title}
					initial={{ opacity: 0, scale: 0.94, y: 8 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: 6 }}
					transition={{ type: "spring", stiffness: 420, damping: 32 }}
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div className="zn-crop-header">
						<div className="zn-crop-title-group">
							<div
								className="zn-crop-icon-badge"
								style={{
									backgroundColor: `${accentColor}24`,
									borderColor: `${accentColor}66`,
									color: accentColor
								}}
							>
								<Crop size={15} />
							</div>
							<div className="zn-crop-title-meta">
								<div className="zn-crop-title-row">
									<span className="zn-crop-title">{cm.title}</span>
									{hasMultiple && (
										<span className="zn-crop-queue-pill">
											{cm.imageProgress(currentIndex + 1, totalCount)}
										</span>
									)}
								</div>
								<div className="zn-crop-filename" title={currentPath}>
									{extractFileName(currentPath)}
								</div>
							</div>
						</div>

						<div className="zn-crop-header-right">
							{preview && (
								<span className="zn-crop-dim-badge" dir="ltr">
									{cm.dimensionsBadge(cropBoxPx.width, cropBoxPx.height)}
								</span>
							)}
							<button
								type="button"
								className="zn-conv-close-mini"
								onClick={onCancel}
								title={cm.cancel}
								aria-label={cm.cancel}
							>
								<X size={14} />
							</button>
						</div>
					</div>

					{/* Interactive Crop Canvas */}
					<div className="zn-crop-stage">
						{loading ? (
							<div className="zn-crop-status">
								<Loader2 size={20} className="zn-conv-spin" />
								<span>{cm.loadingPreview}</span>
							</div>
						) : loadError || !preview ? (
							<div className="zn-crop-status is-error">
								<AlertCircle size={20} />
								<span>{loadError || cm.previewError}</span>
							</div>
						) : (
							<div
								ref={stageWrapRef}
								className="zn-crop-image-wrap"
								dir="ltr"
								style={{
									width: displayDimensions.width,
									height: displayDimensions.height
								}}
							>
								<img
									src={preview.data_url}
									alt={extractFileName(currentPath)}
									className="zn-crop-preview-img"
									draggable={false}
								/>

								<div
									className="zn-crop-frame"
									style={{
										left: `${normCrop.x * 100}%`,
										top: `${normCrop.y * 100}%`,
										width: `${normCrop.width * 100}%`,
										height: `${normCrop.height * 100}%`,
										borderColor: accentColor
									}}
									onPointerDown={(e) => startDrag("move", e)}
								>
									<div className="zn-crop-grid-v zn-crop-grid-v1" />
									<div className="zn-crop-grid-v zn-crop-grid-v2" />
									<div className="zn-crop-grid-h zn-crop-grid-h1" />
									<div className="zn-crop-grid-h zn-crop-grid-h2" />

									{(["nw", "ne", "sw", "se"] as const).map((handle) => (
										<button
											key={handle}
											type="button"
											className={`zn-crop-handle is-${handle}`}
											style={{ borderColor: accentColor }}
											aria-label={`Resize ${handle}`}
											onPointerDown={(e) => startDrag(handle, e)}
										/>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Controls Row: Aspect Ratio & Target Format */}
					<div className="zn-crop-controls">
						<div className="zn-crop-control-group">
							<div className="zn-crop-aspect-pills" role="group" aria-label="Aspect ratio">
								{aspectOptions.map((opt) => {
									const active = aspect === opt.id;
									return (
										<button
											key={opt.id}
											type="button"
											className={`zn-crop-pill-btn${active ? " is-active" : ""}`}
											style={
												active
													? {
															backgroundColor: accentColor,
															borderColor: accentColor,
															color: accentForeground
														}
													: undefined
											}
											onClick={() => handleAspectChange(opt.id)}
											disabled={!preview}
										>
											{opt.label}
										</button>
									);
								})}
								<button
									type="button"
									className="zn-crop-pill-btn zn-crop-reset-btn"
									onClick={handleResetCrop}
									disabled={!preview}
									title={cm.resetCrop}
								>
									<RotateCcw size={11} />
									<span>{cm.resetCrop}</span>
								</button>
							</div>
						</div>

						<div className="zn-crop-control-group">
							<span className="zn-crop-control-label">{cm.targetFormat}</span>
							<div className="zn-crop-format-pills" dir="ltr">
								{CROP_TARGET_FORMATS.map((fmt) => {
									const active = targetFormat === fmt;
									return (
										<button
											key={fmt}
											type="button"
											className={`zn-crop-pill-btn${active ? " is-active" : ""}`}
											style={
												active
													? {
															backgroundColor: accentColor,
															borderColor: accentColor,
															color: accentForeground
														}
													: undefined
											}
											onClick={() => {
												setFormatTouched(true);
												setTargetFormat(fmt);
											}}
										>
											{fmt.toUpperCase()}
										</button>
									);
								})}
							</div>
						</div>
					</div>

					{/* Footer Actions */}
					<div className="zn-crop-footer">
						<div className="zn-crop-footer-meta">
							{preview && (
								<span className="zn-crop-orig-size" dir="ltr">
									{cm.originalSize(preview.width, preview.height)}
								</span>
							)}
						</div>

						<div className="zn-crop-footer-actions">
							<button type="button" className="zn-conv-btn" onClick={onCancel}>
								{cm.cancel}
							</button>

							{hasMultiple && (
								<button type="button" className="zn-conv-btn" onClick={handleSkip}>
									<SkipForward size={13} />
									<span>{cm.skip}</span>
								</button>
							)}

							{hasMultiple && !isLast && (
								<button
									type="button"
									className="zn-conv-btn"
									onClick={handleApplyAll}
									disabled={!preview || loading}
								>
									<Check size={13} />
									<span>{cm.applyAndConvertAll}</span>
								</button>
							)}

							<button
								type="button"
								className="zn-conv-btn zn-conv-btn-primary"
								style={{
									backgroundColor: accentColor,
									color: accentForeground
								}}
								onClick={handleConfirmCurrent}
								disabled={!preview || loading}
							>
								<Check size={13} />
								<span>{!isLast ? cm.nextImage : cm.applyAndConvert}</span>
							</button>
						</div>
					</div>
				</motion.div>
			</AnimatePresence>
		</div>
	);
};

export default ConverterCropModal;
