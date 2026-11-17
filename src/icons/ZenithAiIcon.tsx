import type { SVGProps } from "react";

type ZenithAiIconProps = SVGProps<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
};

/**
 * Zenith AI mark: the Zenith eight-point seal frame with "Ai" inside.
 * Monochrome (currentColor) so it inherits text color everywhere.
 * Drop-in compatible with lucide-react icon props (size, strokeWidth).
 */
export function ZenithAiIcon({ size = 24, strokeWidth = 1.7, ...rest }: ZenithAiIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			{/* Zenith 8-point geometric seal frame */}
			<path d="M22.75 12 L19.6 15.15 L19.6 19.6 L15.15 19.6 L12 22.75 L8.85 19.6 L4.4 19.6 L4.4 15.15 L1.25 12 L4.4 8.85 L4.4 4.4 L8.85 4.4 L12 1.25 L15.15 4.4 L19.6 4.4 L19.6 8.85 Z" />
			{/* 'A' */}
			<path d="M8.1 16 L10.6 8 L13.1 16" />
			<path d="M9.2 13.3 H12.0" />
			{/* 'i' */}
			<path d="M15.9 11 V16" />
			<path d="M15.9 8.1 h.01" />
		</svg>
	);
}
