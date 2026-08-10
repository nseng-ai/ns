import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type { NsExecOptions, NsExtensionApi } from "@nseng-ai/sdk";
interface ExecCall {
	command: string;
	args: string[];
	options?: ExecOptions | NsExecOptions;
}

describe("project extension shared Flow CLI runner", () => {
	test("runs the operation through scoped exec when cwd matches the command", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls } = createFakeApi([makeExecResult({ stdout: "clean\n" })]);

		const result = await sharedModule.runFlowCliOperation({
			ctx: api,
			trustedExec,
			run: async (io) => {
				const execResult = await io.exec("git", ["status"], { cwd: "/repo", timeout: 42 });
				return execResult.type === "exited" && execResult.signal === null
					? (execResult.code ?? 1)
					: 1;
			},
		});

		expect(result).toBe(0);
		expect(calls).toEqual([{ command: "git", args: ["status"], options: { timeoutMs: 42 } }]);
	});

	test("returns the operation value produced by run", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api } = createFakeApi([]);

		const result = await sharedModule.runFlowCliOperation({
			ctx: api,
			run: async () => ({ type: "completed", branches: ["feature/demo"] }),
		});

		expect(result).toEqual({ type: "completed", branches: ["feature/demo"] });
	});

	test("optionally forwards exec live output through ctx.onOutput", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls, liveOutput } = createFakeApi([
			makeExecResult({ stdout: "live out\n", stderr: "live err\n" }),
		]);

		const exitCode = await sharedModule.runFlowCliOperation({
			ctx: api,
			trustedExec,
			shouldForwardLiveOutput: true,
			run: async (io) => {
				const execResult = await io.exec("gt", ["status"], { timeout: 9 });
				return execResult.type === "exited" && execResult.signal === null
					? (execResult.code ?? 1)
					: 1;
			},
		});

		expect(exitCode).toBe(0);
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

	test("does not forward live output when forwarding is not requested", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls, liveOutput } = createFakeApi([
			makeExecResult({ stdout: "quiet out\n" }),
		]);

		await sharedModule.runFlowCliOperation({
			ctx: api,
			trustedExec,
			run: async (io) => {
				await io.exec("gt", ["status"]);
				return 0;
			},
		});

		expect(calls[0]?.options?.onStdout).toBeUndefined();
		expect(calls[0]?.options?.onStderr).toBeUndefined();
		expect(liveOutput).toEqual([]);
	});

	test("routes trusted execution to alternate cwd without scoped-cwd refusal", async () => {
		const sharedModule = await loadFlowCliRunnerModule();
		const { api, trustedExec, calls } = createFakeApi([makeExecResult({ stdout: "updated\n" })]);

		const exitCode = await sharedModule.runFlowCliOperation({
			ctx: api,
			trustedExec,
			run: async (io) => {
				const execResult = await io.exec("git", ["pull", "--ff-only", "origin", "master"], {
					cwd: "/trunk",
					timeout: 42,
				});
				return execResult.type === "exited" && execResult.signal === null
					? (execResult.code ?? 1)
					: 1;
			},
		});

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				command: "git",
				args: ["pull", "--ff-only", "origin", "master"],
				options: { cwd: "/trunk", env: {}, timeout: 42 },
			},
		]);
		expect(calls[0]?.options).toMatchObject({ cwd: "/trunk" });
		expect(JSON.stringify(calls)).not.toContain(
			"ns command execution is scoped to /repo; refusing command cwd /trunk.",
		);
	});
});

async function loadFlowCliRunnerModule() {
	return await import("../../src/ns/flow-cli-runner.ts");
}

function createFakeApi(results: readonly ExecResult[]): {
	api: NsExtensionApi;
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
			commandIo: {
				...noopNsCommandIo,
				notify: (text, level = "info") => {
					(level === "info" ? stdout : stderr).push(text);
				},
			},
			resultOutput: { write: (text) => stdout.push(text) },
			progress: noopNsProgress,
			renderCapabilities: { canEmitAnsi: false },
			hasExtension: () => false,
			isInteractive: () => false,
			confirm: () => {
				throw new Error("Unexpected confirmation prompt in test.");
			},
			select: () => {
				throw new Error("Unexpected selection prompt in test.");
			},
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

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function makeExecResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}
