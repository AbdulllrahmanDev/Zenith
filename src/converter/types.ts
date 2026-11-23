export interface ConverterRuntimeStatus {
	core_installed: boolean;
	version: string | null;
	cli_path: string;
	installing: boolean;
}

export interface CoreInstallProgressEvent {
	stage: string;
	fraction: number;
	message: string;
}

export type EnginePackStatus = "notinstalled" | "installed" | "owncopy";

export interface EnginePackInfo {
	id: string;
	status: EnginePackStatus | string;
	version: string | null;
	downloadable: boolean;
	download_size: number;
	installed_size: number;
	converters: string[];
	outdated: boolean;
	from_system: boolean;
	folder: string | null;
	unavailable_reason: string | null;
}

export interface EngineInstallProgressEvent {
	id: string;
	stage: string;
	component: string;
	fraction: number;
	bytes_done: number;
	bytes_total: number;
}
