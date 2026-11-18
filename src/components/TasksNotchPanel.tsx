import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	Check,
	CheckCircle2,
	ChevronDown,
	Circle,
	Cloud,
	FileText,
	Laptop,
	ListTodo,
	Pencil,
	Plus,
	RefreshCw,
	SlidersHorizontal,
	StickyNote,
	Trash2,
	X
} from "lucide-react";
import { useI18n } from "../i18n";
import type {
	NoteItem,
	TaskItem,
	TaskSource,
	TasksNotchConfig,
	TasksSnapshot,
	TasksSubTab
} from "../types/tasks";
import "./TasksNotchPanel.css";

interface TasksNotchPanelProps {
	config: TasksNotchConfig;
	onPinChange: (pinned: boolean) => void;
	onRememberSubTab: (tab: TasksSubTab) => void;
}

type TaskFilter = "all" | TaskSource;
type CompletionFilter = "all" | "pending" | "completed";

function GoogleMarkIcon({ size = 11 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M20.5 12.2c0-.7-.1-1.4-.2-2H12v4h4.8a4.2 4.2 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.6-4 2.6-7Z" />
			<path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.4A9 9 0 0 0 12 21Z" />
			<path d="M6.9 13.6A5.4 5.4 0 0 1 6.6 12c0-.6.1-1.1.3-1.6V8H3.9A9 9 0 0 0 3 12c0 1.4.3 2.8.9 4l3-2.4Z" />
			<path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 12 3a9 9 0 0 0-8.1 5l3 2.4c.7-2.2 2.7-3.8 5.1-3.8Z" />
		</svg>
	);
}

function SourceIcon({ source, size = 11 }: { source: TaskSource; size?: number }) {
	if (source === "google") return <GoogleMarkIcon size={size} />;
	if (source === "notion") return <Cloud size={size} strokeWidth={2} />;
	return <Laptop size={size} strokeWidth={2} />;
}

