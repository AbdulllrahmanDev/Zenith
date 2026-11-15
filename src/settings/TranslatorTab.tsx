import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	ArrowLeftRight,
	Bot,
	Check,
	Clipboard,
	Cpu,
	Eye,
	EyeOff,
	Globe,
	Keyboard,
	Languages,
	Link2,
	MessageSquareText,
	MousePointerClick,
	PanelTop,
	Play,
	RotateCcw,
	Sparkles,
	Zap
} from "lucide-react";
import { useI18n } from "../i18n";
import { SettingRow } from "./SettingRow";
import {
	DEFAULT_TRANSLATOR_MODELS,
	TRANSLATOR_LANGUAGES,
	formatShortcutFromKeyEvent,
	runTranslation,
	type TranslatorDisplayMode,
	type TranslatorPopupPosition,
	type TranslatorProvider,
	type TranslatorTone
} from "../utils/translator";

interface TranslatorTabProps {
	translatorEnabled: boolean;
	toggleTranslatorEnabled: () => void;
	translatorShortcut: string;
	changeTranslatorShortcut: (shortcut: string) => void;
	translatorDisplayMode: TranslatorDisplayMode;
	changeTranslatorDisplayMode: (mode: TranslatorDisplayMode) => void;
	translatorPopupPosition: TranslatorPopupPosition;
	changeTranslatorPopupPosition: (pos: TranslatorPopupPosition) => void;
	translatorShowInNotch: boolean;
	toggleTranslatorShowInNotch: () => void;
	translatorCaptureSelection: boolean;
	toggleTranslatorCaptureSelection: () => void;
	translatorAutoTranslate: boolean;
	toggleTranslatorAutoTranslate: () => void;
	translatorAutoCopy: boolean;
	toggleTranslatorAutoCopy: () => void;
	translatorSourceLang: string;
	changeTranslatorSourceLang: (lang: string) => void;
	translatorTargetLang: string;
	changeTranslatorTargetLang: (lang: string) => void;
	translatorSmartSwap: boolean;
	toggleTranslatorSmartSwap: () => void;
	translatorSecondaryLang: string;
	changeTranslatorSecondaryLang: (lang: string) => void;
	translatorProvider: TranslatorProvider;
	changeTranslatorProvider: (provider: TranslatorProvider) => void;
	translatorApiKey: string;
	changeTranslatorApiKey: (key: string) => void;
	translatorModel: string;
	changeTranslatorModel: (model: string) => void;
	translatorCustomEndpoint: string;
	changeTranslatorCustomEndpoint: (endpoint: string) => void;
	translatorTone: TranslatorTone;
	changeTranslatorTone: (tone: TranslatorTone) => void;
	translatorCustomPrompt: string;
	changeTranslatorCustomPrompt: (prompt: string) => void;
}

const inputStyle: React.CSSProperties = {
	width: "210px",
	padding: "6px 10px",
	borderRadius: "7px",
	border: "1px solid rgba(255, 255, 255, 0.14)",
	background: "rgba(255, 255, 255, 0.06)",
	color: "#ffffff",
	fontSize: "12.5px",
	outline: "none"
};

