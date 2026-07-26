import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { runCommand } from "@nseng-ai/foundation/exec";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";

const tempDirs: string[] = [];

function writeChildScript(contents: string): string {
	const directory = mkdtempSync(join(tmpdir(), "ns-core-exec-"));
	tempDirs.push(directory);
	const path = join(directory, "child.cjs");
	writeFileSync(path, contents);
	return path;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("runCommand", () => {
	test("normal close preserves output and exit code", async () => {
		const script = writeChildScript(`
console.log("child stdout");
console.error("child stderr");
process.exit(7);
`);

		const result = await runCommand(process.execPath, [script]);

		expect(result).toMatchObject({
			type: "exited",
			code: 7,
			signal: null,
			stdout: expect.stringContaining("child stdout"),
			stderr: expect.stringContaining("child stderr"),
		});
	});

	test("writes provided stdin and captures stdout", async () => {
		const script = writeChildScript(`
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => {
	input += chunk;
});
process.stdin.on("end", () => {
	process.stdout.write("received:" + input);
});
`);

		const result = await runCommand(process.execPath, [script], { stdin: "hello from stdin" });

		expect(result).toEqual({
			type: "exited",
			stdout: "received:hello from stdin",
			stderr: "",
			code: 0,
			signal: null,
		});
	});

	test("no stdin option preserves ignored stdin behavior", async () => {
		const script = writeChildScript(`
process.stdin.on("data", () => process.exit(9));
setTimeout(() => process.stdout.write("done"), 10);
setTimeout(() => process.exit(0), 20);
`);

		const result = await runCommand(process.execPath, [script]);

		expect(result).toEqual({
			type: "exited",
			stdout: "done",
			stderr: "",
			code: 0,
			signal: null,
		});
	});

	test("streams stdout and stderr chunks while preserving buffered output", async () => {
		const script = writeChildScript(`
process.stdout.write("first stdout\\n");
process.stderr.write("first stderr\\n");
setTimeout(() => {
	process.stdout.write("second stdout\\n");
	process.stderr.write("second stderr\\n");
}, 10);
setTimeout(() => process.exit(0), 30);
`);
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];

		const result = await runCommand(process.execPath, [script], {
			onStdout: (text) => {
				stdoutChunks.push(text);
			},
			onStderr: (text) => {
				stderrChunks.push(text);
			},
		});

		expect(result.stdout).toBe("first stdout\nsecond stdout\n");
		expect(result.stderr).toBe("first stderr\nsecond stderr\n");
		expect(stdoutChunks.join("")).toBe(result.stdout);
		expect(stderrChunks.join("")).toBe(result.stderr);
	});

	test("spawn failure carries the error and captured output", async () => {
		const result = await runCommand("__ns_foundation_missing_command_for_test__", []);

		expect(result.type).toBe("spawn-failed");
		expect(result.stdout).toBe("");
		expect(result.stderr.length).toBeGreaterThan(0);
		if (result.type !== "spawn-failed") throw new Error("expected spawn failure");
		expect(result.error).toBe(result.stderr);
	});

	test("an already-aborted signal cancels before spawn", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await runCommand("__would_spawn_fail_if_started__", [], {
			signal: controller.signal,
		});

		expect(result).toEqual({
			type: "cancelled",
			stdout: "",
			stderr: "",
			code: null,
			signal: null,
		});
	});

	test("in-flight cancellation preserves output and wins a later timeout", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => {
	process.stderr.write("cancelled cleanly\\n", () => process.exit(0));
});
process.stdout.write("ready\\n");
setInterval(() => {}, 1_000);
`);
		const controller = new AbortController();
		const manualTimers = createManualTimerScheduler();
		let resolveReady: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});

		const resultPromise = runCommand(process.execPath, [script], {
			signal: controller.signal,
			timeout: 500,
			terminationKillGraceMs: 100,
			timers: manualTimers.timers,
			onStdout(text) {
				if (text.includes("ready")) resolveReady();
			},
		});
		await ready;
		controller.abort();

		const result = await resultPromise;
		expect(result).toMatchObject({
			type: "cancelled",
			stdout: expect.stringContaining("ready"),
			stderr: expect.stringContaining("cancelled cleanly"),
			code: 0,
			signal: null,
		});
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("timeout wins a later caller cancellation", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => process.exit(0));
process.stderr.write("ready\\n");
setInterval(() => {}, 1_000);
`);
		const controller = new AbortController();
		const manualTimers = createManualTimerScheduler();
		let resolveReady: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});
		const resultPromise = runCommand(process.execPath, [script], {
			signal: controller.signal,
			timeout: 500,
			timers: manualTimers.timers,
			onStderr(text) {
				if (text.includes("ready")) resolveReady();
			},
		});

		await ready;
		manualTimers.advanceMs(500);
		controller.abort();

		await expect(resultPromise).resolves.toMatchObject({ type: "timed-out" });
	});

	test("native close wins later cancellation and timeout callbacks", async () => {
		const controller = new AbortController();
		const manualTimers = createManualTimerScheduler();
		const result = await runCommand(process.execPath, ["-e", "process.stdout.write('done')"], {
			signal: controller.signal,
			timeout: 500,
			timers: manualTimers.timers,
		});

		controller.abort();
		manualTimers.advanceMs(500);
		expect(result).toEqual({
			type: "exited",
			stdout: "done",
			stderr: "",
			code: 0,
			signal: null,
		});
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("timeout resolves when the child handles SIGTERM", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => {
	process.stderr.write("received sigterm\\n", () => process.exit(0));
});
process.stderr.write("ready\\n");
setInterval(() => {}, 1_000);
`);
		const manualTimers = createManualTimerScheduler();
		let resolveReady: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});

		const resultPromise = runCommand(process.execPath, [script], {
			timeout: 500,
			terminationKillGraceMs: 100,
			timers: manualTimers.timers,
			onStderr(text) {
				if (text.includes("ready")) resolveReady();
			},
		});

		await ready;
		manualTimers.advanceMs(500);
		const result = await resultPromise;

		expect(result).toMatchObject({
			type: "timed-out",
			code: 0,
			signal: null,
			stderr: expect.stringContaining("received sigterm"),
		});
	});

	test("timeout escalates to SIGKILL when the child ignores SIGTERM", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => {
	process.stderr.write("ignored sigterm\\n");
});
process.stderr.write("ready\\n");
setInterval(() => {}, 1_000);
`);
		const manualTimers = createManualTimerScheduler();
		let resolveReady: () => void = () => {};
		let resolveIgnoredSigterm: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});
		const ignoredSigterm = new Promise<void>((resolve) => {
			resolveIgnoredSigterm = resolve;
		});

		const resultPromise = runCommand(process.execPath, [script], {
			timeout: 500,
			terminationKillGraceMs: 100,
			timers: manualTimers.timers,
			onStderr(text) {
				if (text.includes("ready")) resolveReady();
				if (text.includes("ignored sigterm")) resolveIgnoredSigterm();
			},
		});

		await ready;
		manualTimers.advanceMs(500);
		await ignoredSigterm;
		manualTimers.advanceMs(100);
		const result = await resultPromise;

		expect(result).toMatchObject({
			type: "timed-out",
			code: null,
			signal: "SIGKILL",
			stderr: expect.stringContaining("ignored sigterm"),
		});
	});
});