export function TasksNotchPanel({
	config,
	onPinChange,
	onRememberSubTab
}: TasksNotchPanelProps) {
	const { t, dir, lang } = useI18n();
	const tp = t.tasksPanel;

	const showTasks = config.showTasksTab || !config.showNotesTab;
	const showNotes = config.showNotesTab;

	const resolveInitialTab = (): TasksSubTab => {
		if (!showTasks && showNotes) return "notes";
		if (!showNotes) return "tasks";
		if (config.defaultTab === "remember") return config.lastTab;
		return config.defaultTab;
	};

	const [activeTab, setActiveTab] = useState<TasksSubTab>(resolveInitialTab);
	const [snapshot, setSnapshot] = useState<TasksSnapshot>({
		tasks: [],
		notes: [],
		sync_status: {
			syncing: false,
			last_synced_at: null,
			last_error: null,
			google_connected: false,
			notion_tasks_configured: false,
			notion_notes_configured: false
		}
	});

	// Task UI state
	const [filter, setFilter] = useState<TaskFilter>("all");
	const [statusFilter, setStatusFilter] = useState<CompletionFilter>("all");
	const [newTitle, setNewTitle] = useState("");
	const [newNotes, setNewNotes] = useState("");
	const [showNewDetails, setShowNewDetails] = useState(false);
	const [targetSource, setTargetSource] = useState<"auto" | TaskSource>("auto");
	const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editNotes, setEditNotes] = useState("");
	const [contextMenu, setContextMenu] = useState<{
		taskId: string;
		x: number;
		y: number;
		confirmingDelete: boolean;
	} | null>(null);

	// Notes UI state
	const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
	const [showNoteList, setShowNoteList] = useState(false);
	const [noteTitleDraft, setNoteTitleDraft] = useState("");
	const [noteContentDraft, setNoteContentDraft] = useState("");
	const [syncNewNoteToNotion, setSyncNewNoteToNotion] = useState(true);

	const shellRef = useRef<HTMLDivElement>(null);
	const blurTimerRef = useRef<number | null>(null);
	const noteSaveTimerRef = useRef<number | null>(null);
	const pendingNoteFlushRef = useRef<{ id: string; title: string; content: string } | null>(null);

	// Keep activeTab valid if settings hide one of the tabs
	useEffect(() => {
		if (activeTab === "tasks" && !showTasks && showNotes) {
			setActiveTab("notes");
		} else if (activeTab === "notes" && !showNotes && showTasks) {
			setActiveTab("tasks");
		}
	}, [activeTab, showTasks, showNotes]);

	const switchSubTab = (tab: TasksSubTab) => {
		setActiveTab(tab);
		onRememberSubTab(tab);
	};

	// Manage notch keyboard focus + hover pinning cleanly for IME / Arabic typing
	const handleInputFocus = useCallback(() => {
		if (blurTimerRef.current !== null) {
			window.clearTimeout(blurTimerRef.current);
			blurTimerRef.current = null;
		}
		onPinChange(true);
		invoke("set_notch_keyboard_focus", { focused: true }).catch(() => {});
	}, [onPinChange]);

	const handleInputBlur = useCallback(() => {
		if (blurTimerRef.current !== null) {
			window.clearTimeout(blurTimerRef.current);
		}
		blurTimerRef.current = window.setTimeout(() => {
			blurTimerRef.current = null;
			const activeEl = document.activeElement;
			const stillInPanel =
				activeEl instanceof HTMLElement && Boolean(activeEl.closest(".tasks-notch-shell"));
			if (!stillInPanel) {
				onPinChange(false);
				invoke("set_notch_keyboard_focus", { focused: false }).catch(() => {});
			}
		}, 60);
	}, [onPinChange]);

	// Load snapshot + subscribe to backend updates + sync on open if autoSync is enabled
	useEffect(() => {
		let mounted = true;
		invoke<TasksSnapshot>("tasks_get_snapshot")
			.then((snap) => {
				if (mounted) setSnapshot(snap);
			})
			.catch(() => {});

		if (config.autoSync) {
			invoke<TasksSnapshot>("tasks_sync_now")
				.then((snap) => {
					if (mounted) setSnapshot(snap);
				})
				.catch(() => {});
		}

		let unlisten: (() => void) | undefined;
		listen<TasksSnapshot>("tasks-store-updated", (ev) => {
			if (mounted) setSnapshot(ev.payload);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		return () => {
			mounted = false;
			unlisten?.();
			if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
			if (noteSaveTimerRef.current !== null) window.clearTimeout(noteSaveTimerRef.current);
			if (pendingNoteFlushRef.current) {
				const p = pendingNoteFlushRef.current;
				pendingNoteFlushRef.current = null;
				invoke("tasks_update_note", {
					id: p.id,
					title: p.title,
					content: p.content,
					triggerSync: true
				}).catch(() => {});
			}
			onPinChange(false);
			invoke("set_notch_keyboard_focus", { focused: false }).catch(() => {});
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Periodic background refresh while panel is open
	useEffect(() => {
		if (!config.autoSync) return;
		const ms = Math.max(30, config.syncIntervalSec || 120) * 1000;
		const timer = window.setInterval(() => {
			invoke<TasksSnapshot>("tasks_sync_now").catch(() => {});
		}, ms);
		return () => window.clearInterval(timer);
	}, [config.autoSync, config.syncIntervalSec]);

	const activeNote: NoteItem | null = useMemo(() => {
		if (snapshot.notes.length === 0) return null;
		return snapshot.notes.find((n) => n.id === selectedNoteId) ?? snapshot.notes[0];
	}, [snapshot.notes, selectedNoteId]);

	// Keep draft synced when selecting a different note
	useEffect(() => {
		if (!activeNote) {
			setNoteTitleDraft("");
			setNoteContentDraft("");
			return;
		}
		if (pendingNoteFlushRef.current?.id === activeNote.id) return;
		setSelectedNoteId(activeNote.id);
		setNoteTitleDraft(activeNote.title);
		setNoteContentDraft(activeNote.content);
	}, [activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleAddTask = async () => {
		const trimmed = newTitle.trim();
		if (!trimmed) return;
		const notesToSend = showNewDetails ? newNotes : "";
		const src = targetSource === "auto" ? null : targetSource;
		setNewTitle("");
		setNewNotes("");
		setShowNewDetails(false);
		try {
			const snap = await invoke<TasksSnapshot>("tasks_add_task", {
				title: trimmed,
				notes: notesToSend,
				source: src
			});
			setSnapshot(snap);
		} catch (e) {
			console.error("Failed adding task:", e);
		}
	};

	const handleToggleTask = async (id: string) => {
		try {
			const snap = await invoke<TasksSnapshot>("tasks_toggle_task", { id });
			setSnapshot(snap);
		} catch (e) {
			console.error("Failed toggling task:", e);
		}
	};

	const handleDeleteTask = async (id: string) => {
		try {
			const snap = await invoke<TasksSnapshot>("tasks_delete_task", { id });
			setSnapshot(snap);
		} catch (e) {
			console.error("Failed deleting task:", e);
		}
	};

	const startEditingTask = useCallback((task: TaskItem) => {
		setContextMenu(null);
		setEditingTaskId(task.id);
		setEditTitle(task.title);
		setEditNotes(task.notes);
	}, []);

	const cancelEditingTask = useCallback(() => {
		setEditingTaskId(null);
		onPinChange(false);
		invoke("set_notch_keyboard_focus", { focused: false }).catch(() => {});
	}, [onPinChange]);

	const openTaskContextMenu = useCallback(
		(e: React.MouseEvent, task: TaskItem) => {
			e.preventDefault();
			e.stopPropagation();
			const shell = shellRef.current;
			if (!shell) return;
			const rect = shell.getBoundingClientRect();
			const zoom = shell.clientWidth > 0 ? rect.width / shell.clientWidth : 1;
			const menuW = 136;
			const menuH = 66;
			const rawX = (e.clientX - rect.left) / zoom;
			const rawY = (e.clientY - rect.top) / zoom;
			const x = Math.max(8, Math.min(rawX, Math.max(8, shell.clientWidth - menuW - 8)));
			const y = Math.max(6, Math.min(rawY, Math.max(6, shell.clientHeight - menuH - 6)));
			setContextMenu({
				taskId: task.id,
				x,
				y,
				confirmingDelete: false
			});
		},
		[]
	);

	// Click outside cancels task editing and/or closes the right-click context menu.
	useEffect(() => {
		if (!editingTaskId && !contextMenu) return;

		const handleDocPointerDown = (e: PointerEvent) => {
			const target = e.target as HTMLElement | null;
			if (contextMenu && (!target || !target.closest(".tasks-context-menu"))) {
				setContextMenu(null);
			}
			if (editingTaskId && (!target || !target.closest(".tasks-row.is-editing"))) {
				cancelEditingTask();
			}
		};

		const handleWindowBlur = () => {
			setContextMenu(null);
			if (editingTaskId) {
				cancelEditingTask();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (contextMenu) setContextMenu(null);
				if (editingTaskId) cancelEditingTask();
			}
		};

		document.addEventListener("pointerdown", handleDocPointerDown, true);
		window.addEventListener("blur", handleWindowBlur);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handleDocPointerDown, true);
			window.removeEventListener("blur", handleWindowBlur);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [editingTaskId, contextMenu, cancelEditingTask]);

	const saveTaskEdit = async () => {
		if (!editingTaskId || !editTitle.trim()) return;
		const id = editingTaskId;
		cancelEditingTask();
		try {
			const snap = await invoke<TasksSnapshot>("tasks_update_task", {
				id,
				title: editTitle,
				notes: editNotes
			});
			setSnapshot(snap);
		} catch (e) {
			console.error("Failed updating task:", e);
		}
	};

	const scheduleNoteSave = (id: string, title: string, content: string, syncNow = false) => {
		pendingNoteFlushRef.current = { id, title, content };
		if (noteSaveTimerRef.current !== null) {
			window.clearTimeout(noteSaveTimerRef.current);
			noteSaveTimerRef.current = null;
		}
		const commit = () => {
			const pending = pendingNoteFlushRef.current;
			if (!pending) return;
			pendingNoteFlushRef.current = null;
			invoke<TasksSnapshot>("tasks_update_note", {
				id: pending.id,
				title: pending.title,
				content: pending.content,
				triggerSync: syncNow
			})
				.then(setSnapshot)
				.catch(() => {});
		};
		if (syncNow) {
			commit();
		} else {
			noteSaveTimerRef.current = window.setTimeout(commit, 420);
		}
	};

	const handleCreateNote = async () => {
		try {
			const snap = await invoke<TasksSnapshot>("tasks_add_note", {
				title: "",
				content: "",
				syncToNotion: syncNewNoteToNotion && snapshot.sync_status.notion_notes_configured
			});
			setSnapshot(snap);
			if (snap.notes[0]) {
				setSelectedNoteId(snap.notes[0].id);
				setNoteTitleDraft(snap.notes[0].title);
				setNoteContentDraft(snap.notes[0].content);
			}
			setShowNoteList(false);
		} catch (e) {
			console.error("Failed creating note:", e);
		}
	};

	const handleDeleteActiveNote = async () => {
		if (!activeNote) return;
		const id = activeNote.id;
		pendingNoteFlushRef.current = null;
		if (noteSaveTimerRef.current !== null) {
			window.clearTimeout(noteSaveTimerRef.current);
			noteSaveTimerRef.current = null;
		}
		try {
			const snap = await invoke<TasksSnapshot>("tasks_delete_note", { id });
			setSnapshot(snap);
			const next = snap.notes[0] ?? null;
			setSelectedNoteId(next?.id ?? null);
			setNoteTitleDraft(next?.title ?? "");
			setNoteContentDraft(next?.content ?? "");
		} catch (e) {
			console.error("Failed deleting note:", e);
		}
	};

	const availableSources = useMemo(() => {
		const sources: TaskSource[] = ["local"];
		if (
			snapshot.sync_status.google_connected ||
			snapshot.tasks.some((t) => t.source === "google")
		) {
			sources.push("google");
		}
		if (
			snapshot.sync_status.notion_tasks_configured ||
			snapshot.tasks.some((t) => t.source === "notion")
		) {
			sources.push("notion");
		}
		return sources;
	}, [snapshot.sync_status, snapshot.tasks]);

	const cycleTargetSource = () => {
		const order: Array<"auto" | TaskSource> = ["auto", ...availableSources];
		const idx = order.indexOf(targetSource);
		setTargetSource(order[(idx + 1) % order.length]);
	};

	const sourceLabel = (src: "auto" | TaskSource) => {
		if (src === "google") return tp.sourceGoogle;
		if (src === "notion") return tp.sourceNotion;
		if (src === "local") return tp.sourceLocal;
		return tp.filterAll;
	};

	const filteredTasks = useMemo(() => {
		return snapshot.tasks.filter((task) => {
			if (filter !== "all" && task.source !== filter) return false;
			if (statusFilter === "pending") return !task.completed;
			if (statusFilter === "completed") return task.completed;
			if (!config.showCompleted && task.completed) return false;
			return true;
		});
	}, [snapshot.tasks, filter, statusFilter, config.showCompleted]);

	const activeTasks = filteredTasks.filter((t) => !t.completed);
	const completedTasks = filteredTasks.filter((t) => t.completed);

	const renderTaskRow = (task: TaskItem) => {
		const isEditing = editingTaskId === task.id;
		return (
			<div
				key={task.id}
				className={`tasks-row ${task.completed ? "is-done" : ""} ${isEditing ? "is-editing" : ""} ${config.density === "compact" ? "compact" : ""}`}
				onDoubleClick={(e) => {
					if (e.button !== 0 || isEditing) return;
					const target = e.target as HTMLElement | null;
					if (target?.closest(".tasks-check-btn")) {
						return;
					}
					startEditingTask(task);
				}}
				onContextMenu={(e) => {
					if (isEditing) return;
					openTaskContextMenu(e, task);
				}}
			>
				<button
					type="button"
					className={`tasks-check-btn ${task.completed ? "checked" : ""}`}
					aria-label={task.completed ? tp.markUndone : tp.markDone}
					onClick={() => void handleToggleTask(task.id)}
				>
					{task.completed && <Check size={10} strokeWidth={3} />}
				</button>

				{isEditing ? (
					<div className="tasks-edit-stack">
						<input
							type="text"
							dir="auto"
							lang={lang}
							autoFocus
							className="tasks-input"
							value={editTitle}
							onChange={(e) => setEditTitle(e.target.value)}
							onFocus={handleInputFocus}
							onBlur={handleInputBlur}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") void saveTaskEdit();
								if (e.key === "Escape") cancelEditingTask();
							}}
						/>
						<input
							type="text"
							dir="auto"
							lang={lang}
							className="tasks-input tasks-input-sub"
							placeholder={tp.addNoteDetailPlaceholder}
							value={editNotes}
							onChange={(e) => setEditNotes(e.target.value)}
							onFocus={handleInputFocus}
							onBlur={handleInputBlur}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") void saveTaskEdit();
								if (e.key === "Escape") cancelEditingTask();
							}}
						/>
						<div className="tasks-edit-actions">
							<button
								type="button"
								className="tasks-mini-btn"
								onClick={cancelEditingTask}
							>
								{tp.cancelEdit}
							</button>
							<button
								type="button"
								className="tasks-mini-btn primary"
								onClick={() => void saveTaskEdit()}
							>
								{tp.saveEdit}
							</button>
						</div>
					</div>
				) : (
					<>
						<div className="tasks-row-main">
							<span className="tasks-row-title" dir="auto">
								{task.title}
							</span>
							{config.showTaskNotes && task.notes.trim() !== "" && (
								<span className="tasks-row-notes" dir="auto">
									{task.notes}
								</span>
							)}
						</div>

						<div className="tasks-row-meta">
							{task.dirty && (
								<span className="tasks-dirty-dot" title={tp.pendingSync} />
							)}
							{config.showSourceBadge && (
								<span
									className={`tasks-source-badge ${task.source}`}
									title={sourceLabel(task.source)}
									aria-label={sourceLabel(task.source)}
								>
									<SourceIcon source={task.source} size={11} />
								</span>
							)}
						</div>
					</>
				)}
			</div>
		);
	};

	return (
		<div
			ref={shellRef}
			className="tasks-notch-shell"
			dir={dir}
			onClick={(e) => e.stopPropagation()}
			onContextMenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			{/* Left Vertical Icon Switcher Rail */}
			<nav className="tasks-rail" aria-label={t.notch.panelTasks}>
				<div className="tasks-rail-group">
					{showTasks && (
						<button
							type="button"
							className={`tasks-rail-btn ${activeTab === "tasks" ? "active" : ""}`}
							title={tp.tasksTab}
							aria-label={tp.tasksTab}
							onClick={() => switchSubTab("tasks")}
						>
							<ListTodo size={14} strokeWidth={2} />
						</button>
					)}
					{showNotes && (
						<button
							type="button"
							className={`tasks-rail-btn ${activeTab === "notes" ? "active" : ""}`}
							title={tp.notesTab}
							aria-label={tp.notesTab}
							onClick={() => switchSubTab("notes")}
						>
							<StickyNote size={14} strokeWidth={2} />
						</button>
					)}
				</div>

				<div className="tasks-rail-group">
					<button
						type="button"
						className="tasks-rail-btn"
						title={snapshot.sync_status.syncing ? tp.syncing : tp.syncNow}
						aria-label={tp.syncNow}
						onClick={() => void invoke("tasks_sync_now").catch(() => {})}
					>
						<RefreshCw
							size={13}
							strokeWidth={2}
							className={snapshot.sync_status.syncing ? "tasks-spin" : ""}
						/>
						{snapshot.sync_status.last_error && <span className="tasks-rail-dot" />}
					</button>
					<button
						type="button"
						className="tasks-rail-btn"
						title={tp.openSettings}
						aria-label={tp.openSettings}
						onClick={() => void invoke("tasks_open_settings").catch(() => {})}
					>
						<SlidersHorizontal size={13} strokeWidth={2} />
					</button>
				</div>
			</nav>

			{/* Right Content Pane (respects Arabic RTL or English LTR) */}
			<div className="tasks-content-pane" dir={dir}>
				{snapshot.sync_status.last_error && (
					<div className="tasks-error-bar" title={snapshot.sync_status.last_error}>
						<AlertCircle size={12} style={{ flexShrink: 0 }} />
						<span>{snapshot.sync_status.last_error}</span>
					</div>
				)}

				{activeTab === "tasks" ? (
					<>
						{/* Filter + Count Header */}
						<div className="tasks-topbar">
							<div className="tasks-filter-row">
								<button
									type="button"
									className={`tasks-filter-chip ${filter === "all" ? "active" : ""}`}
									onClick={() => setFilter("all")}
								>
									{tp.filterAll}
								</button>
								{availableSources.map((src) => (
									<button
										key={src}
										type="button"
										className={`tasks-filter-chip icon-only ${filter === src ? "active" : ""}`}
										title={sourceLabel(src)}
										aria-label={sourceLabel(src)}
										onClick={() => setFilter(src)}
									>
										<SourceIcon source={src} size={11} />
									</button>
								))}
								<span className="tasks-filter-sep" aria-hidden="true" />
								<button
									type="button"
									className={`tasks-filter-chip ${statusFilter === "pending" ? "active" : ""}`}
									onClick={() =>
										setStatusFilter((prev) => (prev === "pending" ? "all" : "pending"))
									}
								>
									<Circle size={10} strokeWidth={2.2} />
									<span>{tp.filterPending}</span>
								</button>
								<button
									type="button"
									className={`tasks-filter-chip ${statusFilter === "completed" ? "active" : ""}`}
									onClick={() =>
										setStatusFilter((prev) =>
											prev === "completed" ? "all" : "completed"
										)
									}
								>
									<CheckCircle2 size={10} strokeWidth={2.2} />
									<span>{tp.filterCompleted}</span>
								</button>
							</div>
							<span className="tasks-meta-count">
								{statusFilter === "completed"
									? completedTasks.length
									: statusFilter === "pending"
										? activeTasks.length
										: config.showCompleted && completedTasks.length > 0
											? `${activeTasks.length} / ${activeTasks.length + completedTasks.length}`
											: activeTasks.length}
							</span>
						</div>

						{/* Quick Add Input */}
						{config.showQuickAdd && (
							<div className="tasks-add-box">
								<div className="tasks-add-row">
									<input
										type="text"
										dir="auto"
										lang={lang}
										className="tasks-input"
										placeholder={tp.addTaskPlaceholder}
										value={newTitle}
										onChange={(e) => setNewTitle(e.target.value)}
										onFocus={handleInputFocus}
										onBlur={handleInputBlur}
										onKeyDown={(e) => {
											e.stopPropagation();
											if (e.key === "Enter") void handleAddTask();
										}}
									/>
									{availableSources.length > 1 && (
										<button
											type="button"
											className="tasks-source-pick"
											onClick={cycleTargetSource}
											title={`${t.tasksSettings.defaultTarget}: ${sourceLabel(targetSource)}`}
											aria-label={sourceLabel(targetSource)}
										>
											{targetSource === "auto" ? (
												tp.filterAll
											) : (
												<SourceIcon source={targetSource} size={11} />
											)}
										</button>
									)}
									<button
										type="button"
										className={`tasks-icon-btn ${showNewDetails ? "active" : ""}`}
										title={tp.toggleDetails}
										aria-label={tp.toggleDetails}
										onClick={() => setShowNewDetails((s) => !s)}
									>
										<FileText size={12} />
									</button>
									<button
										type="button"
										className="tasks-add-btn"
										disabled={!newTitle.trim()}
										title={tp.addButton}
										aria-label={tp.addButton}
										onClick={() => void handleAddTask()}
									>
										<Plus size={13} strokeWidth={2.5} />
									</button>
								</div>

								{showNewDetails && (
									<input
										type="text"
										dir="auto"
										lang={lang}
										className="tasks-input tasks-input-sub"
										placeholder={tp.addNoteDetailPlaceholder}
										value={newNotes}
										onChange={(e) => setNewNotes(e.target.value)}
										onFocus={handleInputFocus}
										onBlur={handleInputBlur}
										onKeyDown={(e) => {
											e.stopPropagation();
											if (e.key === "Enter") void handleAddTask();
										}}
									/>
								)}
							</div>
						)}

						{/* Scrollable Task List */}
						<div
							className="tasks-scroll-area"
							onWheel={(e) => e.stopPropagation()}
							onScroll={() => {
								if (contextMenu) setContextMenu(null);
							}}
						>
							{filteredTasks.length === 0 ? (
								<div className="tasks-empty">
									{snapshot.tasks.length === 0 ? tp.emptyTasks : tp.emptyFilter}
								</div>
							) : (
								<>
									{statusFilter !== "completed" && activeTasks.map(renderTaskRow)}
									{statusFilter === "completed" && completedTasks.map(renderTaskRow)}
									{statusFilter === "all" && config.showCompleted && completedTasks.length > 0 && (
										<>
											<div className="tasks-section-divider">
												{tp.completedSection(completedTasks.length)}
											</div>
											{completedTasks.map(renderTaskRow)}
										</>
									)}
								</>
							)}
						</div>
					</>
				) : (
					<>
						{/* Notes Top Toolbar */}
						<div className="notes-toolbar">
							<button
								type="button"
								className="notes-picker-btn"
								onClick={() => setShowNoteList((s) => !s)}
							>
								<ChevronDown size={12} />
								<span>
									{showNoteList
										? tp.notesCount(snapshot.notes.length)
										: activeNote?.title.trim() || tp.untitledNote}
								</span>
							</button>

							{activeNote && config.showSourceBadge && (
								<span
									className={`tasks-source-badge ${activeNote.source}`}
									title={sourceLabel(activeNote.source)}
									aria-label={sourceLabel(activeNote.source)}
								>
									<SourceIcon source={activeNote.source} size={11} />
								</span>
							)}

							<div style={{ flex: 1 }} />

							{snapshot.sync_status.notion_notes_configured && (
								<button
									type="button"
									className="tasks-source-pick"
									title={tp.syncToNotionToggle}
									aria-label={
										syncNewNoteToNotion ? tp.sourceNotion : tp.sourceLocal
									}
									onClick={() => setSyncNewNoteToNotion((s) => !s)}
								>
									<SourceIcon
										source={syncNewNoteToNotion ? "notion" : "local"}
										size={11}
									/>
								</button>
							)}

							<button
								type="button"
								className="tasks-icon-btn"
								title={tp.newNote}
								aria-label={tp.newNote}
								onClick={() => void handleCreateNote()}
							>
								<Plus size={13} />
							</button>

							{activeNote && (
								<button
									type="button"
									className="tasks-icon-btn danger"
									title={tp.deleteNote}
									aria-label={tp.deleteNote}
									onClick={() => void handleDeleteActiveNote()}
								>
									<Trash2 size={12} />
								</button>
							)}
						</div>

						{showNoteList ? (
							<div
								className="tasks-scroll-area"
								onWheel={(e) => e.stopPropagation()}
							>
								{snapshot.notes.length === 0 ? (
									<div className="tasks-empty">{tp.emptyNotes}</div>
								) : (
									snapshot.notes.map((note) => (
										<button
											key={note.id}
											type="button"
											className={`notes-list-item ${activeNote?.id === note.id ? "active" : ""}`}
											onClick={() => {
												setSelectedNoteId(note.id);
												setNoteTitleDraft(note.title);
												setNoteContentDraft(note.content);
												setShowNoteList(false);
											}}
										>
											<div className="notes-list-text">
												<span className="notes-list-title" dir="auto">
													{note.title.trim() || tp.untitledNote}
												</span>
												{note.content.trim() && (
													<span className="notes-list-preview" dir="auto">
														{note.content}
													</span>
												)}
											</div>
											{config.showSourceBadge && (
												<span
													className={`tasks-source-badge ${note.source}`}
													title={sourceLabel(note.source)}
													aria-label={sourceLabel(note.source)}
												>
													<SourceIcon source={note.source} size={11} />
												</span>
											)}
										</button>
									))
								)}
							</div>
						) : activeNote ? (
							<div className="notes-editor-card">
								<input
									type="text"
									dir="auto"
									lang={lang}
									className="notes-title-input"
									placeholder={tp.noteTitlePlaceholder}
									value={noteTitleDraft}
									onChange={(e) => {
										const nextTitle = e.target.value;
										setNoteTitleDraft(nextTitle);
										scheduleNoteSave(activeNote.id, nextTitle, noteContentDraft);
									}}
									onFocus={handleInputFocus}
									onBlur={() => {
										handleInputBlur();
										if (pendingNoteFlushRef.current?.id === activeNote.id) {
											scheduleNoteSave(activeNote.id, noteTitleDraft, noteContentDraft, true);
										}
									}}
									onKeyDown={(e) => e.stopPropagation()}
								/>
								<textarea
									dir="auto"
									lang={lang}
									className="notes-textarea"
									placeholder={tp.noteBodyPlaceholder}
									value={noteContentDraft}
									onChange={(e) => {
										const nextContent = e.target.value;
										setNoteContentDraft(nextContent);
										scheduleNoteSave(activeNote.id, noteTitleDraft, nextContent);
									}}
									onFocus={handleInputFocus}
									onBlur={() => {
										handleInputBlur();
										if (pendingNoteFlushRef.current?.id === activeNote.id) {
											scheduleNoteSave(activeNote.id, noteTitleDraft, noteContentDraft, true);
										}
									}}
									onWheel={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								/>
							</div>
						) : (
							<div className="tasks-empty">
								<span>{tp.emptyNotes}</span>
								<button
									type="button"
									className="tasks-mini-btn primary"
									onClick={() => void handleCreateNote()}
								>
									{tp.newNote}
								</button>
							</div>
						)}
					</>
				)}
			</div>

			{contextMenu && (
				<div
					className="tasks-context-menu"
					dir={dir}
					role="menu"
					style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
					onClick={(e) => e.stopPropagation()}
					onContextMenu={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					{contextMenu.confirmingDelete ? (
						<div className="tasks-context-confirm-row">
							<button
								type="button"
								className="tasks-context-confirm-btn danger"
								onClick={() => {
									const targetId = contextMenu.taskId;
									setContextMenu(null);
									void handleDeleteTask(targetId);
								}}
							>
								<Check size={11} strokeWidth={2.5} />
								<span>{tp.confirmDelete}</span>
							</button>
							<button
								type="button"
								className="tasks-context-confirm-btn"
								onClick={() => setContextMenu(null)}
							>
								<X size={11} strokeWidth={2.5} />
								<span>{tp.cancelEdit}</span>
							</button>
						</div>
					) : (
						<>
							<button
								type="button"
								role="menuitem"
								className="tasks-context-item"
								onClick={() => {
									const task = snapshot.tasks.find((t) => t.id === contextMenu.taskId);
									setContextMenu(null);
									if (task) startEditingTask(task);
								}}
							>
								<Pencil size={12} />
								<span>{tp.editMenu}</span>
							</button>
							<button
								type="button"
								role="menuitem"
								className="tasks-context-item danger"
								onClick={() =>
									setContextMenu((prev) =>
										prev ? { ...prev, confirmingDelete: true } : null
									)
								}
							>
								<Trash2 size={12} />
								<span>{tp.deleteMenu}</span>
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
