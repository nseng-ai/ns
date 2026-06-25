import { describe, expect, test } from "vitest";

import type { ExecResult } from "@sdl/core/exec";
import type { SdlExecOptions, SdlExtensionApi } from "@sdl/sdl/sdk";

import { createSdlCommandRunner, SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { execSdlGit, readSdlGitPorcelainStatus } from "@sdl/capability-kit/git";

interface ExecCall {
	command: string;
	args: string[];
	options?: SdlExecOptions;
}

describe("SDL command runner adapter", () => {
	test("executes commands with copied args and converted options", async () => {
		const success = makeExecResult({ stdout: "ok\n" });
		const { api, calls } = createFakeApi([success]);
		const runner = createSdlCommandRunner(api);
		const args = ["status"];

		const result = await runner("git", args, {
			timeout: 42,
			stdin: "input",
			onStdout: () => {},
		});

		expect(result).toBe(success);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("git");
		expect(calls[0]?.args).toEqual(["status"]);
		expect(calls[0]?.args).not.toBe(args);
		expect(calls[0]?.options?.timeoutMs).toBe(42);
		expect(calls[0]?.options?.stdin).toBe("input");
		expect(calls[0]?.options?.onStdout).toBeTypeOf("function");
	});

	test("refuses cwd outside the SDL host cwd", async () => {
		const { api, calls } = createFakeApi([]);
		const result = await new SdlCommandExecApi(api).exec("git", ["status"], { cwd: "/elsewhere" });

		expect(result).toEqual({
			code: 2,
			stdout: "",
			stderr: "SDL command execution is scoped to /repo; refusing command cwd /elsewhere.",
			killed: false,
		});
		expect(calls).toEqual([]);
	});

	test("executes git and reads porcelain status", async () => {
		const cleanResult = makeExecResult({ stdout: "\n" });
		const dirtyResult = makeExecResult({ stdout: " M src/app.ts\n" });
		const failedResult = makeExecResult({ code: 128, stderr: "fatal\n" });
		const { api, calls } = createFakeApi([cleanResult, dirtyResult, failedResult]);

		await expect(execSdlGit(api, ["status"], 42)).resolves.toBe(cleanResult);
		await expect(readSdlGitPorcelainStatus(api)).resolves.toEqual({
			ok: true,
			isClean: false,
			stdout: " M src/app.ts\n",
			result: dirtyResult,
		});
		await expect(readSdlGitPorcelainStatus(api, 100)).resolves.toEqual({
			ok: false,
			result: failedResult,
		});
		expect(
			calls.map((call) => ({ command: call.command, args: call.args, options: call.options })),
		).toEqual([
			{ command: "git", args: ["status"], options: { timeoutMs: 42 } },
			{ command: "git", args: ["status", "--porcelain"], options: undefined },
			{ command: "git", args: ["status", "--porcelain"], options: { timeoutMs: 100 } },
		]);
	});
});

function createFakeApi(results: readonly ExecResult[]): {
	api: SdlExtensionApi;
	calls: ExecCall[];
} {
	const pending = [...results];
	const calls: ExecCall[] = [];
	return {
		api: {
			cwd: "/repo",
			env: {},
			textGenerator: {
				async generateText() {
					return { ok: false, error: "unexpected model call" };
				},
			},
			async exec(command, args, options) {
				calls.push({ command, args, ...(options === undefined ? {} : { options }) });
				return pending.shift() ?? makeExecResult({ code: 127, stderr: "missing exec response\n" });
			},
		},
		calls,
	};
}

function makeExecResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}
