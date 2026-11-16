import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initTheme } from "./theme";
import "./TranslatorWindows.css";

interface RegionPayload {
	monitor_x: number;
	monitor_y: number;
	monitor_w: number;
	monitor_h: number;
	background_data_url: string;
}

function TranslatorRegionApp() {
	const [region, setRegion] = useState<RegionPayload | null>(null);
	const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);
	const [currPt, setCurrPt] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		let liveReceived = false;
		let unlisten: (() => void) | undefined;
		listen<RegionPayload>("translator-region-init", (ev) => {
			liveReceived = true;
			setRegion(ev.payload);
			setStartPt(null);
			setCurrPt(null);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		invoke<RegionPayload | null>("translator_get_initial_state", { window: "translator-region" })
			.then((initial) => {
				if (!liveReceived && initial) {
					setRegion(initial);
					setStartPt(null);
					setCurrPt(null);
				}
			})
			.catch(() => {});

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				invoke("translator_cancel_region").catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			unlisten?.();
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	const box = (() => {
		if (!startPt || !currPt) return null;
		const left = Math.min(startPt.x, currPt.x);
		const top = Math.min(startPt.y, currPt.y);
		const width = Math.abs(currPt.x - startPt.x);
		const height = Math.abs(currPt.y - startPt.y);
		return { left, top, width, height };
	})();

	const onMouseUp = () => {
		if (!region || !box || box.width < 8 || box.height < 8) {
			setStartPt(null);
			setCurrPt(null);
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const x = region.monitor_x + Math.round(box.left * dpr);
		const y = region.monitor_y + Math.round(box.top * dpr);
		const w = Math.round(box.width * dpr);
		const h = Math.round(box.height * dpr);
		setStartPt(null);
		setCurrPt(null);
		invoke("translator_submit_region", { x, y, w, h }).catch(() => {});
	};

	return (
		<div
			className="tr-region-root"
			onMouseDown={(e) => {
				if (e.button === 2) {
					invoke("translator_cancel_region").catch(() => {});
					return;
				}
				setStartPt({ x: e.clientX, y: e.clientY });
				setCurrPt({ x: e.clientX, y: e.clientY });
			}}
			onMouseMove={(e) => {
				if (startPt) {
					setCurrPt({ x: e.clientX, y: e.clientY });
				}
			}}
			onMouseUp={onMouseUp}
			onContextMenu={(e) => {
				e.preventDefault();
				invoke("translator_cancel_region").catch(() => {});
			}}
		>
			{region && <img className="tr-region-bg" src={region.background_data_url} alt="" draggable={false} />}
			<div className="tr-region-shade" />
			<div className="tr-region-hint" dir="rtl">
				{box && box.width > 8
					? `${Math.round(box.width)} × ${Math.round(box.height)}`
					: "اسحب لتحديد المنطقة المطلوب ترجمتها — اضغط Esc للإلغاء"}
			</div>
			{box && (
				<div
					className="tr-region-box"
					style={{
						left: `${box.left}px`,
						top: `${box.top}px`,
						width: `${box.width}px`,
						height: `${box.height}px`
					}}
				/>
			)}
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<TranslatorRegionApp />
	</StrictMode>
);
