/**
 * Flow-local copy of the spawn recipe for a private, headless Pi side-session.
 * This duplication is accepted because context-profiler retains the internal
 * pi-tools copy while stack-view belongs to Flow; neither package should depend
 * on the other's feature implementation.
 *
 * The recipe uses an in-memory {@link SettingsManager}/{@link SessionManager}, a
 * {@link DefaultResourceLoader} with ambient resources disabled, and a tool
 * allowlist supplied by the caller.
 *
 * Failures are errors-as-values with a flat, discriminated shape:
 * `{ ok: false; code: "spawn-failed" | "prompt-failed"; message }`.
 */
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	type AgentSession,
	type AgentSessionEventListener,
	type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { errorMessage } from "@nseng-ai/pi/shared/errors";
import { mapAgentSessionEvent, type SideSessionEvent } from "./events.ts";

export type SideSessionAskResult =
	| { ok: true }
	| { ok: false; code: "prompt-failed"; message: string };

export type CreateSideSessionResult =
	| { ok: true; value: SideSession }
	| { ok: false; code: "spawn-failed"; message: string };

export interface SideSession {
	subscribe(listener: (event: SideSessionEvent) => void): () => void;
	ask(text: string): Promise<SideSessionAskResult>;
	abortTurn(): Promise<void>;
	dispose(): void;
}

export interface SideSessionFactory {
	create(options: {
		cwd: string;
		systemPrompt: string;
		model: Model<Api>;
		modelRegistry: ModelRegistry;
		tools: readonly string[];
	}): Promise<CreateSideSessionResult>;
}

export function createPiSideSessionFactory(): SideSessionFactory {
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
					tools: [...options.tools],
					resourceLoader,
					sessionManager: SessionManager.inMemory(options.cwd),
					settingsManager,
					thinkingLevel: "off",
				});
				return { ok: true, value: new PiSideSession(session) };
			} catch (error) {
				return { ok: false, code: "spawn-failed", message: errorMessage(error) };
			}
		},
	};
}

class PiSideSession implements SideSession {
	private readonly session: AgentSession;

	constructor(session: AgentSession) {
		this.session = session;
	}

	subscribe(listener: (event: SideSessionEvent) => void): () => void {
		const wrapped: AgentSessionEventListener = (event) => {
			const mapped = mapAgentSessionEvent(event);
			if (mapped !== null) listener(mapped);
		};
		return this.session.subscribe(wrapped);
	}

	async ask(text: string): Promise<SideSessionAskResult> {
		try {
			await this.session.prompt(text, { expandPromptTemplates: false });
			return { ok: true };
		} catch (error) {
			return { ok: false, code: "prompt-failed", message: errorMessage(error) };
		}
	}

	async abortTurn(): Promise<void> {
		await this.session.abort();
	}

	dispose(): void {
		this.session.dispose();
	}
}
