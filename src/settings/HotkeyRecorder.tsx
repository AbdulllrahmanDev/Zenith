import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";

const ARABIC_TO_LATIN_KEY: Record<string, string> = {
	ض: "Q",
	ص: "W",
	ث: "E",
	ق: "R",
	ف: "T",
	غ: "Y",
	ع: "U",
	ه: "I",
	خ: "O",
	ح: "P",
	ش: "A",
	س: "S",
	ي: "D",
	ب: "F",
	ل: "G",
	ا: "H",
	ت: "J",
	ن: "K",
	م: "L",
	ئ: "Z",
	ء: "X",
	ؤ: "C",
	ر: "V",
	لا: "B",
	ى: "N",
	ة: "M"
};

function formatKeyEvent(e: KeyboardEvent): string | null {
	const ignored = new Set(["Control", "Alt", "Shift", "Meta", "OS", "Process", "Dead"]);
	if (ignored.has(e.key)) return null;

	const mods: string[] = [];
	if (e.ctrlKey) mods.push("Ctrl");
	if (e.altKey) mods.push("Alt");
	if (e.shiftKey) mods.push("Shift");

	let main = "";
	if (e.code && e.code.startsWith("Key")) {
		main = e.code.slice(3);
	} else if (e.code && e.code.startsWith("Digit")) {
		main = e.code.slice(5);
	} else if (e.code === "Space" || e.key === " ") {
		main = "Space";
	} else if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(e.key)) {
		main = e.key.toUpperCase();
	} else if (ARABIC_TO_LATIN_KEY[e.key]) {
		main = ARABIC_TO_LATIN_KEY[e.key];
	} else if (e.key.length === 1) {
		main = e.key.toUpperCase();
	} else if (["Enter", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
		main = e.key;
	} else if (e.key.startsWith("Arrow")) {
		main = e.key.replace("Arrow", "");
	}

	if (!main) return null;
	if (mods.length === 0 && !main.startsWith("F")) return null;
	return [...mods, main].join("+");
}

interface HotkeyRecorderProps {
	value: string;
	recording: boolean;
	onStart: () => void;
	onSave: (combo: string) => void;
	onCancel: () => void;
}

/** Captures a global hotkey combination while temporarily pausing backend hotkey dispatch. */
export function HotkeyRecorder({ value, recording, onStart, onSave, onCancel }: HotkeyRecorderProps) {
	const { lang } = useI18n();
	const pressPrompt = lang === "ar" ? "اضغط الاختصار الجديد" : "Press new shortcut";
	const cancelLabel = lang === "ar" ? "إلغاء" : "Cancel";
	const changeLabel = lang === "ar" ? "تغيير" : "Change";

	useEffect(() => {
		if (!recording) return;
		invoke("translator_set_hotkeys_paused", { paused: true }).catch(() => {});

		const onKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape") {
				onCancel();
				return;
			}
			const formatted = formatKeyEvent(e);
			if (formatted) {
				onSave(formatted);
			}
		};

		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			invoke("translator_set_hotkeys_paused", { paused: false }).catch(() => {});
		};
	}, [recording, onSave, onCancel]);

	const parts = value.split("+").filter(Boolean);

	return (
		<div className="tr-hotkey-control" dir="ltr">
			<div className="tr-hotkey-pills">
				{recording ? (
					<span className="tr-hotkey-recording-badge">{pressPrompt}</span>
				) : (
					parts.map((part, idx) => (
						<span key={`${part}-${idx}`} className="tr-hotkey-pill">
							{part}
						</span>
					))
				)}
			</div>
			<button
				type="button"
				className={`settings-btn tr-hotkey-btn ${recording ? "recording" : ""}`}
				onClick={recording ? onCancel : onStart}
			>
				{recording ? cancelLabel : changeLabel}
			</button>
		</div>
	);
}
