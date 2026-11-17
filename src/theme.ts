import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { reloadIfMirrorWasStale } from "./hooks/settingsMirror";

// Convert a hex color string to rgba with a specified alpha
function hexToRgba(hex: string, alpha: number): string {
	hex = hex.replace("#", "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}
	const r = parseInt(hex.substring(0, 2), 16) || 0;
	const g = parseInt(hex.substring(2, 4), 16) || 0;
	const b = parseInt(hex.substring(4, 6), 16) || 0;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface HSL {
	h: number;
	s: number;
	l: number;
}

// Convert Hex to HSL
export function hexToHsl(hex: string): HSL {
	hex = hex.replace("#", "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}
	const r = (parseInt(hex.substring(0, 2), 16) || 0) / 255;
	const g = (parseInt(hex.substring(2, 4), 16) || 0) / 255;
	const b = (parseInt(hex.substring(4, 6), 16) || 0) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}

	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Convert HSL back to Hex color string
function hslToHex(h: number, s: number, l: number): string {
	s /= 100;
	l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0,
		g = 0,
		b = 0;

	if (0 <= h && h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (60 <= h && h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (120 <= h && h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (180 <= h && h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (240 <= h && h < 300) {
		r = x;
		g = 0;
		b = c;
	} else if (300 <= h && h < 360) {
		r = c;
		g = 0;
		b = x;
	}

	const toHex = (val: number) => {
		const hexVal = Math.round((val + m) * 255).toString(16);
		return hexVal.length === 1 ? "0" + hexVal : hexVal;
	};

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function applyTheme(
	mode: string,
	customColor: string,
	opacity?: number,
	saturation?: number,
	brightness?: number
) {
	const root = document.documentElement;

	if (opacity === undefined || opacity === null) {
		const cachedOpacity = localStorage.getItem("zenith-theme-opacity");
		opacity = cachedOpacity !== null ? parseFloat(cachedOpacity) : 0.8;
	}

	if (saturation === undefined || saturation === null) {
		const cachedSaturation = localStorage.getItem("zenith-theme-saturation");
		saturation = cachedSaturation !== null ? parseFloat(cachedSaturation) : 0.5;
	}

	if (brightness === undefined || brightness === null) {
		const cachedBrightness = localStorage.getItem("zenith-theme-brightness");
		brightness = cachedBrightness !== null ? parseFloat(cachedBrightness) : 0.15;
	}

	const op = opacity;
	const opExpanded = Math.min(1.0, opacity + 0.12);

	const setVar = (key: string, val: string) => {
		root.style.setProperty(`--zenith-${key}`, val);
		root.style.setProperty(`--zenith-${key}`, val);
	};

	if (mode === "light") {
		setVar("bg", `rgba(255, 255, 255, ${op})`);
		setVar("bg-expanded", `rgba(245, 245, 247, ${opExpanded})`);
		setVar("text", "#1c1c1e");
		setVar("text-muted", "rgba(28, 28, 30, 0.65)");
		setVar("border", "rgba(0, 0, 0, 0.12)");
		setVar("group-bg", "rgba(0, 0, 0, 0.04)");
		setVar("accent", "#007aff");
		setVar("bg-solid", "#ffffff");
		setVar("scrollbar-thumb", "rgba(0, 0, 0, 0.15)");
		root.classList.add("light-mode");
		root.classList.remove("dark-mode");
		root.classList.add("theme-light");
		root.classList.remove("theme-dark", "theme-custom", "theme-adaptive");
	} else if (mode === "custom") {
		const hsl = hexToHsl(customColor);
		hsl.s = saturation * 100;
		hsl.l = brightness * 100;
		const finalBgColor = hslToHex(hsl.h, hsl.s, hsl.l);
		const isLight = brightness > 0.55;

		setVar("bg", hexToRgba(finalBgColor, op));
		setVar("bg-expanded", hexToRgba(finalBgColor, opExpanded));
		setVar("text", isLight ? "#1c1c1e" : "#ffffff");
		setVar("text-muted", isLight ? "rgba(28, 28, 30, 0.65)" : "rgba(255, 255, 255, 0.65)");
		setVar("border", isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)");
		setVar("group-bg", isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)");
		setVar("accent", customColor);
		setVar("bg-solid", isLight ? "#ffffff" : "#111113");
		setVar("scrollbar-thumb", isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)");
		root.classList.add("theme-custom");
		root.classList.remove("theme-light", "theme-dark", "theme-adaptive");
		if (isLight) {
			root.classList.add("light-mode");
			root.classList.remove("dark-mode");
		} else {
			root.classList.add("dark-mode");
			root.classList.remove("light-mode");
		}
	} else if (mode === "adaptive") {
		try {
			const accentHex = await invoke<string>("get_system_accent_color");
			const hsl = hexToHsl(accentHex);
			hsl.s = saturation * 100;
			hsl.l = brightness * 100;
			const finalBgColor = hslToHex(hsl.h, hsl.s, hsl.l);
			const isLight = brightness > 0.55;

			setVar("bg", hexToRgba(finalBgColor, op));
			setVar("bg-expanded", hexToRgba(finalBgColor, opExpanded));
			setVar("text", isLight ? "#1c1c1e" : "#ffffff");
			setVar("text-muted", isLight ? "rgba(28, 28, 30, 0.65)" : "rgba(255, 255, 255, 0.65)");
			setVar("border", isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)");
			setVar("group-bg", isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)");
			setVar("accent", accentHex);
			setVar("bg-solid", isLight ? "#ffffff" : "#111113");
			setVar("scrollbar-thumb", isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)");
			root.classList.add("theme-adaptive");
			root.classList.remove("theme-light", "theme-dark", "theme-custom");
			if (isLight) {
				root.classList.add("light-mode");
				root.classList.remove("dark-mode");
			} else {
				root.classList.add("dark-mode");
				root.classList.remove("light-mode");
			}
		} catch (e) {
			console.error("Failed to apply adaptive theme:", e);
			applyTheme("dark", customColor, op, saturation, brightness);
		}
	} else {
		// default/dark
		setVar("bg", `rgba(0, 0, 0, ${op})`);
		setVar("bg-expanded", `rgba(0, 0, 0, ${opExpanded})`);
		setVar("text", "#ffffff");
		setVar("text-muted", "rgba(255, 255, 255, 0.6)");
		setVar("border", "rgba(255, 255, 255, 0.1)");
		setVar("group-bg", "rgba(255, 255, 255, 0.04)");
		setVar("accent", "#007aff");
		setVar("bg-solid", "#111113");
		setVar("scrollbar-thumb", "rgba(255, 255, 255, 0.1)");
		root.classList.add("dark-mode");
		root.classList.remove("light-mode");
		root.classList.add("theme-dark");
		root.classList.remove("theme-light", "theme-custom", "theme-adaptive");
	}
}

export function initTheme() {
	const syncMode = localStorage.getItem("zenith-theme-mode") || "dark";
	const syncColor = localStorage.getItem("zenith-theme-color") || "#007aff";
	const syncOpacityVal = localStorage.getItem("zenith-theme-opacity");
	const syncOpacity = syncOpacityVal !== null ? parseFloat(syncOpacityVal) : 0.8;
	const syncSaturationVal = localStorage.getItem("zenith-theme-saturation");
	const syncSaturation = syncSaturationVal !== null ? parseFloat(syncSaturationVal) : 0.5;
	const syncBrightnessVal = localStorage.getItem("zenith-theme-brightness");
	const syncBrightness = syncBrightnessVal !== null ? parseFloat(syncBrightnessVal) : 0.15;

	// Fast synchronous draw using cached localStorage
	applyTheme(syncMode, syncColor, syncOpacity, syncSaturation, syncBrightness);

	// Sync settings.json in background to avoid flickers
	invoke<Record<string, any>>("load_settings")
		.then(async (settings) => {
			// Don't write a stale mirror value back while the window reloads.
			if (await reloadIfMirrorWasStale(settings)) return;
			const mode = settings["zenith-theme-mode"] ? String(settings["zenith-theme-mode"]) : syncMode;
			const color = settings["zenith-theme-color"]
				? String(settings["zenith-theme-color"])
				: syncColor;
			const opacityVal = settings["zenith-theme-opacity"]
				? parseFloat(String(settings["zenith-theme-opacity"]))
				: syncOpacity;
			const saturationVal = settings["zenith-theme-saturation"]
				? parseFloat(String(settings["zenith-theme-saturation"]))
				: syncSaturation;
			const brightnessVal = settings["zenith-theme-brightness"]
				? parseFloat(String(settings["zenith-theme-brightness"]))
				: syncBrightness;

			if (
				mode !== syncMode ||
				color !== syncColor ||
				opacityVal !== syncOpacity ||
				saturationVal !== syncSaturation ||
				brightnessVal !== syncBrightness
			) {
				localStorage.setItem("zenith-theme-mode", mode);
				localStorage.setItem("zenith-theme-color", color);
				localStorage.setItem("zenith-theme-opacity", String(opacityVal));
				localStorage.setItem("zenith-theme-saturation", String(saturationVal));
				localStorage.setItem("zenith-theme-brightness", String(brightnessVal));
				applyTheme(mode, color, opacityVal, saturationVal, brightnessVal);
			}
		})
		.catch(console.error);

	// Helper: read all theme values from localStorage and apply
	const applyThemeFromStorage = () => {
		const mode = localStorage.getItem("zenith-theme-mode") || "dark";
		const color = localStorage.getItem("zenith-theme-color") || "#007aff";
		const opacity = parseFloat(localStorage.getItem("zenith-theme-opacity") || "0.80");
		const saturation = parseFloat(localStorage.getItem("zenith-theme-saturation") || "0.50");
		const brightness = parseFloat(localStorage.getItem("zenith-theme-brightness") || "0.15");
		applyTheme(mode, color, opacity, saturation, brightness);
	};

	const zenithThemeKeys = [
		"zenith-theme-mode",
		"zenith-theme-color",
		"zenith-theme-opacity",
		"zenith-theme-saturation",
		"zenith-theme-brightness"
	];

	// Listen to setting changes broadcasted from settings window
	// (localStorage sync is handled by saveAndLocal in Settings.tsx; we just apply the theme)
	const settingsPromise = listen<{ key: string; value: any }>("settings-changed", (event) => {
		const { key } = event.payload;
		if (zenithThemeKeys.includes(key)) {
			applyThemeFromStorage();
		}
	});

	// Listen to system accent color updates in case of adaptive theme
	const accentPromise = listen<string>("system-accent-changed", (event) => {
		const currentMode = localStorage.getItem("zenith-theme-mode") || "dark";
		if (currentMode === "adaptive") {
			const opacity = parseFloat(localStorage.getItem("zenith-theme-opacity") || "0.80");
			const saturation = parseFloat(localStorage.getItem("zenith-theme-saturation") || "0.50");
			const brightness = parseFloat(localStorage.getItem("zenith-theme-brightness") || "0.15");
			applyTheme("adaptive", event.payload, opacity, saturation, brightness);
		}
	});

	// Listen to external edits (e.g. settings.json edited outside the app)
	// localStorage sync is handled by useSettingsSync hook; we just apply the theme
	const externalPromise = listen<{ key: string; value: any }>(
		"settings-external-changed",
		(event) => {
			const { key } = event.payload;
			if (zenithThemeKeys.includes(key)) {
				applyThemeFromStorage();
			}
		}
	);

	return () => {
		settingsPromise.then((f) => f());
		accentPromise.then((f) => f());
		externalPromise.then((f) => f());
	};
}
