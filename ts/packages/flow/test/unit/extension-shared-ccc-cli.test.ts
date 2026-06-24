import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ExecResult, SdlExecOptions, SdlExtensionApi, SdlResult } from "@sdl/sdl/sdk";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_CCC_CLI_HELPER_PATH = join(REPO_ROOT, "ts/packages/flow/src/shared/ccc-cli.ts");

interface FlowCccCliExecOptions {
	cwd?: string | undefined;
	timeout?: number | undefined;
}

interface FlowCccCliRunnerInput {
	exec(
		command: string,
		args: string[],
		options?: FlowCccCliExecOptions | undefined,
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
}

interface RunFlowCccCliOptions {
	ctx: SdlExtensionApi;
	successMessage: string;
	failureMessage: string;
	shouldForwardLiveOutput?: boolean | undefined;
	run(input: FlowCccCliRunnerInput): Promise<number>;
}

interface FlowCccCliModule {
	runFlowCccCli(options: RunFlowCccCliOptions): Promise<SdlResult>;
}

interface CapturedExecOptions extends SdlExecOptions {
	cwd?: string | undefined;
}

interface ExecCall {
	command: string;
	args: string[];
	options?: CapturedExecOptions | undefined;
}

describe("project extension shared CCC CLI helper", () => {
	test("returns empty success result after forwarding emitted stdout", async () => {
		const sharedModule = await loadFlowCccCliModule();
		const { api, calls, stdout } = createFakeApi([makeExecResult()]);

		const result = await sharedModule.runFlowCccCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async (io) => {
				const execResult = await io.exec("git", ["status"], { cwd: "/repo", timeout: 42 });
				io.stdout("done\n");
				return execResult.code;
			},
		});

		expect(result).toEqual({ ok: true, message: "" });
		expect(stdout).toEqual(["done\n"]);
		expect(calls).toEqual([{ command: "git", args: ["status"], options: { timeoutMs: 42 } }]);
	});

	test("returns fallback success message when the runner emits no stdout", async () => {
		const sharedModule = await loadFlowCccCliModule();
		const { api } = createFakeApi([]);

		const result = await sharedModule.runFlowCccCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async () => 0,
		});

		expect(result).toEqual({ ok: true, message: "completed" });
	});

	test("returns empty failure result after forwarding emitted stderr", async () => {
		const sharedModule = await loadFlowCccCliModule();
		const { api, stderr } = createFakeApi([]);

		const result = await sharedModule.runFlowCccCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async (io) => {
				io.stderr("bad\n");
				return 7;
			},
		});

		expect(result).toEqual({ ok: false, exitCode: 7, message: "" });
		expect(stderr).toEqual(["bad\n"]);
	});

	test("returns fallback failure message when the runner emits no stderr", async () => {
		const sharedModule = await loadFlowCccCliModule();
		const { api } = createFakeApi([]);

		const result = await sharedModule.runFlowCccCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async () => 5,
		});

		expect(result).toEqual({ ok: false, exitCode: 5, message: "failed" });
	});

	test("optionally forwards exec live output through ctx.onOutput", async () => {
		const sharedModule = await loadFlowCccCliModule();
		const { api, calls, liveOutput } = createFakeApi([
			makeExecResult({ stdout: "live out\n", stderr: "live err\n" }),
		]);

		const result = await sharedModule.runFlowCccCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			shouldForwardLiveOutput: true,
			run: async (io) => {
				const execResult = await io.exec("gt", ["status"], { timeout: 9 });
				return execResult.code;
			},
		});

		expect(result).toEqual({ ok: true, message: "completed" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("gt");
		expect(calls[0]?.args).toEqual(["status"]);
		expect(calls[0]?.options?.timeoutMs).toBe(9);
		expect(calls[0]?.options?.onStdout).toEqual(expect.any(Function));
		expect(calls[0]?.options?.onStderr).toEqual(expect.any(Function));
		expect(liveOutput).toEqual([
			{ stream: "stdout", text: "live out\n" },
			{ stream: "stderr", text: "live err\n" },
		]);
	});
});

async function loadFlowCccCliModule(): Promise<FlowCccCliModule> {
	const sharedModule = await import(SHARED_CCC_CLI_HELPER_PATH);
	assertFlowCccCliModule(sharedModule);
	return sharedModule;
}

function assertFlowCccCliModule(value: unknown): asserts value is FlowCccCliModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared CCC CLI helper module object.");
	}
	if (!("runFlowCccCli" in value) || typeof value.runFlowCccCli !== "function") {
		throw new Error("Expected shared CCC CLI helper to export runFlowCccCli.");
	}
}

function createFakeApi(results: readonly ExecResult[]): {
	api: SdlExtensionApi;
	calls: ExecCall[];
	stdout: string[];
	stderr: string[];
	liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }>;
} {
	const pending = [...results];
	const calls: ExecCall[] = [];
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
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
				const result =
					pending.shift() ?? makeExecResult({ code: 127, stderr: "missing exec response\n" });
				options?.onStdout?.(result.stdout);
				options?.onStderr?.(result.stderr);
				return result;
			},
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
			onOutput: (stream, text) => {
				liveOutput.push({ stream, text });
			},
		},
		calls,
		stdout,
		stderr,
		liveOutput,
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
