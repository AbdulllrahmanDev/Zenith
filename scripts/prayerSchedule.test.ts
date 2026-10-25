import { describe, expect, test } from "bun:test";
import {
	ALERT_GRACE_MS,
	PRE_ALERT_MINUTES,
	buildTimingsUrl,
	cacheKeyFor,
	computePrayerState,
	dueAlerts,
	formatRemaining,
	parseClock,
	parseTimingsResponse,
	rememberFired,
	resolveAlertPolicy,
	type PrayerTimesData
} from "../src/utils/prayerSchedule";

const TIMINGS: PrayerTimesData = {
	Fajr: "04:30 (EET)",
	Sunrise: "06:00",
	Dhuhr: "12:00",
	Asr: "15:30",
	Sunset: "18:00",
	Maghrib: "18:05",
	Isha: "19:30"
};

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 25, h, m, s, 0);

describe("parseClock", () => {
	test("reads plain and annotated times", () => {
		expect(parseClock("05:36")).toEqual({ hours: 5, minutes: 36 });
		expect(parseClock("05:36 (EEST)")).toEqual({ hours: 5, minutes: 36 });
	});

	test("rejects anything that is not a clock time", () => {
		expect(parseClock("")).toBeNull();
		expect(parseClock(undefined)).toBeNull();
		expect(parseClock("--:--")).toBeNull();
		expect(parseClock("25:00")).toBeNull();
		expect(parseClock("12:75")).toBeNull();
	});
});

describe("computePrayerState", () => {
	test("midday: Dhuhr is active, Asr is next", () => {
		const state = computePrayerState(at(13, 0), TIMINGS, 0)!;
		expect(state.active).toBe("Dhuhr");
		expect(state.next).toBe("Asr");
		expect(state.remainingSeconds).toBe(2.5 * 3600);
		expect(state.progress).toBeCloseTo(60 / 210, 5);
	});

	test("before Fajr the previous Isha period is active", () => {
		const state = computePrayerState(at(3, 0), TIMINGS, 0)!;
		expect(state.active).toBe("Isha");
		expect(state.next).toBe("Fajr");
		expect(state.remainingSeconds).toBe(90 * 60);
	});

	test("after Isha the next prayer is tomorrow's Fajr", () => {
		const state = computePrayerState(at(22, 0), TIMINGS, 0)!;
		expect(state.active).toBe("Isha");
		expect(state.next).toBe("Fajr");
		expect(state.remainingSeconds).toBe((6 * 60 + 30) * 60);
	});

	test("the offset shifts every prayer", () => {
		const state = computePrayerState(at(12, 5), TIMINGS, 10)!;
		// 12:05 is still before the shifted Dhuhr (12:10), so Fajr's period continues.
		expect(state.active).toBe("Fajr");
		expect(state.next).toBe("Dhuhr");
		expect(state.remainingSeconds).toBe(5 * 60);
	});

	test("unparsable timings give no state instead of a wrong one", () => {
		expect(computePrayerState(at(12, 0), { ...TIMINGS, Asr: "--:--" }, 0)).toBeNull();
	});
});

