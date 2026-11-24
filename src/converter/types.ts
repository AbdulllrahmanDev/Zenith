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

export type ConflictPolicy = "rename" | "overwrite" | "skip";
export type IsoFilesystem = "joliet" | "udf201";

export interface ToolbarProfileState {
	id: string;
	category: FileCategory | string;
	label: string;
	primary_ids: string[];
	secondary_ids: string[];
}

export interface ConverterPresetConfig {
	id: string;
	name: string;
	target_format: string;
	quality: number | null;
	pages: string | null;
	split_every: number | null;
	split_parts: number | null;
	conflict: ConflictPolicy | string | null;
	keep_dates: boolean | null;
	zip: boolean | null;
	iso_filesystem: IsoFilesystem | string | null;
	iso_label: string | null;
}

export interface RecentConversion {
	id: string;
	source_path: string;
	source_name: string;
	source_ext: string;
	output_path: string;
	output_format: string;
	timestamp_ms: number;
	thumbnail_data_url: string | null;
	status: string;
}

export interface WatchRule {
	id: string;
	folder: string;
	target_format: string;
	preset_id: string | null;
	output_folder: string;
	recursive: boolean;
	move_originals: boolean;
	keep_dates: boolean;
	enabled: boolean;
}

export interface ConverterState {
	profiles: ToolbarProfileState[];
	presets: ConverterPresetConfig[];
	recent: RecentConversion[];
	watch_rules: WatchRule[];
}

export interface ConvertRequest {
	job_id: string;
	inputs: string[];
	to: string;
	preset: string | null;
	output_dir: string | null;
	quality: number | null;
	pages: string | null;
	split_every: number | null;
	split_parts: number | null;
	conflict: string | null;
	overwrite: boolean | null;
	keep_dates: boolean | null;
	zip: boolean | null;
	iso_filesystem: string | null;
	iso_label: string | null;
}

export interface ConvertedFileItem {
	source: string;
	state: string;
	outputs: string[];
	error: string | null;
	error_key: string | null;
	missing_engine: string | null;
}

export interface ConvertJobResult {
	job_id: string;
	files: ConvertedFileItem[];
	missing_engine: string | null;
}
