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
	Square,
	Sparkles
} from "lucide-react";
import {
	usePrayerTimes,
	type PrayerKey,
	PRAYER_NAMES_AR
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

export const PrayerTimesPanel: React.FC = () => {
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
		country
	} = usePrayerTimes();

	return (
		<div className="prayer-split-view" onClick={(e) => e.stopPropagation()}>
			{/* Left Column: 5 Prayers List */}
			<div className="prayer-list-column">
				<div className="prayer-hijri-header">
					<Sparkles size={13} className="prayer-hijri-icon" />
					<span>
						{hijri
							? `${hijri.weekdayAr}، ${hijri.day} ${hijri.monthAr} ${hijri.year} هـ`
							: "مواقيت الصلاة اليومية"}
					</span>
				</div>

				<div className="prayer-items-stack">
					{PRAYER_ORDER.map((key) => {
						const IconComp = PRAYER_ICONS[key];
						const timeVal = timings ? timings[key] : "--:--";
						const isActive = activePrayer === key;
						const isNext = nextPrayer?.key === key;

						return (
							<div
								key={key}
								className={`prayer-row ${isActive ? "is-active" : ""} ${isNext ? "is-next" : ""}`}
							>
								<div className="prayer-info-side">
									<div className="prayer-icon-wrapper">
										<IconComp size={15} strokeWidth={2} />
									</div>
									<span className="prayer-name-ar">{PRAYER_NAMES_AR[key]}</span>
								</div>
								<span className="prayer-time-val">{timeVal}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Right Column: Next Prayer & Countdown */}
			<div className="prayer-countdown-column">
				<div className="prayer-countdown-glow" />

				<div style={{ zIndex: 1, width: "100%" }}>
					<span className="prayer-next-label">الصلاة القادمة</span>
					<div className="prayer-next-name">
						{nextPrayer ? nextPrayer.nameAr : "جاري التحميل..."}
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
							<Volume2 size={14} color="#ef4444" />
							<span style={{ fontSize: "11px", fontWeight: 600, color: "#fff" }}>
								أذان {athanPrayerName}
							</span>
							<button className="prayer-athan-stop-btn" onClick={stopAthan}>
								<Square size={10} fill="currentColor" />
								<span>إيقاف</span>
							</button>
						</div>
					)}
				</div>

				<div className="prayer-footer-location" style={{ zIndex: 1 }}>
					<MapPin size={11} strokeWidth={2} />
					<span>{city || country ? `${city || "Auto"}, ${country}` : "الموقع التلقائي"}</span>
					<button
						className="prayer-refresh-btn"
						onClick={() => fetchTimings()}
						title="تحديث المواقيت"
						disabled={loading}
					>
						<RotateCcw size={11} className={loading ? "animate-spin" : ""} />
					</button>
				</div>
			</div>
		</div>
	);
};
