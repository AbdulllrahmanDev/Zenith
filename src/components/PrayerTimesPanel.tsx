import React from "react";
import { AlertCircle, Check, MapPin, RotateCcw, Square, Volume2 } from "lucide-react";
import { useI18n, type TranslationDict } from "../i18n";
import type { PrayerTimesState } from "../hooks/usePrayerTimes";
import { usePrayerCountdown } from "../hooks/usePrayerCountdown";
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

function statusLine(
	data: PrayerTimesState,
	statusStrings: TranslationDict["prayer"]["status"]
): { text: string; tone: "error" | "stale" | "place" } {
	if (data.error === "location") return { text: statusStrings.errorLocation, tone: "error" };
	if (data.error === "network") return { text: statusStrings.errorNetwork, tone: "error" };
	if (data.error === "invalid") return { text: statusStrings.errorInvalid, tone: "error" };
	if (data.stale) return { text: statusStrings.stale, tone: "stale" };
	const place =
		data.resolvedPlace?.label ||
		(data.resolvedPlace?.city && data.resolvedPlace?.country
			? `${data.resolvedPlace.city} · ${data.resolvedPlace.country}`
			: data.resolvedPlace?.city) ||
		(data.city || data.country ? [data.city, data.country].filter(Boolean).join(" · ") : "");
	return { text: place || statusStrings.autoLocation, tone: "place" };
}

export const PrayerTimesPanel: React.FC<PrayerTimesPanelProps> = ({
	prayerData,
	timeFormat24h: propTimeFormat24h
}) => {
	const { t, lang, dir } = useI18n();
	const pt = t.prayer;
	const {
		timings,
		hijri,
		activePrayer,
		isPlayingAthan,
		athanPrayerName,
		athanPrayerKey,
		loading,
		stopAthan,
		fetchTimings,
		timeOffset
	} = prayerData;
	const is24h = propTimeFormat24h ?? prayerData.timeFormat24h;
	const countdown = usePrayerCountdown(timings, timeOffset);
	const status = statusLine(prayerData, pt.status);

	const now = new Date();
	const hasPassed = (key: PrayerKey): boolean => {
		if (!timings) return false;
		const at = prayerDate(now, timings[key], timeOffset);
		return at !== null && at.getTime() <= now.getTime();
	};

	const progress = countdown?.progress ?? 0;
	const nextTime =
		countdown && timings ? formatPrayerTime(timings[countdown.key], is24h, timeOffset, lang) : "--:--";
	const activeAthanLabel = (athanPrayerKey ? pt.names[athanPrayerKey] : null) ?? athanPrayerName;
	const hijriDisplay = hijri
		? lang === "ar"
			? `${hijri.weekdayAr}، ${hijri.day} ${hijri.monthAr} ${hijri.year} هـ`
			: hijri.weekdayEn || hijri.monthEn
				? `${hijri.weekdayEn ? `${hijri.weekdayEn}, ` : ""}${[hijri.day, hijri.monthEn, hijri.year].filter(Boolean).join(" ")} AH`
				: hijri.date || pt.status.title
		: pt.status.title;

	return (
		<div className="prayer-split-view" dir={dir} onClick={(e) => e.stopPropagation()}>
			{/* Left Column: Countdown */}
			<section className="prayer-countdown-column">
				<span className="prayer-next-label">{pt.status.nextPrayer}</span>

				<div className="prayer-ring" role="img" aria-label={pt.status.nextPrayer}>
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
					<span className="prayer-next-name">{countdown ? pt.names[countdown.key] : "—"}</span>
					<span className="prayer-next-time">{nextTime}</span>
				</div>

				{isPlayingAthan ? (
					<div className="prayer-athan-active-box">
						<Volume2 size={13} className="prayer-athan-icon" />
						<span>
							{pt.status.athanPlaying} {activeAthanLabel}
						</span>
						<button className="prayer-athan-stop-btn" onClick={stopAthan} title={pt.status.stopTitle}>
							<Square size={8} fill="currentColor" />
							<span>{pt.status.stop}</span>
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
							onClick={() => fetchTimings({ force: true })}
							title={pt.status.refresh}
							aria-label={pt.status.refresh}
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
					<span className="prayer-date-text">{hijriDisplay}</span>
				</header>

				<div className="prayer-items-stack">
					{PRAYER_KEYS.map((key) => {
						const isNext = countdown?.key === key;
						const isActive = activePrayer === key;
						const isPast = !isNext && hasPassed(key);
						const timeVal = timings
							? formatPrayerTime(timings[key], is24h, timeOffset, lang)
							: "--:--";

						return (
							<div
								key={key}
								className={`prayer-row${isNext ? " is-next" : ""}${isActive ? " is-active" : ""}${isPast ? " is-past" : ""}`}
							>
								<div className="prayer-info-side">
									<span className="prayer-icon-wrapper">
										<PrayerIcon prayer={key} size={15} />
									</span>
									<span className="prayer-name-ar">{pt.names[key]}</span>
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