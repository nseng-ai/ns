/**
 * The shared spawn recipe and wrapper for a private, headless Pi side-session: an
 * in-memory {@link SettingsManager}/{@link SessionManager}, a
 * {@link DefaultResourceLoader} with every ambient resource disabled, and a
 * tool allowlist supplied by the caller. Both the stack-view compose and the
 * context-profiler interrogation subsystems specialize this factory rather than
 * re-deriving the Pi wiring; they differ only in cwd source, tool allowlist, and
 * how they narrow/rename the exported types.
 *
 * Failures are errors-as-values with a flat, discriminated shape:
 * `{ ok: false; code: "spawn-failed" | "prompt-failed"; message }`.
 */
import { formatModelRef, type ModelSelection } from "@nseng-ai/foundation/model-slug";
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
import { errorMessage } from "@nseng-ai/pi-runtime/shared/errors";
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
		modelSelection: ModelSelection;
		modelRegistry: ModelRegistry;
		tools: readonly string[];
	}): Promise<CreateSideSessionResult>;
}

export function createPiSideSessionFactory(): SideSessionFactory {
	return {
		async create(options) {
			try {
				const model = options.modelRegistry.find(
					options.modelSelection.provider,
					options.modelSelection.modelId,
				);
				if (model === undefined) {
					return {
						ok: false,
						code: "spawn-failed",
						message: `Model ${formatModelRef(options.modelSelection)} is unavailable.`,
					};
				}
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
					model,
					modelRegistry: options.modelRegistry,
					tools: [...options.tools],
					resourceLoader,
					sessionManager: SessionManager.inMemory(options.cwd),
					settingsManager,
					thinkingLevel: options.modelSelection.thinking,
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
