import React from "react";
import { Clock, Volume2, VolumeX, X } from "lucide-react";
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
			{/* Top bar: live indicator + dismiss button */}
			<div className="athan-banner-topbar">
				<div className="athan-status-badge">
					<span className={`athan-pulse-dot ${waving ? "is-active" : ""}`} />
					<span className="athan-status-title">
						{isReminder ? "اقترب موعد الأذان" : "موعد الأذان"}
					</span>
					<span className="athan-meta-dot">·</span>
					<div className="athan-time-tag">
						<Clock size={11} strokeWidth={2} />
						<span>{formattedTime}</span>
					</div>
				</div>

				<button
					className="athan-close-btn"
					onClick={onClose}
					title="إغلاق"
					aria-label="إغلاق"
				>
					<X size={13} strokeWidth={2.4} />
				</button>
			</div>

			{/* Main body: info + audio controls + mosque art */}
			<div className="athan-banner-body">
				<div className="athan-side-info">
					<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>

					<div className="athan-footer-row">
						{isReminder ? (
							<div className="athan-reminder-tag">
								<span>متبقي {PRE_ALERT_MINUTES} دقيقة على الأذان</span>
							</div>
						) : (
							<div className="athan-audio-controls">
								<div className={`athan-wave-visualizer ${waving ? "is-playing" : "is-paused"}`}>
									{Array.from({ length: WAVE_BARS }, (_, i) => (
										<span key={i} className={`wave-bar bar-${i + 1}`} />
									))}
								</div>

								<button
									className="athan-audio-btn"
									onClick={onStopAthan}
									title={isPlaying ? "كتم صوت الأذان" : "الصوت مكتوم"}
									aria-label={isPlaying ? "كتم صوت الأذان" : "الصوت مكتوم"}
								>
									{isPlaying ? (
										<Volume2 size={13} strokeWidth={2.2} className="athan-icon-playing" />
									) : (
										<VolumeX size={13} strokeWidth={2.2} opacity={0.6} />
									)}
									<span className="athan-btn-label">
										{isPlaying ? "كتم الصوت" : "تم الكتم"}
									</span>
								</button>
							</div>
						)}
					</div>
				</div>

				<div className="athan-side-media">
					<div className="athan-mosque-card">
						<MosqueScene prayer={prayerKey} className="athan-mosque-art" />
					</div>
				</div>
			</div>
		</div>
	);
};
