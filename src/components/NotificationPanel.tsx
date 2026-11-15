import { useState, useCallback } from "react";
import { ChevronLeft, Bell, BellOff, Check } from "lucide-react";
import { useI18n } from "../i18n";
import { triggerTestNotification } from "../hooks/usePrayerTimes";
import "./QuickPanel.css";

interface NotificationPanelProps {
	onBack: () => void;
	openSettingsWindow: () => void;
	notificationsEnabled: boolean;
	onToggleNotifications: () => void;
	notificationsSilent: boolean;
	onToggleSilent: () => void;
	notificationsNotchEnabled: boolean;
	onToggleNotchDelivery: () => void;
}

export function NotificationPanel({
	onBack,
	openSettingsWindow,
	notificationsEnabled,
	onToggleNotifications,
	notificationsSilent,
	onToggleSilent,
	notificationsNotchEnabled,
	onToggleNotchDelivery
}: NotificationPanelProps) {
	const { t, dir } = useI18n();
	const n = t.quickPanels.notifications;
	const [testSent, setTestSent] = useState(false);

	const handleTest = useCallback(() => {
		triggerTestNotification();
		setTestSent(true);
		setTimeout(() => setTestSent(false), 3000);
	}, []);

	return (
		<div className="qp" dir={dir} onClick={(e) => e.stopPropagation()}>
			{/* Header */}
			<div className="qp-header">
				<button className="qp-icon-btn" onClick={onBack} aria-label={t.quickPanels.backToControls} title={n.backTitle}>
					<ChevronLeft />
				</button>
				<span className="qp-title">{n.title}</span>
				<button
					className={`qp-switch ${notificationsEnabled ? "on" : ""}`}
					role="switch"
					aria-checked={notificationsEnabled}
					aria-label={n.masterAria}
					onClick={onToggleNotifications}
					title={notificationsEnabled ? n.disableTitle : n.enableTitle}
				>
					<span />
				</button>
			</div>

			{/* Body */}
			<div className="qp-body" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}>
				{!notificationsEnabled ? (
					<div className="qp-empty" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.7 }}>
						<BellOff size={24} strokeWidth={1.5} />
						<span>{n.offState}</span>
					</div>
				) : (
					<>
						{/* Notch Delivery Toggle */}
						<div
							className="qp-row"
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "6px 8px",
								borderRadius: 8,
								background: "rgba(255, 255, 255, 0.04)"
							}}
						>
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								<span style={{ fontSize: 11, fontWeight: 600 }}>{n.showInNotch}</span>
								<span style={{ fontSize: 9.5, opacity: 0.65 }}>
									{notificationsNotchEnabled ? n.showInNotchOn : n.showInNotchOff}
								</span>
							</div>
							<button
								className={`qp-switch ${notificationsNotchEnabled ? "on" : ""}`}
								role="switch"
								aria-checked={notificationsNotchEnabled}
								onClick={onToggleNotchDelivery}
								title={n.toggleDeliveryTitle}
							>
								<span />
							</button>
						</div>

						{/* Silent Mode Toggle */}
						<div
							className="qp-row"
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "6px 8px",
								borderRadius: 8,
								background: "rgba(255, 255, 255, 0.04)"
							}}
						>
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								<span style={{ fontSize: 11, fontWeight: 600 }}>{n.silentMode}</span>
								<span style={{ fontSize: 9.5, opacity: 0.65 }}>
									{notificationsSilent ? n.soundMuted : n.soundEnabled}
								</span>
							</div>
							<button
								className={`qp-switch ${notificationsSilent ? "on" : ""}`}
								role="switch"
								aria-checked={notificationsSilent}
								onClick={onToggleSilent}
								title={n.toggleSilentTitle}
							>
								<span />
							</button>
						</div>

						{/* Test Notification Button */}
						<div style={{ marginTop: 2 }}>
							<button
								className={`qp-btn ${testSent ? "" : "primary"}`}
								onClick={handleTest}
								style={{
									width: "100%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 6,
									padding: "6px 10px",
									fontSize: 11,
									fontWeight: 600,
									background: testSent ? "rgba(16, 185, 129, 0.25)" : undefined,
									color: testSent ? "#34d399" : undefined,
									borderColor: testSent ? "rgba(16, 185, 129, 0.4)" : undefined,
									transition: "all 0.2s ease"
								}}
							>
								{testSent ? (
									<>
										<Check size={13} strokeWidth={2.5} />
										<span>{n.testSent}</span>
									</>
								) : (
									<>
										<Bell size={13} strokeWidth={2} />
										<span>{n.testBtn}</span>
									</>
								)}
							</button>
						</div>
					</>
				)}
			</div>

			{/* Footer: Link to full Settings */}
			<button className="qp-footer" onClick={openSettingsWindow}>
				{n.moreSettings}
			</button>
		</div>
	);
}
