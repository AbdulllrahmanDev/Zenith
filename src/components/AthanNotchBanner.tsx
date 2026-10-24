import React from "react";
import { Volume2, VolumeX, X, Sparkles, Clock } from "lucide-react";
import {
	type PrayerKey,
	PRAYER_REMINDERS,
	PRAYER_MOSQUES
} from "../hooks/usePrayerTimes";
import "./AthanNotchBanner.css";

export interface AthanNotchBannerProps {
	prayerKey: PrayerKey;
	prayerNameAr: string;
	formattedTime: string;
	isPlaying: boolean;
	onStopAthan: () => void;
	onClose: () => void;
}

export const AthanNotchBanner: React.FC<AthanNotchBannerProps> = ({
	prayerKey,
	prayerNameAr,
	formattedTime,
	isPlaying,
	onStopAthan,
	onClose
}) => {
	const mosque = PRAYER_MOSQUES[prayerKey] || PRAYER_MOSQUES.Asr;
	const reminder = PRAYER_REMINDERS[prayerKey] || PRAYER_REMINDERS.Asr;

	return (
		<div className="athan-banner-container" onClick={(e) => e.stopPropagation()}>
			{/* Close Button on top corner */}
			<button
				className="athan-banner-close"
				onClick={onClose}
				title="إغلاق الإشعار"
				aria-label="إغلاق"
			>
				<X size={13} strokeWidth={2.4} />
			</button>

			<div className="athan-banner-body">
				{/* Side 1: Prayer Info, Time, and Reminder */}
				<div className="athan-side-info">
					<div className="athan-badge">
						<span className="athan-pulse-dot" />
						<Sparkles size={11} className="athan-badge-icon" />
						<span className="athan-badge-text">حان الآن موعد الأذان</span>
					</div>

					<div className="athan-title-row">
						<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>
						<div className="athan-time-chip">
							<Clock size={11} strokeWidth={2} />
							<span>{formattedTime}</span>
						</div>
					</div>

					<div className="athan-reminder-box">
						<div className="athan-reminder-quote-bar" />
						<p className="athan-reminder-text">{reminder}</p>
					</div>
				</div>

				{/* Side 2: Mosque Image + Audio Waveform + Stop Button */}
				<div className="athan-side-media">
					<div className="athan-mosque-card">
						<img
							src={mosque.image}
							alt={mosque.name}
							className="athan-mosque-image"
							draggable={false}
						/>
						<div className="athan-mosque-overlay">
							<span className="athan-mosque-title">{mosque.name}</span>
						</div>
					</div>

					{/* Audio Visualizer Waves + Stop Athan Button */}
					<div className="athan-controls-bar">
						<div className={`athan-audio-waves ${isPlaying ? "is-playing" : "is-paused"}`}>
							<span className="wave-bar bar-1" />
							<span className="wave-bar bar-2" />
							<span className="wave-bar bar-3" />
							<span className="wave-bar bar-4" />
							<span className="wave-bar bar-5" />
							<span className="wave-bar bar-6" />
							<span className="wave-bar bar-7" />
							<span className="wave-bar bar-8" />
						</div>

						{isPlaying ? (
							<button
								className="athan-stop-audio-btn"
								onClick={onStopAthan}
								title="إيقاف صوت الأذان"
							>
								<VolumeX size={12} strokeWidth={2.2} />
								<span>إيقاف الأذان</span>
							</button>
						) : (
							<div className="athan-audio-ended-badge">
								<Volume2 size={11} opacity={0.6} />
								<span>تم الأذان</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
