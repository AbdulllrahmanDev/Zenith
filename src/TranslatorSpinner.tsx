import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initTheme } from "./theme";
import "./TranslatorWindows.css";

interface SpinnerState {
	visible: boolean;
	label?: string;
}

function TranslatorSpinnerApp() {
	const [label, setLabel] = useState("جاري المعالجة");

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		let liveReceived = false;
		let unlisten: (() => void) | undefined;
		listen<SpinnerState>("translator-spinner-state", (ev) => {
			liveReceived = true;
			if (ev.payload?.label) {
				setLabel(ev.payload.label);
			}
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		invoke<SpinnerState | null>("translator_get_initial_state", { window: "translator-spinner" })
			.then((initial) => {
				if (!liveReceived && initial?.label) {
					setLabel(initial.label);
				}
			})
			.catch(() => {});

		return () => {
			unlisten?.();
		};
	}, []);

	return (
		<div className="tr-spinner-shell" dir="rtl">
			<div className="tr-spinner-pill">
				<span className="tr-spinner-ring" />
				<span>{label}</span>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<TranslatorSpinnerApp />
	</StrictMode>
);
