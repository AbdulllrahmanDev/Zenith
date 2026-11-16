import { createContext, useCallback, useContext, useEffect, useState, createElement, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { en, type TranslationDict } from "./en";
import { ar } from "./ar";

export type AppLanguage = "en" | "ar";

export const LANGUAGE_SETTING_KEY = "zenith-language";
export const ALT_LANGUAGE_SETTING_KEY = "bloom-language";

export function normalizeLanguage(value: unknown): AppLanguage {
	return value === "ar" ? "ar" : "en";
}

export function getStoredLanguage(): AppLanguage {
	try {
		const raw =
			localStorage.getItem(LANGUAGE_SETTING_KEY) ??
			localStorage.getItem(ALT_LANGUAGE_SETTING_KEY);
		return normalizeLanguage(raw);
	} catch {
		return "en";
	}
}

export function getTranslations(lang: AppLanguage): TranslationDict {
	return lang === "ar" ? ar : en;
}

export function useAppLanguage() {
	const [lang, setLangState] = useState<AppLanguage>(() => getStoredLanguage());

	useEffect(() => {
		let cancelled = false;
		invoke<Record<string, unknown>>("load_settings")
			.then((settings) => {
				if (cancelled || !settings || typeof settings !== "object") return;
				const next = normalizeLanguage(
					settings[LANGUAGE_SETTING_KEY] ?? settings[ALT_LANGUAGE_SETTING_KEY]
				);
				try {
					localStorage.setItem(LANGUAGE_SETTING_KEY, next);
				} catch {}
				setLangState(next);
			})
			.catch(() => {});

		const onStorage = (e: StorageEvent) => {
			if (e.key === LANGUAGE_SETTING_KEY || e.key === ALT_LANGUAGE_SETTING_KEY) {
				setLangState(normalizeLanguage(e.newValue));
			}
		};
		window.addEventListener("storage", onStorage);
		return () => {
			cancelled = true;
			window.removeEventListener("storage", onStorage);
		};
	}, []);

	useSettingsSync({
		[LANGUAGE_SETTING_KEY]: (val) => {
			const next = normalizeLanguage(val);
			try {
				localStorage.setItem(LANGUAGE_SETTING_KEY, next);
			} catch {}
			setLangState(next);
		}
	});

	const setLanguage = useCallback((next: AppLanguage) => {
		const normalized = normalizeLanguage(next);
		try {
			localStorage.setItem(LANGUAGE_SETTING_KEY, normalized);
		} catch {}
		setLangState(normalized);
		invoke("save_setting", { key: LANGUAGE_SETTING_KEY, value: normalized }).catch(console.error);
	}, []);

	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	const isRtl = lang === "ar";
	const dir: "ltr" | "rtl" = isRtl ? "rtl" : "ltr";
	const t = getTranslations(lang);

	return { lang, isRtl, dir, t, setLanguage };
}

interface LanguageContextValue {
	lang: AppLanguage;
	isRtl: boolean;
	dir: "ltr" | "rtl";
	t: TranslationDict;
	setLanguage: (lang: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
	lang: "en",
	isRtl: false,
	dir: "ltr",
	t: en,
	setLanguage: () => {}
});

export function LanguageProvider({ children }: { children: ReactNode }) {
	const value = useAppLanguage();
	return createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n(): LanguageContextValue {
	return useContext(LanguageContext);
}

export { en, ar };
export type { TranslationDict };
