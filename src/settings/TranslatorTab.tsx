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
	translatorProvider: "gemini" | "groq" | "openai";
	handleTranslatorProviderChange: (v: "gemini" | "groq" | "openai") => void;
	translatorApiKey: string;
	handleTranslatorApiKeyChange: (v: string) => void;
	translatorGroqApiKey: string;
	handleTranslatorGroqApiKeyChange: (v: string) => void;
	translatorOpenaiApiKey: string;
	handleTranslatorOpenaiApiKeyChange: (v: string) => void;
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

const TARGET_LANGUAGES = [
	{ value: "Arabic", label: "العربية (Arabic)" },
	{ value: "English", label: "الإنجليزية (English)" },
	{ value: "French", label: "الفرنسية (French)" },
	{ value: "Spanish", label: "الإسبانية (Spanish)" },
	{ value: "German", label: "الألمانية (German)" },
	{ value: "Turkish", label: "التركية (Turkish)" },
	{ value: "Italian", label: "الإيطالية (Italian)" },
	{ value: "Portuguese", label: "البرتغالية (Portuguese)" },
	{ value: "Russian", label: "الروسية (Russian)" },
	{ value: "Chinese", label: "الصينية (Chinese)" },
	{ value: "Japanese", label: "اليابانية (Japanese)" },
	{ value: "Korean", label: "الكورية (Korean)" },
	{ value: "Hindi", label: "الهندية (Hindi)" },
	{ value: "Indonesian", label: "الإندونيسية (Indonesian)" },
	{ value: "Urdu", label: "الأردية (Urdu)" },
	{ value: "Dutch", label: "الهولندية (Dutch)" }
];

type SpeedTier = "fast" | "good" | "moderate" | "slow";

