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
 * - `settings-changed` — emitted by save_setting (zenith keys, native values)
 * - `settings-external-changed` — emitted by file watcher for external edits (zenith keys, string values)
 *
 * Both events use the same zenith-prefixed keys (e.g. "zenith-dock-enabled").
 * Values may pass through String() conversion in the frontend, producing
 * "true"/"false" strings — the hook auto-converts these to booleans.
 *
 * Uses a ref for handlers so listeners are registered once (not re-registered
 * on every render when a new object literal is passed).
 *
 * @param handlers - Map of zenith-prefixed key -> setter
 * @param deps - Optional additional dependency array
 */
export interface UseSettingsSyncOptions {
	shouldApply?: (key: string, value: any, source: "local-event" | "external") => boolean;
}

export function useSettingsSync(
	handlers: Record<string, (value: any) => void>,
	deps?: React.DependencyList,
	options?: UseSettingsSyncOptions
) {
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		const unlistenSC = listen<{ key: string; value: any }>("settings-changed", (event) => {
			const { key, value } = event.payload;
			const handler = handlersRef.current[key];
			if (handler && value !== null && value !== undefined) {
				const converted = convertSettingValue(value);
				if (optionsRef.current?.shouldApply && !optionsRef.current.shouldApply(key, converted, "local-event")) {
					return;
				}
				handler(converted);
			}
		});

		const unlistenSEC = listen<{ key: string; value: any }>(
			"settings-external-changed",
			(event) => {
				const { key, value } = event.payload;

				if (key === "zenith-weather-lat" || key === "zenith-weather-lon") {
					localStorage.removeItem(key);
				} else if (value !== null) {
					localStorage.setItem(key, String(value));
				} else {
					localStorage.removeItem(key);
				}

				const handler = handlersRef.current[key];
				if (handler && value !== null && value !== undefined) {
					const converted = convertSettingValue(value);
					if (optionsRef.current?.shouldApply && !optionsRef.current.shouldApply(key, converted, "external")) {
						return;
					}
					handler(converted);
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