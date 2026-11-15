import { getStoredLanguage, getTranslations, type AppLanguage } from "./i18n";

/** Mirrors `BatteryDetails` in src-tauri/src/battery.rs. */
export interface BatteryDetails {
	present: boolean;
	percent: number | null;
	plugged_in: boolean;
	charging: boolean;
	seconds_left: number | null;
	seconds_to_full: number | null;
	health_percent: number | null;
	power_mode: string | null;
}

/** Durations as the taskbar writes them: "3 hr 12 min", "45 min", "1 hr". */
export function formatDuration(seconds: number, lang: AppLanguage = getStoredLanguage()): string {
	const bt = getTranslations(lang).battery;
	const minutes = Math.max(1, Math.round(seconds / 60));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return bt.durationMin(rest);
	return rest === 0 ? bt.durationHr(hours) : bt.durationHrMin(hours, rest);
}

/**
 * The battery widget's tooltip: the taskbar battery icon's status line, then
 * what Windows' battery settings add. Until the details arrive (or on a
 * device that reports none), the status line comes from the webview's own
 * level and charging state.
 */
export function batteryTooltip(
	details: BatteryDetails | null,
	fallback: { level: number; charging: boolean },
	energySaver: boolean,
	lang: AppLanguage = getStoredLanguage()
): string {
	const bt = getTranslations(lang).battery;
	const percent = details?.percent ?? fallback.level;
	const charging = details ? details.charging : fallback.charging;
	const pluggedIn = details ? details.plugged_in : fallback.charging;
	const lines: string[] = [];

	if (pluggedIn && percent >= 100 && !charging) {
		lines.push(bt.fullyChargedPct(percent));
	} else if (pluggedIn) {
		lines.push(bt.availablePluggedIn(percent, charging));
	} else if (details?.seconds_left) {
		lines.push(bt.remainingWithDuration(formatDuration(details.seconds_left, lang), percent));
	} else {
		lines.push(bt.remainingPct(percent));
	}

	if (charging && details?.seconds_to_full) {
		lines.push(bt.untilFull(formatDuration(details.seconds_to_full, lang)));
	}
	if (details?.power_mode) {
		const modeLabel = bt.powerModes[details.power_mode] ?? details.power_mode;
		lines.push(bt.powerMode(modeLabel));
	}
	if (energySaver) lines.push(bt.energySaverOn);
	if (details?.health_percent != null) {
		lines.push(bt.health(details.health_percent));
	}
	return lines.join("\n");
}
