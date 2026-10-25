import React from "react";
import { Clock, Volume2, VolumeX, X } from "lucide-react";
import type { BannerVariant } from "../hooks/usePrayerTimes";
import { PRAYER_REMINDERS } from "../utils/prayerContent";
import { PRE_ALERT_MINUTES, type PrayerKey } from "../utils/prayerSchedule";
import { MosqueScene, PrayerEmblem } from "./prayer/PrayerArt";
import "./prayer/prayer.css";
import "./AthanNotchBanner.css";

export interface AthanNotchBannerProps {
	isExpanded: boolean;
	onExpand: () => void;
	prayerKey: PrayerKey;
	prayerNameAr: string;
	formattedTime: string;
	/** "athan" at prayer time, "reminder" 15 minutes before (no audio). */
	variant?: BannerVariant;
	isPlaying: boolean;
	onStopAthan: () => void;
	onClose: () => void;
}

const WAVE_BARS = 7;

export const AthanNotchBanner: React.FC<AthanNotchBannerProps> = ({
	isExpanded,
	onExpand,
	prayerKey,
	prayerNameAr,
	formattedTime,
	variant = "athan",
	isPlaying,
	onStopAthan,
	onClose
}) => {
	const isReminder = variant === "reminder";
	const reminder = PRAYER_REMINDERS[prayerKey] || PRAYER_REMINDERS.Asr;
	const headline = isReminder ? `اقتربت صلاة ${prayerNameAr}` : `موعد أذان ${prayerNameAr}`;
	const waving = isPlaying && !isReminder;

	if (!isExpanded) {
		return (
			<div className="athan-compact-pill" onClick={onExpand} title="اضغط للتوسيع">
				<div className={`athan-compact-waves ${waving ? "is-playing" : "is-paused"}`}>
					{Array.from({ length: 5 }, (_, i) => (
						<span key={i} className={`compact-wave-bar bar-${i + 1}`} />
					))}
				</div>

				<div className="athan-compact-center">
					<span className="athan-compact-title">{isReminder ? headline : `صلاة ${prayerNameAr}`}</span>
					<span className="athan-compact-time">{formattedTime}</span>
				</div>

				<div className="athan-compact-mark">
					<PrayerEmblem size={22} />
				</div>
			</div>
		);
	}

	return (
		<div className="athan-banner-container" onClick={(e) => e.stopPropagation()}>
			<button className="athan-banner-close" onClick={onClose} title="إغلاق الإشعار" aria-label="إغلاق">
				<X size={13} strokeWidth={2.2} />
			</button>

			<div className="athan-banner-body">
				<div className="athan-side-info">
					<div className="athan-header-meta">
						<span className="athan-pulse-dot" />
						<span className="athan-header-text">{headline}</span>
					</div>

					<div className="athan-title-row">
						<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>
						<div className="athan-time-inline">
							<Clock size={12} strokeWidth={1.8} className="athan-time-icon" />
							<span>{formattedTime}</span>
						</div>
					</div>

					<div className="athan-reminder-box">
						<span className="athan-reminder-quote-bar" />
						<p className="athan-reminder-text">{reminder}</p>
					</div>
				</div>

				<div className="athan-side-media">
					<div className="athan-mosque-card">
						<MosqueScene prayer={prayerKey} className="athan-mosque-art" />
					</div>

					<div className="athan-controls-bar">
						{isReminder ? (
							<div className="athan-audio-ended-badge">
								<Clock size={11} opacity={0.7} />
								<span>بعد {PRE_ALERT_MINUTES} دقيقة</span>
							</div>
						) : (
							<>
								<div className={`athan-audio-waves ${waving ? "is-playing" : "is-paused"}`}>
									{Array.from({ length: WAVE_BARS }, (_, i) => (
										<span key={i} className={`wave-bar bar-${i + 1}`} />
									))}
								</div>
								{isPlaying ? (
									<button className="athan-stop-audio-btn" onClick={onStopAthan} title="إيقاف صوت الأذان">
										<VolumeX size={12} strokeWidth={2} />
										<span>إيقاف الأذان</span>
									</button>
								) : (
									<div className="athan-audio-ended-badge">
										<Volume2 size={11} opacity={0.7} />
										<span>تم الأذان</span>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
