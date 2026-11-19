import { useState } from "react";
import { Power, Download, Clock, BatteryWarning, RefreshCw, RotateCcw, LogOut, Languages, Keyboard } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { useI18n, type AppLanguage } from "../i18n";

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat24h: boolean;
	toggleTimeFormat24h: () => void;
	showUpdateIndicator: boolean;
	toggleUpdateIndicator: () => void;
	lowBatteryThreshold: number;
	handleThresholdChange: (val: number) => void;
	openSettingsHotkey: string;
	onOpenSettingsHotkeyChange: (combo: string) => void;
	restartZenith: () => void;
	resetToDefaults: () => void;
	quitZenith: () => void;
}

export function GeneralTab({
	autostart,
	toggleAutostart,
	timeFormat24h,
	toggleTimeFormat24h,
	showUpdateIndicator,
	toggleUpdateIndicator,
	lowBatteryThreshold,
	handleThresholdChange,
	openSettingsHotkey,
	onOpenSettingsHotkeyChange,
	restartZenith,
	resetToDefaults,
	quitZenith
}: GeneralTabProps) {
	const { lang, setLanguage, t } = useI18n();
	const g = t.general;
	const [recordingHotkey, setRecordingHotkey] = useState(false);

	return (
		<>
			<div className="setting-group-label">{g.languageGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={Languages}
					label={g.languageLabel}
					desc={g.languageDesc}
					divider={false}
				>
					<ZenithSelect
						className="settings-select"
						value={lang}
						onChange={(e) => setLanguage(e.target.value as AppLanguage)}
					>
						<option value="en">{g.langEnglish}</option>
						<option value="ar">{g.langArabic}</option>
					</ZenithSelect>
				</SettingRow>
			</div>

			<div className="setting-group-label">{g.systemGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Power} label={g.launchAtLogin} desc={g.launchAtLoginDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Download}
					label={g.updateIndicator}
					desc={g.updateIndicatorDesc}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={showUpdateIndicator} onChange={toggleUpdateIndicator} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Clock} label={g.timeFormat24h} desc={g.timeFormat24hDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Keyboard}
					label={g.openSettingsHotkey}
					desc={g.openSettingsHotkeyDesc}
				>
					<HotkeyRecorder
						value={openSettingsHotkey}
						recording={recordingHotkey}
						onStart={() => setRecordingHotkey(true)}
						onCancel={() => setRecordingHotkey(false)}
						onSave={(combo) => {
							onOpenSettingsHotkeyChange(combo);
							setRecordingHotkey(false);
						}}
					/>
				</SettingRow>

				<SettingRow
					icon={BatteryWarning}
					label={g.lowBatteryAlert}
					desc={g.lowBatteryAlertDesc(lowBatteryThreshold)}
					divider={false}
				>
					<input
						type="range"
						min="5"
						max="50"
						step="5"
						value={lowBatteryThreshold}
						onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label">{g.appGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label={g.resetToDefaults}
					desc={g.resetToDefaultsDesc}
					action
					danger
					onClick={resetToDefaults}
				/>
				<SettingRow
					icon={RefreshCw}
					label={g.restartZenith}
					desc={g.restartZenithDesc}
					action
					onClick={restartZenith}
				/>
				<SettingRow
					icon={LogOut}
					label={g.quitZenith}
					desc={g.quitZenithDesc}
					action
					danger
					onClick={quitZenith}
					divider={false}
				/>
			</div>
		</>
	);
}
