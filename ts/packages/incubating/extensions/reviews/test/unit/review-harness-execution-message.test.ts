import type { ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import { reviewHarnessExecutionMessage } from "../../src/gateways/review-harness-execution-message.ts";

function exitedResult(
	fields: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): Extract<ExecResult, { type: "exited" }> {
	return {
		type: "exited",
		stdout: "",
		stderr: "",
		code: 2,
		signal: null,
		...fields,
	};
}

describe("reviewHarnessExecutionMessage", () => {
	test.each([
		[
			"Claude Code",
			{ type: "cancelled", stdout: "", stderr: "", code: null, signal: null },
			"Claude Code execution was cancelled.",
		],
		[
			"Codex",
			{ type: "timed-out", stdout: "", stderr: "", code: null, signal: null },
			"Codex execution timed out.",
		],
		["Pi", exitedResult(), "Pi exited with status 2."],
		[
			"Pi",
			exitedResult({ code: null, signal: "SIGTERM" }),
			"Pi exited after signal SIGTERM (status unknown).",
		],
	] as const)("preserves %s termination diagnostics", (harnessLabel, result, expected) => {
		expect(reviewHarnessExecutionMessage(result, { harnessLabel, useStdoutFallback: false })).toBe(
			expected,
		);
	});

	test("prefers trimmed stderr for every harness", () => {
		expect(
			reviewHarnessExecutionMessage(
				exitedResult({ stdout: "stdout", stderr: "  stderr wins  \n" }),
				{ harnessLabel: "Claude Code", useStdoutFallback: true },
			),
		).toBe("stderr wins");
	});

	test("uses only the last stdout line when fallback is enabled", () => {
		expect(
			reviewHarnessExecutionMessage(exitedResult({ stdout: "first\nlast stdout line\n" }), {
				harnessLabel: "Pi",
				useStdoutFallback: true,
			}),
		).toBe("last stdout line");
	});

	test("does not use stdout when fallback is disabled", () => {
		expect(
			reviewHarnessExecutionMessage(exitedResult({ stdout: "codex progress" }), {
				harnessLabel: "Codex",
				useStdoutFallback: false,
			}),
		).toBe("Codex exited with status 2.");
	});

	test("preserves spawn failure diagnostics", () => {
		expect(
			reviewHarnessExecutionMessage(
				{ type: "spawn-failed", stdout: "", stderr: "", error: "spawn ENOENT" },
				{ harnessLabel: "Pi", useStdoutFallback: true },
			),
		).toBe("spawn ENOENT");
	});
});
