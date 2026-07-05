import { describe, expect, test } from "vitest";

import { DEFAULT_FAST_MODEL, SLUG_MODEL_ENV } from "@nseng-ai/foundation/model-slug";
import {
	buildSlugModelArgs,
	deriveSlugWithModel,
	generateRawTextWithModel,
	type SlugModelCommandResult,
	type SlugModelExecOptions,
} from "@nseng-ai/capability-kit/model-slug";

interface ExecCall {
	command: string;
	args: string[];
	options: SlugModelExecOptions;
}

function recordingExec(calls: ExecCall[], result: SlugModelCommandResult) {
	return recordingExecSequence(calls, [result]);
}

function recordingExecSequence(calls: ExecCall[], results: SlugModelCommandResult[]) {
	const remainingResults = [...results];
	return (
		command: string,
		args: string[],
		options: SlugModelExecOptions,
	): Promise<SlugModelCommandResult> => {
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
			env: {},
			exec: recordingExec(calls, { stdout: "- first bullet\n- second bullet\n", code: 0 }),
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				rawOutput: "- first bullet\n- second bullet\n",
				provider: DEFAULT_FAST_MODEL.provider,
				model: DEFAULT_FAST_MODEL.modelId,
			},
		});
		expect(calls[0]?.args).toEqual(buildSlugModelArgs("summary prompt"));
	});

	test("resolves an NS_SLUG_MODEL override and reports it in evidence", async () => {
		const calls: ExecCall[] = [];
		const result = await generateRawTextWithModel({
			cwd: "/repo",
			prompt: "summary prompt",
			env: { [SLUG_MODEL_ENV]: "acme/fast-1" },
			exec: recordingExec(calls, { stdout: "raw output\n", code: 0 }),
		});

		expect(result).toEqual({
			ok: true,
			evidence: { rawOutput: "raw output\n", provider: "acme", model: "fast-1" },
		});
		expect(calls[0]?.args).toEqual(
			buildSlugModelArgs("summary prompt", { provider: "acme", modelId: "fast-1" }),
		);
	});

	test("retries one killed model command result and returns the recovered raw text", async () => {
		const calls: ExecCall[] = [];
		const controller = new AbortController();
		const result = await generateRawTextWithModel({
			cwd: "/repo",
			prompt: "summary prompt",
			env: {},
			exec: recordingExecSequence(calls, [
				{ stdout: "", stderr: "", code: 143, killed: true },
				{ stdout: "recovered summary\n", code: 0 },
			]),
			signal: controller.signal,
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				rawOutput: "recovered summary\n",
				provider: DEFAULT_FAST_MODEL.provider,
				model: DEFAULT_FAST_MODEL.modelId,
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
			env: {},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExec(calls, { stdout: "my-slug\n", code: 0 }),
		});
		expect(result).toEqual({
			ok: true,
			evidence: {
				slug: "my-slug",
				rawOutput: "my-slug\n",
				provider: DEFAULT_FAST_MODEL.provider,
				model: DEFAULT_FAST_MODEL.modelId,
			},
		});
		expect(calls[0]?.args).toEqual(buildSlugModelArgs("slug prompt"));
	});

	test("resolves an NS_SLUG_MODEL override and reports it in evidence", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			env: { [SLUG_MODEL_ENV]: "acme/fast-1" },
			normalizeOutput: (output) => output.trim(),
			exec: recordingExec(calls, { stdout: "my-slug\n", code: 0 }),
		});
		expect(result).toEqual({
			ok: true,
			evidence: { slug: "my-slug", rawOutput: "my-slug\n", provider: "acme", model: "fast-1" },
		});
		expect(calls[0]?.args).toEqual(
			buildSlugModelArgs("slug prompt", { provider: "acme", modelId: "fast-1" }),
		);
	});

	test("fails without executing when the override is not provider/modelId", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			env: { [SLUG_MODEL_ENV]: "not-a-ref" },
			normalizeOutput: (output) => output.trim(),
			exec: recordingExec(calls, { stdout: "my-slug\n", code: 0 }),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.failure.lines).toEqual([
				`Invalid ${SLUG_MODEL_ENV}="not-a-ref". Expected "provider/modelId".`,
			]);
		}
		expect(calls).toHaveLength(0);
	});

	test("retries one killed model command result and returns the recovered slug", async () => {
		const calls: ExecCall[] = [];
		const controller = new AbortController();
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			env: {},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [
				{ stdout: "", stderr: "", code: 143, killed: true },
				{ stdout: "recovered-slug\n", code: 0 },
			]),
			signal: controller.signal,
		});

		expect(result).toEqual({
			ok: true,
			evidence: {
				slug: "recovered-slug",
				rawOutput: "recovered-slug\n",
				provider: DEFAULT_FAST_MODEL.provider,
				model: DEFAULT_FAST_MODEL.modelId,
			},
		});
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual(calls[1]);
		expect(calls[0]).toEqual({
			command: "pi",
			args: buildSlugModelArgs("slug prompt"),
			options: { cwd: "/repo", timeout: 60_000, signal: controller.signal },
		});
	});

	test("does not retry ordinary nonzero model command failures", async () => {
		const calls: ExecCall[] = [];
		const result = await deriveSlugWithModel({
			cwd: "/repo",
			prompt: "slug prompt",
			slugKind: "test slug",
			env: {},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [{ code: 2, stderr: "bad request", killed: false }]),
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
			env: {},
			normalizeOutput: (output) => output.trim(),
			exec: recordingExecSequence(calls, [{ code: 143, killed: true }]),
			signal: controller.signal,
		});

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(1);
	});
});
