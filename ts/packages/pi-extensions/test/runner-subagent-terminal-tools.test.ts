import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
	createDefaultRunnerSubagentRuntimeFiles,
	createRuntimeConfig,
	parseRuntimeConfigJsonResult,
	parseRuntimeResultJsonResult,
	readRuntimeResultFile,
	writeRuntimeResultFileSync,
	type RuntimeResultV1,
} from "../src/runner-subagent/subagent-runtime.ts";
import { createRunnerSubagentRuntimeExtension } from "../src/runner-subagent/subagent-runtime-extension.ts";
import type { RunnerSubagentTerminalToolDefinition } from "../src/runner-subagent.ts";

const completionTool: RunnerSubagentTerminalToolDefinition<{ summary: string }> = {
	name: "complete_runner_subagent",
	status: "completed",
	description: "Finish the runner subagent with a summary.",
	parameters: {
		type: "object",
		properties: { summary: { type: "string" } },
		required: ["summary"],
		additionalProperties: false,
	},
};

const blockedTool: RunnerSubagentTerminalToolDefinition<{ reason: string }> = {
	name: "block_runner_subagent",
	status: "blocked",
	description: "Block the runner subagent with a reason.",
	parameters: {
		type: "object",
		properties: { reason: { type: "string" } },
		required: ["reason"],
		additionalProperties: false,
	},
};

interface RegisteredTool {
	name: string;
	executionMode: "sequential";
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: { abort?: () => void },
	): Promise<{ terminate?: boolean }>;
}

type Handler = (event: Record<string, unknown>, ctx: { abort?: () => void }) => unknown | Promise<unknown>;

class FakePi {
	readonly tools: RegisteredTool[] = [];
	private readonly initialTools: Array<{ name: string }>;
	private readonly handlers = new Map<string, Handler[]>();

	constructor(initialTools: Array<{ name: string }> = []) {
		this.initialTools = initialTools;
	}

	on(event: string, handler: Handler): void {
		const handlers = this.handlers.get(event) ?? [];
		handlers.push(handler);
		this.handlers.set(event, handlers);
	}

	registerTool(tool: RegisteredTool): void {
		this.tools.push(tool);
	}

	getAllTools(): Array<{ name: string }> {
		return [...this.initialTools, ...this.tools.map((tool) => ({ name: tool.name }))];
	}

	async emit(event: string, payload: Record<string, unknown> = {}, ctx: { abort?: () => void } = {}): Promise<unknown[]> {
		const results: unknown[] = [];
		for (const handler of this.handlers.get(event) ?? []) {
			results.push(await handler(payload, ctx));
		}
		return results;
	}
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "pi-runner-subagent-runtime-test-"));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("runner subagent runtime config and result helpers", () => {
	test("validates terminal tool definitions before spawn", () => {
		expect(() => createRuntimeConfig({ terminalTools: [] })).toThrow("At least one runner subagent terminal tool");
		expect(() =>
			createRuntimeConfig({
				terminalTools: [completionTool, { ...blockedTool, name: completionTool.name }],
			}),
		).toThrow("Duplicate terminal tool name");
		expect(() =>
			createRuntimeConfig({
				terminalTools: [{ ...completionTool, name: "" }],
			}),
		).toThrow("non-empty name");
		expect(() =>
			createRuntimeConfig({
				terminalTools: [{ ...completionTool, status: "done" } as unknown as RunnerSubagentTerminalToolDefinition],
			}),
		).toThrow("invalid status");
	});

	test("rejects schemas that are not JSON-serializable", () => {
		const circular: Record<string, unknown> = { type: "object" };
		circular.self = circular;

		expect(() =>
			createRuntimeConfig({
				terminalTools: [{ ...completionTool, parameters: circular }],
			}),
		).toThrow("JSON-serializable");
	});

	test("rejects schemas that serialize to non-object JSON", () => {
		const primitiveSchema = { toJSON: () => "not a schema object" };

		expect(() =>
			createRuntimeConfig({
				terminalTools: [{ ...completionTool, parameters: primitiveSchema }],
			}),
		).toThrow("must serialize to a JSON object");
	});

	test("reads missing, malformed, and valid result sinks deterministically", async () => {
		await withTempDir(async (dir) => {
			const resultPath = join(dir, "result.json");
			expect(await readRuntimeResultFile(resultPath)).toEqual({ type: "missing" });

			await writeFile(resultPath, "{bad json", "utf8");
			expect(await readRuntimeResultFile(resultPath)).toEqual({
				type: "invalid",
				failure: expect.objectContaining({ message: expect.stringContaining("Invalid runner subagent runtime result JSON") }),
			});

			const capture: RuntimeResultV1 = {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_runner_subagent",
				toolCallId: "tool-1",
				status: "completed",
				input: { summary: "done" },
			};
			await writeFile(resultPath, `${JSON.stringify(capture)}\n`, "utf8");
			expect(await readRuntimeResultFile(resultPath)).toEqual({ type: "loaded", result: capture });
		});
	});

	test("creates a private runtime config and generated extension shim", async () => {
		const files = await createDefaultRunnerSubagentRuntimeFiles({ title: "Runner Subagent", terminalTools: [completionTool] });
		try {
			expect(parseRuntimeConfigJsonResult(await readFile(files.configPath, "utf8"))).toEqual({
				type: "valid",
				config: expect.objectContaining({
					title: "Runner Subagent",
					terminalTools: [expect.objectContaining({ name: "complete_runner_subagent" })],
				}),
			});
			const shim = await readFile(files.extensionPath, "utf8");
			expect(shim).toContain("createRunnerSubagentRuntimeExtension");
			expect(shim).toContain(JSON.stringify(files.configPath));
			expect(shim).toContain(JSON.stringify(files.resultPath));
			expect(await readRuntimeResultFile(files.resultPath)).toEqual({ type: "missing" });
		} finally {
			await files.cleanup?.();
		}
	});

	test("writes runtime results with first-writer-wins semantics", async () => {
		await withTempDir(async (dir) => {
			const resultPath = join(dir, "result.json");
			const first: RuntimeResultV1 = {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_runner_subagent",
				status: "completed",
				input: { summary: "first" },
			};
			const second: RuntimeResultV1 = {
				version: 1,
				kind: "runtime-error",
				code: "write-error",
				message: "second",
			};

			expect(writeRuntimeResultFileSync(resultPath, first)).toBe(true);
			expect(writeRuntimeResultFileSync(resultPath, second)).toBe(false);
			expect(parseRuntimeResultJsonResult(await readFile(resultPath, "utf8"))).toEqual({ type: "valid", result: first });
		});
	});
});

