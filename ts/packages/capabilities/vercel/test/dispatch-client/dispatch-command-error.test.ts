import type { ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import {
	dispatchCommandError,
	firstErrorLine,
} from "../../src/dispatch-client/dispatch-command-error.ts";

function exited(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 0, signal: null, ...overrides };
}

describe("dispatch command errors", () => {
	test("uses the first trimmed stderr line", () => {
		expect(
			firstErrorLine(exited({ stdout: "stdout", stderr: "  stderr first\nstderr second" })),
		).toBe("stderr first");
	});

	test("falls back to the first trimmed stdout line", () => {
		expect(firstErrorLine(exited({ stdout: "  stdout first\nstdout second", stderr: "  " }))).toBe(
			"stdout first",
		);
	});

	test("falls back to the exit code when both streams are empty", () => {
		expect(firstErrorLine(exited({ code: 17 }))).toBe("exit code 17");
	});

	test("builds a dependency-neutral gateway error record", () => {
		expect(
			dispatchCommandError("command-failed", "Running command failed", exited({ code: 17 })),
		).toEqual({
			code: "command-failed",
			message: "Running command failed: exit code 17",
		});
	});
});
