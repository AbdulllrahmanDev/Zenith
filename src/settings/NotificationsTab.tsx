import { useState } from "react";
import { Bell, BellOff, VolumeX, PanelTop, Check, Monitor } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { SettingRow } from "./SettingRow";
import { triggerTestNotification } from "../hooks/usePrayerTimes";

interface NotificationsTabProps {
	notificationsEnabled: boolean;
	toggleNotifications: () => void;
	notificationsSilent: boolean;
	toggleNotificationsSilent: () => void;
	notificationsNotchEnabled: boolean;
	toggleNotificationsNotch: () => void;
}

export function NotificationsTab({
	notificationsEnabled,
	toggleNotifications,
	notificationsSilent,
	toggleNotificationsSilent,
	notificationsNotchEnabled,
	toggleNotificationsNotch
}: NotificationsTabProps) {
	const [testSent, setTestSent] = useState(false);

	const handleTest = () => {
		triggerTestNotification("Asr");
		setTestSent(true);
		setTimeout(() => setTestSent(false), 3000);
	};

	return (
		<>
			<div className="setting-group-label">Notifications</div>
			<div className="setting-group">
				{/* Master Switch: Enable / Disable completely */}
				<SettingRow
					icon={notificationsEnabled ? Bell : BellOff}
					label="Enable Notifications"
					desc="Allow Zenith to deliver notifications and alerts"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={notificationsEnabled}
							onChange={toggleNotifications}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{/* Silent Mode */}
				<SettingRow
					icon={VolumeX}
					label="Silent Mode"
					desc="Display visual alerts without playing audio sounds"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							disabled={!notificationsEnabled}
							checked={notificationsSilent}
							onChange={toggleNotificationsSilent}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{/* Show in Notch vs Native Windows */}
				<SettingRow
					icon={PanelTop}
					label="Show in Notch"
					desc={
						notificationsNotchEnabled
							? "Alerts display in the Notch Dynamic Island (Windows popups suppressed)"
							: "Alerts display via native Windows notifications"
					}
					divider={false}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							disabled={!notificationsEnabled}
							checked={notificationsNotchEnabled}
							onChange={toggleNotificationsNotch}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label">Testing & System</div>
			<div className="setting-group">
				{/* Test Notification Button */}
				<SettingRow
					icon={testSent ? Check : Bell}
					label="Test Notification"
					desc={
						testSent
							? "Test notification triggered!"
							: notificationsNotchEnabled
							? "Preview alert in the Notch"
							: "Preview alert in Windows Action Center"
					}
					action
					onClick={handleTest}
				>
					<button
						className="action-btn"
						onClick={handleTest}
						style={{
							background: testSent ? "#10b981" : undefined,
							color: testSent ? "#ffffff" : undefined
						}}
					>
						{testSent ? "Sent!" : "Test Notification"}
					</button>
				</SettingRow>

				{/* Windows Notification Center */}
				<SettingRow
					icon={Monitor}
					label="Windows Notification Center"
					desc="Open the native Windows Action Center"
					action
					divider={false}
					onClick={() => invoke("open_notification_center")}
				/>
			</div>
		</>
	);
}
