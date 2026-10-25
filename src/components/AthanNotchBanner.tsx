import React from "react";
import { Clock, VolumeX, X } from "lucide-react";
import type { BannerVariant } from "../hooks/usePrayerTimes";
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

const WAVE_BARS = 5;

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
	const headline = isReminder ? "اقترب موعد" : "موعد أذان";
	const waving = isPlaying && !isReminder;

	if (!isExpanded) {
		return (
			<div
				className="athan-compact-pill"
				onClick={(e) => {
					e.stopPropagation();
					onExpand();
				}}
				title="اضغط للتوسيع"
			>
				<div className={`athan-compact-waves ${waving ? "is-playing" : "is-paused"}`}>
					{Array.from({ length: 5 }, (_, i) => (
						<span key={i} className={`compact-wave-bar bar-${i + 1}`} />
					))}
				</div>

				<div className="athan-compact-center">
					<span className="athan-compact-title">{isReminder ? `اقتربت صلاة ${prayerNameAr}` : `صلاة ${prayerNameAr}`}</span>
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
			<div className="athan-banner-body">
				{/* Info & Controls */}
				<div className="athan-side-info">
					<div className="athan-header-meta">
						<span className="athan-header-text">{headline}</span>
						<span className="athan-meta-divider">·</span>
						<div className="athan-time-inline">
							<Clock size={12} strokeWidth={1.8} className="athan-time-icon" />
							<span>{formattedTime}</span>
						</div>
					</div>

					<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>

					<div className="athan-control-capsule">
						{isReminder ? (
							<div className="athan-state-pill">
								<Clock size={12} opacity={0.75} />
								<span>متبقي {PRE_ALERT_MINUTES} دقيقة على الأذان</span>
							</div>
						) : (
							<div className="athan-audio-pill">
								<div className={`athan-audio-waves ${waving ? "is-playing" : "is-paused"}`}>
									{Array.from({ length: WAVE_BARS }, (_, i) => (
										<span key={i} className={`wave-bar bar-${i + 1}`} />
									))}
								</div>
								<span className="athan-audio-text">
									{isPlaying ? "الأذان يصدح الآن" : "تم كتم الصوت"}
								</span>
							</div>
						)}

						<span className="athan-capsule-divider" />

						<button
							className="athan-action-btn"
							onClick={isPlaying ? onStopAthan : onClose}
							title={isPlaying ? "كتم صوت الأذان" : "إغلاق"}
							aria-label={isPlaying ? "كتم صوت الأذان" : "إغلاق"}
						>
							{isPlaying ? (
								<VolumeX size={15} strokeWidth={2} />
							) : (
								<X size={15} strokeWidth={2.2} />
							)}
						</button>
					</div>
				</div>

				{/* Visual Artwork */}
				<div className="athan-side-media">
					<div className="athan-mosque-card">
						<MosqueScene prayer={prayerKey} className="athan-mosque-art" />
					</div>
				</div>
			</div>
		</div>
	);
};
