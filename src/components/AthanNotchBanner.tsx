import React from "react";
import { motion } from "framer-motion";
import type { BannerVariant } from "../hooks/usePrayerTimes";
import { PRE_ALERT_MINUTES, type PrayerKey } from "../utils/prayerSchedule";
import { MosqueScene, PrayerEmblem } from "./prayer/PrayerArt";
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
	isExpanded: boolean;
	onExpand: () => void;
	onCollapse?: () => void;
}

const WAVE_BARS = 4;

export const AthanNotchBanner: React.FC<AthanNotchBannerProps> = ({
	prayerKey,
	prayerNameAr,
	formattedTime,
	variant = "athan",
	isPlaying,
	onStopAthan,
	onClose,
	isExpanded,
	onExpand
}) => {
	const isReminder = variant === "reminder";
	const waving = isPlaying && !isReminder;

	/* ─── Collapsed Notch Pill State (36px authentic notch) ─── */
	if (!isExpanded) {
		return (
			<motion.div
				className="athan-compact-pill"
				onClick={(e) => {
					e.stopPropagation();
					onExpand();
				}}
				title="اضغط لتوسيع تنبيه الأذان"
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.95 }}
				transition={{ type: "spring", stiffness: 500, damping: 32 }}
			>
				{/* Audio waves */}
				<div className={`athan-compact-waves ${waving ? "is-playing" : "is-paused"}`}>
					{Array.from({ length: 4 }, (_, i) => (
						<span key={i} className={`compact-wave-bar bar-${i + 1}`} />
					))}
				</div>

				{/* Center: Prayer Name + Time */}
				<div className="athan-compact-center">
					<span className="athan-compact-title">صلاة {prayerNameAr}</span>
					<span className="athan-compact-dot">·</span>
					<span className="athan-compact-time">{formattedTime}</span>
				</div>

				{/* Jewel Prayer Emblem */}
				<div className="athan-compact-mark">
					<PrayerEmblem size={20} className="athan-emblem-svg" />
				</div>
			</motion.div>
		);
	}

	/* ─── Expanded Dynamic Island Card State ─── */
	return (
		<motion.div
			className="athan-banner-container"
			onClick={(e) => e.stopPropagation()}
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -4 }}
			transition={{ type: "spring", stiffness: 450, damping: 30 }}
		>
			<div className="athan-banner-content">
				{/* Info column */}
				<div className="athan-side-info">
					<h2 className="athan-prayer-name">صلاة {prayerNameAr}</h2>

					<div className="athan-meta-line">
						<span className="athan-time-tag">{formattedTime}</span>

						<span className="athan-meta-sep">·</span>

						{isReminder ? (
							<div className="athan-reminder-action">
								<span className="athan-reminder-text">
									متبقي {PRE_ALERT_MINUTES} دقيقة
								</span>
								<span className="athan-meta-sep">·</span>
								<button
									className="athan-text-action-btn"
									onClick={onClose}
									title="إغلاق التنبيه"
									aria-label="إغلاق التنبيه"
								>
									إغلاق
								</button>
							</div>
						) : (
							<div className="athan-audio-action">
								<div className={`athan-waves ${waving ? "is-playing" : "is-paused"}`}>
									{Array.from({ length: WAVE_BARS }, (_, i) => (
										<span key={i} className={`wave-bar bar-${i + 1}`} />
									))}
								</div>
								<button
									className="athan-text-action-btn"
									onClick={isPlaying ? onStopAthan : onClose}
									title={isPlaying ? "كتم صوت الأذان" : "إغلاق التنبيه"}
									aria-label={isPlaying ? "كتم صوت الأذان" : "إغلاق التنبيه"}
								>
									{isPlaying ? "كتم" : "إغلاق"}
								</button>
							</div>
						)}
					</div>
				</div>

				{/* Unboxed architectural art with ambient glow */}
				<div className="athan-side-media">
					<MosqueScene prayer={prayerKey} className="athan-mosque-art" />
				</div>
			</div>
		</motion.div>
	);
};