export function TranslatorTab({
	translatorEnabled,
	toggleTranslatorEnabled,
	translatorShortcut,
	changeTranslatorShortcut,
	translatorDisplayMode,
	changeTranslatorDisplayMode,
	translatorPopupPosition,
	changeTranslatorPopupPosition,
	translatorShowInNotch,
	toggleTranslatorShowInNotch,
	translatorCaptureSelection,
	toggleTranslatorCaptureSelection,
	translatorAutoTranslate,
	toggleTranslatorAutoTranslate,
	translatorAutoCopy,
	toggleTranslatorAutoCopy,
	translatorSourceLang,
	changeTranslatorSourceLang,
	translatorTargetLang,
	changeTranslatorTargetLang,
	translatorSmartSwap,
	toggleTranslatorSmartSwap,
	translatorSecondaryLang,
	changeTranslatorSecondaryLang,
	translatorProvider,
	changeTranslatorProvider,
	translatorApiKey,
	changeTranslatorApiKey,
	translatorModel,
	changeTranslatorModel,
	translatorCustomEndpoint,
	changeTranslatorCustomEndpoint,
	translatorTone,
	changeTranslatorTone,
	translatorCustomPrompt,
	changeTranslatorCustomPrompt
}: TranslatorTabProps) {
	const { t } = useI18n();
	const tr = t.translatorTab;

	const [recording, setRecording] = useState(false);
	const [showKey, setShowKey] = useState(false);
	const [testState, setTestState] = useState<{
		status: "idle" | "testing" | "ok" | "error";
		message: string;
	}>({ status: "idle", message: "" });

	useEffect(() => {
		if (!recording) return;

		void invoke("set_translator_shortcut_recording", { recording: true });
		const onKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
				setRecording(false);
				return;
			}

			const formatted = formatShortcutFromKeyEvent(e);
			if (formatted) {
				changeTranslatorShortcut(formatted);
				setRecording(false);
			}
		};

		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			void invoke("set_translator_shortcut_recording", { recording: false });
		};
	}, [recording, changeTranslatorShortcut]);

	const handleTestEngine = async () => {
		setTestState({ status: "testing", message: tr.testing });
		const started = performance.now();
		try {
			const res = await runTranslation("Hello, world!", {
				sourceLang: "en",
				targetLang: translatorTargetLang === "en" ? "ar" : translatorTargetLang,
				provider: translatorProvider,
				apiKey: translatorApiKey,
				model: translatorModel,
				customEndpoint: translatorCustomEndpoint,
				tone: translatorTone,
				customPrompt: translatorCustomPrompt
			});
			const ms = Math.round(performance.now() - started);
			setTestState({
				status: "ok",
				message: tr.testSuccess(ms, res.translatedText)
			});
		} catch (err) {
			setTestState({
				status: "error",
				message: tr.testFailed(String(err))
			});
		}
	};

	const langLabel = (code: string) =>
		tr.languages[code as keyof typeof tr.languages] || code;

	return (
		<>
			<div className="setting-group-label">{tr.activationGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Languages} label={tr.enabled} desc={tr.enabledDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={translatorEnabled} onChange={toggleTranslatorEnabled} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Keyboard} label={tr.shortcut} desc={tr.shortcutDesc}>
					<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
						<button
							type="button"
							className="settings-btn-detect"
							disabled={!translatorEnabled}
							onClick={() => setRecording((r) => !r)}
							style={{
								minWidth: "130px",
								padding: "5px 10px",
								borderColor: recording ? "rgba(56, 189, 248, 0.7)" : undefined,
								background: recording ? "rgba(56, 189, 248, 0.16)" : undefined,
								color: recording ? "#7dd3fc" : "#ffffff",
								fontFamily: recording ? "inherit" : "ui-monospace, Consolas, monospace"
							}}
							title={tr.recordShortcut}
						>
							{recording ? tr.recordingShortcut : translatorShortcut}
						</button>
						<button
							type="button"
							className="settings-btn-detect"
							disabled={!translatorEnabled || translatorShortcut === "Ctrl+Alt+T"}
							onClick={() => changeTranslatorShortcut("Ctrl+Alt+T")}
							title={tr.resetShortcut}
							style={{ padding: "5px 8px" }}
						>
							<RotateCcw size={13} />
						</button>
					</div>
				</SettingRow>

				<SettingRow
					icon={MousePointerClick}
					label={tr.captureSelection}
					desc={tr.captureSelectionDesc}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							disabled={!translatorEnabled}
							checked={translatorCaptureSelection}
							onChange={toggleTranslatorCaptureSelection}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Play}
					label={tr.openNow}
					desc={tr.openNowDesc}
					action
					divider={false}
					onClick={() => void invoke("open_translator_window")}
				>
					<button
						type="button"
						className="settings-btn-detect"
						onClick={(e) => {
							e.stopPropagation();
							void invoke("open_translator_window");
						}}
					>
						{tr.openButton}
					</button>
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">{tr.displayGroup}</div>
			<div className="setting-group">
				<SettingRow icon={PanelTop} label={tr.displayMode} desc={tr.displayModeDesc}>
					<select
						className="settings-select"
						value={translatorDisplayMode}
						onChange={(e) =>
							changeTranslatorDisplayMode(e.target.value === "notch" ? "notch" : "popup")
						}
					>
						<option value="popup">{tr.modePopup}</option>
						<option value="notch">{tr.modeNotch}</option>
					</select>
				</SettingRow>

				{translatorDisplayMode === "popup" && (
					<SettingRow icon={MousePointerClick} label={tr.popupPosition} desc={tr.popupPositionDesc}>
						<select
							className="settings-select"
							value={translatorPopupPosition}
							onChange={(e) =>
								changeTranslatorPopupPosition(e.target.value === "center" ? "center" : "cursor")
							}
						>
							<option value="cursor">{tr.posCursor}</option>
							<option value="center">{tr.posCenter}</option>
						</select>
					</SettingRow>
				)}

				<SettingRow icon={PanelTop} label={tr.showInNotch} desc={tr.showInNotchDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={translatorShowInNotch}
							onChange={toggleTranslatorShowInNotch}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Zap} label={tr.autoTranslate} desc={tr.autoTranslateDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={translatorAutoTranslate}
							onChange={toggleTranslatorAutoTranslate}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Clipboard}
					label={tr.autoCopy}
					desc={tr.autoCopyDesc}
					divider={false}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={translatorAutoCopy}
							onChange={toggleTranslatorAutoCopy}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">{tr.languagesGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Globe} label={tr.sourceLang} desc={tr.sourceLangDesc}>
					<select
						className="settings-select"
						value={translatorSourceLang}
						onChange={(e) => changeTranslatorSourceLang(e.target.value)}
					>
						<option value="auto">{tr.languages.auto}</option>
						{TRANSLATOR_LANGUAGES.map((code) => (
							<option key={code} value={code}>
								{langLabel(code)}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow icon={Languages} label={tr.targetLang} desc={tr.targetLangDesc}>
					<select
						className="settings-select"
						value={translatorTargetLang}
						onChange={(e) => changeTranslatorTargetLang(e.target.value)}
					>
						{TRANSLATOR_LANGUAGES.map((code) => (
							<option key={code} value={code}>
								{langLabel(code)}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow
					icon={ArrowLeftRight}
					label={tr.smartSwap}
					desc={tr.smartSwapDesc}
					divider={translatorSmartSwap}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={translatorSmartSwap}
							onChange={toggleTranslatorSmartSwap}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>

				{translatorSmartSwap && (
					<SettingRow
						icon={ArrowLeftRight}
						label={tr.secondaryLang}
						desc={tr.secondaryLangDesc}
						divider={false}
					>
						<select
							className="settings-select"
							value={translatorSecondaryLang}
							onChange={(e) => changeTranslatorSecondaryLang(e.target.value)}
						>
							{TRANSLATOR_LANGUAGES.map((code) => (
								<option key={code} value={code}>
									{langLabel(code)}
								</option>
							))}
						</select>
					</SettingRow>
				)}
			</div>

			<div className="setting-group-label setting-group-label--spaced">{tr.aiGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Bot} label={tr.provider} desc={tr.providerDesc}>
					<select
						className="settings-select"
						value={translatorProvider}
						onChange={(e) =>
							changeTranslatorProvider(e.target.value as TranslatorProvider)
						}
					>
						<option value="free">{tr.providers.free}</option>
						<option value="gemini">{tr.providers.gemini}</option>
						<option value="openai">{tr.providers.openai}</option>
						<option value="groq">{tr.providers.groq}</option>
						<option value="custom">{tr.providers.custom}</option>
					</select>
				</SettingRow>

				{translatorProvider !== "free" && (
					<>
						{translatorProvider === "custom" && (
							<SettingRow icon={Link2} label={tr.customEndpoint} desc={tr.customEndpointDesc}>
								<input
									type="text"
									style={inputStyle}
									dir="ltr"
									value={translatorCustomEndpoint}
									placeholder="http://localhost:11434/v1"
									onChange={(e) => changeTranslatorCustomEndpoint(e.target.value)}
								/>
							</SettingRow>
						)}

						<SettingRow icon={Sparkles} label={tr.apiKey} desc={tr.apiKeyDesc}>
							<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<input
									type={showKey ? "text" : "password"}
									style={{ ...inputStyle, width: "174px" }}
									dir="ltr"
									value={translatorApiKey}
									placeholder={tr.apiKeyPlaceholder}
									onChange={(e) => changeTranslatorApiKey(e.target.value)}
								/>
								<button
									type="button"
									className="settings-btn-detect"
									style={{ padding: "5px 8px" }}
									onClick={() => setShowKey((s) => !s)}
									title={showKey ? tr.hideKey : tr.showKey}
								>
									{showKey ? <EyeOff size={14} /> : <Eye size={14} />}
								</button>
							</div>
						</SettingRow>

						<SettingRow icon={Cpu} label={tr.model} desc={tr.modelDesc}>
							<input
								type="text"
								style={inputStyle}
								dir="ltr"
								value={translatorModel}
								placeholder={DEFAULT_TRANSLATOR_MODELS[translatorProvider]}
								onChange={(e) => changeTranslatorModel(e.target.value)}
							/>
						</SettingRow>

						<SettingRow icon={MessageSquareText} label={tr.tone} desc={tr.toneDesc}>
							<select
								className="settings-select"
								value={translatorTone}
								onChange={(e) => changeTranslatorTone(e.target.value as TranslatorTone)}
							>
								<option value="natural">{tr.tones.natural}</option>
								<option value="formal">{tr.tones.formal}</option>
								<option value="casual">{tr.tones.casual}</option>
								<option value="concise">{tr.tones.concise}</option>
								<option value="technical">{tr.tones.technical}</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={MessageSquareText}
							label={tr.customPrompt}
							desc={tr.customPromptDesc}
						>
							<input
								type="text"
								style={inputStyle}
								value={translatorCustomPrompt}
								placeholder={tr.customPromptPlaceholder}
								onChange={(e) => changeTranslatorCustomPrompt(e.target.value)}
							/>
						</SettingRow>
					</>
				)}

				<SettingRow
					icon={testState.status === "ok" ? Check : Sparkles}
					label={tr.testConnection}
					desc={
						testState.status === "idle" ? tr.testConnectionDesc : testState.message
					}
					divider={false}
				>
					<button
						type="button"
						className="settings-btn-detect"
						disabled={testState.status === "testing"}
						onClick={handleTestEngine}
						style={{
							color:
								testState.status === "ok"
									? "#34d399"
									: testState.status === "error"
										? "#f87171"
										: "#ffffff",
							borderColor:
								testState.status === "ok"
									? "rgba(52, 211, 153, 0.4)"
									: testState.status === "error"
										? "rgba(248, 113, 113, 0.4)"
										: undefined
						}}
					>
						{testState.status === "testing" ? tr.testing : tr.testButton}
					</button>
				</SettingRow>
			</div>
		</>
	);
}
