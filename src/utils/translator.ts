import { invoke } from "@tauri-apps/api/core";

export type TranslatorProvider = "free" | "gemini" | "openai" | "groq" | "custom";
export type TranslatorTone = "natural" | "formal" | "casual" | "concise" | "technical";
export type TranslatorDisplayMode = "popup" | "notch";
export type TranslatorPopupPosition = "cursor" | "center";

export interface TranslatorTriggerPayload {
	text: string;
	capturedSelection: boolean;
	cursorX: number;
	cursorY: number;
}

export interface TranslateResponse {
	translatedText: string;
	detectedSourceLang: string | null;
	providerUsed: string;
}

export interface TranslatorConfig {
	enabled: boolean;
	shortcut: string;
	displayMode: TranslatorDisplayMode;
	popupPosition: TranslatorPopupPosition;
	showInNotch: boolean;
	captureSelection: boolean;
	autoTranslate: boolean;
	autoCopy: boolean;
	sourceLang: string;
	targetLang: string;
	smartSwap: boolean;
	secondaryLang: string;
	provider: TranslatorProvider;
	apiKey: string;
	model: string;
	customEndpoint: string;
	tone: TranslatorTone;
	customPrompt: string;
}

export const TRANSLATOR_LANGUAGES = [
	"ar",
	"en",
	"fr",
	"es",
	"de",
	"it",
	"pt",
	"ru",
	"ja",
	"ko",
	"zh-CN",
	"tr",
	"hi",
	"nl",
	"pl",
	"uk",
	"id"
] as const;

export const DEFAULT_TRANSLATOR_MODELS: Record<TranslatorProvider, string> = {
	free: "",
	gemini: "gemini-2.5-flash",
	openai: "gpt-4o-mini",
	groq: "llama-3.3-70b-versatile",
	custom: "gpt-4o-mini"
};

export function normalizeTranslatorProvider(v: unknown): TranslatorProvider {
	return v === "gemini" || v === "openai" || v === "groq" || v === "custom" ? v : "free";
}

export function normalizeTranslatorTone(v: unknown): TranslatorTone {
	return v === "formal" || v === "casual" || v === "concise" || v === "technical" ? v : "natural";
}

export function readTranslatorConfigFromStorage(): TranslatorConfig {
	return {
		enabled: localStorage.getItem("zenith-translator-enabled") !== "false",
		shortcut: localStorage.getItem("zenith-translator-shortcut") || "Ctrl+Alt+T",
		displayMode: localStorage.getItem("zenith-translator-display-mode") === "notch" ? "notch" : "popup",
		popupPosition: localStorage.getItem("zenith-translator-popup-position") === "center" ? "center" : "cursor",
		showInNotch: localStorage.getItem("zenith-translator-show-in-notch") !== "false",
		captureSelection: localStorage.getItem("zenith-translator-capture-selection") !== "false",
		autoTranslate: localStorage.getItem("zenith-translator-auto-translate") !== "false",
		autoCopy: localStorage.getItem("zenith-translator-auto-copy") === "true",
		sourceLang: localStorage.getItem("zenith-translator-source-lang") || "auto",
		targetLang: localStorage.getItem("zenith-translator-target-lang") || "ar",
		smartSwap: localStorage.getItem("zenith-translator-smart-swap") !== "false",
		secondaryLang: localStorage.getItem("zenith-translator-secondary-lang") || "en",
		provider: normalizeTranslatorProvider(localStorage.getItem("zenith-translator-provider")),
		apiKey: localStorage.getItem("zenith-translator-api-key") || "",
		model: localStorage.getItem("zenith-translator-model") || "",
		customEndpoint: localStorage.getItem("zenith-translator-custom-endpoint") || "",
		tone: normalizeTranslatorTone(localStorage.getItem("zenith-translator-tone")),
		customPrompt: localStorage.getItem("zenith-translator-custom-prompt") || ""
	};
}

export function isRtlLanguage(code: string): boolean {
	return code === "ar";
}

/**
 * Lightweight Unicode script hint used locally for smart bidirectional target swapping.
 */
export function detectTextScriptHint(text: string): string | null {
	let arabic = 0;
	let cyrillic = 0;
	let cjk = 0;
	let kana = 0;
	let hangul = 0;
	let latin = 0;

	for (const ch of text) {
		const cp = ch.codePointAt(0) ?? 0;
		if (cp >= 0x0600 && cp <= 0x06ff) arabic++;
		else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
		else if (cp >= 0x3040 && cp <= 0x30ff) kana++;
		else if (cp >= 0xac00 && cp <= 0xd7af) hangul++;
		else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
		else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++;
	}

	const max = Math.max(arabic, cyrillic, cjk, kana, hangul, latin);
	if (max === 0) return null;
	if (arabic === max) return "ar";
	if (kana === max) return "ja";
	if (hangul === max) return "ko";
	if (cjk === max) return "zh-CN";
	if (cyrillic === max) return "ru";
	if (latin === max) return "en";
	return null;
}

export function resolveEffectiveTarget(
	text: string,
	sourceLang: string,
	targetLang: string,
	smartSwap: boolean,
	secondaryLang: string
): { effectiveTarget: string; swapped: boolean } {
	if (!smartSwap || sourceLang !== "auto" || !secondaryLang || secondaryLang === targetLang) {
		return { effectiveTarget: targetLang, swapped: false };
	}
	const hint = detectTextScriptHint(text);
	if (hint && hint === targetLang) {
		return { effectiveTarget: secondaryLang, swapped: true };
	}
	return { effectiveTarget: targetLang, swapped: false };
}

export function formatShortcutFromKeyEvent(e: KeyboardEvent): string | null {
	const key = e.key;
	if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
		return null;
	}

	const parts: string[] = [];
	if (e.ctrlKey) parts.push("Ctrl");
	if (e.altKey) parts.push("Alt");
	if (e.shiftKey) parts.push("Shift");
	if (e.metaKey) parts.push("Win");

	let primary = "";
	if (key === " ") primary = "Space";
	else if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) primary = key.toUpperCase();
	else if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) primary = key.toUpperCase();
	else if (
		[
			"Enter",
			"Tab",
			"Escape",
			"Backspace",
			"Delete",
			"Insert",
			"Home",
			"End",
			"PageUp",
			"PageDown",
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight"
		].includes(key)
	) {
		primary = key;
	} else if (/^Key([A-Z])$/.test(e.code)) {
		primary = e.code.slice(3);
	} else if (/^Digit([0-9])$/.test(e.code)) {
		primary = e.code.slice(5);
	} else {
		return null;
	}

	const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(primary);
	if (parts.length === 0 && !isFunctionKey) {
		return null;
	}

	parts.push(primary);
	return parts.join("+");
}

export async function runTranslation(
	text: string,
	config: Pick<
		TranslatorConfig,
		"sourceLang" | "targetLang" | "provider" | "apiKey" | "model" | "customEndpoint" | "tone" | "customPrompt"
	>,
	overrideSource?: string,
	overrideTarget?: string
): Promise<TranslateResponse> {
	return invoke<TranslateResponse>("translate_text", {
		req: {
			text,
			sourceLang: overrideSource ?? config.sourceLang,
			targetLang: overrideTarget ?? config.targetLang,
			provider: config.provider,
			apiKey: config.apiKey,
			model: config.model,
			customEndpoint: config.customEndpoint,
			tone: config.tone,
			customPrompt: config.customPrompt
		}
	});
}
