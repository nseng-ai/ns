import { describe, expect, test } from "vitest";

import {
	checkpoint,
	pendingWorktree,
	textGeneration,
	type ExecResult,
	type SdlExtensionApi,
	type TextGenerationRequest,
	type TextGenerationResult,
} from "@sdl/sdl/sdk";

const validCheckpointMessage = `[cp] Update sdk facade tests

- Cover facade helpers`;

class ScriptedTextGenerator {
	readonly requests: TextGenerationRequest[] = [];
	private readonly results: TextGenerationResult[];

	constructor(results: readonly TextGenerationResult[]) {
		this.results = [...results];
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		this.requests.push({ ...request });
		return this.results.shift() ?? { ok: false, error: "missing text result" };
	}
}

function execResult(fields: Partial<ExecResult> = {}): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false, ...fields };
}

function createApi(
	exec: SdlExtensionApi["exec"],
	env: Record<string, string | undefined> = {},
): SdlExtensionApi {
	return {
		cwd: "/repo",
		env,
		exec,
		textGenerator: new ScriptedTextGenerator([]),
	};
}

describe("pendingWorktree facade", () => {
	test("loads a snapshot through the extension exec API and maps clean to isClean", async () => {
		const calls: Array<{ command: string; args: string[]; timeoutMs?: number }> = [];
		const api = createApi(async (command, args, options) => {
			calls.push({
				command,
				args: [...args],
				...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
			});
			if (args[0] === "rev-parse") return execResult({ stdout: "/repo\n" });
			if (args[0] === "symbolic-ref") return execResult({ stdout: "feature\n" });
			if (args[0] === "status") return execResult({ stdout: "" });
			if (args[0] === "diff") return execResult({ stdout: "" });
			return execResult({ code: 1, stderr: "unexpected" });
		});

		const loaded = await pendingWorktree.loadSnapshot(api);

		expect(loaded).toEqual({
			ok: true,
			snapshot: { root: "/repo", branch: "feature", status: "", diff: "", isClean: true },
		});
		expect(calls.map((call) => [call.command, call.args, call.timeoutMs])).toEqual([
			["git", ["rev-parse", "--show-toplevel"], 30_000],
			["git", ["symbolic-ref", "--short", "HEAD"], 30_000],
			["git", ["status", "--porcelain=v1"], 30_000],
			["git", ["diff", "HEAD", "--no-ext-diff"], 30_000],
		]);
	});

	test("formats extension-facing pending worktree failures", () => {
		expect(
			pendingWorktree.formatError({
				kind: "detached_head",
				result: execResult({ code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" }),
			}),
		).toBe("Could not determine current branch.\nexit 1: fatal: ref HEAD is not a symbolic ref");
	});
});

describe("checkpoint facade", () => {
	test("prepares messages through canonical checkpoint flow", async () => {
		const textGenerator = new ScriptedTextGenerator([{ ok: true, text: validCheckpointMessage }]);

		const prepared = await checkpoint.prepareMessage({
			status: " M src/index.ts\n",
			diff: "diff --git a/src/index.ts b/src/index.ts\n+export {};\n",
			textGenerator,
			modelRef: "model",
		});

		expect(prepared).toMatchObject({ ok: true, message: validCheckpointMessage });
		expect(textGenerator.requests[0]).toMatchObject({
			modelRef: "model",
			operation: "checkpoint-message",
		});
	});

	test("creates commits through extension exec", async () => {
		const calls: Array<{ command: string; args: string[]; stdin?: string; timeoutMs?: number }> =
			[];
		const api = createApi(async (command, args, options) => {
			calls.push({
				command,
				args: [...args],
				...(options?.stdin === undefined ? {} : { stdin: options.stdin }),
				...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
			});
			if (args[0] === "log") return execResult({ stdout: "abc [cp] Update sdk\n" });
			return execResult();
		});

		await expect(checkpoint.createCommit(api, validCheckpointMessage)).resolves.toEqual({
			summary: "abc [cp] Update sdk",
		});
		expect(calls.map((call) => [call.command, call.args, call.timeoutMs])).toEqual([
			["git", ["add", "-A"], 30_000],
			["git", ["commit", "-F", expect.stringContaining("message.txt")], 120_000],
			["git", ["log", "-1", "--oneline"], 5_000],
		]);
	});
});

describe("textGeneration facade", () => {
	test("selects current, legacy, and default model refs", () => {
		expect(textGeneration.selectCheckpointModelRef({ SDL_CHECKPOINT_MODEL: " current " })).toBe(
			"current",
		);
		expect(textGeneration.selectCheckpointModelRef({ SDL_DEV_CHECKPOINT_MODEL: "legacy" })).toBe(
			"legacy",
		);
		expect(textGeneration.selectChangesModelRef({ PI_DRAFT_MODEL: "changes-legacy" })).toBe(
			"changes-legacy",
		);
		expect(textGeneration.selectSubmitFailureModelRef({})).toBe(
			textGeneration.DEFAULT_SUBMIT_FAILURE_MODEL_REF,
		);
	});
});
