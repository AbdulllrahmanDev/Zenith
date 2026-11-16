import { Download, RefreshCw, FileDown, Upload } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GithubIcon } from "../icons";
import { SettingRow } from "./SettingRow";
import { useI18n } from "../i18n";

interface AboutTabProps {
	appVersion: string;
	autoUpdate: boolean;
	toggleAutoUpdate: () => void;
	updateStatus: string;
	updateVersion: string;
	checkForUpdates: () => void;
	installUpdate: () => void;
	exportStatus: string;
	importStatus: string;
	handleExportSettings: () => void;
	handleImportSettings: () => void;
}

export function AboutTab({
	appVersion,
	autoUpdate,
	toggleAutoUpdate,
	updateStatus,
	updateVersion,
	checkForUpdates,
	installUpdate,
	exportStatus,
	importStatus,
	handleExportSettings,
	handleImportSettings
}: AboutTabProps) {
	const { t } = useI18n();
	const ab = t.about;

	const getUpdateLabel = () => {
		switch (updateStatus) {
			case "checking":
				return ab.checking;
			case "available":
				return ab.updateAvailable(updateVersion);
			case "uptodate":
				return ab.upToDate;
			case "downloading":
				return ab.downloadingUpdate;
			case "installing":
				return ab.installing;
			case "error":
				return ab.noUpdatesFound;
			default:
				return ab.checkForUpdates;
		}
	};

	const getUpdateDesc = () =>
		updateStatus === "available"
			? ab.clickToInstall
			: ab.currentlyRunning(appVersion);

	const getExportLabel = () => {
		if (exportStatus === "exporting") return ab.exporting;
		if (exportStatus === "success") return ab.exported;
		if (exportStatus === "error") return ab.exportFailed;
		return ab.exportSettings;
	};

	const getImportLabel = () => {
		if (importStatus === "importing") return ab.importing;
		if (importStatus === "success") return ab.imported;
		if (importStatus === "error") return ab.importFailed;
		return ab.importSettings;
	};

	return (
		<div className="about-tab-container">
			<div className="about-header">
				<img src="/zenith-white-no-bg-nosmile.svg" className="about-logo" alt="Zenith Logo" draggable={false} />
				<h1 className="about-title">{ab.title}</h1>
				<p className="about-version">{ab.version(appVersion)}</p>
				<p className="about-credit">
					{ab.madeWith} <span className="about-heart">❤️</span> {ab.by}{" "}
					<button
						className="about-author"
						onClick={() => openUrl("https://github.com/AbdulllrahmanDev")}
						title="AbdulllrahmanDev on GitHub"
					>
						<GithubIcon size={12} />
						<span>AbdulllrahmanDev</span>
					</button>
				</p>
			</div>

			<div className="setting-group-label">{ab.updatesGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Download} label={ab.autoUpdate} desc={ab.autoUpdateDesc}>
					<label className="toggle-switch">
						<input type="checkbox" checked={autoUpdate} onChange={toggleAutoUpdate} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={RefreshCw}
					label={getUpdateLabel()}
					desc={getUpdateDesc()}
					action
					divider={false}
					onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
				/>
			</div>

			<div className="setting-group-label setting-group-label--spaced">{ab.dataGroup}</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label={getExportLabel()}
					desc={ab.exportSettingsDesc}
					action
					onClick={handleExportSettings}
				/>
				<SettingRow
					icon={Upload}
					label={getImportLabel()}
					desc={ab.importSettingsDesc}
					action
					divider={false}
					onClick={handleImportSettings}
				/>
			</div>
		</div>
	);
}
