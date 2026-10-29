/**
 * Prayer scheduling rules. Everything here is pure so it can be unit-tested
 * without a window, a clock or the network.
 */

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

export const PRAYER_KEYS: readonly PrayerKey[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

/** The reminder fires this long before each prayer. */
export const PRE_ALERT_MINUTES = 15;
/** A missed alert is still delivered if it is at most this late (sleep, throttled timers). */
export const ALERT_GRACE_MS = 2 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

/** Parses "05:36" or "05:36 (EEST)". */
export function parseClock(value: string | undefined | null): { hours: number; minutes: number } | null {
	if (!value) return null;
	const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return { hours, minutes };
}

export function prayerDate(
	now: Date,
	value: string | undefined | null,
	offsetMinutes: number,
	dayDelta = 0
): Date | null {
	const clock = parseClock(value);
	if (!clock) return null;
	const date = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + dayDelta,
		clock.hours,
		clock.minutes + offsetMinutes,
		0,
		0
	);
	return date;
}

export interface PrayerState {
	/** The prayer whose period we are in. */
	active: PrayerKey;
	next: PrayerKey;
	nextAt: Date;
	remainingSeconds: number;
	/** 0 to 1, how far we are between the previous and the next prayer. */
	progress: number;
}

export function computePrayerState(
	now: Date,
	timings: PrayerTimesData,
	offsetMinutes: number
): PrayerState | null {
	const today: Date[] = [];
	for (const key of PRAYER_KEYS) {
		const date = prayerDate(now, timings[key], offsetMinutes);
		if (!date) return null;
		today.push(date);
	}

	let activeIndex = -1;
	for (let i = 0; i < today.length; i++) {
		if (now.getTime() >= today[i].getTime()) activeIndex = i;
	}

	let active: PrayerKey;
	let next: PrayerKey;
	let nextAt: Date;
	let prevAt: Date;
	if (activeIndex === -1) {
		// Before today's Fajr: yesterday's Isha period.
		active = "Isha";
		next = "Fajr";
		nextAt = today[0];
		prevAt = prayerDate(now, timings.Isha, offsetMinutes, -1) as Date;
	} else if (activeIndex === today.length - 1) {
		active = "Isha";
		next = "Fajr";
		nextAt = prayerDate(now, timings.Fajr, offsetMinutes, 1) as Date;
		prevAt = today[activeIndex];
	} else {
		active = PRAYER_KEYS[activeIndex];
		next = PRAYER_KEYS[activeIndex + 1];
		nextAt = today[activeIndex + 1];
		prevAt = today[activeIndex];
	}

	const remainingMs = nextAt.getTime() - now.getTime();
	const intervalMs = Math.max(1, nextAt.getTime() - prevAt.getTime());
	const elapsedMs = Math.max(0, now.getTime() - prevAt.getTime());
	return {
		active,
		next,
		nextAt,
		remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
		progress: Math.min(1, Math.max(0, elapsedMs / intervalMs))
	};
}

export type AlertKind = "pre" | "exact";

export interface DueAlert {
	kind: AlertKind;
	key: PrayerKey;
	/** Stable per day, kind and prayer; used to avoid repeating an alert. */
	id: string;
	at: Date;
}

