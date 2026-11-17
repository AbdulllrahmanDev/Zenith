import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	CheckCircle2,
	Cpu,
	Download,
	Eye,
	EyeOff,
	Globe,
	MessageSquare,
	Play,
	Power
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithAiIcon } from "../icons/ZenithAiIcon";
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

export interface AiTabProps {
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
	aiChatEnabled: boolean;
	toggleAiChatEnabled: () => void;
	aiChatProvider: "inherit" | "gemini" | "groq" | "openai" | "custom" | "local";
	handleAiChatProviderChange: (
		v: "inherit" | "gemini" | "groq" | "openai" | "custom" | "local"
	) => void;
	aiChatSystemPrompt: string;
	handleAiChatSystemPromptChange: (v: string) => void;
}

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

export function AiTab(props: AiTabProps) {
	const { t, dir } = useI18n();
	const tr = t.translatorSettings;
	const ai = t.aiSettings;
	const [showKey, setShowKey] = useState(false);
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
			setLocalStatus((prev) => ({
				...prev,
				downloading: false,
				phase: "error",
				error: String(e)
			}));
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
			<div className="translator-intro">{ai.intro}</div>

			{/* 1. Shared AI Provider & Engine */}
			<div className="setting-group-label">{ai.engineGroup}</div>
			<div className="setting-group">
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
								<option value="gemini">{ai.providerGemini}</option>
								<option value="groq">{ai.providerGroq}</option>
								<option value="openai">{ai.providerOpenai}</option>
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
															backgroundImage: `linear-gradient(${dir === "rtl" ? "to left" : "to right"}, var(--zenith-text, #ffffff) ${progressPct}%, rgba(255, 255, 255, 0.08) ${progressPct}%)`
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
											<button type="button" className="settings-btn" onClick={cancelDownload}>
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

			{/* 2. Notch AI Chat */}
			<div className="setting-group-label">{ai.chatGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Power} label={ai.enableAiChat} desc={ai.enableAiChatDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.aiChatEnabled}
							onChange={props.toggleAiChatEnabled}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow
					icon={ZenithAiIcon}
					label={ai.chatDefaultProvider}
					desc={ai.chatDefaultProviderDesc}
				>
					<select
						className="settings-select"
						value={props.aiChatProvider}
						onChange={(e) =>
							props.handleAiChatProviderChange(
								e.target.value as
									| "inherit"
									| "gemini"
									| "groq"
									| "openai"
									| "custom"
									| "local"
							)
						}
					>
						<option value="inherit">{ai.providerInherit}</option>
						<option value="gemini">{ai.providerGemini}</option>
						<option value="groq">{ai.providerGroq}</option>
						<option value="openai">{ai.providerOpenai}</option>
						<option value="custom">{ai.providerCustom}</option>
						<option value="local">{ai.providerLocal}</option>
					</select>
				</SettingRow>

				<div className="tr-prompts-block">
					<div className="tr-prompt-field">
						<label className="tr-prompt-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<MessageSquare size={12} />
							<span>{ai.chatSystemPrompt}</span>
						</label>
						<div className="tr-api-hint">{ai.chatSystemPromptDesc}</div>
						<textarea
							className="tr-prompt-textarea"
							rows={3}
							dir={props.aiChatSystemPrompt ? "auto" : dir}
							placeholder={ai.chatSystemPromptPlaceholder}
							value={props.aiChatSystemPrompt}
							onChange={(e) => props.handleAiChatSystemPromptChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
