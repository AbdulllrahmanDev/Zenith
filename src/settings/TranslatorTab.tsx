import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	CheckCircle2,
	ClipboardPaste,
	Clock,
	Cpu,
	Download,
	Eye,
	EyeOff,
	Globe,
	Keyboard,
	Languages,
	PanelTop,
	Play,
	Power,
	Sliders,
	Sparkles,
	Type
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { useI18n } from "../i18n";

export interface LocalDownloadStatus {
	model_downloaded: boolean;
	runtime_ready: boolean;
	ready: boolean;
	downloading: boolean;
	percent: number;
	downloaded_mb: number;
	total_mb: number;
	phase: string;
	error: string | null;
}

export interface TranslatorTabProps {
	translatorEnabled: boolean;
	toggleTranslatorEnabled: () => void;
	translatorEngine: "cloud" | "local";
	handleTranslatorEngineChange: (v: "cloud" | "local") => void;
	translatorProvider: "gemini" | "groq" | "openai" | "custom";
	handleTranslatorProviderChange: (v: "gemini" | "groq" | "openai" | "custom") => void;
	translatorApiKey: string;
	handleTranslatorApiKeyChange: (v: string) => void;
	translatorGroqApiKey: string;
	handleTranslatorGroqApiKeyChange: (v: string) => void;
	translatorOpenaiApiKey: string;
	handleTranslatorOpenaiApiKeyChange: (v: string) => void;
	translatorCustomApiUrl: string;
	handleTranslatorCustomApiUrlChange: (v: string) => void;
	translatorCustomApiKey: string;
	handleTranslatorCustomApiKeyChange: (v: string) => void;
	translatorCustomModel: string;
	handleTranslatorCustomModelChange: (v: string) => void;
	translatorCustomApiFormat: "openai" | "anthropic" | "gemini";
	handleTranslatorCustomApiFormatChange: (v: "openai" | "anthropic" | "gemini") => void;
	translatorTargetLanguage: string;
	handleTranslatorTargetLanguageChange: (v: string) => void;
	translatorOutputMode: "full" | "explain" | "summarize";
	handleTranslatorOutputModeChange: (v: "full" | "explain" | "summarize") => void;
	translatorDisplayTarget: "floating" | "notch";
	handleTranslatorDisplayTargetChange: (v: "floating" | "notch") => void;
	translatorSelectAllFallback: boolean;
	toggleTranslatorSelectAllFallback: () => void;
	translatorAutoPasteArToEn: boolean;
	toggleTranslatorAutoPasteArToEn: () => void;
	translatorHotkeyArToEn: string;
	handleTranslatorHotkeyChange: (key: string, val: string) => void;
	translatorHotkeyAnyToAr: string;
	translatorHotkeyScreen: string;
	translatorHotkeyFullpage: string;
	translatorFontSize: number;
	handleTranslatorFontSizeChange: (v: number) => void;
	translatorCardTimeoutSec: number;
	handleTranslatorCardTimeoutSecChange: (v: number) => void;
	translatorOverlayOpacity: number;
	handleTranslatorOverlayOpacityChange: (v: number) => void;
	translatorCustomPromptInplace: string;
	handleTranslatorCustomPromptInplaceChange: (v: string) => void;
	translatorCustomPromptQuick: string;
	handleTranslatorCustomPromptQuickChange: (v: string) => void;
}

const TARGET_LANGUAGE_KEYS = [
	"Arabic",
	"English",
	"French",
	"Spanish",
	"German",
	"Turkish",
	"Italian",
	"Portuguese",
	"Russian",
	"Chinese",
	"Japanese",
	"Korean",
	"Hindi",
	"Indonesian",
	"Urdu",
	"Dutch"
] as const;

type SpeedTier = "fast" | "good" | "moderate" | "slow";

function formatResponseSpeed(
	ms: number,
	labels: {
		speedSeconds: (sec: string) => string;
		speedFast: string;
		speedGood: string;
		speedModerate: string;
		speedSlow: string;
	}
): { timeLabel: string; ratingLabel: string; tier: SpeedTier } {
	const timeLabel = ms < 1000 ? `${ms} ms` : labels.speedSeconds((ms / 1000).toFixed(2));
	if (ms < 800) {
		return { timeLabel, ratingLabel: labels.speedFast, tier: "fast" };
	}
	if (ms < 2500) {
		return { timeLabel, ratingLabel: labels.speedGood, tier: "good" };
	}
	if (ms < 5000) {
		return { timeLabel, ratingLabel: labels.speedModerate, tier: "moderate" };
	}
	return { timeLabel, ratingLabel: labels.speedSlow, tier: "slow" };
}

