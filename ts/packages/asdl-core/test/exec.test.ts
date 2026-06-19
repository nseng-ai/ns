import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
	execApiToCommandRunner,
	formatCommand,
	formatCommandStartupFailure,
	formatOutputSection,
	formatShellArg,
	isSuccessfulExecResult,
	normalizeExecResult,
	piExecApiToCommandExecApi,
	runCommand,
	runCommandWithContext,
	shellQuote,
	stripTerminalEscapes,
	tailText,
} from "@asdl/core/exec";
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

describe("exec presentation helpers", () => {
	test("adapts CommandExecApi to CommandRunner without exposing caller-owned args", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
		const execApi = {
			async exec(command: string, args: string[]) {
				calls.push({ command, args });
				args.push("mutated");
				return { stdout: "ok", stderr: "", code: 0, killed: false };
			},
		};
		const sourceArgs = ["pr", "view"];

		const result = await execApiToCommandRunner(execApi)("gh", sourceArgs);

		expect(result).toEqual({ stdout: "ok", stderr: "", code: 0, killed: false });
		expect(calls).toEqual([{ command: "gh", args: ["pr", "view", "mutated"] }]);
		expect(sourceArgs).toEqual(["pr", "view"]);
	});

	test("normalizes optional pi exec fields", () => {
		expect(normalizeExecResult({ code: 2 })).toEqual({
			stdout: "",
			stderr: "",
			code: 2,
			killed: false,
		});
		expect(
			normalizeExecResult({
				stdout: "out",
				stderr: "err",
				code: 9,
				killed: true,
				startupError: "spawn missing",
			}),
		).toEqual({
			stdout: "out",
			stderr: "err",
			code: 9,
			killed: true,
			startupError: "spawn missing",
		});
	});

	test("adapts pi-like exec APIs to CommandExecApi with normalized results", async () => {
		const calls: Array<{
			readonly command: string;
			readonly args: readonly string[];
			readonly cwd: string | undefined;
		}> = [];
		const commandExecApi = piExecApiToCommandExecApi({
			async exec(command, args, options) {
				calls.push({ command, args: [...args], cwd: options?.cwd });
				return { stdout: "out", code: 7 };
			},
		});

		const result = await commandExecApi.exec("git", ["status"], { cwd: "/repo" });

		expect(result).toEqual({ stdout: "out", stderr: "", code: 7, killed: false });
		expect(calls).toEqual([{ command: "git", args: ["status"], cwd: "/repo" }]);
	});

	test("classifies successful exec results", () => {
		expect(isSuccessfulExecResult({ stdout: "", stderr: "", code: 0, killed: false })).toBe(true);
		expect(isSuccessfulExecResult({ stdout: "", stderr: "", code: 1, killed: false })).toBe(false);
		expect(isSuccessfulExecResult({ stdout: "", stderr: "", code: 0, killed: true })).toBe(false);
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe(
			"gh pr view 'branch name' 'can'\\''t'",
		);
		expect(formatShellArg("safe:value")).toBe("safe:value");
		expect(shellQuote("can't")).toBe("'can'\\''t'");
	});

	test("strips terminal ANSI and OSC escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
		expect(
			stripTerminalEscapes("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007"),
		).toBe("#101");
	});

	test("tailText returns full text under limits", () => {
		expect(tailText("line 1\nline 2", { maxLines: 3, maxChars: 100 })).toBe("line 1\nline 2");
	});

	test("tailText keeps the last lines with an omitted-line prefix", () => {
		const lines = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join("\n");

		expect(tailText(lines, { maxLines: 2, maxChars: 100 })).toBe(
			"… 3 earlier line(s) omitted\nline 4\nline 5",
		);
	});

	test("tailText keeps final chars with an ellipsis when char-limited", () => {
		expect(tailText("abcdefghijklmnopqrstuvwxyz", { maxChars: 5 })).toBe("…vwxyz");
	});

	test("formatOutputSection strips escapes, normalizes carriage returns, and labels empty output", () => {
		expect(
			formatOutputSection("stdout", "\u001b[31mfirst\rsecond\u001b[0m\n", {
				maxLines: 10,
				maxChars: 100,
			}),
		).toBe("----- stdout tail -----\nfirst\nsecond");
		expect(formatOutputSection("stderr", "\n", { maxLines: 10, maxChars: 100 })).toBe(
			"----- stderr tail -----\n(empty)",
		);
	});

	test("formatCommandStartupFailure uses the command failure dialect", () => {
		expect(
			formatCommandStartupFailure(
				"objective command failed",
				"objective list",
				new Error("missing"),
			).startsWith(
				"objective command failed (failed before completion).\n\nCommand: objective list",
			),
		).toBe(true);
	});
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

		const resultPromise = runCommandWithContext({
			command: process.execPath,
			args: [script],
			options: {
				timeout: 500,
				timeoutKillGraceMs: 100,
				onStderr(text) {
					if (text.includes("ready")) resolveReady();
				},
			},
			context: { timers: manualTimers.timers },
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

		const resultPromise = runCommandWithContext({
			command: process.execPath,
			args: [script],
			options: {
				timeout: 500,
				timeoutKillGraceMs: 100,
				onStderr(text) {
					if (text.includes("ready")) resolveReady();
					if (text.includes("ignored sigterm")) resolveIgnoredSigterm();
				},
			},
			context: { timers: manualTimers.timers },
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
