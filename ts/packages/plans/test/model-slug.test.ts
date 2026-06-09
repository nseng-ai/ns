import { describe, expect, test } from "vitest";

import {
	buildSlugModelArgs,
	DEFAULT_FAST_MODEL,
	deriveSlugWithModel,
	SLUG_MODEL_ENV,
	type SlugModelCommandResult,
	type SlugModelExecOptions,
} from "../src/index.ts";

interface ExecCall {
	command: string;
	args: string[];
	options: SlugModelExecOptions;
}

function recordingExec(calls: ExecCall[], result: SlugModelCommandResult) {
	return (command: string, args: string[], options: SlugModelExecOptions): Promise<SlugModelCommandResult> => {
		calls.push({ command, args, options });
		return Promise.resolve(result);
	};
}

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

	test("resolves an ASDL_SLUG_MODEL override and reports it in evidence", async () => {
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
		expect(calls[0]?.args).toEqual(buildSlugModelArgs("slug prompt", { provider: "acme", modelId: "fast-1" }));
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
			expect(result.failure.lines).toEqual([`Invalid ${SLUG_MODEL_ENV}="not-a-ref". Expected "provider/modelId".`]);
		}
		expect(calls).toHaveLength(0);
	});
});