export function TranslatorTab(props: TranslatorTabProps) {
	const { t, dir } = useI18n();
	const tr = t.translatorSettings;
	const [showKey, setShowKey] = useState(false);
	const [recordingField, setRecordingField] = useState<string | null>(null);
	const [testState, setTestState] = useState<{
		status: "idle" | "testing" | "ok" | "error";
		text: string;
		elapsedMs?: number;
	}>({
		status: "idle",
		text: ""
	});
	const [localStatus, setLocalStatus] = useState<LocalDownloadStatus>({
		model_downloaded: false,
		runtime_ready: false,
		ready: false,
		downloading: false,
		percent: 0,
		downloaded_mb: 0,
		total_mb: 1010,
		phase: "idle",
		error: null
	});

	useEffect(() => {
		invoke<LocalDownloadStatus>("translator_get_local_status")
			.then(setLocalStatus)
			.catch(() => {});

		let unlisten: (() => void) | undefined;
		listen<LocalDownloadStatus>("translator-download-progress", (ev) => {
			setLocalStatus(ev.payload);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		return () => {
			unlisten?.();
		};
	}, []);

	const currentApiKey =
		props.translatorProvider === "groq"
			? props.translatorGroqApiKey
			: props.translatorProvider === "openai"
				? props.translatorOpenaiApiKey
				: props.translatorProvider === "custom"
					? props.translatorCustomApiKey
					: props.translatorApiKey;

	const handleApiKeyInput = (val: string) => {
		if (props.translatorProvider === "groq") {
			props.handleTranslatorGroqApiKeyChange(val);
		} else if (props.translatorProvider === "openai") {
			props.handleTranslatorOpenaiApiKeyChange(val);
		} else if (props.translatorProvider === "custom") {
			props.handleTranslatorCustomApiKeyChange(val);
		} else {
			props.handleTranslatorApiKeyChange(val);
		}
	};

	useEffect(() => {
		if (testState.status !== "ok") return;
		const timer = window.setTimeout(() => {
			setTestState((prev) => (prev.status === "ok" ? { status: "idle", text: "" } : prev));
		}, 5000);
		return () => window.clearTimeout(timer);
	}, [testState]);

	const runTest = async () => {
		setTestState({ status: "testing", text: tr.testing });
		const startedAt = performance.now();
		try {
			const reply = await invoke<string>("translator_test_connection");
			const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
			setTestState({ status: "ok", text: reply, elapsedMs });
		} catch (e) {
			setTestState({ status: "error", text: String(e) });
		}
	};

	const renderTestBanner = () => {
		if (testState.status === "idle") return null;
		const speed =
			testState.status === "ok" && testState.elapsedMs !== undefined
				? formatResponseSpeed(testState.elapsedMs, tr)
				: null;
		return (
			<div className={`tr-test-banner ${testState.status}`}>
				{testState.status === "ok" && <CheckCircle2 size={14} />}
				{testState.status === "error" && <AlertCircle size={14} />}
				<span className="tr-test-banner-text">{testState.text}</span>
				{speed && (
					<span className={`tr-speed-badge tier-${speed.tier}`}>
						{speed.timeLabel} · {speed.ratingLabel}
					</span>
				)}
			</div>
		);
	};

	const startDownload = () => {
		setTestState({ status: "idle", text: "" });
		invoke("translator_start_download").catch((e) => {
			setLocalStatus((prev) => ({ ...prev, downloading: false, phase: "error", error: String(e) }));
		});
	};

	const cancelDownload = () => {
		invoke("translator_cancel_download").catch(() => {});
	};

	const downloadButtonLabel = (() => {
		if (!localStatus.downloading) {
			if (!localStatus.model_downloaded && !localStatus.runtime_ready) {
				return tr.dlBoth;
			}
			if (!localStatus.runtime_ready) {
				return tr.dlRuntime;
			}
			return tr.dlModel;
		}
		if (localStatus.phase === "extract") {
			return tr.dlExtracting(localStatus.percent);
		}
		if (localStatus.phase === "runtime") {
			return tr.dlDownloadingRuntime(localStatus.percent);
		}
		return tr.dlDownloadingModel(localStatus.percent);
	})();

	const progressPct = Math.max(0, Math.min(100, localStatus.percent));

	return (
		<div className="tab-content translator-tab" dir={dir}>
			<div className="translator-intro">{tr.intro}</div>

			{/* 1. Activation & AI Engine */}
			<div className="setting-group-label">{tr.activationGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Power} label={tr.enabled} desc={tr.enabledDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.translatorEnabled}
							onChange={props.toggleTranslatorEnabled}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={Cpu} label={tr.aiEngine} desc={tr.aiEngineDesc}>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorEngine === "cloud" ? "active" : ""}`}
							onClick={() => props.handleTranslatorEngineChange("cloud")}
						>
							{tr.engineCloud}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorEngine === "local" ? "active" : ""}`}
							onClick={() => props.handleTranslatorEngineChange("local")}
						>
							{tr.engineLocal}
						</button>
					</div>
				</SettingRow>

				{props.translatorEngine === "cloud" ? (
					<>
						<SettingRow icon={Globe} label={tr.cloudProvider} desc={tr.cloudProviderDesc}>
							<select
								className="settings-select"
								value={props.translatorProvider}
								onChange={(e) => {
									setTestState({ status: "idle", text: "" });
									props.handleTranslatorProviderChange(
										e.target.value as "gemini" | "groq" | "openai" | "custom"
									);
								}}
							>
								<option value="gemini">Google Gemini</option>
								<option value="groq">Groq</option>
								<option value="openai">OpenAI</option>
								<option value="custom">{tr.providerCustom}</option>
							</select>
						</SettingRow>

						<div className="tr-api-block">
							{props.translatorProvider === "custom" && (
								<div className="tr-custom-grid">
									<div className="tr-custom-row">
										<div className="tr-custom-field tr-custom-field-grow">
											<label className="tr-custom-label">{tr.customUrlLabel}</label>
											<input
												type="url"
												dir="ltr"
												className="settings-text-input tr-api-input"
												placeholder={
													props.translatorCustomApiFormat === "anthropic"
														? "https://api.anthropic.com"
														: props.translatorCustomApiFormat === "gemini"
															? "https://generativelanguage.googleapis.com"
															: "https://openrouter.ai/api/v1"
												}
												value={props.translatorCustomApiUrl}
												onChange={(e) => props.handleTranslatorCustomApiUrlChange(e.target.value)}
											/>
										</div>
										<div className="tr-custom-field">
											<label className="tr-custom-label">{tr.customFormatLabel}</label>
											<select
												dir="ltr"
												className="settings-select tr-custom-format-select"
												value={props.translatorCustomApiFormat}
												onChange={(e) =>
													props.handleTranslatorCustomApiFormatChange(
														e.target.value as "openai" | "anthropic" | "gemini"
													)
												}
											>
												<option value="openai">OpenAI-Compatible</option>
												<option value="anthropic">Anthropic (Claude)</option>
												<option value="gemini">Google Gemini</option>
											</select>
										</div>
									</div>

									<div className="tr-custom-field">
										<label className="tr-custom-label">{tr.customModelLabel}</label>
										<input
											type="text"
											dir="ltr"
											className="settings-text-input tr-api-input"
											placeholder={
												props.translatorCustomApiFormat === "anthropic"
													? "claude-3-5-haiku-latest"
													: props.translatorCustomApiFormat === "gemini"
														? "gemini-2.5-flash-lite"
														: "gpt-4o-mini / deepseek-chat / qwen2.5:7b"
											}
											value={props.translatorCustomModel}
											onChange={(e) => props.handleTranslatorCustomModelChange(e.target.value)}
										/>
									</div>
								</div>
							)}

							<div className="tr-api-row">
								<input
									type={showKey ? "text" : "password"}
									dir="ltr"
									className="settings-text-input tr-api-input"
									placeholder={
										props.translatorProvider === "groq"
											? "gsk_..."
											: props.translatorProvider === "openai"
												? "sk-..."
												: props.translatorProvider === "custom"
													? tr.customKeyPlaceholder
													: "AIza... / AQ..."
									}
									value={currentApiKey}
									onChange={(e) => handleApiKeyInput(e.target.value)}
								/>
								<button
									type="button"
									className="settings-btn tr-icon-btn"
									onClick={() => setShowKey((s) => !s)}
									title={showKey ? tr.hideKey : tr.showKey}
								>
									{showKey ? <EyeOff size={15} /> : <Eye size={15} />}
								</button>
								<button
									type="button"
									className="settings-btn tr-accent-btn"
									onClick={runTest}
									disabled={testState.status === "testing"}
								>
									<Play size={14} />
									<span>{tr.testConnection}</span>
								</button>
							</div>
							{props.translatorProvider === "custom" && (
								<div className="tr-api-hint">{tr.customHint}</div>
							)}
							{renderTestBanner()}
						</div>
					</>
				) : (
					<div className="tr-local-box">
						<div className="tr-local-header">
							<div>
								<div className="tr-local-title">{tr.localTitle}</div>
								<div className="tr-local-sub">
									{localStatus.ready
										? tr.localReadyDesc
										: localStatus.downloading
											? `${localStatus.downloaded_mb.toFixed(0)} MB / ${localStatus.total_mb.toFixed(0)} MB`
											: tr.localIdleDesc}
								</div>
							</div>
							<div className="tr-local-actions">
								{localStatus.ready && !localStatus.downloading ? (
									<button
										type="button"
										className="settings-btn tr-accent-btn"
										onClick={runTest}
										disabled={testState.status === "testing"}
									>
										<Play size={14} />
										<span>{tr.testReply}</span>
									</button>
								) : (
									<>
										<button
											type="button"
											className={`tr-download-progress-btn ${localStatus.downloading ? "downloading" : ""}`}
											style={
												localStatus.downloading
													? {
															backgroundImage: `linear-gradient(${dir === "rtl" ? "to left" : "to right"}, var(--zenith-accent, #007aff) ${progressPct}%, rgba(255, 255, 255, 0.08) ${progressPct}%)`
														}
													: undefined
											}
											onClick={localStatus.downloading ? undefined : startDownload}
											disabled={localStatus.downloading}
										>
											{!localStatus.downloading && <Download size={14} />}
											<span>{downloadButtonLabel}</span>
										</button>
										{localStatus.downloading && (
											<button
												type="button"
												className="settings-btn"
												onClick={cancelDownload}
											>
												{tr.cancel}
											</button>
										)}
									</>
								)}
							</div>
						</div>

						{localStatus.error && (
							<div className="tr-test-banner error">
								<AlertCircle size={14} />
								<span className="tr-test-banner-text">{localStatus.error}</span>
							</div>
						)}
						{renderTestBanner()}
					</div>
				)}
			</div>

			{/* 2. Modes & Behavior */}
			<div className="setting-group-label">{tr.modesGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Languages} label={tr.targetLanguage} desc={tr.targetLanguageDesc}>
					<select
						className="settings-select"
						value={props.translatorTargetLanguage}
						onChange={(e) => props.handleTranslatorTargetLanguageChange(e.target.value)}
					>
						{TARGET_LANGUAGE_KEYS.map((langKey) => (
							<option key={langKey} value={langKey}>
								{tr.targetLanguages[langKey]}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow icon={Sliders} label={tr.outputMode} desc={tr.outputModeDesc}>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "full" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("full")}
						>
							{tr.modeFull}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "explain" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("explain")}
						>
							{tr.modeExplain}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "summarize" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("summarize")}
						>
							{tr.modeSummarize}
						</button>
					</div>
				</SettingRow>

				<SettingRow icon={PanelTop} label={tr.displayTarget} desc={tr.displayTargetDesc}>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorDisplayTarget === "floating" ? "active" : ""}`}
							onClick={() => props.handleTranslatorDisplayTargetChange("floating")}
						>
							{tr.displayFloating}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorDisplayTarget === "notch" ? "active" : ""}`}
							onClick={() => props.handleTranslatorDisplayTargetChange("notch")}
						>
							{tr.displayNotch}
						</button>
					</div>
				</SettingRow>

				<SettingRow icon={ClipboardPaste} label={tr.autoPasteArToEn} desc={tr.autoPasteArToEnDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.translatorAutoPasteArToEn}
							onChange={props.toggleTranslatorAutoPasteArToEn}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={Sparkles} label={tr.selectAllFallback} desc={tr.selectAllFallbackDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.translatorSelectAllFallback}
							onChange={props.toggleTranslatorSelectAllFallback}
						/>
						<span className="slider" />
					</label>
				</SettingRow>
			</div>

			{/* 3. Global Hotkeys */}
			<div className="setting-group-label">{tr.hotkeysGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Keyboard} label={tr.hkArToEn} desc={tr.hkArToEnDesc}>
					<HotkeyRecorder
						value={props.translatorHotkeyArToEn}
						recording={recordingField === "ar_to_en"}
						onStart={() => setRecordingField("ar_to_en")}
						onCancel={() => setRecordingField(null)}
						onSave={(combo) => {
							props.handleTranslatorHotkeyChange("zenith-translator-hotkey-ar-to-en", combo);
							setRecordingField(null);
						}}
					/>
				</SettingRow>

				<SettingRow icon={Keyboard} label={tr.hkAnyToAr} desc={tr.hkAnyToArDesc}>
					<HotkeyRecorder
						value={props.translatorHotkeyAnyToAr}
						recording={recordingField === "any_to_ar"}
						onStart={() => setRecordingField("any_to_ar")}
						onCancel={() => setRecordingField(null)}
						onSave={(combo) => {
							props.handleTranslatorHotkeyChange("zenith-translator-hotkey-any-to-ar", combo);
							setRecordingField(null);
						}}
					/>
				</SettingRow>

				<SettingRow icon={Keyboard} label={tr.hkScreen} desc={tr.hkScreenDesc}>
					<HotkeyRecorder
						value={props.translatorHotkeyScreen}
						recording={recordingField === "screen"}
						onStart={() => setRecordingField("screen")}
						onCancel={() => setRecordingField(null)}
						onSave={(combo) => {
							props.handleTranslatorHotkeyChange("zenith-translator-hotkey-screen", combo);
							setRecordingField(null);
						}}
					/>
				</SettingRow>

				<SettingRow icon={Keyboard} label={tr.hkFullpage} desc={tr.hkFullpageDesc}>
					<HotkeyRecorder
						value={props.translatorHotkeyFullpage}
						recording={recordingField === "fullpage"}
						onStart={() => setRecordingField("fullpage")}
						onCancel={() => setRecordingField(null)}
						onSave={(combo) => {
							props.handleTranslatorHotkeyChange("zenith-translator-hotkey-fullpage", combo);
							setRecordingField(null);
						}}
					/>
				</SettingRow>
			</div>

			{/* 4. Appearance & Prompts */}
			<div className="setting-group-label">{tr.appearanceGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={Type}
					label={tr.fontSize(props.translatorFontSize)}
					desc={tr.fontSizeDesc}
				>
					<div className="range-wrapper">
						<input
							type="range"
							min={11}
							max={28}
							step={1}
							value={props.translatorFontSize}
							onChange={(e) => props.handleTranslatorFontSizeChange(Number(e.target.value))}
						/>
						<span className="range-val">{props.translatorFontSize}px</span>
					</div>
				</SettingRow>

				<SettingRow
					icon={Clock}
					label={tr.cardTimeout(props.translatorCardTimeoutSec)}
					desc={tr.cardTimeoutDesc}
				>
					<div className="range-wrapper">
						<input
							type="range"
							min={3}
							max={60}
							step={1}
							value={props.translatorCardTimeoutSec}
							onChange={(e) => props.handleTranslatorCardTimeoutSecChange(Number(e.target.value))}
						/>
						<span className="range-val">{props.translatorCardTimeoutSec}s</span>
					</div>
				</SettingRow>

				<SettingRow
					icon={Eye}
					label={tr.overlayOpacity(props.translatorOverlayOpacity)}
					desc={tr.overlayOpacityDesc}
				>
					<div className="range-wrapper">
						<input
							type="range"
							min={40}
							max={100}
							step={2}
							value={props.translatorOverlayOpacity}
							onChange={(e) => props.handleTranslatorOverlayOpacityChange(Number(e.target.value))}
						/>
						<span className="range-val">{props.translatorOverlayOpacity}%</span>
					</div>
				</SettingRow>

				<div className="tr-prompts-block">
					<div className="tr-prompt-field">
						<label className="tr-prompt-label">{tr.customPromptInplace}</label>
						<textarea
							className="tr-prompt-textarea"
							rows={2}
							placeholder={tr.customPromptPlaceholder}
							value={props.translatorCustomPromptInplace}
							onChange={(e) => props.handleTranslatorCustomPromptInplaceChange(e.target.value)}
						/>
					</div>
					<div className="tr-prompt-field">
						<label className="tr-prompt-label">{tr.customPromptQuick}</label>
						<textarea
							className="tr-prompt-textarea"
							rows={2}
							placeholder={tr.customPromptPlaceholder}
							value={props.translatorCustomPromptQuick}
							onChange={(e) => props.handleTranslatorCustomPromptQuickChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
