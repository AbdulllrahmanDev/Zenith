export type AiChatProviderChoice =
	| "inherit"
	| "gemini"
	| "groq"
	| "openai"
	| "custom"
	| "local";

export interface ChatAttachment {
	id: string;
	name: string;
	kind: "image" | "text";
	mime: string;
	preview_data_url?: string | null;
	image_base64?: string | null;
	extracted_text?: string | null;
	char_count: number;
	truncated: boolean;
	error?: string | null;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "error";
	text: string;
	attachments: ChatAttachment[];
	created_at: number;
	provider_used?: string | null;
}

export interface ChatConversation {
	id: string;
	title: string;
	created_at: number;
	updated_at: number;
	messages: ChatMessage[];
}

export interface AiChatSnapshot {
	conversations: ChatConversation[];
	active_conversation_id: string | null;
	busy: boolean;
	last_error: string | null;
}

export interface AiChatNotchConfig {
	enabled: boolean;
	defaultProvider: AiChatProviderChoice;
	sharedEngine: "cloud" | "local";
	sharedProvider: "gemini" | "groq" | "openai" | "custom";
}
