import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { runCommand } from "@asdl/core/exec";
import { createManualTimerScheduler } from "@asdl/core/testing";

const tempDirs: string[] = [];

function writeChildScript(contents: string): string {
	const directory = mkdtempSync(join(tmpdir(), "asdl-core-exec-"));
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

		expect(result.code).toBe(7);
		expect(result.stdout).toContain("child stdout");
		expect(result.stderr).toContain("child stderr");
		expect(result.killed).toBe(false);
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

		expect(result).toMatchObject({
			stdout: "received:hello from stdin",
			stderr: "",
			code: 0,
			killed: false,
		});
	});

	test("no stdin option preserves ignored stdin behavior", async () => {
		const script = writeChildScript(`
process.stdin.on("data", () => process.exit(9));
setTimeout(() => process.stdout.write("done"), 10);
setTimeout(() => process.exit(0), 20);
`);

		const result = await runCommand(process.execPath, [script]);

		expect(result).toMatchObject({ stdout: "done", stderr: "", code: 0, killed: false });
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

	test("startup error returns 127, stderr, and explicit startupError", async () => {
		const result = await runCommand("__asdl_core_missing_command_for_test__", []);

		expect(result.code).toBe(127);
		expect(result.stderr.length).toBeGreaterThan(0);
		expect(result.startupError).toBe(result.stderr);
		expect(result.killed).toBe(false);
		expect(result.stdout).toBe("");
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
			timeoutKillGraceMs: 100,
			timers: manualTimers.timers,
			onStderr(text) {
				if (text.includes("ready")) resolveReady();
			},
		});

		await ready;
		manualTimers.advanceMs(500);
		const result = await resultPromise;

		expect(result.killed).toBe(true);
		expect(result.code).toBe(124);
		expect(result.stderr).toContain("received sigterm");
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
			timeoutKillGraceMs: 100,
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

		expect(result.killed).toBe(true);
		expect(result.code).toBe(124);
		expect(result.stderr).toContain("ignored sigterm");
	});
});
