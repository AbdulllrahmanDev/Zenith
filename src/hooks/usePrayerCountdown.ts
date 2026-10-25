import { useEffect, useState } from "react";
import { PRAYER_NAMES_AR } from "../utils/prayerContent";
import { computePrayerState, type PrayerKey, type PrayerTimesData } from "../utils/prayerSchedule";

export interface PrayerCountdown {
	key: PrayerKey;
	nameAr: string;
	/** Raw time string of the next prayer, before the offset. */
	time: string;
	remainingSeconds: number;
	/** 0 to 1 between the previous and the next prayer. */
	progress: number;
}

function snapshot(timings: PrayerTimesData | null, offsetMinutes: number): PrayerCountdown | null {
	if (!timings) return null;
	const state = computePrayerState(new Date(), timings, offsetMinutes);
	if (!state) return null;
	return {
		key: state.next,
		nameAr: PRAYER_NAMES_AR[state.next],
		time: timings[state.next],
		remainingSeconds: state.remainingSeconds,
		progress: state.progress
	};
}

/**
 * Per-second countdown to the next prayer. It lives in the panel, not in the
 * app-level prayer hook, so a closed panel costs no re-renders.
 */
export function usePrayerCountdown(
	timings: PrayerTimesData | null,
	offsetMinutes: number
): PrayerCountdown | null {
	const [countdown, setCountdown] = useState(() => snapshot(timings, offsetMinutes));

	useEffect(() => {
		const update = () => setCountdown(snapshot(timings, offsetMinutes));
		update();
		const id = setInterval(update, 1000);
		return () => clearInterval(id);
	}, [timings, offsetMinutes]);

	return countdown;
}
