import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { runCommand } from "asdl-dev/src/command-runner.ts";

const tempDirs: string[] = [];

function writeChildScript(contents: string): string {
	const directory = mkdtempSync(join(tmpdir(), "asdl-dev-command-runner-"));
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

		expect(result.command).toBe(process.execPath);
		expect(result.args).toEqual([script]);
		expect(result.exitCode).toBe(7);
		expect(result.stdout).toContain("child stdout");
		expect(result.stderr).toContain("child stderr");
		expect(result.killed).toBeUndefined();
		expect(result.startupError).toBeUndefined();
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

	test("startup error returns 127 and startupError", async () => {
		const result = await runCommand("__asdl_dev_missing_command_for_test__", []);

		expect(result.exitCode).toBe(127);
		expect(result.startupError).toEqual(expect.any(String));
		expect(result.startupError?.length).toBeGreaterThan(0);
		expect(result.killed).toBeUndefined();
		expect(result.stdout).toBe("");
	});

	test("timeout resolves when the child handles SIGTERM", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => {
	console.error("received sigterm");
	setTimeout(() => process.exit(0), 10);
});
setTimeout(() => process.exit(88), 5_000);
setInterval(() => {}, 1_000);
`);

		const result = await runCommand(process.execPath, [script], { timeoutMs: 500, timeoutKillGraceMs: 100 });

		expect(result.killed).toBe(true);
		expect(result.exitCode).toBe(124);
		expect(result.stderr).toContain("received sigterm");
		expect(result.startupError).toBeUndefined();
	});

	test("timeout escalates to SIGKILL when the child ignores SIGTERM", async () => {
		const script = writeChildScript(`
process.on("SIGTERM", () => {
	console.error("ignored sigterm");
});
setTimeout(() => process.exit(88), 5_000);
setInterval(() => {}, 1_000);
`);

		const startedAt = Date.now();
		const result = await runCommand(process.execPath, [script], { timeoutMs: 500, timeoutKillGraceMs: 100 });
		const elapsedMs = Date.now() - startedAt;

		expect(elapsedMs).toBeLessThan(4_000);
		expect(result.killed).toBe(true);
		expect(result.exitCode).toBe(124);
		expect(result.stderr).toContain("ignored sigterm");
		expect(result.startupError).toBeUndefined();
	});
});
