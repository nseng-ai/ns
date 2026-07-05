import { describe, expect, test } from "vitest";

import { createManualTimerScheduler } from "@ns/core/time/testing";
import type { ToolContext, ToolDefinition, ToolResult } from "@ns/pi/runtime/tool-types";

import {
	EXPLORE_INTERIM_PER_TASK_FINAL_TEXT_CAP_CHARS,
	EXPLORE_TOOL_NAME,
} from "../../src/explore/contract.ts";
import exploreExtension, {
	type ExploreDispatchFunction,
	type ExploreExtensionAPI,
	type ExploreExtensionOptions,
	type ExploreToolDetails,
} from "../../src/explore/extension.ts";
import type { ExplorerDispatchOutcome } from "../../src/explore/dispatch.ts";
import {
	makeErrorResult,
	makeExplorerAgentDefinition,
	makeFinalTextResult,
} from "../../src/explore/testing.ts";
import type { RunnerSubagentUpdate } from "../../src/runner-subagents/extension-api.ts";

const ROOT = "/repo";
const definition = makeExplorerAgentDefinition({
	label: "Markdown Explorer",
	description: "Markdown explore definition.",
	promptSnippet: "Markdown explore snippet.",
	promptGuidelines: [
		"Use explore for broad reconnaissance.",
		"Prefer direct read when the exact file is known.",
	],
});

class FakePi implements ExploreExtensionAPI {
	readonly tools = new Map<string, ToolDefinition>();

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}
}

interface ToolContextOptions {
	cwd?: string;
	model?: ToolContext["model"];
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((error: unknown) => void) | undefined;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	if (resolve === undefined || reject === undefined) throw new Error("Deferred not initialized.");
	return { promise, resolve, reject };
}

function toolContext(options: ToolContextOptions = {}): ToolContext {
	return {
		cwd: options.cwd ?? ROOT,
		hasUI: false,
		mode: "json",
		...(options.model === undefined ? {} : { model: options.model }),
		ui: { notify: () => {} },
	};
}

function registerExploreTool(
	options: {
		pi?: FakePi;
		cwd?: string | null;
		dispatchExplorer?: ExploreDispatchFunction;
		loadAgentDefinition?: () => typeof definition;
		timers?: ExploreExtensionOptions["timers"];
	} = {},
): ToolDefinition {
	const pi = options.pi ?? new FakePi();
	exploreExtension(pi, {
		...(options.cwd === null ? {} : { cwd: options.cwd ?? ROOT }),
		loadAgentDefinition: options.loadAgentDefinition ?? (() => definition),
		...(options.dispatchExplorer === undefined
			? {}
			: { dispatchExplorer: options.dispatchExplorer }),
		...(options.timers === undefined ? {} : { timers: options.timers }),
	});
	const tool = pi.tools.get(EXPLORE_TOOL_NAME);
	expect(tool).toBeDefined();
	return tool!;
}

function finalOutcome(text: string, sessionFile: string): ExplorerDispatchOutcome {
	return {
		definition,
		launchPlan: { kind: "inherit" },
		result: { ...makeFinalTextResult(text), sessionFile },
	};
}

function errorOutcome(diagnostic: string, sessionFile: string): ExplorerDispatchOutcome {
	return {
		definition,
		launchPlan: { kind: "inherit" },
		result: { ...makeErrorResult(diagnostic), sessionFile },
	};
}

function exploreParams(taskCount = 2): Record<string, unknown> {
	return {
		tasks: Array.from({ length: taskCount }, (_value, index) => ({
			title: `Scout ${index + 1}`,
			prompt: `Find area ${index + 1}.`,
		})),
	};
}

async function settleMicrotasks(count = 5): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

