import { useState, useEffect, useRef, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { useSettingsSync } from "./useSettingsSync";

export type PrayerKey = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

export interface PrayerTimesData {
	Fajr: string;
	Sunrise: string;
	Dhuhr: string;
	Asr: string;
	Sunset: string;
	Maghrib: string;
	Isha: string;
}

export interface HijriDateInfo {
	date: string;
	day: string;
	weekdayAr: string;
	monthAr: string;
	year: string;
}

export interface NextPrayerInfo {
	key: PrayerKey;
	nameAr: string;
	time: string;
	remainingSeconds: number;
	progress: number; // 0 to 1
}

export const PRAYER_NAMES_AR: Record<PrayerKey, string> = {
	Fajr: "الفجر",
	Dhuhr: "الظهر",
	Asr: "العصر",
	Maghrib: "المغرب",
	Isha: "العشاء"
};

export const PRAYER_REMINDERS: Record<PrayerKey, string> = {
	Fajr: "الصلاة خير من النوم.. ركعتا الفجر خير من الدنيا وما فيها، ابدأ يومك بنور الله وتوفيقه.",
	Dhuhr: "حي على الفلاح.. مشاغل الدنيا تنتظر، ولقاء الله لا ينتظر. قف بين يدي ربك ترتاح نفسك.",
	Asr: "حافظوا على الصلوات والصلاة الوسطى.. لا تبع آخرتك بلحظة انشغال، كل عمل ينتظر إلا الصلاة.",
	Maghrib: "أرحنا بها يا بلال.. انقضى نهارك فتوّجه بطاعة ربك، إن الصلاة كانت على المؤمنين كتاباً موقوتاً.",
	Isha: "ختام يومك نور وبركة.. من صلّى العشاء في جماعة فكأنما قام نصف الليل، لا تؤجل صلاتك."
};

export const PRAYER_MOSQUES: Record<PrayerKey, { name: string; image: string }> = {
	Fajr: {
		name: "المسجد الأقصى المبارك",
		image: "/images/prayers/fajr.jpg"
	},
	Dhuhr: {
		name: "المسجد النبوي الشريف",
		image: "/images/prayers/dhuhr.jpg"
	},
	Asr: {
		name: "جامع السلطان أحمد",
		image: "/images/prayers/asr.jpg"
	},
	Maghrib: {
		name: "جامع الشيخ زايد الكبير",
		image: "/images/prayers/maghrib.jpg"
	},
	Isha: {
		name: "المسجد الحرام بمكة المكرمة",
		image: "/images/prayers/isha.jpg"
	}
};

const PRAYER_KEYS: readonly PrayerKey[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const STORAGE_KEY_TIMINGS = "zenith-prayer-timings-cache";
const STORAGE_KEY_DATE = "zenith-prayer-date-cache";
const STORAGE_KEY_CACHE_KEY = "zenith-prayer-cache-key";
const STORAGE_KEY_HIJRI = "zenith-prayer-hijri-cache";

// Global audio element reference so audio can be controlled across re-renders
let activeAthanAudio: HTMLAudioElement | null = null;

export function formatPrayerTime(
	timeStr: string | undefined | null,
	is24h: boolean,
	offsetMinutes = 0
): string {
	if (!timeStr || timeStr === "--:--") return "--:--";
	const clean = timeStr.split(" ")[0];
	const [hStr, mStr] = clean.split(":");
	const hours = parseInt(hStr, 10);
	const minutes = parseInt(mStr, 10);
	if (isNaN(hours) || isNaN(minutes)) return timeStr;

	const d = new Date();
	d.setHours(hours, minutes, 0, 0);
	if (offsetMinutes !== 0) {
		d.setMinutes(d.getMinutes() + offsetMinutes);
	}

	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: !is24h
	});
}

