import { describe, expect, test } from "bun:test";

import { resolvePiInvocation, dispatchRunnerSubagentProcess } from "../src/runner-subagent/subagent-process.ts";
import type {
	RunnerSubagentContext,
	RunnerSubagentOptions,
	RunnerSubagentPi,
	RunnerSubagentTerminalToolDefinition,
	RunnerSubagentUpdate,
} from "../src/runner-subagent.ts";
import { createFakeRunnerSubagentDispatcher, waitForSpawn } from "./runner-subagent-fakes.ts";

const ctx: RunnerSubagentContext = { cwd: "/repo" };
const pi: RunnerSubagentPi = {};

const completionTool: RunnerSubagentTerminalToolDefinition = {
	name: "complete_runner_subagent",
	status: "completed",
	description: "Finish the subagent task.",
	parameters: { type: "object", properties: {}, additionalProperties: false },
};

const blockedTool: RunnerSubagentTerminalToolDefinition = {
	name: "block_runner_subagent",
	status: "blocked",
	description: "Block the subagent task.",
	parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
};

function options(overrides: Partial<RunnerSubagentOptions> = {}): RunnerSubagentOptions {
	return {
		prompt: "Do the delegated task.",
		terminalTools: [completionTool],
		...overrides,
	};
}

function finalTextOptions(
	overrides: {
		title?: string;
		cwd?: string;
		model?: string;
		signal?: AbortSignal;
		terminalTools?: readonly RunnerSubagentTerminalToolDefinition[];
	} = {},
): RunnerSubagentOptions {
	return {
		prompt: "Do the delegated task.",
		returnMode: "final-text",
		...overrides,
	};
}

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

function finalTextMessage(text: string, stopReason = "stop"): string {
	return jsonLine({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			stopReason,
		},
	});
}

function sessionMessageLine(message: unknown): string {
	return jsonLine({ type: "message", message });
}

function sessionUsageJsonl(): string {
	return [
		sessionMessageLine({ role: "user", usage: { input: 1000 } }),
		sessionMessageLine({
			role: "assistant",
			usage: {
				input: 10_000,
				output: 40,
				cacheRead: 9_000,
				cacheWrite: 0,
				totalTokens: 19_040,
				cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0, total: 0.033 },
			},
		}),
		sessionMessageLine({ role: "assistant", content: [{ type: "text", text: "No usage." }] }),
		sessionMessageLine({
			role: "assistant",
			usage: {
				input: 1_600,
				output: 4,
				cacheRead: 2_300,
				cacheWrite: 0,
				totalTokens: 3_904,
				cost: { input: 0.02, output: 0.01, cacheRead: 0.0018, cacheWrite: 0, total: 0.0318 },
			},
		}),
	].join("");
}

