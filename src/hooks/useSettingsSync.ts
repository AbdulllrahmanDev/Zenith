import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

function convertSettingValue(value: any): any {
	if (value === "true") return true;
	if (value === "false") return false;
	if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value)))
		return Number(value);
	return value;
}

/**
 * Centralized settings sync hook. Listens to:
 * - `settings-changed` — emitted by save_setting (bloom keys, native values)
 * - `settings-external-changed` — emitted by file watcher for external edits (bloom keys, string values)
 *
 * Both events use the same bloom-prefixed keys (e.g. "bloom-dock-enabled").
 * Values may pass through String() conversion in the frontend, producing
 * "true"/"false" strings — the hook auto-converts these to booleans.
 *
 * Uses a ref for handlers so listeners are registered once (not re-registered
 * on every render when a new object literal is passed).
 *
 * @param handlers - Map of bloom-prefixed key → setter
 * @param deps - Optional additional dependency array
 */
function getAlternateKey(key: string): string | null {
	if (key.startsWith("zenith-")) return "bloom-" + key.slice("zenith-".length);
	if (key.startsWith("bloom-")) return "zenith-" + key.slice("bloom-".length);
	return null;
}

export function useSettingsSync(
	handlers: Record<string, (value: any) => void>,
	deps?: React.DependencyList
) {
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		const resolveHandler = (key: string) => {
			if (handlersRef.current[key]) return handlersRef.current[key];
			const alt = getAlternateKey(key);
			return alt ? handlersRef.current[alt] : undefined;
		};

		const unlistenSC = listen<{ key: string; value: any }>("settings-changed", (event) => {
			const { key, value } = event.payload;
			const handler = resolveHandler(key);
			if (handler && value !== null && value !== undefined) {
				handler(convertSettingValue(value));
			}
		});

		const unlistenSEC = listen<{ key: string; value: any }>(
			"settings-external-changed",
			(event) => {
				const { key, value } = event.payload;
				const alt = getAlternateKey(key);

				if (
					key === "bloom-weather-lat" ||
					key === "bloom-weather-lon" ||
					key === "zenith-weather-lat" ||
					key === "zenith-weather-lon"
				) {
					localStorage.removeItem(key);
					if (alt) localStorage.removeItem(alt);
				} else if (value !== null) {
					localStorage.setItem(key, String(value));
					if (alt) localStorage.setItem(alt, String(value));
				} else {
					localStorage.removeItem(key);
					if (alt) localStorage.removeItem(alt);
				}

				const handler = resolveHandler(key);
				if (handler && value !== null && value !== undefined) {
					handler(convertSettingValue(value));
				}
			}
		);

		return () => {
			unlistenSC.then((fn) => fn());
			unlistenSEC.then((fn) => fn());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps ?? []);
}
