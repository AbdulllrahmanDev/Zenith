import { useState } from "react";
import {
	ClipboardPaste,
	Clock,
	Eye,
	Keyboard,
	Languages,
	PanelTop,
	Power,
	Sliders,
	Sparkles,
	Type
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithAiIcon } from "../icons/ZenithAiIcon";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { useI18n } from "../i18n";

export interface TranslatorTabProps {
	translatorEnabled: boolean;
	toggleTranslatorEnabled: () => void;
	translatorEngine: "cloud" | "local";
	translatorProvider: "gemini" | "groq" | "openai" | "custom";
	onOpenAiTab: () => void;
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

export function TranslatorTab(props: TranslatorTabProps) {
	const { t, dir } = useI18n();
	const tr = t.translatorSettings;
	const ai = t.aiSettings;
	const [recordingField, setRecordingField] = useState<string | null>(null);

	const activeAiSummary = (() => {
		if (props.translatorEngine === "local") return ai.providerLocal;
		if (props.translatorProvider === "groq") return ai.providerGroq;
		if (props.translatorProvider === "openai") return ai.providerOpenai;
		if (props.translatorProvider === "custom") return ai.providerCustom;
		return ai.providerGemini;
	})();

	return (
		<div className="tab-content translator-tab" dir={dir}>
			<div className="translator-intro">{tr.intro}</div>

			{/* 1. Activation & Shared AI */}
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

				<SettingRow
					icon={ZenithAiIcon}
					label={tr.aiManagedTitle}
					desc={`${tr.aiManagedDesc} (${activeAiSummary})`}
				>
					<button
						type="button"
						className="settings-btn tr-accent-btn"
						onClick={props.onOpenAiTab}
					>
						<ZenithAiIcon size={13} />
						<span>{tr.openAiTabBtn}</span>
					</button>
				</SettingRow>
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
							dir={props.translatorCustomPromptInplace ? "auto" : dir}
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
							dir={props.translatorCustomPromptQuick ? "auto" : dir}
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
