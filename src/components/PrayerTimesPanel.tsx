import React from "react";
import {
	Sunrise,
	Sun,
	SunMedium,
	Sunset,
	Moon,
	MapPin,
	RotateCcw,
	Volume2,
	Square
} from "lucide-react";
import {
	usePrayerTimes,
	type PrayerKey,
	PRAYER_NAMES_AR,
	formatPrayerTime
} from "../hooks/usePrayerTimes";
import "./PrayerTimesPanel.css";

const PRAYER_ICONS: Record<PrayerKey, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
	Fajr: Sunrise,
	Dhuhr: Sun,
	Asr: SunMedium,
	Maghrib: Sunset,
	Isha: Moon
};

const PRAYER_ORDER: readonly PrayerKey[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

function formatRemainingSeconds(secs: number): string {
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = secs % 60;
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface PrayerTimesPanelProps {
	timeFormat24h?: boolean;
}

export const PrayerTimesPanel: React.FC<PrayerTimesPanelProps> = ({
	timeFormat24h: propTimeFormat24h
}) => {
	const {
		timings,
		hijri,
		activePrayer,
		nextPrayer,
		isPlayingAthan,
		athanPrayerName,
		loading,
		stopAthan,
		fetchTimings,
		city,
		country,
		timeOffset,
		timeFormat24h: hookTimeFormat24h
	} = usePrayerTimes();

	const is24h = propTimeFormat24h ?? hookTimeFormat24h;

	return (
		<div className="prayer-split-view" onClick={(e) => e.stopPropagation()}>
			{/* Left Column: Next Prayer Countdown */}
			<div className="prayer-countdown-column">
				<span className="prayer-next-label">الصلاة القادمة</span>
				<div className="prayer-next-name">
					{nextPrayer ? nextPrayer.nameAr : "—"}
				</div>

				<div className="prayer-clock-digits">
					{nextPrayer ? formatRemainingSeconds(nextPrayer.remainingSeconds) : "00:00:00"}
				</div>

				<div className="prayer-progress-track">
					<div
						className="prayer-progress-fill"
						style={{ width: `${Math.round((nextPrayer?.progress ?? 0) * 100)}%` }}
					/>
				</div>

				{isPlayingAthan && (
					<div className="prayer-athan-active-box">
						<Volume2 size={13} className="prayer-athan-icon" />
						<span>أذان {athanPrayerName}</span>
						<button className="prayer-athan-stop-btn" onClick={stopAthan} title="إيقاف الأذان">
							<Square size={9} fill="currentColor" />
							<span>إيقاف</span>
						</button>
					</div>
				)}

				<div className="prayer-footer-location">
					<MapPin size={10} strokeWidth={2} opacity={0.6} />
					<span className="prayer-location-text">
						{city || country ? `${city || "Auto"}${country ? ` · ${country}` : ""}` : "تحديد تلقائي"}
					</span>
					<button
						className="prayer-refresh-btn"
						onClick={() => fetchTimings()}
						title="تحديث المواقيت"
						disabled={loading}
					>
						<RotateCcw size={10} className={loading ? "animate-spin" : ""} />
					</button>
				</div>
			</div>

			{/* Right Column: 5 Prayers List */}
			<div className="prayer-list-column">
				<div className="prayer-date-header">
					{hijri
						? `${hijri.weekdayAr}، ${hijri.day} ${hijri.monthAr} ${hijri.year} هـ`
						: "مواقيت الصلاة"}
				</div>

				<div className="prayer-items-stack">
					{PRAYER_ORDER.map((key) => {
						const IconComp = PRAYER_ICONS[key];
						const timeVal = timings ? formatPrayerTime(timings[key], is24h, timeOffset) : "--:--";
						const isNext = nextPrayer?.key === key;
						const isActive = activePrayer === key;

						return (
							<div
								key={key}
								className={`prayer-row ${isNext ? "is-next" : ""} ${isActive ? "is-active" : ""}`}
							>
								<div className="prayer-info-side">
									<span className="prayer-icon-wrapper">
										<IconComp size={13} strokeWidth={2} />
									</span>
									<span className="prayer-name-ar">{PRAYER_NAMES_AR[key]}</span>
								</div>
								<span className="prayer-time-val">{timeVal}</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};