export function getCurrentPrayerKey(timings?: PrayerTimesData | null): PrayerKey {
	const now = new Date();
	const nowMins = now.getHours() * 60 + now.getMinutes();

	if (timings) {
		const parseMinutes = (timeStr?: string) => {
			if (!timeStr) return 0;
			const clean = timeStr.split(" ")[0];
			const [h, m] = clean.split(":").map(Number);
			return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
		};
		const fajr = parseMinutes(timings.Fajr);
		const dhuhr = parseMinutes(timings.Dhuhr);
		const asr = parseMinutes(timings.Asr);
		const maghrib = parseMinutes(timings.Maghrib);
		const isha = parseMinutes(timings.Isha);

		if (nowMins >= isha || nowMins < fajr) return "Isha";
		if (nowMins >= maghrib) return "Maghrib";
		if (nowMins >= asr) return "Asr";
		if (nowMins >= dhuhr) return "Dhuhr";
		return "Fajr";
	}

	// Default fallback:
	if (nowMins >= 1140 || nowMins < 300) return "Isha"; // 19:00+ is Isha
	if (nowMins >= 1050) return "Maghrib";               // 17:30+ is Maghrib
	if (nowMins >= 900) return "Asr";                   // 15:00+ is Asr
	if (nowMins >= 720) return "Dhuhr";                 // 12:00+ is Dhuhr
	return "Fajr";
}

