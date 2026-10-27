import React from "react";
import {
	annularSectorPath,
	polarPoint,
	sectorBoundsDeg,
	sectorBeamAlphas,
	sectorBeamLean,
	sectorBeamStops,
	sectorCentreDeg,
	sectorGradientStops,
	sectorReachStops,
	sectorSoloFadeMask,
	SECTOR_EDGE_ALPHA,
	SECTOR_FILL_ALPHA,
	SECTOR_SEAM_ALPHA,
	SECTOR_SEAM_FALLOFF_SCALE,
	SECTOR_SEAM_REACH
} from "./radialSectors";

export const LAUNCH_ECHO_MS = 520;
export const FIRED_SLICE_SCALE = 1.06;

export function computeRadialLayout({
	numberOfApps,
	iconSizePx,
	minGap,
	menuRadius,
	activationThreshold,
	viewportSize
}: {
	numberOfApps: number;
	iconSizePx: number;
	minGap: number;
	menuRadius: number;
	activationThreshold?: number;
	viewportSize: { width: number; height: number };
}): { actualMenuRadius: number; actualIconSize: number } {
	const maxScreenRadius = Math.min(viewportSize.width, viewportSize.height) * 0.52;
	const sinHalfSlice = numberOfApps > 1 ? Math.sin(Math.PI / numberOfApps) : 0;

	const density = Math.max(0, Math.min(1, (numberOfApps - 3) / 6));
	let currentIconSize = Math.round(iconSizePx * (0.82 + 0.18 * density));

	const neighbourGap = minGap + 14;
	const packedRadius = (size: number) =>
		numberOfApps > 1 ? (size + neighbourGap) / 2 / sinHalfSlice : 0;

	const floorRadius = (size: number) =>
		Math.max(
			size * 1.1 + minGap + 12,
			(activationThreshold ?? 60) + size / 2 + 8,
			92
		);

	const radiusScale = (menuRadius + minGap) / 150;
	const naturalRadius = (size: number) => Math.max(floorRadius(size), packedRadius(size));

	let targetRadius = naturalRadius(currentIconSize) * radiusScale;

	if (targetRadius < packedRadius(currentIconSize) && numberOfApps > 1) {
		const possibleScale = (2 * targetRadius * sinHalfSlice - neighbourGap) / currentIconSize;
		const scaleFactor = Math.max(0.5, Math.min(1.0, possibleScale));
		currentIconSize = Math.round(currentIconSize * scaleFactor);
		targetRadius = Math.max(targetRadius, packedRadius(currentIconSize));
	}

	if (targetRadius > maxScreenRadius && numberOfApps > 1) {
		const possibleScale = (2 * maxScreenRadius * sinHalfSlice - neighbourGap) / currentIconSize;
		const scaleFactor = Math.max(0.5, Math.min(1.0, possibleScale));
		currentIconSize = Math.round(currentIconSize * scaleFactor);
		targetRadius = Math.max(naturalRadius(currentIconSize), Math.min(targetRadius, maxScreenRadius));
	}

	return { actualMenuRadius: targetRadius, actualIconSize: currentIconSize };
}

export function getLabelPlacement(angleDeg: number, iconSize: number) {
	const rad = angleDeg * (Math.PI / 180);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const edge = iconSize / 2 + 10;

	if (cos > 0.35) return { x: edge, y: 0, originX: "0%", originY: "-50%" };
	if (cos < -0.35) return { x: -edge, y: 0, originX: "-100%", originY: "-50%" };
	if (sin < 0) return { x: 0, y: -edge, originX: "-50%", originY: "-100%" };
	return { x: 0, y: edge, originX: "-50%", originY: "0%" };
}

export function getSlicePresence(distance: number | null) {
	if (distance === null) return { opacity: 0.96, scale: 1 };
	if (distance === 0) return { opacity: 1, scale: 1.06 };
	return { opacity: 0.9, scale: 1 };
}

export function roundedRectPathFromTop(size: number, inset: number, radius: number): string {
	const near = inset;
	const far = size - inset;
	const mid = size / 2;
	const r = Math.max(0, Math.min(radius, (far - near) / 2));
	return [
		`M ${mid} ${near}`,
		`L ${far - r} ${near}`,
		`A ${r} ${r} 0 0 1 ${far} ${near + r}`,
		`L ${far} ${far - r}`,
		`A ${r} ${r} 0 0 1 ${far - r} ${far}`,
		`L ${near + r} ${far}`,
		`A ${r} ${r} 0 0 1 ${near} ${far - r}`,
		`L ${near} ${near + r}`,
		`A ${r} ${r} 0 0 1 ${near + r} ${near}`,
		"Z"
	].join(" ");
}

export function snapToDevicePixel(value: number): number {
	const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
	return Math.round(value * ratio) / ratio;
}

export function getReadableForeground(background: string): "#000000" | "#FFFFFF" {
	const hex = background.replace("#", "");
	if (!/^[0-9a-f]{6}$/i.test(hex)) return "#000000";
	const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance > 0.56 ? "#000000" : "#FFFFFF";
}

export function normalizeHoverColor(value?: string): string {
	return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value!.toUpperCase() : "#FFFFFF";
}

