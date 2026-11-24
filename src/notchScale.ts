/**
 * Automatic size factor for the notch on a display of the given logical
 * (DPI-independent) size. A 1920x1080 logical display gets the base size,
 * smaller displays shrink it and larger ones grow it, within limits.
 *
 * Must stay in sync with `notch_screen_factor` in `src-tauri/src/utils.rs`,
 * which sizes the notch window and its reserved strip with the same factor.
 */
export function notchScreenFactor(logicalWidth: number, logicalHeight: number): number {
	const BASE = 1.12;
	if (!(logicalWidth > 0 && logicalHeight > 0)) return BASE;
	const ratio = Math.min(logicalWidth / 1920, logicalHeight / 1080);
	const factor = BASE * Math.min(1.25, Math.max(0.85, Math.sqrt(ratio)));
	return Math.round(factor * 100) / 100;
}

/** The factor for the display the current window is on. */
export function currentNotchScreenFactor(): number {
	return notchScreenFactor(window.screen.width, window.screen.height);
}
