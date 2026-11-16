import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Copy, Eye, X } from "lucide-react";
import { initTheme } from "./theme";
import "./TranslatorWindows.css";

interface OcrBlock {
	id: number;
	left: number;
	top: number;
	width: number;
	height: number;
	text: string;
	bg_color: string;
	text_color: string;
	translated: string;
}

interface OverlayPayload {
	generation: number;
	image_data_url: string;
	image_width: number;
	image_height: number;
	fullpage: boolean;
	opacity: number;
	font_size: number;
	status: string;
	blocks: OcrBlock[];
	error: string | null;
}

interface OverlayUpdate {
	generation: number;
	status: string;
	blocks: OcrBlock[];
	error: string | null;
}

function TranslatorOverlayApp() {
	const [payload, setPayload] = useState<OverlayPayload | null>(null);
	const [showOriginal, setShowOriginal] = useState(false);
	const [copiedAll, setCopiedAll] = useState(false);

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		let liveReceived = false;
		let unInit: (() => void) | undefined;
		let unUpd: (() => void) | undefined;

		listen<OverlayPayload>("translator-overlay-init", (ev) => {
			liveReceived = true;
			setPayload(ev.payload);
			setShowOriginal(false);
			setCopiedAll(false);
		})
			.then((fn) => {
				unInit = fn;
			})
			.catch(() => {});

		listen<OverlayUpdate>("translator-overlay-update", (ev) => {
			setPayload((prev) => {
				if (!prev || prev.generation !== ev.payload.generation) return prev;
				return {
					...prev,
					status: ev.payload.status,
					blocks: ev.payload.blocks,
					error: ev.payload.error
				};
			});
		})
			.then((fn) => {
				unUpd = fn;
			})
			.catch(() => {});

		invoke<OverlayPayload | null>("translator_get_initial_state", { window: "translator-overlay" })
			.then((initial) => {
				if (!liveReceived && initial) {
					setPayload(initial);
					setShowOriginal(false);
					setCopiedAll(false);
				}
			})
			.catch(() => {});

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				invoke("translator_close_overlay").catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);

		return () => {
			unInit?.();
			unUpd?.();
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	if (!payload) {
		return <div className="tr-overlay-root" />;
	}

	const copyAll = async () => {
		const joined = payload.blocks
			.map((b) => b.translated || b.text)
			.filter(Boolean)
			.join("\n\n");
		if (!joined) return;
		await invoke("translator_copy_text", { text: joined }).catch(() => {});
		setCopiedAll(true);
		window.setTimeout(() => setCopiedAll(false), 1600);
	};

	const copyBlock = (b: OcrBlock) => {
		const txt = b.translated || b.text;
		if (txt) {
			invoke("translator_copy_text", { text: txt }).catch(() => {});
		}
	};

	const statusText =
		payload.status === "translating"
			? "جاري ترجمة الشاشة"
			: payload.status === "error" || payload.status === "empty"
				? payload.error || "حدث خطأ"
				: "مكتمل";

	const veilOpacity = showOriginal ? 0 : Math.max(0.25, Math.min(0.9, (payload.opacity - 20) / 100));

	return (
		<div className="tr-overlay-root" dir="rtl">
			<div className="tr-overlay-toolbar">
				<div className="tr-overlay-status">
					<span className="tr-card-accent-dot" />
					<span>{statusText}</span>
				</div>
				<button
					type="button"
					className={`tr-overlay-btn ${showOriginal ? "active" : ""}`}
					onClick={() => setShowOriginal((s) => !s)}
				>
					<Eye size={13} />
					<span>{showOriginal ? "عرض الترجمة" : "عرض الأصل"}</span>
				</button>
				<button type="button" className="tr-overlay-btn" onClick={copyAll}>
					{copiedAll ? <Check size={13} /> : <Copy size={13} />}
					<span>{copiedAll ? "تم النسخ" : "نسخ الكل"}</span>
				</button>
				<button
					type="button"
					className="tr-overlay-btn"
					onClick={() => invoke("translator_close_overlay").catch(() => {})}
				>
					<X size={13} />
					<span>إغلاق</span>
				</button>
			</div>

			<div className={payload.fullpage ? "tr-overlay-scroll" : "tr-overlay-stage"} style={{ height: payload.fullpage ? "100%" : "100%" }}>
				<div className="tr-overlay-stage">
					<img className="tr-overlay-bg" src={payload.image_data_url} alt="" draggable={false} />
					<div
						className="tr-overlay-veil"
						style={{
							opacity: showOriginal ? 0 : 1,
							backgroundColor: `rgba(8, 10, 14, ${veilOpacity * 0.45})`
						}}
					/>

					{!showOriginal &&
						payload.blocks.map((b) => {
							const leftPct = (b.left / Math.max(1, payload.image_width)) * 100;
							const topPct = (b.top / Math.max(1, payload.image_height)) * 100;
							const wPct = (b.width / Math.max(1, payload.image_width)) * 100;
							const hPct = (b.height / Math.max(1, payload.image_height)) * 100;

							return (
								<div
									key={b.id}
									className="tr-overlay-block"
									title="انقر لنسخ هذا الجزء"
									onClick={() => copyBlock(b)}
									dir="auto"
									style={{
										left: `${leftPct}%`,
										top: `${topPct}%`,
										width: `${wPct}%`,
										minHeight: `${hPct}%`,
										backgroundColor: b.bg_color,
										color: b.text_color,
										fontSize: `${Math.max(11, Math.min(payload.font_size, Math.round(b.height * 0.52)))}px`,
										opacity: payload.opacity / 100
									}}
								>
									{b.translated || b.text}
								</div>
							);
						})}
				</div>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<TranslatorOverlayApp />
	</StrictMode>
);
