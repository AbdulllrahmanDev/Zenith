/**
 * Original vector art for the prayer features. Everything draws with
 * `currentColor` (text) and `var(--zenith-accent)`, so it follows the app theme in
 * dark, light, custom and adaptive modes. No raster images are used.
 */
import React, { useId } from "react";
import type { PrayerKey } from "../../utils/prayerSchedule";

const rad = (deg: number) => (deg * Math.PI) / 180;
const fmt = (n: number) => Number(n.toFixed(2));

/** Points of a regular star polygon, first tip pointing up. */
function starPoints(cx: number, cy: number, outer: number, inner: number, tips: number): string {
	const points: string[] = [];
	for (let i = 0; i < tips * 2; i++) {
		const radius = i % 2 === 0 ? outer : inner;
		const angle = rad(-90 + (i * 180) / tips);
		points.push(`${fmt(cx + radius * Math.cos(angle))},${fmt(cy + radius * Math.sin(angle))}`);
	}
	return points.join(" ");
}

/** Eight-pointed star (khatim): two squares turned 45 degrees against each other. */
const octagram = (cx: number, cy: number, outer: number) => starPoints(cx, cy, outer, outer * 0.765, 8);

/** Crescent opening to the right: a circle of radius R minus one of radius r2 shifted by d. */
function crescentPath(R: number, r2: number, d: number): string {
	const x = (d * d + R * R - r2 * r2) / (2 * d);
	const y = Math.sqrt(R * R - x * x);
	return `M ${fmt(x)} ${fmt(-y)} A ${R} ${R} 0 1 0 ${fmt(x)} ${fmt(y)} A ${r2} ${r2} 0 1 1 ${fmt(x)} ${fmt(-y)} Z`;
}

const CRESCENT = crescentPath(9.5, 7.7, 4);

interface SvgProps {
	size?: number;
	className?: string;
}

/** The prayer mark: a crescent and star inside an eight-pointed star. */
export const PrayerEmblem: React.FC<SvgProps> = ({ size = 24, className }) => (
	<svg
		className={className}
		width={size}
		height={size}
		viewBox="0 0 48 48"
		fill="none"
		aria-hidden="true"
		focusable="false"
	>
		<polygon
			points={octagram(24, 24, 22.5)}
			fill="var(--zenith-accent)"
			fillOpacity="0.14"
			stroke="var(--zenith-accent)"
			strokeWidth="1.6"
			strokeLinejoin="round"
		/>
		<g fill="currentColor">
			<path d={CRESCENT} transform="translate(21.2 24.4)" />
			<polygon points={starPoints(31.2, 23.4, 4.3, 1.75, 5)} />
		</g>
	</svg>
);

interface IconProps {
	size?: number;
	strokeWidth?: number;
	className?: string;
}

const Line: React.FC<IconProps & { children: React.ReactNode }> = ({
	size = 16,
	strokeWidth = 1.7,
	className,
	children
}) => (
	<svg
		className={className}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		{children}
	</svg>
);

/** Half sun on the horizon with rays, and an arrow for the direction it travels. */
const HorizonSun: React.FC<IconProps & { rising: boolean }> = ({ rising, ...props }) => (
	<Line {...props}>
		<path d="M4 18h16" />
		<path d="M7.5 18a4.5 4.5 0 0 1 9 0" />
		<path d="M12 8.2v1.6M6.1 11.2l1.1 1.1M17.9 11.2l-1.1 1.1" />
		{rising ? <path d="M10 5.5 12 3.5l2 2" /> : <path d="M10 3.5 12 5.5l2-2" />}
	</Line>
);

const ICONS: Record<PrayerKey, React.FC<IconProps>> = {
	Fajr: (props) => <HorizonSun rising {...props} />,
	Dhuhr: (props) => (
		<Line {...props}>
			<circle cx="12" cy="12" r="3.8" />
			<path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
		</Line>
	),
	Asr: (props) => (
		<Line {...props}>
			<circle cx="12" cy="10.5" r="3.6" />
			<path d="M12 3.6v1.5M5.1 10.5h1.5M17.4 10.5h1.5M7.1 5.6l1.1 1.1M16.9 5.6l-1.1 1.1" />
			<path d="M4 19.5h16" />
			<path d="M8 16.2h8" strokeDasharray="1.6 2.4" />
		</Line>
	),
	Maghrib: (props) => <HorizonSun rising={false} {...props} />,
	Isha: (props) => (
		<Line {...props}>
			<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1Z" />
			<path d="M17.2 3.5v3M15.7 5h3" />
		</Line>
	)
};

