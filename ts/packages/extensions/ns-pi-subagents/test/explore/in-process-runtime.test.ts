import { describe, expect, test } from "vitest";

import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { READ_ONLY_SUBAGENT_TOOLS } from "@nseng-ai/ns-pi-subagents/runner-subagents";
import {
	createInProcessSubagentRuntime,
	type InProcessSubagentSession,
	type InProcessSubagentSessionCreateInput,
	type InProcessSubagentSessionEvent,
	type InProcessSubagentSessionFactory,
} from "../../src/runtime/in-process.ts";

class FakeInProcessSession implements InProcessSubagentSession {
	readonly sessionFile = "/tmp/in-process.jsonl";
	private listener: ((event: InProcessSubagentSessionEvent) => void) | undefined;
	aborted = false;

	subscribe(listener: (event: InProcessSubagentSessionEvent) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(): Promise<void> {
		this.listener?.({ type: "tool_start", toolName: "read" });
		this.listener?.({ type: "tool_end", toolName: "read", preview: "README.md" });
		this.listener?.({ type: "assistant", text: "Reading." });
		this.listener?.({ type: "done", finalText: "## Findings", stopReason: "stop" });
	}

	abort(): void {
		this.aborted = true;
	}

	dispose(): void {}
}

class FakeInProcessFactory implements InProcessSubagentSessionFactory {
	createInputs: InProcessSubagentSessionCreateInput[] = [];
	readonly session = new FakeInProcessSession();

	async create(input: InProcessSubagentSessionCreateInput): Promise<InProcessSubagentSession> {
		this.createInputs.push(input);
		return this.session;
	}
}

describe("in-process subagent runtime", () => {
	test("dispatches through explicit session factory and preserves read-only tools", async () => {
		const factory = new FakeInProcessFactory();
		const modelRegistry = ModelRegistry.inMemory(AuthStorage.inMemory());
		const runtime = createInProcessSubagentRuntime({ sessionFactory: factory, modelRegistry });
		const updates: string[] = [];

		const result = await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				tools: READ_ONLY_SUBAGENT_TOOLS,
				preResolvedLaunch: {
					model: { provider: "anthropic", id: "claude-sonnet-4-5" },
					thinkingLevel: "high",
					hasModelArg: true,
					hasThinkingArg: true,
				},
				onProgress: (update) => updates.push(update.progress.state),
			},
		});

		expect(factory.createInputs[0]).toMatchObject({
			cwd: "/repo",
			tools: READ_ONLY_SUBAGENT_TOOLS,
			thinkingLevel: "high",
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			modelRegistry,
		});
		expect(result).toMatchObject({
			status: "final-text",
			finalText: "## Findings",
			sessionFile: "/tmp/in-process.jsonl",
		});
		expect(updates).toContain("running");
	});

	test("uses thinking parsed from an explicit CLI model pattern", async () => {
		const factory = new FakeInProcessFactory();
		const modelRegistry = ModelRegistry.inMemory(AuthStorage.inMemory());
		const runtime = createInProcessSubagentRuntime({ sessionFactory: factory, modelRegistry });

		await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				tools: READ_ONLY_SUBAGENT_TOOLS,
				preResolvedLaunch: {
					requestedModel: "anthropic/claude-sonnet-4-5:high",
					thinkingLevel: "off",
					hasModelArg: true,
					hasThinkingArg: false,
				},
			},
		});

		expect(factory.createInputs[0]).toMatchObject({
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "high",
		});
	});
});
