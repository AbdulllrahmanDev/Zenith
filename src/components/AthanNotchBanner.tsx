import React from "react";
import { Volume2, VolumeX, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
	type PrayerKey,
	PRAYER_REMINDERS,
	PRAYER_MOSQUES
} from "../hooks/usePrayerTimes";
import "./AthanNotchBanner.css";

export interface AthanNotchBannerProps {
	isExpanded: boolean;
	onExpand: () => void;
	prayerKey: PrayerKey;
	prayerNameAr: string;
	formattedTime: string;
	isPlaying: boolean;
	onStopAthan: () => void;
	onClose: () => void;
}

export const AthanNotchBanner: React.FC<AthanNotchBannerProps> = ({
	isExpanded,
	onExpand,
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
		<AnimatePresence mode="wait">
			{!isExpanded ? (
				<motion.div
					key="athan-compact"
					className="athan-compact-pill"
					onClick={onExpand}
					title="اضغط للتوسيع"
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
					transition={{ type: "spring", stiffness: 450, damping: 32 }}
				>
					{/* Left side: Sound motion visualizer effects */}
					<div className={`athan-compact-waves ${isPlaying ? "is-playing" : "is-paused"}`}>
						<span className="compact-wave-bar bar-1" />
						<span className="compact-wave-bar bar-2" />
						<span className="compact-wave-bar bar-3" />
						<span className="compact-wave-bar bar-4" />
						<span className="compact-wave-bar bar-5" />
					</div>

					{/* Center: Prayer title & time */}
					<div className="athan-compact-center">
						<span className="athan-compact-title">صلاة {prayerNameAr}</span>
						<span className="athan-compact-time">{formattedTime}</span>
					</div>

					{/* Right side: Mosque image thumbnail */}
					<div className="athan-compact-image-wrap">
						<img
							src={mosque.image}
							alt={mosque.name}
							className="athan-compact-image"
							draggable={false}
						/>
					</div>
				</motion.div>
			) : (
				<motion.div
					key="athan-expanded"
					className="athan-banner-container"
					onClick={(e) => e.stopPropagation()}
					initial={{ opacity: 0, scale: 0.97 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
					transition={{ type: "spring", stiffness: 450, damping: 32 }}
				>
					{/* Close Button on top corner */}
					<button
						className="athan-banner-close"
						onClick={onClose}
						title="إغلاق الإشعار"
						aria-label="إغلاق"
					>
						<X size={13} strokeWidth={2.2} />
					</button>

					<div className="athan-banner-body">
						{/* Side 1: Prayer Info, Time, and Reminder */}
						<div className="athan-side-info">
							<div className="athan-header-meta">
								<span className="athan-header-text">موعد أذان {prayerNameAr}</span>
							</div>

							<div className="athan-title-row">
								<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>
								<div className="athan-time-inline">
									<Clock size={12} strokeWidth={1.8} className="athan-time-icon" />
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
								</div>

								{isPlaying ? (
									<button
										className="athan-stop-audio-btn"
										onClick={onStopAthan}
										title="إيقاف صوت الأذان"
									>
										<VolumeX size={12} strokeWidth={2} />
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
				</motion.div>
			)}
		</AnimatePresence>
	);
};
