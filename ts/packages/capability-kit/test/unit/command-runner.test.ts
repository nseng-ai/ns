import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@ns/kernel/sdk";
import type { ExecResult } from "@ns/core/exec";
import type { NsExecOptions, NsExtensionApi } from "@ns/kernel/sdk";

import {
	createNsCommandRunner,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "@ns/capability-kit/command-runner";
import { execNsGit, readNsGitPorcelainStatus } from "@ns/capability-kit/git";

interface ExecCall {
	command: string;
	args: string[];
	options?: NsExecOptions;
}

describe("ns command runner adapter", () => {
	test("executes commands with copied args and converted options", async () => {
		const success = makeExecResult({ stdout: "ok\n" });
		const { api, calls } = createFakeApi([success]);
		const runner = createNsCommandRunner(api);
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

	test("marks stdin-capable exec support", async () => {
		const success = makeExecResult({ stdout: "ok\n" });
		const { api, calls } = createFakeApi([success]);
		const commands = new NsStdinCapableCommandExecApi(api);

		const result = await commands.exec("brmem", ["store"], { stdin: "payload" });

		expect(commands.supportsStdin).toBe(true);
		expect(result).toBe(success);
		expect(calls[0]?.options?.stdin).toBe("payload");
	});

	test("refuses cwd outside the ns host cwd", async () => {
		const { api, calls } = createFakeApi([]);
		const result = await new NsCommandExecApi(api).exec("git", ["status"], { cwd: "/elsewhere" });

		expect(result).toEqual({
			code: 2,
			stdout: "",
			stderr: "ns command execution is scoped to /repo; refusing command cwd /elsewhere.",
			killed: false,
		});
		expect(calls).toEqual([]);
	});

	test("executes git and reads porcelain status", async () => {
		const cleanResult = makeExecResult({ stdout: "\n" });
		const dirtyResult = makeExecResult({ stdout: " M src/app.ts\n" });
		const failedResult = makeExecResult({ code: 128, stderr: "fatal\n" });
		const { api, calls } = createFakeApi([cleanResult, dirtyResult, failedResult]);

		await expect(execNsGit(api, ["status"], 42)).resolves.toBe(cleanResult);
		await expect(readNsGitPorcelainStatus(api)).resolves.toEqual({
			ok: true,
			isClean: false,
			stdout: " M src/app.ts\n",
			result: dirtyResult,
		});
		await expect(readNsGitPorcelainStatus(api, 100)).resolves.toEqual({
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
	api: NsExtensionApi;
	calls: ExecCall[];
} {
	const pending = [...results];
	const calls: ExecCall[] = [];
	return {
		api: {
			cwd: "/repo",
			env: {},
			commandIo: noopNsCommandIo,
			progress: noopNsProgress,
			renderCapabilities: { canEmitAnsi: false },
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
