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
import { PrayerIcon } from "./prayer/PrayerArt";
import "./prayer/prayer.css";
import "./PrayerTimesPanel.css";

const SQUIRCLE_PATH =
	"M 54 2 h 34 a 18 18 0 0 1 18 18 v 52 a 18 18 0 0 1 -18 18 h -68 a 18 18 0 0 1 -18 -18 v -52 a 18 18 0 0 1 18 -18 h 34 Z";
const SQUIRCLE_LENGTH = 353.1;

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
			{/* Left Column: Countdown */}
			<section className="prayer-countdown-column">
				<span className="prayer-next-label">{PRAYER_STATUS_AR.nextPrayer}</span>

				<div className="prayer-ring" role="img" aria-label={PRAYER_STATUS_AR.nextPrayer}>
					<svg className="prayer-ring-svg" viewBox="0 0 108 92" aria-hidden="true" focusable="false">
						<path className="prayer-ring-track" d={SQUIRCLE_PATH} />
						<path
							className="prayer-ring-arc"
							d={SQUIRCLE_PATH}
							strokeDasharray={`${(progress * SQUIRCLE_LENGTH).toFixed(2)} ${SQUIRCLE_LENGTH.toFixed(2)}`}
						/>
					</svg>
					<div className="prayer-ring-center">
						{countdown && <PrayerIcon prayer={countdown.key} size={16} className="prayer-ring-icon" />}
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
							<Square size={8} fill="currentColor" />
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

			{/* Right Column: Prayers List */}
			<section className="prayer-list-column">
				<header className="prayer-date-header">
					<span className="prayer-date-text">
						{hijri
							? `${hijri.weekdayAr}، ${hijri.day} ${hijri.monthAr} ${hijri.year} هـ`
							: PRAYER_STATUS_AR.title}
					</span>
				</header>

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
								</div>
								<div className="prayer-time-side">
									{isPast && <Check size={11} strokeWidth={2.2} className="prayer-done-mark" />}
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