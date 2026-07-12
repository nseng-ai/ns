import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { NsExecOptions, NsExtensionApi } from "@nseng-ai/sdk";

import {
	createNsCommandRunner,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "@nseng-ai/capability-kit/command-runner";

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
			type: "exited",
			signal: null,
		});
		expect(calls).toEqual([]);
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
				return (
					pending.shift() ??
					makeExecResult({
						type: "exited",
						stdout: "",
						stderr: "missing exec response\n",
						code: 127,
						signal: null,
					})
				);
			},
		},
		calls,
	};
}

function makeExecResult(
	overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		type: "exited",
		signal: null,
		...overrides,
	};
}
