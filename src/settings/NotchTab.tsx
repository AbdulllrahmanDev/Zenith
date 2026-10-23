import {
	PanelTop,
	Calendar,
	BellRing,
	Music,
	Minimize2,
	LayoutList,
	Sparkles,
	Circle,
	CloudSun,
	Timer,
	Archive,
	X,
	Monitor,
	Moon,
	Volume2,
	Square,
	Clock
} from "lucide-react";
import { useState, useRef } from "react";
import { SettingRow } from "./SettingRow";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import type { DisplayInfo } from "../dockApps";

interface NotchTabProps {
	notchMode: string;
	setNotchModeValue: (mode: string) => void;
	notchEdgeDelay: number;
	handleNotchEdgeDelayChange: (val: number) => void;
	notchDisplay: string;
	setNotchDisplayValue: (val: string) => void;
	displays: DisplayInfo[];
	calendarEnabled: boolean;
	toggleCalendar: () => void;
	notchRememberPanel: boolean;
	toggleNotchRememberPanel: () => void;
	notchDefaultPanel: "calendar" | "command-center" | "prayer";
	changeNotchDefaultPanel: (panel: "calendar" | "command-center" | "prayer") => void;
	prayerEnabled: boolean;
	togglePrayer: () => void;
	prayerCity: string;
	setPrayerCityValue: (val: string) => void;
	prayerCountry: string;
	setPrayerCountryValue: (val: string) => void;
	prayerMethod: string;
	setPrayerMethodValue: (val: string) => void;
	prayerTimeOffset: string;
	setPrayerTimeOffsetValue: (val: string) => void;
	prayerAlertType: string;
	setPrayerAlertTypeValue: (val: string) => void;
	prayerPreAlert: boolean;
	togglePrayerPreAlert: () => void;
	timerSoundEnabled: boolean;
	toggleTimerSound: () => void;
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	musicCompactNotch: boolean;
	toggleMusicCompactNotch: () => void;
	shelfPersist: boolean;
	toggleShelfPersist: () => void;
	mediaLayout: "classic" | "compact";
	toggleMediaLayout: (layout: "classic" | "compact") => void;
	mediaAmbienceEnabled: boolean;
	toggleAmbience: () => void;
	mediaCompactGlowEnabled: boolean;
	toggleCompactGlow: () => void;
	weatherEnabled: boolean;
	toggleWeather: () => void;
	tempUnitFahrenheit: boolean;
	toggleTempUnit: () => void;
	cityName: string;
	setCityName: (name: string) => void;
	citySearchResults: Array<{ name: string; country: string; latitude: number; longitude: number }>;
	showCityDropdown: boolean;
	setShowCityDropdown: (show: boolean) => void;
	selectCity: (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => void;
	handleCityClear: () => void;
	statusWidgets: WidgetConfig;
	handleWidgetsChange: (config: WidgetConfig) => void;
}

export function NotchTab({
	notchMode,
	setNotchModeValue,
	notchEdgeDelay,
	handleNotchEdgeDelayChange,
	notchDisplay,
	setNotchDisplayValue,
	displays,
	calendarEnabled,
	toggleCalendar,
	notchRememberPanel,
	toggleNotchRememberPanel,
	notchDefaultPanel,
	changeNotchDefaultPanel,
	prayerEnabled,
	togglePrayer,
	prayerCity,
	setPrayerCityValue,
	prayerCountry,
	setPrayerCountryValue,
	prayerMethod,
	setPrayerMethodValue,
	prayerTimeOffset,
	setPrayerTimeOffsetValue,
	prayerAlertType,
	setPrayerAlertTypeValue,
	prayerPreAlert,
	togglePrayerPreAlert,
	timerSoundEnabled,
	toggleTimerSound,
	musicModeEnabled,
	toggleMusicMode,
	musicCompactNotch,
	toggleMusicCompactNotch,
	shelfPersist,
	toggleShelfPersist,
	mediaLayout,
	toggleMediaLayout,
	mediaAmbienceEnabled,
	toggleAmbience,
	mediaCompactGlowEnabled,
	toggleCompactGlow,
	weatherEnabled,
	toggleWeather,
	tempUnitFahrenheit,
	toggleTempUnit,
	cityName,
	setCityName,
	citySearchResults,
	showCityDropdown,
	setShowCityDropdown,
	selectCity,
	handleCityClear,
	statusWidgets,
	handleWidgetsChange
}: NotchTabProps) {
	const [testingAthan, setTestingAthan] = useState(false);
	const testAudioRef = useRef<HTMLAudioElement | null>(null);

	const handleToggleTestAthan = () => {
		if (testingAthan) {
			if (testAudioRef.current) {
				testAudioRef.current.pause();
				testAudioRef.current.currentTime = 0;
			}
			setTestingAthan(false);
		} else {
			const audio = new Audio("/sounds/athan.mp3");
			testAudioRef.current = audio;
			audio.onended = () => setTestingAthan(false);
			audio.play().catch(() => setTestingAthan(false));
			setTestingAthan(true);
		}
	};
	return (
		<>
			<div className="setting-group-label">Notch</div>
			<div className="setting-group">
				{displays.length > 1 && (
					<SettingRow icon={Monitor} label="Display" desc="Select display to show the notch">
						<select
							className="settings-select"
							value={notchDisplay}
							onChange={(e) => setNotchDisplayValue(e.target.value)}
						>
							<option value="all">All Displays</option>
							{displays.map((disp) => (
								<option key={disp.id} value={disp.id}>
									{disp.name}
								</option>
							))}
						</select>
					</SettingRow>
				)}

				<SettingRow icon={PanelTop} label="Notch Behavior" desc="Choose how the notch appears">
					<select
						className="settings-select"
						value={notchMode}
						onChange={(e) => setNotchModeValue(e.target.value)}
					>
						<option value="fixed">Fixed</option>
						<option value="smart">Smart</option>
						<option value="peek">Peek</option>
					</select>
				</SettingRow>

				{notchMode !== "fixed" && (
					<SettingRow
						icon={Timer}
						label="Peek Delay"
						desc={
							notchEdgeDelay === 0
								? "Reveal instantly on top-edge contact"
								: `Rest on the top edge for ${notchEdgeDelay}ms to reveal`
						}
					>
						<input
							type="range"
							min="0"
							max="800"
							step="50"
							value={notchEdgeDelay}
							onChange={(e) => handleNotchEdgeDelayChange(parseInt(e.target.value))}
							className="settings-slider"
						/>
					</SettingRow>
				)}

				<SettingRow
					icon={PanelTop}
					label="Remember Last Panel"
					desc="Reopen the panel you last used; turn off to choose a fixed default"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={notchRememberPanel} onChange={toggleNotchRememberPanel} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{!notchRememberPanel && (
					<SettingRow icon={PanelTop} label="Default Panel" desc="Open this panel when you click the notch">
						<select
							className="settings-select"
							value={notchDefaultPanel}
							onChange={(e) =>
								changeNotchDefaultPanel(e.target.value as "calendar" | "command-center" | "prayer")
							}
						>
							<option value="calendar" disabled={!calendarEnabled}>Calendar</option>
							<option value="command-center">Command Center</option>
							<option value="prayer" disabled={!prayerEnabled}>Prayer Times</option>
						</select>
					</SettingRow>
				)}

				<SettingRow icon={Calendar} label="Calendar & Timer" desc="Enable productivity split-view">
					<label className="toggle-switch">
						<input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{calendarEnabled && (
					<SettingRow
						icon={BellRing}
						label="Timer Sound"
						desc="Play a chime when the timer finishes"
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				<SettingRow icon={Music} label="Music Mode" desc="Interactive live music widget">
					<label className="toggle-switch">
						<input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{musicModeEnabled && (
					<>
						<SettingRow
							icon={Minimize2}
							label="Compact Mode"
							desc="Show visualizer & artwork when collapsed"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={musicCompactNotch}
									onChange={toggleMusicCompactNotch}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow icon={LayoutList} label="Media Layout" desc="Choose expanded player style">
							<div className="unit-toggle-minimal wide">
								<span
									className={mediaLayout === "classic" ? "active" : ""}
									onClick={() => toggleMediaLayout("classic")}
								>
									Classic
								</span>
								<span
									className={mediaLayout === "compact" ? "active" : ""}
									onClick={() => toggleMediaLayout("compact")}
								>
									Compact
								</span>
							</div>
						</SettingRow>

						<SettingRow
							icon={Sparkles}
							label="Ambient Glow"
							desc="Colored glow behind expanded album art"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label="Compact Glow"
							desc="Glow around collapsed thumbnail"
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={mediaCompactGlowEnabled}
									onChange={toggleCompactGlow}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">Shelf</div>
			<div className="setting-group">
				<SettingRow
					icon={Archive}
					label="Keep Items"
					desc="Keep shelf items after Zenith closes"
					divider={false}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={shelfPersist} onChange={toggleShelfPersist} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label">Prayer Times</div>
			<div className="setting-group">
				<SettingRow
					icon={Moon}
					label="Prayer Times & Athan"
					desc="Show Islamic prayer times & live countdown split-view in the notch"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={prayerEnabled} onChange={togglePrayer} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{prayerEnabled && (
					<>
						<SettingRow
							icon={Clock}
							label="City"
							desc={prayerCity ? `City: ${prayerCity}` : "Auto-detect via IP when empty"}
						>
							<input
								type="text"
								className="settings-text-input"
								placeholder="e.g. Cairo, Dubai, London"
								value={prayerCity}
								onChange={(e) => setPrayerCityValue(e.target.value)}
								style={{ maxWidth: "160px" }}
							/>
						</SettingRow>

						<SettingRow
							icon={Clock}
							label="Country"
							desc={prayerCountry ? `Country: ${prayerCountry}` : "Auto-detect via IP when empty"}
						>
							<input
								type="text"
								className="settings-text-input"
								placeholder="e.g. Egypt, UAE, UK"
								value={prayerCountry}
								onChange={(e) => setPrayerCountryValue(e.target.value)}
								style={{ maxWidth: "160px" }}
							/>
						</SettingRow>

						<SettingRow
							icon={Clock}
							label="Calculation Method"
							desc="Method used to calculate prayer angles"
						>
							<select
								className="settings-select"
								value={prayerMethod}
								onChange={(e) => setPrayerMethodValue(e.target.value)}
							>
								<option value="5">Egyptian General Authority of Survey</option>
								<option value="4">Umm Al-Qura University, Makkah</option>
								<option value="3">Muslim World League (MWL)</option>
								<option value="2">Islamic Society of North America (ISNA)</option>
								<option value="1">University of Islamic Sciences, Karachi</option>
								<option value="13">Diyanet İşleri Başkanlığı, Turkey</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Timer}
							label="Time Offset"
							desc="Adjust for daylight savings or timezone difference"
						>
							<select
								className="settings-select"
								value={prayerTimeOffset}
								onChange={(e) => setPrayerTimeOffsetValue(e.target.value)}
							>
								<option value="-120">-2 hours (-120m)</option>
								<option value="-60">-1 hour (-60m)</option>
								<option value="0">Default (0m)</option>
								<option value="60">+1 hour (+60m)</option>
								<option value="120">+2 hours (+120m)</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Volume2}
							label="Athan Alert"
							desc="Choose how to be notified when prayer time arrives"
						>
							<select
								className="settings-select"
								value={prayerAlertType}
								onChange={(e) => setPrayerAlertTypeValue(e.target.value)}
							>
								<option value="sound_notification">Athan Sound & Notification</option>
								<option value="notification_only">Notification Only</option>
								<option value="off">Off (Silent)</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={BellRing}
							label="15-Minute Pre-Alert"
							desc="Send a notification 15 minutes before prayer time"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={prayerPreAlert}
									onChange={togglePrayerPreAlert}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Volume2}
							label="Test Athan Audio"
							desc="Preview the Athan call to prayer sound"
							action
							divider={false}
							onClick={handleToggleTestAthan}
						>
							<button
								type="button"
								className="settings-action-btn"
								onClick={handleToggleTestAthan}
								style={{
									padding: "6px 14px",
									borderRadius: "8px",
									background: testingAthan ? "#ef4444" : "rgba(255,255,255,0.08)",
									color: "#fff",
									border: "none",
									cursor: "pointer",
									fontSize: "12px",
									fontWeight: 600,
									display: "flex",
									alignItems: "center",
									gap: "6px"
								}}
							>
								{testingAthan ? (
									<>
										<Square size={12} fill="currentColor" /> Stop Audio
									</>
								) : (
									<>
										<Volume2 size={12} /> Play Preview
									</>
								)}
							</button>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">Weather</div>
			<div className="setting-group">
				<SettingRow
					icon={CloudSun}
					label="Weather Status"
					desc={cityName || "Auto-detect location"}
				>
					<div className="weather-controls">
						<div className="unit-toggle-minimal" onClick={toggleTempUnit}>
							<span className={!tempUnitFahrenheit ? "active" : ""}>C</span>
							<span className={tempUnitFahrenheit ? "active" : ""}>F</span>
						</div>
						<label className="toggle-switch">
							<input type="checkbox" checked={weatherEnabled} onChange={toggleWeather} />
							<span className="slider"></span>
						</label>
					</div>
				</SettingRow>

				{weatherEnabled && (
					<div className="manual-city-input">
						<div className="city-input-row">
							<input
								type="text"
								placeholder="Search city..."
								value={cityName}
								onChange={(e) => setCityName(e.target.value)}
								onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && citySearchResults.length > 0) {
										e.preventDefault();
										selectCity(citySearchResults[0]);
									}
									if (e.key === "Escape") {
										setShowCityDropdown(false);
									}
								}}
								onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
							/>
							{cityName && (
								<button
									className="city-clear-btn"
									onMouseDown={(e) => {
										e.preventDefault();
										handleCityClear();
									}}
									title="Clear city"
								>
									<X size={10} strokeWidth={2.5} />
								</button>
							)}
						</div>
						{showCityDropdown && citySearchResults.length > 0 && (
							<div className="city-dropdown">
								{citySearchResults.map((city) => (
									<button
										key={`${city.name}-${city.latitude}`}
										className="city-dropdown-item"
										onMouseDown={(e) => {
											e.preventDefault();
											selectCity(city);
										}}
									>
										<span className="city-dropdown-name">{city.name}</span>
										<span className="city-dropdown-country">{city.country}</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="setting-group-label">Widgets</div>
			<div className="setting-group">
				<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
			</div>
		</>
	);
}
