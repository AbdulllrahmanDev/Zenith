import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, Copy, X } from "lucide-react";
import { initTheme } from "./theme";
import "./TranslatorWindows.css";

interface CardPayload {
	title: string;
	mode: string;
	source: string;
	text: string;
	error: boolean;
	font_size: number;
	timeout_sec: number;
}

const currentWin = getCurrentWebviewWindow();

function TranslatorCardApp() {
	const [data, setData] = useState<CardPayload>({
		title: "المترجم الفوري",
		mode: "full",
		source: "",
		text: "",
		error: false,
		font_size: 15,
		timeout_sec: 12
	});
	const [copied, setCopied] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [remainingPct, setRemainingPct] = useState(100);

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		let liveReceived = false;
		let unlisten: (() => void) | undefined;
		listen<CardPayload>("translator-card-data", (ev) => {
			liveReceived = true;
			setData(ev.payload);
			setCopied(false);
			setRemainingPct(100);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		invoke<CardPayload | null>("translator_get_initial_state", { window: "translator-card" })
			.then((initial) => {
				if (!liveReceived && initial) {
					setData(initial);
					setCopied(false);
					setRemainingPct(100);
				}
			})
			.catch(() => {});

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				invoke("translator_close_card").catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			unlisten?.();
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	useEffect(() => {
		if (!data.text || hovered) return;
		const totalMs = Math.max(3, data.timeout_sec) * 1000;
		const tickMs = 200;
		let elapsed = 0;

		const timer = window.setInterval(() => {
			elapsed += tickMs;
			const pct = Math.max(0, 100 - (elapsed / totalMs) * 100);
			setRemainingPct(pct);
			if (elapsed >= totalMs) {
				window.clearInterval(timer);
				invoke("translator_close_card").catch(() => {});
			}
		}, tickMs);

		return () => window.clearInterval(timer);
	}, [data.text, data.timeout_sec, hovered]);

	const handleCopy = async () => {
		if (!data.text) return;
		await invoke("translator_copy_text", { text: data.text }).catch(() => {});
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1600);
	};

	const startDrag = async (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest("button, .tr-card-body-selectable")) return;
		try {
			await currentWin.startDragging();
			const pos = await currentWin.outerPosition();
			invoke("translator_save_card_position", { x: pos.x, y: pos.y }).catch(() => {});
		} catch {}
	};

	return (
		<div
			className="tr-card-shell"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div className="tr-card-glow" aria-hidden="true" />
			<div className={`tr-card ${data.error ? "is-error" : ""}`} dir="rtl">
				<div className="tr-card-body-wrap" onMouseDown={startDrag}>
					<div
						className={`tr-card-body tr-card-body-selectable ${data.error ? "error" : ""}`}
						style={{ fontSize: `${data.font_size}px` }}
						dir="auto"
					>
						{data.text}
					</div>
				</div>

				<div className="tr-card-footer" onMouseDown={startDrag}>
					<div className="tr-card-title-wrap">
						<span className="tr-card-accent-dot" />
						<span className="tr-card-title-text">{data.title}</span>
					</div>
					<div className="tr-card-actions">
						<button
							type="button"
							className="tr-card-ghost-btn"
							onClick={() => invoke("translator_close_card").catch(() => {})}
							title="إغلاق"
							aria-label="إغلاق"
						>
							<X size={13} />
						</button>
						<button
							type="button"
							className={`tr-card-primary-btn ${copied ? "copied" : ""}`}
							onClick={handleCopy}
							title={copied ? "تم النسخ" : "نسخ"}
						>
							{copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={12} />}
							<span>{copied ? "تم النسخ" : "نسخ"}</span>
						</button>
					</div>
				</div>

				<div className="tr-card-footer-bar">
					<div className="tr-card-footer-fill" style={{ width: `${remainingPct}%` }} />
				</div>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<TranslatorCardApp />
	</StrictMode>
);
