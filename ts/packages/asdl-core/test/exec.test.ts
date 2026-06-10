import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
	formatCommand,
	formatOutputSection,
	formatShellArg,
	normalizeExecResult,
	runCommand,
	shellQuote,
	stripTerminalEscapes,
	tailText,
	truncateTail,
} from "@asdl/core/exec";

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
	test("normalizes optional pi exec fields", () => {
		expect(normalizeExecResult({ code: 2 })).toEqual({
			stdout: "",
			stderr: "",
			code: 2,
			killed: false,
		});
		expect(normalizeExecResult({ stdout: "out", stderr: "err", code: 9, killed: true })).toEqual({
			stdout: "out",
			stderr: "err",
			code: 9,
			killed: true,
		});
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe("gh pr view 'branch name' 'can'\\''t'");
		expect(formatShellArg("safe:value")).toBe("safe:value");
		expect(shellQuote("can't")).toBe("'can'\\''t'");
	});

	test("strips terminal ANSI and OSC escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
		expect(stripTerminalEscapes("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007")).toBe("#101");
	});

	test("tailText returns full text under limits", () => {
		expect(tailText("line 1\nline 2", { maxLines: 3, maxChars: 100 })).toBe("line 1\nline 2");
	});

	test("tailText keeps the last lines with an omitted-line prefix", () => {
		const lines = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join("\n");

		expect(tailText(lines, { maxLines: 2, maxChars: 100 })).toBe("… 3 earlier line(s) omitted\nline 4\nline 5");
	});

	test("tailText keeps final chars with an ellipsis when char-limited", () => {
		expect(tailText("abcdefghijklmnopqrstuvwxyz", { maxChars: 5 })).toBe("…vwxyz");
		expect(truncateTail("abcdefghijklmnopqrstuvwxyz", 5)).toBe("[Output truncated to the last 5 characters.]\n\nvwxyz");
	});

	test("formatOutputSection strips escapes, normalizes carriage returns, and labels empty output", () => {
		expect(formatOutputSection("stdout", "\u001b[31mfirst\rsecond\u001b[0m\n", { maxLines: 10, maxChars: 100 })).toBe(
			"----- stdout tail -----\nfirst\nsecond",
		);
		expect(formatOutputSection("stderr", "\n", { maxLines: 10, maxChars: 100 })).toBe("----- stderr tail -----\n(empty)");
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

	test("startup error returns 127 and stderr", async () => {
		const result = await runCommand("__asdl_core_missing_command_for_test__", []);

		expect(result.code).toBe(127);
		expect(result.stderr.length).toBeGreaterThan(0);
		expect(result.killed).toBe(false);
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

		const result = await runCommand(process.execPath, [script], { timeout: 500, timeoutKillGraceMs: 100 });

		expect(result.killed).toBe(true);
		expect(result.code).toBe(124);
		expect(result.stderr).toContain("received sigterm");
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
		const result = await runCommand(process.execPath, [script], { timeout: 500, timeoutKillGraceMs: 100 });
		const elapsedMs = Date.now() - startedAt;

		expect(elapsedMs).toBeLessThan(4_000);
		expect(result.killed).toBe(true);
		expect(result.code).toBe(124);
		expect(result.stderr).toContain("ignored sigterm");
	});
});
