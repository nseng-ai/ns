import { describe, expect, test } from "vitest";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
import {
	buildRawTextModelArgs,
	deriveSlugWithModel,
	generateRawTextWithModel,
	type RawTextModelCommandResult,
	type RawTextModelExecOptions,
} from "@nseng-ai/capability-kit/model-slug";

interface ExecCall {
	command: string;
	args: string[];
	options: RawTextModelExecOptions;
}

function recordingExec(calls: ExecCall[], result: RawTextModelCommandResult) {
	return recordingExecSequence(calls, [result]);
}

function recordingExecSequence(calls: ExecCall[], results: RawTextModelCommandResult[]) {
	const remainingResults = [...results];
	return (
		command: string,
		args: string[],
		options: RawTextModelExecOptions,
	): Promise<RawTextModelCommandResult> => {
		calls.push({ command, args: [...args], options: { ...options } });
		const result = remainingResults.shift();
		if (result === undefined) {
			throw new Error("unexpected extra slug model execution");
		}
		return Promise.resolve(result);
	};
}

describe("generateRawTextWithModel", () => {
	test("returns raw model output without slug normalization", async () => {
		const calls: ExecCall[] = [];
		const result = await generateRawTextWithModel({
			cwd: "/repo",
			prompt: "summary prompt",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			exec: recordingExec(calls, {
				type: "exited",
				stdout: "- first bullet\n- second bullet\n",
				stderr: "",
				code: 0,
				signal: null,
			}),
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				rawOutput: "- first bullet\n- second bullet\n",
				provider: TEST_MODEL_SELECTION.provider,
				model: TEST_MODEL_SELECTION.modelId,
			},
		});
		expect(calls[0]?.args).toEqual(buildRawTextModelArgs("summary prompt", TEST_MODEL_SELECTION));
	});

	test("resolves an explicit model selection and uses its thinking level", async () => {
		const calls: ExecCall[] = [];
		const result = await generateRawTextWithModel({
			cwd: "/repo",
			prompt: "summary prompt",
			modelSelection: { provider: "acme", modelId: "fast-1", thinking: "high" as const },
			exec: recordingExec(calls, {
				type: "exited",
				stdout: "raw output\n",
				stderr: "",
				code: 0,
				signal: null,
			}),
		});

		expect(result).toEqual({
			ok: true,
			evidence: { rawOutput: "raw output\n", provider: "acme", model: "fast-1" },
		});
		expect(calls[0]?.args).toEqual(
			buildRawTextModelArgs("summary prompt", {
				provider: "acme",
				modelId: "fast-1",
				thinking: "high" as const,
			}),
		);
		expect(calls[0]?.args).toContain("high");
	});

	test("retries one killed model command result and returns the recovered raw text", async () => {
		const calls: ExecCall[] = [];
		const controller = new AbortController();
		const result = await generateRawTextWithModel({
			cwd: "/repo",
			prompt: "summary prompt",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			exec: recordingExecSequence(calls, [
				{ stdout: "", stderr: "", code: 143, type: "timed-out", signal: null },
				{ type: "exited", stdout: "recovered summary\n", stderr: "", code: 0, signal: null },
			]),
			signal: controller.signal,
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				rawOutput: "recovered summary\n",
				provider: TEST_MODEL_SELECTION.provider,
				model: TEST_MODEL_SELECTION.modelId,
			},
		});
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual(calls[1]);
	});
});

describe("deriveSlugWithModel", () => {
	test("uses the default fast model when the env has no override", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExec(calls, {
				type: "exited",
				stdout: "my-slug\n",
				stderr: "",
				code: 0,
				signal: null,
			}),
		});
		expect(result).toEqual({
			ok: true,
			evidence: {
				slug: "my-slug",
				rawOutput: "my-slug\n",
				provider: TEST_MODEL_SELECTION.provider,
				model: TEST_MODEL_SELECTION.modelId,
			},
		});
		expect(calls[0]?.args).toEqual(buildRawTextModelArgs("slug prompt", TEST_MODEL_SELECTION));
	});

	test("resolves an explicit model reference and reports it in evidence", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			modelSelection: { provider: "acme", modelId: "fast-1", thinking: "minimal" as const },
			normalizeOutput: (output) => output.trim(),
			exec: recordingExec(calls, {
				type: "exited",
				stdout: "my-slug\n",
				stderr: "",
				code: 0,
				signal: null,
			}),
		});
		expect(result).toEqual({
			ok: true,
			evidence: { slug: "my-slug", rawOutput: "my-slug\n", provider: "acme", model: "fast-1" },
		});
		expect(calls[0]?.args).toEqual(
			buildRawTextModelArgs("slug prompt", {
				provider: "acme",
				modelId: "fast-1",
				thinking: "minimal" as const,
			}),
		);
	});

	test("retries one killed model command result and returns the recovered slug", async () => {
		const calls: ExecCall[] = [];
		const controller = new AbortController();
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [
				{ stdout: "", stderr: "", code: 143, type: "timed-out", signal: null },
				{ type: "exited", stdout: "recovered-slug\n", stderr: "", code: 0, signal: null },
			]),
			signal: controller.signal,
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				slug: "recovered-slug",
				rawOutput: "recovered-slug\n",
				provider: TEST_MODEL_SELECTION.provider,
				model: TEST_MODEL_SELECTION.modelId,
			},
		});
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual(calls[1]);
		expect(calls[0]).toEqual({
			command: "pi",
			args: buildRawTextModelArgs("slug prompt", TEST_MODEL_SELECTION),
			options: { cwd: "/repo", timeout: 60_000, signal: controller.signal },
		});
	});

	test("does not retry ordinary nonzero model command failures", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [
				{ type: "exited", code: 2, signal: null, stdout: "", stderr: "bad request" },
			]),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.failure.lines.join("\n")).toContain("bad request");
		}
		expect(calls).toHaveLength(1);
	});

	test("does not retry killed model command results when the signal is already aborted", async () => {
		const calls: ExecCall[] = [];
		const controller = new AbortController();
		controller.abort();
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			modelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-luna",
				thinking: "minimal" as const,
			},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [
				{ type: "timed-out", code: 143, signal: null, stdout: "", stderr: "" },
			]),
			signal: controller.signal,
		});

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(1);
	});
});
