// ADR0024-LEGACY-DELETE(whole file): tests for the legacy blocking runner-step machinery.
import { EventEmitter } from "node:events";
import { join } from "node:path";

import { createManualClock, createManualTimerHarness } from "@nseng-ai/core/time/testing";
import { describe, expect, test } from "vitest";

import type {
	ChildSessionEvent,
	ChildSessionHandle,
} from "../../../../src/runner/child-session.ts";
import {
	createPiChildSessionGateway,
	NS_RUNNER_PI_BIN_ENV,
	type PiChildSessionGatewayDependencies,
	type PiChildSpawnOptions,
	type SpawnedPiChildProcess,
} from "../../../../src/pi/child-session/pi-child-session-gateway.ts";

const SESSION_DIR = "/tmp/ns-objective-runner-test";
const SESSION_FILE = join(SESSION_DIR, "child-session.jsonl");

interface SpawnCall {
	command: string;
	args: string[];
	options: PiChildSpawnOptions;
	process: FakePiChildProcess;
}

type CloseListener = (code: number | null, signal: NodeJS.Signals | null) => void;
type ErrorListener = (error: Error) => void;

interface FakePiChildProcessEvents {
	close: Parameters<CloseListener>;
	error: Parameters<ErrorListener>;
}

class FakePiChildProcess implements SpawnedPiChildProcess {
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
	private readonly events = new EventEmitter<FakePiChildProcessEvents>();

	kill(signal?: NodeJS.Signals | number): boolean {
		this.killSignals.push(signal);
		return true;
	}

	on(event: "close", listener: CloseListener): unknown;
	on(event: "error", listener: ErrorListener): unknown;
	on(event: "close" | "error", listener: CloseListener | ErrorListener): unknown {
		if (event === "close") {
			this.events.on("close", listener as CloseListener);
			return this;
		}
		this.events.on("error", listener as ErrorListener);
		return this;
	}

	emitStdout(chunk: string | Uint8Array): void {
		this.stdout.emit("data", chunk);
	}

	emitStderr(chunk: string | Uint8Array): void {
		this.stderr.emit("data", chunk);
	}

	close(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.events.emit("close", code, signal);
	}

	fail(error: Error): void {
		this.events.emit("error", error);
	}
}

function createFakePiGateway(overrides: Partial<PiChildSessionGatewayDependencies> = {}): {
	deps: PiChildSessionGatewayDependencies;
	calls: SpawnCall[];
} {
	const calls: SpawnCall[] = [];
	const deps: PiChildSessionGatewayDependencies = {
		env: {},
		createSessionDir: () => Promise.resolve(SESSION_DIR),
		spawn: (command, args, options) => {
			const process = new FakePiChildProcess();
			calls.push({ command, args: [...args], options, process });
			return process;
		},
		...overrides,
	};
	return { deps, calls };
}

async function waitForSpawn(calls: readonly SpawnCall[]): Promise<SpawnCall> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const call = calls[0];
		if (call) return call;
		await Promise.resolve();
	}
	throw new Error("Expected the Pi child process to be spawned.");
}

function collectEvents(handle: ChildSessionHandle): Promise<ChildSessionEvent[]> {
	return (async () => {
		const collected: ChildSessionEvent[] = [];
		for await (const event of handle.events) collected.push(event);
		return collected;
	})();
}

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

