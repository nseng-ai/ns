import { describe, expect, test } from "vitest";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
	PI_IN_PROCESS_RESOURCE_POLICY,
	createPiAgentSessionFactory,
	type PiAgentSessionGateway,
	type PiAgentSessionGatewayCreateInput,
	type PiAgentSessionPort,
} from "../../src/runtime/pi-agent-session.ts";
import type { InProcessSubagentSessionEvent } from "../../src/runtime/in-process.ts";

class FakePiAgentSession implements PiAgentSessionPort {
	readonly sessionFile = "/tmp/pi-in-process.jsonl";
	promptCalls: Array<{ text: string; expandPromptTemplates: boolean }> = [];
	abortCount = 0;
	disposeCount = 0;
	unsubscribeCount = 0;
	private readonly finalText: string | undefined;
	private listener: ((event: AgentSessionEvent) => void) | undefined;

	constructor(finalText?: string) {
		this.finalText = finalText;
	}

	subscribe(listener: (event: AgentSessionEvent) => void): () => void {
		this.listener = listener;
		return () => {
			this.unsubscribeCount += 1;
			this.listener = undefined;
		};
	}

	async prompt(text: string, options: { expandPromptTemplates: boolean }): Promise<void> {
		this.promptCalls.push({ text, ...options });
		if (this.finalText === undefined) return;
		const message = assistantMessage(this.finalText);
		this.listener?.({
			type: "message_update",
			message,
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 0,
				delta: this.finalText,
				partial: message,
			},
		});
		this.listener?.({ type: "message_end", message });
	}

	async abort(): Promise<void> {
		this.abortCount += 1;
	}

	dispose(): void {
		this.disposeCount += 1;
	}
}

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

class FakePiAgentSessionGateway implements PiAgentSessionGateway {
	readonly session: FakePiAgentSession;
	createInputs: PiAgentSessionGatewayCreateInput[] = [];

	constructor(finalText?: string) {
		this.session = new FakePiAgentSession(finalText);
	}

	async create(input: PiAgentSessionGatewayCreateInput): Promise<PiAgentSessionPort> {
		this.createInputs.push(input);
		return this.session;
	}
}

describe("Pi in-process agent session factory", () => {
	test("pins ambient resources, prompt expansion, and lifecycle", async () => {
		const gateway = new FakePiAgentSessionGateway();
		const factory = createPiAgentSessionFactory(gateway);
		const session = await factory.create({
			cwd: "/repo",
			tools: ["read", "grep"],
			thinkingLevel: "high",
		});
		const events: InProcessSubagentSessionEvent[] = [];
		session.subscribe((event) => events.push(event));

		await session.prompt("/template must stay literal");
		await session.abort();
		session.dispose();
		session.dispose();

		expect(gateway.createInputs).toEqual([
			{
				cwd: "/repo",
				tools: ["read", "grep"],
				thinkingLevel: "high",
				resourcePolicy: {
					extensions: false,
					skills: true,
					contextFiles: true,
					delegatedPromptTemplates: false,
				},
			},
		]);
		expect(PI_IN_PROCESS_RESOURCE_POLICY).toEqual({
			extensions: false,
			skills: true,
			contextFiles: true,
			delegatedPromptTemplates: false,
		});
		expect(gateway.session.promptCalls).toEqual([
			{ text: "/template must stay literal", expandPromptTemplates: false },
		]);
		expect(events).toEqual([{ type: "done" }]);
		expect(session.sessionFile).toBe("/tmp/pi-in-process.jsonl");
		expect(gateway.session.abortCount).toBe(1);
		expect(gateway.session.unsubscribeCount).toBe(1);
		expect(gateway.session.disposeCount).toBe(1);
	});

	test("includes final assistant text when the session emits it", async () => {
		const gateway = new FakePiAgentSessionGateway("Finished.");
		const session = await createPiAgentSessionFactory(gateway).create({
			cwd: "/repo",
			tools: [],
			thinkingLevel: "off",
		});
		const events: InProcessSubagentSessionEvent[] = [];
		session.subscribe((event) => events.push(event));

		await session.prompt("Do the task.");

		expect(events).toEqual([
			{ type: "assistant", text: "Finished." },
			{ type: "done", finalText: "Finished." },
		]);
	});
});
