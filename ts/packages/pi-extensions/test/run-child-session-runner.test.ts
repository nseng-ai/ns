import { describe, expect, test } from "bun:test";

import { resolvePiInvocation, runChildSessionProcess } from "../src/run-child-session/child-process.ts";
import type {
	ChildSessionContext,
	ChildSessionOptions,
	ChildSessionPi,
	ChildSessionTerminalToolDefinition,
} from "../src/run-child-session.ts";
import { createFakeChildRunner, waitForSpawn } from "./run-child-session-fakes.ts";

const ctx: ChildSessionContext = { cwd: "/repo" };
const pi: ChildSessionPi = {};

const completionTool: ChildSessionTerminalToolDefinition = {
	name: "complete_child_session",
	status: "completed",
	description: "Finish the child session.",
	parameters: { type: "object", properties: {}, additionalProperties: false },
};

const blockedTool: ChildSessionTerminalToolDefinition = {
	name: "block_child_session",
	status: "blocked",
	description: "Block the child session.",
	parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
};

function options(overrides: Partial<ChildSessionOptions> = {}): ChildSessionOptions {
	return {
		prompt: "Do the delegated task.",
		terminalTools: [completionTool],
		...overrides,
	};
}

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

describe("child session process runner", () => {
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
		const runner = createFakeChildRunner({ sessionFile: "/tmp/child-session.jsonl" });
		const running = runChildSessionProcess(pi, ctx, options({ cwd: "/repo/packages/example" }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		expect(call.command).toBe("pi");
		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--extension",
			"/tmp/pi-child-runtime/runtime-extension.ts",
			"--session",
			"/tmp/child-session.jsonl",
			"Do the delegated task.",
		]);
		expect(call.options).toEqual({ cwd: "/repo/packages/example", shell: false, stdio: ["ignore", "pipe", "pipe"] });

		call.process.emitStdout(jsonLine({ type: "session", version: 3, id: "child", cwd: "/repo/packages/example" }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("stopped-without-terminal");
		expect(result.sessionFile).toBe("/tmp/child-session.jsonl");
	});

	test("returns stopped-without-terminal for clean child completion", async () => {
		let now = 1_000;
		const runner = createFakeChildRunner({ sessionFile: "/tmp/child-session.jsonl", now: () => now });
		const running = runChildSessionProcess(pi, ctx, options({ title: "Child task" }), runner.dependencies);
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
			title: "Child task",
			elapsedMs: 345,
			progress: {
				title: "Child task",
				state: "stopped",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 345,
				sessionFile: "/tmp/child-session.jsonl",
			},
			sessionFile: "/tmp/child-session.jsonl",
			diagnostic: "Child Pi stopped without terminal capture.",
			stopReason: "end",
		});
	});

	test("maps child stopReason error to error when no terminal capture exists", async () => {
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "model failed" } }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toBe("model failed");
	});

	test("maps a completed terminal capture sink to a completed result", async () => {
		const runner = createFakeChildRunner({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_child_session",
				toolCallId: "tool-1",
				status: "completed",
				input: { summary: "done" },
			},
		});
		const running = runChildSessionProcess<{ summary: string }>(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_child_session", args: {} }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "complete_child_session", result: {}, isError: false }),
		);
		call.process.emitStdout(jsonLine({ type: "message_end", message: { role: "assistant", content: [], stopReason: "aborted" } }));
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("completed");
		if (result.status !== "completed") return;
		expect(result.terminal).toEqual({
			toolName: "complete_child_session",
			toolCallId: "tool-1",
			status: "completed",
			input: { summary: "done" },
		});
		expect(result.sessionFile).toBe("/tmp/pi-child-session.jsonl");
	});

	test("maps a blocked terminal capture sink to a blocked result", async () => {
		const runner = createFakeChildRunner({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "block_child_session",
				status: "blocked",
				input: { reason: "need input" },
			},
		});
		const running = runChildSessionProcess<{ reason: string }>(
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
			toolName: "block_child_session",
			status: "blocked",
			input: { reason: "need input" },
		});
	});

	test("maps child runtime startup failures to deterministic errors", async () => {
		const runner = createFakeChildRunner({
			runtimeResult: {
				version: 1,
				kind: "runtime-error",
				code: "tool-collision",
				message: "Child terminal tool name collision: complete_child_session.",
			},
		});
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("tool-collision");
		expect(result.diagnostic).toContain("complete_child_session");
	});

	test("returns protocol-error when terminal validation fails before the runtime writes a capture", async () => {
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_child_session", args: {} }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "complete_child_session", result: {}, isError: true }),
		);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("protocol-error");
		if (result.status !== "protocol-error") return;
		expect(result.protocolError.message).toContain("Terminal tool complete_child_session failed");
	});

	test("returns protocol-error when terminal tools are mixed with sibling tool calls", async () => {
		const runner = createFakeChildRunner({
			runtimeResult: {
				version: 1,
				kind: "terminal-capture",
				toolName: "complete_child_session",
				status: "completed",
				input: { summary: "done" },
			},
		});
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_child_session", args: {} }),
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
		const runner = createFakeChildRunner();
		const result = await runChildSessionProcess(
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
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.fail(new Error("ENOENT pi"));
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Failed to spawn child Pi process: ENOENT pi");
		expect(result.error.message).toBe("ENOENT pi");
	});

	test("maps nonzero exit and bounded stderr to error", async () => {
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options(), { ...runner.dependencies, stderrLimitBytes: 30 });
		const call = await waitForSpawn(runner.calls);

		call.process.emitStderr("first diagnostic line\nsecond diagnostic line\n");
		call.process.close(2);
		const result = await running;

		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Child Pi exited with exit code 2.");
		expect(result.diagnostic).toContain("stderr:");
		expect(result.diagnostic).toContain("second diagnostic line");
		expect(result.diagnostic).not.toContain("first diagnostic line");
	});

	test("maps malformed JSONL output to error", async () => {
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options(), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		call.process.emitStdout("{bad json}\n");
		call.process.close(0);
		const result = await running;

		expect(call.process.killSignals).toContain("SIGTERM");
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.diagnostic).toContain("Malformed child Pi JSONL output");
	});

	test("kills the child and returns cancelled on parent abort", async () => {
		const controller = new AbortController();
		const runner = createFakeChildRunner();
		const running = runChildSessionProcess(pi, ctx, options({ signal: controller.signal }), runner.dependencies);
		const call = await waitForSpawn(runner.calls);

		controller.abort("user cancelled");
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
		call.process.close(null, "SIGTERM");
		const result = await running;

		expect(result.status).toBe("cancelled");
		if (result.status !== "cancelled") return;
		expect(result.reason).toBe("user cancelled");
		expect(result.sessionFile).toBe("/tmp/pi-child-session.jsonl");
	});
});