describe("createPiChildSessionGateway", () => {
	test("spawns pi --mode json -p with --session and the positional prompt in the request cwd", async () => {
		const { deps, calls } = createFakePiGateway();
		const handle = createPiChildSessionGateway(deps).dispatch({
			cwd: "/repo",
			prompt: "do one slice",
		});
		const call = await waitForSpawn(calls);

		expect(call.command).toBe("pi");
		expect(call.args).toEqual(["--mode", "json", "-p", "--session", SESSION_FILE, "do one slice"]);
		expect(call.args).not.toContain("--no-extensions");
		expect(call.options).toEqual({ cwd: "/repo", shell: false, stdio: ["ignore", "pipe", "pipe"] });

		call.process.close(0);
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "completed",
			exitCode: 0,
			finalText: "",
			stderrTail: "",
			sessionFile: SESSION_FILE,
		});
	});

	test("propagates --model and the NS_RUNNER_PI_BIN binary override", async () => {
		const { deps, calls } = createFakePiGateway({
			env: { [NS_RUNNER_PI_BIN_ENV]: "/opt/custom/pi" },
		});
		const handle = createPiChildSessionGateway(deps).dispatch({
			cwd: "/repo",
			prompt: "prompt",
			model: "some-model",
		});
		const call = await waitForSpawn(calls);

		expect(call.command).toBe("/opt/custom/pi");
		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--model",
			"some-model",
			"--session",
			SESSION_FILE,
			"prompt",
		]);
		call.process.close(0);
		await handle.outcome;
	});

	test("emits the live session pointer as the first elapsed-prefixed activity line", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.close(0);

		expect((await events)[0]).toEqual({
			type: "activity",
			line: `[+0s] child session: ${SESSION_FILE}`,
		});
	});

	test("maps salient NDJSON events to elapsed-prefixed activity lines and tracks finalText and stopReason", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStdout(jsonLine({ type: "agent_start" }));
		manualClock.setMs(45_000);
		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		manualClock.setMs(872_000);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "bash", toolCallId: "t1" }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolName: "bash", toolCallId: "t1", isError: false }),
		);
		manualClock.setMs(3_720_000);
		// A line split across two chunks must reassemble.
		const interim = jsonLine({
			type: "message_end",
			message: {
				role: "assistant",
				stopReason: "toolUse",
				content: [{ type: "text", text: "working on it" }],
			},
		});
		call.process.emitStdout(interim.slice(0, 25));
		call.process.emitStdout(interim.slice(25));
		call.process.emitStdout("not json at all\n");
		call.process.emitStdout(jsonLine({ type: "some_future_event", payload: 1 }));
		call.process.emitStdout(
			jsonLine({
				type: "agent_end",
				messages: [
					{
						role: "assistant",
						stopReason: "stop",
						content: [{ type: "text", text: "final report text" }],
					},
				],
			}),
		);
		call.process.close(0);

		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "completed",
			exitCode: 0,
			finalText: "final report text",
			stderrTail: "",
			stopReason: "stop",
			sessionFile: SESSION_FILE,
		});
		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "activity", line: "[+0s] agent started" },
			{ type: "activity", line: "[+45s] turn 1 started" },
			{ type: "activity", line: "[+14m32s] tool bash started" },
			{ type: "activity", line: "[+14m32s] tool bash completed" },
			{ type: "activity", line: "[+1h02m] assistant: working on it" },
			{ type: "activity", line: "[+1h02m] not json at all" },
			{ type: "activity", line: "[+1h02m] agent finished (stop)" },
		]);
	});

	test("emits heartbeats with aggregate counters while the child is alive and stops after close", async () => {
		const harness = createManualTimerHarness();
		const { deps, calls } = createFakePiGateway({ clock: harness.clock, timers: harness.timers });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStdout(jsonLine({ type: "turn_start" }));
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "bash", args: { command: "just" } }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolName: "bash", isError: true, result: "boom" }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "read", args: { path: "a.ts" } }),
		);

		harness.advanceMs(30_000);
		harness.advanceMs(30_000);
		call.process.close(0);
		await handle.outcome;
		harness.advanceMs(120_000);

		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "activity", line: "[+0s] turn 1 started" },
			{ type: "activity", line: "[+0s] tool bash: just" },
			{ type: "activity", line: "[+0s] tool bash failed: boom" },
			{ type: "activity", line: "[+0s] tool read: a.ts" },
			{
				type: "activity",
				line: "[+30s] still running — turn 1, 2 tool calls (1 failed), last: tool read: a.ts (30s ago)",
			},
			{
				type: "activity",
				line: "[+1m0s] still running — turn 1, 2 tool calls (1 failed), last: tool read: a.ts (1m0s ago)",
			},
		]);
	});

	test("a heartbeat before any child activity reports no turns and no activity", async () => {
		const harness = createManualTimerHarness();
		const { deps, calls } = createFakePiGateway({
			clock: harness.clock,
			timers: harness.timers,
			heartbeatIntervalMs: 10_000,
		});
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		harness.advanceMs(10_000);
		call.process.close(0);
		await handle.outcome;

		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{
				type: "activity",
				line: "[+10s] still running — no turns yet, 0 tool calls, no activity yet",
			},
		]);
	});

	test("summarizes tool-start arguments without dumping large payloads", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_start",
				toolName: "bash",
				args: { command: "just ts-check" },
			}),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "read", args: { path: "ts/file.ts" } }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "custom", args: { something: "value" } }),
		);
		call.process.emitStdout(
			jsonLine({ type: "tool_execution_start", toolName: "weird", args: 42 }),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_start",
				toolName: "bash",
				args: { command: `${"x".repeat(130)}\n${"y".repeat(20)}` },
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_start",
				toolName: "edit",
				args: { edits: [{ oldText: "x".repeat(200), newText: "y".repeat(200) }] },
			}),
		);
		call.process.close(0);

		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "activity", line: "[+0s] tool bash: just ts-check" },
			{ type: "activity", line: "[+0s] tool read: ts/file.ts" },
			{ type: "activity", line: "[+0s] tool custom: value" },
			{ type: "activity", line: "[+0s] tool weird started" },
			{ type: "activity", line: `[+0s] tool bash: ${"x".repeat(120)}…` },
			{ type: "activity", line: "[+0s] tool edit started" },
		]);
	});

	test("previews failed tool results and leaves successful tool-end lines compact", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStdout(
			jsonLine({ type: "tool_execution_end", toolName: "bash", isError: false, result: "ignored" }),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolName: "bash",
				isError: true,
				result: { content: [{ type: "text", text: "first failure line\nsecond line" }] },
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolName: "custom",
				isError: true,
				result: { stderr: "stderr failure" },
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "tool_execution_end",
				toolName: "read",
				isError: true,
				result: { code: 1 },
			}),
		);
		call.process.close(0);

		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "activity", line: "[+0s] tool bash completed" },
			{ type: "activity", line: "[+0s] tool bash failed: first failure line" },
			{ type: "activity", line: "[+0s] tool custom failed: stderr failure" },
			{ type: "activity", line: "[+0s] tool read failed" },
		]);
	});

	test("emits thinking and assistant block-end previews without duplicating message_end previews", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: { id: "m1", role: "assistant", stopReason: "toolUse", content: [] },
				assistantMessageEvent: {
					type: "thinking_end",
					contentIndex: 0,
					partial: {
						id: "m1",
						role: "assistant",
						content: [{ type: "thinking", thinking: "thinking first line\nsecond" }],
					},
				},
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "message_update",
				message: { id: "m1", role: "assistant", stopReason: "toolUse", content: [] },
				assistantMessageEvent: {
					type: "text_end",
					contentIndex: 1,
					partial: {
						id: "m1",
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "thinking first line" },
							{ type: "text", text: "assistant block line\nsecond" },
						],
					},
				},
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: {
					id: "m1",
					role: "assistant",
					stopReason: "toolUse",
					content: [{ type: "text", text: "assistant block line" }],
				},
			}),
		);
		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: {
					id: "m2",
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "fallback assistant line" }],
				},
			}),
		);
		call.process.close(0);

		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "completed",
			exitCode: 0,
			finalText: "fallback assistant line",
			stderrTail: "",
			stopReason: "stop",
			sessionFile: SESSION_FILE,
		});
		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "activity", line: "[+0s] thinking: thinking first line" },
			{ type: "activity", line: "[+0s] assistant: assistant block line" },
			{ type: "activity", line: "[+0s] assistant: fallback assistant line" },
		]);
	});

	test("streams stderr as events and keeps only a bounded tail in the outcome", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({
			clock: manualClock.clock,
			stderrTailLimitBytes: 8,
		});
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.emitStderr("0123456789");
		call.process.emitStderr("abcdef");
		call.process.close(2);

		const outcome = await handle.outcome;
		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") throw new Error("expected completed outcome");
		expect(outcome.exitCode).toBe(2);
		expect(outcome.stderrTail).toBe("… 8 stderr byte(s) omitted\n89abcdef");
		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
			{ type: "stderr", text: "0123456789" },
			{ type: "stderr", text: "abcdef" },
		]);
	});

	test("timeout sends SIGTERM, then SIGKILL after the grace period, and resolves timed-out", async () => {
		const harness = createManualTimerHarness();
		const { deps, calls } = createFakePiGateway({ clock: harness.clock, timers: harness.timers });
		const handle = createPiChildSessionGateway(deps).dispatch({
			cwd: "/repo",
			prompt: "p",
			timeoutMs: 60_000,
		});
		const call = await waitForSpawn(calls);

		expect(call.process.killSignals).toEqual([]);
		harness.advanceMs(60_000);
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
		harness.advanceMs(10_000);
		expect(call.process.killSignals).toEqual(["SIGTERM", "SIGKILL"]);

		call.process.emitStderr("child died");
		call.process.close(null, "SIGKILL");
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "timed-out",
			stderrTail: "child died",
			sessionFile: SESSION_FILE,
		});
	});

	test("a close during the SIGTERM grace period skips SIGKILL and still resolves timed-out", async () => {
		const harness = createManualTimerHarness();
		const { deps, calls } = createFakePiGateway({ clock: harness.clock, timers: harness.timers });
		const handle = createPiChildSessionGateway(deps).dispatch({
			cwd: "/repo",
			prompt: "p",
			timeoutMs: 1_000,
		});
		const call = await waitForSpawn(calls);

		harness.advanceMs(1_000);
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
		call.process.close(null, "SIGTERM");
		const outcome = await handle.outcome;
		expect(outcome.type).toBe("timed-out");

		harness.advanceMs(60_000);
		expect(call.process.killSignals).toEqual(["SIGTERM"]);
	});

	test("an exit before the timeout cancels the timeout timer", async () => {
		const harness = createManualTimerHarness();
		const { deps, calls } = createFakePiGateway({ clock: harness.clock, timers: harness.timers });
		const handle = createPiChildSessionGateway(deps).dispatch({
			cwd: "/repo",
			prompt: "p",
			timeoutMs: 60_000,
		});
		const call = await waitForSpawn(calls);

		call.process.close(0);
		const outcome = await handle.outcome;
		expect(outcome.type).toBe("completed");
		harness.advanceMs(120_000);
		expect(call.process.killSignals).toEqual([]);
	});

	test("a spawn error event (ENOENT) resolves startup-failed and ends the event stream", async () => {
		const manualClock = createManualClock(0);
		const { deps, calls } = createFakePiGateway({ clock: manualClock.clock });
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const call = await waitForSpawn(calls);

		call.process.fail(new Error("spawn pi ENOENT"));
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "startup-failed",
			message: "Failed to spawn Pi child process: spawn pi ENOENT",
		});
		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
		]);
	});

	test("a synchronous spawn throw resolves startup-failed", async () => {
		const manualClock = createManualClock(0);
		const { deps } = createFakePiGateway({
			clock: manualClock.clock,
			spawn: () => {
				throw new Error("spawn blew up");
			},
		});
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const events = collectEvents(handle);
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "startup-failed",
			message: "Failed to spawn Pi child process: spawn blew up",
		});
		expect(await events).toEqual([
			{ type: "activity", line: `[+0s] child session: ${SESSION_FILE}` },
		]);
	});

	test("a session-directory failure resolves startup-failed without spawning", async () => {
		const { deps, calls } = createFakePiGateway({
			createSessionDir: () => Promise.reject(new Error("mkdtemp denied")),
		});
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "startup-failed",
			message: "Failed to create child session directory: mkdtemp denied",
		});
		expect(calls).toEqual([]);
	});

	test("a signal-killed close without an exit code resolves a typed signaled outcome", async () => {
		const { deps, calls } = createFakePiGateway();
		const handle = createPiChildSessionGateway(deps).dispatch({ cwd: "/repo", prompt: "p" });
		const call = await waitForSpawn(calls);

		call.process.emitStderr("terminated");
		call.process.close(null, "SIGTERM");
		const outcome = await handle.outcome;
		expect(outcome).toEqual({
			type: "signaled",
			signal: "SIGTERM",
			stderrTail: "terminated",
			sessionFile: SESSION_FILE,
		});
	});
});