describe("dueAlerts", () => {
	test("fires once when the prayer time falls inside the tick interval", () => {
		const due = dueAlerts(at(11, 59, 59), at(12, 0, 0), TIMINGS, 0, true);
		expect(due.map((a) => [a.key, a.kind])).toEqual([["Dhuhr", "exact"]]);
		expect(dueAlerts(at(12, 0, 0), at(12, 0, 1), TIMINGS, 0, true)).toEqual([]);
	});

	test("a late tick still delivers the alert", () => {
		const due = dueAlerts(at(11, 59, 0), at(12, 0, 40), TIMINGS, 0, true);
		expect(due).toHaveLength(1);
		expect(due[0].kind).toBe("exact");
	});

	test("the reminder comes 15 minutes earlier and only when enabled", () => {
		const reminderAt = at(12, 0).getTime() - PRE_ALERT_MINUTES * 60 * 1000;
		const before = new Date(reminderAt - 1000);
		const after = new Date(reminderAt);
		const due = dueAlerts(before, after, TIMINGS, 0, true);
		expect(due.map((a) => [a.key, a.kind])).toEqual([["Dhuhr", "pre"]]);
		expect(dueAlerts(before, after, TIMINGS, 0, false)).toEqual([]);
	});

	test("waking from sleep long after the time does not play a stale athan", () => {
		const woke = new Date(at(12, 0).getTime() + ALERT_GRACE_MS + 1000);
		expect(dueAlerts(at(9, 0), woke, TIMINGS, 0, true)).toEqual([]);
	});

	test("the offset moves the alert with the prayer", () => {
		expect(dueAlerts(at(12, 9, 59), at(12, 10, 0), TIMINGS, 10, false)).toHaveLength(1);
		expect(dueAlerts(at(11, 59, 59), at(12, 0, 0), TIMINGS, 10, false)).toEqual([]);
	});

	test("ids are stable per day, prayer and kind", () => {
		const [exact] = dueAlerts(at(11, 59, 59), at(12, 0, 0), TIMINGS, 0, false);
		expect(exact.id).toBe("2026-10-25-Dhuhr-exact");
	});
});

describe("rememberFired", () => {
	test("keeps only the latest ids and ignores repeats", () => {
		let list: string[] = [];
		for (let i = 0; i < 15; i++) list = rememberFired(list, `id-${i}`, 12);
		expect(list).toHaveLength(12);
		expect(list[0]).toBe("id-3");
		expect(rememberFired(list, "id-14", 12)).toEqual(list);
	});
});

describe("resolveAlertPolicy", () => {
	const base = { alertType: "sound_notification", notificationsEnabled: true, silent: false, notchEnabled: true };

	test("default: show in the notch with sound", () => {
		expect(resolveAlertPolicy(base)).toEqual({ show: true, channel: "notch", sound: true });
	});

	test("notification only never plays sound", () => {
		expect(resolveAlertPolicy({ ...base, alertType: "notification_only" }).sound).toBe(false);
	});

	test("silent mode mutes the sound but still shows", () => {
		expect(resolveAlertPolicy({ ...base, silent: true })).toEqual({ show: true, channel: "notch", sound: false });
	});

	test("off or notifications disabled shows nothing", () => {
		expect(resolveAlertPolicy({ ...base, alertType: "off" }).show).toBe(false);
		expect(resolveAlertPolicy({ ...base, notificationsEnabled: false })).toEqual({
			show: false,
			channel: "notch",
			sound: false
		});
	});

	test("turning the notch channel off falls back to the system notification", () => {
		expect(resolveAlertPolicy({ ...base, notchEnabled: false }).channel).toBe("native");
	});
});

describe("cacheKeyFor", () => {
	const parts = { date: at(8, 0), locationMode: "manual" as const, city: "Cairo", country: "Egypt", method: "5" };

	test("changes with the place, the method and the day", () => {
		const key = cacheKeyFor(parts);
		expect(cacheKeyFor({ ...parts, city: "Alexandria" })).not.toBe(key);
		expect(cacheKeyFor({ ...parts, method: "4" })).not.toBe(key);
		expect(cacheKeyFor({ ...parts, date: new Date(2026, 9, 26, 8, 0) })).not.toBe(key);
	});

	test("ignores case, spaces and the typed place while in auto mode", () => {
		expect(cacheKeyFor({ ...parts, city: " cairo ", country: "EGYPT" })).toBe(cacheKeyFor(parts));
		expect(cacheKeyFor({ ...parts, locationMode: "auto", city: "A" })).toBe(
			cacheKeyFor({ ...parts, locationMode: "auto", city: "B" })
		);
	});
});

describe("formatRemaining", () => {
	test("pads hours, minutes and seconds", () => {
		expect(formatRemaining(0)).toBe("00:00:00");
		expect(formatRemaining(3661)).toBe("01:01:01");
		expect(formatRemaining(-5)).toBe("00:00:00");
	});
});