describe("runner subagent runtime extension", () => {
	test("registers terminal capture tools and writes captures during execution", async () => {
		await withTempDir(async (dir) => {
			const configPath = join(dir, "config.json");
			const resultPath = join(dir, "result.json");
			await writeFile(configPath, JSON.stringify(createRuntimeConfig({ terminalTools: [completionTool] })), "utf8");
			const fakePi = new FakePi();
			createRunnerSubagentRuntimeExtension({ configPath, resultPath })(fakePi as never);

			await fakePi.emit("session_start");
			expect(fakePi.tools.map((tool) => [tool.name, tool.executionMode])).toEqual([
				["complete_runner_subagent", "sequential"],
			]);

			let abortCount = 0;
			const result = await fakePi.tools[0]!.execute("tool-1", { summary: "done" }, undefined, undefined, {
				abort: () => {
					abortCount += 1;
				},
			});

			expect(result.terminate).toBe(true);
			expect(abortCount).toBe(1);
			expect(await readRuntimeResultFile(resultPath)).toEqual({
				type: "loaded",
				result: {
					version: 1,
					kind: "terminal-capture",
					toolName: "complete_runner_subagent",
					toolCallId: "tool-1",
					status: "completed",
					input: { summary: "done" },
				},
			});
		});
	});

	test("writes a collision startup failure instead of registering colliding tools", async () => {
		await withTempDir(async (dir) => {
			const configPath = join(dir, "config.json");
			const resultPath = join(dir, "result.json");
			await writeFile(configPath, JSON.stringify(createRuntimeConfig({ terminalTools: [completionTool] })), "utf8");
			const fakePi = new FakePi([{ name: "complete_runner_subagent" }]);
			createRunnerSubagentRuntimeExtension({ configPath, resultPath })(fakePi as never);

			await fakePi.emit("session_start");

			expect(fakePi.tools).toEqual([]);
			expect(await readRuntimeResultFile(resultPath)).toEqual({
				type: "loaded",
				result: {
					version: 1,
					kind: "runtime-error",
					code: "tool-collision",
					message: "Subagent terminal tool name collision: complete_runner_subagent.",
				},
			});
		});
	});

	test("writes a config startup failure for malformed config data", async () => {
		await withTempDir(async (dir) => {
			const configPath = join(dir, "config.json");
			const resultPath = join(dir, "result.json");
			await writeFile(configPath, "{bad json", "utf8");
			const fakePi = new FakePi();

			createRunnerSubagentRuntimeExtension({ configPath, resultPath })(fakePi as never);

			expect(await readRuntimeResultFile(resultPath)).toEqual({
				type: "loaded",
				result: {
					version: 1,
					kind: "runtime-error",
					code: "config-error",
					message: expect.stringContaining("Invalid subagent terminal runtime config"),
				},
			});
			expect(fakePi.tools).toEqual([]);
		});
	});

	test("blocks non-terminal tool calls after a terminal capture", async () => {
		await withTempDir(async (dir) => {
			const configPath = join(dir, "config.json");
			const resultPath = join(dir, "result.json");
			await writeFile(configPath, JSON.stringify(createRuntimeConfig({ terminalTools: [completionTool] })), "utf8");
			const fakePi = new FakePi();
			createRunnerSubagentRuntimeExtension({ configPath, resultPath })(fakePi as never);
			await fakePi.emit("session_start");
			await fakePi.tools[0]!.execute("tool-1", { summary: "done" }, undefined, undefined, {});

			const results = await fakePi.emit("tool_call", { toolName: "bash" });

			expect(results).toEqual([
				{
					block: true,
					reason: "A runner subagent terminal capture has already been recorded; no further non-terminal tools may run.",
				},
			]);
		});
	});
});