function dayStamp(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Alerts whose moment fell in (previousTick, now]. Checking the interval instead
 * of "seconds remaining <= 2" means a late or skipped tick cannot lose an alert.
 * Moments more than ALERT_GRACE_MS in the past are dropped, so waking from sleep
 * hours later does not play a stale athan.
 */
export function dueAlerts(
	previousTick: Date,
	now: Date,
	timings: PrayerTimesData,
	offsetMinutes: number,
	preAlertEnabled: boolean
): DueAlert[] {
	const from = previousTick.getTime();
	const to = now.getTime();
	const due: DueAlert[] = [];

	const consider = (kind: AlertKind, key: PrayerKey, at: Date) => {
		const t = at.getTime();
		if (t > from && t <= to && to - t <= ALERT_GRACE_MS) {
			due.push({ kind, key, id: `${dayStamp(at)}-${key}-${kind}`, at });
		}
	};

	for (const key of PRAYER_KEYS) {
		const at = prayerDate(now, timings[key], offsetMinutes);
		if (!at) continue;
		consider("exact", key, at);
		if (preAlertEnabled) {
			consider("pre", key, new Date(at.getTime() - PRE_ALERT_MINUTES * MINUTE_MS));
		}
	}
	return due.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Keeps the most recent ids so a restart or a remount cannot repeat an alert. */
export function rememberFired(list: readonly string[], id: string, max = 12): string[] {
	if (list.includes(id)) return [...list];
	return [...list, id].slice(-max);
}

export interface AlertSettings {
	/** "sound_notification" | "notification_only" | "off" */
	alertType: string;
	notificationsEnabled: boolean;
	silent: boolean;
	notchEnabled: boolean;
}

export interface AlertPolicy {
	show: boolean;
	channel: "notch" | "native";
	sound: boolean;
}

/**
 * One place that decides what an alert does, from the prayer-specific alert type
 * and the global notification switches.
 */
export function resolveAlertPolicy(settings: AlertSettings): AlertPolicy {
	const show = settings.notificationsEnabled && settings.alertType !== "off";
	return {
		show,
		channel: settings.notchEnabled ? "notch" : "native",
		sound: show && settings.alertType === "sound_notification" && !settings.silent
	};
}

export interface CacheKeyParts {
	date: Date;
	locationMode: "auto" | "manual";
	city: string;
	country: string;
	latitude?: number | null;
	longitude?: number | null;
	method: string;
}

/** Cached timings are only valid for the same day, place and calculation method. */
export function cacheKeyFor(parts: CacheKeyParts): string {
	let place: string;
	if (parts.locationMode === "manual") {
		place = `${parts.city.trim().toLowerCase()},${parts.country.trim().toLowerCase()}`;
	} else if (
		typeof parts.latitude === "number" &&
		typeof parts.longitude === "number" &&
		!isNaN(parts.latitude) &&
		!isNaN(parts.longitude)
	) {
		place = `coords:${parts.latitude.toFixed(3)},${parts.longitude.toFixed(3)}`;
	} else if (parts.city.trim()) {
		place = `city:${parts.city.trim().toLowerCase()},${parts.country.trim().toLowerCase()}`;
	} else {
		place = "auto";
	}
	return [dayStamp(parts.date), parts.locationMode, place, parts.method].join("|");
}

export function formatPrayerTime(
	timeStr: string | undefined | null,
	is24h: boolean,
	offsetMinutes = 0
): string {
	if (!timeStr || timeStr === "--:--") return "--:--";
	const clock = parseClock(timeStr);
	if (!clock) return timeStr;
	const d = new Date();
	d.setHours(clock.hours, clock.minutes + offsetMinutes, 0, 0);
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: !is24h
	});
}

export function formatRemaining(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export interface HijriDateInfo {
	date: string;
	day: string;
	weekdayAr: string;
	monthAr: string;
	year: string;
}

export interface Place {
	city?: string;
	country?: string;
	latitude?: number;
	longitude?: number;
	label?: string;
}

const API_BASE = "https://api.aladhan.com/v1";

/**
 * The Aladhan endpoint for a place. Without a country the city is sent as a free
 * address rather than guessing a country.
 */
export function buildTimingsUrl(place: Place, method: string): string {
	const calc = encodeURIComponent(method || "5");
	if (
		typeof place.latitude === "number" &&
		typeof place.longitude === "number" &&
		!isNaN(place.latitude) &&
		!isNaN(place.longitude)
	) {
		return `${API_BASE}/timings?latitude=${place.latitude}&longitude=${place.longitude}&method=${calc}`;
	}
	const city = encodeURIComponent((place.city || "").trim());
	const country = (place.country || "").trim();
	if (country) {
		return `${API_BASE}/timingsByCity?city=${city}&country=${encodeURIComponent(country)}&method=${calc}`;
	}
	return `${API_BASE}/timingsByAddress?address=${city}&method=${calc}`;
}

const TIMING_FIELDS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Sunset", "Maghrib", "Isha"] as const;

/**
 * Validates an Aladhan response. Returns null for anything that is not a full
 * set of readable times, so bad data is never cached or shown.
 */
export function parseTimingsResponse(
	json: unknown
): { timings: PrayerTimesData; hijri: HijriDateInfo | null } | null {
	const data = (json as { data?: { timings?: Record<string, unknown>; date?: { hijri?: Record<string, unknown> } } })
		?.data;
	const raw = data?.timings;
	if (!raw || typeof raw !== "object") return null;

	const timings = {} as PrayerTimesData;
	for (const field of TIMING_FIELDS) {
		const value = raw[field];
		if (typeof value !== "string") return null;
		if (field !== "Sunrise" && field !== "Sunset" && !parseClock(value)) return null;
		timings[field] = value;
	}

	const h = data?.date?.hijri as
		| { date?: string; day?: string; year?: string; weekday?: { ar?: string }; month?: { ar?: string } }
		| undefined;
	const hijri: HijriDateInfo | null = h
		? {
				date: h.date || "",
				day: h.day || "",
				weekdayAr: h.weekday?.ar || "",
				monthAr: h.month?.ar || "",
				year: h.year || ""
			}
		: null;
	return { timings, hijri };
}
