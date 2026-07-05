/**
 * The I/O half of the stack-view compose subsystem: a side-channel drafting
 * agent running in a private, tool-less Pi {@link AgentSession}. This module owns
 * only the external Pi wiring — spawning the session, mapping its raw events onto
 * the pure {@link ComposeSessionEvent} stream, and forwarding prompts — so the
 * pure transcript/draft/prompt modules and the controller state machine stay
 * dependency-light and testable against the {@link ComposeSessionFactory} seam.
 *
 * The compose agent is context-only: it reads the stack model and enrichment
 * baked into its system prompt and replies in prose plus a draft block. It runs
 * with `tools: []` (an empty allowlist → no tools enabled), so tool events are
 * unreachable and mapped to nothing.
 */
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
import { errorMessage } from "@nseng-ai/pi/shared/errors";
import type { ComposeSessionEvent } from "./compose-transcript.ts";

export type ComposeAskResult = { ok: true } | { ok: false; message: string };

export interface ComposeSession {
	subscribe(listener: (event: ComposeSessionEvent) => void): () => void;
	ask(text: string): Promise<ComposeAskResult>;
	abortTurn(): Promise<void>;
	dispose(): void;
}

export type CreateComposeSessionResult =
	| { ok: true; value: ComposeSession }
	| { ok: false; message: string };

export interface ComposeSessionFactory {
	create(options: {
		cwd: string;
		systemPrompt: string;
		model: Model<Api>;
		modelRegistry: ModelRegistry;
	}): Promise<CreateComposeSessionResult>;
}

/**
 * Map a raw {@link AgentSessionEvent} onto the compose event stream. Text deltas,
 * assistant message end, auto-retry, and turn end carry through; every other
 * event (including tool execution, unreachable without tools) maps to null.
 */
export function mapComposeSessionEvent(event: AgentSessionEvent): ComposeSessionEvent | null {
	switch (event.type) {
		case "message_update":
			if (event.assistantMessageEvent.type === "text_delta")
				return { type: "assistant-delta", text: event.assistantMessageEvent.delta };
			return null;
		case "message_end":
			return event.message.role === "assistant" ? { type: "assistant-end" } : null;
		case "auto_retry_start":
			return {
				type: "retry",
				attempt: event.attempt,
				maxAttempts: event.maxAttempts,
				message: event.errorMessage,
			};
		case "turn_end":
			return { type: "turn-end" };
		default:
			return null;
	}
}

export function createPiComposeSessionFactory(): ComposeSessionFactory {
	return {
		async create(options) {
			try {
				const settingsManager = SettingsManager.inMemory();
				const resourceLoader = new DefaultResourceLoader({
					cwd: options.cwd,
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
					cwd: options.cwd,
					model: options.model,
					modelRegistry: options.modelRegistry,
					// Empty allowlist → no tools enabled (context-only drafting agent).
					tools: [],
					resourceLoader,
					sessionManager: SessionManager.inMemory(options.cwd),
					settingsManager,
					thinkingLevel: "off",
				});
				return { ok: true, value: new PiComposeSession(session) };
			} catch (error) {
				return { ok: false, message: errorMessage(error) };
			}
		},
	};
}

class PiComposeSession implements ComposeSession {
	private readonly session: AgentSession;

	constructor(session: AgentSession) {
		this.session = session;
	}

	subscribe(listener: (event: ComposeSessionEvent) => void): () => void {
		const wrapped: AgentSessionEventListener = (event) => {
			const mapped = mapComposeSessionEvent(event);
			if (mapped !== null) listener(mapped);
		};
		return this.session.subscribe(wrapped);
	}

	async ask(text: string): Promise<ComposeAskResult> {
		try {
			await this.session.prompt(text, { expandPromptTemplates: false });
			return { ok: true };
		} catch (error) {
			return { ok: false, message: errorMessage(error) };
		}
	}

	async abortTurn(): Promise<void> {
		await this.session.abort();
	}

	dispose(): void {
		this.session.dispose();
	}
}
