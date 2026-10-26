import React from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import type { BannerVariant } from "../hooks/usePrayerTimes";
import { PRE_ALERT_MINUTES, type PrayerKey } from "../utils/prayerSchedule";
import { MosqueScene } from "./prayer/PrayerArt";
import "./prayer/prayer.css";
import "./AthanNotchBanner.css";

export interface AthanNotchBannerProps {
	prayerKey: PrayerKey;
	prayerNameAr: string;
	formattedTime: string;
	/** "athan" at prayer time, "reminder" 15 minutes before (no audio). */
	variant?: BannerVariant;
	isPlaying: boolean;
	onStopAthan: () => void;
	onClose: () => void;
	isExpanded?: boolean;
	onExpand?: () => void;
}

const WAVE_BARS = 4;

export const AthanNotchBanner: React.FC<AthanNotchBannerProps> = ({
	prayerKey,
	prayerNameAr,
	formattedTime,
	variant = "athan",
	isPlaying,
	onStopAthan,
	onClose
}) => {
	const isReminder = variant === "reminder";
	const waving = isPlaying && !isReminder;

	return (
		<div className="athan-banner-container" onClick={(e) => e.stopPropagation()}>
			{/* Dismiss button */}
			<button
				className="athan-close-btn"
				onClick={onClose}
				title="إغلاق"
				aria-label="إغلاق"
			>
				<X size={14} strokeWidth={2.2} />
			</button>

			<div className="athan-banner-content">
				{/* Info column */}
				<div className="athan-side-info">
					<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>

					<div className="athan-meta-line">
						<span className="athan-time-tag">{formattedTime}</span>

						<span className="athan-meta-sep">·</span>

						{isReminder ? (
							<span className="athan-reminder-text">
								متبقي {PRE_ALERT_MINUTES} دقيقة
							</span>
						) : (
							<button
								className={`athan-audio-pill ${isPlaying ? "is-playing" : "is-muted"}`}
								onClick={onStopAthan}
								title={isPlaying ? "كتم صوت الأذان" : "تشغيل الصوت"}
								aria-label={isPlaying ? "كتم صوت الأذان" : "تشغيل الصوت"}
							>
								<div className="athan-waves">
									{Array.from({ length: WAVE_BARS }, (_, i) => (
										<span key={i} className={`wave-bar bar-${i + 1}`} />
									))}
								</div>
								{isPlaying ? (
									<Volume2 size={13} strokeWidth={2.4} className="athan-vol-icon" />
								) : (
									<VolumeX size={13} strokeWidth={2.2} className="athan-vol-icon" />
								)}
							</button>
						)}
					</div>
				</div>

				{/* Unboxed architectural art */}
				<div className="athan-side-media">
					<MosqueScene prayer={prayerKey} className="athan-mosque-art" />
				</div>
			</div>
		</div>
	);
};
