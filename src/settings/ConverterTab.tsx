import { useState } from "react";
import {
	ArrowRightLeft,
	Disc,
	Folder,
	FolderOpen,
	Globe,
	History,
	Keyboard,
	Menu,
	Package,
	Power,
	Sliders
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { useI18n } from "../i18n";

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

			{/* Sub-tab 3: Packs (populated in Task 3) */}
			{subTab === "packs" &&
				renderPlaceholder(Package, c.placeholders.packsTitle, c.placeholders.packsDesc)}

			{/* Sub-tab 4: Watch & History (populated in Task 10) */}
			{subTab === "history" &&
				renderPlaceholder(History, c.placeholders.historyTitle, c.placeholders.historyDesc)}
		</div>
	);
}
