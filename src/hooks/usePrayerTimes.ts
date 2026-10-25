import { useState, useEffect, useRef, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { useSettingsSync } from "./useSettingsSync";
import { PRAYER_NAMES_AR } from "../utils/prayerContent";
import {
	PRE_ALERT_MINUTES,
	buildTimingsUrl,
	cacheKeyFor,
	computePrayerState,
	dueAlerts,
	formatPrayerTime,
	parseTimingsResponse,
	rememberFired,
	resolveAlertPolicy,
	type AlertKind,
	type DueAlert,
	type HijriDateInfo,
	type Place,
	type PrayerKey,
	type PrayerTimesData
} from "../utils/prayerSchedule";

export type { PrayerKey, PrayerTimesData, HijriDateInfo } from "../utils/prayerSchedule";
export { PRAYER_NAMES_AR, PRAYER_REMINDERS } from "../utils/prayerContent";
export { formatPrayerTime } from "../utils/prayerSchedule";

export type PrayerError = "location" | "network" | "invalid";
export type BannerVariant = "athan" | "reminder";

const STORAGE_KEY_TIMINGS = "zenith-prayer-timings-cache";
const STORAGE_KEY_DATE = "zenith-prayer-date-cache";
const STORAGE_KEY_HIJRI = "zenith-prayer-hijri-cache";
const STORAGE_KEY_CACHE_KEY = "zenith-prayer-cache-key";
const STORAGE_KEY_PLACE = "zenith-prayer-resolved-location";
const STORAGE_KEY_FIRED = "zenith-prayer-fired";

// Banner and audio state is shared between the notch windows with these events.
// Only the owner window (the main notch) schedules alerts and plays audio.
const EVT_BANNER = "zenith-athan-banner";
const EVT_STATE = "zenith-athan-state";
const EVT_STOP = "zenith-athan-stop";
const EVT_TEST_ATHAN = "zenith-test-athan";
const EVT_TEST_NOTIFICATION = "zenith-test-notification";

const REMINDER_VISIBLE_MS = 20_000;
const RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

interface BannerPayload {
	key: PrayerKey;
	name: string;
	variant: BannerVariant;
}

interface TestPayload {
	prayerKey?: PrayerKey;
}

// One audio element for the whole window so it can be stopped from anywhere.
let activeAthanAudio: HTMLAudioElement | null = null;

const readBool = (key: string, fallback: boolean): boolean => {
	const value = localStorage.getItem(key);
	return value === null ? fallback : value !== "false";
};

function readJson<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

async function fetchJson(url: string): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}

/** Manual place when set, otherwise the IP location, otherwise the last one that worked. */
async function resolvePlace(
	mode: "auto" | "manual",
	city: string,
	country: string
): Promise<Place | null> {
	if (mode === "manual" && city.trim()) {
		return { city: city.trim(), country: country.trim() };
	}
	try {
		const ip = (await fetchJson("https://ipapi.co/json/")) as { city?: string; country_name?: string };
		if (ip.city) {
			const place = { city: ip.city, country: ip.country_name || "" };
			localStorage.setItem(STORAGE_KEY_PLACE, JSON.stringify(place));
			return place;
		}
	} catch {
		// Fall through to the last known place.
	}
	return readJson<Place>(STORAGE_KEY_PLACE);
}

async function showNativeNotification(title: string, body: string): Promise<void> {
	if (!("Notification" in window)) return;
	let permission = Notification.permission;
	if (permission === "default") {
		permission = await Notification.requestPermission();
	}
	if (permission === "granted") {
		new Notification(title, { body, icon: "/zenith-white-no-bg-nosmile.svg" });
	}
}

export interface UsePrayerTimesOptions {
	/**
	 * True in exactly one window. The owner fetches times, schedules alerts and plays
	 * the athan. Other windows follow its state through events and the shared cache.
	 */
	owner?: boolean;
}

