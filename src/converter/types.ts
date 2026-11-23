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

export type FileCategory =
	| "image"
	| "vector"
	| "pdf"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "hwp"
	| "text"
	| "ebook"
	| "video"
	| "audio"
	| "subtitle"
	| "archive"
	| "cad"
	| "font"
	| "data"
	| "model3d"
	| "geospatial"
	| "folder"
	| "mixed";

export type ActionKind =
	| "convert"
	| "crop"
	| "pack-zip"
	| "extract"
	| "same-audio"
	| "merge-pdf"
	| "split-pdf"
	| "compress-pdf"
	| "ocr"
	| "upscale";

export interface TargetOption {
	format: string;
	label: string;
	category: FileCategory;
	requiredEngine?: string;
	actionKind?: ActionKind;
	presetId?: string;
	quality?: number;
}

export interface ToolbarProfile {
	id: string;
	category: FileCategory;
	label: string;
	primaryIds: string[];
	secondaryIds: string[];
}

export interface DonutSides {
	primary: TargetOption[];
	secondary: TargetOption[];
	detectedCategory: FileCategory;
}