describe("buildTimingsUrl", () => {
	test("uses the city endpoint when a country is known", () => {
		expect(buildTimingsUrl({ city: "Cairo", country: "Egypt" }, "5")).toBe(
			"https://api.aladhan.com/v1/timingsByCity?city=Cairo&country=Egypt&method=5"
		);
	});

	test("never invents a country: without one the city goes in as an address", () => {
		const url = buildTimingsUrl({ city: " Abu Dhabi ", country: "" }, "4");
		expect(url).toBe("https://api.aladhan.com/v1/timingsByAddress?address=Abu%20Dhabi&method=4");
		expect(url).not.toContain("Egypt");
	});
});

describe("parseTimingsResponse", () => {
	const good = {
		data: {
			timings: { ...TIMINGS },
			date: { hijri: { date: "01-01-1448", day: "1", year: "1448", weekday: { ar: "الأحد" }, month: { ar: "مُحرَّم" } } }
		}
	};

	test("accepts a complete response and reads the Hijri date", () => {
		const parsed = parseTimingsResponse(good)!;
		expect(parsed.timings.Fajr).toBe("04:30 (EET)");
		expect(parsed.hijri).toEqual({ date: "01-01-1448", day: "1", weekdayAr: "الأحد", monthAr: "مُحرَّم", year: "1448" });
	});

	test("a missing Hijri block is fine", () => {
		expect(parseTimingsResponse({ data: { timings: { ...TIMINGS } } })!.hijri).toBeNull();
	});

	test("rejects empty, partial and unreadable data", () => {
		expect(parseTimingsResponse(null)).toBeNull();
		expect(parseTimingsResponse({})).toBeNull();
		expect(parseTimingsResponse({ data: { timings: { Fajr: "04:30" } } })).toBeNull();
		expect(parseTimingsResponse({ data: { timings: { ...TIMINGS, Asr: "soon" } } })).toBeNull();
	});
});

describe("alert pipeline over a whole day", () => {
	/** Same loop the hook runs: tick, ask what is due, skip what already fired. */
	function simulate(stepSeconds: number, preAlert: boolean, jitterEvery = 0) {
		let fired: string[] = [];
		const delivered: string[] = [];
		let previous: Date | null = null;
		const start = new Date(2026, 9, 25, 0, 0, 0).getTime();
		let tickNumber = 0;
		for (let s = 0; s <= 24 * 3600; s += stepSeconds) {
			const extra = jitterEvery && tickNumber % jitterEvery === 0 ? 45 : 0; // a stalled timer
			const now = new Date(start + (s + extra) * 1000);
			tickNumber++;
			if (previous) {
				for (const alert of dueAlerts(previous, now, TIMINGS, 0, preAlert)) {
					if (fired.includes(alert.id)) continue;
					fired = rememberFired(fired, alert.id, 12);
					delivered.push(alert.id);
				}
			}
			previous = now;
		}
		return delivered;
	}

	test("one-second ticks deliver each of the 5 athans and 5 reminders exactly once", () => {
		const delivered = simulate(1, true);
		expect(delivered).toHaveLength(10);
		expect(new Set(delivered).size).toBe(10);
		expect(delivered.filter((id) => id.endsWith("exact"))).toHaveLength(5);
		expect(delivered.filter((id) => id.endsWith("pre"))).toHaveLength(5);
	});

	test("with reminders switched off only the 5 athans fire", () => {
		expect(simulate(1, false)).toHaveLength(5);
	});

	test("stalled timers (45 s hiccups) still lose nothing and repeat nothing", () => {
		const delivered = simulate(1, true, 7);
		expect(delivered).toHaveLength(10);
		expect(new Set(delivered).size).toBe(10);
	});

	test("sparse ticks every 30 s still deliver every alert once", () => {
		expect(simulate(30, true)).toHaveLength(10);
	});
});