describe("explore extension", () => {
	test("registers the explore tool with Markdown metadata and a strict task schema", () => {
		const pi = new FakePi();
		const tool = registerExploreTool({ pi });

		expect(pi.tools.has(EXPLORE_TOOL_NAME)).toBe(true);
		expect(tool.label).toBe("Markdown Explorer");
		expect(tool.description).toBe("Markdown explore definition.");
		expect(tool.promptSnippet).toBe("Markdown explore snippet.");
		expect(tool.promptGuidelines).toEqual([
			"Use explore for broad reconnaissance.",
			"For explore, prefer direct read when the exact file is known.",
		]);
		expect(tool.parameters.type).toBe("object");
		expect(tool.parameters.required).toEqual(["tasks"]);
		expect(tool.parameters.additionalProperties).toBe(false);
		expect((tool.parameters.properties as Record<string, unknown>).tasks).toEqual(
			expect.objectContaining({ minItems: 2, maxItems: 8 }),
		);
	});

	test("validates task count and breadth caps before dispatching", async () => {
		const dispatchCalls: string[] = [];
		const tool = registerExploreTool({
			dispatchExplorer: async (_pi, _ctx, intent) => {
				dispatchCalls.push(intent.title);
				return finalOutcome("done", "/tmp/child.jsonl");
			},
		});

		await expect(
			tool.execute(
				"tool-1",
				{ tasks: [{ title: "One", prompt: "Only one." }] },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow("tasks: Too small");
		await expect(
			tool.execute(
				"tool-2",
				{ breadth: "quick", ...exploreParams(3) },
				undefined,
				undefined,
				toolContext(),
			),
		).rejects.toThrow('Too many explore tasks for breadth "quick"');
		const result = await tool.execute(
			"tool-3",
			exploreParams(3),
			undefined,
			undefined,
			toolContext(),
		);
		const details = result.details as ExploreToolDetails;

		expect(details.breadth).toBe("medium");
		expect(details.maxConcurrency).toBe(3);
		expect(dispatchCalls).toEqual(["Scout 1", "Scout 2", "Scout 3"]);
	});

	test("dispatches ordered tasks with bounded concurrency", async () => {
		const deferreds = Array.from({ length: 4 }, () => createDeferred<ExplorerDispatchOutcome>());
		let inFlight = 0;
		let maxInFlight = 0;
		const started: string[] = [];
		const dispatchExplorer: ExploreDispatchFunction = async (_pi, _ctx, intent) => {
			const index = Number(intent.title.replace("Scout ", "")) - 1;
			started.push(intent.title);
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				return await deferreds[index]!.promise;
			} finally {
				inFlight -= 1;
			}
		};
		const tool = registerExploreTool({ dispatchExplorer });
		const running = tool.execute(
			"tool-1",
			{ breadth: "medium", ...exploreParams(4) },
			undefined,
			undefined,
			toolContext(),
		);
		await settleMicrotasks();

		expect(started).toEqual(["Scout 1", "Scout 2", "Scout 3"]);
		expect(maxInFlight).toBe(3);
		deferreds[1]!.resolve(finalOutcome("second", "/tmp/two.jsonl"));
		await settleMicrotasks();
		expect(started).toEqual(["Scout 1", "Scout 2", "Scout 3", "Scout 4"]);
		deferreds[3]!.resolve(finalOutcome("fourth", "/tmp/four.jsonl"));
		deferreds[2]!.resolve(finalOutcome("third", "/tmp/three.jsonl"));
		deferreds[0]!.resolve(finalOutcome("first", "/tmp/one.jsonl"));
		const result = await running;
		const details = result.details as ExploreToolDetails;
		const text = result.content[0]?.text ?? "";

		expect(details.status).toBe("completed");
		expect(details.tasks.map((task) => task.title)).toEqual([
			"Scout 1",
			"Scout 2",
			"Scout 3",
			"Scout 4",
		]);
		expect(text.indexOf("### 1. Scout 1")).toBeLessThan(text.indexOf("### 2. Scout 2"));
		expect(text.indexOf("### 2. Scout 2")).toBeLessThan(text.indexOf("### 3. Scout 3"));
		expect(maxInFlight).toBe(3);
	});

	test("passes child intent, cwd, combined signal, and progress callback", async () => {
		const progressUpdate: RunnerSubagentUpdate = {
			progress: {
				state: "running",
				currentTool: "read",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 10,
			},
			activity: { assistantPreview: "Reading file map." },
		};
		const seenSignals: AbortSignal[] = [];
		const updates: Partial<ToolResult>[] = [];
		const dispatchExplorer: ExploreDispatchFunction = async (_pi, ctx, intent) => {
			expect(ctx.cwd).toBe("/custom");
			expect(intent.cwd).toBe("/custom");
			expect(intent.prompt).toContain("Find area");
			expect(intent.signal).toBeDefined();
			seenSignals.push(intent.signal!);
			intent.onProgress?.(progressUpdate);
			return finalOutcome(`done ${intent.title}`, `/tmp/${intent.title}.jsonl`);
		};
		const tool = registerExploreTool({ cwd: null, dispatchExplorer });
		const parentAbort = new AbortController();
		const result = await tool.execute(
			"tool-1",
			exploreParams(2),
			parentAbort.signal,
			(update) => updates.push(update),
			toolContext({ cwd: "/custom" }),
		);

		expect(seenSignals).toHaveLength(2);
		expect(seenSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
		expect(updates.map((update) => update.content?.[0]?.text).join("\n")).toContain(
			"Scout 1 running: Reading file map.",
		);
		expect((result.details as ExploreToolDetails).status).toBe("completed");
	});

	test("formats successful, partial, failed, and truncated results", async () => {
		const longText = `${"x".repeat(EXPLORE_INTERIM_PER_TASK_FINAL_TEXT_CAP_CHARS + 10)}END`;
		const partialTool = registerExploreTool({
			dispatchExplorer: async (_pi, _ctx, intent) => {
				if (intent.title === "Scout 1") return finalOutcome(longText, "/tmp/one.jsonl");
				return errorOutcome("child failed", "/tmp/two.jsonl");
			},
		});
		const partial = await partialTool.execute(
			"tool-1",
			exploreParams(2),
			undefined,
			undefined,
			toolContext(),
		);
		const partialDetails = partial.details as ExploreToolDetails;
		const partialText = partial.content[0]?.text ?? "";

		expect(partial.isError).toBeUndefined();
		expect(partialDetails.status).toBe("partial");
		expect(partialDetails.tasks[0]?.finalTextChars).toBe(longText.length);
		expect(partialDetails.tasks[0]?.finalTextTruncated).toBe(true);
		expect(partialText).toContain("1/2 scouts produced final text");
		expect(partialText).toContain("Diagnostic: child failed");
		expect(partialText).not.toContain("END");

		const failedTool = registerExploreTool({
			dispatchExplorer: async (_pi, _ctx, intent) =>
				errorOutcome(`${intent.title} failed`, "/tmp/fail.jsonl"),
		});
		const failed = await failedTool.execute(
			"tool-2",
			exploreParams(2),
			undefined,
			undefined,
			toolContext(),
		);
		expect(failed.isError).toBe(true);
		expect((failed.details as ExploreToolDetails).status).toBe("failed");
		expect(failed.content[0]?.text).toContain("No explorer scout produced usable final text");
	});

	test("returns a friendly configuration error when explorer.md is missing or wrong", async () => {
		const missingTool = registerExploreTool({
			loadAgentDefinition: () => {
				throw new Error("Could not find .ns/pi/agents while walking up from /missing.");
			},
		});
		const missing = await missingTool.execute(
			"tool-1",
			exploreParams(2),
			undefined,
			undefined,
			toolContext(),
		);
		expect(missing.isError).toBe(true);
		expect(missing.content[0]?.text).toContain(".ns/pi/agents/explorer.md");
		expect((missing.details as ExploreToolDetails).status).toBe("configuration-error");

		const wrongTool = registerExploreTool({
			loadAgentDefinition: () => makeExplorerAgentDefinition({ toolName: "other" }),
		});
		const wrong = await wrongTool.execute(
			"tool-2",
			exploreParams(2),
			undefined,
			undefined,
			toolContext(),
		);
		expect(wrong.isError).toBe(true);
		expect(wrong.content[0]?.text).toContain('declares toolName "other"');
	});

	test("timeout aborts in-flight children and cancels the scheduled timer", async () => {
		const manualTimers = createManualTimerScheduler();
		const childSignals: AbortSignal[] = [];
		const dispatchExplorer: ExploreDispatchFunction = async (_pi, _ctx, intent) => {
			if (intent.signal === undefined) throw new Error("expected child signal");
			childSignals.push(intent.signal);
			if (intent.signal.aborted)
				return {
					definition,
					launchPlan: { kind: "inherit" },
					result: makeErrorResult("already aborted"),
				};
			return await new Promise<ExplorerDispatchOutcome>((resolve) => {
				intent.signal?.addEventListener(
					"abort",
					() => {
						resolve({
							definition,
							launchPlan: { kind: "inherit" },
							result: {
								status: "cancelled",
								diagnostic: String(intent.signal?.reason),
								reason: String(intent.signal?.reason),
								elapsedMs: 0,
								progress: { state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
							},
						});
					},
					{ once: true },
				);
			});
		};
		const tool = registerExploreTool({ dispatchExplorer, timers: manualTimers.timers });
		const running = tool.execute(
			"tool-1",
			{ breadth: "quick", ...exploreParams(2) },
			undefined,
			undefined,
			toolContext(),
		);
		await settleMicrotasks();
		expect(childSignals).toHaveLength(2);
		expect(manualTimers.pendingTimerCount()).toBe(1);

		manualTimers.advanceMs(90_000);
		const result = await running;
		const details = result.details as ExploreToolDetails;

		expect(childSignals.every((signal) => signal.aborted)).toBe(true);
		expect(details.status).toBe("cancelled");
		expect(result.isError).toBe(true);
		expect(details.tasks[0]?.diagnostic).toContain("explore wall-clock limit exceeded");
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});
});
