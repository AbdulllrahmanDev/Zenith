import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { initTheme } from "./theme";
import {
	TranslatorPanel,
	type TranslatorTriggerEnvelope
} from "./components/TranslatorPanel";
import type { TranslatorTriggerPayload } from "./utils/translator";

initTheme();

function TranslatorPopupApp() {
	const [triggerEvent, setTriggerEvent] = useState<TranslatorTriggerEnvelope | null>(null);

	useEffect(() => {
		invoke<TranslatorTriggerPayload | null>("take_pending_translator_trigger")
			.then((pending) => {
				if (pending) {
					setTriggerEvent({ seq: Date.now(), payload: pending });
				}
			})
			.catch(() => {});

		const unlistenPromise = listen<TranslatorTriggerPayload>("translator-trigger", (event) => {
			setTriggerEvent({
				seq: Date.now(),
				payload: event.payload
			});
		});

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				void invoke("hide_translator_window");
			}
		};
		window.addEventListener("keydown", onKeyDown);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
			window.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				padding: "4px",
				boxSizing: "border-box",
				background: "transparent",
				overflow: "hidden"
			}}
		>
			<TranslatorPanel
				variant="popup"
				triggerEvent={triggerEvent}
				onClose={() => void invoke("hide_translator_window")}
			/>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<LanguageProvider>
			<TranslatorPopupApp />
		</LanguageProvider>
	</StrictMode>
);
