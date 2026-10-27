import React from "react";

interface ZenithLogoProps {
	size?: number;
	className?: string;
	color?: string;
}

/**
 * Official Zenith logo mark for the radial menu center hub and previews.
 * Vector paths extracted from zenith-white-no-bg-nosmile.svg.
 */
export const ZenithLogo: React.FC<ZenithLogoProps> = ({
	size = 512,
	className = "",
	color = "#F4F2ED"
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="430 60 120 120"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M543.74 120.00 L528.00 135.74 L528.00 158.00 L505.74 158.00 L490.00 173.74 L474.26 158.00 L452.00 158.00 L452.00 135.74 L436.26 120.00 L452.00 104.26 L452.00 82.00 L474.26 82.00 L490.00 66.26 L505.74 82.00 L528.00 82.00 L528.00 104.26 Z M467 114 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 Z M499 114 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 Z"
				fill={color}
				fillRule="evenodd"
			/>
			<path
				d="M543.74 120.00 L528.00 135.74 L528.00 158.00 L505.74 158.00 L490.00 173.74 L474.26 158.00 L452.00 158.00 L452.00 135.74 L436.26 120.00 L452.00 104.26 L452.00 82.00 L474.26 82.00 L490.00 66.26 L505.74 82.00 L528.00 82.00 L528.00 104.26 Z"
				fill="none"
				stroke={color}
				strokeWidth={6}
				strokeLinejoin="round"
			/>
		</svg>
	);
};
