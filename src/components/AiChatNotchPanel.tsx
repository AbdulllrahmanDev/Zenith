import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	Check,
	Copy,
	FileCode2,
	FileText,
	History,
	Image as ImageIcon,
	Loader2,
	Paperclip,
	Plus,
	SendHorizontal,
	Settings,
	Square,
	Trash2,
	UploadCloud,
	X
} from "lucide-react";
import { useI18n } from "../i18n";
import { ZenithAiIcon } from "../icons/ZenithAiIcon";
import { ZenithSelect } from "./ZenithSelect";
import type {
	AiChatNotchConfig,
	AiChatProviderChoice,
	AiChatSnapshot,
	ChatAttachment
} from "../types/aiChat";
import "./AiChatNotchPanel.css";

interface AiChatNotchPanelProps {
	config: AiChatNotchConfig;
	pendingDropPaths: string[];
	onConsumePendingDrop: () => void;
	isDragHovering: boolean;
	onPinChange: (pinned: boolean) => void;
}

const EMPTY_SNAPSHOT: AiChatSnapshot = {
	conversations: [],
	active_conversation_id: null,
	busy: false,
	last_error: null
};

export function AiChatNotchPanel({
	config,
	pendingDropPaths,
	onConsumePendingDrop,
	isDragHovering,
	onPinChange
}: AiChatNotchPanelProps) {
	const { t, dir } = useI18n();
	const ac = t.aiChatPanel;

	const [snapshot, setSnapshot] = useState<AiChatSnapshot>(EMPTY_SNAPSHOT);
	const [input, setInput] = useState("");
	const [staged, setStaged] = useState<ChatAttachment[]>([]);
	const [preparingCount, setPreparingCount] = useState(0);
	const [providerChoice, setProviderChoice] = useState<AiChatProviderChoice>(
		config.defaultProvider
	);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [sendError, setSendError] = useState<string | null>(null);

	const focusedRef = useRef(false);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		setProviderChoice(config.defaultProvider);
	}, [config.defaultProvider]);

	useEffect(() => {
		let cancelled = false;
		invoke<AiChatSnapshot>("ai_chat_get_state")
			.then((snap) => {
				if (!cancelled) setSnapshot(snap);
			})
			.catch(() => {});

		let unlisten: (() => void) | undefined;
		listen<AiChatSnapshot>("ai-chat-updated", (ev) => {
			if (!cancelled) setSnapshot(ev.payload);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			unlisten?.();
			if (focusedRef.current) {
				focusedRef.current = false;
				onPinChange(false);
				invoke("set_notch_keyboard_focus", { focused: false }).catch(() => {});
			}
		};
	}, [onPinChange]);

	const activeConversation = useMemo(() => {
		if (snapshot.active_conversation_id) {
			const match = snapshot.conversations.find(
				(c) => c.id === snapshot.active_conversation_id
			);
			if (match) return match;
		}
		return null;
	}, [snapshot.active_conversation_id, snapshot.conversations]);

	const activeMessages = activeConversation?.messages ?? [];

	useEffect(() => {
		if (!historyOpen) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
		}
	}, [activeMessages.length, snapshot.busy, historyOpen]);

	const attachPaths = useCallback(async (paths: string[]) => {
		if (paths.length === 0) return;
		setSendError(null);
		setPreparingCount((n) => n + paths.length);
		try {
			const prepared = await invoke<ChatAttachment[]>("ai_chat_prepare_attachments", {
				paths
			});
			if (prepared.length > 0) {
				setStaged((prev) => [...prev, ...prepared].slice(0, 4));
			}
		} catch (e) {
			console.error("Failed to prepare attachments:", e);
		} finally {
			setPreparingCount((n) => Math.max(0, n - paths.length));
		}
	}, []);

	useEffect(() => {
		if (pendingDropPaths.length === 0) return;
		const paths = [...pendingDropPaths];
		onConsumePendingDrop();
		void attachPaths(paths);
	}, [pendingDropPaths, onConsumePendingDrop, attachPaths]);

	const handleInputFocus = () => {
		if (focusedRef.current) return;
		focusedRef.current = true;
		onPinChange(true);
		invoke("set_notch_keyboard_focus", { focused: true }).catch(() => {});
	};

	const handleInputBlur = () => {
		if (!focusedRef.current) return;
		focusedRef.current = false;
		onPinChange(false);
		invoke("set_notch_keyboard_focus", { focused: false }).catch(() => {});
	};

	const handlePickFiles = async () => {
		onPinChange(true);
		try {
			const selected = await open({ multiple: true });
			if (!selected) return;
			const paths = Array.isArray(selected) ? selected : [selected];
			if (paths.length > 0) {
				handleInputFocus();
				inputRef.current?.focus();
				await attachPaths(paths);
			}
		} catch (e) {
			console.error("File dialog failed:", e);
		} finally {
			if (!focusedRef.current) {
				onPinChange(false);
			}
		}
	};

	const handleSend = async () => {
		if (snapshot.busy) return;
		const trimmed = input.trim();
		const sendableAttachments = staged.filter((a) => !a.error);
		if (!trimmed && sendableAttachments.length === 0) return;

		const outgoingText = trimmed;
		const outgoingAtts = staged;
		const convId = activeConversation?.id ?? null;

		setSendError(null);
		setInput("");
		setStaged([]);
		setHistoryOpen(false);

		try {
			const updated = await invoke<AiChatSnapshot>("ai_chat_send_message", {
				conversationId: convId,
				text: outgoingText,
				attachments: outgoingAtts,
				providerOverride: providerChoice === "inherit" ? null : providerChoice
			});
			setSnapshot(updated);
		} catch (e) {
			setInput(outgoingText);
			setStaged(outgoingAtts);
			setSendError(String(e));
		}
	};

	const handleCancel = () => {
		invoke<AiChatSnapshot>("ai_chat_cancel")
			.then(setSnapshot)
			.catch(() => {});
	};

	const handleNewChat = () => {
		setHistoryOpen(false);
		setSendError(null);
		setStaged([]);
		invoke<AiChatSnapshot>("ai_chat_new_conversation")
			.then((snap) => {
				setSnapshot(snap);
				inputRef.current?.focus();
			})
			.catch(() => {});
	};

	const handleSelectConversation = (id: string) => {
		setHistoryOpen(false);
		setSendError(null);
		invoke<AiChatSnapshot>("ai_chat_select_conversation", { id })
			.then(setSnapshot)
			.catch(() => {});
	};

	const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		invoke<AiChatSnapshot>("ai_chat_delete_conversation", { id })
			.then(setSnapshot)
			.catch(() => {});
	};

	const handleCopy = async (id: string, text: string) => {
		try {
			await writeText(text);
		} catch {
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				return;
			}
		}
		setCopiedId(id);
		window.setTimeout(() => {
			setCopiedId((prev) => (prev === id ? null : prev));
		}, 1500);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	};

	const openAiSettings = () => {
		invoke("ai_chat_open_settings").catch(() => {});
	};

	const autoProviderLabel = (() => {
		if (config.sharedEngine === "local") return `${ac.providerInherit} (${ac.providerLocal})`;
		if (config.sharedProvider === "groq") return `${ac.providerInherit} (${ac.providerGroq})`;
		if (config.sharedProvider === "openai") return `${ac.providerInherit} (${ac.providerOpenai})`;
		if (config.sharedProvider === "custom") return `${ac.providerInherit} (${ac.providerCustom})`;
		return `${ac.providerInherit} (${ac.providerGemini})`;
	})();

	const canSend =
		!snapshot.busy &&
		(input.trim().length > 0 || staged.some((a) => !a.error));

	const formatAttachmentIcon = (att: ChatAttachment) => {
		if (att.kind === "image") return <ImageIcon size={12} />;
		if (att.mime === "application/pdf" || att.name.toLowerCase().endsWith(".pdf")) {
			return <FileText size={12} />;
		}
		return <FileCode2 size={12} />;
	};

	return (
		<div className="ai-chat-shell" dir={dir}>
			{/* Header */}
			<div className="ai-chat-header">
				<div className="ai-chat-header-start">
					<div className="ai-chat-title-wrap">
						<span className="ai-chat-title-icon">
							<ZenithAiIcon size={14} />
						</span>
						<span className="ai-chat-title-text">
							{activeConversation?.title || ac.title}
						</span>
					</div>
				</div>

				<div className="ai-chat-header-end">
					<ZenithSelect
						className="ai-chat-provider-select"
						value={providerChoice}
						onChange={(e) => setProviderChoice(e.target.value as AiChatProviderChoice)}
						aria-label={ac.title}
						onOpenChange={(isOpen) => {
							if (isOpen) {
								onPinChange(true);
							} else if (!focusedRef.current) {
								onPinChange(false);
							}
						}}
					>
						<option value="inherit">{autoProviderLabel}</option>
						<option value="gemini">{ac.providerGemini}</option>
						<option value="groq">{ac.providerGroq}</option>
						<option value="openai">{ac.providerOpenai}</option>
						<option value="custom">{ac.providerCustom}</option>
						<option value="local">{ac.providerLocal}</option>
					</ZenithSelect>

					<button
						type="button"
						className="ai-chat-icon-btn"
						onClick={handleNewChat}
						title={ac.newChat}
						aria-label={ac.newChat}
					>
						<Plus size={14} />
					</button>

					<button
						type="button"
						className={`ai-chat-icon-btn ${historyOpen ? "active" : ""}`}
						onClick={() => setHistoryOpen((o) => !o)}
						title={ac.history}
						aria-label={ac.history}
					>
						<History size={13} />
					</button>

					<button
						type="button"
						className="ai-chat-icon-btn"
						onClick={openAiSettings}
						title={ac.openSettings}
						aria-label={ac.openSettings}
					>
						<Settings size={13} />
					</button>
				</div>
			</div>

			{/* Messages / Empty State */}
			<div className="ai-chat-body">
				<div className="ai-chat-messages">
					{activeMessages.length === 0 ? (
						<div className="ai-chat-empty">
							<div className="ai-chat-empty-badge">
								<ZenithAiIcon size={20} strokeWidth={1.4} />
							</div>
							<div className="ai-chat-empty-title">{ac.emptyTitle}</div>
							<div className="ai-chat-empty-desc">{ac.emptyDesc}</div>
						</div>
					) : (
						activeMessages.map((msg) => (
							<div key={msg.id} className={`ai-chat-msg ${msg.role}`}>
								<div className="ai-chat-bubble" dir="auto">
									{msg.attachments.length > 0 && (
										<div className="ai-chat-msg-atts">
											{msg.attachments.map((att) => (
												<span key={att.id} className="ai-chat-msg-att-pill" title={att.name}>
													{att.preview_data_url ? (
														<img
															src={att.preview_data_url}
															alt={att.name}
															className="ai-chat-msg-att-thumb"
														/>
													) : (
														formatAttachmentIcon(att)
													)}
													<span className="ai-chat-msg-att-name">{att.name}</span>
												</span>
											))}
										</div>
									)}
									{msg.text}
								</div>

								{msg.role === "assistant" && (
									<div className="ai-chat-msg-meta">
										{msg.provider_used && <span>{msg.provider_used}</span>}
										<button
											type="button"
											className="ai-chat-copy-btn"
											onClick={() => handleCopy(msg.id, msg.text)}
											title={ac.copyReply}
										>
											{copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
											<span>{copiedId === msg.id ? ac.copied : ac.copyReply}</span>
										</button>
									</div>
								)}
							</div>
						))
					)}

					{snapshot.busy && (
						<div className="ai-chat-msg assistant">
							<div className="ai-chat-bubble">
								<span className="ai-chat-typing">
									<Loader2 size={12} className="ai-chat-spin" />
									<span>{ac.thinking}</span>
								</span>
							</div>
						</div>
					)}

					<div ref={messagesEndRef} />
				</div>

				{/* Saved Conversations Drawer */}
				{historyOpen && (
					<div className="ai-chat-history-drawer">
						<div className="ai-chat-history-head">
							<span>{ac.historyTitle}</span>
							<button
								type="button"
								className="ai-chat-icon-btn"
								onClick={() => setHistoryOpen(false)}
								aria-label={ac.history}
							>
								<X size={13} />
							</button>
						</div>
						<div className="ai-chat-history-list">
							{snapshot.conversations.length === 0 ? (
								<div className="ai-chat-empty-desc" style={{ padding: "16px 6px", textAlign: "center" }}>
									{ac.historyEmpty}
								</div>
							) : (
								snapshot.conversations.map((conv) => {
									const isActive = conv.id === activeConversation?.id;
									return (
										<div
											key={conv.id}
											role="button"
											tabIndex={0}
											className={`ai-chat-history-item ${isActive ? "active" : ""}`}
											onClick={() => handleSelectConversation(conv.id)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													handleSelectConversation(conv.id);
												}
											}}
										>
											<div className="ai-chat-history-info">
												<span className="ai-chat-history-title" dir="auto">
													{conv.title || ac.title}
												</span>
												<span className="ai-chat-history-sub">
													{ac.msgsCount(conv.messages.length)}
												</span>
											</div>
											<button
												type="button"
												className="ai-chat-icon-btn"
												onClick={(e) => handleDeleteConversation(e, conv.id)}
												title={ac.deleteChat}
												aria-label={ac.deleteChat}
											>
												<Trash2 size={12} />
											</button>
										</div>
									);
								})
							)}
						</div>
					</div>
				)}
			</div>

			{/* Staged Attachments */}
			{(staged.length > 0 || preparingCount > 0) && (
				<div className="ai-chat-staged-row">
					{staged.map((att) => (
						<div
							key={att.id}
							className={`ai-chat-staged-chip ${att.error ? "has-error" : ""}`}
							title={att.error || att.name}
						>
							{att.preview_data_url ? (
								<img
									src={att.preview_data_url}
									alt={att.name}
									className="ai-chat-staged-thumb"
								/>
							) : (
								formatAttachmentIcon(att)
							)}
							<span className="ai-chat-staged-name" dir="ltr">
								{att.error ? `${att.name} (${ac.attachmentFailed})` : att.name}
							</span>
							<button
								type="button"
								className="ai-chat-staged-remove"
								onClick={() => setStaged((prev) => prev.filter((item) => item.id !== att.id))}
								title={ac.removeAttachment}
								aria-label={ac.removeAttachment}
							>
								<X size={10} />
							</button>
						</div>
					))}
					{preparingCount > 0 && (
						<div className="ai-chat-staged-chip">
							<Loader2 size={12} className="ai-chat-spin" />
							<span className="ai-chat-staged-name">...</span>
						</div>
					)}
				</div>
			)}

			{sendError && (
				<div className="ai-chat-send-error" dir="auto">
					<span>{sendError}</span>
					<button
						type="button"
						className="ai-chat-staged-remove"
						onClick={() => setSendError(null)}
						aria-label={ac.errorPrefix}
					>
						<X size={10} />
					</button>
				</div>
			)}

			{/* Bottom Composer */}
			<div className="ai-chat-composer">
				<button
					type="button"
					className="ai-chat-icon-btn"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => void handlePickFiles()}
					title={ac.attachFiles}
					aria-label={ac.attachFiles}
				>
					<Paperclip size={14} />
				</button>

				<textarea
					ref={inputRef}
					className="ai-chat-input"
					rows={1}
					dir={input ? "auto" : dir}
					placeholder={ac.inputPlaceholder}
					value={input}
					onChange={(e) => {
						setInput(e.target.value);
						if (sendError) setSendError(null);
					}}
					onFocus={handleInputFocus}
					onBlur={handleInputBlur}
					onKeyDown={handleKeyDown}
				/>

				{snapshot.busy ? (
					<button
						type="button"
						className="ai-chat-send-btn stop"
						onClick={handleCancel}
						title={ac.stop}
						aria-label={ac.stop}
					>
						<Square size={11} fill="currentColor" />
					</button>
				) : (
					<button
						type="button"
						className="ai-chat-send-btn"
						disabled={!canSend}
						onClick={() => void handleSend()}
						title={ac.send}
						aria-label={ac.send}
					>
						<SendHorizontal size={13} className="ai-chat-send-icon" />
					</button>
				)}
			</div>

			{/* Drag Overlay */}
			{isDragHovering && (
				<div className="ai-chat-drop-overlay">
					<UploadCloud size={22} color="var(--zenith-text, #ffffff)" />
					<div className="ai-chat-drop-title">{ac.dropHintTitle}</div>
					<div className="ai-chat-drop-sub">{ac.dropHintSub}</div>
				</div>
			)}
		</div>
	);
}
