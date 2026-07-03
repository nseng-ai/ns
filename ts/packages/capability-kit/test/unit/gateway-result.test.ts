import { describe, expect, test } from "vitest";

import type { ExecResult } from "@ji/core/exec";
import {
	err,
	ok,
	commandFailure,
	formatCommandFailureConciseCause,
	formatErrorInfoDiagnosticLines,
} from "@ji/capability-kit/gateway-result";

describe("gateway result", () => {
	test("returns undefined for successful commands", () => {
		expect(
			commandFailure({
				command: "git",
				args: ["status"],
				result: makeExecResult(),
				code: "git_status_failed",
				message: "Could not read git status.",
			}),
		).toBeUndefined();
	});

	test("builds structured command failure details", () => {
		const args = ["status"];
		const failure = commandFailure({
			command: "git",
			args,
			result: makeExecResult({ code: 128, stderr: "fatal: not a git repo\n" }),
			code: "git_status_failed",
			message: "Could not read git status.",
		});

		expect(failure).toEqual({
			code: "git_status_failed",
			message: "Could not read git status.",
			details: {
				command: "git",
				args: ["status"],
				exit_code: 128,
				stderr: "fatal: not a git repo",
			},
		});
		expect(failure?.details?.args).not.toBe(args);
	});

	test("includes startup errors", () => {
		expect(
			commandFailure({
				command: "missing-command",
				args: [],
				result: makeExecResult({ code: 127, startupError: "spawn ENOENT" }),
				code: "command_failed",
				message: "Command failed.",
			}),
		).toEqual({
			code: "command_failed",
			message: "Command failed.",
			details: {
				command: "missing-command",
				args: [],
				exit_code: 127,
				startup_error: "spawn ENOENT",
			},
		});
	});

	test("omits blank stderr", () => {
		expect(
			commandFailure({
				command: "git",
				args: ["status"],
				result: makeExecResult({ code: 1, stderr: " \n\t" }),
				code: "git_status_failed",
				message: "Could not read git status.",
			}),
		).toEqual({
			code: "git_status_failed",
			message: "Could not read git status.",
			details: { command: "git", args: ["status"], exit_code: 1 },
		});
	});

	test("tail-truncates long stderr", () => {
		const stderr = `${"x".repeat(1_250)}tail`;

		expect(
			commandFailure({
				command: "git",
				args: ["status"],
				result: makeExecResult({ code: 1, stderr }),
				code: "git_status_failed",
				message: "Could not read git status.",
			})?.details?.stderr,
		).toBe(`…${stderr.slice(-1_200)}`);
	});

	test("formats concise command failure causes from structured details", () => {
		const failure = commandFailure({
			command: "gh",
			args: ["pr", "view", "123"],
			result: makeExecResult({
				code: 1,
				stderr: "GraphQL:\u001B[31m Could not resolve to a PullRequest\u001B[0m\nsecond line\n",
			}),
			code: "github_pr_view_failed",
			message: "Could not read GitHub PR details.",
		});

		expect(formatCommandFailureConciseCause(failure)).toBe(
			"gh exited 1: GraphQL: Could not resolve to a PullRequest second line",
		);
	});

	test("formats startup failures as concise command failure causes", () => {
		const failure = commandFailure({
			command: "gh",
			args: ["pr", "view", "123"],
			result: makeExecResult({ code: 127, startupError: "spawn gh ENOENT" }),
			code: "github_pr_view_failed",
			message: "Could not read GitHub PR details.",
		});

		expect(formatCommandFailureConciseCause(failure)).toBe("gh startup failed: spawn gh ENOENT");
	});

	test("formats ErrorInfo diagnostic lines with sorted structured details", () => {
		const failure = commandFailure({
			command: "gh",
			args: ["pr", "view", "123"],
			result: makeExecResult({ code: 1, stderr: "not found\n" }),
			code: "github_pr_view_failed",
			message: "Could not read GitHub PR details.",
		});

		expect(
			formatErrorInfoDiagnosticLines(failure ?? { code: "missing", message: "missing" }),
		).toEqual([
			"code: github_pr_view_failed",
			"message: Could not read GitHub PR details.",
			"args: pr view 123",
			"command: gh",
			"exit_code: 1",
			"stderr: not found",
		]);
	});

	test("facade result constructors preserve core result shape", () => {
		expect(ok("value")).toEqual({ ok: true, value: "value" });
		expect(err({ code: "failed", message: "Failed." })).toEqual({
			ok: false,
			error: { code: "failed", message: "Failed." },
		});
	});
});

function makeExecResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}
