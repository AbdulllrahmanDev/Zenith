/**
 * Rovyl's radial scrim generator: a smoothstep radial pool across 9 stops
 * that dims the desktop behind the wheel without expensive full-screen DWM blur.
 */

const SCRIM_FLATTEN_FROM = 0.7;

export function radialScrimAlphas(backdropOpacity: number): { peak: number; floor: number } {
	const dim = Number.isFinite(backdropOpacity)
		? Math.min(1, Math.max(0, backdropOpacity))
		: 0.75;
	const peak = 0.22 + 0.78 * dim * dim;
	const flatten = Math.max(0, (dim - SCRIM_FLATTEN_FROM) / (1 - SCRIM_FLATTEN_FROM));
	return { peak, floor: peak * flatten * flatten };
}

export function radialScrimNeedsFullBleed(backdropOpacity: number): boolean {
	return radialScrimAlphas(backdropOpacity).floor > 0.008;
}

export function radialScrimGradient(
	position: { x: number; y: number },
	backdropOpacity: number,
	backdropRadius: number
): string {
	const { peak, floor } = radialScrimAlphas(backdropOpacity);
	if (floor >= peak) {
		const flat = `rgba(4,5,7,${peak.toFixed(3)})`;
		return `linear-gradient(${flat}, ${flat})`;
	}
	const scrimRadius = Math.round(backdropRadius * 2);
	const stops = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1]
		.map((t) => {
			const falloff = 1 - (3 * t * t - 2 * t * t * t);
			return `rgba(4,5,7,${(floor + (peak - floor) * falloff).toFixed(3)}) ${Math.round(t * scrimRadius)}px`;
		})
		.join(", ");
	return `radial-gradient(circle at ${Math.round(position.x)}px ${Math.round(position.y)}px, ${stops})`;
}
