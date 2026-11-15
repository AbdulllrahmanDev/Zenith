import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	ArrowLeftRight,
	Check,
	Copy,
	Languages,
	Loader2,
	Settings as SettingsIcon,
	Sparkles,
	Trash2,
	X
} from "lucide-react";
import { useI18n } from "../i18n";
import { useSettingsSync } from "../hooks/useSettingsSync";
import {
	TRANSLATOR_LANGUAGES,
	detectTextScriptHint,
	isRtlLanguage,
	normalizeTranslatorProvider,
	normalizeTranslatorTone,
	readTranslatorConfigFromStorage,
	resolveEffectiveTarget,
	runTranslation,
	type TranslatorConfig,
	type TranslatorTriggerPayload
} from "../utils/translator";
import "./TranslatorPanel.css";

export interface TranslatorTriggerEnvelope {
	seq: number;
	payload: TranslatorTriggerPayload;
}

interface TranslatorPanelProps {
	variant: "popup" | "notch";
	triggerEvent?: TranslatorTriggerEnvelope | null;
	onClose?: () => void;
	onPinChange?: (pinned: boolean) => void;
}

export function TranslatorPanel({
	variant,
	triggerEvent,
	onClose,
	onPinChange
}: TranslatorPanelProps) {
	const { t, dir } = useI18n();
	const trTab = t.translatorTab;
	const tp = t.translatorPanel;

	const [config, setConfig] = useState<TranslatorConfig>(() => readTranslatorConfigFromStorage());
	const [sourceLang, setSourceLang] = useState<string>(() => readTranslatorConfigFromStorage().sourceLang);
	const [targetLang, setTargetLang] = useState<string>(() => readTranslatorConfigFromStorage().targetLang);
	const [inputText, setInputText] = useState("");
	const [outputText, setOutputText] = useState("");
	const [detectedLang, setDetectedLang] = useState<string | null>(null);
	const [smartSwappedLang, setSmartSwappedLang] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isTranslating, setIsTranslating] = useState(false);
	const [copied, setCopied] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const requestSeqRef = useRef(0);
	const configRef = useRef(config);
	configRef.current = config;

	const patchConfig = useCallback(<K extends keyof TranslatorConfig>(key: K, val: TranslatorConfig[K]) => {
		setConfig((prev) => ({ ...prev, [key]: val }));
	}, []);

	useSettingsSync({
		"zenith-translator-enabled": (v) => patchConfig("enabled", v !== "false"),
		"zenith-translator-shortcut": (v) => patchConfig("shortcut", String(v || "Ctrl+Alt+T")),
		"zenith-translator-display-mode": (v) => patchConfig("displayMode", v === "notch" ? "notch" : "popup"),
		"zenith-translator-popup-position": (v) =>
			patchConfig("popupPosition", v === "center" ? "center" : "cursor"),
		"zenith-translator-show-in-notch": (v) => patchConfig("showInNotch", v !== "false"),
		"zenith-translator-capture-selection": (v) => patchConfig("captureSelection", v !== "false"),
		"zenith-translator-auto-translate": (v) => patchConfig("autoTranslate", v !== "false"),
		"zenith-translator-auto-copy": (v) => patchConfig("autoCopy", v === "true"),
		"zenith-translator-source-lang": (v) => {
			const next = String(v || "auto");
			patchConfig("sourceLang", next);
			setSourceLang(next);
		},
		"zenith-translator-target-lang": (v) => {
			const next = String(v || "ar");
			patchConfig("targetLang", next);
			setTargetLang(next);
		},
		"zenith-translator-smart-swap": (v) => patchConfig("smartSwap", v !== "false"),
		"zenith-translator-secondary-lang": (v) => patchConfig("secondaryLang", String(v || "en")),
		"zenith-translator-provider": (v) => patchConfig("provider", normalizeTranslatorProvider(v)),
		"zenith-translator-api-key": (v) => patchConfig("apiKey", String(v ?? "")),
		"zenith-translator-model": (v) => patchConfig("model", String(v ?? "")),
		"zenith-translator-custom-endpoint": (v) => patchConfig("customEndpoint", String(v ?? "")),
		"zenith-translator-tone": (v) => patchConfig("tone", normalizeTranslatorTone(v)),
		"zenith-translator-custom-prompt": (v) => patchConfig("customPrompt", String(v ?? ""))
	});

	// Hydrate latest settings from backend store on mount so API keys saved in Settings appear immediately.
	useEffect(() => {
		invoke<Record<string, unknown>>("load_settings")
			.then((all) => {
				const getStr = (k: string, fallback: string) =>
					all[k] !== undefined && all[k] !== null ? String(all[k]) : localStorage.getItem(k) ?? fallback;
				const hydrated: TranslatorConfig = {
					enabled: getStr("zenith-translator-enabled", "true") !== "false",
					shortcut: getStr("zenith-translator-shortcut", "Ctrl+Alt+T") || "Ctrl+Alt+T",
					displayMode: getStr("zenith-translator-display-mode", "popup") === "notch" ? "notch" : "popup",
					popupPosition: getStr("zenith-translator-popup-position", "cursor") === "center" ? "center" : "cursor",
					showInNotch: getStr("zenith-translator-show-in-notch", "true") !== "false",
					captureSelection: getStr("zenith-translator-capture-selection", "true") !== "false",
					autoTranslate: getStr("zenith-translator-auto-translate", "true") !== "false",
					autoCopy: getStr("zenith-translator-auto-copy", "false") === "true",
					sourceLang: getStr("zenith-translator-source-lang", "auto") || "auto",
					targetLang: getStr("zenith-translator-target-lang", "ar") || "ar",
					smartSwap: getStr("zenith-translator-smart-swap", "true") !== "false",
					secondaryLang: getStr("zenith-translator-secondary-lang", "en") || "en",
					provider: normalizeTranslatorProvider(getStr("zenith-translator-provider", "free")),
					apiKey: getStr("zenith-translator-api-key", ""),
					model: getStr("zenith-translator-model", ""),
					customEndpoint: getStr("zenith-translator-custom-endpoint", ""),
					tone: normalizeTranslatorTone(getStr("zenith-translator-tone", "natural")),
					customPrompt: getStr("zenith-translator-custom-prompt", "")
				};
				setConfig(hydrated);
				setSourceLang(hydrated.sourceLang);
				setTargetLang(hydrated.targetLang);
			})
			.catch(() => {});
	}, []);

	const executeTranslate = useCallback(
		async (textToTranslate: string, overrideSource?: string, overrideTarget?: string) => {
			const trimmed = textToTranslate.trim();
			if (!trimmed) {
				setOutputText("");
				setErrorMsg(null);
				setDetectedLang(null);
				setSmartSwappedLang(null);
				return;
			}

			const cfg = configRef.current;
			const src = overrideSource ?? sourceLang;
			const baseTgt = overrideTarget ?? targetLang;
			const { effectiveTarget, swapped } = resolveEffectiveTarget(
				trimmed,
				src,
				baseTgt,
				cfg.smartSwap,
				cfg.secondaryLang
			);

			const seq = ++requestSeqRef.current;
			setIsTranslating(true);
			setErrorMsg(null);
			setSmartSwappedLang(swapped ? effectiveTarget : null);

			try {
				const res = await runTranslation(trimmed, cfg, src, effectiveTarget);
				if (requestSeqRef.current !== seq) return;
				setOutputText(res.translatedText);
				setDetectedLang(
					res.detectedSourceLang || (src === "auto" ? detectTextScriptHint(trimmed) : null)
				);
				if (cfg.autoCopy && res.translatedText) {
					void writeText(res.translatedText).catch(() => {});
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1600);
				}
			} catch (err) {
				if (requestSeqRef.current !== seq) return;
				setErrorMsg(String(err));
			} finally {
				if (requestSeqRef.current === seq) {
					setIsTranslating(false);
				}
			}
		},
		[sourceLang, targetLang]
	);

	// React whenever a global hotkey trigger delivers captured selection or opens the surface.
	useEffect(() => {
		if (!triggerEvent) return;
		const { payload } = triggerEvent;
		setErrorMsg(null);
		setCopied(false);

		if (payload.text) {
			setInputText(payload.text);
			if (configRef.current.autoTranslate) {
				void executeTranslate(payload.text);
			}
		}

		window.setTimeout(() => {
			textareaRef.current?.focus();
			if (payload.text) {
				textareaRef.current?.setSelectionRange(payload.text.length, payload.text.length);
			}
		}, 35);
	}, [triggerEvent, executeTranslate]);

	const handleCopyOutput = async () => {
		if (!outputText) return;
		try {
			await writeText(outputText);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			// Fallback to browser clipboard API if Tauri clipboard plugin denies focus
			try {
				await navigator.clipboard.writeText(outputText);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1600);
			} catch {}
		}
	};

	const handleSwapLanguages = () => {
		const resolvedSource =
			sourceLang !== "auto"
				? sourceLang
				: detectedLang || detectTextScriptHint(inputText) || config.secondaryLang || "en";
		if (resolvedSource === targetLang) return;
		const nextSource = targetLang;
		const nextTarget = resolvedSource;
		setSourceLang(nextSource);
		setTargetLang(nextTarget);
		if (outputText.trim()) {
			const swappedInput = outputText;
			setInputText(swappedInput);
			void executeTranslate(swappedInput, nextSource, nextTarget);
		}
	};

	const handleClear = () => {
		requestSeqRef.current++;
		setInputText("");
		setOutputText("");
		setErrorMsg(null);
		setDetectedLang(null);
		setSmartSwappedLang(null);
		setIsTranslating(false);
		textareaRef.current?.focus();
	};

	const handleSourceFocus = () => {
		onPinChange?.(true);
		if (variant === "notch") {
			void invoke("set_notch_keyboard_focus", { focus: true });
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		e.stopPropagation();
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			void executeTranslate(inputText);
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose?.();
		}
	};

	const langName = (code: string) =>
		trTab.languages[code as keyof typeof trTab.languages] || code;

	const providerBadge =
		config.provider === "free"
			? tp.providerFree
			: config.provider === "gemini"
				? "Gemini"
				: config.provider === "openai"
					? "OpenAI"
					: config.provider === "groq"
						? "Groq"
						: "Custom AI";

	const effectiveOutLang = smartSwappedLang || targetLang;
	const inputRtl =
		sourceLang !== "auto"
			? isRtlLanguage(sourceLang)
			: detectTextScriptHint(inputText) === "ar";
	const outputRtl = isRtlLanguage(effectiveOutLang);

	return (
		<div
			className={`translator-panel ${variant === "notch" ? "is-notch" : "is-popup"}`}
			dir={dir}
			onClick={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<div
				className="translator-header"
				{...(variant === "popup" ? { "data-tauri-drag-region": true } : {})}
			>
				<div
					className="translator-header-left"
					{...(variant === "popup" ? { "data-tauri-drag-region": true } : {})}
				>
					<Languages size={15} color="#38bdf8" />
					<span className="translator-title">{tp.title}</span>
					<span className="translator-badge">
						<Sparkles size={10} />
						{providerBadge}
					</span>
				</div>

				<div className="translator-header-actions">
					<button
						type="button"
						className="translator-icon-btn"
						title={tp.openSettings}
						onClick={() => void invoke("open_settings_window")}
					>
						<SettingsIcon size={13} />
					</button>
					{onClose && (
						<button
							type="button"
							className="translator-icon-btn"
							title={tp.close}
							onClick={onClose}
						>
							<X size={14} />
						</button>
					)}
				</div>
			</div>

			<div className="translator-lang-bar">
				<select
					className="translator-select"
					value={sourceLang}
					onChange={(e) => setSourceLang(e.target.value)}
				>
					<option value="auto">{trTab.languages.auto}</option>
					{TRANSLATOR_LANGUAGES.map((code) => (
						<option key={code} value={code}>
							{langName(code)}
						</option>
					))}
				</select>

				<button
					type="button"
					className="translator-swap-btn"
					onClick={handleSwapLanguages}
					title={tp.swap}
				>
					<ArrowLeftRight size={13} />
				</button>

				<select
					className="translator-select"
					value={targetLang}
					onChange={(e) => {
						const next = e.target.value;
						setTargetLang(next);
						if (inputText.trim()) {
							void executeTranslate(inputText, sourceLang, next);
						}
					}}
				>
					{TRANSLATOR_LANGUAGES.map((code) => (
						<option key={code} value={code}>
							{langName(code)}
						</option>
					))}
				</select>
			</div>

			<div className="translator-body">
				<div className="translator-box">
					<textarea
						ref={textareaRef}
						className="translator-textarea"
						dir={inputRtl ? "rtl" : "ltr"}
						value={inputText}
						placeholder={tp.sourcePlaceholder}
						onFocus={handleSourceFocus}
						onKeyDown={handleKeyDown}
						onChange={(e) => setInputText(e.target.value)}
					/>
					<div className="translator-box-bar">
						<span>
							{detectedLang
								? tp.detected(langName(detectedLang))
								: `${inputText.length} chars`}
						</span>
						<button
							type="button"
							className="translator-mini-btn"
							disabled={!inputText && !outputText}
							onClick={handleClear}
							title={tp.clear}
						>
							<Trash2 size={11} />
							{tp.clear}
						</button>
					</div>
				</div>

				<div className="translator-box">
					<div
						className="translator-output-scroll"
						dir={outputRtl ? "rtl" : "ltr"}
					>
						{errorMsg ? (
							<div className="translator-output-error">{errorMsg}</div>
						) : outputText ? (
							outputText
						) : (
							<span className="translator-output-placeholder">{tp.resultPlaceholder}</span>
						)}
					</div>
					<div className="translator-box-bar">
						<span>
							{smartSwappedLang ? tp.autoSwapped(langName(smartSwappedLang)) : langName(effectiveOutLang)}
						</span>
						<button
							type="button"
							className={`translator-mini-btn ${copied ? "copied" : ""}`}
							disabled={!outputText}
							onClick={handleCopyOutput}
							title={tp.copy}
						>
							{copied ? <Check size={11} /> : <Copy size={11} />}
							{copied ? tp.copied : tp.copy}
						</button>
					</div>
				</div>
			</div>

			<div className="translator-footer">
				<span className="translator-hint">
					{tp.shortcutHint} · {config.shortcut}
				</span>
				<button
					type="button"
					className="translator-primary-btn"
					disabled={isTranslating || !inputText.trim()}
					onClick={() => void executeTranslate(inputText)}
				>
					{isTranslating ? (
						<Loader2 size={13} className="translator-spin" />
					) : (
						<Languages size={13} />
					)}
					{isTranslating ? tp.translating : tp.translate}
				</button>
			</div>
		</div>
	);
}
