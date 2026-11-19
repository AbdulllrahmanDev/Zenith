import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	CheckCircle2,
	CheckSquare,
	Clock,
	Eye,
	EyeOff,
	FileText,
	Globe,
	KeyRound,
	LayoutList,
	ListChecks,
	ListTodo,
	LogIn,
	LogOut,
	PlusCircle,
	Power,
	RefreshCw,
	StickyNote,
	Tag
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ZenithSelect } from "../components/ZenithSelect";
import { useI18n } from "../i18n";
import type {
	GoogleAuthStatus,
	NotionTestResult,
	TasksDefaultSubTab,
	TasksDefaultTarget,
	TasksDensity,
	TasksSnapshot
} from "../types/tasks";

export interface TasksTabProps {
	tasksEnabled: boolean;
	toggleTasksEnabled: () => void;
	tasksDefaultTab: TasksDefaultSubTab;
	handleTasksDefaultTabChange: (v: TasksDefaultSubTab) => void;
	tasksShowTasksTab: boolean;
	toggleTasksShowTasksTab: () => void;
	tasksShowNotesTab: boolean;
	toggleTasksShowNotesTab: () => void;
	tasksShowQuickAdd: boolean;
	toggleTasksShowQuickAdd: () => void;
	tasksShowCompleted: boolean;
	toggleTasksShowCompleted: () => void;
	tasksShowTaskNotes: boolean;
	toggleTasksShowTaskNotes: () => void;
	tasksShowSourceBadge: boolean;
	toggleTasksShowSourceBadge: () => void;
	tasksDensity: TasksDensity;
	handleTasksDensityChange: (v: TasksDensity) => void;
	tasksDefaultSource: TasksDefaultTarget;
	handleTasksDefaultSourceChange: (v: TasksDefaultTarget) => void;
	tasksAutoSync: boolean;
	toggleTasksAutoSync: () => void;
	tasksSyncIntervalSec: number;
	handleTasksSyncIntervalSecChange: (v: number) => void;
	tasksNotionToken: string;
	handleTasksNotionTokenChange: (v: string) => void;
	tasksNotionTasksDb: string;
	handleTasksNotionTasksDbChange: (v: string) => void;
	tasksNotionNotesDb: string;
	handleTasksNotionNotesDbChange: (v: string) => void;
	tasksGoogleClientId: string;
	handleTasksGoogleClientIdChange: (v: string) => void;
	tasksGoogleClientSecret: string;
	handleTasksGoogleClientSecretChange: (v: string) => void;
	tasksGoogleListId: string;
	handleTasksGoogleListIdChange: (v: string) => void;
}

