import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { describe, expect, test } from "vitest";

import { loadGhCommand } from "../src/kit/shared/gh-command.ts";

function execResult(result: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...result,
	};
}

describe("loadGhCommand", () => {
	test("executes gh with cwd and timeout", async () => {
		const calls: Array<{ command: string; args: string[]; options: ExecOptions | undefined }> = [];
		const result = await loadGhCommand({
			pi: {
				exec: async (command, args, options) => {
					calls.push({ command, args, options });
					return execResult({ stdout: "ok" });
				},
			},
			args: ["pr", "checks"],
			cwd: "/repo",
			timeoutMs: 123,
		});

		expect(result).toEqual({ type: "loaded", stdout: "ok", stderr: "", code: 0 });
		expect(calls).toEqual([
			{ command: "gh", args: ["pr", "checks"], options: { cwd: "/repo", timeout: 123 } },
		]);
	});

	test("reports killed commands as timed out", async () => {
		const result = await loadGhCommand({
			pi: { exec: async () => execResult({ killed: true }) },
			args: ["run", "view"],
			cwd: "/repo",
			timeoutMs: 123,
		});

		expect(result).toEqual({ type: "failed", detail: "command timed out" });
	});

	test("reports nonzero stderr or exit code", async () => {
		const withStderr = await loadGhCommand({
			pi: { exec: async () => execResult({ code: 1, stderr: "not found\n" }) },
			args: ["api"],
			cwd: "/repo",
			timeoutMs: 123,
		});
		const withoutStderr = await loadGhCommand({
			pi: { exec: async () => execResult({ code: 2 }) },
			args: ["api"],
			cwd: "/repo",
			timeoutMs: 123,
		});

		expect(withStderr).toEqual({ type: "failed", detail: "not found" });
		expect(withoutStderr).toEqual({ type: "failed", detail: "exit code 2" });
	});

	test("allows nonzero commands with stdout when requested", async () => {
		const result = await loadGhCommand({
			pi: { exec: async () => execResult({ code: 1, stdout: "[]" }) },
			args: ["pr", "checks"],
			cwd: "/repo",
			timeoutMs: 123,
			shouldAllowNonZeroWithStdout: true,
		});

		expect(result).toEqual({ type: "loaded", stdout: "[]", stderr: "", code: 1 });
	});
});