describe("runner subagent process dispatcher", () => {
	test("resolves a safely discoverable current Pi command before falling back to installed pi", () => {
		const args = ["--mode", "json"];

		expect(
			resolvePiInvocation(args, {
				processArgv: ["/usr/bin/node", "/opt/bin/pi"],
				processExecPath: "/usr/bin/node",
				existsSync: (path) => path === "/opt/bin/pi",
			}),
		).toEqual({ command: "/usr/bin/node", args: ["/opt/bin/pi", ...args] });
		expect(
			resolvePiInvocation(args, {
				processArgv: ["/usr/bin/node", "/repo/scripts/test-runner.js"],
				processExecPath: "/usr/bin/node",
				existsSync: () => true,
			}),
		).toEqual({ command: "pi", args });
	});

	test("spawns Pi in JSON print mode with cwd, prompt, and explicit session path", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl" });
		const running = dispatchRunnerSubagentProcess(pi, ctx, options({ cwd: "/repo/packages/example" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		expect(call.command).toBe("pi");
		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--extension",
			"/tmp/pi-runner-subagent-runtime/runtime-extension.ts",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);
		expect(call.options).toEqual({ cwd: "/repo/packages/example", shell: false, stdio: ["ignore", "pipe", "pipe"] });

		call.process.emitStdout(jsonLine({ type: "session", version: 3, id: "child", cwd: "/repo/packages/example" }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("stopped-without-terminal");
		expect(result.sessionFile).toBe("/tmp/runner-subagent.jsonl");
	});

	test("passes optional model before runtime extension in terminal mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl" });
		const running = dispatchRunnerSubagentProcess(pi, ctx, options({ model: "haiku" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"haiku",
			"--no-extensions",
			"--extension",
			"/tmp/pi-runner-subagent-runtime/runtime-extension.ts",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);

		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("stopped-without-terminal");
	});

	test("passes inherited model and non-off thinking to child Pi and progress metadata", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl" });
		const running = dispatchRunnerSubagentProcess(
			{ getThinkingLevel: () => "medium" },
			{ cwd: "/repo", model: { provider: "anthropic", id: "claude-sonnet-4-5" } },
			finalTextOptions({ title: "Launch task" }),
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5",
			"--thinking",
			"medium",
			"--no-extensions",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.progress.launch).toEqual({
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "medium",
			modelArgPassed: true,
			thinkingArgPassed: true,
		});
	});

	test("omits the thinking flag for off while preserving off launch metadata", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl" });
		const running = dispatchRunnerSubagentProcess(
			pi,
			ctx,
			{ prompt: "Do the delegated task.", returnMode: "final-text", launch: { thinkingLevel: "off" } },
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.progress.launch).toEqual({
			thinkingLevel: "off",
			modelArgPassed: false,
			thinkingArgPassed: false,
		});
	});

	test("returns stopped-without-terminal for clean subagent completion", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl", now: () => now });
		const running = dispatchRunnerSubagentProcess(pi, ctx, options({ title: "Subagent task" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "session", version: 3, id: "child", cwd: "/repo" }));
		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: {} }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "read", result: {}, isError: false }));
		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [], stopReason: "end" } }));
		now = 1_345;
		call.process.emitStdout(jsonLine({ type: "agent_end", messages: [{ role: "assistant", content: [], stopReason: "end" }] }));
		call.process.close(0);

		const result = await running;

		expect(result).toEqual({
			status: "stopped-without-terminal",
			title: "Subagent task",
			elapsedMs: 345,
			progress: {
				title: "Subagent task",
				state: "stopped",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 345,
				sessionFile: "/tmp/runner-subagent.jsonl",
			},
			sessionFile: "/tmp/runner-subagent.jsonl",
			usage: {
				status: "unavailable",
				source: "child-session-file",
				sessionFile: "/tmp/runner-subagent.jsonl",
				reason: "no-assistant-usage",
				diagnostic: "Subagent child session did not contain assistant messages with usable usage metadata.",
			},
			diagnostic: "Subagent Pi stopped without terminal capture.",
			stopReason: "end",
		});
	});

	test("passes optional model to child Pi args in final-text mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl" });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions({ model: "haiku" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"haiku",
			"--no-extensions",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);

		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done." }] } }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
	});

	test("returns final assistant text for clean subagent completion in final-text mode", async () => {
		let now = 1_000;
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl", now: () => now });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions({ title: "Subagent task" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--session",
			"/tmp/runner-subagent.jsonl",
			"Do the delegated task.",
		]);

		call.process.emitStdout(jsonLine({ type: "session", version: 3, id: "child", cwd: "/repo" }));
		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Done.\nEvidence: tests passed." }],
					stopReason: "stop",
				},
			}),
		);
		now = 1_345;
		call.process.close(0);
		const result = await running;

		expect(result).toEqual({
			status: "final-text",
			title: "Subagent task",
			elapsedMs: 345,
			progress: {
				title: "Subagent task",
				state: "stopped",
				toolCount: 0,
				turnCount: 1,
				elapsedMs: 345,
				sessionFile: "/tmp/runner-subagent.jsonl",
			},
			sessionFile: "/tmp/runner-subagent.jsonl",
			usage: {
				status: "unavailable",
				source: "child-session-file",
				sessionFile: "/tmp/runner-subagent.jsonl",
				reason: "no-assistant-usage",
				diagnostic: "Subagent child session did not contain assistant messages with usable usage metadata.",
			},
			finalText: "Done.\nEvidence: tests passed.",
			stopReason: "stop",
		});
	});

	test("aggregates usage from multiple assistant messages after child close", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: "/tmp/runner-subagent.jsonl",
			sessionFileText: sessionUsageJsonl(),
		});
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions({ title: "Usage task" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
		expect(result.usage).toEqual({
			status: "available",
			source: "child-session-file",
			sessionFile: "/tmp/runner-subagent.jsonl",
			assistantMessageCount: 2,
			totals: {
				input: 11_600,
				output: 44,
				cacheRead: 11_300,
				cacheWrite: 0,
				totalTokens: 22_944,
				cost: {
					input: 0.03,
					output: 0.03,
					cacheRead: 0.0048000000000000004,
					cacheWrite: 0,
					total: 0.0648,
				},
			},
		});
	});

	test("session read failure is nonfatal for final text results", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFileReadError: new Error("EACCES: permission denied") });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
		expect(result.usage).toEqual(
			expect.objectContaining({
				status: "unavailable",
				reason: "session-read-error",
				diagnostic: expect.stringContaining("EACCES: permission denied"),
			}),
		);
	});

	test("malformed session JSONL is nonfatal and unavailable", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFileText: "{bad json}\n" });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
		expect(result.usage).toEqual(
			expect.objectContaining({
				status: "unavailable",
				reason: "malformed-session-jsonl",
			}),
		);
	});

	test("no assistant usage is nonfatal and unavailable", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFileText: sessionMessageLine({ role: "user", content: [] }) });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(finalTextMessage("Done."));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
		expect(result.usage).toEqual(
			expect.objectContaining({
				status: "unavailable",
				reason: "no-assistant-usage",
			}),
		);
	});

	test("diagnostic statuses can still carry usage when available", async () => {
		const runner = createFakeRunnerSubagentDispatcher({ sessionFileText: sessionUsageJsonl() });
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStderr("failed\n");
		call.process.close(2);
		const result = await running;

		expect(result.status).toBe("error");
		expect(result.usage).toEqual(expect.objectContaining({ status: "available", assistantMessageCount: 2 }));
	});

	test("emits progress and UI-only activity while parsing child JSONL", async () => {
		let now = 1_000;
		const updates: RunnerSubagentUpdate[] = [];
		const runner = createFakeRunnerSubagentDispatcher({ sessionFile: "/tmp/runner-subagent.jsonl", now: () => now });
		const running = dispatchRunnerSubagentProcess(
			pi,
			ctx,
			{
				prompt: "Do the delegated task.",
				returnMode: "final-text",
				title: "Progress task",
				onProgress: (update) => updates.push(update),
			},
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		expect(updates[0]).toEqual({
			progress: {
				title: "Progress task",
				state: "starting",
				toolCount: 0,
				turnCount: 0,
				elapsedMs: 0,
				sessionFile: "/tmp/runner-subagent.jsonl",
			},
			activity: {},
		});

		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: { role: "assistant", content: [{ type: "text", text: "Working\nthrough it." }] },
			}),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" } }),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "read",
				result: { content: [{ type: "text", text: "file contents" }] },
				isError: false,
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "Done." }], stopReason: "stop" },
			}),
		);
		now = 1_250;
		call.process.close(0);
		const result = await running;

		expect(updates.some((update) => update.progress.state === "running" && update.progress.turnCount === 1)).toBe(true);
		expect(updates.some((update) => update.activity.assistantPreview === "Working through it.")).toBe(true);
		expect(updates.some((update) => update.progress.currentTool === "read")).toBe(true);
		expect(updates.some((update) => update.activity.currentToolInputPreview === '{"path":"README.md"}')).toBe(true);
		expect(
			updates.some(
				(update) =>
					update.progress.toolCount === 1 &&
					update.progress.currentTool === undefined &&
					update.activity.lastToolResultPreview === "file contents",
			),
		).toBe(true);
		expect(updates.at(-1)).toEqual({
			progress: {
				title: "Progress task",
				state: "stopped",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 250,
				sessionFile: "/tmp/runner-subagent.jsonl",
			},
			activity: {
				assistantPreview: "Done.",
				lastToolName: "read",
				lastToolResultPreview: "file contents",
				lastToolResultIsError: false,
			},
		});
		expect(result.status).toBe("final-text");
		expect("activity" in result).toBe(false);
		expect("activity" in result.progress).toBe(false);
	});

	test("progress callback failures do not fail the child result", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(
			pi,
			ctx,
			{
				prompt: "Do the delegated task.",
				returnMode: "final-text",
				onProgress: () => {
					throw new Error("display failed");
				},
			},
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "Still done." }], stopReason: "stop" },
			}),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("final-text");
		if (result.status !== "final-text") return;
		expect(result.finalText).toBe("Still done.");
	});

	test("returns stopped-without-useful-text in final-text mode when clean subagent has no useful assistant text", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(
			jsonLine({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "   " }], stopReason: "stop" } }),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("stopped-without-useful-text");
		if (result.status !== "stopped-without-useful-text") return;
		expect(result.diagnostic).toBe("Subagent Pi stopped without useful final assistant text.");
		expect(result.stopReason).toBe("stop");
	});

	test("maps subagent stopReason error to error in final-text mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "I tried but failed." }],
					stopReason: "error",
					errorMessage: "model failed",
				},
			}),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toBe("model failed");
	});

	test("maps malformed JSONL output to error and kills subagent in final-text mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout("{bad json}\n");
		call.process.close(0);
		const result = await running;

		expect(call.process.killSignals).toContain("SIGTERM");
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Malformed runner subagent Pi JSONL output");
	});

	test("maps nonzero exit and bounded stderr to error in final-text mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions(), { ...runner.dependencies, stderrLimitBytes: 30 });
		const call = await waitForSpawn(runner.calls);

		call.process.emitStderr("first diagnostic line\nsecond diagnostic line\n");
		call.process.close(2);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Subagent Pi exited with exit code 2.");
		expect(result.diagnostic).toContain("second diagnostic line");
		expect(result.diagnostic).not.toContain("first diagnostic line");
	});

	test("kills the subagent and returns cancelled on parent abort in final-text mode", async () => {
		const controller = new AbortController();
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, finalTextOptions({ signal: controller.signal }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		controller.abort("user cancelled");
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
		call.process.close(null, "SIGTERM");
		const result = await running;

		expect(result.status).toBe("cancelled");
		if (result.status !== "cancelled") return;
		expect(result.reason).toBe("user cancelled");
		expect(result.sessionFile).toBe("/tmp/pi-runner-subagent.jsonl");
	});

	test("emits terminating progress before cancelled result on parent abort", async () => {
		const controller = new AbortController();
		const updates: RunnerSubagentUpdate[] = [];
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(
			pi,
			ctx,
			{
				prompt: "Do the delegated task.",
				returnMode: "final-text",
				signal: controller.signal,
				onProgress: (update) => updates.push(update),
			},
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: {} }));
		controller.abort("user cancelled");
		call.process.close(null, "SIGTERM");
		const result = await running;

		expect(updates.some((update) => update.progress.state === "terminating" && update.progress.currentTool === "read")).toBe(true);
		expect(updates.at(-1)?.progress.state).toBe("stopped");
		expect(result.status).toBe("cancelled");
	});

	test("preserves valid terminal captures when terminal tools are supplied in final-text mode", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_runner_subagent",
				status: "completed",
				input: { summary: "done" },
			},
		});
		const running = dispatchRunnerSubagentProcess<{ summary: string }>(
			pi,
			ctx,
			finalTextOptions({ terminalTools: [completionTool] }),
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		expect(call.args).toContain("--extension");
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("completed");
		if (result.status !== "completed") return;
		expect(result.terminal.input).toEqual({ summary: "done" });
	});

	test("maps subagent stopReason error to error when no terminal capture exists", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "model failed" } }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toBe("model failed");
	});

	test("maps a completed terminal capture sink to a completed result", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_runner_subagent",
				toolCallId: "tool-1",
				status: "completed",
				input: { summary: "done" },
			},
		});
		const running = dispatchRunnerSubagentProcess<{ summary: string }>(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_runner_subagent", args: {} }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "complete_runner_subagent", result: {}, isError: false }),
		);
		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [], stopReason: "aborted" } }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("completed");
		if (result.status !== "completed") return;
		expect(result.terminal).toEqual({
			toolName: "complete_runner_subagent",
			toolCallId: "tool-1",
			status: "completed",
			input: { summary: "done" },
		});
		expect(result.sessionFile).toBe("/tmp/pi-runner-subagent.jsonl");
	});

	test("maps a blocked terminal capture sink to a blocked result", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "block_runner_subagent",
				status: "blocked",
				input: { reason: "need input" },
			},
		});
		const running = dispatchRunnerSubagentProcess<{ reason: string }>(
			pi,
			ctx,
			options({ terminalTools: [completionTool, blockedTool] }),
			runner.dependencies,
		);
		const call = await waitForSpawn(runner.calls);

		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("blocked");
		if (result.status !== "blocked") return;
		expect(result.terminal).toEqual({
			toolName: "block_runner_subagent",
			status: "blocked",
			input: { reason: "need input" },
		});
	});

	test("maps subagent runtime startup failures to deterministic errors", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResult: {
				version: 1,
				kind: "runtime-error",
				code: "tool-collision",
				message: "Subagent terminal tool name collision: complete_runner_subagent.",
			},
		});
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("tool-collision");
		expect(result.diagnostic).toContain("complete_runner_subagent");
	});

	test("maps invalid runtime result data after terminal attempt to protocol-error", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResultRead: {
				type: "invalid",
				failure: { message: "Invalid runner subagent runtime result JSON: Unexpected token b" },
			},
		});
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_runner_subagent", args: {} }),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("protocol-error");
		if (result.status !== "protocol-error") return;
		expect(result.diagnostic).toContain("runtime result sink was invalid");
		expect(result.diagnostic).toContain("Invalid runner subagent runtime result JSON");
	});

	test("maps invalid runtime result data without terminal attempt to error", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResultRead: {
				type: "read-error",
				failure: { message: "EACCES: permission denied, open result.json" },
			},
		});
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Failed to read subagent terminal runtime result");
		expect(result.diagnostic).toContain("permission denied");
	});

	test("returns protocol-error when terminal validation fails before the runtime writes a capture", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_runner_subagent", args: {} }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "complete_runner_subagent", result: {}, isError: true }),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("protocol-error");
		if (result.status !== "protocol-error") return;
		expect(result.protocolError.message).toContain("Terminal tool complete_runner_subagent failed");
	});

	test("returns protocol-error when terminal tools are mixed with sibling tool calls", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_runner_subagent",
				status: "completed",
				input: { summary: "done" },
			},
		});
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_runner_subagent", args: {} }),
		);
		call.process.emitStdout(jsonLine({ type: "tool_execution_start", toolCallId: "tool-2", toolName: "bash", args: {} }));
		call.process.close(0);
		const result = await running;

		expect(call.process.killSignals).toContain("SIGTERM");
		expect(result.status).toBe("protocol-error");
		if (result.status !== "protocol-error") return;
		expect(result.protocolError.message).toContain("mixed with sibling tool calls");
	});

	test("returns an error before spawn for invalid terminal runtime config", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const result = await dispatchRunnerSubagentProcess(
			pi,
			ctx,
			options({ terminalTools: [{ ...completionTool, name: "" }] }),
			runner.dependencies,
		);

		expect(runner.calls).toEqual([]);
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("non-empty name");
	});

	test("maps spawn failure to error", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.fail(new Error("ENOENT pi"));
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Failed to spawn subagent Pi process: ENOENT pi");
		expect(result.error.message).toBe("ENOENT pi");
	});

	test("maps nonzero exit and bounded stderr to error", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), { ...runner.dependencies, stderrLimitBytes: 30 });
		const call = await waitForSpawn(runner.calls);

		call.process.emitStderr("first diagnostic line\nsecond diagnostic line\n");
		call.process.close(2);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Subagent Pi exited with exit code 2.");
		expect(result.diagnostic).toContain("stderr:");
		expect(result.diagnostic).toContain("second diagnostic line");
		expect(result.diagnostic).not.toContain("first diagnostic line");
	});

	test("maps malformed JSONL output to error", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout("{bad json}\n");
		call.process.close(0);
		const result = await running;

		expect(call.process.killSignals).toContain("SIGTERM");
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Malformed runner subagent Pi JSONL output");
	});

	test("kills the subagent and returns cancelled on parent abort", async () => {
		const controller = new AbortController();
		const runner = createFakeRunnerSubagentDispatcher();
		const running = dispatchRunnerSubagentProcess(pi, ctx, options({ signal: controller.signal }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		controller.abort("user cancelled");
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
		call.process.close(null, "SIGTERM");
		const result = await running;

		expect(result.status).toBe("cancelled");
		if (result.status !== "cancelled") return;
		expect(result.reason).toBe("user cancelled");
		expect(result.sessionFile).toBe("/tmp/pi-runner-subagent.jsonl");
	});
});
