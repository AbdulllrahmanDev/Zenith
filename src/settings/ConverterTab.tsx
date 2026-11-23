import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	ArrowRightLeft,
	CheckCircle2,
	Cpu,
	Disc,
	Download,
	Folder,
	FolderOpen,
	Globe,
	History,
	Keyboard,
	Loader2,
	Menu,
	Package,
	Power,
	RefreshCw,
	Sliders,
	Trash2
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { useI18n } from "../i18n";
import type {
	ConverterRuntimeStatus,
	CoreInstallProgressEvent,
	EngineInstallProgressEvent,
	EnginePackInfo
} from "../converter/types";

export type ConverterTriggerKey = "ctrl" | "alt" | "shift" | "right-drag";
export type ConverterOutputMode = "next-to-source" | "folder";
export type ConverterSubTab = "general" | "donut" | "packs" | "history";

export interface ConverterTabProps {
	converterEnabled: boolean;
	toggleConverterEnabled: () => void;
	converterTriggerKey: ConverterTriggerKey;
	handleConverterTriggerKeyChange: (v: ConverterTriggerKey) => void;
	converterBrowserDrag: boolean;
	toggleConverterBrowserDrag: () => void;
	converterOutputMode: ConverterOutputMode;
	handleConverterOutputModeChange: (v: ConverterOutputMode) => void;
	converterOutputFolder: string;
	handleConverterOutputFolderChange: (v: string) => void;
	converterExplorerMenu: boolean;
	toggleConverterExplorerMenu: () => void;
}

function formatPackSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
	if (bytes >= 1_000_000_000) {
		return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
	}
	if (bytes >= 1_000_000) {
		return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
	}
	return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function formatTransferAmount(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
	if (bytes >= 1_000_000_000) {
		return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
	}
	if (bytes >= 100_000_000) {
		return `${(bytes / 1_000_000).toFixed(0)} MB`;
	}
	if (bytes >= 1_000_000) {
		return `${(bytes / 1_000_000).toFixed(1)} MB`;
	}
	return `${Math.max(0, Math.round(bytes / 1000))} KB`;
}

function cleanErrorMessage(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err);
	return raw.replace(/^[A-Z0-9_]+:\s*/, "").trim() || raw;
}

