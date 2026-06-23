import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ExecResult, SdlExecOptions, SdlExtensionApi } from "@sdl/sdl/sdk";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_GIT_HELPER_PATH = join(REPO_ROOT, "ts/packages/flow/src/shared/git.ts");

interface FlowGitModule {
	execFlowGit(
		ctx: SdlExtensionApi,
		args: readonly string[],
		timeoutMs?: number,
	): Promise<ExecResult>;
	readFlowGitPorcelainStatus(
		ctx: SdlExtensionApi,
		timeoutMs?: number,
	): Promise<
		| { ok: true; clean: boolean; stdout: string; result: ExecResult }
		| { ok: false; result: ExecResult }
	>;
}

interface ExecCall {
	command: string;
	args: string[];
	options?: SdlExecOptions;
}

describe("project extension shared Git helper", () => {
	test("executes git with copied args and optional timeout", async () => {
		const sharedModule = await loadFlowGitModule();
		const success = makeExecResult({ stdout: "ok\n" });
		const { api, calls } = createFakeApi([success]);
		const args = ["status"] as const;

		const result = await sharedModule.execFlowGit(api, args, 42);

		expect(result).toBe(success);
		expect(calls).toEqual([{ command: "git", args: ["status"], options: { timeoutMs: 42 } }]);
		expect(calls[0]?.args).not.toBe(args);
	});

	test("reads clean, dirty, and failed porcelain status", async () => {
		const sharedModule = await loadFlowGitModule();
		const cleanResult = makeExecResult({ stdout: "\n" });
		const dirtyResult = makeExecResult({ stdout: " M src/app.ts\n" });
		const failedResult = makeExecResult({ code: 128, stderr: "fatal\n" });
		const { api, calls } = createFakeApi([cleanResult, dirtyResult, failedResult]);

		await expect(sharedModule.readFlowGitPorcelainStatus(api)).resolves.toEqual({
			ok: true,
			clean: true,
			stdout: "\n",
			result: cleanResult,
		});
		await expect(sharedModule.readFlowGitPorcelainStatus(api)).resolves.toEqual({
			ok: true,
			clean: false,
			stdout: " M src/app.ts\n",
			result: dirtyResult,
		});
		await expect(sharedModule.readFlowGitPorcelainStatus(api, 100)).resolves.toEqual({
			ok: false,
			result: failedResult,
		});
		expect(calls).toEqual([
			{ command: "git", args: ["status", "--porcelain"] },
			{ command: "git", args: ["status", "--porcelain"] },
			{ command: "git", args: ["status", "--porcelain"], options: { timeoutMs: 100 } },
		]);
	});
});

async function loadFlowGitModule(): Promise<FlowGitModule> {
	const sharedModule = await import(SHARED_GIT_HELPER_PATH);
	assertFlowGitModule(sharedModule);
	return sharedModule;
}

function assertFlowGitModule(value: unknown): asserts value is FlowGitModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared Git helper module object.");
	}
	if (!("execFlowGit" in value) || typeof value.execFlowGit !== "function") {
		throw new Error("Expected shared Git helper to export execFlowGit.");
	}
	if (
		!("readFlowGitPorcelainStatus" in value) ||
		typeof value.readFlowGitPorcelainStatus !== "function"
	) {
		throw new Error("Expected shared Git helper to export readFlowGitPorcelainStatus.");
	}
}

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