export const RadialSectors = React.memo(
	({
		count,
		activeIndex,
		radiusInner,
		radiusOuter,
		hoverColor,
		falloffRadius,
		visible,
		dimmed
	}: {
		count: number;
		activeIndex: number | null;
		radiusInner: number;
		radiusOuter: number;
		hoverColor: string;
		falloffRadius: number;
		visible: boolean;
		dimmed: boolean;
	}) => {
		const gradientId = React.useId().replace(/:/g, "");
		const drawable = radiusOuter > radiusInner + 8;
		const size = Math.max(radiusOuter * 2, 2);

		const wedges = React.useMemo(() => {
			return Array.from({ length: count }, (_, index) => {
				const { startDeg, endDeg } = sectorBoundsDeg(index, count);
				return annularSectorPath(radiusInner, radiusOuter, startDeg, endDeg);
			});
		}, [count, radiusInner, radiusOuter]);

		const dividers = React.useMemo(() => {
			if (count < 2) return [] as { x1: number; y1: number; x2: number; y2: number }[];
			const seamEnd = radiusOuter * SECTOR_SEAM_REACH;
			return Array.from({ length: count }, (_, index) => {
				const { startDeg } = sectorBoundsDeg(index, count);
				const near = polarPoint(radiusOuter, radiusInner, startDeg);
				const far = polarPoint(radiusOuter, seamEnd, startDeg);
				return { x1: near.x, y1: near.y, x2: far.x, y2: far.y };
			});
		}, [count, radiusInner, radiusOuter]);

		const innerStop = radiusInner / radiusOuter;
		const falloffStop = Math.min(0.9, Math.max(innerStop + 0.02, falloffRadius / radiusOuter));
		const seamFalloffStop = Math.min(
			0.9,
			Math.max(
				innerStop + 0.02,
				(falloffRadius * SECTOR_SEAM_FALLOFF_SCALE) / (radiusOuter * SECTOR_SEAM_REACH)
			)
		);
		const seamInnerStop = innerStop / SECTOR_SEAM_REACH;
		const seamEnd = radiusOuter * SECTOR_SEAM_REACH;
		const lean = sectorBeamLean(count);
		const soloMask = React.useMemo(
			() => (count === 1 ? sectorSoloFadeMask(sectorCentreDeg(0, 1)) : undefined),
			[count]
		);

		if (!drawable) return null;

		const beamGradient = (
			id: string,
			stops: { offset: number; opacity: number }[],
			deg: number,
			length: number = radiusOuter,
			color: string = hoverColor
		) => {
			const far = polarPoint(radiusOuter, length, deg);
			return (
				<linearGradient
					id={id}
					gradientUnits="userSpaceOnUse"
					x1={radiusOuter}
					y1={radiusOuter}
					x2={far.x.toFixed(2)}
					y2={far.y.toFixed(2)}
				>
					{stops.map((stop, index) => (
						<stop
							key={index}
							offset={stop.offset.toFixed(4)}
							stopColor={color}
							stopOpacity={stop.opacity.toFixed(4)}
						/>
					))}
				</linearGradient>
			);
		};

		const beamStops = sectorBeamStops(
			innerStop,
			falloffStop,
			...sectorBeamAlphas(SECTOR_FILL_ALPHA, count),
			lean
		);
		const edgeStops = sectorBeamStops(
			innerStop,
			falloffStop,
			...sectorBeamAlphas(SECTOR_EDGE_ALPHA, count),
			lean
		);
		const seamStops = sectorGradientStops(
			seamInnerStop,
			seamFalloffStop,
			SECTOR_SEAM_ALPHA[0],
			SECTOR_SEAM_ALPHA[1]
		);

		const beamId = (index: number) => `${gradientId}-beam-${index}`;
		const edgeId = (index: number) => `${gradientId}-edge-${index}`;

		return (
			<svg
				className="zn-radial-sectors"
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				shapeRendering="geometricPrecision"
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					pointerEvents: "none",
					transform: "translate(-50%, -50%)",
					["--zn-op" as string]: visible ? (dimmed ? 0 : 1) : 0,
					WebkitMaskImage: soloMask,
					maskImage: soloMask
				}}
				aria-hidden
			>
				<defs>
					{wedges.map((_, index) => (
						<React.Fragment key={index}>
							{beamGradient(beamId(index), beamStops, sectorCentreDeg(index, count))}
							{beamGradient(edgeId(index), edgeStops, sectorCentreDeg(index, count))}
						</React.Fragment>
					))}
					<radialGradient id={`${gradientId}-reach`} cx="50%" cy="50%" r="50%">
						{sectorReachStops(innerStop, falloffStop, lean).map((stop, index) => (
							<stop
								key={index}
								offset={stop.offset.toFixed(4)}
								stopColor="#FFFFFF"
								stopOpacity={stop.opacity.toFixed(4)}
							/>
						))}
					</radialGradient>
					<mask
						id={`${gradientId}-mask`}
						maskUnits="userSpaceOnUse"
						x={0}
						y={0}
						width={size}
						height={size}
					>
						<rect width={size} height={size} fill={`url(#${gradientId}-reach)`} />
					</mask>
					{dividers.map((_, index) => (
						<React.Fragment key={`seam-${index}`}>
							{beamGradient(
								`${gradientId}-seam-${index}`,
								seamStops,
								sectorBoundsDeg(index, count).startDeg,
								seamEnd,
								"#FFFFFF"
							)}
						</React.Fragment>
					))}
				</defs>

				<g mask={`url(#${gradientId}-mask)`}>
					{wedges.map((path, index) => (
						<path
							key={index}
							className="zn-radial-sector"
							d={path}
							fill={`url(#${beamId(index)})`}
							stroke={`url(#${edgeId(index)})`}
							strokeWidth={1.25}
							vectorEffect="non-scaling-stroke"
							style={{ opacity: index === activeIndex ? 1 : 0 }}
						/>
					))}
				</g>

				{dividers.map((line, index) => (
					<line
						key={index}
						x1={line.x1}
						y1={line.y1}
						x2={line.x2}
						y2={line.y2}
						stroke={`url(#${gradientId}-seam-${index})`}
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
		);
	}
);
RadialSectors.displayName = "RadialSectors";
