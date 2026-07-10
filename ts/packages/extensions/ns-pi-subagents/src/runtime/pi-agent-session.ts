import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type {
	InProcessSubagentSession,
	InProcessSubagentSessionCreateInput,
	InProcessSubagentSessionEvent,
	InProcessSubagentSessionFactory,
} from "./in-process.ts";

export const PI_IN_PROCESS_RESOURCE_POLICY = {
	extensions: false,
	skills: true,
	contextFiles: true,
	delegatedPromptTemplates: false,
} as const;

export interface PiAgentSessionPort {
	readonly sessionFile: string | undefined;
	subscribe(listener: (event: AgentSessionEvent) => void): () => void;
	prompt(text: string, options: { expandPromptTemplates: boolean }): Promise<void>;
	abort(): Promise<void>;
	dispose(): void;
}

export interface PiAgentSessionGatewayCreateInput extends InProcessSubagentSessionCreateInput {
	readonly resourcePolicy: typeof PI_IN_PROCESS_RESOURCE_POLICY;
}

export interface PiAgentSessionGateway {
	create(input: PiAgentSessionGatewayCreateInput): Promise<PiAgentSessionPort>;
}

export function createPiAgentSessionFactory(
	gateway: PiAgentSessionGateway = createProductionGateway(),
): InProcessSubagentSessionFactory {
	return {
		async create(input) {
			const session = await gateway.create({
				...input,
				resourcePolicy: PI_IN_PROCESS_RESOURCE_POLICY,
			});
			return new PiInProcessSession(session);
		},
	};
}

function createProductionGateway(): PiAgentSessionGateway {
	return {
		async create(input) {
			const settingsManager = SettingsManager.inMemory();
			const resourceLoader = new DefaultResourceLoader({
				cwd: input.cwd,
				agentDir: getAgentDir(),
				settingsManager,
				noExtensions: !input.resourcePolicy.extensions,
				noSkills: !input.resourcePolicy.skills,
				noContextFiles: !input.resourcePolicy.contextFiles,
			});
			await resourceLoader.reload();
			const { session } = await createAgentSession({
				cwd: input.cwd,
				tools: [...input.tools],
				thinkingLevel: input.thinkingLevel,
				resourceLoader,
				sessionManager: SessionManager.create(input.cwd),
				settingsManager,
				...(input.model === undefined ? {} : { model: input.model }),
				...(input.modelRegistry === undefined ? {} : { modelRegistry: input.modelRegistry }),
			});
			return session;
		},
	};
}

class PiInProcessSession implements InProcessSubagentSession {
	readonly sessionFile: string | undefined;
	private readonly session: PiAgentSessionPort;
	private listeners = new Set<(event: InProcessSubagentSessionEvent) => void>();
	private unsubscribe: (() => void) | undefined;
	private currentText = "";
	private finalText = "";
	private isDisposed = false;

	constructor(session: PiAgentSessionPort) {
		this.session = session;
		this.sessionFile = session.sessionFile;
		this.unsubscribe = session.subscribe((event) => this.handleEvent(event));
	}

	subscribe(listener: (event: InProcessSubagentSessionEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async prompt(text: string): Promise<void> {
		try {
			await this.session.prompt(text, {
				expandPromptTemplates: PI_IN_PROCESS_RESOURCE_POLICY.delegatedPromptTemplates,
			});
			this.emit({
				type: "done",
				...(this.finalText.length === 0 ? {} : { finalText: this.finalText }),
			});
		} catch (error) {
			throw new Error(`Pi in-process prompt failed: ${formatErrorMessage(error)}`);
		}
	}

	abort(): Promise<void> {
		return this.session.abort();
	}

	dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.listeners.clear();
		this.session.dispose();
	}

	private handleEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "message_update":
				if (event.assistantMessageEvent.type === "text_delta") {
					this.currentText += event.assistantMessageEvent.delta;
				}
				break;
			case "message_end":
				if (event.message.role === "assistant" && this.currentText.length > 0) {
					this.finalText = this.currentText;
					this.currentText = "";
					this.emit({ type: "assistant", text: this.finalText });
				}
				break;
			case "tool_execution_start":
				this.emit({ type: "tool_start", toolName: event.toolName });
				break;
			case "tool_execution_end":
				this.emit({ type: "tool_end", toolName: event.toolName });
		}
	}

	private emit(event: InProcessSubagentSessionEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}
