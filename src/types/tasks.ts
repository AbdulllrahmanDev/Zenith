export type TaskSource = "local" | "google" | "notion";
export type NoteSource = "local" | "notion";
export type TasksSubTab = "tasks" | "notes";
export type TasksDefaultSubTab = "tasks" | "notes" | "remember";
export type TasksDensity = "comfortable" | "compact";
export type TasksDefaultTarget = "auto" | "local" | "google" | "notion";

export interface TaskItem {
	id: string;
	title: string;
	notes: string;
	completed: boolean;
	source: TaskSource;
	remote_id?: string | null;
	remote_list_id?: string | null;
	due?: string | null;
	created_at: number;
	updated_at: number;
	dirty: boolean;
	deleted: boolean;
	sync_error?: string | null;
}

export interface NoteItem {
	id: string;
	title: string;
	content: string;
	source: NoteSource;
	remote_id?: string | null;
	created_at: number;
	updated_at: number;
	dirty: boolean;
	deleted: boolean;
	sync_error?: string | null;
}

export interface TasksSyncStatus {
	syncing: boolean;
	last_synced_at?: number | null;
	last_error?: string | null;
	google_connected: boolean;
	notion_tasks_configured: boolean;
	notion_notes_configured: boolean;
}

export interface TasksSnapshot {
	tasks: TaskItem[];
	notes: NoteItem[];
	sync_status: TasksSyncStatus;
}

export interface GoogleTaskList {
	id: string;
	title: string;
}

export interface GoogleAuthStatus {
	connected: boolean;
	has_refresh_token: boolean;
	lists: GoogleTaskList[];
	selected_list_id: string;
	auth_in_progress: boolean;
	error?: string | null;
}

export interface NotionTestResult {
	workspace_name?: string | null;
	tasks_db_title?: string | null;
	notes_title?: string | null;
	detected_title_prop?: string | null;
	detected_done_prop?: string | null;
	detected_notes_prop?: string | null;
}

export interface TasksNotchConfig {
	enabled: boolean;
	defaultTab: TasksDefaultSubTab;
	lastTab: TasksSubTab;
	showTasksTab: boolean;
	showNotesTab: boolean;
	showCompleted: boolean;
	showTaskNotes: boolean;
	showSourceBadge: boolean;
	showQuickAdd: boolean;
	density: TasksDensity;
	defaultSource: TasksDefaultTarget;
	autoSync: boolean;
	syncIntervalSec: number;
}
