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
	formatCommandSpawnFailure,
	formatCommandTermination,
	formatOutputSection,
	formatShellArg,
	shellQuote,
	tailText,
	type ExecResult,
} from "../src/primitives/command.ts";
import { stripTerminalEscapes } from "../src/primitives/terminal-escapes.ts";

function exited(code = 0, stdout = "", stderr = ""): ExecResult {
	return { type: "exited", stdout, stderr, code, signal: null };
}

function terminated(type: "cancelled" | "timed-out", stderr = ""): ExecResult {
	return { type, stdout: "", stderr, code: null, signal: "SIGTERM" };
}

describe("command presentation helpers", () => {
	test("adapts CommandExecApi to CommandRunner without exposing caller-owned args", async () => {
		const calls: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
		const execApi = {
			async exec(command: string, args: string[]): Promise<ExecResult> {
				calls.push({ command, args });
				args.push("mutated");
				return exited(0, "ok");
			},
		};
		const sourceArgs = ["pr", "view"];

		const result = await execApiToCommandRunner(execApi)("gh", sourceArgs);

		expect(result).toEqual(exited(0, "ok"));
		expect(calls).toEqual([{ command: "gh", args: ["pr", "view", "mutated"] }]);
		expect(sourceArgs).toEqual(["pr", "view"]);
	});

	test("classifies only a zero ordinary exit as success", () => {
		expect(commandSucceeded(exited())).toBe(true);
		expect(commandSucceeded(exited(1))).toBe(false);
		expect(
			commandSucceeded({ type: "exited", stdout: "", stderr: "", code: 0, signal: "closed" }),
		).toBe(false);
		expect(commandSucceeded(terminated("cancelled"))).toBe(false);
		expect(commandSucceeded(terminated("timed-out"))).toBe(false);
		expect(
			commandSucceeded({
				type: "spawn-failed",
				stdout: "",
				stderr: "missing",
				error: "missing",
			}),
		).toBe(false);
	});

	test("formats full command evidence with exhaustive termination evidence", () => {
		expect(
			formatCommandEvidence({
				intro: "Could not inspect status.",
				command: "git status --porcelain",
				cwd: "/repo",
				result: exited(128, "", "fatal: nope\n"),
				guidance: "Fix the repository state.",
			}),
		).toBe(
			[
				"Could not inspect status.",
				"Command: git status --porcelain",
				"Cwd: /repo",
				"Termination: exit code 128",
				"Fix the repository state.",
				"stdout:",
				"<empty>",
				"stderr:",
				"fatal: nope",
			].join("\n"),
		);
	});

	test("formats every command termination arm and available close evidence", () => {
		expect(formatCommandTermination(exited(7))).toBe("exit code 7");
		expect(
			formatCommandTermination({
				type: "exited",
				stdout: "",
				stderr: "",
				code: null,
				signal: "SIGKILL",
			}),
		).toBe("exit code unknown; signal SIGKILL");
		expect(
			formatCommandTermination({
				type: "spawn-failed",
				stdout: "",
				stderr: "missing",
				error: "spawn tool ENOENT",
			}),
		).toBe("spawn failed: spawn tool ENOENT");
		expect(formatCommandTermination(terminated("cancelled"))).toBe("cancelled; signal SIGTERM");
		expect(
			formatCommandTermination({
				type: "cancelled",
				stdout: "",
				stderr: "",
				code: null,
				signal: null,
			}),
		).toBe("cancelled");
		expect(formatCommandTermination(terminated("timed-out"))).toBe("timed out; signal SIGTERM");
		expect(
			formatCommandTermination({
				type: "timed-out",
				stdout: "",
				stderr: "",
				code: null,
				signal: null,
			}),
		).toBe("timed out");
	});

	test("formats concise reasons for every result arm", () => {
		expect(commandFailureReason(exited(128, "", "  fatal: nope\n"))).toBe("fatal: nope");
		expect(commandFailureReason(exited(9))).toBe("exit code 9");
		expect(commandFailureReason(terminated("cancelled"))).toBe("cancelled; signal SIGTERM");
		expect(commandFailureReason(terminated("timed-out"))).toBe("timed out; signal SIGTERM");
		expect(
			commandFailureReason({
				type: "spawn-failed",
				stdout: "",
				stderr: "",
				error: "missing",
			}),
		).toBe("spawn failed: missing");
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
		expect(formatCommandDetails(exited(1, "fallback", " fatal: nope\n"))).toBe(
			"exit code 1: fatal: nope",
		);
		expect(formatCommandDetails(terminated("timed-out"))).toBe("timed out; signal SIGTERM");
		expect(formatCommandError("Could not read git status.", exited(128, "", "fatal"))).toBe(
			"Could not read git status.\nexit code 128: fatal",
		);
	});

	test("strips terminal ANSI and OSC escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
		expect(
			stripTerminalEscapes("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007"),
		).toBe("#101");
	});

	test("tailText applies line and character limits", () => {
		expect(tailText("line 1\nline 2", { maxLines: 3, maxChars: 100 })).toBe("line 1\nline 2");
		const lines = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join("\n");
		expect(tailText(lines, { maxLines: 2, maxChars: 100 })).toBe(
			"… 3 earlier line(s) omitted\nline 4\nline 5",
		);
		expect(tailText("abcdefghijklmnopqrstuvwxyz", { maxChars: 5 })).toBe("…vwxyz");
	});

	test("formatOutputSection normalizes output and labels empty output", () => {
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

	test("formats spawn failures separately from close-based failures", () => {
		expect(
			formatCommandSpawnFailure(
				"objective command failed",
				"objective list",
				new Error("missing"),
			).startsWith(
				"objective command failed (failed before completion).\n\nCommand: objective list",
			),
		).toBe(true);

		const failure = formatCommandResultFailure(
			"publish failed",
			"npm",
			["publish"],
			exited(1, "", "denied"),
		);
		const spawnFailure = formatCommandResultFailure("publish failed", "missing tool", [], {
			type: "spawn-failed",
			stdout: "",
			stderr: "spawn missing tool ENOENT",
			error: "spawn missing tool ENOENT",
		});
		expect(failure).toContain("publish failed (exit code 1).");
		expect(failure).toContain("denied");
		expect(spawnFailure).toContain("publish failed (failed before completion).");
		expect(spawnFailure).toContain("spawn missing tool ENOENT");
	});
});