export function ConverterTab({
	converterEnabled,
	toggleConverterEnabled,
	converterTriggerKey,
	handleConverterTriggerKeyChange,
	converterBrowserDrag,
	toggleConverterBrowserDrag,
	converterOutputMode,
	handleConverterOutputModeChange,
	converterOutputFolder,
	handleConverterOutputFolderChange,
	converterExplorerMenu,
	toggleConverterExplorerMenu
}: ConverterTabProps) {
	const { t, dir } = useI18n();
	const c = t.converter;
	const [subTab, setSubTab] = useState<ConverterSubTab>("general");

	const [runtimeStatus, setRuntimeStatus] = useState<ConverterRuntimeStatus | null>(null);
	const [statusChecking, setStatusChecking] = useState(true);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [coreProgress, setCoreProgress] = useState<CoreInstallProgressEvent | null>(null);
	const [coreActionRunning, setCoreActionRunning] = useState(false);
	const [coreError, setCoreError] = useState<string | null>(null);

	const [engines, setEngines] = useState<EnginePackInfo[]>([]);
	const [enginesLoading, setEnginesLoading] = useState(true);
	const [enginesError, setEnginesError] = useState<string | null>(null);
	const [activeEngineOp, setActiveEngineOp] = useState<Record<string, "installing" | "removing">>({});
	const [engineProgress, setEngineProgress] = useState<Record<string, EngineInstallProgressEvent>>({});
	const [packErrors, setPackErrors] = useState<Record<string, string>>({});

	const refreshStatusAndPacks = useCallback(async () => {
		setStatusChecking(true);
		setStatusError(null);
		setEnginesLoading(true);
		setEnginesError(null);
		const [statusRes, enginesRes] = await Promise.allSettled([
			invoke<ConverterRuntimeStatus>("converter_status"),
			invoke<EnginePackInfo[]>("converter_list_engines")
		]);

		if (statusRes.status === "fulfilled") {
			setRuntimeStatus(statusRes.value);
		} else {
			setStatusError(cleanErrorMessage(statusRes.reason));
		}
		if (enginesRes.status === "fulfilled") {
			setEngines(enginesRes.value);
		} else {
			setEnginesError(cleanErrorMessage(enginesRes.reason));
		}
		setStatusChecking(false);
		setEnginesLoading(false);
	}, []);

	useEffect(() => {
		let cancelled = false;
		let unlistenCore: (() => void) | undefined;
		let unlistenEngine: (() => void) | undefined;

		refreshStatusAndPacks();

		listen<CoreInstallProgressEvent>("converter-core-progress", (ev) => {
			if (cancelled) return;
			setCoreProgress(ev.payload);
			if (ev.payload.stage === "error") {
				setCoreError(cleanErrorMessage(ev.payload.message));
			}
		})
			.then((fn) => {
				if (cancelled) {
					fn();
				} else {
					unlistenCore = fn;
				}
			})
			.catch(() => {});

		listen<EngineInstallProgressEvent>("converter-engine-progress", (ev) => {
			if (cancelled) return;
			setEngineProgress((prev) => ({
				...prev,
				[ev.payload.id]: ev.payload
			}));
		})
			.then((fn) => {
				if (cancelled) {
					fn();
				} else {
					unlistenEngine = fn;
				}
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			unlistenCore?.();
			unlistenEngine?.();
		};
	}, [refreshStatusAndPacks]);

	const triggerLabel =
		converterTriggerKey === "alt"
			? c.triggerAlt
			: converterTriggerKey === "shift"
				? c.triggerShift
				: converterTriggerKey === "right-drag"
					? c.triggerRightDrag
					: c.triggerCtrl;

	const handleBrowseOutputFolder = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: c.browseFolderTitle,
				directory: true,
				multiple: false
			});
			if (typeof selected === "string" && selected.trim()) {
				handleConverterOutputFolderChange(selected);
			}
		} catch (e) {
			console.error("Failed to pick converter output folder:", e);
		}
	};

	const handleEnsureCore = async (): Promise<{ ok: boolean; error?: string }> => {
		if (coreActionRunning || runtimeStatus?.installing) {
			return { ok: false, error: c.runtime.installingTitle };
		}
		setCoreActionRunning(true);
		setCoreError(null);
		setStatusError(null);
		setCoreProgress(null);
		try {
			const status = await invoke<ConverterRuntimeStatus>("converter_ensure_core");
			setRuntimeStatus(status);
			await refreshStatusAndPacks();
			return status.core_installed
				? { ok: true }
				: { ok: false, error: c.runtime.missingTitle };
		} catch (e) {
			const msg = cleanErrorMessage(e);
			setCoreError(msg);
			return { ok: false, error: msg };
		} finally {
			setCoreActionRunning(false);
		}
	};

	const handleInstallPack = async (id: string) => {
		if (activeEngineOp[id]) return;
		setPackErrors((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setActiveEngineOp((prev) => ({ ...prev, [id]: "installing" }));

		try {
			if (!runtimeStatus?.core_installed) {
				const coreResult = await handleEnsureCore();
				if (!coreResult.ok) {
					if (coreResult.error) {
						setPackErrors((prev) => ({ ...prev, [id]: coreResult.error! }));
					}
					return;
				}
			}
			const updated = await invoke<EnginePackInfo>("converter_install_engine", { id });
			setEngines((prev) => {
				const exists = prev.some((p) => p.id === updated.id);
				return exists ? prev.map((p) => (p.id === updated.id ? updated : p)) : [...prev, updated];
			});
		} catch (e) {
			setPackErrors((prev) => ({ ...prev, [id]: cleanErrorMessage(e) }));
		} finally {
			setActiveEngineOp((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
			setEngineProgress((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
		}
	};

	const handleRemovePack = async (id: string) => {
		if (activeEngineOp[id]) return;
		setPackErrors((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setActiveEngineOp((prev) => ({ ...prev, [id]: "removing" }));

		try {
			const updated = await invoke<EnginePackInfo>("converter_remove_engine", { id });
			setEngines((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
		} catch (e) {
			setPackErrors((prev) => ({ ...prev, [id]: cleanErrorMessage(e) }));
		} finally {
			setActiveEngineOp((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
		}
	};

	const isCoreInstalling = coreActionRunning || Boolean(runtimeStatus?.installing);
	const corePct = Math.max(0, Math.min(100, Math.round((coreProgress?.fraction ?? 0) * 100)));
	const coreStageLabel =
		(coreProgress?.stage && c.runtime.stages[coreProgress.stage]) ||
		coreProgress?.message ||
		c.runtime.installingTitle;

	const renderCoreBanner = () => {
		if (isCoreInstalling) {
			return (
				<div className="zn-core-banner installing">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon">
								<Loader2 size={15} className="zn-spin" />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.installingTitle}</div>
								<div className="zn-core-desc">{coreProgress?.message || coreStageLabel}</div>
							</div>
						</div>
						<span className="zn-core-pct">{corePct}%</span>
					</div>
					<div className="zn-converter-progress-track">
						<div className="zn-converter-progress-fill" style={{ width: `${corePct}%` }} />
					</div>
				</div>
			);
		}

		if (runtimeStatus?.core_installed) {
			return (
				<div className="zn-core-banner ready">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon ready">
								<CheckCircle2 size={15} />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">
									<span>{c.runtime.readyTitle}</span>
									{runtimeStatus.version && (
										<span className="zn-core-version-pill">v{runtimeStatus.version}</span>
									)}
								</div>
								<div className="zn-core-desc">{c.runtime.readyDesc(runtimeStatus.version)}</div>
							</div>
						</div>
					</div>
				</div>
			);
		}

		if (statusChecking && runtimeStatus === null) {
			return (
				<div className="zn-core-banner">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon">
								<Loader2 size={15} className="zn-spin" />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.checking}</div>
							</div>
						</div>
					</div>
				</div>
			);
		}

		if (statusError && runtimeStatus === null) {
			return (
				<div className="zn-core-banner missing">
					<div className="zn-core-banner-top">
						<div className="zn-core-banner-info">
							<div className="zn-core-status-icon missing">
								<AlertCircle size={15} />
							</div>
							<div className="zn-core-text">
								<div className="zn-core-title">{c.runtime.statusCheckFailedTitle}</div>
							</div>
						</div>
						<button
							type="button"
							className="settings-btn zn-converter-primary-btn"
							onClick={refreshStatusAndPacks}
						>
							<RefreshCw size={13} />
							<span>{c.runtime.retryCheckButton}</span>
						</button>
					</div>
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{statusError}</span>
					</div>
				</div>
			);
		}

		return (
			<div className="zn-core-banner missing">
				<div className="zn-core-banner-top">
					<div className="zn-core-banner-info">
						<div className="zn-core-status-icon missing">
							<Cpu size={15} />
						</div>
						<div className="zn-core-text">
							<div className="zn-core-title">{c.runtime.missingTitle}</div>
							<div className="zn-core-desc">{c.runtime.missingDesc}</div>
						</div>
					</div>
					<button
						type="button"
						className="settings-btn zn-converter-primary-btn"
						onClick={handleEnsureCore}
					>
						<Download size={13} />
						<span>{coreError ? c.runtime.retryButton : c.runtime.setupButton}</span>
					</button>
				</div>
				{coreError && (
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{coreError}</span>
					</div>
				)}
			</div>
		);
	};

	const renderPackCard = (pack: EnginePackInfo) => {
		const meta = c.packs.catalog[pack.id];
		const displayName = meta?.name ?? pack.id;
		const formatsLabel = meta?.formats ?? pack.converters.join(" · ").toUpperCase();
		const descText = meta?.desc ?? pack.unavailable_reason ?? "";
		const op = activeEngineOp[pack.id];
		const progress = engineProgress[pack.id];
		const errorMsg = packErrors[pack.id];

		let badgeLabel = c.packs.statusNotInstalled;
		let badgeClass = "notinstalled";
		if (pack.status === "installed") {
			if (pack.outdated) {
				badgeLabel = c.packs.statusOutdated;
				badgeClass = "outdated";
			} else {
				badgeLabel = c.packs.statusInstalled;
				badgeClass = "installed";
			}
		} else if (pack.status === "owncopy") {
			badgeLabel = pack.from_system ? c.packs.statusSystemCopy : c.packs.statusCustomCopy;
			badgeClass = "owncopy";
		}

		const progressPct = Math.max(0, Math.min(100, Math.round((progress?.fraction ?? 0) * 100)));
		const progressStageText =
			progress?.stage === "downloading"
				? c.packs.stageDownloading
				: progress?.stage === "copying"
					? c.packs.stageCopying
					: progress?.stage === "unpacking"
						? c.packs.stageUnpacking
						: c.packs.stageWorking;

		return (
			<div key={pack.id} className={`zn-pack-card status-${badgeClass}`}>
				<div className="zn-pack-card-main">
					<div className="zn-pack-card-info">
						<div className="zn-pack-card-header">
							<span className="zn-pack-name">{displayName}</span>
							{pack.version && pack.status !== "owncopy" && (
								<span className="zn-pack-version">v{pack.version}</span>
							)}
							<span className={`zn-pack-badge ${badgeClass}`}>{badgeLabel}</span>
						</div>
						{formatsLabel && <div className="zn-pack-formats">{formatsLabel}</div>}
						{descText && <div className="zn-pack-desc">{descText}</div>}
						<div className="zn-pack-meta">
							{pack.status === "owncopy" && pack.folder ? (
								<span className="zn-pack-folder" dir="ltr">
									{pack.folder}
								</span>
							) : pack.status === "installed" ? (
								<span>{c.packs.installedSize(formatPackSize(pack.installed_size))}</span>
							) : pack.downloadable ? (
								<span>
									{c.packs.downloadSize(formatPackSize(pack.download_size))} ·{" "}
									{c.packs.installedSize(formatPackSize(pack.installed_size))}
								</span>
							) : (
								<span>{pack.unavailable_reason || c.packs.unavailable}</span>
							)}
						</div>
					</div>

					<div className="zn-pack-actions">
						{op ? (
							<button type="button" className="settings-btn zn-pack-btn" disabled>
								<Loader2 size={12} className="zn-spin" />
								<span>{op === "removing" ? c.packs.removing : c.packs.installing}</span>
							</button>
						) : pack.status === "installed" ? (
							<>
								{pack.outdated && pack.downloadable && (
									<button
										type="button"
										className="settings-btn zn-converter-primary-btn zn-pack-btn"
										onClick={() => handleInstallPack(pack.id)}
										disabled={isCoreInstalling}
									>
										<Download size={12} />
										<span>{c.packs.update}</span>
									</button>
								)}
								<button
									type="button"
									className="settings-btn zn-pack-btn zn-pack-remove-btn"
									onClick={() => handleRemovePack(pack.id)}
								>
									<Trash2 size={12} />
									<span>{c.packs.remove}</span>
								</button>
							</>
						) : pack.status === "owncopy" ? null : pack.downloadable ? (
							<button
								type="button"
								className="settings-btn zn-converter-primary-btn zn-pack-btn"
								onClick={() => handleInstallPack(pack.id)}
								disabled={isCoreInstalling}
							>
								<Download size={12} />
								<span>{c.packs.install}</span>
							</button>
						) : (
							<button type="button" className="settings-btn zn-pack-btn" disabled>
								<span>{c.packs.unavailable}</span>
							</button>
						)}
					</div>
				</div>

				{op === "installing" && (
					<div className="zn-pack-progress">
						<div className="zn-pack-progress-meta">
							<span>
								{progressStageText}
								{progress?.component && progress.component !== pack.id
									? ` · ${progress.component}`
									: ""}
							</span>
							<span className="zn-pack-progress-nums">
								{progress && progress.bytes_total > 0
									? `${formatTransferAmount(progress.bytes_done)} / ${formatTransferAmount(progress.bytes_total)} · `
									: ""}
								{progressPct}%
							</span>
						</div>
						<div className="zn-converter-progress-track">
							<div
								className="zn-converter-progress-fill"
								style={{ width: `${Math.max(progress ? progressPct : 6, 0)}%` }}
							/>
						</div>
					</div>
				)}

				{errorMsg && (
					<div className="zn-converter-error-banner" role="alert">
						<AlertCircle size={13} />
						<span>{errorMsg}</span>
					</div>
				)}
			</div>
		);
	};

	const renderPlaceholder = (
		icon: typeof Disc,
		title: string,
		desc: string
	) => {
		const Icon = icon;
		return (
			<div key={subTab} className="zn-converter-panel">
				<div className="setting-group">
					<div className="zn-converter-empty-state">
						<div className="zn-converter-empty-icon">
							<Icon size={20} strokeWidth={1.6} />
						</div>
						<div className="zn-converter-empty-title">{title}</div>
						<div className="zn-converter-empty-desc">{desc}</div>
						<span className="zn-converter-empty-badge">{c.comingSoonBadge}</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="zn-mouse-tab-root zn-converter-tab-root" dir={dir}>
			{/* Header Card */}
			<div className="zn-mouse-header-card">
				<div className="zn-mouse-header-left">
					<div className="zn-mouse-logo-badge">
						<ArrowRightLeft size={18} strokeWidth={1.8} />
					</div>
					<div>
						<div className="zn-mouse-header-title">
							<span>{c.headerTitle}</span>
							<span className="zn-mouse-trigger-pill">{triggerLabel}</span>
						</div>
						<div className="zn-mouse-header-sub">{c.headerSub}</div>
					</div>
				</div>

				<div className="zn-mouse-header-actions">
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={converterEnabled}
							onChange={toggleConverterEnabled}
						/>
						<span className="slider" />
					</label>
				</div>
			</div>

			{/* Core Runtime Status Banner */}
			{renderCoreBanner()}

			{/* Segmented Sub-Navigation */}
			<div className="zn-mouse-subnav" role="tablist" aria-label={c.headerTitle}>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "general"}
					className={`zn-mouse-subnav-btn ${subTab === "general" ? "active" : ""}`}
					onClick={() => setSubTab("general")}
				>
					<Sliders size={13} />
					<span>{c.subtabs.general}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "donut"}
					className={`zn-mouse-subnav-btn ${subTab === "donut" ? "active" : ""}`}
					onClick={() => setSubTab("donut")}
				>
					<Disc size={13} />
					<span>{c.subtabs.donut}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "packs"}
					className={`zn-mouse-subnav-btn ${subTab === "packs" ? "active" : ""}`}
					onClick={() => setSubTab("packs")}
				>
					<Package size={13} />
					<span>{c.subtabs.packs}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={subTab === "history"}
					className={`zn-mouse-subnav-btn ${subTab === "history" ? "active" : ""}`}
					onClick={() => setSubTab("history")}
				>
					<History size={13} />
					<span>{c.subtabs.history}</span>
				</button>
			</div>

			{/* Sub-tab 1: General */}
			{subTab === "general" && (
				<div key="general" className="zn-converter-panel">
					<div className="setting-group-label">{c.triggerGroup}</div>
					<div className="setting-group">
						<SettingRow
							icon={Power}
							label={c.enableConverter}
							desc={c.enableConverterDesc}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterEnabled}
									onChange={toggleConverterEnabled}
								/>
								<span className="slider" />
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label={c.triggerKey}
							desc={c.triggerKeyDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={converterTriggerKey}
								onChange={(e) =>
									handleConverterTriggerKeyChange(e.target.value as ConverterTriggerKey)
								}
							>
								<option value="ctrl">{c.triggerCtrl}</option>
								<option value="alt">{c.triggerAlt}</option>
								<option value="shift">{c.triggerShift}</option>
								<option value="right-drag">{c.triggerRightDrag}</option>
							</ZenithSelect>
						</SettingRow>

						<SettingRow
							icon={Globe}
							label={c.browserDrag}
							desc={c.browserDragDesc}
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterBrowserDrag}
									onChange={toggleConverterBrowserDrag}
								/>
								<span className="slider" />
							</label>
						</SettingRow>
					</div>

					<div className="setting-group-label">{c.outputGroup}</div>
					<div className="setting-group">
						<SettingRow
							icon={Folder}
							label={c.outputMode}
							desc={c.outputModeDesc}
						>
							<ZenithSelect
								className="settings-select"
								value={converterOutputMode}
								onChange={(e) =>
									handleConverterOutputModeChange(e.target.value as ConverterOutputMode)
								}
							>
								<option value="next-to-source">{c.outputNextToSource}</option>
								<option value="folder">{c.outputFolder}</option>
							</ZenithSelect>
						</SettingRow>

						{converterOutputMode === "folder" && (
							<SettingRow
								icon={FolderOpen}
								label={c.outputFolderPath}
								desc={c.outputFolderPathDesc}
							>
								<div className="zn-converter-folder-control">
									<input
										type="text"
										className="settings-text-input zn-converter-folder-input"
										value={converterOutputFolder}
										placeholder={c.outputFolderPlaceholder}
										onChange={(e) => handleConverterOutputFolderChange(e.target.value)}
									/>
									<button
										type="button"
										className="settings-btn"
										onClick={handleBrowseOutputFolder}
									>
										{t.common.browseDots}
									</button>
								</div>
							</SettingRow>
						)}

						<SettingRow
							icon={Menu}
							label={c.explorerMenu}
							desc={c.explorerMenuDesc}
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={converterExplorerMenu}
									onChange={toggleConverterExplorerMenu}
								/>
								<span className="slider" />
							</label>
						</SettingRow>
					</div>
				</div>
			)}

			{/* Sub-tab 2: Donut & Presets (populated in Task 7) */}
			{subTab === "donut" &&
				renderPlaceholder(Disc, c.placeholders.donutTitle, c.placeholders.donutDesc)}

			{/* Sub-tab 3: Packs */}
			{subTab === "packs" && (
				<div key="packs" className="zn-converter-panel">
					<div className="zn-packs-header-row">
						<div className="setting-group-label" style={{ margin: 0 }}>
							{c.packs.groupLabel}
						</div>
						<button
							type="button"
							className="settings-btn zn-packs-refresh-btn"
							onClick={refreshStatusAndPacks}
							disabled={enginesLoading}
						>
							<RefreshCw size={12} className={enginesLoading ? "zn-spin" : undefined} />
							<span>{enginesLoading ? c.packs.refreshing : c.packs.refresh}</span>
						</button>
					</div>

					<div className="zn-packs-intro-card">
						<div>{c.packs.intro}</div>
						{!runtimeStatus?.core_installed && (
							<div className="zn-packs-intro-hint">{c.packs.coreRequiredHint}</div>
						)}
					</div>

					{enginesError && (
						<div className="zn-converter-error-banner" role="alert">
							<AlertCircle size={13} />
							<span>{enginesError || c.packs.loadError}</span>
						</div>
					)}

					<div className="zn-packs-list">
						{engines.map(renderPackCard)}
					</div>
				</div>
			)}

			{/* Sub-tab 4: Watch & History (populated in Task 10) */}
			{subTab === "history" &&
				renderPlaceholder(History, c.placeholders.historyTitle, c.placeholders.historyDesc)}
		</div>
	);
}
