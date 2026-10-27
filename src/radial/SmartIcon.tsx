import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getRadialIcon } from "./iconMap";
import type { RadialItem } from "./types";

const nativeIconMemoryCache = new Map<string, string | null>();
const inflightRequests = new Map<string, Promise<string | null>>();

const TERMINAL_LUCIDE_EXCEPTIONS = [
	"microsoft.windowsterminal",
	"windowsterminal",
	"cmd.exe",
	"powershell.exe",
	"pwsh.exe"
];

export function shouldResolveNativeIcon(item: RadialItem): boolean {
	if (item.customIconUrl) return false;
	if (item.useNativeIcon === false) return false;
	if (item.type === "system" || item.type === "submenu") return false;
	if (item.type === "url") return false;
	const targetLower = (item.target || "").toLowerCase();
	const labelLower = (item.label || "").toLowerCase();
	if (!targetLower) return false;
	if (
		TERMINAL_LUCIDE_EXCEPTIONS.some(
			(ex) => targetLower.includes(ex) || labelLower === "terminal"
		) &&
		item.icon === "Terminal"
	) {
		return false;
	}
	return (
		item.type === "app" ||
		item.type === "command" ||
		item.type === "file" ||
		targetLower.endsWith(".exe") ||
		targetLower.endsWith(".lnk") ||
		targetLower.includes("\\") ||
		targetLower.includes("/")
	);
}

async function fetchNativeIcon(path: string, name?: string): Promise<string | null> {
	const cacheKey = `${path}::${name || ""}`;
	if (nativeIconMemoryCache.has(cacheKey)) {
		return nativeIconMemoryCache.get(cacheKey) ?? null;
	}
	const existing = inflightRequests.get(cacheKey);
	if (existing) return existing;

	const promise = invoke<string | null>("get_app_icon", {
		path,
		name: name || null,
		hwnd: null
	})
		.then((icon) => {
			nativeIconMemoryCache.set(cacheKey, icon ?? null);
			inflightRequests.delete(cacheKey);
			return icon ?? null;
		})
		.catch(() => {
			nativeIconMemoryCache.set(cacheKey, null);
			inflightRequests.delete(cacheKey);
			return null;
		});

	inflightRequests.set(cacheKey, promise);
	return promise;
}

interface SmartIconProps {
	item: RadialItem;
	size: number;
	displayScale?: number;
	strokeWidth?: number;
	className?: string;
}

/**
 * Renders an item's native Windows icon (via `get_app_icon`), custom icon URL,
 * or falls back cleanly to its Lucide vector glyph.
 */
export const SmartIcon: React.FC<SmartIconProps> = React.memo(
	({ item, size, displayScale = 0.72, strokeWidth = 1.75, className = "" }) => {
		const canResolveNative = shouldResolveNativeIcon(item);
		const cacheKey = `${item.target}::${item.label || ""}`;

		const [nativeSrc, setNativeSrc] = useState<string | null>(() => {
			if (item.customIconUrl) return item.customIconUrl;
			if (canResolveNative && nativeIconMemoryCache.has(cacheKey)) {
				return nativeIconMemoryCache.get(cacheKey) ?? null;
			}
			return null;
		});
		const [imgFailed, setImgFailed] = useState(false);

		useEffect(() => {
			setImgFailed(false);
			if (item.customIconUrl) {
				setNativeSrc(item.customIconUrl);
				return;
			}
			if (!canResolveNative) {
				setNativeSrc(null);
				return;
			}
			let cancelled = false;
			fetchNativeIcon(item.target, item.label).then((res) => {
				if (!cancelled) setNativeSrc(res);
			});
			return () => {
				cancelled = true;
			};
		}, [item.customIconUrl, item.target, item.label, canResolveNative]);

		if (nativeSrc && !imgFailed) {
			const pct = `${Math.round(displayScale * 100)}%`;
			return (
				<img
					src={nativeSrc}
					alt={item.label}
					draggable={false}
					onError={() => setImgFailed(true)}
					className={className}
					style={{
						width: pct,
						height: pct,
						objectFit: "contain",
						userSelect: "none",
						pointerEvents: "none"
					}}
				/>
			);
		}

		const IconComp = getRadialIcon(item.icon);
		return (
			<IconComp
				size={Math.round(size * 0.52)}
				strokeWidth={strokeWidth}
				className={className}
			/>
		);
	}
);
SmartIcon.displayName = "SmartIcon";
