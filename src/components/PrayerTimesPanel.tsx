import React from "react";
import { AlertCircle, Check, MapPin, RotateCcw, Square, Volume2 } from "lucide-react";
import type { PrayerTimesState } from "../hooks/usePrayerTimes";
import { usePrayerCountdown } from "../hooks/usePrayerCountdown";
import { PRAYER_NAMES_AR, PRAYER_STATUS_AR } from "../utils/prayerContent";
import {
	PRAYER_KEYS,
	formatPrayerTime,
	formatRemaining,
	prayerDate,
	type PrayerKey
} from "../utils/prayerSchedule";
import { GeometricPattern, OrnamentRule, PrayerEmblem, PrayerIcon } from "./prayer/PrayerArt";
import "./prayer/prayer.css";
import "./PrayerTimesPanel.css";

const RING_RADIUS = 42;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export interface PrayerTimesPanelProps {
	/** State from the single app-level usePrayerTimes(). */
	prayerData: PrayerTimesState;
	timeFormat24h?: boolean;
}

function statusLine(data: PrayerTimesState): { text: string; tone: "error" | "stale" | "place" } {
	if (data.error === "location") return { text: PRAYER_STATUS_AR.errorLocation, tone: "error" };
	if (data.error === "network") return { text: PRAYER_STATUS_AR.errorNetwork, tone: "error" };
	if (data.error === "invalid") return { text: PRAYER_STATUS_AR.errorInvalid, tone: "error" };
	if (data.stale) return { text: PRAYER_STATUS_AR.stale, tone: "stale" };
	const place = data.city || data.country ? [data.city, data.country].filter(Boolean).join(" · ") : "";
	return { text: place || PRAYER_STATUS_AR.autoLocation, tone: "place" };
}

export const PrayerTimesPanel: React.FC<PrayerTimesPanelProps> = ({
	prayerData,
	timeFormat24h: propTimeFormat24h
}) => {
	const { timings, hijri, activePrayer, isPlayingAthan, athanPrayerName, loading, stopAthan, fetchTimings, timeOffset } =
		prayerData;
	const is24h = propTimeFormat24h ?? prayerData.timeFormat24h;
	const countdown = usePrayerCountdown(timings, timeOffset);
	const status = statusLine(prayerData);

	const now = new Date();
	const hasPassed = (key: PrayerKey): boolean => {
		if (!timings) return false;
		const at = prayerDate(now, timings[key], timeOffset);
		return at !== null && at.getTime() <= now.getTime();
	};

	const progress = countdown?.progress ?? 0;
	const nextTime = countdown && timings ? formatPrayerTime(timings[countdown.key], is24h, timeOffset) : "--:--";

	return (
		<div className="prayer-split-view" onClick={(e) => e.stopPropagation()}>
			{/* Countdown to the next prayer */}
			<section className="prayer-countdown-column">
				<GeometricPattern className="prayer-pattern" />

				<span className="prayer-next-label">{PRAYER_STATUS_AR.nextPrayer}</span>

				<div className="prayer-ring" role="img" aria-label={PRAYER_STATUS_AR.nextPrayer}>
					<svg className="prayer-ring-svg" viewBox="0 0 104 104" aria-hidden="true" focusable="false">
						<circle className="prayer-ring-track" cx="52" cy="52" r={RING_RADIUS} />
						<circle
							className="prayer-ring-arc"
							cx="52"
							cy="52"
							r={RING_RADIUS}
							strokeDasharray={`${(progress * RING_LENGTH).toFixed(2)} ${RING_LENGTH.toFixed(2)}`}
						/>
					</svg>
					<div className="prayer-ring-center">
						{countdown ? (
							<PrayerIcon prayer={countdown.key} size={17} className="prayer-ring-icon" />
						) : (
							<PrayerEmblem size={19} className="prayer-ring-icon" />
						)}
						<span className="prayer-clock-digits">
							{countdown ? formatRemaining(countdown.remainingSeconds) : "--:--:--"}
						</span>
					</div>
				</div>

				<div className="prayer-next-row">
					<span className="prayer-next-name">{countdown ? countdown.nameAr : "—"}</span>
					<span className="prayer-next-time">{nextTime}</span>
				</div>

				{isPlayingAthan ? (
					<div className="prayer-athan-active-box">
						<Volume2 size={13} className="prayer-athan-icon" />
						<span>
							{PRAYER_STATUS_AR.athanPlaying} {athanPrayerName}
						</span>
						<button className="prayer-athan-stop-btn" onClick={stopAthan} title={PRAYER_STATUS_AR.stopTitle}>
							<Square size={9} fill="currentColor" />
							<span>{PRAYER_STATUS_AR.stop}</span>
						</button>
					</div>
				) : (
					<div className={`prayer-footer-location is-${status.tone}`}>
						{status.tone === "place" ? (
							<MapPin size={10} strokeWidth={2} />
						) : (
							<AlertCircle size={10} strokeWidth={2} />
						)}
						<span className="prayer-location-text" title={status.text}>
							{status.text}
						</span>
						<button
							className="prayer-refresh-btn"
							onClick={() => fetchTimings()}
							title={PRAYER_STATUS_AR.refresh}
							aria-label={PRAYER_STATUS_AR.refresh}
							disabled={loading}
						>
							<RotateCcw size={10} className={loading ? "animate-spin" : ""} />
						</button>
					</div>
				)}
			</section>

			{/* The five prayers */}
			<section className="prayer-list-column">
				<header className="prayer-date-header">
					<PrayerEmblem size={19} className="prayer-header-emblem" />
					<span className="prayer-date-text">
						{hijri
							? `${hijri.weekdayAr}، ${hijri.day} ${hijri.monthAr} ${hijri.year} هـ`
							: PRAYER_STATUS_AR.title}
					</span>
				</header>
				<OrnamentRule className="prayer-rule" />

				<div className="prayer-items-stack">
					{PRAYER_KEYS.map((key) => {
						const isNext = countdown?.key === key;
						const isActive = activePrayer === key;
						const isPast = !isNext && hasPassed(key);
						const timeVal = timings ? formatPrayerTime(timings[key], is24h, timeOffset) : "--:--";

						return (
							<div
								key={key}
								className={`prayer-row${isNext ? " is-next" : ""}${isActive ? " is-active" : ""}${isPast ? " is-past" : ""}`}
							>
								<div className="prayer-info-side">
									<span className="prayer-icon-wrapper">
										<PrayerIcon prayer={key} size={15} />
									</span>
									<span className="prayer-name-ar">{PRAYER_NAMES_AR[key]}</span>
									{isActive && <span className="prayer-now-dot" title="الآن" />}
								</div>
								<div className="prayer-time-side">
									{isPast && <Check size={11} strokeWidth={2.4} className="prayer-done-mark" />}
									<span className="prayer-time-val">{timeVal}</span>
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
};