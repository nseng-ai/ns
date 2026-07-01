import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@sdl/core/command";
import { noopSdlCommandIo, noopSdlProgress } from "sdl-sdk";
import type { SdlExecOptions, SdlExtensionApi, SdlResult } from "sdl-sdk";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const SHARED_FLOW_CLI_RUNNER_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/shared/flow-cli-runner.ts",
);

interface FlowCliExecOptions {
	cwd?: string;
	timeout?: number;
}

interface FlowCliRunnerInput {
	exec(command: string, args: string[], options?: FlowCliExecOptions): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
}

interface RunFlowCliOptions {
	ctx: SdlExtensionApi;
	successMessage: string;
	failureMessage: string;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	outputMode?: "forward-live" | "buffer-until-complete";
	afterExitCode?: (exitCode: number) => Promise<void> | void;
	run(input: FlowCliRunnerInput): Promise<number>;
}

interface FlowCliOutputCapture {
	readonly input: Pick<FlowCliRunnerInput, "stdout" | "stderr">;
	readonly stdout: string;
	readonly stderr: string;
	flush(): void;
	toResult(
		exitCode: number,
		messages: { successMessage: string; failureMessage: string },
	): SdlResult;
}

interface FlowCliRunnerModule {
	createFlowCliOutputCapture(options: {
		ctx: SdlExtensionApi;
		mode?: "forward-live" | "buffer-until-complete";
	}): FlowCliOutputCapture;
	runFlowCli(options: RunFlowCliOptions): Promise<SdlResult>;
}

interface ExecCall {
	command: string;
	args: string[];
	options?: ExecOptions | SdlExecOptions;
}

describe("project extension shared Flow CLI runner", () => {
	test("returns empty success result after forwarding emitted stdout", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls, stdout } = createFakeApi([makeExecResult()]);

		const result = await sharedModule.runFlowCli({
			ctx: api,
			trustedExec,
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
		const sharedModule = await loadFlowCliRunnerModule();
		const { api } = createFakeApi([]);

		const result = await sharedModule.runFlowCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async () => 0,
		});

		expect(result).toEqual({ ok: true, message: "completed" });
	});

	test("returns empty failure result after forwarding emitted stderr", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, stderr } = createFakeApi([]);

		const result = await sharedModule.runFlowCli({
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
		const sharedModule = await loadFlowCliRunnerModule();
		const { api } = createFakeApi([]);

		const result = await sharedModule.runFlowCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			run: async () => 5,
		});

		expect(result).toEqual({ ok: false, exitCode: 5, message: "failed" });
	});

	test("optionally forwards exec live output through ctx.onOutput", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls, liveOutput } = createFakeApi([
			makeExecResult({ stdout: "live out\n", stderr: "live err\n" }),
		]);

		const result = await sharedModule.runFlowCli({
			ctx: api,
			trustedExec,
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
		expect(calls[0]?.options).toMatchObject({ timeoutMs: 9 });
		expect(calls[0]?.options?.onStdout).toEqual(expect.any(Function));
		expect(calls[0]?.options?.onStderr).toEqual(expect.any(Function));
		expect(liveOutput).toEqual([
			{ stream: "stdout", text: "live out\n" },
			{ stream: "stderr", text: "live err\n" },
		]);
	});

	test("buffers runFlowCli output until after the exit-code hook", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, stdout, stderr } = createFakeApi([]);
		const events: string[] = [];

		const result = await sharedModule.runFlowCli({
			ctx: api,
			successMessage: "completed",
			failureMessage: "failed",
			outputMode: "buffer-until-complete",
			afterExitCode: (exitCode) => {
				events.push(`after:${exitCode}:stdout=${stdout.length}:stderr=${stderr.length}`);
			},
			run: async (io) => {
				io.stdout("done\n");
				io.stderr("warn\n");
				return 0;
			},
		});

		expect(result).toEqual({ ok: true, message: "" });
		expect(events).toEqual(["after:0:stdout=0:stderr=0"]);
		expect(stdout).toEqual(["done\n"]);
		expect(stderr).toEqual(["warn\n"]);
	});

	test("buffers emitted output until the caller flushes after progress settles", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, stdout, stderr } = createFakeApi([]);
		const output = sharedModule.createFlowCliOutputCapture({
			ctx: api,
			mode: "buffer-until-complete",
		});

		output.input.stdout("done\n");
		output.input.stderr("warn\n");
		expect(stdout).toEqual([]);
		expect(stderr).toEqual([]);
		expect(output.stdout).toBe("done\n");
		expect(output.stderr).toBe("warn\n");

		output.flush();

		expect(stdout).toEqual(["done\n"]);
		expect(stderr).toEqual(["warn\n"]);
		expect(output.toResult(0, { successMessage: "completed", failureMessage: "failed" })).toEqual({
			ok: true,
			message: "",
		});
		expect(output.toResult(9, { successMessage: "completed", failureMessage: "failed" })).toEqual({
			ok: false,
			exitCode: 9,
			message: "",
		});
	});

	test("routes trusted pull-trunk execution to alternate cwd without scoped-cwd refusal", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls } = createFakeApi([makeExecResult({ stdout: "updated\n" })]);

		const result = await sharedModule.runFlowCli({
			ctx: api,
			trustedExec,
			successMessage: "completed",
			failureMessage: "failed",
			run: async (io) => {
				const execResult = await io.exec("git", ["pull", "--ff-only", "origin", "master"], {
					cwd: "/trunk",
					timeout: 42,
				});
				return execResult.code;
			},
		});

		expect(result).toEqual({ ok: true, message: "completed" });
		expect(calls).toEqual([
			{
				command: "git",
				args: ["pull", "--ff-only", "origin", "master"],
				options: { cwd: "/trunk", env: {}, timeout: 42 },
			},
		]);
		expect(calls[0]?.options).toMatchObject({ cwd: "/trunk" });
		expect(JSON.stringify(calls)).not.toContain(
			"SDL command execution is scoped to /repo; refusing command cwd /trunk.",
		);
	});
});

async function loadFlowCliRunnerModule(): Promise<FlowCliRunnerModule> {
	const sharedModule = await import(SHARED_FLOW_CLI_RUNNER_PATH);
	assertFlowCliRunnerModule(sharedModule);
	return sharedModule;
}

function assertFlowCliRunnerModule(value: unknown): asserts value is FlowCliRunnerModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared Flow CLI runner module object.");
	}
	if (!("runFlowCli" in value) || typeof value.runFlowCli !== "function") {
		throw new Error("Expected shared Flow CLI runner to export runFlowCli.");
	}
	if (
		!("createFlowCliOutputCapture" in value) ||
		typeof value.createFlowCliOutputCapture !== "function"
	) {
		throw new Error("Expected shared Flow CLI runner to export createFlowCliOutputCapture.");
	}
}

function createFakeApi(results: readonly ExecResult[]): {
	api: SdlExtensionApi;
	trustedExec: CommandExecApi;
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
		trustedExec: {
			async exec(command, args, options) {
				calls.push({ command, args, ...(options === undefined ? {} : { options }) });
				const result =
					pending.shift() ?? makeExecResult({ code: 127, stderr: "missing exec response\n" });
				options?.onStdout?.(result.stdout);
				options?.onStderr?.(result.stderr);
				return result;
			},
		},
		api: {
			cwd: "/repo",
			env: {},
			commandIo: noopSdlCommandIo,
			progress: noopSdlProgress,
			renderCapabilities: { canEmitAnsi: false },
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
