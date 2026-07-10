import { describe, expect, test, vi } from "vitest";

import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
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
	private readonly beforeEvent: () => void;
	private readonly shouldWaitForAbort: boolean;
	private resolvePrompt: (() => void) | undefined;
	promptCount = 0;
	abortCount = 0;
	disposeCount = 0;
	unsubscribeCount = 0;

	constructor(options: { beforeEvent?: () => void; shouldWaitForAbort?: boolean } = {}) {
		this.beforeEvent = options.beforeEvent ?? (() => {});
		this.shouldWaitForAbort = options.shouldWaitForAbort ?? false;
	}

	subscribe(listener: (event: InProcessSubagentSessionEvent) => void): () => void {
		this.listener = listener;
		return () => {
			this.unsubscribeCount += 1;
			this.listener = undefined;
		};
	}

	async prompt(_text: string): Promise<void> {
		this.promptCount += 1;
		if (this.shouldWaitForAbort) {
			await new Promise<void>((resolve) => {
				this.resolvePrompt = resolve;
			});
			return;
		}
		this.emit({ type: "tool_start", toolName: "read" });
		this.emit({ type: "tool_end", toolName: "read", preview: "README.md" });
		this.emit({ type: "assistant", text: "Reading." });
		this.emit({ type: "done", finalText: "## Findings", stopReason: "stop" });
	}

	private emit(event: InProcessSubagentSessionEvent): void {
		this.beforeEvent();
		this.listener?.(event);
	}

	abort(): void {
		this.abortCount += 1;
		this.resolvePrompt?.();
	}

	dispose(): void {
		this.disposeCount += 1;
	}
}

class FakeInProcessFactory implements InProcessSubagentSessionFactory {
	createInputs: InProcessSubagentSessionCreateInput[] = [];
	readonly session: FakeInProcessSession;

	constructor(options: { beforeEvent?: () => void; shouldWaitForAbort?: boolean } = {}) {
		this.session = new FakeInProcessSession(options);
	}

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

	test("resolves inherited launch metadata once per dispatch", async () => {
		const factory = new FakeInProcessFactory();
		const modelRegistry = ModelRegistry.inMemory(AuthStorage.inMemory());
		const runtime = createInProcessSubagentRuntime({ sessionFactory: factory, modelRegistry });
		let thinkingLevelReads = 0;

		const result = await runtime.dispatch({
			pi: {
				getThinkingLevel: () => {
					thinkingLevelReads += 1;
					return "high";
				},
			},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				tools: READ_ONLY_SUBAGENT_TOOLS,
			},
		});

		expect(thinkingLevelReads).toBe(1);
		expect(factory.createInputs[0]?.thinkingLevel).toBe("high");
		expect(result.progress.launch?.thinkingLevel).toBe("high");
	});

	test("reports deterministic elapsed time through the injected Clock", async () => {
		const manualClock = createManualClock(1_000);
		const factory = new FakeInProcessFactory({
			beforeEvent: () => manualClock.advanceMs(25),
		});
		const elapsedUpdates: number[] = [];
		const runtime = createInProcessSubagentRuntime({
			sessionFactory: factory,
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
			clock: manualClock.clock,
		});

		const result = await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				tools: READ_ONLY_SUBAGENT_TOOLS,
				onProgress: (update) => elapsedUpdates.push(update.progress.elapsedMs),
			},
		});

		expect(elapsedUpdates).toEqual([25, 50, 75, 100]);
		expect(result.elapsedMs).toBe(100);
		expect(result.progress.elapsedMs).toBe(100);
	});

	test("cancels before session creation when only the context signal is aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("context cancelled"));
		const factory = new FakeInProcessFactory();
		const runtime = createInProcessSubagentRuntime({
			sessionFactory: factory,
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
		});

		const result = await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo", signal: controller.signal },
			options: { prompt: "Inspect files.", returnMode: "final-text" },
		});

		expect(result).toMatchObject({
			status: "cancelled",
			diagnostic: "context cancelled",
			reason: "context cancelled",
		});
		expect(factory.createInputs).toHaveLength(0);
		expect(result).not.toHaveProperty("sessionFile");
	});

	test("aborts a pending prompt from the context signal and cleans up once", async () => {
		const controller = new AbortController();
		const factory = new FakeInProcessFactory({ shouldWaitForAbort: true });
		const runtime = createInProcessSubagentRuntime({
			sessionFactory: factory,
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
		});

		const dispatch = runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo", signal: controller.signal },
			options: { prompt: "Inspect files.", returnMode: "final-text" },
		});
		await vi.waitFor(() => expect(factory.session.promptCount).toBe(1));
		controller.abort("context stopped");
		const result = await dispatch;

		expect(factory.session.abortCount).toBe(1);
		expect(factory.session.unsubscribeCount).toBe(1);
		expect(factory.session.disposeCount).toBe(1);
		expect(result).toMatchObject({
			status: "cancelled",
			diagnostic: "context stopped",
			reason: "context stopped",
			sessionFile: "/tmp/in-process.jsonl",
		});
	});

	test("combines distinct context and options signals for an active prompt", async () => {
		const contextController = new AbortController();
		const optionsController = new AbortController();
		const factory = new FakeInProcessFactory({ shouldWaitForAbort: true });
		const runtime = createInProcessSubagentRuntime({
			sessionFactory: factory,
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
		});

		const dispatch = runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo", signal: contextController.signal },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				signal: optionsController.signal,
			},
		});
		await vi.waitFor(() => expect(factory.session.promptCount).toBe(1));
		optionsController.abort("options stopped");
		const result = await dispatch;

		expect(factory.session.abortCount).toBe(1);
		expect(factory.session.unsubscribeCount).toBe(1);
		expect(factory.session.disposeCount).toBe(1);
		expect(result).toMatchObject({ status: "cancelled", reason: "options stopped" });
	});

	test("continues to honor an options-only cancellation signal", async () => {
		const controller = new AbortController();
		controller.abort("options cancelled");
		const factory = new FakeInProcessFactory();
		const runtime = createInProcessSubagentRuntime({
			sessionFactory: factory,
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
		});

		const result = await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				signal: controller.signal,
			},
		});

		expect(result).toMatchObject({ status: "cancelled", reason: "options cancelled" });
		expect(factory.createInputs).toHaveLength(0);
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