function formatResponseSpeed(ms: number): { timeLabel: string; ratingLabel: string; tier: SpeedTier } {
	const timeLabel = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} ث`;
	if (ms < 800) {
		return { timeLabel, ratingLabel: "سريع جداً", tier: "fast" };
	}
	if (ms < 2500) {
		return { timeLabel, ratingLabel: "جيد", tier: "good" };
	}
	if (ms < 5000) {
		return { timeLabel, ratingLabel: "متوسط", tier: "moderate" };
	}
	return { timeLabel, ratingLabel: "بطيء", tier: "slow" };
}

export function TranslatorTab(props: TranslatorTabProps) {
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
				: props.translatorApiKey;

	const handleApiKeyInput = (val: string) => {
		if (props.translatorProvider === "groq") {
			props.handleTranslatorGroqApiKeyChange(val);
		} else if (props.translatorProvider === "openai") {
			props.handleTranslatorOpenaiApiKeyChange(val);
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
		setTestState({ status: "testing", text: "جاري الاختبار" });
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
				? formatResponseSpeed(testState.elapsedMs)
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
				return "تحميل الموديل وأدوات التشغيل (~1 GB)";
			}
			if (!localStatus.runtime_ready) {
				return "تحميل أدوات التشغيل (~24 MB)";
			}
			return "تحميل الموديل المحلي (~986 MB)";
		}
		if (localStatus.phase === "extract") {
			return `جاري تجهيز الأدوات ${localStatus.percent}%`;
		}
		if (localStatus.phase === "runtime") {
			return `جاري تحميل الأدوات ${localStatus.percent}%`;
		}
		return `جاري تحميل الموديل ${localStatus.percent}%`;
	})();

	const progressPct = Math.max(0, Math.min(100, localStatus.percent));

	return (
		<div className="tab-content translator-tab" dir="rtl">
			<div className="translator-intro">
				تحكم كامل بالترجمة الفورية، تلخيص النصوص، وترجمة الشاشة والصفحات مباشرة عبر اختصارات لوحة المفاتيح.
			</div>

			{/* 1. Activation & AI Engine */}
			<div className="setting-group-label">التفعيل والمحرك</div>
			<div className="setting-group">
				<SettingRow
					icon={Power}
					label="تفعيل المترجم الفوري"
					desc="تشغيل الاستماع للاختصارات العالمية في الخلفية طوال عمل Zenith"
				>
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
					icon={Cpu}
					label="محرك الذكاء الاصطناعي"
					desc="اختر بين السرعة السحابية عبر API أو التشغيل المحلي دون إنترنت"
				>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorEngine === "cloud" ? "active" : ""}`}
							onClick={() => props.handleTranslatorEngineChange("cloud")}
						>
							سحابي (API)
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorEngine === "local" ? "active" : ""}`}
							onClick={() => props.handleTranslatorEngineChange("local")}
						>
							محلي (Offline)
						</button>
					</div>
				</SettingRow>

				{props.translatorEngine === "cloud" ? (
					<>
						<SettingRow
							icon={Globe}
							label="مزود الخدمة السحابي"
							desc="Google Gemini أو Groq فائق السرعة أو OpenAI"
						>
							<select
								className="settings-select"
								value={props.translatorProvider}
								onChange={(e) =>
									props.handleTranslatorProviderChange(
										e.target.value as "gemini" | "groq" | "openai"
									)
								}
							>
								<option value="gemini">Google Gemini</option>
								<option value="groq">Groq</option>
								<option value="openai">OpenAI</option>
							</select>
						</SettingRow>

						<div className="tr-api-block">
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
												: "AIza... أو AQ..."
									}
									value={currentApiKey}
									onChange={(e) => handleApiKeyInput(e.target.value)}
								/>
								<button
									type="button"
									className="settings-btn tr-icon-btn"
									onClick={() => setShowKey((s) => !s)}
									title={showKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
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
									<span>اختبار الاتصال</span>
								</button>
							</div>
							{renderTestBanner()}
						</div>
					</>
				) : (
					<div className="tr-local-box">
						<div className="tr-local-header">
							<div>
								<div className="tr-local-title">Qwen2.5-1.5B-Instruct (GGUF) + محرك llama.cpp</div>
								<div className="tr-local-sub">
									{localStatus.ready
										? "الموديل وأدوات التشغيل جاهزة للعمل دون إنترنت"
										: localStatus.downloading
											? `${localStatus.downloaded_mb.toFixed(0)} MB / ${localStatus.total_mb.toFixed(0)} MB`
											: "يتم تحميل الموديل وأدوات التشغيل معاً تلقائياً ليعمل مباشرة دون إعدادات إضافية"}
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
										<span>اختبار الرد</span>
									</button>
								) : (
									<>
										<button
											type="button"
											className={`tr-download-progress-btn ${localStatus.downloading ? "downloading" : ""}`}
											style={
												localStatus.downloading
													? {
															backgroundImage: `linear-gradient(to left, var(--zenith-accent, #007aff) ${progressPct}%, rgba(255, 255, 255, 0.08) ${progressPct}%)`
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
												إلغاء
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
			<div className="setting-group-label">الأوضاع والسلوك</div>
			<div className="setting-group">
				<SettingRow
					icon={Languages}
					label="اللغة المستهدفة للبطاقة والشاشة"
					desc="اللغة التي تُعرض بها الترجمة والشرح والملخصات"
				>
					<select
						className="settings-select"
						value={props.translatorTargetLanguage}
						onChange={(e) => props.handleTranslatorTargetLanguageChange(e.target.value)}
					>
						{TARGET_LANGUAGES.map((lang) => (
							<option key={lang.value} value={lang.value}>
								{lang.label}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow
					icon={Sliders}
					label="وضع المعالجة الافتراضي"
					desc="يحدد كيف يعالج المترجم النص المحدد في البطاقة العائمة"
				>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "full" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("full")}
						>
							ترجمة كاملة
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "explain" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("explain")}
						>
							شرح سريع
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorOutputMode === "summarize" ? "active" : ""}`}
							onClick={() => props.handleTranslatorOutputModeChange("summarize")}
						>
							اختصار
						</button>
					</div>
				</SettingRow>

				<SettingRow
					icon={PanelTop}
					label="مكان عرض نتيجة الترجمة"
					desc="اختيار ظهور النتيجة في نافذة عائمة بجانب المؤشر أو داخل النوتش"
				>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorDisplayTarget === "floating" ? "active" : ""}`}
							onClick={() => props.handleTranslatorDisplayTargetChange("floating")}
						>
							نافذة عائمة
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.translatorDisplayTarget === "notch" ? "active" : ""}`}
							onClick={() => props.handleTranslatorDisplayTargetChange("notch")}
						>
							النوتش
						</button>
					</div>
				</SettingRow>

				<SettingRow
					icon={ClipboardPaste}
					label="استبدال النص مباشرة عند الترجمة للإنجليزية"
					desc="لصق الترجمة الإنجليزية مكان النص المحدد تلقائياً عبر Ctrl+V"
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.translatorAutoPasteArToEn}
							onChange={props.toggleTranslatorAutoPasteArToEn}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow
					icon={Sparkles}
					label="تحديد كل النص تلقائياً عند عدم وجود تحديد"
					desc="يرسل Ctrl+A تلقائياً إذا ضغطت الاختصار دون تحديد نص"
				>
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
			<div className="setting-group-label">اختصارات لوحة المفاتيح</div>
			<div className="setting-group">
				<SettingRow
					icon={Keyboard}
					label="ترجمة سريعة ← الإنجليزية (مباشرة)"
					desc="يترجم النص المحدد إلى الإنجليزية ويستبدله فوراً"
				>
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

				<SettingRow
					icon={Keyboard}
					label="ترجمة / شرح / اختصار في بطاقة عائمة"
					desc="يعرض النتيجة في بطاقة سريعة بجانب المؤشر"
				>
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

				<SettingRow
					icon={Keyboard}
					label="ترجمة الشاشة فوق النص (Overlay)"
					desc="يلتقط النافذة ويضع الترجمة فوق كل نص مع خلفية ضبابية"
				>
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

				<SettingRow
					icon={Keyboard}
					label="ترجمة الصفحة الكاملة بالتمرير"
					desc="يمرر الصفحة ويدمج اللقطات لترجمة المستند أو المقال بالكامل"
				>
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
			<div className="setting-group-label">المظهر والتوجيهات</div>
			<div className="setting-group">
				<SettingRow
					icon={Type}
					label={`حجم خط البطاقة والتراكب (${props.translatorFontSize}px)`}
					desc="حجم النص داخل البطاقة العائمة وطبقة ترجمة الشاشة"
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
					label={`مدة بقاء البطاقة العائمة (${props.translatorCardTimeoutSec} ث)`}
					desc="تُغلق البطاقة تلقائياً بعد انتهاء المهلة (تتوقف عند مرور الماوس)"
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
					label={`شفافية خلفية ترجمة الشاشة (${props.translatorOverlayOpacity}%)`}
					desc="درجة تعتيم اللقطة الخلفية عند عرض الترجمة فوق الشاشة"
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
						<label className="tr-prompt-label">توجيه مخصص للترجمة الإنجليزية المباشرة (اختياري)</label>
						<textarea
							className="tr-prompt-textarea"
							rows={2}
							placeholder="اتركه فارغاً لاستخدام التوجيه الافتراضي"
							value={props.translatorCustomPromptInplace}
							onChange={(e) => props.handleTranslatorCustomPromptInplaceChange(e.target.value)}
						/>
					</div>
					<div className="tr-prompt-field">
						<label className="tr-prompt-label">توجيه مخصص للبطاقة السريعة (اختياري)</label>
						<textarea
							className="tr-prompt-textarea"
							rows={2}
							placeholder="اتركه فارغاً لاستخدام التوجيه الافتراضي"
							value={props.translatorCustomPromptQuick}
							onChange={(e) => props.handleTranslatorCustomPromptQuickChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
