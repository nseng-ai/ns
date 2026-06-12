import type { Api, Model } from "@earendil-works/pi-ai";
import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	type AgentSession,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { errorMessage } from "./errors.ts";
import { INTERROGATION_TOOLS } from "./interrogation-prompt.ts";

export type InterrogationEvent =
	| { type: "assistant-delta"; text: string }
	| { type: "assistant-end" }
	| { type: "tool-start"; name: string; summary: string }
	| { type: "tool-end"; name: string; summary: string; isError: boolean }
	| { type: "retry"; attempt: number; maxAttempts: number; message: string }
	| { type: "turn-end" };

export type AskResult = { ok: true } | { ok: false; error: { code: "prompt-failed"; message: string } };
export type CreateInterrogationSessionResult = { ok: true; value: InterrogationSession } | { ok: false; error: { code: "spawn-failed"; message: string } };

export interface InterrogationSession {
	subscribe(listener: (event: InterrogationEvent) => void): () => void;
	ask(text: string): Promise<AskResult>;
	abortTurn(): Promise<void>;
	isStreaming(): boolean;
	dispose(): void;
}

export interface InterrogationSessionFactory {
	create(options: {
		bundleDir: string;
		systemPrompt: string;
		model: Model<Api>;
		modelRegistry: ModelRegistry;
	}): Promise<CreateInterrogationSessionResult>;
}

export function mapAgentSessionEvent(event: AgentSessionEvent): InterrogationEvent | null {
	switch (event.type) {
		case "message_update":
			if (event.assistantMessageEvent.type === "text_delta") return { type: "assistant-delta", text: event.assistantMessageEvent.delta };
			return null;
		case "message_end":
			return event.message.role === "assistant" ? { type: "assistant-end" } : null;
		case "tool_execution_start":
			return { type: "tool-start", name: event.toolName, summary: summarizeToolArgs(event.args) };
		case "tool_execution_end":
			return { type: "tool-end", name: event.toolName, summary: summarizeToolArgs(event.result), isError: event.isError };
		case "auto_retry_start":
			return { type: "retry", attempt: event.attempt, maxAttempts: event.maxAttempts, message: event.errorMessage };
		case "turn_end":
			return { type: "turn-end" };
		default:
			return null;
	}
}

export function summarizeToolArgs(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 119)}…` : value;
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return "";
		return json.length > 120 ? `${json.slice(0, 119)}…` : json;
	} catch {
		return String(value);
	}
}

export function createPiInterrogationSessionFactory(): InterrogationSessionFactory {
	return {
		async create(options) {
			try {
				const settingsManager = SettingsManager.inMemory();
				const resourceLoader = new DefaultResourceLoader({
					cwd: options.bundleDir,
					agentDir: getAgentDir(),
					settingsManager,
					noExtensions: true,
					noSkills: true,
					noPromptTemplates: true,
					noContextFiles: true,
					systemPrompt: options.systemPrompt,
					appendSystemPrompt: [],
				});
				await resourceLoader.reload();
				const { session } = await createAgentSession({
					cwd: options.bundleDir,
					model: options.model,
					modelRegistry: options.modelRegistry,
					tools: [...INTERROGATION_TOOLS],
					resourceLoader,
					sessionManager: SessionManager.inMemory(options.bundleDir),
					settingsManager,
					thinkingLevel: "off",
				});
				return { ok: true, value: new PiInterrogationSession(session) };
			} catch (error) {
				return { ok: false, error: { code: "spawn-failed", message: errorMessage(error) } };
			}
		},
	};
}

class PiInterrogationSession implements InterrogationSession {
	private readonly session: AgentSession;

	constructor(session: AgentSession) {
		this.session = session;
	}

	subscribe(listener: (event: InterrogationEvent) => void): () => void {
		const wrapped: AgentSessionEventListener = (event) => {
			const mapped = mapAgentSessionEvent(event);
			if (mapped !== null) listener(mapped);
		};
		return this.session.subscribe(wrapped);
	}

	async ask(text: string): Promise<AskResult> {
		try {
			await this.session.prompt(text, { expandPromptTemplates: false });
			return { ok: true };
		} catch (error) {
			return { ok: false, error: { code: "prompt-failed", message: errorMessage(error) } };
		}
	}

	async abortTurn(): Promise<void> {
		await this.session.abort();
	}

	isStreaming(): boolean {
		return this.session.isStreaming;
	}

	dispose(): void {
		this.session.dispose();
	}
}
