import {
	PanelTop,
	Calendar,
	BellRing,
	Music,
	Minimize2,
	LayoutList,
	Circle,
	CloudSun,
	Timer,
	Archive,
	X,
	Monitor,
	Moon,
	Volume2,
	Square,
	Sparkles,
	MapPin,
	Globe,
	Building2,
	Navigation,
	Compass,
	RotateCcw,
	Bell,
	BellOff,
	VolumeX,
	Check
} from "lucide-react";
import { useState, useRef } from "react";
import { useI18n } from "../i18n";
import { triggerTestAthan, triggerTestNotification } from "../hooks/usePrayerTimes";
import { detectLocation } from "../utils/locationService";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import type { DisplayInfo } from "../dockApps";
import { POPULAR_PRAYER_COUNTRIES, findCountry } from "../utils/prayerLocations";

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
	notchDefaultPanel: "calendar" | "command-center" | "prayer" | "tasks" | "ai-chat";
	changeNotchDefaultPanel: (panel: "calendar" | "command-center" | "prayer" | "tasks" | "ai-chat") => void;
	tasksEnabled: boolean;
	aiChatEnabled: boolean;
	prayerEnabled: boolean;
	togglePrayer: () => void;
	prayerLocationMode: "auto" | "manual";
	setPrayerLocationModeValue: (val: "auto" | "manual") => void;
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
	setPrayerCoordsValue: (lat: string, lon: string, city?: string, country?: string) => void;
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
	notificationsEnabled: boolean;
	toggleNotifications: () => void;
	notificationsSilent: boolean;
	toggleNotificationsSilent: () => void;
	notificationsNotchEnabled: boolean;
	toggleNotificationsNotch: () => void;
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
	tasksEnabled,
	aiChatEnabled,
	prayerEnabled,
	togglePrayer,
	prayerLocationMode,
	setPrayerLocationModeValue,
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
	setPrayerCoordsValue,
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
	handleWidgetsChange,
	notificationsEnabled,
	toggleNotifications,
	notificationsSilent,
	toggleNotificationsSilent,
	notificationsNotchEnabled,
	toggleNotificationsNotch
}: NotchTabProps) {
	const { t, lang } = useI18n();
	const n = t.notch;
	const [testNotificationSent, setTestNotificationSent] = useState(false);
	const [testingAthan, setTestingAthan] = useState(false);
	const testAudioRef = useRef<HTMLAudioElement | null>(null);

	const [detectingGps, setDetectingGps] = useState(false);
	const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
	const [customCountryMode, setCustomCountryMode] = useState(() => {
		return Boolean(prayerCountry && !findCountry(prayerCountry));
	});
	const [customCityMode, setCustomCityMode] = useState(() => {
		const matched = findCountry(prayerCountry);
		return Boolean(
			prayerCity &&
				(!matched || !matched.cities.some((c) => c.name.toLowerCase() === prayerCity.toLowerCase()))
		);
	});

	const matchedCountry = findCountry(prayerCountry);

	const handleCountryChange = (countryName: string) => {
		if (countryName === "custom") {
			setCustomCountryMode(true);
			setCustomCityMode(true);
			return;
		}
		setCustomCountryMode(false);
		setPrayerCountryValue(countryName);
		const cObj = POPULAR_PRAYER_COUNTRIES.find((c) => c.country === countryName);
		if (cObj && cObj.cities.length > 0) {
			const currentCityValid = cObj.cities.some(
				(c) => c.name.toLowerCase() === prayerCity.toLowerCase()
			);
			if (!currentCityValid) {
				setPrayerCityValue(cObj.cities[0].name);
				setCustomCityMode(false);
			}
		} else {
			setPrayerCityValue("");
		}
	};

	const handleCityChange = (cityName: string) => {
		if (cityName === "custom") {
			setCustomCityMode(true);
			return;
		}
		setCustomCityMode(false);
		setPrayerCityValue(cityName);
	};

	const handleDetectDeviceLocation = async () => {
		setDetectingGps(true);
		setGpsStatusMsg(null);

		try {
			const detected = await detectLocation({ allowGps: true, forceRefresh: true });
			if (detected) {
				const city = detected.city || "";
				const country = detected.country || "";
				setPrayerCoordsValue(String(detected.latitude), String(detected.longitude), city, country);
				setGpsStatusMsg(n.locationAcquired(detected.label));
			} else {
				setGpsStatusMsg(n.locationFailed);
			}
		} catch {
			setGpsStatusMsg(n.locationError);
		} finally {
			setDetectingGps(false);
		}
	};

	const handleToggleTestAthan = () => {
		if (testingAthan) {
			if (testAudioRef.current) {
				testAudioRef.current.pause();
				testAudioRef.current.currentTime = 0;
			}
			setTestingAthan(false);
		} else {
			triggerTestAthan("Asr");
			const audio = new Audio("/sounds/athan.mp3");
			testAudioRef.current = audio;
			audio.onended = () => setTestingAthan(false);
			audio.play().catch(() => setTestingAthan(false));
			setTestingAthan(true);
		}
	};

	const handleTestNotification = () => {
		triggerTestNotification();
		setTestNotificationSent(true);
		setTimeout(() => setTestNotificationSent(false), 3000);
	};
	return (
		<>
			<div className="setting-group-label">{n.notchGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={Monitor}
					label={n.display}
					desc={displays.length > 1 ? n.displayMultiDesc : n.displaySingleDesc}
				>
					<ZenithSelect
						className="settings-select"
						value={displays.length <= 1 ? "primary" : notchDisplay}
						disabled={displays.length <= 1}
						onChange={(e) => setNotchDisplayValue(e.target.value)}
					>
						<option value="primary">{n.primaryDisplay}</option>
						<option value="all">{n.allDisplays}</option>
						{displays.length > 1 &&
							displays.map((disp) => (
								<option key={disp.id} value={disp.id}>
									{disp.name.includes(`${disp.width}x${disp.height}`)
										? disp.name
										: `${disp.name} (${disp.width}x${disp.height})`}
								</option>
							))}
					</ZenithSelect>
				</SettingRow>

				<SettingRow icon={PanelTop} label={n.notchBehavior} desc={n.notchBehaviorDesc}>
					<ZenithSelect
						className="settings-select"
						value={notchMode}
						onChange={(e) => setNotchModeValue(e.target.value)}
					>
						<option value="fixed">{n.modeFixed}</option>
						<option value="smart">{n.modeSmart}</option>
						<option value="peek">{n.modePeek}</option>
					</ZenithSelect>
				</SettingRow>

				{notchMode !== "fixed" && (
					<SettingRow
						icon={Timer}
						label={n.peekDelay}
						desc={notchEdgeDelay === 0 ? n.peekDelayInstant : n.peekDelayMs(notchEdgeDelay)}
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
					label={n.rememberLastPanel}
					desc={n.rememberLastPanelDesc}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={notchRememberPanel} onChange={toggleNotchRememberPanel} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{!notchRememberPanel && (
					<SettingRow icon={PanelTop} label={n.defaultPanel} desc={n.defaultPanelDesc}>
						<ZenithSelect
							className="settings-select"
							value={notchDefaultPanel}
							onChange={(e) =>
								changeNotchDefaultPanel(
									e.target.value as "calendar" | "command-center" | "prayer" | "tasks" | "ai-chat"
								)
							}
						>
							<option value="calendar" disabled={!calendarEnabled}>{n.panelCalendar}</option>
							<option value="command-center">{n.panelCommandCenter}</option>
							<option value="prayer" disabled={!prayerEnabled}>{n.panelPrayer}</option>
							<option value="tasks" disabled={!tasksEnabled}>{n.panelTasks}</option>
							<option value="ai-chat" disabled={!aiChatEnabled}>{n.panelAiChat}</option>
						</ZenithSelect>
					</SettingRow>
				)}

				<SettingRow icon={Calendar} label={n.calendarTimer} desc={n.calendarTimerDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{calendarEnabled && (
					<SettingRow
						icon={BellRing}
						label={n.timerSound}
						desc={n.timerSoundDesc}
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				<SettingRow icon={Music} label={n.musicMode} desc={n.musicModeDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{musicModeEnabled && (
					<>
						<SettingRow
							icon={Minimize2}
							label={n.compactMode}
							desc={n.compactModeDesc}
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

						<SettingRow icon={LayoutList} label={n.mediaLayout} desc={n.mediaLayoutDesc}>
							<div className="unit-toggle-minimal wide">
								<span
									className={mediaLayout === "classic" ? "active" : ""}
									onClick={() => toggleMediaLayout("classic")}
								>
									{n.layoutClassic}
								</span>
								<span
									className={mediaLayout === "compact" ? "active" : ""}
									onClick={() => toggleMediaLayout("compact")}
								>
									{n.layoutCompact}
								</span>
							</div>
						</SettingRow>

						<SettingRow
							icon={Sparkles}
							label={n.ambientGlow}
							desc={n.ambientGlowDesc}
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label={n.compactGlow}
							desc={n.compactGlowDesc}
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

			<div className="setting-group-label">{n.notificationsGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={notificationsEnabled ? Bell : BellOff}
					label={n.enableNotifications}
					desc={n.enableNotificationsDesc}
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

				<SettingRow
					icon={VolumeX}
					label={n.silentMode}
					desc={n.silentModeDesc}
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

				<SettingRow
					icon={PanelTop}
					label={n.showInNotch}
					desc={notificationsNotchEnabled ? n.showInNotchOnDesc : n.showInNotchOffDesc}
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

				<SettingRow
					icon={testNotificationSent ? Check : BellRing}
					label={n.testNotification}
					desc={
						testNotificationSent
							? n.testNotificationSentDesc
							: notificationsNotchEnabled
							? n.testNotificationNotchDesc
							: n.testNotificationWinDesc
					}
					action
					divider={false}
					onClick={handleTestNotification}
				>
					<button
						type="button"
						className="settings-btn-detect"
						onClick={(e) => {
							e.stopPropagation();
							handleTestNotification();
						}}
						style={{
							padding: "5px 12px",
							background: testNotificationSent ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
							borderColor: testNotificationSent ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.15)",
							color: testNotificationSent ? "#34d399" : "#ffffff",
							borderRadius: 6,
							fontSize: 11,
							fontWeight: 500,
							display: "flex",
							alignItems: "center",
							gap: 6,
							transition: "all 0.2s ease"
						}}
					>
						{testNotificationSent ? (
							<>
								<Check size={12} strokeWidth={2.5} />
								<span>{n.sent}</span>
							</>
						) : (
							<>
								<Bell size={12} strokeWidth={2} />
								<span>{n.testNotification}</span>
							</>
						)}
					</button>
				</SettingRow>
			</div>

			<div className="setting-group-label">{n.shelfGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={Archive}
					label={n.keepItems}
					desc={n.keepItemsDesc}
					divider={false}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={shelfPersist} onChange={toggleShelfPersist} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label">{n.prayerGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={Moon}
					label={n.prayerEnable}
					desc={n.prayerEnableDesc}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={prayerEnabled} onChange={togglePrayer} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{prayerEnabled && (
					<>
						{/* Location Mode: Auto vs Manual */}
						<SettingRow
							icon={MapPin}
							label={n.locationMode}
							desc={
								prayerLocationMode === "auto"
									? n.locationModeAutoDesc
									: n.locationModeManualDesc
							}
						>
							<ZenithSelect
								className="settings-select"
								value={prayerLocationMode}
								onChange={(e) =>
									setPrayerLocationModeValue(e.target.value as "auto" | "manual")
								}
							>
								<option value="auto">{n.locationAutoOpt}</option>
								<option value="manual">{n.locationManualOpt}</option>
							</ZenithSelect>
						</SettingRow>

						{/* AUTO MODE: GPS detect button and status (City/Country completely hidden) */}
						{prayerLocationMode === "auto" && (
							<SettingRow
								icon={Navigation}
								label={n.deviceLocation}
								desc={gpsStatusMsg ? gpsStatusMsg : n.deviceLocationDefaultDesc}
							>
								<button
									type="button"
									className="settings-btn-detect"
									onClick={handleDetectDeviceLocation}
									disabled={detectingGps}
									title={n.detectLocationTitle}
								>
									<RotateCcw size={11} className={detectingGps ? "animate-spin" : ""} />
									<span>{detectingGps ? n.detecting : n.autoDetectBtn}</span>
								</button>
							</SettingRow>
						)}

						{/* MANUAL MODE: Country first, then dependent City dropdown */}
						{prayerLocationMode === "manual" && (
							<>
								<SettingRow
									icon={Globe}
									label={n.country}
									desc={customCountryMode ? n.countryCustomDesc : n.countryListDesc}
								>
									{customCountryMode ? (
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<input
												type="text"
												className="settings-text-input"
												placeholder={n.countryPlaceholder}
												value={prayerCountry}
												onChange={(e) => setPrayerCountryValue(e.target.value)}
												style={{ width: "135px" }}
											/>
											<button
												type="button"
												className="settings-btn-detect"
												onClick={() => {
													setCustomCountryMode(false);
													if (POPULAR_PRAYER_COUNTRIES.length > 0) {
														handleCountryChange(POPULAR_PRAYER_COUNTRIES[0].country);
													}
												}}
												style={{ padding: "4px 8px" }}
											>
												{t.common.list}
											</button>
										</div>
									) : (
										<ZenithSelect
											className="settings-select"
											value={matchedCountry ? matchedCountry.country : ""}
											onChange={(e) => handleCountryChange(e.target.value)}
											style={{ maxWidth: "190px" }}
										>
											<option value="" disabled>
												{n.selectCountry}
											</option>
											{POPULAR_PRAYER_COUNTRIES.map((c) => (
												<option key={c.country} value={c.country}>
													{lang === "ar" ? `${c.countryAr} (${c.country})` : `${c.country} (${c.countryAr})`}
												</option>
											))}
											<option value="custom">{n.otherCustomCountry}</option>
										</ZenithSelect>
									)}
								</SettingRow>

								<SettingRow
									icon={Building2}
									label={n.city}
									desc={
										!prayerCountry && !customCountryMode
											? n.cityChooseCountryFirst
											: customCityMode
												? n.cityCustomDesc
												: n.citySelectInCountry(
														lang === "ar" && matchedCountry
															? matchedCountry.countryAr
															: prayerCountry
													)
									}
								>
									{customCityMode || customCountryMode ? (
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<input
												type="text"
												className="settings-text-input"
												placeholder={n.cityPlaceholder}
												value={prayerCity}
												onChange={(e) => setPrayerCityValue(e.target.value)}
												style={{ width: "135px" }}
											/>
											{!customCountryMode && matchedCountry && (
												<button
													type="button"
													className="settings-btn-detect"
													onClick={() => {
														setCustomCityMode(false);
														if (matchedCountry.cities.length > 0) {
															setPrayerCityValue(matchedCountry.cities[0].name);
														}
													}}
													style={{ padding: "4px 8px" }}
												>
													{t.common.list}
												</button>
											)}
										</div>
									) : (
										<ZenithSelect
											className="settings-select"
											value={prayerCity}
											onChange={(e) => handleCityChange(e.target.value)}
											disabled={!matchedCountry || matchedCountry.cities.length === 0}
											style={{ maxWidth: "190px" }}
										>
											<option value="" disabled>
												{matchedCountry ? n.selectCity : n.selectCountryFirst}
											</option>
											{matchedCountry?.cities.map((city) => (
												<option key={city.name} value={city.name}>
													{lang === "ar" ? `${city.nameAr} (${city.name})` : `${city.name} (${city.nameAr})`}
												</option>
											))}
											<option value="custom">{n.otherCity}</option>
										</ZenithSelect>
									)}
								</SettingRow>
							</>
						)}

						{/* Calculation Method */}
						<SettingRow
							icon={Compass}
							label={n.calcMethod}
							desc={n.calcMethodDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={prayerMethod}
								onChange={(e) => setPrayerMethodValue(e.target.value)}
								style={{ maxWidth: "190px" }}
							>
								<option value="4">{n.calcMethods["4"]}</option>
								<option value="5">{n.calcMethods["5"]}</option>
								<option value="3">{n.calcMethods["3"]}</option>
								<option value="2">{n.calcMethods["2"]}</option>
								<option value="1">{n.calcMethods["1"]}</option>
								<option value="13">{n.calcMethods["13"]}</option>
								<option value="8">{n.calcMethods["8"]}</option>
								<option value="9">{n.calcMethods["9"]}</option>
								<option value="10">{n.calcMethods["10"]}</option>
							</ZenithSelect>
						</SettingRow>

						{/* Time Offset */}
						<SettingRow
							icon={Timer}
							label={n.timeOffset}
							desc={n.timeOffsetDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={prayerTimeOffset}
								onChange={(e) => setPrayerTimeOffsetValue(e.target.value)}
							>
								<option value="-120">{n.offsetNeg2}</option>
								<option value="-60">{n.offsetNeg1}</option>
								<option value="0">{n.offsetZero}</option>
								<option value="60">{n.offsetPos1}</option>
								<option value="120">{n.offsetPos2}</option>
							</ZenithSelect>
						</SettingRow>

						{/* Athan Alert */}
						<SettingRow
							icon={Volume2}
							label={n.athanAlert}
							desc={n.athanAlertDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={prayerAlertType}
								onChange={(e) => setPrayerAlertTypeValue(e.target.value)}
							>
								<option value="sound_notification">{n.alertSoundNotification}</option>
								<option value="notification_only">{n.alertNotificationOnly}</option>
								<option value="off">{n.alertOff}</option>
							</ZenithSelect>
						</SettingRow>

						{/* 15-Minute Pre-Alert */}
						<SettingRow
							icon={BellRing}
							label={n.preAlert}
							desc={n.preAlertDesc}
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

						{/* Test Athan Audio */}
						<SettingRow
							icon={Volume2}
							label={n.testAthan}
							desc={n.testAthanDesc}
							action
							divider={false}
							onClick={handleToggleTestAthan}
						>
							<button
								type="button"
								className="settings-btn-detect"
								onClick={handleToggleTestAthan}
								style={{
									padding: "5px 12px",
									background: testingAthan ? "#ef4444" : undefined,
									color: "#fff"
								}}
							>
								{testingAthan ? (
									<>
										<Square size={10} fill="currentColor" />
										<span>{n.stopPreview}</span>
									</>
								) : (
									<>
										<Volume2 size={12} />
										<span>{n.playAudio}</span>
									</>
								)}
							</button>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">{n.weatherGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={CloudSun}
					label={n.weatherStatus}
					desc={cityName || n.weatherAutoDetect}
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
								placeholder={n.searchCityPlaceholder}
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
									title={n.clearCityTitle}
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

			<div className="setting-group-label">{n.widgetsGroup}</div>
			<div className="setting-group">
				<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
			</div>
		</>
	);
}