export function usePrayerTimes({ owner = false }: UsePrayerTimesOptions = {}) {
	const [enabled, setEnabled] = useState<boolean>(() => readBool("zenith-prayer-enabled", true));
	const [locationMode, setLocationMode] = useState<"auto" | "manual">(() =>
		localStorage.getItem("zenith-prayer-location-mode") === "manual" ? "manual" : "auto"
	);
	const [city, setCity] = useState<string>(() => localStorage.getItem("zenith-prayer-city") || "");
	const [country, setCountry] = useState<string>(() => localStorage.getItem("zenith-prayer-country") || "");
	const [method, setMethod] = useState<string>(() => localStorage.getItem("zenith-prayer-method") || "5");
	const [timeOffset, setTimeOffset] = useState<number>(() => {
		const value = localStorage.getItem("zenith-prayer-time-offset");
		return value ? parseInt(value, 10) || 0 : 0;
	});
	const [alertType, setAlertType] = useState<string>(
		() => localStorage.getItem("zenith-prayer-alert-type") || "sound_notification"
	);
	const [preAlertEnabled, setPreAlertEnabled] = useState<boolean>(() => readBool("zenith-prayer-pre-alert", true));
	const [timeFormat24h, setTimeFormat24h] = useState<boolean>(
		() => localStorage.getItem("zenith-time-format-24h") === "true"
	);

	const [timings, setTimings] = useState<PrayerTimesData | null>(() => readJson(STORAGE_KEY_TIMINGS));
	const [hijri, setHijri] = useState<HijriDateInfo | null>(() => readJson(STORAGE_KEY_HIJRI));
	const [cachedKey, setCachedKey] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY_CACHE_KEY));
	const [today, setToday] = useState<Date>(() => new Date());

	const [activePrayer, setActivePrayer] = useState<PrayerKey | null>(null);
	const [nextPrayerKey, setNextPrayerKey] = useState<PrayerKey | null>(null);
	const [isPlayingAthan, setIsPlayingAthan] = useState(false);
	const [athanPrayerName, setAthanPrayerName] = useState<string | null>(null);
	const [athanPrayerKey, setAthanPrayerKey] = useState<PrayerKey | null>(null);
	const [athanVariant, setAthanVariant] = useState<BannerVariant>("athan");
	const [athanBannerVisible, setAthanBannerVisible] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<PrayerError | null>(null);

	const lastTickRef = useRef<Date | null>(null);
	const firedRef = useRef<string[]>(readJson<string[]>(STORAGE_KEY_FIRED) ?? []);

	const wantedKey = cacheKeyFor({ date: today, locationMode, city, country, method });
	// Times from another day, place or method are shown only until fresh ones arrive.
	const stale = timings !== null && cachedKey !== wantedKey;

	// --- audio -------------------------------------------------------------

	const setPlaying = useCallback(
		(playing: boolean) => {
			setIsPlayingAthan(playing);
			if (owner) emit(EVT_STATE, { playing }).catch(() => {});
		},
		[owner]
	);

	const stopAudio = useCallback(() => {
		if (activeAthanAudio) {
			activeAthanAudio.pause();
			activeAthanAudio.currentTime = 0;
			activeAthanAudio = null;
		}
		setPlaying(false);
	}, [setPlaying]);

	const startAthanAudio = useCallback(() => {
		stopAudio();
		try {
			const audio = new Audio("/sounds/athan.mp3");
			audio.volume = 0.85;
			activeAthanAudio = audio;
			setPlaying(true);
			audio.onended = () => {
				activeAthanAudio = null;
				setPlaying(false);
			};
			audio.play().catch((err) => {
				console.warn("Athan audio did not start:", err);
				activeAthanAudio = null;
				setPlaying(false);
			});
		} catch (err) {
			console.error("Athan audio error:", err);
			setPlaying(false);
		}
	}, [stopAudio, setPlaying]);

	/** Stops the athan wherever it is playing. */
	const stopAthan = useCallback(() => {
		if (owner) stopAudio();
		emit(EVT_STOP).catch(() => {});
	}, [owner, stopAudio]);

	// --- alerts ------------------------------------------------------------

	const deliver = useCallback(
		(kind: AlertKind, key: PrayerKey) => {
			const policy = resolveAlertPolicy({
				alertType: localStorage.getItem("zenith-prayer-alert-type") || "sound_notification",
				notificationsEnabled: readBool("zenith-notifications-enabled", true),
				silent: localStorage.getItem("zenith-notifications-silent") === "true",
				notchEnabled: readBool("zenith-notifications-notch-enabled", true)
			});
			if (!policy.show) return;

			const name = PRAYER_NAMES_AR[key];
			if (policy.channel === "notch") {
				const payload: BannerPayload = { key, name, variant: kind === "exact" ? "athan" : "reminder" };
				emit(EVT_BANNER, payload).catch(() => {});
			} else if (kind === "exact") {
				showNativeNotification(`حان الآن موعد صلاة ${name}`, `الله أكبر - حان الآن وقت أذان صلاة ${name}`).catch(
					() => {}
				);
			} else {
				const at = timings ? formatPrayerTime(timings[key], timeFormat24h, timeOffset) : "";
				showNativeNotification(
					`اقتربت صلاة ${name}`,
					`متبقي ${PRE_ALERT_MINUTES} دقيقة على موعد أذان ${name}${at ? ` (${at})` : ""}`
				).catch(() => {});
			}

			if (kind === "exact" && policy.sound) startAthanAudio();
		},
		[timings, timeFormat24h, timeOffset, startAthanAudio]
	);

	/** Each alert is delivered once per day, even across restarts and remounts. */
	const deliverOnce = useCallback(
		(alert: DueAlert) => {
			if (firedRef.current.includes(alert.id)) return;
			firedRef.current = rememberFired(firedRef.current, alert.id);
			localStorage.setItem(STORAGE_KEY_FIRED, JSON.stringify(firedRef.current));
			deliver(alert.kind, alert.key);
		},
		[deliver]
	);

	// --- fetching (owner only) --------------------------------------------

	const fetchTimings = useCallback(async () => {
		if (!enabled) return;
		setLoading(true);
		setError(null);
		const requestKey = cacheKeyFor({ date: new Date(), locationMode, city, country, method });
		try {
			const place = await resolvePlace(locationMode, city, country);
			if (!place) {
				setError("location");
				return;
			}
			const parsed = parseTimingsResponse(await fetchJson(buildTimingsUrl(place, method)));
			if (!parsed) {
				setError("invalid");
				return;
			}
			setTimings(parsed.timings);
			setHijri(parsed.hijri);
			setCachedKey(requestKey);
			localStorage.setItem(STORAGE_KEY_TIMINGS, JSON.stringify(parsed.timings));
			localStorage.setItem(STORAGE_KEY_DATE, new Date().toDateString());
			localStorage.setItem(STORAGE_KEY_CACHE_KEY, requestKey);
			if (parsed.hijri) localStorage.setItem(STORAGE_KEY_HIJRI, JSON.stringify(parsed.hijri));
		} catch (err) {
			console.error("Prayer times request failed:", err);
			setError("network");
		} finally {
			setLoading(false);
		}
	}, [enabled, locationMode, city, country, method]);

	// Fetch when there is nothing cached for this day, place and method.
	useEffect(() => {
		if (!owner || !enabled) return;
		if (timings && cachedKey === wantedKey) return;
		void fetchTimings();
	}, [owner, enabled, timings, cachedKey, wantedKey, fetchTimings]);

	// Try again later after a failure.
	useEffect(() => {
		if (!owner || !error) return;
		const timer = setTimeout(() => void fetchTimings(), RETRY_AFTER_ERROR_MS);
		return () => clearTimeout(timer);
	}, [owner, error, fetchTimings]);

	// --- settings ----------------------------------------------------------

	useSettingsSync({
		"zenith-prayer-enabled": (val) => setEnabled(val !== false && val !== "false"),
		"zenith-prayer-location-mode": (val) => setLocationMode(val === "manual" ? "manual" : "auto"),
		"zenith-prayer-city": (val) => setCity(typeof val === "string" ? val : ""),
		"zenith-prayer-country": (val) => setCountry(typeof val === "string" ? val : ""),
		"zenith-prayer-method": (val) => setMethod(typeof val === "string" ? val : "5"),
		"zenith-prayer-time-offset": (val) => setTimeOffset(typeof val === "number" ? val : parseInt(val, 10) || 0),
		"zenith-prayer-alert-type": (val) => setAlertType(typeof val === "string" ? val : "sound_notification"),
		"zenith-prayer-pre-alert": (val) => setPreAlertEnabled(val !== false && val !== "false"),
		"zenith-time-format-24h": (val) => setTimeFormat24h(val === true || val === "true")
	});

	// Changes made in another window, including fresh times fetched by the owner.
	useEffect(() => {
		const handler = () => {
			setEnabled(readBool("zenith-prayer-enabled", true));
			setLocationMode(localStorage.getItem("zenith-prayer-location-mode") === "manual" ? "manual" : "auto");
			setCity(localStorage.getItem("zenith-prayer-city") || "");
			setCountry(localStorage.getItem("zenith-prayer-country") || "");
			setMethod(localStorage.getItem("zenith-prayer-method") || "5");
			const offset = localStorage.getItem("zenith-prayer-time-offset");
			setTimeOffset(offset ? parseInt(offset, 10) || 0 : 0);
			setAlertType(localStorage.getItem("zenith-prayer-alert-type") || "sound_notification");
			setPreAlertEnabled(readBool("zenith-prayer-pre-alert", true));
			setTimeFormat24h(localStorage.getItem("zenith-time-format-24h") === "true");
			if (!owner) {
				setTimings(readJson(STORAGE_KEY_TIMINGS));
				setHijri(readJson(STORAGE_KEY_HIJRI));
				setCachedKey(localStorage.getItem(STORAGE_KEY_CACHE_KEY));
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, [owner]);

	// --- clock -------------------------------------------------------------

	// The owner checks alerts every second. State only changes when the prayer
	// changes, so this does not re-render the app each second.
	useEffect(() => {
		if (!timings) {
			setActivePrayer(null);
			setNextPrayerKey(null);
			return;
		}
		const tick = () => {
			const now = new Date();
			setToday((prev) => (prev.toDateString() === now.toDateString() ? prev : now));

			const state = computePrayerState(now, timings, timeOffset);
			setActivePrayer(state?.active ?? null);
			setNextPrayerKey(state?.next ?? null);

			const previous = lastTickRef.current;
			lastTickRef.current = now;
			if (owner && enabled && previous) {
				for (const alert of dueAlerts(previous, now, timings, timeOffset, preAlertEnabled)) {
					deliverOnce(alert);
				}
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [timings, timeOffset, preAlertEnabled, owner, enabled, deliverOnce]);

	// --- events ------------------------------------------------------------

	// Every window shows the banner and the playing state the owner announces.
	useEffect(() => {
		let hideTimer: ReturnType<typeof setTimeout> | undefined;
		const subscriptions = [
			listen<BannerPayload>(EVT_BANNER, (event) => {
				const { key, name, variant } = event.payload;
				setAthanPrayerKey(key);
				setAthanPrayerName(name);
				setAthanVariant(variant);
				setAthanBannerVisible(true);
				clearTimeout(hideTimer);
				if (variant === "reminder") {
					hideTimer = setTimeout(() => setAthanBannerVisible(false), REMINDER_VISIBLE_MS);
				}
			}),
			listen<{ playing: boolean }>(EVT_STATE, (event) => setIsPlayingAthan(event.payload.playing))
		];
		return () => {
			clearTimeout(hideTimer);
			subscriptions.forEach((s) => s.then((unlisten) => unlisten()).catch(() => {}));
		};
	}, []);

	// Only the owner reacts to stop and test requests, so nothing plays twice.
	useEffect(() => {
		if (!owner) return;
		const subscriptions = [
			listen(EVT_STOP, () => stopAudio()),
			listen<TestPayload>(EVT_TEST_ATHAN, (event) => deliver("exact", event.payload?.prayerKey || "Asr")),
			listen<TestPayload>(EVT_TEST_NOTIFICATION, (event) => deliver("pre", event.payload?.prayerKey || "Asr"))
		];
		return () => {
			subscriptions.forEach((s) => s.then((unlisten) => unlisten()).catch(() => {}));
		};
	}, [owner, stopAudio, deliver]);

	return {
		enabled,
		locationMode,
		city,
		country,
		method,
		timeOffset,
		alertType,
		preAlertEnabled,
		timeFormat24h,
		timings,
		hijri,
		activePrayer,
		nextPrayerKey,
		isPlayingAthan,
		athanPrayerName,
		athanPrayerKey,
		athanVariant,
		athanBannerVisible,
		setAthanBannerVisible,
		loading,
		error,
		stale,
		stopAthan,
		fetchTimings
	};
}

export type PrayerTimesState = ReturnType<typeof usePrayerTimes>;

/** Settings window: ask the owner to play the full athan alert. */
export function triggerTestAthan(prayerKey: PrayerKey = "Asr") {
	emit(EVT_TEST_ATHAN, { prayerKey } satisfies TestPayload).catch(() => {});
}

/** Settings window: ask the owner to show the 15-minute reminder (no sound). */
export function triggerTestNotification(prayerKey: PrayerKey = "Asr") {
	emit(EVT_TEST_NOTIFICATION, { prayerKey } satisfies TestPayload).catch(() => {});
}