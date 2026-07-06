import { describe, expect, test } from "vitest";

import type { ExecResult } from "@nseng-ai/foundation/command";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/kernel/sdk";
import type { NsExecOptions, NsExtensionApi } from "@nseng-ai/kernel/sdk";

import { execNsGit, readNsGitPorcelainStatus } from "../../src/ns/exec.ts";

interface ExecCall {
	command: string;
	args: string[];
	options?: NsExecOptions;
}

describe("flow ns exec helpers", () => {
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