export function usePrayerTimes(options?: { isMainWindow?: boolean }) {
	const isMainWindow = options?.isMainWindow ?? true;
	const [enabled, setEnabled] = useState<boolean>(() => {
		const s = localStorage.getItem("bloom-prayer-enabled");
		return s === null ? true : s !== "false";
	});
	const [locationMode, setLocationMode] = useState<"auto" | "manual">(() => {
		const s = localStorage.getItem("bloom-prayer-location-mode");
		return s === "manual" ? "manual" : "auto";
	});
	const [city, setCity] = useState<string>(() => localStorage.getItem("bloom-prayer-city") || "");
	const [country, setCountry] = useState<string>(() => localStorage.getItem("bloom-prayer-country") || "");
	const [method, setMethod] = useState<string>(() => localStorage.getItem("bloom-prayer-method") || "5");
	const [timeOffset, setTimeOffset] = useState<number>(() => {
		const val = localStorage.getItem("bloom-prayer-time-offset");
		return val ? parseInt(val, 10) || 0 : 0;
	});
	const [alertType, setAlertType] = useState<string>(
		() => localStorage.getItem("bloom-prayer-alert-type") || "sound_notification"
	);
	const [preAlertEnabled, setPreAlertEnabled] = useState<boolean>(() => {
		const val = localStorage.getItem("bloom-prayer-pre-alert");
		return val === null ? true : val !== "false";
	});
	const [timeFormat24h, setTimeFormat24h] = useState<boolean>(() => {
		return localStorage.getItem("bloom-time-format-24h") === "true";
	});

	const [timings, setTimings] = useState<PrayerTimesData | null>(() => {
		try {
			const cached = localStorage.getItem(STORAGE_KEY_TIMINGS);
			return cached ? JSON.parse(cached) : null;
		} catch {
			return null;
		}
	});

	const [hijri, setHijri] = useState<HijriDateInfo | null>(() => {
		try {
			const cached = localStorage.getItem(STORAGE_KEY_HIJRI);
			return cached ? JSON.parse(cached) : null;
		} catch {
			return null;
		}
	});

	const [activePrayer, setActivePrayer] = useState<PrayerKey | null>(null);
	const [nextPrayer, setNextPrayer] = useState<NextPrayerInfo | null>(null);
	const [isPlayingAthan, setIsPlayingAthan] = useState(false);
	const [athanPrayerName, setAthanPrayerName] = useState<string | null>(null);
	const [athanPrayerKey, setAthanPrayerKey] = useState<PrayerKey | null>(null);
	const [athanBannerVisible, setAthanBannerVisible] = useState(false);
	const [loading, setLoading] = useState(false);

	const lastNotifiedPrayerRef = useRef<string | null>(null);
	const lastPreNotifiedPrayerRef = useRef<string | null>(null);
	const activePrayerRef = useRef<PrayerKey | null>(null);
	const nextPrayerRef = useRef<NextPrayerInfo | null>(null);
	const autoDismissTimerRef = useRef<any>(null);

	// Stop any currently playing athan audio
	const stopAthan = useCallback(() => {
		if (activeAthanAudio) {
			activeAthanAudio.pause();
			activeAthanAudio.currentTime = 0;
			activeAthanAudio = null;
		}
		setIsPlayingAthan(false);
		if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
		autoDismissTimerRef.current = setTimeout(() => {
			setAthanBannerVisible(false);
		}, 800);
	}, []);

	// Start Athan Audio (only played in main window)
	const startAthanAudio = useCallback(() => {
		if (!isMainWindow) return;
		if (activeAthanAudio) {
			activeAthanAudio.pause();
			activeAthanAudio.currentTime = 0;
			activeAthanAudio = null;
		}
		if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
		try {
			const audio = new Audio("/sounds/athan.mp3");
			audio.volume = 0.85;
			activeAthanAudio = audio;
			setIsPlayingAthan(true);
			audio.onended = () => {
				setIsPlayingAthan(false);
				activeAthanAudio = null;
				// Auto return notch to normal state 1.8s after audio ends
				if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
				autoDismissTimerRef.current = setTimeout(() => {
					setAthanBannerVisible(false);
				}, 1800);
			};
			audio.play().catch((err) => {
				console.warn("Autoplay note:", err);
				setIsPlayingAthan(false);
				if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
				autoDismissTimerRef.current = setTimeout(() => {
					setAthanBannerVisible(false);
				}, 8000);
			});
		} catch (e) {
			console.error("Audio error:", e);
			setIsPlayingAthan(false);
		}
	}, [isMainWindow]);

	// Play Athan alert respecting notification settings
	const playAthan = useCallback(
		(prayerTitle?: string, key?: PrayerKey) => {
			const notifEnabled = localStorage.getItem("bloom-notifications-enabled") !== "false";
			if (!notifEnabled) return;

			const silent = localStorage.getItem("bloom-notifications-silent") === "true";
			const notchEnabled = localStorage.getItem("bloom-notifications-notch-enabled") !== "false";

			// Determine which prayer key to use (resolve current active prayer if not specified)
			const targetKey: PrayerKey =
				key ||
				activePrayerRef.current ||
				nextPrayerRef.current?.key ||
				getCurrentPrayerKey(timings);
			const prayerName = prayerTitle || PRAYER_NAMES_AR[targetKey] || "الصلاة";

			if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);

			if (notchEnabled) {
				// Show in Notch Dynamic Island - suppresses native Windows notification
				setAthanPrayerName(prayerName);
				setAthanPrayerKey(targetKey);
				setAthanBannerVisible(true);
			} else if (isMainWindow) {
				// Notch notification disabled -> Show in Native Windows Notification (main window only)
				if ("Notification" in window) {
					if (Notification.permission === "granted") {
						new Notification(`حان الآن موعد صلاة ${prayerName}`, {
							body: `الله أكبر - حان الآن وقت أذان صلاة ${prayerName}`,
							icon: "/zenith-white-no-bg-nosmile.svg"
						});
					} else if (Notification.permission !== "denied") {
						Notification.requestPermission().then((perm) => {
							if (perm === "granted") {
								new Notification(`حان الآن موعد صلاة ${prayerName}`, {
									body: `الله أكبر - حان الآن وقت أذان صلاة ${prayerName}`,
									icon: "/zenith-white-no-bg-nosmile.svg"
								});
							}
						}).catch(() => {});
					}
				}
			}

			if (!silent) {
				startAthanAudio();
			} else {
				// In silent mode: auto-dismiss after 8 seconds
				autoDismissTimerRef.current = setTimeout(() => {
					setAthanBannerVisible(false);
				}, 8000);
			}
		},
		[startAthanAudio, timings, isMainWindow]
	);

	// Fetch prayer times from Aladhan API with auto IP location fallback
	const fetchTimings = useCallback(async () => {
		if (!enabled) return;
		setLoading(true);

		try {
			let targetCity = locationMode === "manual" ? city.trim() : "";
			let targetCountry = locationMode === "manual" ? country.trim() : "";

			// If auto mode or city is not set, resolve from IP geolocation
			if (!targetCity) {
				try {
					const ipRes = await fetch("https://ipapi.co/json/");
					if (ipRes.ok) {
						const ipData = await ipRes.json();
						targetCity = ipData.city || "Cairo";
						targetCountry = ipData.country_name || "Egypt";
					}
				} catch {
					targetCity = "Cairo";
					targetCountry = "Egypt";
				}
			}

			const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(
				targetCity
			)}&country=${encodeURIComponent(targetCountry || "Egypt")}&method=${method}`;

			const res = await fetch(url);
			if (res.ok) {
				const json = await res.json();
				if (json?.data?.timings) {
					const rawTimings = json.data.timings as PrayerTimesData;
					setTimings(rawTimings);
					const compositeKey = `${new Date().toDateString()}|${locationMode}|${city.trim()}|${country.trim()}|${method}`;
					localStorage.setItem(STORAGE_KEY_TIMINGS, JSON.stringify(rawTimings));
					localStorage.setItem(STORAGE_KEY_DATE, new Date().toDateString());
					localStorage.setItem(STORAGE_KEY_CACHE_KEY, compositeKey);

					if (json.data.date?.hijri) {
						const h = json.data.date.hijri;
						const hijriData: HijriDateInfo = {
							date: h.date || "",
							day: h.day || "",
							weekdayAr: h.weekday?.ar || "",
							monthAr: h.month?.ar || "",
							year: h.year || ""
						};
						setHijri(hijriData);
						localStorage.setItem(STORAGE_KEY_HIJRI, JSON.stringify(hijriData));
					}
				}
			}
		} catch (err) {
			console.error("Error fetching prayer timings:", err);
		} finally {
			setLoading(false);
		}
	}, [enabled, locationMode, city, country, method]);

	// Auto-fetch on mount and check composite cache freshness (updates immediately on city/method change)
	useEffect(() => {
		const cachedKey = localStorage.getItem(STORAGE_KEY_CACHE_KEY);
		const currentKey = `${new Date().toDateString()}|${locationMode}|${city.trim()}|${country.trim()}|${method}`;
		if (!timings || cachedKey !== currentKey) {
			fetchTimings();
		}
	}, [fetchTimings, timings, locationMode, city, country, method]);

	// Centralized Tauri settings sync listener
	useSettingsSync({
		"bloom-prayer-enabled": (val) => setEnabled(val !== false && val !== "false"),
		"bloom-prayer-location-mode": (val) => setLocationMode(val === "manual" ? "manual" : "auto"),
		"bloom-prayer-city": (val) => setCity(typeof val === "string" ? val : ""),
		"bloom-prayer-country": (val) => setCountry(typeof val === "string" ? val : ""),
		"bloom-prayer-method": (val) => setMethod(typeof val === "string" ? val : "5"),
		"bloom-prayer-time-offset": (val) => setTimeOffset(typeof val === "number" ? val : (parseInt(val, 10) || 0)),
		"bloom-prayer-alert-type": (val) => setAlertType(typeof val === "string" ? val : "sound_notification"),
		"bloom-prayer-pre-alert": (val) => setPreAlertEnabled(val !== false && val !== "false"),
		"bloom-time-format-24h": (val) => setTimeFormat24h(val === true || val === "true")
	});

	// Storage event fallback
	useEffect(() => {
		const handler = () => {
			const sEnabled = localStorage.getItem("bloom-prayer-enabled");
			setEnabled(sEnabled === null ? true : sEnabled !== "false");
			const sLocMode = localStorage.getItem("bloom-prayer-location-mode");
			setLocationMode(sLocMode === "manual" ? "manual" : "auto");
			setCity(localStorage.getItem("bloom-prayer-city") || "");
			setCountry(localStorage.getItem("bloom-prayer-country") || "");
			setMethod(localStorage.getItem("bloom-prayer-method") || "5");
			const off = localStorage.getItem("bloom-prayer-time-offset");
			setTimeOffset(off ? parseInt(off, 10) || 0 : 0);
			setAlertType(localStorage.getItem("bloom-prayer-alert-type") || "sound_notification");
			const pre = localStorage.getItem("bloom-prayer-pre-alert");
			setPreAlertEnabled(pre === null ? true : pre !== "false");
			const tf24 = localStorage.getItem("bloom-time-format-24h");
			setTimeFormat24h(tf24 === "true");
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, []);

	// Live tick loop: compute remaining seconds, active prayer, and handle notifications
	useEffect(() => {
		if (!timings) return;

		const parseTime = (timeStr: string): { hours: number; minutes: number } => {
			// e.g. "05:36 (EEST)" or "05:36"
			const clean = timeStr.split(" ")[0];
			const [h, m] = clean.split(":").map(Number);
			return { hours: h, minutes: m };
		};

		const getPrayerDate = (now: Date, timeStr: string, offsetMins: number, dayDelta = 0): Date => {
			const { hours, minutes } = parseTime(timeStr);
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayDelta, hours, minutes, 0, 0);
			if (offsetMins !== 0) {
				d.setMinutes(d.getMinutes() + offsetMins);
			}
			return d;
		};

		const updateCountdown = () => {
			const now = new Date();
			const prayerDates = PRAYER_KEYS.map((key) => ({
				key,
				nameAr: PRAYER_NAMES_AR[key],
				date: getPrayerDate(now, timings[key], timeOffset)
			}));

			// Determine which prayer period is currently active and which is next
			let active: PrayerKey = "Isha";
			let nextKey: PrayerKey = "Fajr";
			let nextDate = getPrayerDate(now, timings.Fajr, timeOffset, 1); // default: tomorrow's Fajr
			let prevDate = getPrayerDate(now, timings.Isha, timeOffset);

			for (let i = 0; i < prayerDates.length; i++) {
				const current = prayerDates[i];
				const next = prayerDates[(i + 1) % prayerDates.length];

				if (now >= current.date && (i === prayerDates.length - 1 || now < next.date)) {
					active = current.key;
					if (i === prayerDates.length - 1) {
						// After Isha: next is tomorrow Fajr
						nextKey = "Fajr";
						nextDate = getPrayerDate(now, timings.Fajr, timeOffset, 1);
						prevDate = current.date;
					} else {
						nextKey = next.key;
						nextDate = next.date;
						prevDate = current.date;
					}
					break;
				}
			}

			if (now < prayerDates[0].date) {
				// Before today's Fajr: active is yesterday's Isha, next is today's Fajr
				active = "Isha";
				nextKey = "Fajr";
				nextDate = prayerDates[0].date;
				prevDate = getPrayerDate(now, timings.Isha, timeOffset, -1);
			}

			setActivePrayer(active);
			activePrayerRef.current = active;

			const diffMs = nextDate.getTime() - now.getTime();
			const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
			const totalIntervalMs = Math.max(1, nextDate.getTime() - prevDate.getTime());
			const elapsedMs = Math.max(0, now.getTime() - prevDate.getTime());
			const progress = Math.min(1, Math.max(0, elapsedMs / totalIntervalMs));

			const nextInfo: NextPrayerInfo = {
				key: nextKey,
				nameAr: PRAYER_NAMES_AR[nextKey],
				time: timings[nextKey],
				remainingSeconds,
				progress
			};
			setNextPrayer(nextInfo);
			nextPrayerRef.current = nextInfo;

			// --- Alerts & Notifications ---
			const todayKey = `${now.toDateString()}-${nextKey}`;

			// 1. 15-Minute Pre-Prayer Alert
			if (preAlertEnabled && remainingSeconds <= 900 && remainingSeconds > 840) {
				if (lastPreNotifiedPrayerRef.current !== todayKey) {
					lastPreNotifiedPrayerRef.current = todayKey;
					// Desktop / System Notification
					if ("Notification" in window && Notification.permission === "granted") {
						const formattedTime = formatPrayerTime(timings[nextKey], timeFormat24h, timeOffset);
						new Notification(`اقتربت صلاة ${PRAYER_NAMES_AR[nextKey]}`, {
							body: `متبقي 15 دقيقة على موعد أذان ${PRAYER_NAMES_AR[nextKey]} (${formattedTime})`,
							icon: "/zenith-white-no-bg-nosmile.svg"
						});
					}
				}
			}

			// 2. Exact Prayer Time Alert & Athan Audio (only scheduled/fired in main window)
			if (isMainWindow && alertType !== "off") {
				const timeSincePrev = now.getTime() - prevDate.getTime();
				const isRightAtPrayer = remainingSeconds <= 2 && remainingSeconds >= 0;
				const isJustPassed = timeSincePrev >= 0 && timeSincePrev < 90_000;
				const activeTodayKey = `${now.toDateString()}-${active}`;

				if ((isRightAtPrayer || isJustPassed) && active) {
					if (lastNotifiedPrayerRef.current !== activeTodayKey) {
						lastNotifiedPrayerRef.current = activeTodayKey;
						playAthan(PRAYER_NAMES_AR[active], active);
					}
				}
			}
		};

		updateCountdown();
		const interval = setInterval(updateCountdown, 1000);
		return () => clearInterval(interval);
	}, [timings, timeOffset, alertType, preAlertEnabled, playAthan, timeFormat24h, isMainWindow]);

	// Request Notification permission on mount if supported (main window only)
	useEffect(() => {
		if (isMainWindow && "Notification" in window && Notification.permission === "default") {
			Notification.requestPermission().catch(() => {});
		}
	}, [isMainWindow]);

	// Listen for test athan / test notification events with deduplication
	useEffect(() => {
		let lastHandledAt = 0;
		const handleEvent = (payload?: { prayerKey?: PrayerKey; title?: string }) => {
			const now = Date.now();
			if (now - lastHandledAt < 800) return; // Prevent double execution across CustomEvent and Tauri emit
			lastHandledAt = now;

			const key: PrayerKey =
				payload?.prayerKey ||
				activePrayerRef.current ||
				nextPrayerRef.current?.key ||
				getCurrentPrayerKey(timings);
			playAthan(payload?.title || PRAYER_NAMES_AR[key], key);
		};

		const handleCustom = (e: Event) => {
			handleEvent((e as CustomEvent)?.detail);
		};
		window.addEventListener("zenith-test-athan", handleCustom);
		window.addEventListener("zenith-test-notification", handleCustom);

		const unlistenTest = listen<{ prayerKey?: PrayerKey; title?: string }>(
			"zenith-test-notification",
			(event) => {
				handleEvent(event.payload);
			}
		);

		const unlistenAthan = listen<{ prayerKey?: PrayerKey; title?: string }>(
			"zenith-test-athan",
			(event) => {
				handleEvent(event.payload);
			}
		);

		return () => {
			window.removeEventListener("zenith-test-athan", handleCustom);
			window.removeEventListener("zenith-test-notification", handleCustom);
			unlistenTest.then((fn) => fn()).catch(() => {});
			unlistenAthan.then((fn) => fn()).catch(() => {});
		};
	}, [playAthan, timings]);

	return {
		enabled,
		locationMode,
		city,
		country,
		method,
		timeOffset,
		alertType,
		preAlertEnabled,
		timings,
		hijri,
		activePrayer,
		nextPrayer,
		isPlayingAthan,
		athanPrayerName,
		athanPrayerKey,
		athanBannerVisible,
		setAthanBannerVisible,
		loading,
		playAthan,
		stopAthan,
		fetchTimings,
		timeFormat24h
	};
}

export function triggerTestAthan(prayerKey?: PrayerKey) {
	window.dispatchEvent(new CustomEvent("zenith-test-athan", { detail: { prayerKey } }));
	emit("zenith-test-athan", { prayerKey }).catch(() => {});
}

export function triggerTestNotification(prayerKey?: PrayerKey) {
	window.dispatchEvent(new CustomEvent("zenith-test-notification", { detail: { prayerKey } }));
	emit("zenith-test-notification", { prayerKey }).catch(() => {});
}
