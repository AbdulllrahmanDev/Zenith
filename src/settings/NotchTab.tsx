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
	RotateCcw
} from "lucide-react";
import { useState, useRef } from "react";
import { SettingRow } from "./SettingRow";
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
	notchDefaultPanel: "calendar" | "command-center" | "prayer";
	changeNotchDefaultPanel: (panel: "calendar" | "command-center" | "prayer") => void;
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

	const handleDetectDeviceLocation = () => {
		if (!navigator.geolocation) {
			setGpsStatusMsg("Geolocation is not supported by your browser or system.");
			return;
		}
		setDetectingGps(true);
		setGpsStatusMsg(null);

		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				const { latitude, longitude } = pos.coords;
				try {
					const res = await fetch(
						`https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${latitude}&longitude=${longitude}&count=1&format=json`
					);
					let label = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
					if (res.ok) {
						const data = await res.json();
						if (data?.results?.[0]?.name) {
							label = `${data.results[0].name}${data.results[0].country ? `, ${data.results[0].country}` : ""}`;
						}
					}
					localStorage.setItem("bloom-prayer-lat", String(latitude));
					localStorage.setItem("bloom-prayer-lon", String(longitude));
					window.dispatchEvent(new Event("storage"));
					setGpsStatusMsg(`Location acquired: ${label}`);
				} catch {
					setGpsStatusMsg(`Coordinates acquired: ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`);
				} finally {
					setDetectingGps(false);
				}
			},
			(err) => {
				setDetectingGps(false);
				if (err.code === 1) {
					setGpsStatusMsg("Windows location permission is disabled. Falling back to IP-based detection.");
				} else {
					setGpsStatusMsg("Could not retrieve GPS location. Falling back to IP-based detection.");
				}
			},
			{ enableHighAccuracy: true, timeout: 8000 }
		);
	};

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
						{/* Location Mode: Auto vs Manual */}
						<SettingRow
							icon={MapPin}
							label="Location Mode"
							desc={
								prayerLocationMode === "auto"
									? "Auto-detect location from device (GPS / IP)"
									: "Select country and city manually"
							}
						>
							<select
								className="settings-select"
								value={prayerLocationMode}
								onChange={(e) =>
									setPrayerLocationModeValue(e.target.value as "auto" | "manual")
								}
							>
								<option value="auto">Auto-detect (GPS / IP)</option>
								<option value="manual">Manual Selection</option>
							</select>
						</SettingRow>

						{/* AUTO MODE: GPS detect button and status (City/Country completely hidden) */}
						{prayerLocationMode === "auto" && (
							<SettingRow
								icon={Navigation}
								label="Device Location"
								desc={
									gpsStatusMsg
										? gpsStatusMsg
										: "Detects device GPS location (or falls back to IP network)"
								}
							>
								<button
									type="button"
									className="settings-btn-detect"
									onClick={handleDetectDeviceLocation}
									disabled={detectingGps}
									title="Request device location"
								>
									<RotateCcw size={11} className={detectingGps ? "animate-spin" : ""} />
									<span>{detectingGps ? "Detecting..." : "Detect Device GPS"}</span>
								</button>
							</SettingRow>
						)}

						{/* MANUAL MODE: Country first, then dependent City dropdown */}
						{prayerLocationMode === "manual" && (
							<>
								<SettingRow
									icon={Globe}
									label="Country"
									desc={
										customCountryMode
											? "Type custom country name"
											: "Select your country from the list"
									}
								>
									{customCountryMode ? (
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<input
												type="text"
												className="settings-text-input"
												placeholder="Enter country..."
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
												List
											</button>
										</div>
									) : (
										<select
											className="settings-select"
											value={matchedCountry ? matchedCountry.country : ""}
											onChange={(e) => handleCountryChange(e.target.value)}
											style={{ maxWidth: "190px" }}
										>
											<option value="" disabled>
												Select Country...
											</option>
											{POPULAR_PRAYER_COUNTRIES.map((c) => (
												<option key={c.country} value={c.country}>
													{c.country} ({c.countryAr})
												</option>
											))}
											<option value="custom">Other / Custom...</option>
										</select>
									)}
								</SettingRow>

								<SettingRow
									icon={Building2}
									label="City"
									desc={
										!prayerCountry && !customCountryMode
											? "Choose a country first to view cities"
											: customCityMode
												? "Type custom city name"
												: `Select city in ${prayerCountry}`
									}
								>
									{customCityMode || customCountryMode ? (
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<input
												type="text"
												className="settings-text-input"
												placeholder="Enter city..."
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
													List
												</button>
											)}
										</div>
									) : (
										<select
											className="settings-select"
											value={prayerCity}
											onChange={(e) => handleCityChange(e.target.value)}
											disabled={!matchedCountry || matchedCountry.cities.length === 0}
											style={{ maxWidth: "190px" }}
										>
											<option value="" disabled>
												{matchedCountry ? "Select City..." : "Select Country First"}
											</option>
											{matchedCountry?.cities.map((city) => (
												<option key={city.name} value={city.name}>
													{city.name} ({city.nameAr})
												</option>
											))}
											<option value="custom">Other City...</option>
										</select>
									)}
								</SettingRow>
							</>
						)}

						{/* Calculation Method */}
						<SettingRow
							icon={Compass}
							label="Calculation Method"
							desc="Method used to calculate prayer angles"
						>
							<select
								className="settings-select"
								value={prayerMethod}
								onChange={(e) => setPrayerMethodValue(e.target.value)}
								style={{ maxWidth: "190px" }}
							>
								<option value="4">Umm Al-Qura (Makkah)</option>
								<option value="5">Egyptian General Authority</option>
								<option value="3">Muslim World League (MWL)</option>
								<option value="2">ISNA (North America)</option>
								<option value="1">Univ. of Islamic Sciences (Karachi)</option>
								<option value="13">Diyanet (Turkey)</option>
								<option value="8">Gulf Region</option>
								<option value="9">Kuwait</option>
								<option value="10">Qatar</option>
							</select>
						</SettingRow>

						{/* Time Offset */}
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

						{/* Athan Alert */}
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

						{/* 15-Minute Pre-Alert */}
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

						{/* Test Athan Audio */}
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
										<span>Stop Preview</span>
									</>
								) : (
									<>
										<Volume2 size={12} />
										<span>Play Audio</span>
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
