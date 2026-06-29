import { describe, expect, test } from "vitest";

import {
	commandFailureReason,
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	formatCommandDetails,
	formatCommandError,
	formatCommandEvidence,
	formatCommandResultFailure,
	formatCommandStartupFailure,
	formatOutputSection,
	formatShellArg,
	isSuccessfulExecResult,
	normalizeExecResult,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	shellQuote,
	tailText,
} from "../src/command.ts";
import { stripTerminalEscapes } from "../src/terminal-escapes.ts";

describe("command presentation helpers", () => {
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

	test("runs callbacks and normalizes pi-like exec results", async () => {
		const result = await runNormalizedExecResult(async () => ({ code: 3 }));

		expect(result).toEqual({ stdout: "", stderr: "", code: 3, killed: false });
	});

	test("converts thrown callback errors to startup failures", async () => {
		const result = await runNormalizedExecResult(async () => {
			throw new Error("spawn failed");
		});

		expect(result).toEqual({
			stdout: "",
			stderr: "spawn failed",
			code: 127,
			killed: false,
			startupError: "spawn failed",
		});
	});

	test("classifies successful exec results", () => {
		expect(commandSucceeded({ stdout: "", stderr: "", code: 0, killed: false })).toBe(true);
		expect(commandSucceeded({ stdout: "", stderr: "", code: 1, killed: false })).toBe(false);
		expect(commandSucceeded({ stdout: "", stderr: "", code: 0, killed: true })).toBe(false);
		expect(isSuccessfulExecResult({ stdout: "", stderr: "", code: 0, killed: false })).toBe(true);
	});

	test("formats full command evidence for SDK command failures", () => {
		expect(
			formatCommandEvidence({
				intro: "Could not inspect status.",
				command: "git status --porcelain",
				cwd: "/repo",
				result: { stdout: "", stderr: "fatal: nope\n", code: 128, killed: false },
				guidance: "Fix the repository state.",
			}),
		).toBe(
			[
				"Could not inspect status.",
				"Command: git status --porcelain",
				"Cwd: /repo",
				"Exit: 128",
				"Killed: false",
				"Fix the repository state.",
				"stdout:",
				"<empty>",
				"stderr:",
				"fatal: nope",
			].join("\n"),
		);
	});

	test("formats concise command failure reasons", () => {
		expect(
			commandFailureReason({ stdout: "", stderr: "  fatal: nope\n", code: 128, killed: false }),
		).toBe("fatal: nope");
		expect(commandFailureReason({ stdout: "", stderr: "", code: 9, killed: false })).toBe(
			"exit code 9",
		);
		expect(commandFailureReason({ stdout: "", stderr: "", code: 124, killed: true })).toBe(
			"exit code 124 (killed)",
		);
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe(
			"gh pr view 'branch name' 'can'\\''t'",
		);
		expect(formatShellArg("safe:value")).toBe("safe:value");
		expect(shellQuote("can't")).toBe("'can'\\''t'");
	});

	test("formats concise command result details", () => {
		expect(
			formatCommandDetails({
				stdout: "fallback",
				stderr: " fatal: nope\n",
				code: 1,
				killed: false,
			}),
		).toBe("exit 1: fatal: nope");
		expect(formatCommandDetails({ stdout: "fallback", stderr: "", code: 2, killed: true })).toBe(
			"exit 2 (killed or timed out): fallback",
		);
		expect(formatCommandDetails({ stdout: "", stderr: "", code: 3, killed: false })).toBe("exit 3");
		expect(
			formatCommandError("Could not read git status.", {
				stdout: "",
				stderr: "fatal: not a repo",
				code: 128,
				killed: false,
			}),
		).toBe("Could not read git status.\nexit 128: fatal: not a repo");
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

	test("formatCommandResultFailure formats failed exec results from command args", () => {
		const failure = formatCommandResultFailure("publish failed", "npm", ["publish"], {
			stdout: "",
			stderr: "denied",
			code: 1,
			killed: false,
		});
		const startupFailure = formatCommandResultFailure("publish failed", "missing tool", [], {
			stdout: "",
			stderr: "",
			code: 127,
			killed: false,
			startupError: "spawn missing tool ENOENT",
		});

		expect(failure).toContain("publish failed (exit code 1).");
		expect(failure).toContain("Command: npm publish");
		expect(failure).toContain("denied");
		expect(startupFailure).toContain("publish failed (failed before completion).");
		expect(startupFailure).toContain("Command: 'missing tool'");
		expect(startupFailure).toContain("spawn missing tool ENOENT");
	});
});