export function TasksTab(props: TasksTabProps) {
	const { t, dir, lang } = useI18n();
	const ts = t.tasksSettings;
	const [showNotionToken, setShowNotionToken] = useState(false);
	const [showGoogleSecret, setShowGoogleSecret] = useState(false);

	const [notionTest, setNotionTest] = useState<{
		status: "idle" | "testing" | "ok" | "error";
		text: string;
	}>({ status: "idle", text: "" });

	const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus>({
		connected: false,
		has_refresh_token: false,
		lists: [],
		selected_list_id: props.tasksGoogleListId || "@default",
		auth_in_progress: false,
		error: null
	});
	const [googleAuthPending, setGoogleAuthPending] = useState(false);
	const [googleBanner, setGoogleBanner] = useState<{
		status: "idle" | "ok" | "error";
		text: string;
	}>({ status: "idle", text: "" });

	const [syncing, setSyncing] = useState(false);
	const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	useEffect(() => {
		invoke<GoogleAuthStatus>("tasks_google_get_status")
			.then(setGoogleStatus)
			.catch(() => {});
		invoke<TasksSnapshot>("tasks_get_snapshot")
			.then((snap) => {
				setSyncing(snap.sync_status.syncing);
				setLastSyncedAt(snap.sync_status.last_synced_at ?? null);
				setSyncError(snap.sync_status.last_error ?? null);
			})
			.catch(() => {});

		let unlistenAuth: (() => void) | undefined;
		let unlistenStore: (() => void) | undefined;
		listen<GoogleAuthStatus>("tasks-auth-updated", (ev) => {
			setGoogleStatus(ev.payload);
			setGoogleAuthPending(false);
		})
			.then((fn) => {
				unlistenAuth = fn;
			})
			.catch(() => {});
		listen<TasksSnapshot>("tasks-store-updated", (ev) => {
			setSyncing(ev.payload.sync_status.syncing);
			setLastSyncedAt(ev.payload.sync_status.last_synced_at ?? null);
			setSyncError(ev.payload.sync_status.last_error ?? null);
		})
			.then((fn) => {
				unlistenStore = fn;
			})
			.catch(() => {});

		return () => {
			unlistenAuth?.();
			unlistenStore?.();
		};
	}, []);

	const handleTestNotion = async () => {
		setNotionTest({ status: "testing", text: ts.testingNotion });
		try {
			const res = await invoke<NotionTestResult>("tasks_test_notion", {
				token: props.tasksNotionToken,
				tasksDb: props.tasksNotionTasksDb,
				notesId: props.tasksNotionNotesDb
			});
			const details = [
				res.tasks_db_title,
				res.notes_title,
				res.detected_done_prop ? `✓ ${res.detected_done_prop}` : null
			]
				.filter(Boolean)
				.join(" · ");
			setNotionTest({
				status: "ok",
				text: ts.notionConnectedOk(res.workspace_name || "Notion", details)
			});
		} catch (e) {
			setNotionTest({ status: "error", text: String(e) });
		}
	};

	const handleGoogleSignIn = async () => {
		setGoogleAuthPending(true);
		setGoogleBanner({ status: "idle", text: "" });
		try {
			const next = await invoke<GoogleAuthStatus>("tasks_google_start_auth", {
				clientId: props.tasksGoogleClientId,
				clientSecret: props.tasksGoogleClientSecret
			});
			setGoogleStatus(next);
			setGoogleBanner({ status: "ok", text: ts.googleConnectedDesc });
		} catch (e) {
			setGoogleBanner({ status: "error", text: String(e) });
		} finally {
			setGoogleAuthPending(false);
		}
	};

	const handleGoogleDisconnect = async () => {
		try {
			const next = await invoke<GoogleAuthStatus>("tasks_google_disconnect");
			setGoogleStatus(next);
			setGoogleBanner({ status: "idle", text: "" });
		} catch (e) {
			setGoogleBanner({ status: "error", text: String(e) });
		}
	};

	const handleSyncNow = async () => {
		setSyncing(true);
		setSyncError(null);
		try {
			const snap = await invoke<TasksSnapshot>("tasks_sync_now");
			setLastSyncedAt(snap.sync_status.last_synced_at ?? null);
			setSyncError(snap.sync_status.last_error ?? null);
		} catch (e) {
			setSyncError(String(e));
		} finally {
			setSyncing(false);
		}
	};

	const formattedSyncTime = lastSyncedAt
		? new Date(lastSyncedAt).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", {
				hour: "2-digit",
				minute: "2-digit"
			})
		: null;

	return (
		<div className="tab-content translator-tab" dir={dir}>
			<div className="translator-intro">{ts.intro}</div>

			{/* 1. Notch Menu & Appearance */}
			<div className="setting-group-label">{ts.notchGroup}</div>
			<div className="setting-group">
				<SettingRow icon={Power} label={ts.enableTasks} desc={ts.enableTasksDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksEnabled}
							onChange={props.toggleTasksEnabled}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={LayoutList} label={ts.defaultSubTab} desc={ts.defaultSubTabDesc}>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.tasksDefaultTab === "tasks" ? "active" : ""}`}
							onClick={() => props.handleTasksDefaultTabChange("tasks")}
						>
							{ts.subTabTasks}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.tasksDefaultTab === "notes" ? "active" : ""}`}
							onClick={() => props.handleTasksDefaultTabChange("notes")}
						>
							{ts.subTabNotes}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.tasksDefaultTab === "remember" ? "active" : ""}`}
							onClick={() => props.handleTasksDefaultTabChange("remember")}
						>
							{ts.subTabRemember}
						</button>
					</div>
				</SettingRow>

				<SettingRow icon={ListTodo} label={ts.showTasksTab} desc={ts.showTasksTabDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowTasksTab}
							onChange={props.toggleTasksShowTasksTab}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={StickyNote} label={ts.showNotesTab} desc={ts.showNotesTabDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowNotesTab}
							onChange={props.toggleTasksShowNotesTab}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={PlusCircle} label={ts.showQuickAdd} desc={ts.showQuickAddDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowQuickAdd}
							onChange={props.toggleTasksShowQuickAdd}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={CheckSquare} label={ts.showCompleted} desc={ts.showCompletedDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowCompleted}
							onChange={props.toggleTasksShowCompleted}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={FileText} label={ts.showTaskNotes} desc={ts.showTaskNotesDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowTaskNotes}
							onChange={props.toggleTasksShowTaskNotes}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={Tag} label={ts.showSourceBadge} desc={ts.showSourceBadgeDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksShowSourceBadge}
							onChange={props.toggleTasksShowSourceBadge}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				<SettingRow icon={ListChecks} label={ts.density} desc={ts.densityDesc}>
					<div className="tr-segmented">
						<button
							type="button"
							className={`tr-seg-btn ${props.tasksDensity === "comfortable" ? "active" : ""}`}
							onClick={() => props.handleTasksDensityChange("comfortable")}
						>
							{ts.densityComfortable}
						</button>
						<button
							type="button"
							className={`tr-seg-btn ${props.tasksDensity === "compact" ? "active" : ""}`}
							onClick={() => props.handleTasksDensityChange("compact")}
						>
							{ts.densityCompact}
						</button>
					</div>
				</SettingRow>

				<SettingRow
					icon={Globe}
					label={ts.defaultTarget}
					desc={ts.defaultTargetDesc}
					divider={false}
				>
					<ZenithSelect
						className="settings-select"
						value={props.tasksDefaultSource}
						onChange={(e) =>
							props.handleTasksDefaultSourceChange(
								e.target.value as TasksDefaultTarget
							)
						}
					>
						<option value="auto">{ts.targetAuto}</option>
						<option value="local">{ts.targetLocal}</option>
						<option value="google">{ts.targetGoogle}</option>
						<option value="notion">{ts.targetNotion}</option>
					</ZenithSelect>
				</SettingRow>
			</div>

			{/* 2. Notion Integration */}
			<div className="setting-group-label">{ts.notionGroup}</div>
			<div className="setting-group">
				<div className="tr-api-block" style={{ borderTop: "none" }}>
					<div className="tr-custom-field">
						<label className="tr-custom-label">{ts.notionToken}</label>
						<div className="tr-api-row">
							<input
								type={showNotionToken ? "text" : "password"}
								dir="ltr"
								className="settings-text-input tr-api-input"
								placeholder={ts.notionTokenPlaceholder}
								value={props.tasksNotionToken}
								onChange={(e) => props.handleTasksNotionTokenChange(e.target.value)}
							/>
							<button
								type="button"
								className="settings-btn tr-icon-btn"
								onClick={() => setShowNotionToken((s) => !s)}
								title={showNotionToken ? t.translatorSettings.hideKey : t.translatorSettings.showKey}
							>
								{showNotionToken ? <EyeOff size={15} /> : <Eye size={15} />}
							</button>
						</div>
						<span className="tr-api-hint">{ts.notionTokenDesc}</span>
					</div>

					<div className="tr-custom-field">
						<label className="tr-custom-label">{ts.notionTasksDb}</label>
						<input
							type="text"
							dir="ltr"
							className="settings-text-input tr-api-input"
							placeholder={ts.notionTasksDbPlaceholder}
							value={props.tasksNotionTasksDb}
							onChange={(e) => props.handleTasksNotionTasksDbChange(e.target.value)}
						/>
						<span className="tr-api-hint">{ts.notionTasksDbDesc}</span>
					</div>

					<div className="tr-custom-field">
						<label className="tr-custom-label">{ts.notionNotesDb}</label>
						<input
							type="text"
							dir="ltr"
							className="settings-text-input tr-api-input"
							placeholder={ts.notionNotesDbPlaceholder}
							value={props.tasksNotionNotesDb}
							onChange={(e) => props.handleTasksNotionNotesDbChange(e.target.value)}
						/>
						<span className="tr-api-hint">{ts.notionNotesDbDesc}</span>
					</div>

					<div className="tr-api-row">
						<button
							type="button"
							className="settings-btn tr-accent-btn"
							disabled={notionTest.status === "testing" || !props.tasksNotionToken.trim()}
							onClick={handleTestNotion}
						>
							<CheckCircle2 size={14} />
							<span>{notionTest.status === "testing" ? ts.testingNotion : ts.testNotion}</span>
						</button>
					</div>

					{notionTest.status !== "idle" && (
						<div className={`tr-test-banner ${notionTest.status}`}>
							{notionTest.status === "ok" && <CheckCircle2 size={14} />}
							{notionTest.status === "error" && <AlertCircle size={14} />}
							<span className="tr-test-banner-text">{notionTest.text}</span>
						</div>
					)}
				</div>
			</div>

			{/* 3. Google Tasks (OAuth 2.0) */}
			<div className="setting-group-label">{ts.googleGroup}</div>
			<div className="setting-group">
				<div className="tr-api-block" style={{ borderTop: "none" }}>
					<div className="tr-custom-field">
						<label className="tr-custom-label">{ts.googleClientId}</label>
						<input
							type="text"
							dir="ltr"
							className="settings-text-input tr-api-input"
							placeholder="1234567890-xxxx.apps.googleusercontent.com"
							value={props.tasksGoogleClientId}
							onChange={(e) => props.handleTasksGoogleClientIdChange(e.target.value)}
						/>
						<span className="tr-api-hint">{ts.googleClientIdDesc}</span>
					</div>

					<div className="tr-custom-field">
						<label className="tr-custom-label">{ts.googleClientSecret}</label>
						<div className="tr-api-row">
							<input
								type={showGoogleSecret ? "text" : "password"}
								dir="ltr"
								className="settings-text-input tr-api-input"
								placeholder="GOCSPX-..."
								value={props.tasksGoogleClientSecret}
								onChange={(e) => props.handleTasksGoogleClientSecretChange(e.target.value)}
							/>
							<button
								type="button"
								className="settings-btn tr-icon-btn"
								onClick={() => setShowGoogleSecret((s) => !s)}
								title={showGoogleSecret ? t.translatorSettings.hideKey : t.translatorSettings.showKey}
							>
								{showGoogleSecret ? <EyeOff size={15} /> : <Eye size={15} />}
							</button>
						</div>
						<span className="tr-api-hint">{ts.googleClientSecretDesc}</span>
					</div>

					<div className="tr-local-header">
						<div>
							<div className="tr-local-title">
								{googleStatus.connected ? t.common.connected : t.common.notConnected}
							</div>
							<div className="tr-local-sub">
								{googleStatus.connected ? ts.googleConnectedDesc : ts.googleDisconnectedDesc}
							</div>
						</div>
						<div className="tr-local-actions">
							{googleStatus.connected ? (
								<button
									type="button"
									className="settings-btn danger"
									onClick={handleGoogleDisconnect}
								>
									<LogOut size={14} />
									<span>{ts.googleDisconnect}</span>
								</button>
							) : (
								<button
									type="button"
									className="settings-btn tr-accent-btn"
									disabled={
										googleAuthPending ||
										!props.tasksGoogleClientId.trim() ||
										!props.tasksGoogleClientSecret.trim()
									}
									onClick={handleGoogleSignIn}
								>
									<LogIn size={14} />
									<span>{googleAuthPending ? ts.googleWaiting : ts.googleSignIn}</span>
								</button>
							)}
						</div>
					</div>

					{googleBanner.status !== "idle" && (
						<div className={`tr-test-banner ${googleBanner.status}`}>
							{googleBanner.status === "ok" && <CheckCircle2 size={14} />}
							{googleBanner.status === "error" && <AlertCircle size={14} />}
							<span className="tr-test-banner-text">{googleBanner.text}</span>
						</div>
					)}
				</div>

				{googleStatus.connected && (
					<SettingRow
						icon={KeyRound}
						label={ts.googleTaskList}
						desc={ts.googleTaskListDesc}
						divider={false}
					>
						<ZenithSelect
							className="settings-select"
							value={props.tasksGoogleListId}
							onChange={(e) => props.handleTasksGoogleListIdChange(e.target.value)}
						>
							<option value="@default">{ts.googleDefaultList}</option>
							{googleStatus.lists.map((l) => (
								<option key={l.id} value={l.id}>
									{l.title}
								</option>
							))}
						</ZenithSelect>
					</SettingRow>
				)}
			</div>

			{/* 4. Background Sync */}
			<div className="setting-group-label">{ts.syncGroup}</div>
			<div className="setting-group">
				<SettingRow icon={RefreshCw} label={ts.autoSync} desc={ts.autoSyncDesc}>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={props.tasksAutoSync}
							onChange={props.toggleTasksAutoSync}
						/>
						<span className="slider" />
					</label>
				</SettingRow>

				{props.tasksAutoSync && (
					<SettingRow icon={Clock} label={ts.syncInterval} desc={ts.syncIntervalDesc}>
						<ZenithSelect
							className="settings-select"
							value={String(props.tasksSyncIntervalSec)}
							onChange={(e) =>
								props.handleTasksSyncIntervalSecChange(parseInt(e.target.value, 10) || 120)
							}
						>
							<option value="60">{ts.interval60}</option>
							<option value="120">{ts.interval120}</option>
							<option value="300">{ts.interval300}</option>
						</ZenithSelect>
					</SettingRow>
				)}

				<div className="tr-api-block">
					<div className="tr-local-header">
						<div className="tr-local-sub">
							{formattedSyncTime ? ts.lastSynced(formattedSyncTime) : ts.neverSynced}
						</div>
						<button
							type="button"
							className="settings-btn tr-accent-btn"
							disabled={syncing}
							onClick={handleSyncNow}
						>
							<RefreshCw size={14} className={syncing ? "qp-spin" : ""} />
							<span>{syncing ? ts.syncingNow : ts.syncNowBtn}</span>
						</button>
					</div>
					{syncError && (
						<div className="tr-test-banner error">
							<AlertCircle size={14} />
							<span className="tr-test-banner-text">{syncError}</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