export const PrayerIcon: React.FC<IconProps & { prayer: PrayerKey }> = ({ prayer, ...props }) => {
	const Icon = ICONS[prayer];
	return <Icon {...props} />;
};

/** Faint repeating star lattice for backgrounds. Size and fade are set in CSS. */
export const GeometricPattern: React.FC<{ className?: string }> = ({ className }) => {
	const id = useId();
	return (
		<svg className={className} width="100%" height="100%" aria-hidden="true" focusable="false">
			<defs>
				<pattern id={id} width="36" height="36" patternUnits="userSpaceOnUse">
					<polygon
						points={octagram(18, 18, 13)}
						fill="none"
						stroke="currentColor"
						strokeWidth="0.9"
						strokeLinejoin="round"
					/>
					<polygon points={octagram(18, 18, 6.2)} fill="none" stroke="currentColor" strokeWidth="0.7" />
					<path d="M0 0l3 3M36 0l-3 3M0 36l3-3M36 36l-3-3" stroke="currentColor" strokeWidth="0.9" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${id})`} />
		</svg>
	);
};

/** A thin rule with a small star in the middle. Line colour comes from CSS. */
export const OrnamentRule: React.FC<{ className?: string }> = ({ className }) => (
	<div className={className} aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 6 }}>
		<span style={{ flex: 1, height: 1, background: "currentColor" }} />
		<svg width="9" height="9" viewBox="0 0 9 9" focusable="false">
			<polygon points={octagram(4.5, 4.5, 4.2)} fill="currentColor" />
		</svg>
		<span style={{ flex: 1, height: 1, background: "currentColor" }} />
	</div>
);

type SkyPhase = "dawn" | "noon" | "afternoon" | "sunset" | "night";

const PHASE: Record<PrayerKey, SkyPhase> = {
	Fajr: "dawn",
	Dhuhr: "noon",
	Asr: "afternoon",
	Maghrib: "sunset",
	Isha: "night"
};

const SPARKLES: ReadonlyArray<readonly [number, number, number]> = [
	[24, 14, 1.1],
	[52, 8, 0.8],
	[84, 18, 0.9],
	[112, 9, 0.7],
	[132, 20, 1],
	[176, 12, 0.8],
	[188, 30, 0.7],
	[-14, 22, 0.8],
	[-4, 40, 0.6],
	[212, 16, 0.9],
	[226, 36, 0.7]
];

/**
 * A mosque at the time of day of the prayer. One silhouette and one palette (the
 * app accent); only the sky changes between prayers.
 */
export const MosqueScene: React.FC<{ prayer: PrayerKey; className?: string }> = ({ prayer, className }) => {
	const uid = useId();
	const mask = `${uid}-cut`;
	const sky = `${uid}-sky`;
	const glow = `${uid}-glow`;
	const phase = PHASE[prayer];

	const showStars = phase === "night" || phase === "dawn";
	const body =
		phase === "noon"
			? { x: 150, y: 17, r: 6.5, glowY: 17, glowR: 46 }
			: phase === "afternoon"
				? { x: 162, y: 32, r: 6.5, glowY: 32, glowR: 46 }
				: phase === "sunset"
					? { x: 150, y: 54, r: 12, glowY: 56, glowR: 74 }
					: phase === "dawn"
						? { x: 50, y: 54, r: 10, glowY: 58, glowR: 66 }
						: null;

	return (
		<svg
			className={className}
			viewBox="0 0 260 92"
			preserveAspectRatio="xMidYMax slice"
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style={{ stopColor: "var(--zenith-accent)", stopOpacity: phase === "night" ? 0.1 : 0.06 }} />
					<stop offset="1" style={{ stopColor: "var(--zenith-accent)", stopOpacity: phase === "noon" ? 0.2 : 0.32 }} />
				</linearGradient>
				<radialGradient id={glow}>
					<stop offset="0" style={{ stopColor: "var(--zenith-accent)", stopOpacity: 0.55 }} />
					<stop offset="1" style={{ stopColor: "var(--zenith-accent)", stopOpacity: 0 }} />
				</radialGradient>
				<mask id={mask}>
					<rect x="-30" width="260" height="92" fill="#fff" />
					<g fill="#000">
						{/* main hall arches */}
						<path d="M92 78V67a8 8 0 0 1 16 0V78Z" />
						<path d="M70 78V69a4.5 4.5 0 0 1 9 0V78Z" />
						<path d="M121 78V69a4.5 4.5 0 0 1 9 0V78Z" />
						{/* wing windows */}
						<path d="M46 78V71a3 3 0 0 1 6 0V78Z" />
						<path d="M148 78V71a3 3 0 0 1 6 0V78Z" />
						{/* minaret slits */}
						<rect x="25" y="46" width="2" height="9" rx="1" />
						<rect x="25" y="60" width="2" height="9" rx="1" />
						<rect x="173" y="46" width="2" height="9" rx="1" />
						<rect x="173" y="60" width="2" height="9" rx="1" />
					</g>
				</mask>
			</defs>

			<rect width="260" height="92" fill={`url(#${sky})`} />

			<g transform="translate(30 0)">
			{body && <circle cx={body.x} cy={body.glowY} r={body.glowR} fill={`url(#${glow})`} />}
			{body && (
				<circle
					cx={body.x}
					cy={body.y}
					r={body.r}
					fill={phase === "sunset" || phase === "dawn" ? "var(--zenith-accent)" : "currentColor"}
					fillOpacity={phase === "sunset" || phase === "dawn" ? 1 : 0.92}
				/>
			)}

			{phase === "night" && (
				<>
					<circle cx="150" cy="30" r="30" fill={`url(#${glow})`} />
					<path d={crescentPath(11, 8.8, 4.6)} transform="translate(145 28) rotate(-22)" fill="currentColor" fillOpacity="0.95" />
				</>
			)}

			{showStars && (
				<g fill="currentColor" fillOpacity={phase === "night" ? 0.8 : 0.45}>
					{SPARKLES.map(([x, y, r]) => (
						<polygon key={`${x}-${y}`} points={starPoints(x, y, r * 1.9, r * 0.55, 4)} />
					))}
				</g>
			)}

			<g mask={`url(#${mask})`} fill="currentColor" fillOpacity="0.86">
				{/* ground and halls */}
				<rect x="-30" y="78" width="260" height="14" fillOpacity="0.7" />
				<rect x="62" y="57" width="76" height="22" />
				<rect x="38" y="66" width="26" height="13" />
				<rect x="136" y="66" width="26" height="13" />
				{/* wing domes */}
				<path d="M38 66c0-9 26-9 26 0Z" />
				<path d="M136 66c0-9 26-9 26 0Z" />
				{/* main dome, finial and crescent */}
				<path d="M68 57c0-17 12-27 32-33 20 6 32 16 32 33Z" />
				<rect x="99.2" y="14" width="1.6" height="11" />
				<path d={crescentPath(4.2, 3.4, 1.7)} transform="translate(100 12) rotate(-90)" />
				{/* minarets */}
				<rect x="21.5" y="32" width="9" height="47" />
				<rect x="18.5" y="43" width="15" height="3.2" rx="1" />
				<path d="M20.5 32 26 15l5.5 17Z" />
				<rect x="25.4" y="7" width="1.2" height="9" />
				<circle cx="26" cy="7" r="1.6" />
				<rect x="169.5" y="32" width="9" height="47" />
				<rect x="166.5" y="43" width="15" height="3.2" rx="1" />
				<path d="M168.5 32 174 15l5.5 17Z" />
				<rect x="173.4" y="7" width="1.2" height="9" />
				<circle cx="174" cy="7" r="1.6" />
			</g>
			</g>
		</svg>
	);
};
